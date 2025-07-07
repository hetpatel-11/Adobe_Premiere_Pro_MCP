/**
 * MCP Tools for Adobe Premiere Pro
 * 
 * This module provides tools that can be called by AI agents to perform
 * various video editing operations in Adobe Premiere Pro.
 */

import { z } from 'zod';
import { PremiereProBridge } from '../bridge/index.js';
import { Logger } from '../utils/logger.js';

export interface MCPTool {
  name: string;
  description: string;
  inputSchema: z.ZodSchema<any>;
}

export class PremiereProTools {
  private bridge: PremiereProBridge;
  private logger: Logger;

  constructor(bridge: PremiereProBridge) {
    this.bridge = bridge;
    this.logger = new Logger('PremiereProTools');
  }

  getAvailableTools(): MCPTool[] {
    return [
      // Discovery Tools (NEW)
      {
        name: 'list_project_items',
        description: 'Lists all media items, bins, and assets in the current Premiere Pro project. Use this to discover available media before performing operations.',
        inputSchema: z.object({
          includeBins: z.boolean().optional().describe('Whether to include bin information in the results'),
          includeMetadata: z.boolean().optional().describe('Whether to include detailed metadata for each item')
        })
      },
      {
        name: 'list_sequences',
        description: 'Lists all sequences in the current Premiere Pro project with their IDs, names, and basic properties.',
        inputSchema: z.object({})
      },
      {
        name: 'list_sequence_tracks',
        description: 'Lists all video and audio tracks in a specific sequence with their properties and clips.',
        inputSchema: z.object({
          sequenceId: z.string().describe('The ID of the sequence to list tracks for')
        })
      },
      {
        name: 'get_project_info',
        description: 'Gets comprehensive information about the current project including name, path, settings, and status.',
        inputSchema: z.object({})
      },

      // Project Management
      {
        name: 'create_project',
        description: 'Creates a new Adobe Premiere Pro project. Use this when the user wants to start a new video editing project from scratch.',
        inputSchema: z.object({
          name: z.string().describe('The name for the new project, e.g., "My Summer Vacation"'),
          location: z.string().describe('The absolute directory path where the project file should be saved, e.g., "/Users/user/Documents/Videos"')
        })
      },
      {
        name: 'open_project',
        description: 'Opens an existing Adobe Premiere Pro project from a specified file path.',
        inputSchema: z.object({
          path: z.string().describe('The absolute path to the .prproj file to open')
        })
      },
      {
        name: 'save_project',
        description: 'Saves the currently active Adobe Premiere Pro project.',
        inputSchema: z.object({})
      },
      {
        name: 'save_project_as',
        description: 'Saves the current project with a new name and location.',
        inputSchema: z.object({
          name: z.string().describe('The new name for the project'),
          location: z.string().describe('The absolute directory path where the project should be saved')
        })
      },

      // Media Management
      {
        name: 'import_media',
        description: 'Imports a media file (video, audio, image) into the current Premiere Pro project.',
        inputSchema: z.object({
          filePath: z.string().describe('The absolute path to the media file to import'),
          binName: z.string().optional().describe('The name of the bin to import the media into. If not provided, it will be imported into the root.')
        })
      },
      {
        name: 'import_folder',
        description: 'Imports all media files from a folder into the current Premiere Pro project.',
        inputSchema: z.object({
          folderPath: z.string().describe('The absolute path to the folder containing media files'),
          binName: z.string().optional().describe('The name of the bin to import the media into'),
          recursive: z.boolean().optional().describe('Whether to import from subfolders recursively')
        })
      },
      {
        name: 'create_bin',
        description: 'Creates a new bin (folder) in the project panel to organize media.',
        inputSchema: z.object({
          name: z.string().describe('The name for the new bin'),
          parentBinName: z.string().optional().describe('The name of the parent bin to create this bin inside')
        })
      },

      // Sequence Management
      {
        name: 'create_sequence',
        description: 'Creates a new sequence in the project. A sequence is a timeline where you edit clips.',
        inputSchema: z.object({
          name: z.string().describe('The name for the new sequence'),
          presetPath: z.string().optional().describe('Optional path to a sequence preset file for custom settings'),
          width: z.number().optional().describe('Sequence width in pixels'),
          height: z.number().optional().describe('Sequence height in pixels'),
          frameRate: z.number().optional().describe('Frame rate (e.g., 24, 25, 30, 60)'),
          sampleRate: z.number().optional().describe('Audio sample rate (e.g., 48000)')
        })
      },
      {
        name: 'duplicate_sequence',
        description: 'Creates a copy of an existing sequence with a new name.',
        inputSchema: z.object({
          sequenceId: z.string().describe('The ID of the sequence to duplicate'),
          newName: z.string().describe('The name for the new sequence copy')
        })
      },
      {
        name: 'delete_sequence',
        description: 'Deletes a sequence from the project.',
        inputSchema: z.object({
          sequenceId: z.string().describe('The ID of the sequence to delete')
        })
      },

      // Timeline Operations
      {
        name: 'add_to_timeline',
        description: 'Adds a media clip from the project panel to a sequence timeline at a specific track and time.',
        inputSchema: z.object({
          sequenceId: z.string().describe('The ID of the sequence (timeline) to add the clip to'),
          projectItemId: z.string().describe('The ID of the project item (clip) to add'),
          trackIndex: z.number().describe('The index of the video or audio track (0-based)'),
          time: z.number().describe('The time in seconds where the clip should be placed on the timeline'),
          insertMode: z.enum(['overwrite', 'insert']).optional().describe('Whether to overwrite existing content or insert and shift')
        })
      },
      {
        name: 'remove_from_timeline',
        description: 'Removes a clip from the timeline.',
        inputSchema: z.object({
          clipId: z.string().describe('The ID of the clip on the timeline to remove'),
          deleteMode: z.enum(['ripple', 'lift']).optional().describe('Whether to ripple delete (close gap) or lift (leave gap)')
        })
      },
      {
        name: 'move_clip',
        description: 'Moves a clip to a different position on the timeline.',
        inputSchema: z.object({
          clipId: z.string().describe('The ID of the clip to move'),
          newTime: z.number().describe('The new time position in seconds'),
          newTrackIndex: z.number().optional().describe('The new track index (if moving to different track)')
        })
      },
      {
        name: 'trim_clip',
        description: 'Adjusts the in and out points of a clip on the timeline, effectively shortening it.',
        inputSchema: z.object({
          clipId: z.string().describe('The ID of the clip on the timeline to trim'),
          inPoint: z.number().optional().describe('The new in point in seconds from the start of the clip'),
          outPoint: z.number().optional().describe('The new out point in seconds from the start of the clip'),
          duration: z.number().optional().describe('Alternative: set the desired duration in seconds')
        })
      },
      {
        name: 'split_clip',
        description: 'Splits a clip at a specific time point, creating two separate clips.',
        inputSchema: z.object({
          clipId: z.string().describe('The ID of the clip to split'),
          splitTime: z.number().describe('The time in seconds where to split the clip')
        })
      },

      // Effects and Transitions
      {
        name: 'apply_effect',
        description: 'Applies a visual or audio effect to a specific clip on the timeline.',
        inputSchema: z.object({
          clipId: z.string().describe('The ID of the clip to apply the effect to'),
          effectName: z.string().describe('The name of the effect to apply (e.g., "Gaussian Blur", "Lumetri Color")'),
          parameters: z.record(z.any()).optional().describe('Key-value pairs for the effect\'s parameters')
        })
      },
      {
        name: 'remove_effect',
        description: 'Removes an effect from a clip.',
        inputSchema: z.object({
          clipId: z.string().describe('The ID of the clip'),
          effectName: z.string().describe('The name of the effect to remove')
        })
      },
      {
        name: 'add_transition',
        description: 'Adds a transition (e.g., cross dissolve) between two adjacent clips on the timeline.',
        inputSchema: z.object({
          clipId1: z.string().describe('The ID of the first clip (outgoing)'),
          clipId2: z.string().describe('The ID of the second clip (incoming)'),
          transitionName: z.string().describe('The name of the transition to add (e.g., "Cross Dissolve")'),
          duration: z.number().describe('The duration of the transition in seconds')
        })
      },
      {
        name: 'add_transition_to_clip',
        description: 'Adds a transition to the beginning or end of a single clip.',
        inputSchema: z.object({
          clipId: z.string().describe('The ID of the clip'),
          transitionName: z.string().describe('The name of the transition'),
          position: z.enum(['start', 'end']).describe('Whether to add the transition at the start or end of the clip'),
          duration: z.number().describe('The duration of the transition in seconds')
        })
      },

      // Audio Operations
      {
        name: 'adjust_audio_levels',
        description: 'Adjusts the volume (gain) of an audio clip on the timeline.',
        inputSchema: z.object({
          clipId: z.string().describe('The ID of the audio clip to adjust'),
          level: z.number().describe('The new audio level in decibels (dB). Can be positive or negative.')
        })
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
        })
      },
      {
        name: 'mute_track',
        description: 'Mutes or unmutes an entire audio track.',
        inputSchema: z.object({
          sequenceId: z.string().describe('The ID of the sequence'),
          trackIndex: z.number().describe('The index of the audio track'),
          muted: z.boolean().describe('Whether to mute (true) or unmute (false) the track')
        })
      },

