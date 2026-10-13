/**
 * write_speed_ramps writes Time Remapping into a copy of a project file. The
 * format and its traps come from diffing a project before and after a ramp was
 * drawn and trimmed by hand in Premiere 26.5 (see utils/prproj-ramps.ts):
 * UpperBound is native frames / SOURCE fps, a remapped VideoClip has no
 * <PlaybackSpeed>, and a linked transition must move with its cut.
 *
 * The fixture is a minimal synthetic project with the same object graph:
 * Sequence -> VideoTrackGroup -> tracks -> VideoClipTrackItem -> SubClip ->
 * VideoClip -> Source, plus a dissolve linked as the first clip's tail and an
 * adjustment layer on V2.
 */

import { promises as fs } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { gunzipSync, gzipSync } from 'node:zlib';
import { PremiereProTools } from '../../tools/index.js';
import { applyRamps, frameTicks, TICKS_PER_SECOND } from '../../utils/prproj-ramps.js';

const T = TICKS_PER_SECOND;
const F = frameTicks(29.97);

function fixture(): string {
  return `<?xml version="1.0" encoding="UTF-8" ?>
<PremiereData Version="3">
<Sequence ObjectUID="seq-1" ClassID="6a15d903-8739-11d5-af2d-9b7855ad8974" Version="11"><Name>Cut</Name>
<TrackGroups><TrackGroup Version="1" Index="0"><First>228cda18-3625-4d2d-951e-348879e4ed93</First><Second ObjectRef="10"/></TrackGroup></TrackGroups></Sequence>
<VideoTrackGroup ObjectID="10" ClassID="9e9abb3e" Version="1"><Tracks><Track Index="0" ObjectURef="track-v1"/><Track Index="1" ObjectURef="track-v2"/></Tracks></VideoTrackGroup>
<VideoClipTrack ObjectUID="track-v1" ClassID="f68dcd" Version="3"><ClipItems><TrackItems Version="1"><TrackItem Index="0" ObjectRef="20"/><TrackItem Index="1" ObjectRef="21"/></TrackItems></ClipItems><TransitionItems><TrackItems Version="1"><TrackItem Index="0" ObjectRef="25"/></TrackItems></TransitionItems></VideoClipTrack>
<VideoClipTrack ObjectUID="track-v2" ClassID="f68dcd" Version="3"><ClipItems><TrackItems Version="1"><TrackItem Index="0" ObjectRef="60"/></TrackItems></ClipItems></VideoClipTrack>
<VideoClipTrackItem ObjectID="20" ClassID="368b0406" Version="8"><End>${120 * F}</End><SubClip ObjectRef="30"/><TailTransition ObjectRef="25"/></VideoClipTrackItem>
<VideoClipTrackItem ObjectID="21" ClassID="368b0406" Version="8"><End>${210 * F}</End><Start>${120 * F}</Start><SubClip ObjectRef="31"/><HeadTransition ObjectRef="25"/></VideoClipTrackItem>
<VideoTransitionTrackItem ObjectID="25" ClassID="2a9d8bd5" Version="6"><End>${130 * F}</End><Start>${110 * F}</Start></VideoTransitionTrackItem>
<VideoClipTrackItem ObjectID="60" ClassID="368b0406" Version="8"><End>${210 * F}</End><SubClip ObjectRef="32"/></VideoClipTrackItem>
<SubClip ObjectID="30" ClassID="e0c58dc9" Version="5"><Clip ObjectRef="40"/><Name>A.MP4</Name></SubClip>
<SubClip ObjectID="31" ClassID="e0c58dc9" Version="5"><Clip ObjectRef="41"/><Name>B.MP4</Name></SubClip>
<SubClip ObjectID="32" ClassID="e0c58dc9" Version="5"><Clip ObjectRef="42"/><Name>Adjustment Layer</Name></SubClip>
<VideoClip ObjectID="40" ClassID="9308dbef" Version="11"><Source ObjectRef="50"/><InPoint>${10 * T}</InPoint><OutPoint>${14 * T}</OutPoint><PlaybackSpeed>1</PlaybackSpeed></VideoClip>
<VideoClip ObjectID="41" ClassID="9308dbef" Version="11"><Source ObjectRef="51"/><InPoint>${2 * T}</InPoint><OutPoint>${5 * T}</OutPoint></VideoClip>
<VideoClip ObjectID="42" ClassID="9308dbef" Version="11"><Source ObjectRef="52"/><InPoint>0</InPoint><OutPoint>${7 * T}</OutPoint></VideoClip>
</PremiereData>
`;
}

const RAMP = {
  sequence: 'Cut',
  trackIndex: 0,
  sequenceFps: 29.97,
  clips: [{ clipIndex: 0, sourceFps: 59.94, nativeFrames: 1800, segments: [{ from: 11, to: 13, speed: 2 }] }],
};

function objectBody(xml: string, id: string): string {
  const start = xml.search(new RegExp(`<\\w+ Object(?:U)?ID="${id}"`));
  const tag = /<(\w+)/.exec(xml.slice(start))![1]!;
  return xml.slice(start, xml.indexOf(`</${tag}>`, start) + tag.length + 3);
}

function tag(body: string, name: string): number {
  return Number(new RegExp(`<${name}>([^<]*)</${name}>`).exec(body)![1]);
}

