/**
 * Audio levels, ducking, silence detection, and audio effects.
 *
 * Each entry declares the tool an agent sees and the handler that runs it,
 * so the two cannot drift apart. Handlers reach Premiere through ToolContext.
 */
import { z } from 'zod';
import { spawn } from 'child_process';
import type { ToolContext, ToolModule } from '../context.js';
import { applyEffect } from './effects.js';

export const audioTools: ToolModule[] = [
  {
    name: 'adjust_audio_levels',
    description: 'Adjusts the volume (gain) of an audio clip on the timeline.',
    inputSchema: z.object({
      clipId: z.string().describe('The ID of the audio clip to adjust'),
      level: z.number().describe('The new audio level in decibels (dB). Can be positive or negative.')
    }),
    run: (ctx, args) => adjustAudioLevels(ctx, args.clipId, args.level),
  },
  {
    name: 'detect_silence',
    description: 'Analyzes a media file\'s audio for silent stretches using ffmpeg\'s silencedetect filter, run locally via child_process -- NOT via Premiere\'s scripting API, which has no audio-level/RMS reading capability at all (confirmed: every audio tool in this codebase only writes levels, never reads them). Requires ffmpeg on PATH; returns an explicit error if it is not found rather than failing silently. This is DETECTION ONLY -- it does not cut or modify anything. Use the returned intervals with split_clip/ripple_delete/razor_timeline_at_time if you want to remove the silence.',
    inputSchema: z.object({
      mediaPath: z.string().optional().describe('Direct filesystem path to the media file to analyze'),
      projectItemId: z.string().optional().describe('Project item ID to resolve to a media path instead of passing mediaPath directly'),
      noiseThresholdDb: z.number().optional().describe('Silence threshold in dBFS, e.g. -30 (default -30). Audio quieter than this is considered silent.'),
      minDurationSeconds: z.number().optional().describe('Minimum duration in seconds for a quiet stretch to be reported as silence (default 1.5)')
    }).refine((data) => Boolean(data.mediaPath) || Boolean(data.projectItemId), {
      message: 'Provide either mediaPath or projectItemId'
    }),
    run: (ctx, args) => detectSilence(ctx, args.mediaPath, args.projectItemId, args.noiseThresholdDb, args.minDurationSeconds),
  },
  {
    name: 'add_audio_keyframes',
    description: 'Adds keyframes to audio levels for dynamic volume changes.',
    inputSchema: z.object({
      clipId: z.string().describe('The ID of the audio clip'),
      keyframes: z.array(z.object({
        time: z.number().describe('Time in seconds'),
        level: z.number().describe('Audio level in dB')
      })).describe('Array of keyframe data')
    }),
    run: (ctx, args) => addAudioKeyframes(ctx, args.clipId, args.keyframes),
  },
  {
    name: 'setup_ducking',
    description:
      'High-level wrapper around add_audio_keyframes that builds a ducking curve from a base level + ducking windows. ' +
      'Computes 4 keyframes per window (pre-fade, duck-in, duck-out, post-fade) plus boundary keyframes at clip start/end. ' +
      'Replaces the manual "8 keyframes per video" pattern from Sprint 3. Times are clip-source-time absolute (same convention as add_audio_keyframes).',
    inputSchema: z.object({
      clipId: z.string().describe('The ID of the music/SFX clip to apply ducking to'),
      baseDb: z.number().describe('Sustained level in dB (e.g. -25 for music bed under voice)'),
      duckingWindows: z
        .array(
          z.object({
            startTime: z.number().describe('When to begin ducking, in seconds (clip-source-time absolute)'),
            endTime: z.number().describe('When to recover from ducking, in seconds'),
            duckedDb: z.number().describe('Lower level in dB during this window (e.g. -38 for narrative pause)'),
          })
        )
        .describe('Windows where the clip should duck below baseDb. Empty array = sustained baseDb only.'),
      fadeSeconds: z
        .number()
        .optional()
        .describe('Ramp time for each transition (default 0.2s = 6 frames @30fps)'),
      clipStartTime: z
        .number()
        .optional()
        .describe('Clip start time anchor for first keyframe (default 0)'),
      clipEndTime: z
        .number()
        .optional()
        .describe('Clip end time anchor for last keyframe; if omitted, last duck window endTime + 1s is used'),
    }),
    run: (ctx, args) => setupDucking(ctx, args.clipId, args.baseDb, args.duckingWindows, args.fadeSeconds, args.clipStartTime, args.clipEndTime),
  },
  {
    name: 'mute_track',
    description: 'Mutes or unmutes an entire audio track.',
    inputSchema: z.object({
      sequenceId: z.string().describe('The ID of the sequence'),
      trackIndex: z.number().describe('The index of the audio track'),
      muted: z.boolean().describe('Whether to mute (true) or unmute (false) the track')
    }),
    run: (ctx, args) => muteTrack(ctx, args.sequenceId, args.trackIndex, args.muted),
  },
  {
    name: 'apply_audio_effect',
    description: 'Applies an audio effect to a clip.',
    inputSchema: z.object({
      clipId: z.string().describe('The ID of the audio clip'),
      effectName: z.string().describe('Name of the audio effect (e.g., "Compressor", "EQ", "Reverb")'),
      parameters: z.record(z.string(), z.any()).optional().describe('Effect parameters')
    }),
    run: (ctx, args) => applyAudioEffect(ctx, args.clipId, args.effectName, args.parameters),
  },
  {
    name: 'apply_audio_effect_to_all_clips',
    description: 'Bulk: applies a single audio effect to ALL audio clips of a sequence in one ExtendScript call. Returns per-clip results. Saves N MCP roundtrips when calibrating or applying same chain.',
    inputSchema: z.object({
      sequenceId: z.string().describe('Target sequence ID (must be the active sequence in Premiere)'),
      effectName: z.string().describe('Audio effect display name (e.g., "Limitador forzado", "Compresor multibanda")'),
      parameters: z.record(z.string(), z.any()).optional().describe('Effect parameters by displayName (exact or normalized)')
    }),
    run: (ctx, args) => applyAudioEffectToAllClips(ctx, args.sequenceId, args.effectName, args.parameters),
  },
];

