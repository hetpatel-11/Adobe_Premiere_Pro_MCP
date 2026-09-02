/**
 * Timeline edits and clip state.
 *
 * Each entry declares the tool an agent sees and the handler that runs it,
 * so the two cannot drift apart. Handlers reach Premiere through ToolContext.
 */
import { z } from 'zod';
import type { ToolContext, ToolModule } from '../context.js';

export const timelineTools: ToolModule[] = [
  {
    name: 'add_to_timeline',
    description: 'Adds a media clip from the project panel to a sequence timeline at a specific track and time.',
    inputSchema: z.object({
      sequenceId: z.string().describe('The ID of the sequence (timeline) to add the clip to'),
      projectItemId: z.string().describe('The ID of the project item (clip) to add'),
      trackIndex: z.number().describe('The index of the video or audio track (0-based)'),
      time: z.number().describe('The time in seconds where the clip should be placed on the timeline'),
      insertMode: z.enum(['overwrite', 'insert']).optional().describe('Whether to overwrite existing content or insert and shift'),
      linkAudio: z.boolean().optional().describe('When false, removes the auto-linked audio counterpart that Premiere places on audio tracks for video-track clips. Useful for video overlays whose source media (e.g. Remotion .mov outputs) carry silent PCM that would overwrite existing audio. Default true (preserves Premiere\'s native linking behavior).'),
      sourceInPoint: z.number().optional().describe('Source IN point in seconds — the start of the sub-range to pull from the source (footage or sequence). Replicates marking an in point in the Source monitor. Requires sourceOutPoint. When omitted, the whole source (or its current marks) is placed.'),
      sourceOutPoint: z.number().optional().describe('Source OUT point in seconds — the end of the sub-range to pull from the source. Replicates marking an out point in the Source monitor. Requires sourceInPoint.')
    }),
    run: (ctx, args) => addToTimeline(ctx, args.sequenceId, args.projectItemId, args.trackIndex, args.time, args.insertMode, args.linkAudio, args.sourceInPoint, args.sourceOutPoint),
  },
  {
    name: 'add_to_timeline_batch',
    description: 'Places MANY clips onto one sequence in a single round-trip — the fast path for rebuilding a whole edit (e.g. a Descript/EDL stringout). Equivalent to calling add_to_timeline (overwrite) once per clip, but ~50x faster because it loops inside one ExtendScript pass instead of one file round-trip per clip. Each clip supports per-clip linkAudio and sourceInPoint/sourceOutPoint (Source-monitor in/out). Returns a per-clip result array so one bad clip does not sink the batch, plus an aggregate status: top-level success is true ONLY when every clip placed; status is "success" | "partial" | "failure" with placed/failed/total counts.',
    inputSchema: z.object({
      sequenceId: z.string().describe('The ID of the sequence (timeline) to add clips to'),
      clips: z.array(z.object({
        projectItemId: z.string().describe('The ID of the project item (clip / multicam) to add'),
        trackIndex: z.number().describe('The index of the video or audio track (0-based)'),
        time: z.number().describe('Timeline position in seconds where the clip is placed (overwrite)'),
        linkAudio: z.boolean().optional().describe('When false, removes the auto-linked audio counterpart Premiere places on audio tracks for a video-track clip whose source carries an embedded audio stream (prevents overwriting existing audio in overlay/rebuild workflows). Default true (preserves Premiere\'s native linking).'),
        sourceInPoint: z.number().optional().describe('Source IN point in seconds (requires sourceOutPoint)'),
        sourceOutPoint: z.number().optional().describe('Source OUT point in seconds (requires sourceInPoint)')
      })).describe('Ordered list of clips to place. All use overwrite mode.')
    }),
    run: (ctx, args) => addToTimelineBatch(ctx, args.sequenceId, args.clips),
  },
  {
    name: 'remove_from_timeline',
    description: 'Removes a clip from the timeline. Pass sequenceId when the clip ID came from list_sequence_tracks for a non-active sequence.',
    inputSchema: z.object({
      clipId: z.string().describe('The ID of the clip on the timeline to remove'),
      sequenceId: z.string().optional().describe('Optional sequence ID to search. If omitted, searches the active sequence first, then all sequences.'),
      deleteMode: z.enum(['ripple', 'lift']).optional().describe('Whether to ripple delete (close gap) or lift (leave gap)')
    }),
    run: (ctx, args) => removeFromTimeline(ctx, args.clipId, args.sequenceId, args.deleteMode),
  },
  {
    name: 'move_clip',
    description: 'Moves a clip along the timeline, keeping it on its current track. To change tracks, use move_clip_to_track: that call restores source in/out after a remove-and-reinsert, refuses an occupied destination unless overwrite is true, and gives the clip a new id.',
    inputSchema: z.object({
      clipId: z.string().describe('The ID of the clip to move'),
      newTime: z.number().describe('The new time position in seconds')
    // .strict() so a leftover newTrackIndex is an error rather than being
    // silently dropped. Zod strips unknown keys by default, which would have
    // let a caller migrating from the old signature keep passing it and keep
    // believing the clip changed track.
    }).strict(),
    run: (ctx, args) => moveClip(ctx, args.clipId, args.newTime),
  },
  {
    name: 'trim_clip',
    description: 'Adjusts the in and out points of a clip on the timeline, effectively shortening it.',
    inputSchema: z.object({
      clipId: z.string().describe('The ID of the clip on the timeline to trim'),
      inPoint: z.number().optional().describe('The new in point in seconds from the start of the clip'),
      outPoint: z.number().optional().describe('The new out point in seconds from the start of the clip; cannot be combined with duration'),
      duration: z.number().optional().describe('Alternative: set the desired timeline duration in seconds; cannot be combined with outPoint')
    }).refine((value) => value.outPoint === undefined || value.duration === undefined, {
      message: 'outPoint and duration cannot be used together'
    }),
    run: (ctx, args) => trimClip(ctx, args.clipId, args.inPoint, args.outPoint, args.duration),
  },
  {
    name: 'split_clip',
    description: 'Splits a clip at a specific time point, creating two separate clips.',
    inputSchema: z.object({
      clipId: z.string().describe('The ID of the clip to split'),
      splitTime: z.number().describe('The time in seconds where to split the clip')
    }),
    run: (ctx, args) => splitClip(ctx, args.clipId, args.splitTime),
  },
  {
    name: 'razor_timeline_at_time',
    description: 'Cuts across multiple tracks in a sequence at an absolute timeline time. If no track arrays are provided, all video and audio tracks are cut.',
    inputSchema: z.object({
      sequenceId: z.string().optional().describe('Optional sequence ID. Defaults to the active sequence.'),
      time: z.number().describe('Absolute timeline time in seconds where the cut should occur.'),
      videoTrackIndices: z.array(z.number().int().min(0)).optional().describe('Optional video track indices to cut. Defaults to all video tracks.'),
      audioTrackIndices: z.array(z.number().int().min(0)).optional().describe('Optional audio track indices to cut. Defaults to all audio tracks.')
    }),
    run: (ctx, args) => razorTimelineAtTime(ctx, args.sequenceId, args.time, args.videoTrackIndices, args.audioTrackIndices),
  },
  {
    name: 'duplicate_clip',
    description: 'Duplicates a clip on the timeline.',
    inputSchema: z.object({
      clipId: z.string().describe('The ID of the clip to duplicate'),
      offset: z.number().optional().describe('Time offset in seconds for the duplicate (default: places immediately after original)')
    }),
    run: (ctx, args) => duplicateClip(ctx, args.clipId, args.offset),
  },
  {
    name: 'reverse_clip',
    description: 'Reverses the playback of a clip.',
    inputSchema: z.object({
      clipId: z.string().describe('The ID of the clip to reverse'),
      maintainAudioPitch: z.boolean().optional().describe('Whether to maintain audio pitch (default: true)')
    }),
    run: (ctx, args) => reverseClip(ctx, args.clipId, args.maintainAudioPitch),
  },
  {
    name: 'enable_disable_clip',
    description: 'Enables or disables a clip on the timeline.',
    inputSchema: z.object({
      clipId: z.string().describe('The ID of the clip'),
      enabled: z.boolean().describe('Whether to enable (true) or disable (false)')
    }),
    run: (ctx, args) => enableDisableClip(ctx, args.clipId, args.enabled),
  },
  {
    name: 'replace_clip',
    description: 'Replaces a clip on the timeline with another media item.',
    inputSchema: z.object({
      clipId: z.string().describe('The ID of the clip to replace'),
      newProjectItemId: z.string().describe('The ID of the new project item to use'),
      preserveEffects: z.boolean().optional().describe('When true (default), restore source in/out, the enabled flag, Motion values, and other effects on the replacement. When false, the new item is placed at full duration with default Motion.')
    }),
    run: (ctx, args) => replaceClip(ctx, args.clipId, args.newProjectItemId, args.preserveEffects),
  },
  {
    name: 'get_clip_properties',
    description: 'Gets detailed properties of a clip, INCLUDING current Motion values (opacity/scale/rotation/position). Position is returned both normalized (0..1) and in PIXELS (`motion.position`, using the sequence frame size) so you can verify or copy framing without exporting a frame. Pass sequenceId when the clip ID came from list_sequence_tracks for a non-active sequence.',
    inputSchema: z.object({
      clipId: z.string().describe('The ID of the clip'),
      sequenceId: z.string().optional().describe('Optional sequence ID to search. If omitted, searches the active sequence first, then all sequences.')
    }),
    run: (ctx, args) => getClipProperties(ctx, args.clipId, args.sequenceId),
  },
  {
    name: 'set_clip_properties',
    description: 'Sets Motion properties of a clip (opacity, scale, rotation, position).',
    inputSchema: z.object({
      clipId: z.string().describe('The ID of the clip'),
      properties: z.object({
        opacity: z.number().optional().describe('Opacity 0-100'),
        scale: z.number().optional().describe('Scale percentage'),
        rotation: z.number().optional().describe('Rotation in degrees'),
        position: z.object({
          x: z.number().optional(),
          y: z.number().optional()
        }).optional().describe('Position in PIXELS matching the Effect Controls panel (e.g. 960,640 = center of a 1920x1280 sequence). Converted to the normalized API value internally using the clip sequence frame size.')
      }).describe('Properties to set')
    }),
    run: (ctx, args) => setClipProperties(ctx, args.clipId, args.properties),
  },
  {
    name: 'set_clip_properties_batch',
    description: 'Applies Motion properties (opacity/scale/rotation/position) to MANY clips in a single round-trip — the fast path for per-speaker framing across a whole rebuilt edit. ~50x faster than one set_clip_properties call per clip. Returns a per-clip result array; each result carries an `applied` map ({opacity,scale,rotation,position}) and `success` is true only when EVERY requested property was actually found and set (a missing Motion property is reported, not silently ignored).',
    inputSchema: z.object({
      items: z.array(z.object({
        clipId: z.string().describe('The ID of the clip'),
        properties: z.object({
          opacity: z.number().optional().describe('Opacity 0-100'),
          scale: z.number().optional().describe('Scale percentage'),
          rotation: z.number().optional().describe('Rotation in degrees'),
          position: z.object({
            x: z.number().optional(),
            y: z.number().optional()
          }).optional().describe('Position in PIXELS matching the Effect Controls panel (converted to the normalized API value internally using the clip sequence frame size)')
        }).describe('Properties to set for this clip')
      })).describe('List of clip + properties pairs')
    }),
    run: (ctx, args) => setClipPropertiesBatch(ctx, args.items),
  },
  {
    name: 'stabilize_clip',
    description: 'Applies video stabilization to reduce camera shake.',
    inputSchema: z.object({
      clipId: z.string().describe('The ID of the clip to stabilize'),
      method: z.enum(['warp', 'subspace']).optional().describe('Stabilization method'),
      smoothness: z.number().optional().describe('Stabilization smoothness (0-100)')
    }),
    run: (ctx, args) => stabilizeClip(ctx, args.clipId, args.method, args.smoothness),
  },
  {
    name: 'speed_change',
    description: 'Changes the playback speed of a clip.',
    inputSchema: z.object({
      clipId: z.string().describe('The ID of the clip'),
      speed: z.number().describe('Speed multiplier (0.1 = 10% speed, 2.0 = 200% speed)'),
      maintainAudio: z.boolean().optional().describe('Whether to maintain audio pitch when changing speed')
    }),
    run: (ctx, args) => speedChange(ctx, args.clipId, args.speed, args.maintainAudio),
  },
  {
    name: 'get_playhead_position',
    description: 'Gets the current playhead (CTI) position in the specified sequence.',
    inputSchema: z.object({
      sequenceId: z.string().describe('The ID of the sequence')
    }),
    run: (ctx, args) => getPlayheadPosition(ctx, args.sequenceId),
  },
  {
    name: 'set_playhead_position',
    description: 'Sets the playhead (CTI) position in the specified sequence.',
    inputSchema: z.object({
      sequenceId: z.string().describe('The ID of the sequence'),
      time: z.number().describe('The time in seconds to move the playhead to')
    }),
    run: (ctx, args) => setPlayheadPosition(ctx, args.sequenceId, args.time),
  },
  {
    name: 'get_selected_clips',
    description: 'Gets all currently selected clips in the specified sequence.',
    inputSchema: z.object({
      sequenceId: z.string().describe('The ID of the sequence')
    }),
    run: (ctx, args) => getSelectedClips(ctx, args.sequenceId),
  },
  {
    name: 'detect_scene_edits',
    description: 'Detects scene changes in selected clips and optionally adds cuts or markers.',
    inputSchema: z.object({
      sequenceId: z.string().describe('The ID of the sequence'),
      action: z.enum(['ApplyCuts', 'CreateMarkers']).optional().describe('Action to take at detected edit points'),
      applyCutsToLinkedAudio: z.boolean().optional().describe('Whether to apply cuts to linked audio'),
      sensitivity: z.string().optional().describe('Detection sensitivity (e.g., "Low", "Medium", "High")'),
      allowUnsafeSynchronous: z.boolean().optional().describe('Actually invoke Premiere scene detection synchronously; can block CEP for a long time')
    }),
    run: (ctx, args) => detectSceneEdits(ctx, args.sequenceId, args.action, args.applyCutsToLinkedAudio, args.sensitivity, args.allowUnsafeSynchronous),
  },
  {
    name: 'link_audio_video',
    description: 'Links or unlinks audio and video components of a clip.',
    inputSchema: z.object({
      clipId: z.string().describe('The ID of the clip'),
      linked: z.boolean().describe('Whether to link (true) or unlink (false)')
    }),
    run: (ctx, args) => linkAudioVideo(ctx, args.clipId, args.linked),
  },
];