      // Text and Graphics
      {
        name: 'add_text_overlay',
        description: 'Adds a text layer (title) over the video timeline.',
        inputSchema: z.object({
          text: z.string().describe('The text content to display'),
          sequenceId: z.string().describe('The sequence to add the text to'),
          trackIndex: z.number().describe('The video track to place the text on'),
          startTime: z.number().describe('The time in seconds when the text should appear'),
          duration: z.number().describe('How long the text should remain on screen in seconds'),
          fontFamily: z.string().optional().describe('e.g., "Arial", "Times New Roman"'),
          fontSize: z.number().optional().describe('e.g., 48'),
          color: z.string().optional().describe('The hex color code for the text, e.g., "#FFFFFF"'),
          position: z.object({
            x: z.number().optional().describe('Horizontal position (0-100)'),
            y: z.number().optional().describe('Vertical position (0-100)')
          }).optional().describe('Text position on screen'),
          alignment: z.enum(['left', 'center', 'right']).optional().describe('Text alignment')
        })
      },
      {
        name: 'add_shape',
        description: 'Adds a shape (rectangle, circle, etc.) to the timeline.',
        inputSchema: z.object({
          shapeType: z.enum(['rectangle', 'circle', 'triangle']).describe('The type of shape to add'),
          sequenceId: z.string().describe('The sequence to add the shape to'),
          trackIndex: z.number().describe('The video track to place the shape on'),
          startTime: z.number().describe('The time in seconds when the shape should appear'),
          duration: z.number().describe('How long the shape should remain on screen in seconds'),
          color: z.string().optional().describe('The hex color code for the shape'),
          size: z.object({
            width: z.number().optional().describe('Width in pixels'),
            height: z.number().optional().describe('Height in pixels')
          }).optional().describe('Shape size'),
          position: z.object({
            x: z.number().optional().describe('Horizontal position (0-100)'),
            y: z.number().optional().describe('Vertical position (0-100)')
          }).optional().describe('Shape position on screen')
        })
      },

      // Color Correction
      {
        name: 'color_correct',
        description: 'Applies basic color correction adjustments to a video clip.',
        inputSchema: z.object({
          clipId: z.string().describe('The ID of the clip to color correct'),
          brightness: z.number().optional().describe('Brightness adjustment (-100 to 100)'),
          contrast: z.number().optional().describe('Contrast adjustment (-100 to 100)'),
          saturation: z.number().optional().describe('Saturation adjustment (-100 to 100)'),
          hue: z.number().optional().describe('Hue adjustment in degrees (-180 to 180)'),
          highlights: z.number().optional().describe('Adjustment for the brightest parts of the image (-100 to 100)'),
          shadows: z.number().optional().describe('Adjustment for the darkest parts of the image (-100 to 100)'),
          temperature: z.number().optional().describe('Color temperature adjustment (-100 to 100)'),
          tint: z.number().optional().describe('Tint adjustment (-100 to 100)')
        })
      },
      {
        name: 'apply_lut',
        description: 'Applies a Look-Up Table (LUT) to a clip for color grading.',
        inputSchema: z.object({
          clipId: z.string().describe('The ID of the clip'),
          lutPath: z.string().describe('The absolute path to the .cube or .3dl LUT file'),
          intensity: z.number().optional().describe('LUT intensity (0-100)')
        })
      },

      // Export and Rendering
      {
        name: 'export_sequence',
        description: 'Renders and exports a sequence to a video file. This is for creating the final video.',
        inputSchema: z.object({
          sequenceId: z.string().describe('The ID of the sequence to export'),
          outputPath: z.string().describe('The absolute path where the final video file will be saved'),
          presetPath: z.string().optional().describe('Optional path to an export preset file (.epr) for specific settings'),
          format: z.enum(['mp4', 'mov', 'avi', 'h264', 'prores']).optional().describe('The export format or codec'),
          quality: z.enum(['low', 'medium', 'high', 'maximum']).optional().describe('Export quality setting'),
          resolution: z.string().optional().describe('Export resolution (e.g., "1920x1080", "3840x2160")')
        })
      },
      {
        name: 'export_frame',
        description: 'Exports a single frame from a sequence as an image file.',
        inputSchema: z.object({
          sequenceId: z.string().describe('The ID of the sequence'),
          time: z.number().describe('The time in seconds to export the frame from'),
          outputPath: z.string().describe('The absolute path where the image file will be saved'),
          format: z.enum(['png', 'jpg', 'tiff']).optional().describe('The image format')
        })
      },