async function resolveProjectItemMediaPath(ctx: ToolContext, projectItemId: string): Promise<{ path?: string; error?: string }> {
  const script = `
      try {
        var item = __findProjectItem(${JSON.stringify(projectItemId)});
        if (!item) {
          return JSON.stringify({ success: false, error: "Project item not found by id: " + ${JSON.stringify(projectItemId)} });
        }
        var mediaPath = null;
        try {
          mediaPath = item.getMediaPath();
        } catch (eMedia) {
          return JSON.stringify({ success: false, error: "Could not read media path: " + eMedia.toString() });
        }
        if (!mediaPath) {
          return JSON.stringify({ success: false, error: "Project item has no media path (is it a sequence or bin?)" });
        }
        return JSON.stringify({ success: true, mediaPath: mediaPath });
      } catch (e) {
        return JSON.stringify({ success: false, error: e.toString() });
      }
    `;
  const result = await ctx.bridge.executeScript(script);
  if (result?.success === false) {
    return { error: result.error || 'Failed to resolve project item media path' };
  }
  return { path: result?.mediaPath };
}

function checkFfmpegAvailable(): Promise<boolean> {
  return new Promise((resolve) => {
    const proc = spawn('ffmpeg', ['-version']);
    proc.on('error', () => resolve(false));
    proc.on('close', (code) => resolve(code === 0));
  });
}