async function addToTimelineBatch(ctx: ToolContext, sequenceId: string, clips: Array<{ projectItemId: string; trackIndex: number; time: number; linkAudio?: boolean; sourceInPoint?: number; sourceOutPoint?: number }>): Promise<any> {
  try {
    const result: any = await ctx.bridge.addToTimelineBatch(sequenceId, clips);
    return { sequenceId, requested: clips.length, ...result };
  } catch (error) {
    return { success: false, error: error instanceof Error ? error.message : String(error), sequenceId, requested: clips.length };
  }
}

export async function addToTimeline(ctx: ToolContext, sequenceId: string, projectItemId: string, trackIndex: number, time: number, insertMode = 'overwrite', linkAudio: boolean = true, sourceInPoint?: number, sourceOutPoint?: number): Promise<any> {
  try {
    // insertMode used to stop here: it was echoed in every response below while
    // the bridge unconditionally overwrote, so a caller asking to insert-and-shift
    // had the footage it was moving destroyed and was told the opposite.
    const result: any = await ctx.bridge.addToTimeline(sequenceId, projectItemId, trackIndex, time, linkAudio, sourceInPoint, sourceOutPoint, insertMode);
    if (!result.success) {
      return {
        ...result,
        sequenceId: sequenceId,
        projectItemId: projectItemId,
        trackIndex: trackIndex,
        time: time,
        insertMode: insertMode,
        linkAudio: linkAudio,
        sourceInPoint: sourceInPoint,
        sourceOutPoint: sourceOutPoint
      };
    }
    return {
      success: true,
      message: `Clip added to timeline successfully`,
      sequenceId: sequenceId,
      projectItemId: projectItemId,
      trackIndex: trackIndex,
      time: time,
      insertMode: insertMode,
      linkAudio: linkAudio,
      sourceInPoint: sourceInPoint,
      sourceOutPoint: sourceOutPoint,
      ...result
    };
  } catch (error) {
    return {
      success: false,
      error: `Failed to add clip to timeline: ${error instanceof Error ? error.message : String(error)}`,
      sequenceId: sequenceId,
      projectItemId: projectItemId,
      trackIndex: trackIndex,
      time: time
    };
  }
}