describe('applyRamps', () => {
  const result = applyRamps(fixture(), RAMP);
  const xml = result.xml;

  it('links a Time Remapping graph to the clip and bounds it by native frames / source fps', () => {
    const clip = objectBody(xml, '40');
    const remapRef = /<TimeRemapping ObjectRef="(\d+)"\/>/.exec(clip)![1]!;
    const paramRef = /<Keyframes ObjectRef="(\d+)"/.exec(objectBody(xml, remapRef))![1]!;
    const param = objectBody(xml, paramRef);

    expect(clip).toMatch(/<Source ObjectRef="50"\/><TimeRemapping ObjectRef="\d+"\/>/);
    expect(tag(param, 'UpperBound')).toBeCloseTo(1800 * 1001 / 60000, 10);
    const keys = /<Keyframes>([^<]*)<\/Keyframes>/.exec(param)![1]!.split(';').filter(Boolean).map((k) => k.split(','));
    expect(keys[0]!.slice(0, 3)).toEqual(['0', '0.000000000000000000000000', '6']);
    expect(keys.map((k) => k[2])).toEqual(['6', '7', '8', '7', '8', '6']);
    expect(Number(keys[keys.length - 1]![1])).toBeCloseTo(1800 * 1001 / 60000, 10);
    for (let i = 1; i < keys.length; i++) {
      expect(Number(keys[i]![0])).toBeGreaterThanOrEqual(Number(keys[i - 1]![0]));
      expect(Number(keys[i]![1])).toBeGreaterThanOrEqual(Number(keys[i - 1]![1]));
    }
  });

  it('drops PlaybackSpeed and turns on Optical Flow, as a hand-drawn ramp is saved', () => {
    const clip = objectBody(xml, '40');

    expect(clip).not.toContain('<PlaybackSpeed>');
    expect(clip).toContain('<TimeInterpolationType>2</TimeInterpolationType>');
  });

  it('shortens the ramped clip to its remapped length in whole frames', () => {
    // 1 s at 1x, a 0.5 s ease, 0.625 s at 2x, a 0.5 s ease, 0.25 s at 1x = 2.875 s.
    expect(result.clips[0]!.newDuration).toBeCloseTo(86 * F / T, 6);
    expect(tag(objectBody(xml, '20'), 'End')).toBe(86 * F);
    expect(tag(objectBody(xml, '40'), 'OutPoint')).toBe(10 * T + 86 * F);
  });

  it('ripples the next clip and keeps the linked dissolve on its cut', () => {
    const shift = (86 - 120) * F;
    const next = objectBody(xml, '21');
    const dissolve = objectBody(xml, '25');

    expect(tag(next, 'Start')).toBe(120 * F + shift);
    expect(tag(next, 'End')).toBe(210 * F + shift);
    expect(tag(dissolve, 'Start')).toBe(110 * F + shift);
    expect(tag(dissolve, 'End')).toBe(130 * F + shift);
  });

  it('leaves other tracks alone and says so', () => {
    expect(tag(objectBody(xml, '60'), 'End')).toBe(210 * F);
    expect(result.otherTrackItemsNotMoved).toBe(1);
  });

  it('finds the sequence by its ObjectUID as well as by name', () => {
    expect(() => applyRamps(fixture(), { ...RAMP, sequence: 'seq-1' })).not.toThrow();
    expect(() => applyRamps(fixture(), { ...RAMP, sequence: 'Nope' })).toThrow('not found');
  });

  it('refuses to ramp a clip that already has Time Remapping', () => {
    expect(() => applyRamps(xml, RAMP)).toThrow('already has Time Remapping');
  });

  it('refuses a source range past the media length implied by nativeFrames', () => {
    const short = { ...RAMP, clips: [{ ...RAMP.clips[0]!, nativeFrames: 600 }] };
    expect(() => applyRamps(fixture(), short)).toThrow('past the media length');
  });
});

describe('write_speed_ramps', () => {
  let dir: string;
  const tools = new PremiereProTools({ executeScript: jest.fn() } as any);

  beforeEach(async () => {
    dir = await fs.mkdtemp(join(tmpdir(), 'ramps-'));
    await fs.writeFile(join(dir, 'in.prproj'), gzipSync(Buffer.from(fixture())));
  });

  afterEach(async () => {
    await fs.rm(dir, { recursive: true, force: true });
  });

  const args = (outputName: string) => ({
    projectPath: join(dir, 'in.prproj'),
    outputPath: join(dir, outputName),
    sequence: 'Cut',
    sequenceFps: 29.97,
    clips: RAMP.clips,
  });

  it('writes a gzipped copy and leaves the source untouched', async () => {
    const before = await fs.readFile(join(dir, 'in.prproj'));
    const result = await tools.executeTool('write_speed_ramps', args('out.prproj'));

    expect(result.success).toBe(true);
    expect(await fs.readFile(join(dir, 'in.prproj'))).toEqual(before);
    const written = gunzipSync(await fs.readFile(join(dir, 'out.prproj'))).toString('utf8');
    expect(written).toContain('<TimeRemapping ObjectRef=');
    expect(result.warnings[0]).toContain('other tracks');
  });

  it('never overwrites a file', async () => {
    await fs.writeFile(join(dir, 'taken.prproj'), 'keep');
    const result = await tools.executeTool('write_speed_ramps', args('taken.prproj'));

    expect(result.success).toBe(false);
    expect(await fs.readFile(join(dir, 'taken.prproj'), 'utf8')).toBe('keep');
  });

  it('refuses to write over the source project', async () => {
    const result = await tools.executeTool('write_speed_ramps', args('in.prproj'));

    expect(result.success).toBe(false);
    expect(result.error).toContain('must differ');
  });

  it('requires absolute .prproj paths', async () => {
    const result = await tools.executeTool('write_speed_ramps', { ...args('out.prproj'), outputPath: 'relative.prproj' });

    expect(result.success).toBe(false);
    expect(result.error).toContain('absolute');
  });
});