function parseSilenceIntervals(stderr: string): Array<{ start: number; end: number; duration: number }> {
  const starts: number[] = [];
  const ends: number[] = [];
  const startRe = /silence_start:\s*(-?[\d.]+)/g;
  const endRe = /silence_end:\s*(-?[\d.]+)/g;
  let match: RegExpExecArray | null;
  while ((match = startRe.exec(stderr)) !== null) {
    starts.push(parseFloat(match[1]!));
  }
  while ((match = endRe.exec(stderr)) !== null) {
    ends.push(parseFloat(match[1]!));
  }
  const intervals: Array<{ start: number; end: number; duration: number }> = [];
  const count = Math.min(starts.length, ends.length);
  for (let i = 0; i < count; i++) {
    const start = starts[i]!;
    const end = ends[i]!;
    intervals.push({
      start,
      end,
      duration: Math.round((end - start) * 1000) / 1000,
    });
  }
  return intervals;
}

async function detectSilence(ctx: ToolContext, 
  mediaPath?: string,
  projectItemId?: string,
  noiseThresholdDb = -30,
  minDurationSeconds = 1.5
): Promise<any> {
  let resolvedPath = mediaPath;

  if (!resolvedPath && projectItemId) {
    const resolved = await resolveProjectItemMediaPath(ctx, projectItemId);
    if (resolved.error) {
      return { success: false, error: resolved.error };
    }
    resolvedPath = resolved.path;
  }

  if (!resolvedPath) {
    return { success: false, error: 'Provide either mediaPath or projectItemId' };
  }

  const ffmpegAvailable = await checkFfmpegAvailable();
  if (!ffmpegAvailable) {
    return {
      success: false,
      error: 'ffmpeg was not found on PATH. detect_silence analyzes audio via ffmpeg\'s silencedetect filter, not Premiere\'s scripting API (which cannot read audio levels at all). Install ffmpeg (e.g. `brew install ffmpeg` on macOS) and try again.'
    };
  }

  return new Promise((resolve) => {
    const ffmpegArgs = [
      '-i', resolvedPath as string,
      '-af', `silencedetect=noise=${noiseThresholdDb}dB:d=${minDurationSeconds}`,
      '-f', 'null', '-'
    ];
    const proc = spawn('ffmpeg', ffmpegArgs);
    let stderr = '';

    proc.stderr.on('data', (chunk) => {
      stderr += chunk.toString();
    });

    proc.on('error', (err) => {
      resolve({ success: false, error: `Failed to run ffmpeg: ${err.message}` });
    });

    proc.on('close', (code) => {
      if (code !== 0 && stderr.indexOf('silence_start') === -1) {
        resolve({
          success: false,
          error: `ffmpeg exited with code ${code} and produced no silence data. This usually means the file couldn't be read.`,
          mediaPath: resolvedPath,
          ffmpegStderr: stderr.slice(-2000)
        });
        return;
      }
      const silenceIntervals = parseSilenceIntervals(stderr);
      resolve({
        success: true,
        mediaPath: resolvedPath,
        noiseThresholdDb,
        minDurationSeconds,
        silenceIntervals,
        note: 'Detection only -- nothing was cut. Use split_clip/ripple_delete/razor_timeline_at_time on a sequence to remove any of these intervals.'
      });
    });
  });
}

async function setupDucking(ctx: ToolContext, 
  clipId: string,
  baseDb: number,
  duckingWindows: Array<{ startTime: number; endTime: number; duckedDb: number }>,
  fadeSeconds: number = 0.2,
  clipStartTime?: number,
  clipEndTime?: number
): Promise<any> {
  const fade = fadeSeconds ?? 0.2;
  const start = clipStartTime ?? 0;
  const lastWindow = duckingWindows.length > 0 ? duckingWindows[duckingWindows.length - 1] : undefined;
  const end = clipEndTime ?? (lastWindow ? lastWindow.endTime + 1 : start + 1);

  // Collect all keyframes and dedupe-by-time (later writes win for same time)
  const map = new Map<number, number>();
  const upsert = (t: number, db: number) => {
    // Quantize to ms to avoid duplicate-but-not-equal floats
    const key = Math.round(t * 1000) / 1000;
    map.set(key, db);
  };

  upsert(start, baseDb);

  for (const w of duckingWindows) {
    upsert(Math.max(start, w.startTime - fade), baseDb);
    upsert(w.startTime, w.duckedDb);
    upsert(w.endTime, w.duckedDb);
    upsert(Math.min(end, w.endTime + fade), baseDb);
  }

  upsert(end, baseDb);

  const keyframes = Array.from(map.entries())
    .sort((a, b) => a[0] - b[0])
    .map(([time, level]) => ({ time, level }));

  const result = await addAudioKeyframes(ctx, clipId, keyframes);
  return {
    ...(typeof result === 'object' && result !== null ? result : {}),
    ducking_windows: duckingWindows.length,
    fade_seconds: fade,
    keyframes_emitted: keyframes.length,
    base_db: baseDb,
    computed_keyframes: keyframes,
  };
}

