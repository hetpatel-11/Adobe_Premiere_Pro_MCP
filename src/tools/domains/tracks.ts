/**
 * Track creation and track state.
 *
 * Each entry declares the tool an agent sees and the handler that runs it,
 * so the two cannot drift apart. Handlers reach Premiere through ToolContext.
 */
import { z } from 'zod';
import type { ToolContext, ToolModule } from '../context.js';
import { buildSequenceResolver } from './shared.js';

export const tracksTools: ToolModule[] = [
  {
    name: 'add_track',
    description: 'Adds a new video or audio track to the sequence.',
    inputSchema: z.object({
      sequenceId: z.string().describe('The ID of the sequence'),
      trackType: z.enum(['video', 'audio']).describe('Type of track to add'),
      position: z.enum(['above', 'below']).optional().describe('Where to add the track relative to existing tracks')
    }),
    run: (ctx, args) => addTrack(ctx, args.sequenceId, args.trackType, args.position),
  },
  {
    name: 'delete_track',
    description: 'Deletes a video or audio track from the specified sequence. The sequence does not have to be the active one, but it does have to be open in Premiere: there is no DOM track-deletion API, so this falls through to the QE DOM, which only reaches sequences Premiere has open. A sequence QE cannot address is reported by name rather than deleted from the wrong timeline. Caption track deletion is accepted by the schema but returns an explicit unsupported result because Premiere Pro exposes no caption-track delete/read API to scripting.',
    inputSchema: z.object({
      sequenceId: z.string().min(1).describe('The sequence ID (GUID) as returned in the "id" field by list_sequences or get_active_sequence'),
      trackType: z.enum(['video', 'audio', 'caption']).describe('Type of track'),
      trackIndex: z.number().describe('The index of the track to delete')
    }),
    run: (ctx, args) => deleteTrack(ctx, args.sequenceId, args.trackType, args.trackIndex),
  },
  {
    name: 'lock_track',
    description: 'Locks or unlocks a track to prevent/allow editing. The sequence does not have to be the active one.',
    inputSchema: z.object({
      sequenceId: z.string().min(1).describe('The sequence ID (GUID) as returned in the "id" field by list_sequences or get_active_sequence'),
      trackType: z.enum(['video', 'audio']).describe('Type of track'),
      trackIndex: z.number().describe('The index of the track'),
      locked: z.boolean().describe('Whether to lock (true) or unlock (false)')
    }),
    run: (ctx, args) => lockTrack(ctx, args.sequenceId, args.trackType, args.trackIndex, args.locked),
  },
  {
    name: 'toggle_track_visibility',
    description: 'Shows or hides a video track by toggling its output (the eye icon) in the specified sequence. The sequence does not have to be the active one. This is track OUTPUT, not track targeting -- use set_target_track for the V1/A1 patch buttons.',
    inputSchema: z.object({
      sequenceId: z.string().min(1).describe('The sequence ID (GUID) as returned in the "id" field by list_sequences or get_active_sequence'),
      trackIndex: z.number().describe('The index of the video track'),
      visible: z.boolean().describe('Whether to show (true) or hide (false)')
    }),
    run: (ctx, args) => toggleTrackVisibility(ctx, args.sequenceId, args.trackIndex, args.visible),
  },
];

