/**
 * Sequence creation, settings, active sequence, work area, and captions.
 *
 * Each entry declares the tool an agent sees and the handler that runs it,
 * so the two cannot drift apart. Handlers reach Premiere through ToolContext.
 */
import { z } from 'zod';
import type { ToolContext, ToolModule } from '../context.js';

export const sequenceTools: ToolModule[] = [
  {
    name: 'create_sequence',
    description: 'Creates a new sequence from a specific installed .sqpreset file without opening Premiere\'s New Sequence dialog. For footage-driven edits, prefer create_sequence_from_clips; for an empty copy of an existing sequence, use duplicate_sequence with clearContents=true.',
    inputSchema: z.object({
      name: z.string().describe('The name for the new sequence'),
      presetPath: z.string().describe('Absolute path to an installed Premiere .sqpreset sequence preset. Required so Premiere does not show the native New Sequence dialog.')
    }),
    run: (ctx, args) => createSequence(ctx, args.name, args.presetPath),
  },
  {
    name: 'duplicate_sequence',
    description: 'Creates a copy of an existing sequence with a new name. Set clearContents=true to get an EMPTY copy that inherits the source sequence\'s exact settings (frame rate, resolution, track layout) — the reliable way to auto-create a correctly-specced blank target, since create_sequence ignores frame rate.',
    inputSchema: z.object({
      sequenceId: z.string().describe('The ID of the sequence to duplicate'),
      newName: z.string().describe('The name for the new sequence copy'),
      clearContents: z.boolean().optional().describe('When true, remove all clips from the copy so it is empty but keeps the source\'s frame rate/resolution/track layout. Default false (full copy).')
    }),
    run: (ctx, args) => duplicateSequence(ctx, args.sequenceId, args.newName, args.clearContents),
  },
  {
    name: 'delete_sequence',
    description: 'Deletes a sequence from the project.',
    inputSchema: z.object({
      sequenceId: z.string().describe('The ID of the sequence to delete')
    }),
    run: (ctx, args) => deleteSequence(ctx, args.sequenceId),
  },
  {
    name: 'get_sequence_settings',
    description: 'Gets the settings for a sequence (resolution, framerate, etc.).',
    inputSchema: z.object({
      sequenceId: z.string().describe('The ID of the sequence')
    }),
    run: (ctx, args) => getSequenceSettings(ctx, args.sequenceId),
  },
  {
    name: 'set_sequence_settings',
    description: 'Updates sequence settings. Applies width, height, frameRate and pixelAspectRatio, reads the values back afterwards, and reports any field Premiere accepted but did not actually change. Frame size CAN be changed after creation, contrary to an earlier note in this codebase.',
    inputSchema: z.object({
      sequenceId: z.string().describe('The ID of the sequence'),
      settings: z.object({
        width: z.number().optional().describe('Frame width in pixels'),
        height: z.number().optional().describe('Frame height in pixels'),
        frameRate: z.number().optional().describe('Frames per second, e.g. 23.976, 25, 30'),
        // Premiere stores this as an "N:M" string. A bare number is converted to the
        // nearest exact ratio (1.5 becomes "3:2"), but the string form is accepted
        // directly so callers can name a ratio Premiere already uses, such as "10:11".
        pixelAspectRatio: z.union([z.number(), z.string()]).optional()
          .describe('Pixel aspect ratio, either a number (1, 1.5, 2) or an "N:M" string ("1:1", "4:3", "10:11")')
      }).describe('Settings to update')
    }),
    run: (ctx, args) => setSequenceSettings(ctx, args.sequenceId, args.settings),
  },
  {
    name: 'set_active_sequence',
    description: 'Sets the active sequence in the project.',
    inputSchema: z.object({
      sequenceId: z.string().describe('The ID of the sequence to activate')
    }),
    run: (ctx, args) => setActiveSequence(ctx, args.sequenceId),
  },
  {
    name: 'get_active_sequence',
    description: 'Gets information about the currently active sequence.',
    inputSchema: z.object({}),
    run: (ctx) => getActiveSequence(ctx),
  },
  {
    name: 'auto_reframe_sequence',
    description: 'Automatically reframes a sequence to a new aspect ratio using AI-powered motion tracking.',
    inputSchema: z.object({
      sequenceId: z.string().describe('The ID of the sequence to reframe'),
      numerator: z.number().describe('Aspect ratio numerator (e.g., 9 for 9:16)'),
      denominator: z.number().describe('Aspect ratio denominator (e.g., 16 for 9:16)'),
      motionPreset: z.enum(['slower', 'default', 'faster']).optional().describe('Motion tracking speed preset'),
      newName: z.string().optional().describe('Name for the reframed sequence')
    }),
    run: (ctx, args) => autoReframeSequence(ctx, args.sequenceId, args.numerator, args.denominator, args.motionPreset, args.newName),
  },
  {
    name: 'create_subsequence',
    description: 'Creates a subsequence from the in/out points of a sequence.',
    inputSchema: z.object({
      sequenceId: z.string().describe('The ID of the source sequence'),
      ignoreTrackTargeting: z.boolean().optional().describe('Whether to ignore track targeting (default: false)')
    }),
    run: (ctx, args) => createSubsequence(ctx, args.sequenceId, args.ignoreTrackTargeting),
  },
  {
    name: 'set_sequence_in_out_points',
    description: 'Sets the in and/or out points on a sequence timeline.',
    inputSchema: z.object({
      sequenceId: z.string().describe('The ID of the sequence'),
      inPoint: z.number().optional().describe('The in point in seconds'),
      outPoint: z.number().optional().describe('The out point in seconds')
    }),
    run: (ctx, args) => setSequenceInOutPoints(ctx, args.sequenceId, args.inPoint, args.outPoint),
  },
  {
    name: 'get_sequence_in_out_points',
    description: 'Gets the in and out points of a sequence timeline.',
    inputSchema: z.object({
      sequenceId: z.string().describe('The ID of the sequence')
    }),
    run: (ctx, args) => getSequenceInOutPoints(ctx, args.sequenceId),
  },
  {
    name: 'set_work_area',
    description: 'Sets the work area in/out points for a sequence.',
    inputSchema: z.object({
      sequenceId: z.string().describe('The ID of the sequence'),
      inPoint: z.number().describe('The in point in seconds'),
      outPoint: z.number().describe('The out point in seconds')
    }),
    run: (ctx, args) => setWorkArea(ctx, args.sequenceId, args.inPoint, args.outPoint),
  },
  {
    name: 'get_work_area',
    description: 'Gets the work area in/out points for a sequence.',
    inputSchema: z.object({
      sequenceId: z.string().describe('The ID of the sequence')
    }),
    run: (ctx, args) => getWorkArea(ctx, args.sequenceId),
  },
  {
    name: 'create_caption_track',
    description: 'Creates a caption track on a sequence from an imported caption/subtitle file (e.g. an .srt imported via import_media). Pass the SRT project item ID directly.',
    inputSchema: z.object({
      sequenceId: z.string().describe('The ID of the sequence'),
      projectItemId: z.string().describe('The ID of the caption file project item (e.g. an imported .srt)'),
      startTime: z.number().optional().describe('Offset in seconds from the start of the sequence. Defaults to 0.'),
      captionFormat: z.string().optional().describe('Optional caption format. Omit for subtitles (default, correct for .srt). Accepts: "subtitle", "608", "708", "teletext", "open ebu", "op42", "op47".')
    }),
    run: (ctx, args) => createCaptionTrack(ctx, args.sequenceId, args.projectItemId, args.startTime, args.captionFormat),
  },
  {
    name: 'read_sequence_captions',
    description: 'Reads caption tracks of a sequence, returning each caption clip as { start, end, text } in seconds. IMPORTANT: Premiere Pro exposes no caption-read API in its scripting DOM, so in practice this returns trackCount:0 / captions:[] even when the sequence HAS a working caption track. The response field captionReadSupported:false (plus note) signals this — a 0 result does NOT mean the sequence has no captions. To read cue text/timing, parse the source .srt file directly instead.',
    inputSchema: z.object({
      sequenceId: z.string().optional().describe('Optional sequence ID. Defaults to the active sequence.')
    }),
    run: (ctx, args) => readSequenceCaptions(ctx, args.sequenceId),
  },
];