async function adjustAudioLevels(ctx: ToolContext, clipId: string, level: number): Promise<any> {
  const script = `
      try {
        var info = __findClip(${JSON.stringify(clipId)});
        if (!info) return JSON.stringify({ success: false, error: "Clip not found" });
        var clip = info.clip;

        var resolvedLevel = __resolveClipProperty(clip, "Volume", "Level");
        if (!resolvedLevel.ok) {
          return JSON.stringify({
            success: false,
            error: resolvedLevel.error.indexOf("Volume") >= 0
              ? "Volume component not found on clip"
              : "Level property not found inside Volume component",
            available: resolvedLevel.available
          });
        }
        var volumeComp = resolvedLevel.component;
        var levelProp = resolvedLevel.property;

        // CALIBRATION (empirical, Premiere Pro 2026 macOS, locale es_ES):
        //   Premiere's clip Volume Level property uses a linear amplitude scale where the
        //   displayed "0 dB" in the Effects Controls panel corresponds to internal linear value
        //   ~0.17783. The relationship is: linear = 0.17783 × 10^(dB/20),
        //   equivalently: linear = 10^((dB - 15) / 20).
        //   Verified by measurement: setting linear = 1.4454 (which standard audio convention
        //   says is +3.2 dB) actually produced ~+13 dB of broadcast loudness gain. With this
        //   calibrated formula, requesting +3.2 dB now sets linear = 0.2571 ≈ matches Premiere's
        //   displayed value.
        var DB_CALIBRATION_OFFSET = 15;  // Premiere ES-locale, PrPro 2026.x
        var dB = ${level};
        var linearValue = Math.pow(10, (dB - DB_CALIBRATION_OFFSET) / 20);
        var oldLinear = levelProp.getValue();
        var oldDB = (oldLinear > 0)
          ? (20 * Math.log(oldLinear) / Math.log(10) + DB_CALIBRATION_OFFSET)
          : -Infinity;
        levelProp.setValue(linearValue, true);

        return JSON.stringify({
          success: true,
          message: "Audio level adjusted (clip Volume component, locale-aware, calibrated dB scale)",
          clipId: ${JSON.stringify(clipId)},
          requestedDB: dB,
          oldLinearValue: oldLinear,
          oldDB: oldDB,
          newLinearValue: linearValue,
          newDB: dB,
          calibrationOffset: DB_CALIBRATION_OFFSET,
          volumeComponent: String(volumeComp.displayName),
          levelProperty: String(levelProp.displayName)
        });
      } catch (e) {
        return JSON.stringify({
          success: false,
          error: e.toString()
        });
      }
    `;

  return await ctx.bridge.executeScript(script);
}

