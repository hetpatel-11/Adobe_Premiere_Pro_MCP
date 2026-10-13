/**
 * Writes Premiere Time Remapping speed ramps into the XML of a .prproj.
 *
 * Time Remapping is not reachable from ExtendScript (neither the DOM nor QE
 * expose the component), UXP, or FCP XML import (which keeps the out point and
 * plays at 1x). It is, however, plain data in the gzipped project, so a ramp can
 * be written into a COPY of a closed project and that copy opened in Premiere.
 *
 * The format was reverse-engineered by diffing a project before and after a ramp
 * was drawn AND trimmed by hand in Premiere 26.5:
 *
 *   VideoClipTrackItem (<Start>/<End> ticks on the timeline)
 *     -> SubClip -> VideoClip (<InPoint>/<OutPoint> on the REMAPPED axis)
 *          -> <TimeRemapping ObjectRef/> -> TimeRemapping (ClassID ace5148e-...)
 *               -> <Keyframes ObjectRef/> -> TimeComponentParam "Speed" (ClassID 278ae1f9-...)
 *
 *   Keyframes: "remapped_ticks,source_seconds,code,0,0,0,0,0;" with slope = speed.
 *   The graph starts at (0,0) and is identity until the first change, so the clip
 *   InPoint stays its source in. Codes: 6 plain, 7 ramp start, 8 ramp end; Premiere
 *   eases between a 7/8 pair. The last keyframe lands exactly on UpperBound.
 *
 * Ground truth that earlier attempts got wrong, each of which produced frozen or
 * wrong footage on EXPORT even though the timeline looked right:
 *   - UpperBound is native frames / SOURCE fps, i.e. the real media length.
 *   - A remapped VideoClip carries NO <PlaybackSpeed>.
 *   - A transition linked to a clip (Head/TailTransition) must keep its offset
 *     around its own cut. Left behind, Premiere renders the incoming clip black
 *     from the cut to wherever the transition ended up.
 * Eased ramps pass through fractional speeds, so the clip gets Optical Flow
 * (<TimeInterpolationType>2</TimeInterpolationType>; 0 sampling, 1 blending).
 */

export const TICKS_PER_SECOND = 254016000000;
const CLASS_TIME_REMAP = 'ace5148e-9c9b-40ed-9f82-64cb67308464';
const CLASS_TIME_PARAM = '278ae1f9-ab7b-4dff-a53c-21029a399a9d';

export interface SpeedSegment {
  /** Source media seconds where this speed starts. */
  from: number;
  /** Source media seconds where it ends. */
  to: number;
  speed: number;
}

export interface ClipRamp {
  /** 0-based index among the track's CLIP items (transitions are not counted). */
  clipIndex: number;
  /** Frame rate of the media file, e.g. 59.94. */
  sourceFps: number;
  /** Native frame count of the media file; UpperBound = nativeFrames / sourceFps. */
  nativeFrames: number;
  /** Speeds over the clip's source range. Uncovered source plays at 1x. */
  segments: SpeedSegment[];
  /** Speed quantum for holds. Defaults to sequenceFps / sourceFps (0.5 for 59.94p in 29.97). */
  speedStep?: number | undefined;
}

export interface RampRequest {
  /** Sequence ObjectUID (the ExtendScript sequenceID) or exact sequence name. */
  sequence: string;
  /** 0-based video track index. */
  trackIndex: number;
  /** Sequence frame rate, e.g. 29.97. */
  sequenceFps: number;
  clips: ClipRamp[];
  /** Remapped seconds spent easing between two speeds. */
  transitionSeconds?: number | undefined;
}

export interface RampReport {
  clipIndex: number;
  name: string;
  sourceIn: number;
  sourceOut: number;
  oldDuration: number;
  newDuration: number;
  levels: Array<[number, number, number]>;
}

export interface RampResult {
  xml: string;
  clips: RampReport[];
  oldTrackEnd: number;
  newTrackEnd: number;
  /** Items on OTHER tracks that end after the first ramped clip; they are not moved. */
  otherTrackItemsNotMoved: number;
}