async function removeFromTimeline(ctx: ToolContext, clipId: string, sequenceId?: string, deleteMode = 'ripple'): Promise<any> {
  const script = `
      try {
        var info = __findClip(${JSON.stringify(clipId)}, ${sequenceId ? JSON.stringify(sequenceId) : 'null'});
        if (!info) return JSON.stringify({ success: false, error: ${sequenceId ? JSON.stringify(`Clip not found in sequence: ${sequenceId}`) : '"Clip not found"'} });
        var clip = info.clip;
        var clipName = clip.name;
        var isRipple = ${JSON.stringify(deleteMode)} === "ripple";
        clip.remove(isRipple, true);
        return JSON.stringify({
          success: true,
          message: "Clip removed from timeline",
          clipId: ${JSON.stringify(clipId)},
          clipName: clipName,
          sequenceId: info.sequenceId,
          sequenceName: info.sequenceName,
          deleteMode: ${JSON.stringify(deleteMode)}
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

async function moveClip(ctx: ToolContext, clipId: string, newTime: number): Promise<any> {
  const script = `
      try {
        var info = __findClip(${JSON.stringify(clipId)});
        if (!info) return JSON.stringify({ success: false, error: "Clip not found" });
        var clip = info.clip;
        var oldTime = clip.start.seconds;
        var shiftAmount = ${newTime} - oldTime;
        clip.move(shiftAmount);
        return JSON.stringify({
          success: true,
          message: "Clip moved successfully",
          clipId: ${JSON.stringify(clipId)},
          oldTime: oldTime,
          newTime: ${newTime},
          trackIndex: info.trackIndex
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

export async function trimClip(ctx: ToolContext, clipId: string, inPoint?: number, outPoint?: number, duration?: number): Promise<any> {
  if (outPoint !== undefined && duration !== undefined) {
    return {
      success: false,
      error: 'outPoint and duration cannot be used together',
      errorCode: 'INVALID_TRIM_ARGUMENTS'
    };
  }

  const script = `
      try {
        var info = __findClip(${JSON.stringify(clipId)});
        if (!info) return JSON.stringify({ success: false, error: "Clip not found" });
        var clip = info.clip;
        function secondsOf(value) {
          if (value === undefined || value === null) return null;
          if (typeof value === "number") return value;
          if (value.seconds !== undefined) return Number(value.seconds);
          if (value.ticks !== undefined) return Number(value.ticks) / 254016000000.0;
          return null;
        }
        function frameDurationOf(sequence) {
          try {
            if (sequence && sequence.timebase !== undefined) {
              var value = Number(sequence.timebase) / 254016000000.0;
              if (value > 0 && isFinite(value)) return value;
            }
          } catch (frameError) {}
          return 1 / 48;
        }
        var frameDurationSeconds = frameDurationOf(info.sequence);
        function exactEnough(a, b) {
          return a !== null && b !== null && Math.abs(a - b) < 0.000001;
        }
        function closeEnough(a, b) {
          return a !== null && b !== null && Math.abs(a - b) <= (frameDurationSeconds / 2) + 0.000001;
        }
        function timeFromSeconds(seconds) {
          var t = new Time();
          t.seconds = Number(seconds);
          return t;
        }
        function capturedTime(value) {
          if (value === undefined || value === null) return null;
          var captured = { seconds: secondsOf(value), ticks: null };
          try {
            if (value.ticks !== undefined && value.ticks !== null) captured.ticks = String(value.ticks);
          } catch (ticksError) {}
          return captured;
        }
        function timeFromCaptured(captured) {
          if (!captured) return null;
          var t = new Time();
          if (captured.ticks !== null) t.ticks = captured.ticks;
          else t.seconds = Number(captured.seconds);
          return t;
        }
        function stateOf() {
          return {
            inPoint: secondsOf(clip.inPoint),
            outPoint: secondsOf(clip.outPoint),
            start: secondsOf(clip.start),
            end: secondsOf(clip.end),
            duration: secondsOf(clip.duration)
          };
        }

        var before = stateOf();
        var original = {
          inPoint: capturedTime(clip.inPoint),
          outPoint: capturedTime(clip.outPoint),
          start: capturedTime(clip.start),
          end: capturedTime(clip.end)
        };
        var writeErrors = [];
        function recordWriteError(propertyName, error) {
          writeErrors.push({ property: propertyName, error: error.toString() });
        }

        ${inPoint !== undefined ? `
        if (!exactEnough(before.inPoint, ${inPoint})) {
          try { clip.inPoint = timeFromSeconds(${inPoint}); }
          catch (inPointError) { recordWriteError("inPoint", inPointError); }
        }
        ` : ''}
        ${outPoint !== undefined ? `
        if (!exactEnough(before.outPoint, ${outPoint})) {
          try { clip.outPoint = timeFromSeconds(${outPoint}); }
          catch (outPointError) { recordWriteError("outPoint", outPointError); }
        }
        ` : ''}
        ${duration !== undefined ? `
        var targetDuration = ${duration};
        if (!exactEnough(before.duration, targetDuration)) {
          try {
            clip.end = timeFromSeconds(secondsOf(clip.start) + targetDuration);
          } catch (timelineError) {
            recordWriteError("end", timelineError);
          }
        }
        var durationAfterEnd = stateOf();
        if (closeEnough(durationAfterEnd.duration, targetDuration)) {
          var targetOutPoint = secondsOf(clip.inPoint) + durationAfterEnd.duration;
          if (!closeEnough(durationAfterEnd.outPoint, targetOutPoint)) {
            try { clip.outPoint = timeFromSeconds(targetOutPoint); }
            catch (outSyncError) { recordWriteError("outPoint", outSyncError); }
          }
        }
        ` : ''}

        var after = stateOf();
        var verified = true;
        var verificationErrors = [];
        ${inPoint !== undefined ? `
        if (!closeEnough(after.inPoint, ${inPoint})) {
          verified = false;
          verificationErrors.push("inPoint did not change to requested value");
        }
        ` : ''}
        ${outPoint !== undefined ? `
        if (!closeEnough(after.outPoint, ${outPoint})) {
          verified = false;
          verificationErrors.push("outPoint did not change to requested value");
        }
        ` : ''}
        ${duration !== undefined ? `
        if (!closeEnough(after.duration, ${duration})) {
          verified = false;
          verificationErrors.push("timeline duration did not change to requested value");
        }
        ` : ''}

        if (!verified) {
          var attempted = after;
          var rollbackErrors = [];
          function rollback(propertyName, captured) {
            try {
              if (captured) clip[propertyName] = timeFromCaptured(captured);
            } catch (rollbackError) {
              rollbackErrors.push({ property: propertyName, error: rollbackError.toString() });
            }
          }
          ${duration !== undefined ? 'if (!exactEnough(attempted.end, before.end)) rollback("end", original.end);' : ''}
          ${outPoint !== undefined || duration !== undefined ? 'if (!exactEnough(attempted.outPoint, before.outPoint)) rollback("outPoint", original.outPoint);' : ''}
          ${inPoint !== undefined ? 'if (!exactEnough(attempted.inPoint, before.inPoint)) rollback("inPoint", original.inPoint);' : ''}
          var restored = stateOf();
          var rolledBack =
            exactEnough(restored.inPoint, before.inPoint) &&
            exactEnough(restored.outPoint, before.outPoint) &&
            exactEnough(restored.start, before.start) &&
            exactEnough(restored.end, before.end);
          var errorCode = "TRIM_NOT_APPLIED";
          ${duration !== undefined ? `
          if (${duration} > before.duration && closeEnough(attempted.duration, before.duration)) {
            errorCode = "TRIM_UNSUPPORTED_FOR_CLIP";
          }
          ` : ''}
          return JSON.stringify({
            success: false,
            error: errorCode === "TRIM_UNSUPPORTED_FOR_CLIP"
              ? "Premiere Pro does not support extending this clip to the requested duration"
              : "Premiere Pro did not apply the requested trim",
            errorCode: errorCode,
            clipId: ${JSON.stringify(clipId)},
            requested: {
              inPoint: ${inPoint !== undefined ? inPoint : 'null'},
              outPoint: ${outPoint !== undefined ? outPoint : 'null'},
              duration: ${duration !== undefined ? duration : 'null'}
            },
            before: before,
            after: after,
            attempted: attempted,
            restored: restored,
            rolledBack: rolledBack,
            verificationErrors: verificationErrors,
            writeErrors: writeErrors,
            rollbackErrors: rollbackErrors,
            frameDurationSeconds: frameDurationSeconds
          });
        }

        return JSON.stringify({
          success: true,
          message: "Clip trimmed and verified",
          clipId: ${JSON.stringify(clipId)},
          oldInPoint: before.inPoint,
          oldOutPoint: before.outPoint,
          oldDuration: before.duration,
          newInPoint: after.inPoint,
          newOutPoint: after.outPoint,
          newDuration: after.duration,
          before: before,
          after: after,
          writeErrors: writeErrors,
          frameDurationSeconds: frameDurationSeconds
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

async function splitClip(ctx: ToolContext, clipId: string, splitTime: number): Promise<any> {
  const script = `
      try {
        app.enableQE();
        var info = __findClip(${JSON.stringify(clipId)});
        if (!info) return JSON.stringify({ success: false, error: "Clip not found" });
        var splitSeconds = info.clip.start.seconds + ${splitTime};
        // The timecode must come from the sequence the clip actually lives in, not
        // from whatever is on screen. Taking it from the active sequence put the cut
        // on the right timeline at the wrong frame whenever the two differed in frame
        // rate: a 24 fps clip razored using a 30 fps timebase lands three frames out.
        var seq = info.sequence;
        var fps = seq && seq.timebase ? (254016000000 / parseInt(seq.timebase, 10)) : 30;
        var totalFrames = Math.round(splitSeconds * fps);
        var hours = Math.floor(totalFrames / (fps * 3600));
        var mins = Math.floor((totalFrames % (fps * 3600)) / (fps * 60));
        var secs = Math.floor((totalFrames % (fps * 60)) / fps);
        var frames = Math.round(totalFrames % fps);
        function pad(n) { return n < 10 ? "0" + n : "" + n; }
        var tc = pad(hours) + ":" + pad(mins) + ":" + pad(secs) + ":" + pad(frames);
        // Addressed by id, not by whatever is on screen. __findClip() searches every
        // sequence in the project, so a clip can be resolved out of one sequence and
        // then, through getActiveSequence(), have the effect applied to whichever
        // clip sits at the same track and index in a different one.
        var qeSeq = __qeSequenceFor(info.sequence);
        if (!qeSeq) return JSON.stringify({ success: false, error: "Could not address sequence '" + info.sequenceName + "' through the QE API." });
        var qeTrack = info.trackType === 'video' ? qeSeq.getVideoTrackAt(info.trackIndex) : qeSeq.getAudioTrackAt(info.trackIndex);
        qeTrack.razor(tc);
        return JSON.stringify({ success: true, message: "Clip split at " + tc, splitTime: ${splitTime}, timecode: tc });
      } catch (e) {
        return JSON.stringify({ success: false, error: "QE DOM error: " + e.toString() });
      }
    `;

  return await ctx.bridge.executeScript(script);
}

async function razorTimelineAtTime(ctx: ToolContext, sequenceId?: string, time?: number, videoTrackIndices?: number[], audioTrackIndices?: number[]): Promise<any> {
  const normalizedTime = time ?? 0;
  const videoIndices = videoTrackIndices ?? [];
  const audioIndices = audioTrackIndices ?? [];

  const script = `
      try {
        app.enableQE();
        var sequence = ${sequenceId ? `__findSequence(${JSON.stringify(sequenceId)})` : 'app.project.activeSequence'};
        if (!sequence) return JSON.stringify({ success: false, error: ${sequenceId ? `"Sequence not found by id: " + ${JSON.stringify(sequenceId)}` : '"No active sequence"'} });

        var __priorActive = app.project.activeSequence;
        if (app.project.activeSequence && app.project.activeSequence.sequenceID !== sequence.sequenceID) {
          app.project.openSequence(sequence.sequenceID);
        }

        var activeSequence = app.project.activeSequence;
        if (!activeSequence || activeSequence.sequenceID !== sequence.sequenceID) {
          return JSON.stringify({ success: false, error: "Unable to activate requested sequence for razor cut" });
        }

        var fps = activeSequence.timebase ? (254016000000 / parseInt(activeSequence.timebase, 10)) : 30;
        var totalFrames = Math.round(${normalizedTime} * fps);
        var hours = Math.floor(totalFrames / (fps * 3600));
        var mins = Math.floor((totalFrames % (fps * 3600)) / (fps * 60));
        var secs = Math.floor((totalFrames % (fps * 60)) / fps);
        var frames = Math.round(totalFrames % fps);
        function pad(n) { return n < 10 ? "0" + n : "" + n; }
        var tc = pad(hours) + ":" + pad(mins) + ":" + pad(secs) + ":" + pad(frames);

        var qeSeq = __qeSequenceFor(sequence);
        if (!qeSeq) return JSON.stringify({ success: false, error: "QE active sequence unavailable" });

        function buildIndices(count, requested) {
          if (!requested || requested.length === 0) {
            var all = [];
            for (var idx = 0; idx < count; idx++) all.push(idx);
            return all;
          }
          return requested;
        }

        var requestedVideo = ${JSON.stringify(videoIndices)};
        var requestedAudio = ${JSON.stringify(audioIndices)};
        var finalVideo = buildIndices(activeSequence.videoTracks.numTracks, requestedVideo);
        var finalAudio = buildIndices(activeSequence.audioTracks.numTracks, requestedAudio);
        var cutVideoTracks = [];
        var cutAudioTracks = [];
        var skippedVideoTracks = [];
        var skippedAudioTracks = [];

        for (var i = 0; i < finalVideo.length; i++) {
          var videoIndex = finalVideo[i];
          if (videoIndex < 0 || videoIndex >= activeSequence.videoTracks.numTracks) {
            skippedVideoTracks.push({ index: videoIndex, reason: "Video track index out of range" });
            continue;
          }
          var qeVideoTrack = qeSeq.getVideoTrackAt(videoIndex);
          if (!qeVideoTrack) {
            skippedVideoTracks.push({ index: videoIndex, reason: "QE video track not found" });
            continue;
          }
          qeVideoTrack.razor(tc);
          cutVideoTracks.push(videoIndex);
        }

        for (var j = 0; j < finalAudio.length; j++) {
          var audioIndex = finalAudio[j];
          if (audioIndex < 0 || audioIndex >= activeSequence.audioTracks.numTracks) {
            skippedAudioTracks.push({ index: audioIndex, reason: "Audio track index out of range" });
            continue;
          }
          var qeAudioTrack = qeSeq.getAudioTrackAt(audioIndex);
          if (!qeAudioTrack) {
            skippedAudioTracks.push({ index: audioIndex, reason: "QE audio track not found" });
            continue;
          }
          qeAudioTrack.razor(tc);
          cutAudioTracks.push(audioIndex);
        }

        return JSON.stringify({
          success: true,
          message: "Timeline razored at " + tc,
          sequenceId: activeSequence.sequenceID,
          sequenceName: activeSequence.name,
          time: ${normalizedTime},
          timecode: tc,
          cutVideoTracks: cutVideoTracks,
          cutAudioTracks: cutAudioTracks,
          skippedVideoTracks: skippedVideoTracks,
          skippedAudioTracks: skippedAudioTracks
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

async function stabilizeClip(ctx: ToolContext, clipId: string, _method = 'warp', smoothness = 50): Promise<any> {
  const script = `
      try {
        app.enableQE();
        var info = __findClip(${JSON.stringify(clipId)});
        if (!info) return JSON.stringify({ success: false, error: "Clip not found" });
        // Addressed by id, not by whatever is on screen. __findClip() searches every
        // sequence in the project, so a clip can be resolved out of one sequence and
        // then, through getActiveSequence(), have the effect applied to whichever
        // clip sits at the same track and index in a different one.
        var qeSeq = __qeSequenceFor(info.sequence);
        if (!qeSeq) return JSON.stringify({ success: false, error: "Could not address sequence '" + info.sequenceName + "' through the QE API." });
        var qeTrack = qeSeq.getVideoTrackAt(info.trackIndex);
        var qeClip = __findQeClipByDomClip(qeTrack, info.clip);
        var effect = qe.project.getVideoEffectByName("Warp Stabilizer");
        if (!effect) return JSON.stringify({ success: false, error: "Warp Stabilizer effect not found" });
        qeClip.addVideoEffect(effect);
        var clip = info.clip;
        var lastComp = clip.components[clip.components.numItems - 1];
        for (var j = 0; j < lastComp.properties.numItems; j++) {
          try {
            if (lastComp.properties[j].displayName === "Smoothness") lastComp.properties[j].setValue(${smoothness}, true);
          } catch (e2) {}
        }
        return JSON.stringify({ success: true, message: "Warp Stabilizer applied", clipId: ${JSON.stringify(clipId)}, smoothness: ${smoothness} });
      } catch (e) {
        return JSON.stringify({ success: false, error: e.toString() });
      }
    `;

  return await ctx.bridge.executeScript(script);
}

async function speedChange(ctx: ToolContext, clipId: string, speed: number, maintainAudio = true): Promise<any> {
  // QE setSpeed takes a multiplier (1 = 1x), not a percent. Values already > 10
  // are treated as percents (150 → 1.5) because agents send both shapes.
  const script = `
      try {
        app.enableQE();
        var info = __findClip(${JSON.stringify(clipId)});
        if (!info) return JSON.stringify({ success: false, error: "Clip not found" });
        var oldSpeed = info.clip.getSpeed();
        var ratio = __normalizeSpeedRatio(${speed});
        if (ratio == null) return JSON.stringify({ success: false, error: "Invalid speed" });
        // Addressed by id, not by whatever is on screen. __findClip() searches every
        // sequence in the project, so a clip can be resolved out of one sequence and
        // then, through getActiveSequence(), have the effect applied to whichever
        // clip sits at the same track and index in a different one.
        var qeSeq = __qeSequenceFor(info.sequence);
        if (!qeSeq) return JSON.stringify({ success: false, error: "Could not address sequence '" + info.sequenceName + "' through the QE API." });
        var qeTrack = info.trackType === 'video' ? qeSeq.getVideoTrackAt(info.trackIndex) : qeSeq.getAudioTrackAt(info.trackIndex);
        var qeClip = __findQeClipByDomClip(qeTrack, info.clip);
        try { __setClipSpeed(qeClip, info.clip, ratio, false, ${maintainAudio}, false); } catch(e2) {
          var currentRatio = __normalizeSpeedRatio(oldSpeed);
          if (currentRatio != null && Math.abs(currentRatio - ratio) < 0.01) {
            return JSON.stringify({ success: true, oldSpeed: oldSpeed, newSpeed: ratio, changed: false, method: "already at requested speed" });
          }
          return JSON.stringify({ success: false, error: "Speed change via QE DOM not available: " + e2.toString() });
        }
        return JSON.stringify({ success: true, oldSpeed: oldSpeed, newSpeed: ratio });
      } catch (e) {
        return JSON.stringify({ success: false, error: e.toString() });
      }
    `;

  return await ctx.bridge.executeScript(script);
}

async function linkAudioVideo(ctx: ToolContext, clipId: string, linked: boolean): Promise<any> {
  const script = `
      try {
        var info = __findClip(${JSON.stringify(clipId)});
        if (!info) return JSON.stringify({ success: false, error: "Clip not found" });
        info.clip.setSelected(1, 1);
        var seq = app.project.activeSequence;
        if (${linked}) { seq.linkSelection(); } else { seq.unlinkSelection(); }
        return JSON.stringify({ success: true, message: "Clip " + (${linked} ? "linked" : "unlinked") });
      } catch (e) {
        return JSON.stringify({ success: false, error: e.toString() });
      }
    `;
  return await ctx.bridge.executeScript(script);
}

async function duplicateClip(ctx: ToolContext, clipId: string, offset?: number): Promise<any> {
  const script = `
      try {
        var info = __findClip(${JSON.stringify(clipId)});
        if (!info) return JSON.stringify({ success: false, error: "Clip not found" });
        var clip = info.clip;
        var projItem = clip.projectItem;
        var insertTime = clip.end.seconds + ${offset !== undefined ? offset : 0};
        info.track.overwriteClip(projItem, insertTime);
        return JSON.stringify({ success: true, message: "Clip duplicated at " + insertTime + "s" });
      } catch (e) {
        return JSON.stringify({ success: false, error: e.toString() });
      }
    `;
  return await ctx.bridge.executeScript(script);
}

async function reverseClip(ctx: ToolContext, clipId: string, maintainAudioPitch?: boolean): Promise<any> {
  const script = `
      try {
        var info = __findClip(${JSON.stringify(clipId)});
        if (!info) return JSON.stringify({ success: false, error: "Clip not found" });
        var mediaPath = "";
        try { mediaPath = info.clip.projectItem && info.clip.projectItem.getMediaPath ? String(info.clip.projectItem.getMediaPath()) : ""; } catch (pathError) {}
        if (/\\.(png|jpg|jpeg|gif|tif|tiff)$/i.test(mediaPath)) {
          return JSON.stringify({ success: true, clipId: ${JSON.stringify(clipId)}, reversed: true, changed: false, method: "still image already visually reversible" });
        }
        app.enableQE();
        // Addressed by id, not by whatever is on screen. __findClip() searches every
        // sequence in the project, so a clip can be resolved out of one sequence and
        // then, through getActiveSequence(), have the effect applied to whichever
        // clip sits at the same track and index in a different one.
        var qeSeq = __qeSequenceFor(info.sequence);
        if (!qeSeq) return JSON.stringify({ success: false, error: "Could not address sequence '" + info.sequenceName + "' through the QE API." });
        var qeTrack = info.trackType === 'video' ? qeSeq.getVideoTrackAt(info.trackIndex) : qeSeq.getAudioTrackAt(info.trackIndex);
        var qeClip = __findQeClipByDomClip(qeTrack, info.clip);
        if (!qeClip || !qeClip.setReverse) return JSON.stringify({ success: false, error: "QE setReverse API unavailable" });
        try { qeClip.setReverse(true); } catch (reverseError) { return JSON.stringify({ success: false, error: "Reverse via QE DOM not available: " + reverseError.toString() }); }
        return JSON.stringify({ success: true, clipId: ${JSON.stringify(clipId)}, reversed: true, changed: true, maintainAudioPitch: ${maintainAudioPitch !== false} });
      } catch (e) {
        return JSON.stringify({ success: false, error: e.toString() });
      }
    `;
  return await ctx.bridge.executeScript(script);
}

async function enableDisableClip(ctx: ToolContext, clipId: string, enabled: boolean): Promise<any> {
  const script = `
      try {
        var info = __findClip(${JSON.stringify(clipId)});
        if (!info) return JSON.stringify({ success: false, error: "Clip not found" });
        info.clip.disabled = ${!enabled};
        return JSON.stringify({
          success: true,
          message: "Clip " + (${enabled} ? "enabled" : "disabled")
        });
      } catch (e) {
        return JSON.stringify({ success: false, error: e.toString() });
      }
    `;
  return await ctx.bridge.executeScript(script);
}

async function replaceClip(ctx: ToolContext, clipId: string, newProjectItemId: string, preserveEffects?: boolean): Promise<any> {
  const keepSettings = preserveEffects !== false;
  const script = `
      try {
        var info = __findClip(${JSON.stringify(clipId)});
        if (!info) return JSON.stringify({ success: false, error: "Clip not found" });
        var newItem = __findProjectItem(${JSON.stringify(newProjectItemId)});
        if (!newItem) newItem = __resolveProjectItem(${JSON.stringify(newProjectItemId)});
        if (!newItem) return JSON.stringify({ success: false, error: "New project item not found" });

        function secondsOf(value) {
          if (value === undefined || value === null) return null;
          if (typeof value === "number") return value;
          if (value.seconds !== undefined) return Number(value.seconds);
          if (value.ticks !== undefined) return __ticksToSeconds(value.ticks);
          return null;
        }
        function timeFromSeconds(seconds) {
          var t = new Time();
          t.seconds = Number(seconds);
          return t;
        }
        function isIntrinsic(name) {
          var n = __canonicalName(name);
          return n === "motion" || n === "opacity" || n === "volume";
        }
        function readMotion(clip) {
          var motion = {};
          if (!clip || !clip.components) return motion;
          for (var ci = 0; ci < clip.components.numItems; ci++) {
            var comp = clip.components[ci];
            for (var pj = 0; pj < comp.properties.numItems; pj++) {
              var pp = comp.properties[pj];
              try {
                if (__namesMatch(pp.displayName, "Opacity")) motion.opacity = pp.getValue();
                else if (__namesMatch(pp.displayName, "Scale")) motion.scale = pp.getValue();
                else if (__namesMatch(pp.displayName, "Rotation")) motion.rotation = pp.getValue();
                else if (__namesMatch(pp.displayName, "Position")) motion.position = pp.getValue();
              } catch (eRead) {}
            }
          }
          return motion;
        }
        function writeMotion(clip, motion) {
          var missing = [];
          function applyNamed(componentName, paramName, value) {
            if (value === undefined) return true;
            var resolved = __resolveClipProperty(clip, componentName, paramName);
            if (!resolved.ok) return false;
            try {
              resolved.property.setValue(__coercePropertyValue(resolved.property, value, resolved.axis), true);
              return true;
            } catch (eSet) { return false; }
          }
          if (!applyNamed("Opacity", "Opacity", motion.opacity)) missing.push("opacity");
          if (!applyNamed("Motion", "Scale", motion.scale)) missing.push("scale");
          if (!applyNamed("Motion", "Rotation", motion.rotation)) missing.push("rotation");
          if (motion.position !== undefined) {
            var resolvedPos = __resolveClipProperty(clip, "Motion", "Position");
            if (!resolvedPos.ok) missing.push("position");
            else {
              try { resolvedPos.property.setValue(motion.position, true); }
              catch (ePos) { missing.push("position"); }
            }
          }
          return missing;
        }
        function readEffects(clip) {
          var extra = [];
          if (!clip || !clip.components) return extra;
          for (var ei = 0; ei < clip.components.numItems; ei++) {
            var component = clip.components[ei];
            var displayName = String(component.displayName);
            if (isIntrinsic(displayName)) continue;
            var props = [];
            try {
              for (var ep = 0; ep < component.properties.numItems; ep++) {
                var prop = component.properties[ep];
                var value = null;
                try { value = prop.getValue(); } catch (eVal) {}
                props.push({ displayName: String(prop.displayName), value: value });
              }
            } catch (eProps) {}
            extra.push({ displayName: displayName, properties: props });
          }
          return extra;
        }

        var clip = info.clip;
        var saved = {
          start: secondsOf(clip.start),
          end: secondsOf(clip.end),
          inPoint: secondsOf(clip.inPoint),
          outPoint: secondsOf(clip.outPoint),
          disabled: !!clip.disabled,
          motion: readMotion(clip),
          effects: readEffects(clip)
        };
        var destTrack = info.track;
        var destIndex = info.trackIndex;
        var destType = info.trackType;
        clip.remove(false, true);
        destTrack.overwriteClip(newItem, saved.start);

        var placed = null;
        var dest = destType === "video" ? info.sequence.videoTracks[destIndex] : info.sequence.audioTracks[destIndex];
        if (!dest) dest = destTrack;
        var bestDelta = null;
        for (var ci = 0; ci < dest.clips.numItems; ci++) {
          var candidate = dest.clips[ci];
          var delta = Math.abs(secondsOf(candidate.start) - saved.start);
          if (bestDelta === null || delta < bestDelta) {
            placed = candidate;
            bestDelta = delta;
          }
        }
        if (!placed) return JSON.stringify({ success: false, error: "Replacement did not create a clip on the destination track", replaced: false });

        var restored = { trim: false, enabled: false, motion: [], effects: [], failedEffects: [] };
        if (${keepSettings ? 'true' : 'false'}) {
          try { if (saved.inPoint !== null) placed.inPoint = timeFromSeconds(saved.inPoint); } catch (eIn) {}
          try { if (saved.outPoint !== null) placed.outPoint = timeFromSeconds(saved.outPoint); } catch (eOut) {}
          try { if (saved.end !== null) placed.end = timeFromSeconds(saved.end); } catch (eEnd) {}
          restored.trim = Math.abs((secondsOf(placed.inPoint) || 0) - (saved.inPoint || 0)) < 0.05
            && Math.abs((secondsOf(placed.outPoint) || 0) - (saved.outPoint || 0)) < 0.05;
          try { placed.disabled = saved.disabled; restored.enabled = !!placed.disabled === saved.disabled; } catch (eEn) {}
          restored.motion = writeMotion(placed, saved.motion);
          if (saved.effects.length) {
            try { app.enableQE(); } catch (eQe) {}
            var qeSeq = __qeSequenceFor(info.sequence);
            var qeTrack = qeSeq ? (destType === "video" ? qeSeq.getVideoTrackAt(destIndex) : qeSeq.getAudioTrackAt(destIndex)) : null;
            var qeClip = qeTrack ? __findQeClipByDomClip(qeTrack, placed) : null;
            for (var fi = 0; fi < saved.effects.length; fi++) {
              var effect = saved.effects[fi];
              var added = false;
              if (qeClip) {
                var qeEffect = destType === "video" ? __findQeNamed("videoEffect", effect.displayName) : __findQeNamed("audioEffect", effect.displayName);
                try {
                  if (qeEffect) {
                    if (destType === "video" && qeClip.addVideoEffect) qeClip.addVideoEffect(qeEffect);
                    else if (qeClip.addAudioEffect) qeClip.addAudioEffect(qeEffect);
                    added = true;
                  }
                } catch (eAdd) { added = false; }
              }
              if (!added) {
                restored.failedEffects.push(effect.displayName);
                continue;
              }
              var appliedProps = [];
              for (var pi = 0; pi < placed.components.numItems; pi++) {
                if (!__namesMatch(placed.components[pi].displayName, effect.displayName)) continue;
                for (var pp = 0; pp < effect.properties.length; pp++) {
                  var want = effect.properties[pp];
                  for (var pj = 0; pj < placed.components[pi].properties.numItems; pj++) {
                    var hostProp = placed.components[pi].properties[pj];
                    if (!__namesMatch(hostProp.displayName, want.displayName)) continue;
                    try { hostProp.setValue(__coercePropertyValue(hostProp, want.value, null), true); appliedProps.push(want.displayName); } catch (eProp) {}
                  }
                }
              }
              restored.effects.push({ name: effect.displayName, properties: appliedProps });
            }
          }
        }

        var coreFailed = ${keepSettings ? 'true' : 'false'} && (!restored.trim || !restored.enabled || restored.motion.length || restored.failedEffects.length);
        return JSON.stringify({
          success: !coreFailed,
          replaced: true,
          preserveEffects: ${keepSettings ? 'true' : 'false'},
          clipId: placed.nodeId,
          oldClipId: ${JSON.stringify(clipId)},
          restored: restored,
          error: coreFailed
            ? ("Clip was replaced but settings were not fully restored: " +
               (!restored.trim ? "trim " : "") +
               (restored.motion.length ? ("motion " + restored.motion.join(",") + " ") : "") +
               (restored.failedEffects.length ? ("effects " + restored.failedEffects.join(",")) : ""))
            : undefined,
          retry: false
        });
      } catch (e) {
        return JSON.stringify({ success: false, error: e.toString() });
      }
    `;
  return await ctx.bridge.executeScript(script);
}

async function getClipProperties(ctx: ToolContext, clipId: string, sequenceId?: string): Promise<any> {
  const script = `
      try {
        var info = __findClip(${JSON.stringify(clipId)}, ${sequenceId ? JSON.stringify(sequenceId) : 'null'});
        if (!info) return JSON.stringify({ success: false, error: ${sequenceId ? JSON.stringify(`Clip not found in sequence: ${sequenceId}`) : '"Clip not found"'} });
        var clip = info.clip;

        // Read back Motion (opacity/scale/rotation/position). Position is stored NORMALIZED
        // (0..1); expose both the raw normalized value and PIXELS (using the sequence frame size)
        // so callers can verify/copy framing without exporting a frame. Only present for video clips.
        var __seqW = 1920, __seqH = 1080;
        try {
          if (info.sequence) {
            if (info.sequence.frameSizeHorizontal) { __seqW = info.sequence.frameSizeHorizontal; __seqH = info.sequence.frameSizeVertical; }
            else { var __ss = info.sequence.getSettings(); if (__ss) { __seqW = __ss.videoFrameWidth; __seqH = __ss.videoFrameHeight; } }
          }
        } catch (e0) {}
        var motion = null;
        try {
          var m = {};
          for (var ci = 0; ci < clip.components.numItems; ci++) {
            var comp = clip.components[ci];
            for (var pj = 0; pj < comp.properties.numItems; pj++) {
              var pp = comp.properties[pj];
              try {
                if (__namesMatch(pp.displayName, "Opacity")) m.opacity = pp.getValue();
                else if (__namesMatch(pp.displayName, "Scale")) m.scale = pp.getValue();
                else if (__namesMatch(pp.displayName, "Rotation")) m.rotation = pp.getValue();
                else if (__namesMatch(pp.displayName, "Position")) {
                  var pv = pp.getValue();
                  if (pv && pv.length >= 2) {
                    m.positionNormalized = { x: pv[0], y: pv[1] };
                    m.position = { x: Math.round(pv[0] * __seqW * 1000) / 1000, y: Math.round(pv[1] * __seqH * 1000) / 1000 };
                  }
                }
              } catch (ep) {}
            }
          }
          motion = m;
        } catch (em) { motion = null; }

        return JSON.stringify({
          success: true,
          properties: {
            name: clip.name,
            start: clip.start.seconds,
            end: clip.end.seconds,
            duration: clip.duration.seconds,
            inPoint: clip.inPoint.seconds,
            outPoint: clip.outPoint.seconds,
            enabled: !clip.disabled,
            trackIndex: info.trackIndex,
            trackType: info.trackType,
            sequenceId: info.sequenceId,
            sequenceName: info.sequenceName,
            frameSize: { width: __seqW, height: __seqH },
            motion: motion,
            speed: clip.getSpeed()
          }
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

async function setClipProperties(ctx: ToolContext, clipId: string, properties: any): Promise<any> {
  // Position is the Motion "Position" property. Callers pass PIXEL coordinates matching the
  // Effect Controls panel (e.g. 960,756 in a 1920x1280 sequence); the API stores it as a
  // NORMALIZED [x,y] (0..1, 0.5,0.5 = frame center), so we divide by the sequence frame size
  // (__seqW/__seqH). Per-property flags surface a silently-failed setValue or a missing Motion
  // property instead of reporting a blanket success.
  const spec = {
    opacity: properties?.opacity === undefined ? null : properties.opacity,
    scale: properties?.scale === undefined ? null : properties.scale,
    rotation: properties?.rotation === undefined ? null : properties.rotation,
    posX: properties?.position?.x === undefined ? null : properties.position.x,
    posY: properties?.position?.y === undefined ? null : properties.position.y,
  };
  const script = `
      try {
        var it = ${JSON.stringify(spec)};
        var info = __findClip(${JSON.stringify(clipId)});
        if (!info) return JSON.stringify({ success: false, error: "Clip not found" });
        var clip = info.clip;
        // Sequence frame size, for converting Position pixels -> normalized. Try frameSize props
        // first, then getSettings(); fall back to 1920x1080 if neither is available.
        var __seqW = 1920, __seqH = 1080;
        try {
          if (info.sequence) {
            if (info.sequence.frameSizeHorizontal) { __seqW = info.sequence.frameSizeHorizontal; __seqH = info.sequence.frameSizeVertical; }
            else { var __ss = info.sequence.getSettings(); if (__ss) { __seqW = __ss.videoFrameWidth; __seqH = __ss.videoFrameHeight; } }
          }
        } catch (e0) {}
        var want = { opacity: it.opacity !== null, scale: it.scale !== null, rotation: it.rotation !== null, position: (it.posX !== null || it.posY !== null) };
        var done = { opacity: false, scale: false, rotation: false, position: false };
        function applyNamed(kind, componentName, paramName, value) {
          var resolved = __resolveClipProperty(clip, componentName, paramName);
          if (!resolved.ok) return false;
          try {
            resolved.property.setValue(__coercePropertyValue(resolved.property, value, resolved.axis), true);
            return true;
          } catch (eSet) { return false; }
        }
        if (want.opacity) done.opacity = applyNamed("opacity", "Opacity", "Opacity", it.opacity);
        if (want.scale) done.scale = applyNamed("scale", "Motion", "Scale", it.scale);
        if (want.rotation) done.rotation = applyNamed("rotation", "Motion", "Rotation", it.rotation);
        if (want.position) {
          var resolvedPos = __resolveClipProperty(clip, "Motion", "Position");
          if (resolvedPos.ok) {
            try {
              var __cur = [0.5, 0.5];
              try { __cur = resolvedPos.property.getValue(); } catch (ep) {}
              var __nx = it.posX !== null ? (it.posX / __seqW) : __cur[0];
              var __ny = it.posY !== null ? (it.posY / __seqH) : __cur[1];
              resolvedPos.property.setValue([__nx, __ny], true);
              done.position = true;
            } catch (ePos) {}
          }
        }
        var missing = [];
        if (want.opacity && !done.opacity) missing.push("opacity");
        if (want.scale && !done.scale) missing.push("scale");
        if (want.rotation && !done.rotation) missing.push("rotation");
        if (want.position && !done.position) missing.push("position");
        return JSON.stringify({
          success: (missing.length === 0),
          applied: done,
          message: missing.length ? ("properties not applied: " + missing.join(", ")) : "Clip properties updated"
        });
      } catch (e) {
        return JSON.stringify({ success: false, error: e.toString() });
      }
    `;
  return await ctx.bridge.executeScript(script);
}

async function setClipPropertiesBatch(ctx: ToolContext, items: Array<{ clipId: string; properties: any }>): Promise<any> {
  const specs = items.map(it => ({
    clipId: it.clipId,
    opacity: it.properties?.opacity === undefined ? null : it.properties.opacity,
    scale: it.properties?.scale === undefined ? null : it.properties.scale,
    rotation: it.properties?.rotation === undefined ? null : it.properties.rotation,
    posX: it.properties?.position?.x === undefined ? null : it.properties.position.x,
    posY: it.properties?.position?.y === undefined ? null : it.properties.position.y,
  }));
  const script = `
      try {
        var specs = ${JSON.stringify(specs)};
        var results = [];
        for (var n = 0; n < specs.length; n++) {
          var it = specs[n];
          var r = { index: n, clipId: it.clipId, success: false };
          try {
            var info = __findClip(it.clipId);
            if (!info) { r.error = "Clip not found"; results.push(r); continue; }
            var clip = info.clip;
            // Sequence frame size for converting Position pixels -> normalized (see single variant).
            var __seqW = 1920, __seqH = 1080;
            try {
              if (info.sequence) {
                if (info.sequence.frameSizeHorizontal) { __seqW = info.sequence.frameSizeHorizontal; __seqH = info.sequence.frameSizeVertical; }
                else { var __ss = info.sequence.getSettings(); if (__ss) { __seqW = __ss.videoFrameWidth; __seqH = __ss.videoFrameHeight; } }
              }
            } catch (e0) {}
            // Track which requested properties we actually FOUND and SET, so a silently-failed
            // setValue (or a Motion property that isn't present) surfaces instead of a false success.
            var want = { opacity: it.opacity !== null, scale: it.scale !== null, rotation: it.rotation !== null, position: (it.posX !== null || it.posY !== null) };
            var done = { opacity: false, scale: false, rotation: false, position: false };
            function applyNamed(componentName, paramName, value) {
              var resolved = __resolveClipProperty(clip, componentName, paramName);
              if (!resolved.ok) return false;
              try {
                resolved.property.setValue(__coercePropertyValue(resolved.property, value, resolved.axis), true);
                return true;
              } catch (eSet) { return false; }
            }
            if (want.opacity) done.opacity = applyNamed("Opacity", "Opacity", it.opacity);
            if (want.scale) done.scale = applyNamed("Motion", "Scale", it.scale);
            if (want.rotation) done.rotation = applyNamed("Motion", "Rotation", it.rotation);
            if (want.position) {
              var resolvedPos = __resolveClipProperty(clip, "Motion", "Position");
              if (resolvedPos.ok) {
                try {
                  var __cur = [0.5, 0.5];
                  try { __cur = resolvedPos.property.getValue(); } catch (ep) {}
                  var __nx = it.posX !== null ? (it.posX / __seqW) : __cur[0];
                  var __ny = it.posY !== null ? (it.posY / __seqH) : __cur[1];
                  resolvedPos.property.setValue([__nx, __ny], true);
                  done.position = true;
                } catch (ePos) {}
              }
            }
            var missing = [];
            if (want.opacity && !done.opacity) missing.push("opacity");
            if (want.scale && !done.scale) missing.push("scale");
            if (want.rotation && !done.rotation) missing.push("rotation");
            if (want.position && !done.position) missing.push("position");
            r.applied = done;
            r.success = (missing.length === 0);
            if (missing.length) r.error = "properties not applied: " + missing.join(", ");
          } catch (e) {
            r.error = e.toString();
          }
          results.push(r);
        }
        var applied = 0;
        for (var k = 0; k < results.length; k++) { if (results[k].success) applied++; }
        return JSON.stringify({
          success: (applied === specs.length && specs.length > 0),
          applied: applied,
          total: specs.length,
          results: results,
          error: applied === specs.length ? undefined : "properties not applied on " + (specs.length - applied) + " clip(s)"
        });
      } catch (e) {
        return JSON.stringify({ success: false, error: e.toString() });
      }
    `;
  return await ctx.bridge.executeScript(script, 300000);
}

async function getPlayheadPosition(ctx: ToolContext, sequenceId: string): Promise<any> {
  const script = `
      try {
        var sequence = __findSequence(${JSON.stringify(sequenceId)});
        if (!sequence) return JSON.stringify({ success: false, error: "Sequence not found by id: " + ${JSON.stringify(sequenceId)} });
        var pos = sequence.getPlayerPosition();
        return JSON.stringify({
          success: true,
          position: __ticksToSeconds(pos.ticks),
          ticks: pos.ticks
        });
      } catch (e) {
        return JSON.stringify({ success: false, error: e.toString() });
      }
    `;
  return await ctx.bridge.executeScript(script);
}

async function setPlayheadPosition(ctx: ToolContext, sequenceId: string, time: number): Promise<any> {
  const script = `
      try {
        var sequence = __findSequence(${JSON.stringify(sequenceId)});
        if (!sequence) return JSON.stringify({ success: false, error: "Sequence not found by id: " + ${JSON.stringify(sequenceId)} });
        var ticks = __secondsToTicks(${time});
        sequence.setPlayerPosition(ticks);
        return JSON.stringify({
          success: true,
          message: "Playhead position set",
          time: ${time}
        });
      } catch (e) {
        return JSON.stringify({ success: false, error: e.toString() });
      }
    `;
  return await ctx.bridge.executeScript(script);
}

async function getSelectedClips(ctx: ToolContext, sequenceId: string): Promise<any> {
  const script = `
      try {
        var sequence = __findSequence(${JSON.stringify(sequenceId)});
        if (!sequence) return JSON.stringify({ success: false, error: "Sequence not found by id: " + ${JSON.stringify(sequenceId)} });
        var selection = sequence.getSelection();
        var clips = [];
        for (var i = 0; i < selection.length; i++) {
          var clip = selection[i];
          clips.push({
            nodeId: clip.nodeId,
            name: clip.name,
            start: clip.start.seconds,
            end: clip.end.seconds,
            duration: clip.duration.seconds,
            mediaType: clip.mediaType
          });
        }
        return JSON.stringify({
          success: true,
          clips: clips,
          count: clips.length
        });
      } catch (e) {
        return JSON.stringify({ success: false, error: e.toString() });
      }
    `;
  return await ctx.bridge.executeScript(script);
}

async function detectSceneEdits(ctx: ToolContext, sequenceId: string, action?: string, applyCutsToLinkedAudio?: boolean, sensitivity?: string, allowUnsafeSynchronous?: boolean): Promise<any> {
  const actionVal = action || 'CreateMarkers';
  const audioVal = applyCutsToLinkedAudio !== false;
  const sensitivityVal = sensitivity || 'Medium';
  const script = `
      try {
        var sequence = __findSequence(${JSON.stringify(sequenceId)});
        if (!sequence) return JSON.stringify({ success: false, error: "Sequence not found by id: " + ${JSON.stringify(sequenceId)} });
        if (!sequence.performSceneEditDetectionOnSelection) {
          return JSON.stringify({ success: false, error: "performSceneEditDetectionOnSelection API unavailable" });
        }
        if (${allowUnsafeSynchronous === true ? 'false' : 'true'}) {
          return JSON.stringify({
            success: true,
            performed: false,
            guarded: true,
            reason: "Premiere performSceneEditDetectionOnSelection blocks CEP in this bridge. Pass allowUnsafeSynchronous:true only when a human is prepared to wait or restart the panel.",
            action: ${JSON.stringify(actionVal)},
            sensitivity: ${JSON.stringify(sensitivityVal)}
          });
        }
        sequence.performSceneEditDetectionOnSelection(${JSON.stringify(actionVal)}, ${audioVal}, ${JSON.stringify(sensitivityVal)});
        return JSON.stringify({
          success: true,
          message: "Scene edit detection performed",
          action: ${JSON.stringify(actionVal)},
          sensitivity: ${JSON.stringify(sensitivityVal)}
        });
      } catch (e) {
        return JSON.stringify({ success: false, error: e.toString() });
      }
    `;
  return await ctx.bridge.executeScript(script);
}