async function addTrack(ctx: ToolContext, sequenceId: string, trackType: string, position: string = 'above'): Promise<any> {
  const isVideo = trackType === 'video';
  const numVideo = isVideo ? 1 : 0;
  const numAudio = isVideo ? 0 : 1;
  const script = `
      try {
        app.enableQE();
        var seq = __findSequence(${JSON.stringify(sequenceId)});
        if (!seq) return JSON.stringify({ success: false, error: "Sequence not found" });
        var __priorActive = app.project.activeSequence;
        app.project.activeSequence = seq;
        var qeSeq = __qeSequenceFor(seq);
        if (!qeSeq) return JSON.stringify({ success: false, error: "Could not address sequence '" + seq.name + "' through the QE API." });

        // Calculate insertion index based on position
        var existingVideoTracks = seq.videoTracks.numTracks;
        var existingAudioTracks = seq.audioTracks.numTracks;
        var insertVideoIdx = (${JSON.stringify(position)} === 'above') ? existingVideoTracks : 0;
        var insertAudioIdx = (${JSON.stringify(position)} === 'above') ? existingAudioTracks : 0;

        // Full QE addTracks signature. Arg 4 is audio type, arg 5 is audio insert index.
        qeSeq.addTracks(${numVideo}, insertVideoIdx, ${numAudio}, 1, insertAudioIdx, 0, 0);

        var afterVideoTracks = seq.videoTracks.numTracks;
        var afterAudioTracks = seq.audioTracks.numTracks;

        var expectedVideoTracks = existingVideoTracks + ${numVideo};
        var expectedAudioTracks = existingAudioTracks + ${numAudio};
        if (afterVideoTracks < expectedVideoTracks || afterAudioTracks < expectedAudioTracks) {
          return JSON.stringify({
            success: false,
            error: "Premiere did not add the requested track",
            trackType: ${JSON.stringify(trackType)},
            position: ${JSON.stringify(position)},
            videoTracksBefore: existingVideoTracks,
            videoTracksAfter: afterVideoTracks,
            audioTracksBefore: existingAudioTracks,
            audioTracksAfter: afterAudioTracks,
            expectedVideoTracks: expectedVideoTracks,
            expectedAudioTracks: expectedAudioTracks
          });
        }

        return JSON.stringify({
          success: true,
          message: ${JSON.stringify(trackType)} + " track added at " + ${JSON.stringify(position)},
          trackType: ${JSON.stringify(trackType)},
          position: ${JSON.stringify(position)},
          videoTracksBefore: existingVideoTracks,
          videoTracksAfter: afterVideoTracks,
          audioTracksBefore: existingAudioTracks,
          audioTracksAfter: afterAudioTracks,
          newVideoTrackIndex: ${isVideo ? `(${JSON.stringify(position)} === 'above') ? existingVideoTracks : 0` : 'null'},
          newAudioTrackIndex: ${!isVideo ? `(${JSON.stringify(position)} === 'above') ? existingAudioTracks : 0` : 'null'}
        });
      } catch (e) {
        return JSON.stringify({ success: false, error: e.toString() });
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

async function deleteTrack(ctx: ToolContext, sequenceId: string, trackType: string, trackIndex: number): Promise<any> {
  if (trackType === 'caption') {
    return {
      success: false,
      error: 'Caption track deletion is not supported by Premiere Pro scripting. The ExtendScript DOM exposes no sequence.captionTracks/getCaptionTracks surface, and the QE DOM exposes no caption-track accessor or delete method.',
      sequenceId,
      trackType,
      trackIndex,
      unsupportedByPremiereApi: true,
      workaround: 'Delete caption tracks manually in Premiere, or remove/recreate captions from the source .srt before creating the caption track.'
    };
  }

  // Premiere 26 exposes no DOM trackCollection.deleteTrack, so deletion falls through to the
  // QE DOM — and QE can only reach qe.project.getActiveSequence(). Rather than deleting a
  // track from whatever timeline happens to be on screen, refuse the cross-sequence case with
  // a truthful error that names the limitation.
  const script = `
      try {
${buildSequenceResolver(sequenceId)}
        var tracks = ${trackType === 'video' ? 'sequence.videoTracks' : 'sequence.audioTracks'};
        if (${trackIndex} >= 0 && ${trackIndex} < tracks.numTracks) {
          var beforeCount = tracks.numTracks;
          var deleted = false;
          if (tracks.deleteTrack) {
            tracks.deleteTrack(${trackIndex});
            deleted = true;
          } else {
            // QE addresses sequences by index through getSequenceAt(), not
            // only whatever is active, so resolve by guid instead of refusing
            // every cross-sequence request. What QE actually limits is which
            // sequences it exposes at all — a sequence it cannot see is
            // reported as such, naming it, rather than deleting a track from
            // the timeline that happens to be on screen.
            var activeSeq = app.project.activeSequence;
            var qeSeq = __qeSequenceFor(sequence);
            if (!qeSeq) {
              return JSON.stringify({
                success: false,
                error: "Track deletion needs the QE API, which cannot address sequence '" + sequence.name + "'. Premiere exposes no DOM track-deletion API, and QE only reaches sequences it has open. Open it in a timeline, or call set_active_sequence with " + sequence.sequenceID + ", then retry.",
                sequenceId: sequence.sequenceID,
                sequenceName: sequence.name,
                activeSequenceId: activeSeq ? activeSeq.sequenceID : null,
                requiresOpenSequence: true
              });
            }
            if (${trackType === 'video' ? 'true' : 'false'} && qeSeq.removeVideoTrack) {
              qeSeq.removeVideoTrack(${trackIndex});
              deleted = true;
            } else if (${trackType === 'audio' ? 'true' : 'false'} && qeSeq.removeAudioTrack) {
              qeSeq.removeAudioTrack(${trackIndex});
              deleted = true;
            }
          }
          var afterCount = tracks.numTracks;
          if (!deleted || afterCount >= beforeCount) {
            return JSON.stringify({
              success: false,
              error: "Premiere did not remove the requested track",
              beforeCount: beforeCount,
              afterCount: afterCount
            });
          }
          return JSON.stringify({
            success: true,
            sequenceId: sequence.sequenceID,
            sequenceName: sequence.name,
            message: "Track deleted successfully",
            beforeCount: beforeCount,
            afterCount: afterCount
          });
        } else {
          return JSON.stringify({
            success: false,
            error: "Track index out of range"
          });
        }
      } catch (e) {
        return JSON.stringify({
          success: false,
          error: e.toString()
        });
      }
    `;
  return await ctx.bridge.executeScript(script);
}

async function lockTrack(ctx: ToolContext, sequenceId: string, trackType: string, trackIndex: number, locked: boolean): Promise<any> {
  const script = `
      try {
${buildSequenceResolver(sequenceId)}
        var tracks = ${trackType === 'video' ? 'sequence.videoTracks' : 'sequence.audioTracks'};
        if (${trackIndex} >= 0 && ${trackIndex} < tracks.numTracks) {
          tracks[${trackIndex}].setLocked(${locked ? 1 : 0});
          return JSON.stringify({
            success: true,
            sequenceId: sequence.sequenceID,
            sequenceName: sequence.name,
            message: "Track " + (${locked} ? "locked" : "unlocked")
          });
        } else {
          return JSON.stringify({
            success: false,
            error: "Track index out of range"
          });
        }
      } catch (e) {
        return JSON.stringify({
          success: false,
          error: e.toString()
        });
      }
    `;
  return await ctx.bridge.executeScript(script);
}

async function toggleTrackVisibility(ctx: ToolContext, sequenceId: string, trackIndex: number, visible: boolean): Promise<any> {
  const script = `
      try {
${buildSequenceResolver(sequenceId)}
        if (${trackIndex} >= 0 && ${trackIndex} < sequence.videoTracks.numTracks) {
          // This used to call setTargeted(), which is the V1/A1 patch button, not the
          // eye. Track output was never touched and the caller's track targeting was
          // silently changed instead, under a response saying "Track visibility
          // toggled". On a video track, mute IS the eye: setMute(1) disables output.
          var visibilityTrack = sequence.videoTracks[${trackIndex}];
          if (!visibilityTrack.setMute) {
            return JSON.stringify({ success: false, error: "Track.setMute is unavailable on this build, so track output cannot be changed" });
          }
          visibilityTrack.setMute(${visible} ? 0 : 1);

          // Read it back: assignment is not evidence of effect anywhere else in this API.
          var nowMuted = null;
          try { nowMuted = visibilityTrack.isMuted ? visibilityTrack.isMuted() : null; } catch (eMuted) {}
          if (nowMuted !== null && nowMuted === ${visible}) {
            return JSON.stringify({
              success: false,
              error: "Premiere accepted the change but the track output did not move",
              requestedVisible: ${visible},
              muted: nowMuted
            });
          }

          return JSON.stringify({
            success: true,
            sequenceId: sequence.sequenceID,
            sequenceName: sequence.name,
            trackIndex: ${trackIndex},
            visible: nowMuted === null ? ${visible} : !nowMuted,
            message: ${visible} ? "Track output enabled" : "Track output disabled"
          });
        } else {
          return JSON.stringify({
            success: false,
            error: "Track index out of range"
          });
        }
      } catch (e) {
        return JSON.stringify({
          success: false,
          error: e.toString()
        });
      }
    `;
  return await ctx.bridge.executeScript(script);
}