/** NTSC-aware ticks per frame: 29.97 -> 30000/1001. */
export function frameTicks(fps: number): number {
  const exact = Math.abs(fps - Math.round(fps)) > 0.001 ? (Math.round(fps * 1001 / 1000) * 1000) / 1001 : Math.round(fps);
  return Math.round(TICKS_PER_SECOND / exact);
}

class ProjectText {
  constructor(public text: string) {}

  span(objectId: string): { tag: string; start: number; end: number } {
    const re = new RegExp(`<(\\w+) Object(?:U)?ID="${objectId.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}"[^>]*>`);
    const match = re.exec(this.text);
    if (!match) throw new Error(`Object ${objectId} not found in project`);
    const tag = match[1]!;
    const close = this.text.indexOf(`</${tag}>`, match.index + match[0].length);
    if (close < 0) throw new Error(`Object ${objectId} (${tag}) is not closed`);
    return { tag, start: match.index, end: close + tag.length + 3 };
  }

  body(objectId: string): string {
    const { start, end } = this.span(objectId);
    return this.text.slice(start, end);
  }

  replace(objectId: string, newBody: string): void {
    const { start, end } = this.span(objectId);
    this.text = this.text.slice(0, start) + newBody + this.text.slice(end);
  }
}

function num(body: string, tag: string, fallback?: number): number {
  const match = new RegExp(`<${tag}>(-?[\\d.]+)</${tag}>`).exec(body);
  if (!match) {
    if (fallback === undefined) throw new Error(`<${tag}> missing`);
    return fallback;
  }
  return Number(match[1]);
}

function setTag(body: string, tag: string, value: string, afterTag?: string): string {
  const re = new RegExp(`<${tag}>[^<]*</${tag}>`);
  if (re.test(body)) return body.replace(re, `<${tag}>${value}</${tag}>`);
  const anchor = afterTag ? new RegExp(`<${afterTag}>[^<]*</${afterTag}>`).exec(body) : null;
  if (!anchor) throw new Error(`Cannot place <${tag}>: no <${afterTag}> anchor`);
  return body.slice(0, anchor.index) + `<${tag}>${value}</${tag}>` + body.slice(anchor.index);
}

/** Piecewise-constant speeds over [sourceIn, sourceOut]; gaps play at 1x, equal neighbours merge. */
export function levelsFor(sourceIn: number, sourceOut: number, segments: SpeedSegment[]): Array<[number, number, number]> {
  const pieces = segments
    .map((s) => [Math.max(s.from, sourceIn), Math.min(s.to, sourceOut), s.speed] as [number, number, number])
    .filter(([low, high]) => high - low >= 0.05)
    .sort((a, b) => a[0] - b[0]);
  const levels: Array<[number, number, number]> = [];
  let cursor = sourceIn;
  for (const [low, high, speed] of pieces) {
    if (low > cursor + 0.01) levels.push([cursor, low, 1]);
    levels.push([Math.max(low, cursor), high, speed]);
    cursor = Math.max(cursor, high);
  }
  if (cursor < sourceOut - 0.01) levels.push([cursor, sourceOut, 1]);
  const merged: Array<[number, number, number]> = [];
  for (const level of levels.filter(([a, b]) => b - a >= 0.05)) {
    const last = merged[merged.length - 1];
    if (last && Math.abs(last[2] - level[2]) < 1e-6) last[1] = level[1];
    else merged.push([level[0], level[1], level[2]]);
  }
  return merged;
}