async function createSequence(ctx: ToolContext, name: string, presetPath: string): Promise<any> {
  try {
    const result: any = await ctx.bridge.createSequence(name, presetPath);
    if (result?.success === false) {
      return {
        ...result,
        sequenceName: result.sequenceName || name
      };
    }

    return {
      success: true,
      message: `Sequence "${name}" created successfully`,
      sequenceName: name,
      ...result
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    const timedOut = /timeout|timed out/i.test(message);
    return {
      success: false,
      error: `Failed to create sequence: ${message}`,
      sequenceName: name,
      ...(timedOut ? {
        warning: 'Premiere may still create the sequence after this timeout. Wait for the bridge to become responsive, then run list_sequences to verify before retrying. The server intentionally does not run automatic recovery after a timeout because that can wedge the CEP bridge on Windows.'
      } : {})
    };
  }
}

async function duplicateSequence(ctx: ToolContext, sequenceId: string, newName: string, clearContents = false): Promise<any> {
  const safeName = JSON.stringify(newName);
  const script = `
      try {
        var originalSeq = __findSequence(${JSON.stringify(sequenceId)});
        if (!originalSeq) return JSON.stringify({ success: false, error: "Sequence not found" });

        // In current Premiere, Sequence.clone() returns the clone's ProjectItem (NOT a Sequence),
        // which has a settable .name but no .sequenceID / .videoTracks. Resolve the real Sequence
        // object via getSequence() before touching tracks; handle builds that return a Sequence too.
        // Noted before the clone so the fallback below can tell a newly created
        // sequence apart from the one the user already had open.
        var priorActiveId = null;
        try {
          priorActiveId = app.project.activeSequence ? String(app.project.activeSequence.sequenceID) : null;
        } catch (ePriorActive) {}

        var cloneResult = originalSeq.clone();
        var newItem = null, newSeqObj = null;
        if (cloneResult) {
          if (typeof cloneResult.getSequence === "function") {
            newItem = cloneResult;
            try { newSeqObj = cloneResult.getSequence(); } catch (_) {}
          } else if (cloneResult.videoTracks) {
            newSeqObj = cloneResult;
          }
        }
        // Fallback: a freshly cloned sequence usually becomes the active one.
        //
        // Only accept it once it is demonstrably new — a different sequence from
        // both the clone source and whatever was active before the clone ran.
        // Taken unconditionally, this clause hands back the user's own open
        // timeline whenever clone() returns something unexpected or
        // getSequence() throws, and everything below then renames it and, with
        // clearContents, removes every clip from it — reported as success.
        if (!newSeqObj) {
          try {
            var activeCandidate = app.project.activeSequence;
            var activeCandidateId = activeCandidate ? String(activeCandidate.sequenceID) : null;
            if (activeCandidateId &&
                activeCandidateId !== String(originalSeq.sequenceID) &&
                activeCandidateId !== priorActiveId) {
              newSeqObj = activeCandidate;
            }
          } catch (eActiveFallback) {}
        }

        // Refuse rather than guess. Clearing a sequence that may not be the copy
        // is irreversible, so an unresolved copy has to stop the operation.
        if (${clearContents ? 'true' : 'false'} && !newSeqObj) {
          return JSON.stringify({
            success: false,
            error: "The sequence was duplicated but the copy could not be identified, so clearContents was not run. Nothing was cleared. Find the new sequence with list_sequences and clear it explicitly.",
            duplicated: true,
            cleared: false
          });
        }

        // Rename on the ProjectItem (visible in the project panel) AND the Sequence object.
        if (newItem) { try { newItem.name = ${safeName}; } catch (_) {} }
        if (newSeqObj) { try { newSeqObj.name = ${safeName}; } catch (_) {} }

        // clearContents=true → produce an EMPTY sequence that inherits the source's exact
        // settings (frame rate, resolution, track layout). This is the reliable way to auto-create
        // a correctly-specced target because create_sequence ignores frameRate. Remove every clip
        // from all tracks (iterate backwards; remove() shifts indices).
        var clearedClips = 0;
        if (${clearContents ? 'true' : 'false'} && newSeqObj) {
          function __clearTracks(tracks) {
            if (!tracks) return;
            for (var t = 0; t < tracks.numTracks; t++) {
              var tr = tracks[t];
              if (!tr || !tr.clips) continue;
              for (var ci = tr.clips.numItems - 1; ci >= 0; ci--) {
                try { tr.clips[ci].remove(false, false); clearedClips++; } catch (_) {}
              }
            }
          }
          __clearTracks(newSeqObj.videoTracks);
          __clearTracks(newSeqObj.audioTracks);
        }

        // Sequence.name does NOT always propagate to the project panel — if clone() didn't give us
        // the ProjectItem directly, find the matching one by sequenceID and rename it too.
        function __findItemForSequence(parent, seqId) {
          if (!parent || !parent.children) return null;
          for (var i = 0; i < parent.children.numItems; i++) {
            var item = parent.children[i];
            if (!item) continue;
            try {
              var seq = item.getSequence && item.getSequence();
              if (seq && seq.sequenceID === seqId) return item;
            } catch (_) { /* not a sequence-bearing item */ }
            if (item.type === 2 /* BIN */) {
              var nested = __findItemForSequence(item, seqId);
              if (nested) return nested;
            }
          }
          return null;
        }

        var renamedAtItem = false;
        if (newItem) {
          renamedAtItem = true;
        } else if (newSeqObj) {
          newItem = __findItemForSequence(app.project.rootItem, newSeqObj.sequenceID);
          if (newItem) {
            try { newItem.name = ${safeName}; renamedAtItem = true; } catch (_) { /* fall through */ }
          }
        }

        return JSON.stringify({
          success: true,
          originalSequenceId: ${JSON.stringify(sequenceId)},
          newSequenceId: newSeqObj ? newSeqObj.sequenceID : null,
          newName: ${safeName},
          newProjectItemId: newItem ? newItem.nodeId : null,
          renamedAtProjectItem: renamedAtItem,
          clearedClips: clearedClips
        });
      } catch (e) {
        return JSON.stringify({ success: false, error: e.toString() });
      }
    `;

  return await ctx.bridge.executeScript(script);
}

async function readSequenceCaptions(ctx: ToolContext, sequenceId?: string): Promise<any> {
  const seqArg = sequenceId ? JSON.stringify(sequenceId) : 'null';
  const script = `
      try {
        // A supplied ID that does not resolve must fail. Falling back to the
        // active sequence answers a different question and reports that
        // sequence's identity as though it were the one asked for.
        var sequence = null;
        if (${seqArg}) {
          sequence = __findSequence(${seqArg});
          if (!sequence) {
            return JSON.stringify({
              success: false,
              error: "Sequence not found by id: " + ${seqArg} + ". Use list_sequences or get_active_sequence to obtain a valid sequence ID."
            });
          }
        } else {
          sequence = app.project.activeSequence;
        }
        if (!sequence) return JSON.stringify({ success: false, error: "No active sequence" });

        // Premiere caption tracks live alongside video/audio tracks. Different
        // Premiere versions expose them differently:
        //   - sequence.getCaptionTracks() (newer)
        //   - sequence.captionTracks (some builds)
        //   - sequence.videoTracks[i] with isCaptioning style flag
        // Try in that order, return whatever yields {start, end, text} clips.

        var tracks = [];
        try {
          if (sequence.getCaptionTracks) {
            tracks = sequence.getCaptionTracks();
          } else if (sequence.captionTracks) {
            tracks = sequence.captionTracks;
          }
        } catch (_) { /* fall through to track scan */ }

        // Fallback: scan video tracks for caption clip data
        if ((!tracks || tracks.length === 0) && sequence.videoTracks) {
          for (var v = 0; v < sequence.videoTracks.numTracks; v++) {
            var t = sequence.videoTracks[v];
            if (t && (t.isCaption || t.captionTrack || (t.name && /caption/i.test(t.name)))) {
              tracks.push(t);
            }
          }
        }

        var trackCount = tracks ? tracks.length : 0;
        var output = [];

        for (var i = 0; i < trackCount; i++) {
          var trk = tracks[i];
          if (!trk) continue;
          var clips = trk.clips || trk.captions || [];
          var clipCount = clips.numItems !== undefined ? clips.numItems : (clips.length || 0);
          for (var c = 0; c < clipCount; c++) {
            var clip = clips[c];
            if (!clip) continue;
            var startSec = null;
            var endSec = null;
            try {
              if (clip.start && clip.start.seconds !== undefined) startSec = clip.start.seconds;
              else if (clip.start && clip.start.ticks) startSec = parseFloat(clip.start.ticks) / 254016000000.0;
              else if (typeof clip.startTime === 'number') startSec = clip.startTime;
            } catch (_) {}
            try {
              if (clip.end && clip.end.seconds !== undefined) endSec = clip.end.seconds;
              else if (clip.end && clip.end.ticks) endSec = parseFloat(clip.end.ticks) / 254016000000.0;
              else if (typeof clip.endTime === 'number') endSec = clip.endTime;
            } catch (_) {}

            var text = "";
            try {
              if (typeof clip.text === 'string') text = clip.text;
              else if (clip.captionText) text = clip.captionText;
              else if (clip.name) text = clip.name;
            } catch (_) {}

            output.push({
              trackIndex: i,
              start: startSec,
              end: endSec,
              text: text
            });
          }
        }

        // Premiere Pro exposes NO caption-read API in its scripting DOM (confirmed
        // Adobe limitation — see Bruce Bullis 2021/2023 and the UXP CaptionTrack
        // thread, 2025). createCaptionTrack can WRITE a caption track from an SRT,
        // but there is no read counterpart: no sequence.captionTracks, no
        // getCaptionTracks(), and caption tracks are not surfaced in videoTracks or
        // the QE DOM. So trackCount will essentially always be 0 here. Report that
        // honestly via captionReadSupported + note instead of implying "no captions".
        var captionReadSupported = trackCount > 0;
        var note = captionReadSupported ? "" : "Premiere Pro exposes no caption-read API in its scripting DOM, so caption tracks cannot be enumerated or read back from a sequence (Adobe limitation: createCaptionTrack can write a track, but there is no read counterpart). trackCount:0 does NOT mean the sequence has no captions — it may have a working, rendering caption track that is simply unreadable via script. To recover cue text/timing, parse the source .srt file off disk instead.";

        return JSON.stringify({
          success: true,
          sequenceId: sequence.sequenceID,
          sequenceName: sequence.name,
          captionReadSupported: captionReadSupported,
          trackCount: trackCount,
          captionCount: output.length,
          captions: output,
          note: note
        });
      } catch (e) {
        return JSON.stringify({ success: false, error: e.toString() });
      }
    `;
  return await ctx.bridge.executeScript(script);
}

async function deleteSequence(ctx: ToolContext, sequenceId: string): Promise<any> {
  const script = `
      try {
        var sequence = __findSequence(${JSON.stringify(sequenceId)});
        if (!sequence) return JSON.stringify({ success: false, error: "Sequence not found" });
        var sequenceName = sequence.name;
        app.project.deleteSequence(sequence);
        return JSON.stringify({
          success: true,
          message: "Sequence deleted successfully",
          deletedSequenceId: ${JSON.stringify(sequenceId)},
          deletedSequenceName: sequenceName
        });
      } catch (e) {
        return JSON.stringify({ success: false, error: e.toString() });
      }
    `;

  return await ctx.bridge.executeScript(script);
}

async function getSequenceSettings(ctx: ToolContext, sequenceId: string): Promise<any> {
  const script = `
      try {
        var sequence = __findSequence(${JSON.stringify(sequenceId)});
        if (!sequence) {
          return JSON.stringify({
            success: false,
            error: "Sequence not found by id: " + ${JSON.stringify(sequenceId)}
          });
        }
        var settings = sequence.getSettings();
        return JSON.stringify({
          success: true,
          settings: {
            name: sequence.name,
            sequenceID: sequence.sequenceID,
            width: settings.videoFrameWidth,
            height: settings.videoFrameHeight,
            timebase: sequence.timebase,
            videoDisplayFormat: settings.videoDisplayFormat,
            audioChannelType: settings.audioChannelType,
            audioSampleRate: settings.audioSampleRate
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

async function setSequenceSettings(ctx: ToolContext, sequenceId: string, settings: any): Promise<any> {
  const script = `
      try {
        var sequence = __findSequence(${JSON.stringify(sequenceId)});
        if (!sequence) return JSON.stringify({ success: false, error: "Sequence not found by id: " + ${JSON.stringify(sequenceId)} });
        // This used to compare width and height, write nothing at all, and report
        // "Requested sequence settings already match the active Premiere sequence" —
        // two falsehoods in one line, since frameRate and pixelAspectRatio were never
        // even looked at, and the sequence operated on is the resolved one rather than
        // whatever is active. It also refused any frame size change on the grounds that
        // Premiere cannot do it, which is untrue: setSettings() resizes a sequence after
        // creation, verified live by taking one from 1920x1080 to 1280x720.
        var requested = ${JSON.stringify(settings || {})};
        if (!sequence.getSettings || !sequence.setSettings) {
          return JSON.stringify({ success: false, error: "Sequence settings API unavailable on this build" });
        }

        function readSettings(seq) {
          var g = seq.getSettings();
          var fps = null;
          try { fps = 254016000000 / parseInt(String(g.videoFrameRate.ticks), 10); } catch (eFps) {}
          return {
            width: Number(g.videoFrameWidth),
            height: Number(g.videoFrameHeight),
            frameRate: fps,
            pixelAspectRatio: String(g.videoPixelAspectRatio)
          };
        }

        var before = readSettings(sequence);
        var settingsObject = sequence.getSettings();
        var applied = [];

        if (requested.width !== undefined) { settingsObject.videoFrameWidth = Number(requested.width); applied.push("width"); }
        if (requested.height !== undefined) { settingsObject.videoFrameHeight = Number(requested.height); applied.push("height"); }

        if (requested.frameRate !== undefined) {
          // videoFrameRate is a Time expressed as ticks per frame, and it has to be
          // assigned as a STRING of ticks. Assigning the number is accepted without
          // complaint and then corrupts the value — the field reads back as 2^63 ticks,
          // which works out to a frame rate of 2.75e-08.
          settingsObject.videoFrameRate = String(Math.round(254016000000 / Number(requested.frameRate)));
          applied.push("frameRate");
        }

        if (requested.pixelAspectRatio !== undefined) {
          // Stored as an "N:M" string; a number throws "Illegal Parameter type".
          var parValue = requested.pixelAspectRatio;
          var parText = String(parValue);
          if (parText.indexOf(":") === -1) {
            var parNumber = Number(parValue);
            if (!isFinite(parNumber) || parNumber <= 0) {
              return JSON.stringify({ success: false, error: "pixelAspectRatio must be a positive number or an \\"N:M\\" ratio string." });
            }
            var denominator = 1000;
            var numerator = Math.round(parNumber * denominator);
            var a = numerator, b = denominator;
            while (b) { var t = a % b; a = b; b = t; }
            parText = (numerator / a) + ":" + (denominator / a);
          }
          settingsObject.videoPixelAspectRatio = parText;
          applied.push("pixelAspectRatio");
        }

        if (!applied.length) {
          return JSON.stringify({
            success: true,
            message: "No recognised settings were supplied, so nothing was changed",
            sequenceId: sequence.sequenceID,
            sequenceName: sequence.name,
            settings: before,
            supported: ["width", "height", "frameRate", "pixelAspectRatio"],
            changed: false
          });
        }

        try {
          sequence.setSettings(settingsObject);
        } catch (eApply) {
          return JSON.stringify({
            success: false,
            error: "Premiere rejected the settings: " + eApply.toString(),
            sequenceId: sequence.sequenceID,
            sequenceName: sequence.name,
            attempted: applied,
            settings: before
          });
        }

        // Read back rather than trusting the write: several of these fields accept an
        // assignment and silently keep their old value.
        var after = readSettings(sequence);
        var unchanged = [];
        for (var ai = 0; ai < applied.length; ai++) {
          var field = applied[ai];
          if (String(after[field]) === String(before[field]) && String(requested[field]) !== String(before[field])) {
            unchanged.push(field);
          }
        }

        return JSON.stringify({
          success: unchanged.length === 0,
          error: unchanged.length ? "Premiere accepted the assignment but did not apply: " + unchanged.join(", ") : undefined,
          message: unchanged.length ? undefined : "Sequence settings applied",
          sequenceId: sequence.sequenceID,
          sequenceName: sequence.name,
          applied: applied,
          before: before,
          after: after,
          changed: true
        });
      } catch (e) {
        return JSON.stringify({ success: false, error: e.toString() });
      }
    `;
  return await ctx.bridge.executeScript(script);
}

async function setWorkArea(ctx: ToolContext, sequenceId: string, inPoint: number, outPoint: number): Promise<any> {
  const script = `
      try {
        var sequence = __findSequence(${JSON.stringify(sequenceId)});
        if (!sequence) return JSON.stringify({ success: false, error: "Sequence not found by id: " + ${JSON.stringify(sequenceId)} });
        sequence.setWorkAreaInPoint(__secondsToTicks(${inPoint}));
        sequence.setWorkAreaOutPoint(__secondsToTicks(${outPoint}));
        return JSON.stringify({
          success: true,
          message: "Work area set",
          inPoint: ${inPoint},
          outPoint: ${outPoint}
        });
      } catch (e) {
        return JSON.stringify({ success: false, error: e.toString() });
      }
    `;
  return await ctx.bridge.executeScript(script);
}

async function getWorkArea(ctx: ToolContext, sequenceId: string): Promise<any> {
  const script = `
      try {
        var sequence = __findSequence(${JSON.stringify(sequenceId)});
        if (!sequence) return JSON.stringify({ success: false, error: "Sequence not found by id: " + ${JSON.stringify(sequenceId)} });
        var inTime = sequence.getWorkAreaInPointAsTime();
        var outTime = sequence.getWorkAreaOutPointAsTime();
        return JSON.stringify({
          success: true,
          inPoint: inTime.seconds,
          outPoint: outTime.seconds
        });
      } catch (e) {
        return JSON.stringify({ success: false, error: e.toString() });
      }
    `;
  return await ctx.bridge.executeScript(script);
}

async function setActiveSequence(ctx: ToolContext, sequenceId: string): Promise<any> {
  const script = `
      try {
        var seq = __findSequence(${JSON.stringify(sequenceId)});
        if (!seq) return JSON.stringify({ success: false, error: "Sequence not found" });
        app.project.openSequence(seq.sequenceID);
        return JSON.stringify({
          success: true,
          message: "Active sequence set",
          sequenceId: seq.sequenceID,
          name: seq.name
        });
      } catch (e) {
        return JSON.stringify({ success: false, error: e.toString() });
      }
    `;
  return await ctx.bridge.executeScript(script);
}

async function getActiveSequence(ctx: ToolContext): Promise<any> {
  const script = `
      try {
        var seq = app.project.activeSequence;
        if (!seq) return JSON.stringify({ success: false, error: "No active sequence" });
        return JSON.stringify({
          success: true,
          id: seq.sequenceID,
          name: seq.name,
          duration: __ticksToSeconds(seq.end),
          videoTrackCount: seq.videoTracks.numTracks,
          audioTrackCount: seq.audioTracks.numTracks
        });
      } catch (e) {
        return JSON.stringify({ success: false, error: e.toString() });
      }
    `;
  return await ctx.bridge.executeScript(script);
}

async function autoReframeSequence(ctx: ToolContext, sequenceId: string, numerator: number, denominator: number, motionPreset?: string, newName?: string): Promise<any> {
  const preset = motionPreset || 'default';
  const script = `
      try {
        var sequence = __findSequence(${JSON.stringify(sequenceId)});
        if (!sequence) return JSON.stringify({ success: false, error: "Sequence not found by id: " + ${JSON.stringify(sequenceId)} });
        var reframedName = ${newName ? JSON.stringify(newName) : 'sequence.name + " Reframed"'};
        sequence.autoReframeSequence(${numerator}, ${denominator}, ${JSON.stringify(preset)}, reframedName, false);
        return JSON.stringify({
          success: true,
          message: "Sequence auto-reframed",
          aspectRatio: ${numerator} + ":" + ${denominator},
          motionPreset: ${JSON.stringify(preset)},
          newName: reframedName
        });
      } catch (e) {
        return JSON.stringify({ success: false, error: e.toString() });
      }
    `;
  return await ctx.bridge.executeScript(script);
}

async function createCaptionTrack(ctx: ToolContext, sequenceId: string, projectItemId: string, startTime?: number, captionFormat?: string): Promise<any> {
  const startTimeVal = startTime || 0;
  // createCaptionTrack's optional 3rd arg is a Sequence.CAPTION_FORMAT_* integer
  // constant, NOT a free-form string. Passing a string ("Subtitle Default") raised
  // "Illegal Parameter type" and broke all SRT ingestion. Map friendly names to the
  // constant suffix; omit the arg entirely when none is given (defaults to subtitle,
  // which is correct for .srt and matches Adobe's own PProPanel sample).
  const formatMap: Record<string, string> = {
    'subtitle': 'CAPTION_FORMAT_SUBTITLE',
    'subtitle default': 'CAPTION_FORMAT_SUBTITLE',
    'srt': 'CAPTION_FORMAT_SUBTITLE',
    'open captions': 'CAPTION_FORMAT_SUBTITLE',
    '608': 'CAPTION_FORMAT_608',
    'cea-608': 'CAPTION_FORMAT_608',
    '708': 'CAPTION_FORMAT_708',
    'cea-708': 'CAPTION_FORMAT_708',
    'teletext': 'CAPTION_FORMAT_TELETEXT',
    'open ebu': 'CAPTION_FORMAT_OPEN_EBU',
    'ebu': 'CAPTION_FORMAT_OPEN_EBU',
    'op42': 'CAPTION_FORMAT_OP42',
    'op47': 'CAPTION_FORMAT_OP47'
  };
  const requested = captionFormat ? captionFormat.trim().toLowerCase() : '';
  const constName = requested ? (formatMap[requested] || 'CAPTION_FORMAT_SUBTITLE') : '';
  const script = `
      try {
        var sequence = __findSequence(${JSON.stringify(sequenceId)});
        if (!sequence) return JSON.stringify({ success: false, error: "Sequence not found by id: " + ${JSON.stringify(sequenceId)} });
        var projectItem = __findProjectItem(${JSON.stringify(projectItemId)});
        if (!projectItem) return JSON.stringify({ success: false, error: "Caption project item not found" });
        var startAtTime = ${startTimeVal};
        var constName = ${JSON.stringify(constName)};
        var usedFormat = "default";
        var ok;
        // Resolve the format enum if requested; constant location varies by host, so
        // probe a couple of spots and fall back to the 2-arg (subtitle) call.
        var fmtConst = null;
        if (constName) {
          try {
            if (typeof Sequence !== 'undefined' && Sequence[constName] !== undefined) {
              fmtConst = Sequence[constName];
            } else if (sequence.constructor && sequence.constructor[constName] !== undefined) {
              fmtConst = sequence.constructor[constName];
            }
          } catch (eC) { fmtConst = null; }
        }
        if (fmtConst !== null && fmtConst !== undefined) {
          try {
            ok = sequence.createCaptionTrack(projectItem, startAtTime, fmtConst);
            usedFormat = constName;
          } catch (eFmt) {
            ok = sequence.createCaptionTrack(projectItem, startAtTime);
            usedFormat = "default (requested '" + constName + "' rejected: " + eFmt.toString() + ")";
          }
        } else {
          ok = sequence.createCaptionTrack(projectItem, startAtTime);
        }
        return JSON.stringify({
          success: true,
          message: "Caption track created",
          captionFormat: usedFormat,
          startTime: startAtTime,
          apiResult: String(ok)
        });
      } catch (e) {
        return JSON.stringify({ success: false, error: e.toString() });
      }
    `;
  return await ctx.bridge.executeScript(script);
}

async function setSequenceInOutPoints(ctx: ToolContext, sequenceId: string, inPoint?: number, outPoint?: number): Promise<any> {
  const setIn = inPoint !== undefined;
  const setOut = outPoint !== undefined;
  const script = `
      try {
        var seq = __findSequence(${JSON.stringify(sequenceId)});
        if (!seq) return JSON.stringify({ success: false, error: "Sequence not found" });
        ${setIn ? 'seq.setInPoint(__secondsToTicks(' + inPoint + '));' : ''}
        ${setOut ? 'seq.setOutPoint(__secondsToTicks(' + outPoint + '));' : ''}
        return JSON.stringify({
          success: true,
          message: "Sequence in/out points set",
          sequenceId: ${JSON.stringify(sequenceId)}
        });
      } catch (e) {
        return JSON.stringify({ success: false, error: e.toString() });
      }
    `;
  return await ctx.bridge.executeScript(script);
}

async function getSequenceInOutPoints(ctx: ToolContext, sequenceId: string): Promise<any> {
  const script = `
      try {
        var seq = __findSequence(${JSON.stringify(sequenceId)});
        if (!seq) return JSON.stringify({ success: false, error: "Sequence not found" });
        var inTime = seq.getInPointAsTime();
        var outTime = seq.getOutPointAsTime();
        return JSON.stringify({
          success: true,
          sequenceId: ${JSON.stringify(sequenceId)},
          inPoint: inTime.seconds,
          outPoint: outTime.seconds
        });
      } catch (e) {
        return JSON.stringify({ success: false, error: e.toString() });
      }
    `;
  return await ctx.bridge.executeScript(script);
}

async function createSubsequence(ctx: ToolContext, sequenceId: string, ignoreTrackTargeting?: boolean): Promise<any> {
  const ignoreTargeting = ignoreTrackTargeting ? 'true' : 'false';
  const script = `
      try {
        var seq = __findSequence(${JSON.stringify(sequenceId)});
        if (!seq) return JSON.stringify({ success: false, error: "Sequence not found" });
        var subseq = seq.createSubsequence(${ignoreTargeting});
        return JSON.stringify({
          success: true,
          message: "Subsequence created",
          sequenceId: subseq.sequenceID,
          name: subseq.name
        });
      } catch (e) {
        return JSON.stringify({ success: false, error: e.toString() });
      }
    `;
  return await ctx.bridge.executeScript(script);
}