async function addAudioKeyframes(ctx: ToolContext, clipId: string, keyframes: Array<{time: number, level: number}>): Promise<any> {
  // CALIBRATION (matches adjustAudioLevels): Premiere's clip Volume Level property is linear amplitude.
  // The displayed "0 dB" in Effects Controls corresponds to internal linear value ~0.17783.
  // Relationship: linear = 10^((dB - 15) / 20). Verified empirically on Premiere Pro 2026 macOS es_ES.
  const DB_CALIBRATION_OFFSET = 15;
  const keyframeCode = keyframes.map(kf => {
    const linearValue = Math.pow(10, (kf.level - DB_CALIBRATION_OFFSET) / 20);
    return `
        try {
          levelProp.addKey(${kf.time});
          levelProp.setValueAtKey(${kf.time}, ${linearValue}, true);
          addedKeyframes.push({ time: ${kf.time}, level: ${kf.level}, linearValue: ${linearValue} });
        } catch (e2) {
          failedKeyframes.push({ time: ${kf.time}, level: ${kf.level}, error: e2.toString() });
        }
    `;
  }).join('\n');

  const script = `
      try {
        var info = __findClip(${JSON.stringify(clipId)});
        if (!info) return JSON.stringify({ success: false, error: "Clip not found" });
        var clip = info.clip;

        var resolvedLevel = __resolveClipProperty(clip, "Volume", "Level");
        if (!resolvedLevel.ok) {
          return JSON.stringify({
            success: false,
            error: "Level property not found inside Volume component",
            available: resolvedLevel.available
          });
        }
        var volumeComp = resolvedLevel.component;
        var levelProp = resolvedLevel.property;

        levelProp.setTimeVarying(true);
        var addedKeyframes = [];
        var failedKeyframes = [];
        ${keyframeCode}
        return JSON.stringify({
          success: true,
          message: "Audio keyframes added (locale-aware Volume detection, calibrated dB scale)",
          clipId: ${JSON.stringify(clipId)},
          volumeComponent: String(volumeComp.displayName),
          levelProperty: String(levelProp.displayName),
          calibrationOffset: ${DB_CALIBRATION_OFFSET},
          addedKeyframes: addedKeyframes,
          failedKeyframes: failedKeyframes,
          totalKeyframes: addedKeyframes.length
        });
      } catch (e) {
        return JSON.stringify({ success: false, error: e.toString() });
      }
    `;

  return await ctx.bridge.executeScript(script);
}

async function muteTrack(ctx: ToolContext, sequenceId: string, trackIndex: number, muted: boolean): Promise<any> {
  const script = `
      try {
        var sequence = __findSequence(${JSON.stringify(sequenceId)});
        if (!sequence) return JSON.stringify({ success: false, error: "Sequence not found by id: " + ${JSON.stringify(sequenceId)} });
        var track = sequence.audioTracks[${trackIndex}];
        if (!track) return JSON.stringify({ success: false, error: "Audio track not found" });
        track.setMute(${muted ? 1 : 0});
        return JSON.stringify({
          success: true,
          message: "Track mute status changed",
          sequenceId: ${JSON.stringify(sequenceId)},
          trackIndex: ${trackIndex},
          muted: ${muted}
        });
      } catch (e) {
        return JSON.stringify({ success: false, error: e.toString() });
      }
    `;

  return await ctx.bridge.executeScript(script);
}

async function applyAudioEffect(ctx: ToolContext, clipId: string, effectName: string, parameters?: any): Promise<any> {
  const guard = await ctx.bridge.executeScript(`
      try {
        var info = __findClip(${JSON.stringify(clipId)});
        if (!info) return JSON.stringify({ success: false, error: "Clip not found" });
        if (info.trackType !== "audio") {
          return JSON.stringify({
            success: false,
            status: "wrong_clip_type",
            retry: false,
            errorCode: "clip_has_no_audio",
            error: "apply_audio_effect needs an audio-track clip. '" + info.clip.name + "' is on a video track (stills and video-only clips have no Volume component). Call list_sequence_tracks and pass an audio clip id.",
            clipId: ${JSON.stringify(clipId)},
            trackType: info.trackType
          });
        }
        return JSON.stringify({ success: true });
      } catch (e) {
        return JSON.stringify({ success: false, error: e.toString() });
      }
    `);
  if (guard && guard.success === false) return guard;
  return await applyEffect(ctx, clipId, effectName, parameters);
}