/** Eased keyframes: one 7/8 pair per speed change. Returns keys and the remapped in/out. */
export function easedKeyframes(levels: Array<[number, number, number]>, upperBound: number, transitionSeconds: number) {
  const first = levels[0];
  const lastLevel = levels[levels.length - 1];
  if (!first || !lastLevel) throw new Error('No speed levels to ramp');
  const sourceIn = first[0];
  const keys: Array<[number, number, number]> = [[0, 0, 6]];
  let remapped = sourceIn;
  let source = sourceIn;
  if (Math.abs(first[2] - 1) > 1e-6) keys.push([remapped, source, 6]); // change right at the cut is abrupt
  let speed = first[2];
  for (let i = 1; i < levels.length; i++) {
    const [boundary, nextEnd, newSpeed] = levels[i]!;
    remapped += (boundary - source) / speed;
    source = boundary;
    let spanSource = transitionSeconds * (speed + newSpeed) / 2;
    if (source + spanSource > nextEnd - 0.05) spanSource = Math.max(0.05, (nextEnd - source) * 0.5);
    const transition = spanSource * 2 / (speed + newSpeed);
    keys.push([remapped, source, 7]);
    remapped += transition;
    source += spanSource;
    keys.push([remapped, source, 8]);
    speed = newSpeed;
  }
  const sourceOut = lastLevel[1];
  const remappedOut = remapped + (sourceOut - source) / speed;
  keys.push([remapped + (upperBound - source) / speed, upperBound, 6]);
  for (let i = 1; i < keys.length; i++) {
    const [timeB, valueB] = keys[i]!;
    const [timeA, valueA] = keys[i - 1]!;
    if (timeB < timeA - 1e-9 || valueB < valueA - 1e-9) {
      throw new Error(`Non-monotonic time remap keyframes: ${JSON.stringify(keys)}`);
    }
  }
  return { keys, remappedIn: sourceIn, remappedOut };
}

export function keyframeString(keys: Array<[number, number, number]>): string {
  return keys.map(([remapped, source, code]) => `${Math.round(remapped * TICKS_PER_SECOND)},${source.toFixed(24)},${code},0,0,0,0,0;`).join('');
}

function findSequence(project: ProjectText, sequence: string): string {
  if (project.text.includes(`<Sequence ObjectUID="${sequence}"`)) return sequence;
  const named: string[] = [];
  for (const match of project.text.matchAll(/<Sequence ObjectUID="([^"]+)"[^>]*>/g)) {
    const uid = match[1]!;
    const name = /<Name>([^<]*)<\/Name>/.exec(project.body(uid));
    if (name && name[1] === sequence) named.push(uid);
  }
  if (named.length === 1) return named[0]!;
  if (named.length > 1) throw new Error(`Sequence name "${sequence}" is ambiguous (${named.length} matches); pass its sequenceID`);
  throw new Error(`Sequence "${sequence}" not found`);
}

function trackItems(project: ProjectText, trackRef: string): string[] {
  return [...project.body(trackRef).matchAll(/<TrackItem Index="\d+" ObjectRef="(\d+)"/g)].map((m) => m[1]!);
}