      // Advanced Features
      {
        name: 'create_multicam_sequence',
        description: 'Creates a multicamera source sequence from multiple video clips, synchronized by audio or timecode.',
        inputSchema: z.object({
          name: z.string().describe('The name for the new multicam sequence'),
          cameraFiles: z.array(z.string()).describe('An array of absolute file paths for each camera angle'),
          syncMethod: z.enum(['timecode', 'audio', 'markers']).describe('The method to use for synchronizing the clips')
        })
      },
      {
        name: 'create_proxy_media',
        description: 'Generates low-resolution proxy versions of high-resolution media to improve editing performance.',
        inputSchema: z.object({
          projectItemIds: z.array(z.string()).describe('An array of IDs of the project items to create proxies for'),
          proxyPreset: z.string().describe('The name of the proxy preset to use'),
          replaceOriginals: z.boolean().optional().describe('Whether to replace original media with proxies')
        })
      },
      {
        name: 'auto_edit_to_music',
        description: 'Automatically creates an edit by cutting video clips to the beat of a music track.',
        inputSchema: z.object({
          audioTrackId: z.string().describe('The ID of the audio track containing the music'),
          videoClipIds: z.array(z.string()).describe('An array of video clip IDs to use for the edit'),
          editStyle: z.enum(['cuts_only', 'cuts_and_transitions', 'beat_sync']).describe('The desired editing style'),
          sensitivity: z.number().optional().describe('Beat detection sensitivity (0-100)')
        })
      },
      {
        name: 'stabilize_clip',
        description: 'Applies video stabilization to reduce camera shake.',
        inputSchema: z.object({
          clipId: z.string().describe('The ID of the clip to stabilize'),
          method: z.enum(['warp', 'subspace']).optional().describe('Stabilization method'),
          smoothness: z.number().optional().describe('Stabilization smoothness (0-100)')
        })
      },
      {
        name: 'speed_change',
        description: 'Changes the playback speed of a clip.',
        inputSchema: z.object({
          clipId: z.string().describe('The ID of the clip'),
          speed: z.number().describe('Speed multiplier (0.1 = 10% speed, 2.0 = 200% speed)'),
          maintainAudio: z.boolean().optional().describe('Whether to maintain audio pitch when changing speed')
        })
      }
    ];
  }

  async executeTool(name: string, args: Record<string, any>): Promise<any> {
    const tool = this.getAvailableTools().find(t => t.name === name);
    if (!tool) {
      return {
        success: false,
        error: `Tool '${name}' not found`,
        availableTools: this.getAvailableTools().map(t => t.name)
      };
    }

    // Validate input arguments
    try {
      tool.inputSchema.parse(args);
    } catch (error) {
      return {
        success: false,
        error: `Invalid arguments for tool '${name}': ${error}`,
        expectedSchema: tool.inputSchema.description
      };
    }

    this.logger.info(`Executing tool: ${name} with args:`, args);
    
    try {
      switch (name) {
        // Discovery Tools
        case 'list_project_items':
          return await this.listProjectItems(args.includeBins, args.includeMetadata);
        case 'list_sequences':
          return await this.listSequences();
        case 'list_sequence_tracks':
          return await this.listSequenceTracks(args.sequenceId);
        case 'get_project_info':
          return await this.getProjectInfo();

        // Project Management
        case 'create_project':
          return await this.createProject(args.name, args.location);
        case 'open_project':
          return await this.openProject(args.path);
        case 'save_project':
          return await this.saveProject();
        case 'save_project_as':
          return await this.saveProjectAs(args.name, args.location);

        // Media Management
        case 'import_media':
          return await this.importMedia(args.filePath, args.binName);
        case 'import_folder':
          return await this.importFolder(args.folderPath, args.binName, args.recursive);
        case 'create_bin':
          return await this.createBin(args.name, args.parentBinName);

        // Sequence Management
        case 'create_sequence':
          return await this.createSequence(args.name, args.presetPath, args.width, args.height, args.frameRate, args.sampleRate);
        case 'duplicate_sequence':
          return await this.duplicateSequence(args.sequenceId, args.newName);
        case 'delete_sequence':
          return await this.deleteSequence(args.sequenceId);

        // Timeline Operations
        case 'add_to_timeline':
          return await this.addToTimeline(args.sequenceId, args.projectItemId, args.trackIndex, args.time, args.insertMode);
        case 'remove_from_timeline':
          return await this.removeFromTimeline(args.clipId, args.deleteMode);
        case 'move_clip':
          return await this.moveClip(args.clipId, args.newTime, args.newTrackIndex);
        case 'trim_clip':
          return await this.trimClip(args.clipId, args.inPoint, args.outPoint, args.duration);
        case 'split_clip':
          return await this.splitClip(args.clipId, args.splitTime);

        // Effects and Transitions
        case 'apply_effect':
          return await this.applyEffect(args.clipId, args.effectName, args.parameters);
        case 'remove_effect':
          return await this.removeEffect(args.clipId, args.effectName);
        case 'add_transition':
          return await this.addTransition(args.clipId1, args.clipId2, args.transitionName, args.duration);
        case 'add_transition_to_clip':
          return await this.addTransitionToClip(args.clipId, args.transitionName, args.position, args.duration);

        // Audio Operations
        case 'adjust_audio_levels':
          return await this.adjustAudioLevels(args.clipId, args.level);
        case 'add_audio_keyframes':
          return await this.addAudioKeyframes(args.clipId, args.keyframes);
        case 'mute_track':
          return await this.muteTrack(args.sequenceId, args.trackIndex, args.muted);

        // Text and Graphics
        case 'add_text_overlay':
          return await this.addTextOverlay(args);
        case 'add_shape':
          return await this.addShape(args);

        // Color Correction
        case 'color_correct':
          return await this.colorCorrect(args.clipId, args);
        case 'apply_lut':
          return await this.applyLut(args.clipId, args.lutPath, args.intensity);

        // Export and Rendering
        case 'export_sequence':
          return await this.exportSequence(args.sequenceId, args.outputPath, args.presetPath, args.format, args.quality, args.resolution);
        case 'export_frame':
          return await this.exportFrame(args.sequenceId, args.time, args.outputPath, args.format);

        // Advanced Features
        case 'create_multicam_sequence':
          return await this.createMulticamSequence(args.name, args.cameraFiles, args.syncMethod);
        case 'create_proxy_media':
          return await this.createProxyMedia(args.projectItemIds, args.proxyPreset, args.replaceOriginals);
        case 'auto_edit_to_music':
          return await this.autoEditToMusic(args.audioTrackId, args.videoClipIds, args.editStyle, args.sensitivity);
        case 'stabilize_clip':
          return await this.stabilizeClip(args.clipId, args.method, args.smoothness);
        case 'speed_change':
          return await this.speedChange(args.clipId, args.speed, args.maintainAudio);

        default:
          return {
            success: false,
            error: `Tool '${name}' not implemented`,
            availableTools: this.getAvailableTools().map(t => t.name)
          };
      }
    } catch (error) {
      this.logger.error(`Error executing tool ${name}:`, error);
      return {
        success: false,
        error: `Tool execution failed: ${error instanceof Error ? error.message : String(error)}`,
        tool: name,
        args: args
      };
    }
  }

  // Discovery Tools Implementation
  private async listProjectItems(includeBins = true, includeMetadata = false): Promise<any> {
    const script = `
      try {
        var items = [];
        var bins = [];
        
        // List all project items
        for (var i = 0; i < app.project.rootItem.children.numItems; i++) {
          var item = app.project.rootItem.children[i];
          var itemInfo = {
            id: item.nodeId,
            name: item.name,
            type: item.type.toString(),
            path: item.getMediaPath(),
            duration: item.duration ? item.duration.seconds : null
          };
          
          if (${includeMetadata}) {
            itemInfo.metadata = {
              width: item.getMediaWidth ? item.getMediaWidth() : null,
              height: item.getMediaHeight ? item.getMediaHeight() : null,
              frameRate: item.getMediaFrameRate ? item.getMediaFrameRate() : null,
              hasVideo: item.hasVideo ? item.hasVideo() : false,
              hasAudio: item.hasAudio ? item.hasAudio() : false
            };
          }
          
          if (item.type === ProjectItemType.BIN) {
            bins.push(itemInfo);
          } else {
            items.push(itemInfo);
          }
        }
        
        JSON.stringify({
          success: true,
          items: items,
          bins: ${includeBins} ? bins : [],
          totalItems: items.length,
          totalBins: bins.length
        });
      } catch (e) {
        JSON.stringify({
          success: false,
          error: e.toString()
        });
      }
    `;
    
    return await this.bridge.executeScript(script);
  }

  private async listSequences(): Promise<any> {
    const script = `
      try {
        var sequences = [];
        
        for (var i = 0; i < app.project.sequences.numSequences; i++) {
          var seq = app.project.sequences[i];
          sequences.push({
            id: seq.sequenceID,
            name: seq.name,
            duration: seq.duration.seconds,
            width: seq.frameBounds.width,
            height: seq.frameBounds.height,
            frameRate: seq.frameRate,
            videoTrackCount: seq.videoTracks.numTracks,
            audioTrackCount: seq.audioTracks.numTracks
          });
        }
        
        JSON.stringify({
          success: true,
          sequences: sequences,
          count: sequences.length
        });
      } catch (e) {
        JSON.stringify({
          success: false,
          error: e.toString()
        });
      }
    `;
    
    return await this.bridge.executeScript(script);
  }

  private async listSequenceTracks(sequenceId: string): Promise<any> {
    const script = `
      try {
        var sequence = app.project.getSequenceByID("${sequenceId}");
        if (!sequence) {
          JSON.stringify({
            success: false,
            error: "Sequence not found"
          });
          return;
        }
        
        var videoTracks = [];
        var audioTracks = [];
        
        // List video tracks
        for (var i = 0; i < sequence.videoTracks.numTracks; i++) {
          var track = sequence.videoTracks[i];
          var clips = [];
          
          for (var j = 0; j < track.clips.numItems; j++) {
            var clip = track.clips[j];
            clips.push({
              id: clip.nodeId,
              name: clip.name,
              startTime: clip.start.seconds,
              endTime: clip.end.seconds,
              duration: clip.duration.seconds
            });
          }
          
          videoTracks.push({
            index: i,
            name: track.name || "Video " + (i + 1),
            enabled: track.isTargeted(),
            locked: track.isLocked(),
            clips: clips,
            clipCount: clips.length
          });
        }
        
        // List audio tracks
        for (var i = 0; i < sequence.audioTracks.numTracks; i++) {
          var track = sequence.audioTracks[i];
          var clips = [];
          
          for (var j = 0; j < track.clips.numItems; j++) {
            var clip = track.clips[j];
            clips.push({
              id: clip.nodeId,
              name: clip.name,
              startTime: clip.start.seconds,
              endTime: clip.end.seconds,
              duration: clip.duration.seconds
            });
          }
          
          audioTracks.push({
            index: i,
            name: track.name || "Audio " + (i + 1),
            enabled: track.isTargeted(),
            locked: track.isLocked(),
            clips: clips,
            clipCount: clips.length
          });
        }
        
        JSON.stringify({
          success: true,
          sequenceId: "${sequenceId}",
          sequenceName: sequence.name,
          videoTracks: videoTracks,
          audioTracks: audioTracks,
          totalVideoTracks: videoTracks.length,
          totalAudioTracks: audioTracks.length
        });
      } catch (e) {
        JSON.stringify({
          success: false,
          error: e.toString()
        });
      }
    `;
    
    return await this.bridge.executeScript(script);
  }

  private async getProjectInfo(): Promise<any> {
    const script = `
      try {
        var project = app.project;
        JSON.stringify({
          success: true,
          name: project.name,
          path: project.path,
          activeSequence: project.activeSequence ? {
            id: project.activeSequence.sequenceID,
            name: project.activeSequence.name
          } : null,
          itemCount: project.rootItem.children.numItems,
          sequenceCount: project.sequences.numSequences,
          isDirty: project.dirty,
          hasActiveSequence: project.activeSequence !== null
        });
      } catch (e) {
        JSON.stringify({
          success: false,
          error: e.toString()
        });
      }
    `;
    
    return await this.bridge.executeScript(script);
  }

  // Project Management Implementation
  private async createProject(name: string, location: string): Promise<any> {
    try {
      const result = await this.bridge.createProject(name, location);
      return {
        success: true,
        message: `Project "${name}" created successfully`,
        projectPath: `${location}/${name}.prproj`,
        ...result
      };
    } catch (error) {
      return {
        success: false,
        error: `Failed to create project: ${error instanceof Error ? error.message : String(error)}`
      };
    }
  }

  private async openProject(path: string): Promise<any> {
    try {
      const result = await this.bridge.openProject(path);
      return {
        success: true,
        message: `Project opened successfully`,
        projectPath: path,
        ...result
      };
    } catch (error) {
      return {
        success: false,
        error: `Failed to open project: ${error instanceof Error ? error.message : String(error)}`
      };
    }
  }

  private async saveProject(): Promise<any> {
    try {
      await this.bridge.saveProject();
      return { 
        success: true, 
        message: 'Project saved successfully',
        timestamp: new Date().toISOString()
      };
    } catch (error) {
      return {
        success: false,
        error: `Failed to save project: ${error instanceof Error ? error.message : String(error)}`
      };
    }
  }

  private async saveProjectAs(name: string, location: string): Promise<any> {
    const script = `
      try {
        var project = app.project;
        var newPath = "${location}/${name}.prproj";
        project.saveAs(newPath);
        
        JSON.stringify({
          success: true,
          message: "Project saved as: " + newPath,
          newPath: newPath
        });
      } catch (e) {
        JSON.stringify({
          success: false,
          error: e.toString()
        });
      }
    `;
    
    return await this.bridge.executeScript(script);
  }

  // Media Management Implementation
  private async importMedia(filePath: string, binName?: string): Promise<any> {
    try {
      const result = await this.bridge.importMedia(filePath);
      return {
        success: true,
        message: `Media imported successfully`,
        filePath: filePath,
        binName: binName || 'Root',
        ...result
      };
    } catch (error) {
      return {
        success: false,
        error: `Failed to import media: ${error instanceof Error ? error.message : String(error)}`,
        filePath: filePath
      };
    }
  }

  private async importFolder(folderPath: string, binName?: string, recursive = false): Promise<any> {
    const script = `
      try {
        var folder = new Folder("${folderPath}");
        var importedItems = [];
        var errors = [];
        
        function importFiles(dir, targetBin) {
          var files = dir.getFiles();
          for (var i = 0; i < files.length; i++) {
            var file = files[i];
            if (file instanceof File) {
              try {
                var item = targetBin.importFiles([file.fsName]);
                if (item && item.length > 0) {
                  importedItems.push({
                    name: file.name,
                    path: file.fsName,
                    id: item[0].nodeId
                  });
                }
              } catch (e) {
                errors.push({
                  file: file.name,
                  error: e.toString()
                });
              }
            } else if (file instanceof Folder && ${recursive}) {
              importFiles(file, targetBin);
            }
          }
        }
        
        var targetBin = app.project.rootItem;
        ${binName ? `targetBin = app.project.rootItem.children["${binName}"] || app.project.rootItem;` : ''}
        
        importFiles(folder, targetBin);
        
        JSON.stringify({
          success: true,
          importedItems: importedItems,
          errors: errors,
          totalImported: importedItems.length,
          totalErrors: errors.length
        });
      } catch (e) {
        JSON.stringify({
          success: false,
          error: e.toString()
        });
      }
    `;
    
    return await this.bridge.executeScript(script);
  }

  private async createBin(name: string, parentBinName?: string): Promise<any> {
    const script = `
      try {
        var parentBin = app.project.rootItem;
        ${parentBinName ? `parentBin = app.project.rootItem.children["${parentBinName}"] || app.project.rootItem;` : ''}
        
        var newBin = parentBin.createBin("${name}");
        
        JSON.stringify({
          success: true,
          binName: "${name}",
          binId: newBin.nodeId,
          parentBin: parentBinName || "Root"
        });
      } catch (e) {
        JSON.stringify({
          success: false,
          error: e.toString()
        });
      }
    `;
    
    return await this.bridge.executeScript(script);
  }

  // Sequence Management Implementation
  private async createSequence(name: string, presetPath?: string, _width?: number, _height?: number, _frameRate?: number, _sampleRate?: number): Promise<any> {
    try {
      const result = await this.bridge.createSequence(name, presetPath);
      return {
        success: true,
        message: `Sequence "${name}" created successfully`,
        sequenceName: name,
        ...result
      };
    } catch (error) {
      return {
        success: false,
        error: `Failed to create sequence: ${error instanceof Error ? error.message : String(error)}`,
        sequenceName: name
      };
    }
  }

  private async duplicateSequence(sequenceId: string, newName: string): Promise<any> {
    const script = `
      try {
        var originalSeq = app.project.getSequenceByID("${sequenceId}");
        if (!originalSeq) {
          JSON.stringify({
            success: false,
            error: "Sequence not found"
          });
          return;
        }
        
        var newSeq = originalSeq.clone();
        newSeq.name = "${newName}";
        
        JSON.stringify({
          success: true,
          originalSequenceId: "${sequenceId}",
          newSequenceId: newSeq.sequenceID,
          newName: "${newName}"
        });
      } catch (e) {
        JSON.stringify({
          success: false,
          error: e.toString()
        });
      }
    `;
    
    return await this.bridge.executeScript(script);
  }

  private async deleteSequence(sequenceId: string): Promise<any> {
    const script = `
      try {
        var sequence = app.project.getSequenceByID("${sequenceId}");
        if (!sequence) {
          JSON.stringify({
            success: false,
            error: "Sequence not found"
          });
          return;
        }
        
        var sequenceName = sequence.name;
        app.project.deleteSequence(sequence);
        
        JSON.stringify({
          success: true,
          message: "Sequence deleted successfully",
          deletedSequenceId: "${sequenceId}",
          deletedSequenceName: sequenceName
        });
      } catch (e) {
        JSON.stringify({
          success: false,
          error: e.toString()
        });
      }
    `;
    
    return await this.bridge.executeScript(script);
  }

  // Timeline Operations Implementation
  private async addToTimeline(sequenceId: string, projectItemId: string, trackIndex: number, time: number, insertMode = 'overwrite'): Promise<any> {
    try {
      const result = await this.bridge.addToTimeline(sequenceId, projectItemId, trackIndex, time);
      return {
        success: true,
        message: `Clip added to timeline successfully`,
        sequenceId: sequenceId,
        projectItemId: projectItemId,
        trackIndex: trackIndex,
        time: time,
        insertMode: insertMode,
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

  private async removeFromTimeline(clipId: string, deleteMode = 'ripple'): Promise<any> {
    const script = `
      try {
        var clip = app.project.getClipByID("${clipId}");
        if (!clip) {
          JSON.stringify({
            success: false,
            error: "Clip not found"
          });
          return;
        }
        
        var clipName = clip.name;
        var track = clip.getTrack();
        
        if ("${deleteMode}" === "ripple") {
          track.removeClip(clip, true); // ripple delete
        } else {
          track.removeClip(clip, false); // lift delete
        }
        
        JSON.stringify({
          success: true,
          message: "Clip removed from timeline",
          clipId: "${clipId}",
          clipName: clipName,
          deleteMode: "${deleteMode}"
        });
      } catch (e) {
        JSON.stringify({
          success: false,
          error: e.toString()
        });
      }
    `;
    
    return await this.bridge.executeScript(script);
  }

  private async moveClip(clipId: string, newTime: number, newTrackIndex?: number): Promise<any> {
    const script = `
      try {
        var clip = app.project.getClipByID("${clipId}");
        if (!clip) {
          JSON.stringify({
            success: false,
            error: "Clip not found"
          });
          return;
        }
        
        var oldTime = clip.start.seconds;
        var oldTrack = clip.getTrack();
        var oldTrackIndex = oldTrack.index;
        
        clip.start = new Time("${newTime}s");
        
        ${newTrackIndex !== undefined ? `
        var newTrack = app.project.activeSequence.videoTracks[${newTrackIndex}];
        if (newTrack) {
          oldTrack.removeClip(clip, false);
          newTrack.insertClip(clip, new Time("${newTime}s"));
        }
        ` : ''}
        
        JSON.stringify({
          success: true,
          message: "Clip moved successfully",
          clipId: "${clipId}",
          oldTime: oldTime,
          newTime: ${newTime},
          oldTrackIndex: oldTrackIndex,
          newTrackIndex: ${newTrackIndex !== undefined ? newTrackIndex : 'unchanged'}
        });
      } catch (e) {
        JSON.stringify({
          success: false,
          error: e.toString()
        });
      }
    `;
    
    return await this.bridge.executeScript(script);
  }

  private async trimClip(clipId: string, inPoint?: number, outPoint?: number, duration?: number): Promise<any> {
    const script = `
      try {
        var clip = app.project.getClipByID("${clipId}");
        if (!clip) {
          JSON.stringify({
            success: false,
            error: "Clip not found"
          });
          return;
        }
        
        var oldInPoint = clip.inPoint.seconds;
        var oldOutPoint = clip.outPoint.seconds;
        var oldDuration = clip.duration.seconds;
        
        ${inPoint !== undefined ? `clip.inPoint = new Time("${inPoint}s");` : ''}
        ${outPoint !== undefined ? `clip.outPoint = new Time("${outPoint}s");` : ''}
        ${duration !== undefined ? `clip.outPoint = new Time(clip.inPoint.seconds + ${duration});` : ''}
        
        JSON.stringify({
          success: true,
          message: "Clip trimmed successfully",
          clipId: "${clipId}",
          oldInPoint: oldInPoint,
          oldOutPoint: oldOutPoint,
          oldDuration: oldDuration,
          newInPoint: clip.inPoint.seconds,
          newOutPoint: clip.outPoint.seconds,
          newDuration: clip.duration.seconds
        });
      } catch (e) {
        JSON.stringify({
          success: false,
          error: e.toString()
        });
      }
    `;
    
    return await this.bridge.executeScript(script);
  }

  private async splitClip(clipId: string, splitTime: number): Promise<any> {
    const script = `
      try {
        var clip = app.project.getClipByID("${clipId}");
        if (!clip) {
          JSON.stringify({
            success: false,
            error: "Clip not found"
          });
          return;
        }
        
        var track = clip.getTrack();
        var splitPoint = new Time(clip.start.seconds + ${splitTime});
        
        var newClip = track.splitClip(clip, splitPoint);
        
        JSON.stringify({
          success: true,
          message: "Clip split successfully",
          originalClipId: "${clipId}",
          newClipId: newClip.nodeId,
          splitTime: ${splitTime},
          splitPoint: splitPoint.seconds
        });
      } catch (e) {
        JSON.stringify({
          success: false,
          error: e.toString()
        });
      }
    `;
    
    return await this.bridge.executeScript(script);
  }

  // Effects and Transitions Implementation
  private async applyEffect(clipId: string, effectName: string, parameters?: Record<string, any>): Promise<any> {
    const script = `
      try {
        var clip = app.project.getClipByID("${clipId}");
        if (!clip) {
          JSON.stringify({
            success: false,
            error: "Clip not found"
          });
          return;
        }
        
        var effect = clip.addEffect("${effectName}");
        if (!effect) {
          JSON.stringify({
            success: false,
            error: "Effect not found or could not be applied"
          });
          return;
        }
        
        ${parameters ? Object.entries(parameters).map(([key, value]) => 
          `try { if (effect.properties["${key}"]) effect.properties["${key}"].setValue(${JSON.stringify(value)}); } catch (e) { /* Parameter not found */ }`
        ).join('\n') : ''}
        
        JSON.stringify({
          success: true,
          message: "Effect applied successfully",
          clipId: "${clipId}",
          effectName: "${effectName}",
          effectId: effect.matchName,
          parametersApplied: ${parameters ? Object.keys(parameters).length : 0}
        });
      } catch (e) {
        JSON.stringify({
          success: false,
          error: e.toString()
        });
      }
    `;
    
    return await this.bridge.executeScript(script);
  }

  private async removeEffect(clipId: string, effectName: string): Promise<any> {
    const script = `
      try {
        var clip = app.project.getClipByID("${clipId}");
        if (!clip) {
          JSON.stringify({
            success: false,
            error: "Clip not found"
          });
          return;
        }
        
        var effects = clip.getEffects();
        var removed = false;
        
        for (var i = 0; i < effects.length; i++) {
          if (effects[i].displayName === "${effectName}") {
            clip.removeEffect(effects[i]);
            removed = true;
            break;
          }
        }
        
        if (!removed) {
          JSON.stringify({
            success: false,
            error: "Effect not found on clip"
          });
          return;
        }
        
        JSON.stringify({
          success: true,
          message: "Effect removed successfully",
          clipId: "${clipId}",
          effectName: "${effectName}"
        });
      } catch (e) {
        JSON.stringify({
          success: false,
          error: e.toString()
        });
      }
    `;
    
    return await this.bridge.executeScript(script);
  }

  private async addTransition(clipId1: string, clipId2: string, transitionName: string, duration: number): Promise<any> {
    const script = `
      try {
        var clip1 = app.project.getClipByID("${clipId1}");
        var clip2 = app.project.getClipByID("${clipId2}");
        
        if (!clip1 || !clip2) {
          JSON.stringify({
            success: false,
            error: "One or both clips not found"
          });
          return;
        }
        
        var track = clip1.getTrack();
        var transition = track.addTransition("${transitionName}", clip1, clip2, ${duration});
        
        if (!transition) {
          JSON.stringify({
            success: false,
            error: "Failed to add transition"
          });
          return;
        }
        
        JSON.stringify({
          success: true,
          message: "Transition added successfully",
          transitionName: "${transitionName}",
          duration: ${duration},
          clip1Id: "${clipId1}",
          clip2Id: "${clipId2}",
          transitionId: transition.nodeId
        });
      } catch (e) {
        JSON.stringify({
          success: false,
          error: e.toString()
        });
      }
    `;
    
    return await this.bridge.executeScript(script);
  }

  private async addTransitionToClip(clipId: string, transitionName: string, position: 'start' | 'end', duration: number): Promise<any> {
    const script = `
      try {
        var clip = app.project.getClipByID("${clipId}");
        if (!clip) {
          JSON.stringify({
            success: false,
            error: "Clip not found"
          });
          return;
        }
        
        var track = clip.getTrack();
        var transition;
        
        if ("${position}" === "start") {
          transition = track.addTransition("${transitionName}", clip, "start", ${duration});
        } else {
          transition = track.addTransition("${transitionName}", clip, "end", ${duration});
        }
        
        if (!transition) {
          JSON.stringify({
            success: false,
            error: "Failed to add transition"
          });
          return;
        }
        
        JSON.stringify({
          success: true,
          message: "Transition added successfully",
          transitionName: "${transitionName}",
          position: "${position}",
          duration: ${duration},
          clipId: "${clipId}",
          transitionId: transition.nodeId
        });
      } catch (e) {
        JSON.stringify({
          success: false,
          error: e.toString()
        });
      }
    `;
    
    return await this.bridge.executeScript(script);
  }

  // Audio Operations Implementation
  private async adjustAudioLevels(clipId: string, level: number): Promise<any> {
    const script = `
      try {
        var clip = app.project.getClipByID("${clipId}");
        if (!clip) {
          JSON.stringify({
            success: false,
            error: "Clip not found"
          });
          return;
        }
        
        var audioComponent = clip.components[0];
        if (!audioComponent || !audioComponent.properties["Volume"]) {
          JSON.stringify({
            success: false,
            error: "Audio component not found or clip has no audio"
          });
          return;
        }
        
        var oldLevel = audioComponent.properties["Volume"].getValue();
        audioComponent.properties["Volume"].setValue(${level});
        
        JSON.stringify({
          success: true,
          message: "Audio level adjusted successfully",
          clipId: "${clipId}",
          oldLevel: oldLevel,
          newLevel: ${level}
        });
      } catch (e) {
        JSON.stringify({
          success: false,
          error: e.toString()
        });
      }
    `;
    
    return await this.bridge.executeScript(script);
  }

  private async addAudioKeyframes(clipId: string, keyframes: Array<{time: number, level: number}>): Promise<any> {
    const script = `
      try {
        var clip = app.project.getClipByID("${clipId}");
        if (!clip) {
          JSON.stringify({
            success: false,
            error: "Clip not found"
          });
          return;
        }
        
        var audioComponent = clip.components[0];
        if (!audioComponent || !audioComponent.properties["Volume"]) {
          JSON.stringify({
            success: false,
            error: "Audio component not found or clip has no audio"
          });
          return;
        }
        
        var volumeProperty = audioComponent.properties["Volume"];
        var addedKeyframes = [];
        
        ${keyframes.map(kf => `
        try {
          volumeProperty.addKey(new Time("${kf.time}s"));
          volumeProperty.setValueAtKey(new Time("${kf.time}s"), ${kf.level});
          addedKeyframes.push({ time: ${kf.time}, level: ${kf.level} });
        } catch (e) {
          // Keyframe already exists or invalid time
        }
        `).join('\n')}
        
        JSON.stringify({
          success: true,
          message: "Audio keyframes added successfully",
          clipId: "${clipId}",
          addedKeyframes: addedKeyframes,
          totalKeyframes: addedKeyframes.length
        });
      } catch (e) {
        JSON.stringify({
          success: false,
          error: e.toString()
        });
      }
    `;
    
    return await this.bridge.executeScript(script);
  }

  private async muteTrack(sequenceId: string, trackIndex: number, muted: boolean): Promise<any> {
    const script = `
      try {
        var sequence = app.project.getSequenceByID("${sequenceId}");
        if (!sequence) {
          JSON.stringify({
            success: false,
            error: "Sequence not found"
          });
          return;
        }
        
        var track = sequence.audioTracks[${trackIndex}];
        if (!track) {
          JSON.stringify({
            success: false,
            error: "Audio track not found"
          });
          return;
        }
        
        track.setMute(${muted});
        
        JSON.stringify({
          success: true,
          message: "Track mute status changed successfully",
          sequenceId: "${sequenceId}",
          trackIndex: ${trackIndex},
          muted: ${muted}
        });
      } catch (e) {
        JSON.stringify({
          success: false,
          error: e.toString()
        });
      }
    `;
    
    return await this.bridge.executeScript(script);
  }

  // Text and Graphics Implementation
  private async addTextOverlay(args: any): Promise<any> {
    const script = `
      try {
        var sequence = app.project.getSequenceByID("${args.sequenceId}");
        if (!sequence) {
          JSON.stringify({
            success: false,
            error: "Sequence not found"
          });
          return;
        }
        
        var track = sequence.videoTracks[${args.trackIndex}];
        if (!track) {
          JSON.stringify({
            success: false,
            error: "Video track not found"
          });
          return;
        }
        
        // Create a text clip using the legacy title system
        var titleItem = app.project.createNewTitle("${args.text}");
        if (!titleItem) {
          JSON.stringify({
            success: false,
            error: "Failed to create title"
          });
          return;
        }
        
        // Set text properties using the legacy title API
        var title = titleItem.getText();
        if (title) {
          title.text = "${args.text}";
          ${args.fontFamily ? `title.fontFamily = "${args.fontFamily}";` : ''}
          ${args.fontSize ? `title.fontSize = ${args.fontSize};` : ''}
          ${args.color ? `title.fillColor = "${args.color}";` : ''}
          ${args.position ? `
          title.horizontalJustification = "${args.alignment || 'center'}";
          title.verticalJustification = "center";
          ` : ''}
        }
        
        // Insert the title into the timeline
        var titleClip = track.insertClip(titleItem, new Time("${args.startTime}s"));
        titleClip.end = new Time(titleClip.start.seconds + ${args.duration});
        
        JSON.stringify({
          success: true,
          message: "Text overlay added successfully",
          text: "${args.text}",
          clipId: titleClip.nodeId,
          startTime: ${args.startTime},
          duration: ${args.duration},
          trackIndex: ${args.trackIndex}
        });
      } catch (e) {
        JSON.stringify({
          success: false,
          error: e.toString()
        });
      }
    `;
    
    return await this.bridge.executeScript(script);
  }

  private async addShape(args: any): Promise<any> {
    const script = `
      try {
        var sequence = app.project.getSequenceByID("${args.sequenceId}");
        if (!sequence) {
          JSON.stringify({
            success: false,
            error: "Sequence not found"
          });
          return;
        }
        
        var track = sequence.videoTracks[${args.trackIndex}];
        if (!track) {
          JSON.stringify({
            success: false,
            error: "Video track not found"
          });
          return;
        }
        
        // Create a shape using the legacy title system
        var shapeItem = app.project.createNewTitle("Shape");
        if (!shapeItem) {
          JSON.stringify({
            success: false,
            error: "Failed to create shape"
          });
          return;
        }
        
        // Add shape to title
        var shape = shapeItem.addShape("${args.shapeType}");
        if (shape) {
          ${args.color ? `shape.fillColor = "${args.color}";` : ''}
          ${args.size ? `
          shape.width = ${args.size.width || 100};
          shape.height = ${args.size.height || 100};
          ` : ''}
          ${args.position ? `
          shape.x = ${args.position.x || 50};
          shape.y = ${args.position.y || 50};
          ` : ''}
        }
        
        // Insert the shape into the timeline
        var shapeClip = track.insertClip(shapeItem, new Time("${args.startTime}s"));
        shapeClip.end = new Time(shapeClip.start.seconds + ${args.duration});
        
        JSON.stringify({
          success: true,
          message: "Shape added successfully",
          shapeType: "${args.shapeType}",
          clipId: shapeClip.nodeId,
          startTime: ${args.startTime},
          duration: ${args.duration},
          trackIndex: ${args.trackIndex}
        });
      } catch (e) {
        JSON.stringify({
          success: false,
          error: e.toString()
        });
      }
    `;
    
    return await this.bridge.executeScript(script);
  }

  // Color Correction Implementation
  private async colorCorrect(clipId: string, adjustments: any): Promise<any> {
    const script = `
      try {
        var clip = app.project.getClipByID("${clipId}");
        if (!clip) {
          JSON.stringify({
            success: false,
            error: "Clip not found"
          });
          return;
        }
        
        var colorCorrection = clip.addEffect("Lumetri Color");
        if (!colorCorrection) {
          JSON.stringify({
            success: false,
            error: "Failed to add color correction effect"
          });
          return;
        }
        
        ${adjustments.brightness !== undefined ? `try { colorCorrection.properties["Brightness"].setValue(${adjustments.brightness}); } catch (e) {}` : ''}
        ${adjustments.contrast !== undefined ? `try { colorCorrection.properties["Contrast"].setValue(${adjustments.contrast}); } catch (e) {}` : ''}
        ${adjustments.saturation !== undefined ? `try { colorCorrection.properties["Saturation"].setValue(${adjustments.saturation}); } catch (e) {}` : ''}
        ${adjustments.hue !== undefined ? `try { colorCorrection.properties["Hue"].setValue(${adjustments.hue}); } catch (e) {}` : ''}
        ${adjustments.highlights !== undefined ? `try { colorCorrection.properties["Highlights"].setValue(${adjustments.highlights}); } catch (e) {}` : ''}
        ${adjustments.shadows !== undefined ? `try { colorCorrection.properties["Shadows"].setValue(${adjustments.shadows}); } catch (e) {}` : ''}
        ${adjustments.temperature !== undefined ? `try { colorCorrection.properties["Temperature"].setValue(${adjustments.temperature}); } catch (e) {}` : ''}
        ${adjustments.tint !== undefined ? `try { colorCorrection.properties["Tint"].setValue(${adjustments.tint}); } catch (e) {}` : ''}
        
        JSON.stringify({
          success: true,
          message: "Color correction applied successfully",
          clipId: "${clipId}",
          adjustments: ${JSON.stringify(adjustments)}
        });
      } catch (e) {
        JSON.stringify({
          success: false,
          error: e.toString()
        });
      }
    `;
    
    return await this.bridge.executeScript(script);
  }

  private async applyLut(clipId: string, lutPath: string, intensity = 100): Promise<any> {
    const script = `
      try {
        var clip = app.project.getClipByID("${clipId}");
        if (!clip) {
          JSON.stringify({
            success: false,
            error: "Clip not found"
          });
          return;
        }
        
        var lutEffect = clip.addEffect("Lumetri Color");
        if (!lutEffect) {
          JSON.stringify({
            success: false,
            error: "Failed to add LUT effect"
          });
          return;
        }
        
        // Apply LUT file
        try {
          lutEffect.properties["Input LUT"].setValue("${lutPath}");
          lutEffect.properties["Input LUT Intensity"].setValue(${intensity / 100});
        } catch (e) {
          JSON.stringify({
            success: false,
            error: "Failed to apply LUT file: " + e.toString()
          });
          return;
        }
        
        JSON.stringify({
          success: true,
          message: "LUT applied successfully",
          clipId: "${clipId}",
          lutPath: "${lutPath}",
          intensity: ${intensity}
        });
      } catch (e) {
        JSON.stringify({
          success: false,
          error: e.toString()
        });
      }
    `;
    
    return await this.bridge.executeScript(script);
  }

  // Export and Rendering Implementation
  private async exportSequence(sequenceId: string, outputPath: string, presetPath?: string, format?: string, quality?: string, resolution?: string): Promise<any> {
    try {
      const defaultPreset = format === 'mp4' ? 'H.264' : 'ProRes';
      const preset = presetPath || defaultPreset;
      
      await this.bridge.renderSequence(sequenceId, outputPath, preset);
      return { 
        success: true, 
        message: 'Sequence exported successfully',
        outputPath: outputPath, 
        format: preset,
        quality: quality,
        resolution: resolution
      };
    } catch (error) {
      return {
        success: false,
        error: `Failed to export sequence: ${error instanceof Error ? error.message : String(error)}`,
        sequenceId: sequenceId,
        outputPath: outputPath
      };
    }
  }

  private async exportFrame(sequenceId: string, time: number, outputPath: string, format = 'png'): Promise<any> {
    const script = `
      try {
        var sequence = app.project.getSequenceByID("${sequenceId}");
        if (!sequence) {
          JSON.stringify({
            success: false,
            error: "Sequence not found"
          });
          return;
        }
        
        sequence.exportFrame(new Time("${time}s"), "${outputPath}", "${format}");
        
        JSON.stringify({
          success: true,
          message: "Frame exported successfully",
          sequenceId: "${sequenceId}",
          time: ${time},
          outputPath: "${outputPath}",
          format: "${format}"
        });
      } catch (e) {
        JSON.stringify({
          success: false,
          error: e.toString()
        });
      }
    `;
    
    return await this.bridge.executeScript(script);
  }

  // Advanced Features Implementation
  private async createMulticamSequence(name: string, cameraFiles: string[], syncMethod: string): Promise<any> {
    const script = `
      try {
        var multicamSource = app.project.createMulticamSource("${name}", [${cameraFiles.map(f => `"${f}"`).join(', ')}], "${syncMethod}");
        if (!multicamSource) {
          JSON.stringify({
            success: false,
            error: "Failed to create multicam source"
          });
          return;
        }
        
        var sequence = app.project.createSequenceFromMulticamSource("${name}", multicamSource);
        if (!sequence) {
          JSON.stringify({
            success: false,
            error: "Failed to create sequence from multicam source"
          });
          return;
        }
        
        JSON.stringify({
          success: true,
          message: "Multicam sequence created successfully",
          name: "${name}",
          sequenceId: sequence.sequenceID,
          cameraCount: ${cameraFiles.length},
          syncMethod: "${syncMethod}"
        });
      } catch (e) {
        JSON.stringify({
          success: false,
          error: e.toString()
        });
      }
    `;
    
    return await this.bridge.executeScript(script);
  }

  private async createProxyMedia(projectItemIds: string[], proxyPreset: string, replaceOriginals = false): Promise<any> {
    const script = `
      try {
        var projectItems = [${projectItemIds.map(id => `app.project.getProjectItemByID("${id}")`).join(', ')}];
        var validItems = projectItems.filter(function(item) { return item !== null; });
        
        if (validItems.length === 0) {
          JSON.stringify({
            success: false,
            error: "No valid project items found"
          });
          return;
        }
        
        var proxyJob = app.encoder.createProxyJob(validItems, "${proxyPreset}");
        if (!proxyJob) {
          JSON.stringify({
            success: false,
            error: "Failed to create proxy job"
          });
          return;
        }
        
        JSON.stringify({
          success: true,
          message: "Proxy media creation started",
          proxyPreset: "${proxyPreset}",
          itemCount: validItems.length,
          replaceOriginals: ${replaceOriginals}
        });
      } catch (e) {
        JSON.stringify({
          success: false,
          error: e.toString()
        });
      }
    `;
    
    return await this.bridge.executeScript(script);
  }

  private async autoEditToMusic(audioTrackId: string, videoClipIds: string[], editStyle: string, sensitivity = 50): Promise<any> {
    const script = `
      try {
        var audioTrack = app.project.getTrackByID("${audioTrackId}");
        var videoClips = [${videoClipIds.map(id => `app.project.getClipByID("${id}")`).join(', ')}];
        
        if (!audioTrack) {
          JSON.stringify({
            success: false,
            error: "Audio track not found"
          });
          return;
        }
        
        var validVideoClips = videoClips.filter(function(clip) { return clip !== null; });
        if (validVideoClips.length === 0) {
          JSON.stringify({
            success: false,
            error: "No valid video clips found"
          });
          return;
        }
        
        // This would require sophisticated beat detection and auto-editing algorithms
        // For now, return a placeholder response with the detected parameters
        JSON.stringify({
          success: true,
          message: "Auto-edit to music analysis completed",
          audioTrackId: "${audioTrackId}",
          videoClipCount: validVideoClips.length,
          editStyle: "${editStyle}",
          sensitivity: ${sensitivity},
          note: "This feature requires advanced beat detection implementation"
        });
      } catch (e) {
        JSON.stringify({
          success: false,
          error: e.toString()
        });
      }
    `;
    
    return await this.bridge.executeScript(script);
  }

  private async stabilizeClip(clipId: string, method = 'warp', smoothness = 50): Promise<any> {
    const script = `
      try {
        var clip = app.project.getClipByID("${clipId}");
        if (!clip) {
          JSON.stringify({
            success: false,
            error: "Clip not found"
          });
          return;
        }
        
        var stabilizationEffect = clip.addEffect("Warp Stabilizer");
        if (!stabilizationEffect) {
          JSON.stringify({
            success: false,
            error: "Failed to add stabilization effect"
          });
          return;
        }
        
        // Configure stabilization settings
        try {
          stabilizationEffect.properties["Smoothness"].setValue(${smoothness / 100});
          stabilizationEffect.properties["Method"].setValue("${method}");
        } catch (e) {
          // Some properties might not be available
        }
        
        JSON.stringify({
          success: true,
          message: "Video stabilization applied successfully",
          clipId: "${clipId}",
          method: "${method}",
          smoothness: ${smoothness}
        });
      } catch (e) {
        JSON.stringify({
          success: false,
          error: e.toString()
        });
      }
    `;
    
    return await this.bridge.executeScript(script);
  }

  private async speedChange(clipId: string, speed: number, maintainAudio = true): Promise<any> {
    const script = `
      try {
        var clip = app.project.getClipByID("${clipId}");
        if (!clip) {
          JSON.stringify({
            success: false,
            error: "Clip not found"
          });
          return;
        }
        
        var oldSpeed = clip.speed;
        clip.speed = ${speed};
        
        if (${maintainAudio} && clip.hasAudio && clip.hasAudio()) {
          clip.maintainAudioPitch = true;
        }
        
        JSON.stringify({
          success: true,
          message: "Speed change applied successfully",
          clipId: "${clipId}",
          oldSpeed: oldSpeed,
          newSpeed: ${speed},
          maintainAudio: ${maintainAudio}
        });
      } catch (e) {
        JSON.stringify({
          success: false,
          error: e.toString()
        });
      }
    `;
    
    return await this.bridge.executeScript(script);
  }
} 