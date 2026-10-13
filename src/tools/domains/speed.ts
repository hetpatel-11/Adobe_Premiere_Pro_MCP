/**
 * Speed ramps (Time Remapping) written into a copy of a saved project.
 *
 * Each entry declares the tool an agent sees and the handler that runs it,
 * so the two cannot drift apart. This one never talks to Premiere: Time
 * Remapping is not exposed to ExtendScript, QE, UXP or FCP XML import, so the
 * ramp is written into the project file itself (see utils/prproj-ramps.ts).
 */
import { z } from 'zod';
import { promises as fs } from 'node:fs';
import { gunzipSync, gzipSync } from 'node:zlib';
import { extname, isAbsolute, resolve } from 'node:path';
import type { ToolModule } from '../context.js';
import { applyRamps, type RampRequest } from '../../utils/prproj-ramps.js';

const segmentSchema = z.object({
  from: z.number().min(0).describe('Source media seconds where this speed starts'),
  to: z.number().min(0).describe('Source media seconds where it ends'),
  speed: z.number().positive().max(100).describe('Playback speed, 1 = normal, 4 = 400%'),
});

export const speedTools: ToolModule[] = [
  {
    name: 'write_speed_ramps',
    description: 'Writes eased Time Remapping speed ramps (one gradual keyframe pair per speed change, Optical Flow) into a COPY of a saved .prproj, rippling later clips and their transitions on the same track. Time Remapping cannot be set on a live project through any Premiere scripting API, so: save the project, run this to write a NEW file, close the original in Premiere and open the copy. Never overwrites a file.',
    inputSchema: z.object({
      projectPath: z.string().describe('Absolute path to the saved source .prproj (left untouched)'),
      outputPath: z.string().describe('Absolute path for the new .prproj; must not exist'),
      sequence: z.string().describe('Sequence ID (sequenceID / ObjectUID) or exact sequence name'),
      trackIndex: z.number().int().min(0).optional().describe('0-based video track holding the clips. Defaults to 0 (V1).'),
      sequenceFps: z.number().positive().describe('Sequence frame rate, e.g. 29.97'),
      transitionSeconds: z.number().positive().max(5).optional().describe('Timeline seconds spent easing between two speeds. Defaults to 0.5.'),
      clips: z.array(z.object({
        clipIndex: z.number().int().min(0).describe('0-based index among the track\'s clips in timeline order (transitions not counted)'),
        sourceFps: z.number().positive().describe('Media frame rate, e.g. 59.94'),
        nativeFrames: z.number().int().positive().describe('Media length in frames; the speed graph is bounded by nativeFrames / sourceFps'),
        segments: z.array(segmentSchema).min(1).describe('Speeds over the clip\'s source range; source not covered plays at 1x'),
        speedStep: z.number().positive().optional().describe('Quantum that hold speeds snap to. Defaults to sequenceFps / sourceFps (0.5 for 59.94p in 29.97) so holds have even cadence.'),
      })).min(1).describe('Clips to ramp'),
    }),
    run: (_ctx, args) => writeSpeedRamps(args),
  },
];

export async function writeSpeedRamps(args: {
  projectPath: string; outputPath: string; sequence: string; trackIndex?: number; sequenceFps: number;
  transitionSeconds?: number; clips: RampRequest['clips'];
}): Promise<any> {
  for (const [label, path] of [['projectPath', args.projectPath], ['outputPath', args.outputPath]] as const) {
    if (!isAbsolute(path)) return { success: false, error: `${label} must be an absolute path` };
    if (extname(path).toLowerCase() !== '.prproj') return { success: false, error: `${label} must be a .prproj file` };
  }
  if (resolve(args.projectPath) === resolve(args.outputPath)) {
    return { success: false, error: 'outputPath must differ from projectPath; ramps are written into a copy' };
  }
  let raw: Buffer;
  try {
    raw = await fs.readFile(args.projectPath);
  } catch (error) {
    return { success: false, error: `Cannot read ${args.projectPath}: ${(error as Error).message}` };
  }
  const gzipped = raw[0] === 0x1f && raw[1] === 0x8b;
  const xml = (gzipped ? gunzipSync(raw) : raw).toString('utf8');

  let result;
  try {
    result = applyRamps(xml, {
      sequence: args.sequence,
      trackIndex: args.trackIndex ?? 0,
      sequenceFps: args.sequenceFps,
      transitionSeconds: args.transitionSeconds,
      clips: args.clips,
    });
  } catch (error) {
    return { success: false, error: (error as Error).message };
  }

  const out = Buffer.from(result.xml, 'utf8');
  try {
    // 'wx' fails if the file exists, so a project is never overwritten.
    await fs.writeFile(args.outputPath, gzipped ? gzipSync(out) : out, { flag: 'wx' });
  } catch (error) {
    return { success: false, error: `Cannot write ${args.outputPath}: ${(error as Error).message}` };
  }

  return {
    success: true,
    message: 'Ramps written. Close the source project in Premiere, open the new file, then play or export the ramped range to check it.',
    outputPath: args.outputPath,
    clips: result.clips,
    oldTrackEnd: result.oldTrackEnd,
    newTrackEnd: result.newTrackEnd,
    warnings: result.otherTrackItemsNotMoved
      ? [`${result.otherTrackItemsNotMoved} item(s) on other tracks end after the first ramped clip and were not moved (adjustment layers, titles, music); adjust them in Premiere`]
      : [],
  };
}