export function applyRamps(xml: string, request: RampRequest): RampResult {
  const project = new ProjectText(xml);
  const seqFrameTicks = frameTicks(request.sequenceFps);
  const seqFps = TICKS_PER_SECOND / seqFrameTicks;
  const transitionSeconds = request.transitionSeconds ?? 0.5;
  let nextId = Math.max(...[...project.text.matchAll(/ObjectID="(\d+)"/g)].map((m) => Number(m[1]))) + 1;

  const sequenceUid = findSequence(project, request.sequence);
  const sequenceBody = project.body(sequenceUid);
  const groups = [...sequenceBody.matchAll(/<TrackGroup Version="\d+" Index="\d+">\s*<First>[^<]*<\/First>\s*<Second ObjectRef="(\d+)"/g)].map((m) => m[1]!);
  if (!groups.length) throw new Error('Sequence has no track groups');
  const tracks = [...project.body(groups[0]!).matchAll(/<Track Index="\d+" ObjectURef="([^"]+)"/g)].map((m) => m[1]!);
  const trackRef = tracks[request.trackIndex];
  if (!trackRef) throw new Error(`Video track ${request.trackIndex} not found (${tracks.length} tracks)`);

  const items = trackItems(project, trackRef);
  const clipItems = items.filter((ref) => /<SubClip ObjectRef="\d+"/.test(project.body(ref)));
  const wanted = new Map(request.clips.map((clip) => [clip.clipIndex, clip]));
  for (const index of wanted.keys()) {
    if (!clipItems[index]) throw new Error(`Clip index ${index} not on track ${request.trackIndex} (${clipItems.length} clips)`);
  }

  // Items keep their order; each clip lands where the previous one now ends.
  const ordered = clipItems
    .map((ref) => ({ ref, start: num(project.body(ref), 'Start', 0), end: num(project.body(ref), 'End') }))
    .sort((a, b) => a.start - b.start);
  const reports: RampReport[] = [];
  const deltaAfter = new Map<string, number>();   // clip ref -> shift (ticks) of the cut at its tail
  const deltaBefore = new Map<string, number>();  // clip ref -> shift (ticks) of its head
  const transitionShift = new Map<string, number>();
  const newObjects: string[] = [];
  let shift = 0;
  let firstChangeTicks = Infinity;
  let oldTrackEnd = 0;

  ordered.forEach((entry) => {
    const index = clipItems.indexOf(entry.ref);
    let item = project.body(entry.ref);
    const oldDuration = entry.end - entry.start;
    oldTrackEnd = Math.max(oldTrackEnd, entry.end);
    deltaBefore.set(entry.ref, shift);
    let newDuration = oldDuration;
    const ramp = wanted.get(index);
    if (ramp) {
      const subclipRef = /<SubClip ObjectRef="(\d+)"/.exec(item)![1]!;
      const subBody = project.body(subclipRef);
      const clipRef = /<Clip ObjectRef="(\d+)"/.exec(subBody)![1]!;
      const nameMatch = /<Name>([^<]*)<\/Name>/.exec(subBody);
      const name = nameMatch?.[1] ?? '';
      let clipBody = project.body(clipRef);
      if (clipBody.includes('<TimeRemapping')) throw new Error(`Clip ${index} (${name}) already has Time Remapping; ramp a plain clip`);
      const sourceIn = num(clipBody, 'InPoint') / TICKS_PER_SECOND;
      const sourceOut = num(clipBody, 'OutPoint') / TICKS_PER_SECOND;
      // Exact NTSC rates (60000/1001, not 59.94): with the rounded value the hold
      // quantum is 0.5000005 and 1x no longer snaps to exactly 1x.
      const sourceFrameTicks = frameTicks(ramp.sourceFps);
      const unit = ramp.speedStep ?? sourceFrameTicks / seqFrameTicks;
      const levels = levelsFor(sourceIn, sourceOut, ramp.segments)
        .map(([a, b, speed]) => [a, b, Math.round(Math.max(unit, Math.floor(speed / unit + 0.5) * unit) * 1e9) / 1e9] as [number, number, number]);
      const upper = ramp.nativeFrames * sourceFrameTicks / TICKS_PER_SECOND;
      if (sourceOut > upper + 1e-3) throw new Error(`Clip ${index} (${name}) source out ${sourceOut.toFixed(3)}s is past the media length ${upper.toFixed(3)}s; check nativeFrames/sourceFps`);
      const { keys, remappedIn, remappedOut } = easedKeyframes(levels, upper, transitionSeconds);
      const frames = Math.max(1, Math.round((remappedOut - remappedIn) * seqFps));
      newDuration = frames * seqFrameTicks;
      const paramId = nextId++;
      const remapId = nextId++;
      newObjects.push(
        `<TimeComponentParam ObjectID="${paramId}" ClassID="${CLASS_TIME_PARAM}" Version="9">`
        + '<Name>Speed</Name><DiscontinuousInterpolate>false</DiscontinuousInterpolate>'
        + '<IsTimeVarying>true</IsTimeVarying><IsLocked>false</IsLocked><LowerBound>0</LowerBound>'
        + `<UpperBound>${upper.toFixed(14)}</UpperBound>`
        + '<StartKeyframe>-91445760000000000,0.000000000000000000000000,0,0,0,0,0,0</StartKeyframe>'
        + `<Keyframes>${keyframeString(keys)}</Keyframes><CurrentValue>${sourceIn.toFixed(14)}</CurrentValue>`
        + '<ParameterID>-1</ParameterID></TimeComponentParam>\n'
        + `<TimeRemapping ObjectID="${remapId}" ClassID="${CLASS_TIME_REMAP}" Version="2">`
        + `<Keyframes ObjectRef="${paramId}"/></TimeRemapping>\n`);
      if (!/<Source ObjectRef="\d+"\/>/.test(clipBody)) throw new Error(`Clip ${index} (${name}) has no <Source> to anchor Time Remapping`);
      clipBody = clipBody.replace(/(<Source ObjectRef="\d+"\/>)/, `$1<TimeRemapping ObjectRef="${remapId}"/>`);
      clipBody = setTag(clipBody, 'OutPoint', String(Math.round(remappedIn * TICKS_PER_SECOND) + frames * seqFrameTicks));
      if (!clipBody.includes('<TimeInterpolationType>')) {
        clipBody = clipBody.replace(/<\/VideoClip>\s*$/, '<TimeInterpolationType>2</TimeInterpolationType></VideoClip>');
      }
      clipBody = clipBody.replace(/<PlaybackSpeed>[^<]*<\/PlaybackSpeed>/g, '');
      project.replace(clipRef, clipBody);
      firstChangeTicks = Math.min(firstChangeTicks, entry.end);
      reports.push({
        clipIndex: index, name, sourceIn, sourceOut,
        oldDuration: oldDuration / TICKS_PER_SECOND, newDuration: newDuration / TICKS_PER_SECOND, levels,
      });
    }
    const newStart = entry.start + shift;
    item = setTag(item, 'End', String(newStart + newDuration));
    if (newStart) item = setTag(item, 'Start', String(newStart), 'End');
    project.replace(entry.ref, item);
    shift += newDuration - oldDuration;
    deltaAfter.set(entry.ref, shift);
    const tail = /<TailTransition ObjectRef="(\d+)"/.exec(item);
    if (tail) transitionShift.set(tail[1]!, shift);
    const head = /<HeadTransition ObjectRef="(\d+)"/.exec(item);
    if (head && !transitionShift.has(head[1]!)) transitionShift.set(head[1]!, deltaBefore.get(entry.ref)!);
  });

  // Transitions move with the cut they belong to, keeping their exact offset around it.
  for (const ref of items) {
    if (clipItems.includes(ref)) continue;
    const delta = transitionShift.get(ref);
    if (delta === undefined || delta === 0) continue;
    let item = project.body(ref);
    const start = num(item, 'Start', 0) + delta;
    item = setTag(item, 'End', String(num(item, 'End') + delta));
    item = setTag(item, 'Start', String(start), 'End');
    project.replace(ref, item);
  }

  let otherTrackItemsNotMoved = 0;
  for (const allGroupsRef of groups) {
    const groupTracks = [...project.body(allGroupsRef).matchAll(/<Track Index="\d+" ObjectURef="([^"]+)"/g)].map((m) => m[1]!);
    for (const other of groupTracks) {
      if (other === trackRef) continue;
      for (const ref of trackItems(project, other)) {
        if (num(project.body(ref), 'End', 0) > firstChangeTicks) otherTrackItemsNotMoved++;
      }
    }
  }

  const closing = project.text.lastIndexOf('</PremiereData>');
  if (closing < 0) throw new Error('Not a Premiere project: no </PremiereData>');
  project.text = project.text.slice(0, closing) + newObjects.join('') + project.text.slice(closing);
  return {
    xml: project.text,
    clips: reports,
    oldTrackEnd: oldTrackEnd / TICKS_PER_SECOND,
    newTrackEnd: (oldTrackEnd + shift) / TICKS_PER_SECOND,
    otherTrackItemsNotMoved,
  };
}