async function applyAudioEffectToAllClips(ctx: ToolContext, sequenceId: string, effectName: string, parameters?: Record<string, any>): Promise<any> {
  const paramJson = JSON.stringify(parameters || {});
  const script = `
      try {
        app.enableQE();
        var seq = __findSequence(${JSON.stringify(sequenceId)});
        if (!seq) return JSON.stringify({ success: false, error: "Sequence not found" });
        // Make target active so QE DOM can address it
        var __priorActive = app.project.activeSequence;
        app.project.activeSequence = seq;
        var qeSeq = __qeSequenceFor(seq);
        if (!qeSeq) return JSON.stringify({ success: false, error: "Could not address sequence '" + seq.name + "' through the QE API." });
        var effect = qe.project.getAudioEffectByName(${JSON.stringify(effectName)});
        if (!effect) return JSON.stringify({ success: false, error: "Audio effect not found: " + ${JSON.stringify(effectName)} });

        var requestedParams = ${paramJson};
        function normalize(s) { return String(s).toLowerCase().replace(/[\\s_-]+/g, ''); }

        var perClip = [];
        for (var t = 0; t < seq.audioTracks.numTracks; t++) {
          var track = seq.audioTracks[t];
          var qeTrack = qeSeq.getAudioTrackAt(t);
          for (var c = 0; c < track.clips.numItems; c++) {
            var clip = track.clips[c];
            // Same gap/transition mismatch: c is the DOM clip index, which is not the
            // QE item index once anything non-clip sits earlier on the track.
            var qeClip = __findQeClipByDomClip(qeTrack, clip);
            try {
              qeClip.addAudioEffect(effect);
              var newCompIdx = clip.components.numItems - 1;
              var newComp = clip.components[newCompIdx];
              var paramResults = [];
              for (var pName in requestedParams) {
                if (requestedParams.hasOwnProperty && !requestedParams.hasOwnProperty(pName)) continue;
                var requestedVal = requestedParams[pName];
                var matched = null;
                for (var k = 0; k < newComp.properties.numItems; k++) {
                  if (String(newComp.properties[k].displayName) === pName) {
                    matched = newComp.properties[k]; break;
                  }
                }
                if (!matched) {
                  var nameN = normalize(pName);
                  for (var k = 0; k < newComp.properties.numItems; k++) {
                    if (normalize(String(newComp.properties[k].displayName)) === nameN) {
                      matched = newComp.properties[k]; break;
                    }
                  }
                }
                if (matched) {
                  try {
                    matched.setValue(requestedVal, true);
                    var valueAfter = null;
                    try { valueAfter = matched.getValue(); } catch (eA) {}
                    paramResults.push({ name: pName, ok: true, valueRequested: requestedVal, valueAfter: valueAfter });
                  } catch (e1) {
                    paramResults.push({ name: pName, ok: false, error: e1.toString() });
                  }
                } else {
                  paramResults.push({ name: pName, ok: false, error: "no matching property" });
                }
              }
              perClip.push({ clipIndex: c, trackIndex: t, clipId: String(clip.nodeId), name: String(clip.name), ok: true, paramResults: paramResults });
            } catch (e2) {
              perClip.push({ clipIndex: c, trackIndex: t, clipId: String(clip.nodeId), name: String(clip.name), ok: false, error: e2.toString() });
            }
          }
        }

        return JSON.stringify({
          success: true,
          sequenceId: ${JSON.stringify(sequenceId)},
          sequenceName: String(seq.name),
          effectName: ${JSON.stringify(effectName)},
          totalClipsProcessed: perClip.length,
          allOk: perClip.every ? perClip.every(function(r){return r.ok;}) : true,
          perClip: perClip
        });
      } catch (e) {
        return JSON.stringify({ success: false, error: "QE DOM error: " + e.toString() });
      } finally {
        // Leave the user where they were. ES3 has try/finally, and this runs
        // before the return above completes.
        try {
          if (__priorActive && app.project.activeSequence &&
              app.project.activeSequence.sequenceID !== __priorActive.sequenceID) {
            app.project.activeSequence = __priorActive;
          }
        } catch (eRestore) {}
      }
    `;
  return await ctx.bridge.executeScript(script);
}
