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

      // Markers
      {
        name: 'add_marker',
        description: 'Adds a marker to the timeline for navigation or notes.',
        inputSchema: z.object({
          sequenceId: z.string().describe('The ID of the sequence to add the marker to'),
          time: z.number().describe('The time in seconds where the marker should be placed'),
          name: z.string().describe('The name/label for the marker'),
          comment: z.string().optional().describe('Optional comment or description for the marker'),
          color: z.string().optional().describe('Marker color (e.g., "red", "green", "blue")'),
          duration: z.number().optional().describe('Duration in seconds for a span marker (0 for point marker)')
        })
      },
      {
        name: 'delete_marker',
        description: 'Deletes a marker from the timeline.',
        inputSchema: z.object({
          sequenceId: z.string().describe('The ID of the sequence'),
          markerId: z.string().describe('The ID of the marker to delete')
        })
      },
      {
        name: 'update_marker',
        description: 'Updates an existing marker\'s properties.',
        inputSchema: z.object({
          sequenceId: z.string().describe('The ID of the sequence'),
          markerId: z.string().describe('The ID of the marker to update'),
          name: z.string().optional().describe('New name for the marker'),
          comment: z.string().optional().describe('New comment'),
          color: z.string().optional().describe('New color')
        })
      },
      {
        name: 'list_markers',
        description: 'Lists all markers in a sequence.',
        inputSchema: z.object({
          sequenceId: z.string().describe('The ID of the sequence')
        })
      },

      // Track Management
      {
        name: 'add_track',
        description: 'Adds a new video or audio track to the sequence.',
        inputSchema: z.object({
          sequenceId: z.string().describe('The ID of the sequence'),
          trackType: z.enum(['video', 'audio']).describe('Type of track to add'),
          position: z.enum(['above', 'below']).optional().describe('Where to add the track relative to existing tracks')
        })
      },
      {
        name: 'delete_track',
        description: 'Deletes a track from the sequence.',
        inputSchema: z.object({
          sequenceId: z.string().describe('The ID of the sequence'),
          trackType: z.enum(['video', 'audio']).describe('Type of track'),
          trackIndex: z.number().describe('The index of the track to delete')
        })
      },
      {
        name: 'lock_track',
        description: 'Locks or unlocks a track to prevent/allow editing.',
        inputSchema: z.object({
          sequenceId: z.string().describe('The ID of the sequence'),
          trackType: z.enum(['video', 'audio']).describe('Type of track'),
          trackIndex: z.number().describe('The index of the track'),
          locked: z.boolean().describe('Whether to lock (true) or unlock (false)')
        })
      },
      {
        name: 'toggle_track_visibility',
        description: 'Shows or hides a video track.',
        inputSchema: z.object({
          sequenceId: z.string().describe('The ID of the sequence'),
          trackIndex: z.number().describe('The index of the video track'),
          visible: z.boolean().describe('Whether to show (true) or hide (false)')
        })
      },

      {
        name: 'link_audio_video',
        description: 'Links or unlinks audio and video components of a clip.',
        inputSchema: z.object({
          clipId: z.string().describe('The ID of the clip'),
          linked: z.boolean().describe('Whether to link (true) or unlink (false)')
        })
      },
      {
        name: 'apply_audio_effect',
        description: 'Applies an audio effect to a clip.',
        inputSchema: z.object({
          clipId: z.string().describe('The ID of the audio clip'),
          effectName: z.string().describe('Name of the audio effect (e.g., "Compressor", "EQ", "Reverb")'),
          parameters: z.record(z.any()).optional().describe('Effect parameters')
        })
      },

      // Nested Sequences
      {
        name: 'create_nested_sequence',
        description: 'Creates a nested sequence from selected clips.',
        inputSchema: z.object({
          clipIds: z.array(z.string()).describe('Array of clip IDs to nest'),
          name: z.string().describe('Name for the nested sequence')
        })
      },
      {
        name: 'unnest_sequence',
        description: 'Breaks apart a nested sequence into individual clips.',
        inputSchema: z.object({
          nestedSequenceClipId: z.string().describe('The ID of the nested sequence clip')
        })
      },

      // Additional Clip Operations
      {
        name: 'duplicate_clip',
        description: 'Duplicates a clip on the timeline.',
        inputSchema: z.object({
          clipId: z.string().describe('The ID of the clip to duplicate'),
          offset: z.number().optional().describe('Time offset in seconds for the duplicate (default: places immediately after original)')
        })
      },
      {
        name: 'reverse_clip',
        description: 'Reverses the playback of a clip.',
        inputSchema: z.object({
          clipId: z.string().describe('The ID of the clip to reverse'),
          maintainAudioPitch: z.boolean().optional().describe('Whether to maintain audio pitch (default: true)')
        })
      },
      {
        name: 'enable_disable_clip',
        description: 'Enables or disables a clip on the timeline.',
        inputSchema: z.object({
          clipId: z.string().describe('The ID of the clip'),
          enabled: z.boolean().describe('Whether to enable (true) or disable (false)')
        })
      },
      {
        name: 'replace_clip',
        description: 'Replaces a clip on the timeline with another media item.',
        inputSchema: z.object({
          clipId: z.string().describe('The ID of the clip to replace'),
          newProjectItemId: z.string().describe('The ID of the new project item to use'),
          preserveEffects: z.boolean().optional().describe('Whether to keep effects and settings (default: true)')
        })
      },

      // Project Settings
      {
        name: 'get_sequence_settings',
        description: 'Gets the settings for a sequence (resolution, framerate, etc.).',
        inputSchema: z.object({
          sequenceId: z.string().describe('The ID of the sequence')
        })
      },
      {
        name: 'set_sequence_settings',
        description: 'Updates sequence settings.',
        inputSchema: z.object({
          sequenceId: z.string().describe('The ID of the sequence'),
          settings: z.object({
            width: z.number().optional().describe('Frame width'),
            height: z.number().optional().describe('Frame height'),
            frameRate: z.number().optional().describe('Frame rate'),
            pixelAspectRatio: z.number().optional().describe('Pixel aspect ratio')
          }).describe('Settings to update')
        })
      },
      {
        name: 'get_clip_properties',
        description: 'Gets detailed properties of a clip.',
        inputSchema: z.object({
          clipId: z.string().describe('The ID of the clip')
        })
      },
      {
        name: 'set_clip_properties',
        description: 'Sets properties of a clip.',
        inputSchema: z.object({
          clipId: z.string().describe('The ID of the clip'),
          properties: z.object({
            opacity: z.number().optional().describe('Opacity 0-100'),
            scale: z.number().optional().describe('Scale percentage'),
            rotation: z.number().optional().describe('Rotation in degrees'),
            position: z.object({
              x: z.number().optional(),
              y: z.number().optional()
            }).optional().describe('Position coordinates')
          }).describe('Properties to set')
        })
      },

      // Render Queue
      {
        name: 'add_to_render_queue',
        description: 'Adds a sequence to the Adobe Media Encoder render queue.',
        inputSchema: z.object({
          sequenceId: z.string().describe('The ID of the sequence to render'),
          outputPath: z.string().describe('Output file path'),
          presetPath: z.string().optional().describe('Export preset file path'),
          startImmediately: z.boolean().optional().describe('Whether to start rendering immediately (default: false)')
        })
      },
      {
        name: 'get_render_queue_status',
        description: 'Gets the status of items in the render queue.',
        inputSchema: z.object({})
      },

      // Advanced Features
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

        // Markers
        case 'add_marker':
          return await this.addMarker(args.sequenceId, args.time, args.name, args.comment, args.color, args.duration);
        case 'delete_marker':
          return await this.deleteMarker(args.sequenceId, args.markerId);
        case 'update_marker':
          return await this.updateMarker(args.sequenceId, args.markerId, args);
        case 'list_markers':
          return await this.listMarkers(args.sequenceId);

        // Track Management
        case 'add_track':
          return await this.addTrack(args.sequenceId, args.trackType, args.position);
        case 'delete_track':
          return await this.deleteTrack(args.sequenceId, args.trackType, args.trackIndex);
        case 'lock_track':
          return await this.lockTrack(args.sequenceId, args.trackType, args.trackIndex, args.locked);
        case 'toggle_track_visibility':
          return await this.toggleTrackVisibility(args.sequenceId, args.trackIndex, args.visible);

        case 'link_audio_video':
          return await this.linkAudioVideo(args.clipId, args.linked);
        case 'apply_audio_effect':
          return await this.applyAudioEffect(args.clipId, args.effectName, args.parameters);

        // Nested Sequences
        case 'create_nested_sequence':
          return await this.createNestedSequence(args.clipIds, args.name);
        case 'unnest_sequence':
          return await this.unnestSequence(args.nestedSequenceClipId);

        // Additional Clip Operations
        case 'duplicate_clip':
          return await this.duplicateClip(args.clipId, args.offset);
        case 'reverse_clip':
          return await this.reverseClip(args.clipId, args.maintainAudioPitch);
        case 'enable_disable_clip':
          return await this.enableDisableClip(args.clipId, args.enabled);
        case 'replace_clip':
          return await this.replaceClip(args.clipId, args.newProjectItemId, args.preserveEffects);

        // Project Settings
        case 'get_sequence_settings':
          return await this.getSequenceSettings(args.sequenceId);
        case 'set_sequence_settings':
          return await this.setSequenceSettings(args.sequenceId, args.settings);
        case 'get_clip_properties':
          return await this.getClipProperties(args.clipId);
        case 'set_clip_properties':
          return await this.setClipProperties(args.clipId, args.properties);

        // Render Queue
        case 'add_to_render_queue':
          return await this.addToRenderQueue(args.sequenceId, args.outputPath, args.presetPath, args.startImmediately);
        case 'get_render_queue_status':
          return await this.getRenderQueueStatus();

        // Advanced Features
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
  private async listProjectItems(includeBins = true, _includeMetadata = false): Promise<any> {
    const script = `
      try {
        function walkItems(parent, results, bins) {
          for (var i = 0; i < parent.children.numItems; i++) {
            var item = parent.children[i];
            var info = {
              id: item.nodeId,
              name: item.name,
              type: item.type === 2 ? 'bin' : (item.isSequence() ? 'sequence' : 'footage'),
              treePath: item.treePath
            };
            try { info.mediaPath = item.getMediaPath(); } catch(e) {}
            if (item.type === 2) {
              bins.push(info);
              walkItems(item, results, bins);
            } else {
              results.push(info);
            }
          }
        }
        var items = []; var bins = [];
        walkItems(app.project.rootItem, items, bins);
        return JSON.stringify({
          success: true,
          items: items,
          bins: ${includeBins} ? bins : [],
          totalItems: items.length,
          totalBins: bins.length
        });
      } catch (e) {
        return JSON.stringify({
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
            duration: __ticksToSeconds(seq.end),
            width: seq.frameSizeHorizontal,
            height: seq.frameSizeVertical,
            timebase: seq.timebase,
            videoTrackCount: seq.videoTracks.numTracks,
            audioTrackCount: seq.audioTracks.numTracks
          });
        }

        return JSON.stringify({
          success: true,
          sequences: sequences,
          count: sequences.length
        });
      } catch (e) {
        return JSON.stringify({
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
        var sequence = __findSequence("${sequenceId}");
        if (!sequence) {
          sequence = app.project.activeSequence;
        }
        if (!sequence) {
          return JSON.stringify({
            success: false,
            error: "Sequence not found"
          });
        }

        var videoTracks = [];
        var audioTracks = [];

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
            clips: clips,
            clipCount: clips.length
          });
        }

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
            clips: clips,
            clipCount: clips.length
          });
        }

        return JSON.stringify({
          success: true,
          sequenceId: "${sequenceId}",
          sequenceName: sequence.name,
          videoTracks: videoTracks,
          audioTracks: audioTracks,
          totalVideoTracks: videoTracks.length,
          totalAudioTracks: audioTracks.length
        });
      } catch (e) {
        return JSON.stringify({
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
        var hasActive = project.activeSequence ? true : false;
        return JSON.stringify({
          success: true,
          name: project.name,
          path: project.path,
          activeSequence: hasActive ? {
            id: project.activeSequence.sequenceID,
            name: project.activeSequence.name
          } : null,
          itemCount: project.rootItem.children.numItems,
          sequenceCount: project.sequences.numSequences,
          hasActiveSequence: hasActive
        });
      } catch (e) {
        return JSON.stringify({
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
        
        return JSON.stringify({
          success: true,
          message: "Project saved as: " + newPath,
          newPath: newPath
        });
      } catch (e) {
        return JSON.stringify({
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
        
        return JSON.stringify({
          success: true,
          importedItems: importedItems,
          errors: errors,
          totalImported: importedItems.length,
          totalErrors: errors.length
        });
      } catch (e) {
        return JSON.stringify({
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

        return JSON.stringify({
          success: true,
          binName: "${name}",
          binId: newBin.nodeId,
          parentBin: ${parentBinName ? `"${parentBinName}"` : '"Root"'}
        });
      } catch (e) {
        return JSON.stringify({
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
        var originalSeq = __findSequence("${sequenceId}");
        if (!originalSeq) return JSON.stringify({ success: false, error: "Sequence not found" });
        var newSeq = originalSeq.clone();
        newSeq.name = "${newName}";
        return JSON.stringify({
          success: true,
          originalSequenceId: "${sequenceId}",
          newSequenceId: newSeq.sequenceID,
          newName: "${newName}"
        });
      } catch (e) {
        return JSON.stringify({ success: false, error: e.toString() });
      }
    `;

    return await this.bridge.executeScript(script);
  }

  private async deleteSequence(sequenceId: string): Promise<any> {
    const script = `
      try {
        var sequence = __findSequence("${sequenceId}");
        if (!sequence) return JSON.stringify({ success: false, error: "Sequence not found" });
        var sequenceName = sequence.name;
        app.project.deleteSequence(sequence);
        return JSON.stringify({
          success: true,
          message: "Sequence deleted successfully",
          deletedSequenceId: "${sequenceId}",
          deletedSequenceName: sequenceName
        });
      } catch (e) {
        return JSON.stringify({ success: false, error: e.toString() });
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
        var info = __findClip("${clipId}");
        if (!info) return JSON.stringify({ success: false, error: "Clip not found" });
        var clip = info.clip;
        var clipName = clip.name;
        var isRipple = "${deleteMode}" === "ripple";
        clip.remove(isRipple, true);
        return JSON.stringify({
          success: true,
          message: "Clip removed from timeline",
          clipId: "${clipId}",
          clipName: clipName,
          deleteMode: "${deleteMode}"
        });
      } catch (e) {
        return JSON.stringify({
          success: false,
          error: e.toString()
        });
      }
    `;

    return await this.bridge.executeScript(script);
  }

  private async moveClip(clipId: string, newTime: number, _newTrackIndex?: number): Promise<any> {
    const script = `
      try {
        var info = __findClip("${clipId}");
        if (!info) return JSON.stringify({ success: false, error: "Clip not found" });
        var clip = info.clip;
        var oldTime = clip.start.seconds;
        var shiftAmount = ${newTime} - oldTime;
        clip.move(shiftAmount);
        return JSON.stringify({
          success: true,
          message: "Clip moved successfully",
          clipId: "${clipId}",
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

    return await this.bridge.executeScript(script);
  }

  private async trimClip(clipId: string, inPoint?: number, outPoint?: number, duration?: number): Promise<any> {
    const script = `
      try {
        var info = __findClip("${clipId}");
        if (!info) return JSON.stringify({ success: false, error: "Clip not found" });
        var clip = info.clip;
        var oldInPoint = clip.inPoint.seconds;
        var oldOutPoint = clip.outPoint.seconds;
        var oldDuration = clip.duration.seconds;
        ${inPoint !== undefined ? `clip.inPoint = new Time("${inPoint}s");` : ''}
        ${outPoint !== undefined ? `clip.outPoint = new Time("${outPoint}s");` : ''}
        ${duration !== undefined ? `clip.outPoint = new Time(clip.inPoint.seconds + ${duration});` : ''}
        return JSON.stringify({
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
        return JSON.stringify({
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
        app.enableQE();
        var info = __findClip("${clipId}");
        if (!info) return JSON.stringify({ success: false, error: "Clip not found" });
        var splitSeconds = info.clip.start.seconds + ${splitTime};
        var seq = app.project.activeSequence;
        var fps = seq.timebase ? (254016000000 / parseInt(seq.timebase, 10)) : 30;
        var totalFrames = Math.round(splitSeconds * fps);
        var hours = Math.floor(totalFrames / (fps * 3600));
        var mins = Math.floor((totalFrames % (fps * 3600)) / (fps * 60));
        var secs = Math.floor((totalFrames % (fps * 60)) / fps);
        var frames = Math.round(totalFrames % fps);
        function pad(n) { return n < 10 ? "0" + n : "" + n; }
        var tc = pad(hours) + ":" + pad(mins) + ":" + pad(secs) + ":" + pad(frames);
        var qeSeq = qe.project.getActiveSequence();
        var qeTrack = info.trackType === 'video' ? qeSeq.getVideoTrackAt(info.trackIndex) : qeSeq.getAudioTrackAt(info.trackIndex);
        qeTrack.razor(tc);
        return JSON.stringify({ success: true, message: "Clip split at " + tc, splitTime: ${splitTime}, timecode: tc });
      } catch (e) {
        return JSON.stringify({ success: false, error: "QE DOM error: " + e.toString() });
      }
    `;

    return await this.bridge.executeScript(script);
  }

  // Effects and Transitions Implementation
  private async applyEffect(clipId: string, effectName: string, _parameters?: Record<string, any>): Promise<any> {
    const script = `
      try {
        app.enableQE();
        var info = __findClip("${clipId}");
        if (!info) return JSON.stringify({ success: false, error: "Clip not found" });
        var qeSeq = qe.project.getActiveSequence();
        var qeTrack, effect;
        if (info.trackType === 'video') {
          qeTrack = qeSeq.getVideoTrackAt(info.trackIndex);
          effect = qe.project.getVideoEffectByName("${effectName}");
        } else {
          qeTrack = qeSeq.getAudioTrackAt(info.trackIndex);
          effect = qe.project.getAudioEffectByName("${effectName}");
        }
        if (!effect) return JSON.stringify({ success: false, error: "Effect not found: ${effectName}. Use list_available_effects to see available effects." });
        var qeClip = qeTrack.getItemAt(info.clipIndex);
        if (info.trackType === 'video') { qeClip.addVideoEffect(effect); } else { qeClip.addAudioEffect(effect); }
        return JSON.stringify({ success: true, message: "Effect applied", clipId: "${clipId}", effectName: "${effectName}" });
      } catch (e) {
        return JSON.stringify({ success: false, error: "QE DOM error: " + e.toString() });
      }
    `;

    return await this.bridge.executeScript(script);
  }

  private async removeEffect(clipId: string, effectName: string): Promise<any> {
    const script = `
      try {
        var info = __findClip("${clipId}");
        if (!info) return JSON.stringify({ success: false, error: "Clip not found" });
        var clip = info.clip;
        var found = false;
        for (var i = 0; i < clip.components.numItems; i++) {
          if (clip.components[i].displayName === "${effectName}" || clip.components[i].matchName === "${effectName}") {
            found = true;
            break;
          }
        }
        return JSON.stringify({
          success: false,
          error: "Effect removal is not supported by the ExtendScript API. The effect '${effectName}' was " + (found ? "found" : "not found") + " on this clip.",
          note: "Remove effects manually in Premiere Pro"
        });
      } catch (e) {
        return JSON.stringify({ success: false, error: e.toString() });
      }
    `;

    return await this.bridge.executeScript(script);
  }

  private async addTransition(clipId1: string, _clipId2: string, transitionName: string, duration: number): Promise<any> {
    const script = `
      try {
        app.enableQE();
        var info1 = __findClip("${clipId1}");
        if (!info1) return JSON.stringify({ success: false, error: "First clip not found" });
        var qeSeq = qe.project.getActiveSequence();
        var qeTrack = qeSeq.getVideoTrackAt(info1.trackIndex);
        var qeClip = qeTrack.getItemAt(info1.clipIndex);
        var transition = qe.project.getVideoTransitionByName("${transitionName}");
        if (!transition) return JSON.stringify({ success: false, error: "Transition not found: ${transitionName}. Use list_available_transitions." });
        var seq = app.project.activeSequence;
        var fps = seq.timebase ? (254016000000 / parseInt(seq.timebase, 10)) : 30;
        var frames = Math.round(${duration} * fps);
        qeClip.addTransition(transition, true, frames + ":00", "0:00", 0.5, false, true);
        return JSON.stringify({ success: true, message: "Transition added", transitionName: "${transitionName}", duration: ${duration} });
      } catch (e) {
        return JSON.stringify({ success: false, error: "QE DOM error: " + e.toString() });
      }
    `;

    return await this.bridge.executeScript(script);
  }

  private async addTransitionToClip(clipId: string, transitionName: string, position: 'start' | 'end', duration: number): Promise<any> {
    const atEnd = position === 'end';
    const script = `
      try {
        app.enableQE();
        var info = __findClip("${clipId}");
        if (!info) return JSON.stringify({ success: false, error: "Clip not found" });
        var qeSeq = qe.project.getActiveSequence();
        var qeTrack = info.trackType === 'video' ? qeSeq.getVideoTrackAt(info.trackIndex) : qeSeq.getAudioTrackAt(info.trackIndex);
        var qeClip = qeTrack.getItemAt(info.clipIndex);
        var transition = info.trackType === 'video'
          ? qe.project.getVideoTransitionByName("${transitionName}")
          : qe.project.getAudioTransitionByName("${transitionName}");
        if (!transition) return JSON.stringify({ success: false, error: "Transition not found: ${transitionName}" });
        var seq = app.project.activeSequence;
        var fps = seq.timebase ? (254016000000 / parseInt(seq.timebase, 10)) : 30;
        var frames = Math.round(${duration} * fps);
        qeClip.addTransition(transition, ${atEnd}, frames + ":00", "0:00", 0.5, true, true);
        return JSON.stringify({ success: true, message: "Transition added at ${position}", transitionName: "${transitionName}", duration: ${duration} });
      } catch (e) {
        return JSON.stringify({ success: false, error: "QE DOM error: " + e.toString() });
      }
    `;

    return await this.bridge.executeScript(script);
  }

  // Audio Operations Implementation
  private async adjustAudioLevels(clipId: string, level: number): Promise<any> {
    const script = `
      try {
        var info = __findClip("${clipId}");
        if (!info) return JSON.stringify({ success: false, error: "Clip not found" });
        var clip = info.clip;
        var found = false;
        for (var i = 0; i < clip.components.numItems; i++) {
          var comp = clip.components[i];
          for (var j = 0; j < comp.properties.numItems; j++) {
            if (comp.properties[j].displayName === "Volume") {
              var oldLevel = comp.properties[j].getValue();
              comp.properties[j].setValue(${level}, true);
              found = true;
              return JSON.stringify({
                success: true,
                message: "Audio level adjusted successfully",
                clipId: "${clipId}",
                oldLevel: oldLevel,
                newLevel: ${level}
              });
            }
          }
        }
        if (!found) return JSON.stringify({ success: false, error: "Volume property not found on clip" });
      } catch (e) {
        return JSON.stringify({
          success: false,
          error: e.toString()
        });
      }
    `;

    return await this.bridge.executeScript(script);
  }

  private async addAudioKeyframes(clipId: string, keyframes: Array<{time: number, level: number}>): Promise<any> {
    const keyframeCode = keyframes.map(kf => `
        try {
          volumeProperty.addKey(${kf.time});
          volumeProperty.setValueAtKey(${kf.time}, ${kf.level});
          addedKeyframes.push({ time: ${kf.time}, level: ${kf.level} });
        } catch (e2) {}
    `).join('\n');

    const script = `
      try {
        var info = __findClip(${JSON.stringify(clipId)});
        if (!info) return JSON.stringify({ success: false, error: "Clip not found" });
        var clip = info.clip;
        var volumeProperty = null;
        for (var i = 0; i < clip.components.numItems; i++) {
          var comp = clip.components[i];
          for (var j = 0; j < comp.properties.numItems; j++) {
            if (comp.properties[j].displayName === "Volume") {
              volumeProperty = comp.properties[j];
              break;
            }
          }
          if (volumeProperty) break;
        }
        if (!volumeProperty) return JSON.stringify({ success: false, error: "Volume property not found" });
        var addedKeyframes = [];
        ${keyframeCode}
        return JSON.stringify({
          success: true,
          message: "Audio keyframes added",
          clipId: ${JSON.stringify(clipId)},
          addedKeyframes: addedKeyframes,
          totalKeyframes: addedKeyframes.length
        });
      } catch (e) {
        return JSON.stringify({ success: false, error: e.toString() });
      }
    `;

    return await this.bridge.executeScript(script);
  }

  private async muteTrack(sequenceId: string, trackIndex: number, muted: boolean): Promise<any> {
    const script = `
      try {
        var sequence = __findSequence("${sequenceId}");
        if (!sequence) sequence = app.project.activeSequence;
        if (!sequence) return JSON.stringify({ success: false, error: "Sequence not found" });
        var track = sequence.audioTracks[${trackIndex}];
        if (!track) return JSON.stringify({ success: false, error: "Audio track not found" });
        track.setMute(${muted ? 1 : 0});
        return JSON.stringify({
          success: true,
          message: "Track mute status changed",
          sequenceId: "${sequenceId}",
          trackIndex: ${trackIndex},
          muted: ${muted}
        });
      } catch (e) {
        return JSON.stringify({ success: false, error: e.toString() });
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
          return JSON.stringify({
            success: false,
            error: "Sequence not found"
          });
          return;
        }
        
        var track = sequence.videoTracks[${args.trackIndex}];
        if (!track) {
          return JSON.stringify({
            success: false,
            error: "Video track not found"
          });
          return;
        }
        
        // Create a text clip using the legacy title system
        var titleItem = app.project.createNewTitle("${args.text}");
        if (!titleItem) {
          return JSON.stringify({
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
        
        return JSON.stringify({
          success: true,
          message: "Text overlay added successfully",
          text: "${args.text}",
          clipId: titleClip.nodeId,
          startTime: ${args.startTime},
          duration: ${args.duration},
          trackIndex: ${args.trackIndex}
        });
      } catch (e) {
        return JSON.stringify({
          success: false,
          error: e.toString()
        });
      }
    `;
    
    return await this.bridge.executeScript(script);
  }

  // Color Correction Implementation
  private async colorCorrect(clipId: string, adjustments: any): Promise<any> {
    const paramCode = [
      adjustments.brightness !== undefined ? `if (p.displayName === "Brightness") p.setValue(${adjustments.brightness}, true);` : '',
      adjustments.contrast !== undefined ? `if (p.displayName === "Contrast") p.setValue(${adjustments.contrast}, true);` : '',
      adjustments.saturation !== undefined ? `if (p.displayName === "Saturation") p.setValue(${adjustments.saturation}, true);` : '',
      adjustments.hue !== undefined ? `if (p.displayName === "Hue") p.setValue(${adjustments.hue}, true);` : '',
      adjustments.temperature !== undefined ? `if (p.displayName === "Temperature") p.setValue(${adjustments.temperature}, true);` : '',
      adjustments.tint !== undefined ? `if (p.displayName === "Tint") p.setValue(${adjustments.tint}, true);` : '',
    ].filter(Boolean).join('\n              ');

    const script = `
      try {
        app.enableQE();
        var info = __findClip("${clipId}");
        if (!info) return JSON.stringify({ success: false, error: "Clip not found" });
        var qeSeq = qe.project.getActiveSequence();
        var qeTrack = qeSeq.getVideoTrackAt(info.trackIndex);
        var qeClip = qeTrack.getItemAt(info.clipIndex);
        var effect = qe.project.getVideoEffectByName("Lumetri Color");
        if (!effect) return JSON.stringify({ success: false, error: "Lumetri Color effect not found" });
        qeClip.addVideoEffect(effect);
        var clip = info.clip;
        var lastComp = clip.components[clip.components.numItems - 1];
        for (var j = 0; j < lastComp.properties.numItems; j++) {
          var p = lastComp.properties[j];
          try {
            ${paramCode}
          } catch (e2) {}
        }
        return JSON.stringify({ success: true, message: "Color correction applied", clipId: "${clipId}" });
      } catch (e) {
        return JSON.stringify({ success: false, error: e.toString() });
      }
    `;

    return await this.bridge.executeScript(script);
  }

  private async applyLut(clipId: string, lutPath: string, _intensity = 100): Promise<any> {
    const script = `
      try {
        app.enableQE();
        var info = __findClip("${clipId}");
        if (!info) return JSON.stringify({ success: false, error: "Clip not found" });
        var qeSeq = qe.project.getActiveSequence();
        var qeTrack = qeSeq.getVideoTrackAt(info.trackIndex);
        var qeClip = qeTrack.getItemAt(info.clipIndex);
        var effect = qe.project.getVideoEffectByName("Lumetri Color");
        if (!effect) return JSON.stringify({ success: false, error: "Lumetri Color not found" });
        qeClip.addVideoEffect(effect);
        var clip = info.clip;
        var lastComp = clip.components[clip.components.numItems - 1];
        for (var j = 0; j < lastComp.properties.numItems; j++) {
          var p = lastComp.properties[j];
          try {
            if (p.displayName === "Input LUT") p.setValue("${lutPath}", true);
          } catch (e2) {}
        }
        return JSON.stringify({ success: true, message: "LUT applied", clipId: "${clipId}", lutPath: "${lutPath}" });
      } catch (e) {
        return JSON.stringify({ success: false, error: e.toString() });
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
        var sequence = __findSequence("${sequenceId}");
        if (!sequence) sequence = app.project.activeSequence;
        if (!sequence) return JSON.stringify({ success: false, error: "Sequence not found" });
        sequence.exportFramePNG(${time}, "${outputPath}");
        return JSON.stringify({
          success: true,
          message: "Frame exported successfully",
          sequenceId: "${sequenceId}",
          time: ${time},
          outputPath: "${outputPath}",
          format: "${format}"
        });
      } catch (e) {
        return JSON.stringify({ success: false, error: e.toString() });
      }
    `;

    return await this.bridge.executeScript(script);
  }

  // Advanced Features Implementation
  private async stabilizeClip(clipId: string, _method = 'warp', smoothness = 50): Promise<any> {
    const script = `
      try {
        app.enableQE();
        var info = __findClip("${clipId}");
        if (!info) return JSON.stringify({ success: false, error: "Clip not found" });
        var qeSeq = qe.project.getActiveSequence();
        var qeTrack = qeSeq.getVideoTrackAt(info.trackIndex);
        var qeClip = qeTrack.getItemAt(info.clipIndex);
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
        return JSON.stringify({ success: true, message: "Warp Stabilizer applied", clipId: "${clipId}", smoothness: ${smoothness} });
      } catch (e) {
        return JSON.stringify({ success: false, error: e.toString() });
      }
    `;

    return await this.bridge.executeScript(script);
  }

  private async speedChange(clipId: string, speed: number, maintainAudio = true): Promise<any> {
    const script = `
      try {
        app.enableQE();
        var info = __findClip("${clipId}");
        if (!info) return JSON.stringify({ success: false, error: "Clip not found" });
        var oldSpeed = info.clip.getSpeed();
        var qeSeq = qe.project.getActiveSequence();
        var qeTrack = info.trackType === 'video' ? qeSeq.getVideoTrackAt(info.trackIndex) : qeSeq.getAudioTrackAt(info.trackIndex);
        var qeClip = qeTrack.getItemAt(info.clipIndex);
        try { qeClip.setSpeed(${speed}, ${maintainAudio}); } catch(e2) {
          return JSON.stringify({ success: false, error: "Speed change via QE DOM not available: " + e2.toString() });
        }
        return JSON.stringify({ success: true, oldSpeed: oldSpeed, newSpeed: ${speed} });
      } catch (e) {
        return JSON.stringify({ success: false, error: e.toString() });
      }
    `;

    return await this.bridge.executeScript(script);
  }

  // ============================================
  // NEW TOOLS IMPLEMENTATION
  // ============================================

  // Markers Implementation
  private async addMarker(_sequenceId: string, time: number, name: string, comment?: string, color?: string, duration?: number): Promise<any> {
    const script = `
      try {
        var sequence = app.project.activeSequence;
        if (!sequence) {
          return JSON.stringify({
            success: false,
            error: "No active sequence"
          });
        } else {
          var marker = sequence.markers.createMarker(${time});
          marker.name = ${JSON.stringify(name)};
          ${comment ? `marker.comments = ${JSON.stringify(comment)};` : ''}
          ${color ? `marker.setColorByIndex(${color === 'red' ? '5' : color === 'green' ? '3' : color === 'blue' ? '1' : '0'});` : ''}
          ${duration && duration > 0 ? `marker.end = ${time + duration};` : ''}

          return JSON.stringify({
            success: true,
            markerId: marker.guid,
            message: "Marker added successfully"
          });
        }
      } catch (e) {
        return JSON.stringify({
          success: false,
          error: e.toString()
        });
      }
    `;
    return await this.bridge.executeScript(script);
  }

  private async deleteMarker(_sequenceId: string, markerId: string): Promise<any> {
    const script = `
      try {
        var sequence = app.project.activeSequence;
        if (!sequence) {
          return JSON.stringify({
            success: false,
            error: "No active sequence"
          });
        } else {
          var deleted = false;
          for (var i = 0; i < sequence.markers.numMarkers; i++) {
            if (sequence.markers[i].guid === ${JSON.stringify(markerId)}) {
              sequence.markers.deleteMarker(i);
              deleted = true;
              break;
            }
          }

          return JSON.stringify({
            success: deleted,
            message: deleted ? "Marker deleted successfully" : "Marker not found"
          });
        }
      } catch (e) {
        return JSON.stringify({
          success: false,
          error: e.toString()
        });
      }
    `;
    return await this.bridge.executeScript(script);
  }

  private async updateMarker(_sequenceId: string, markerId: string, updates: any): Promise<any> {
    const script = `
      try {
        var sequence = app.project.activeSequence;
        if (!sequence) {
          return JSON.stringify({
            success: false,
            error: "No active sequence"
          });
        } else {
          var found = false;
          for (var i = 0; i < sequence.markers.numMarkers; i++) {
            var marker = sequence.markers[i];
            if (marker.guid === ${JSON.stringify(markerId)}) {
              ${updates.name ? `marker.name = ${JSON.stringify(updates.name)};` : ''}
              ${updates.comment ? `marker.comments = ${JSON.stringify(updates.comment)};` : ''}
              ${updates.color ? `marker.setColorByIndex(${updates.color === 'red' ? '5' : updates.color === 'green' ? '3' : updates.color === 'blue' ? '1' : '0'});` : ''}
              found = true;
              break;
            }
          }

          return JSON.stringify({
            success: found,
            message: found ? "Marker updated successfully" : "Marker not found"
          });
        }
      } catch (e) {
        return JSON.stringify({
          success: false,
          error: e.toString()
        });
      }
    `;
    return await this.bridge.executeScript(script);
  }

  private async listMarkers(_sequenceId: string): Promise<any> {
    const script = `
      try {
        var sequence = app.project.activeSequence;
        if (!sequence) {
          return JSON.stringify({
            success: false,
            error: "No active sequence"
          });
        } else {
          var markers = [];
          for (var i = 0; i < sequence.markers.numMarkers; i++) {
            var marker = sequence.markers[i];
            markers.push({
              id: marker.guid,
              name: marker.name,
              comment: marker.comments,
              start: marker.start.seconds,
              end: marker.end.seconds,
              duration: marker.end.seconds - marker.start.seconds,
              type: marker.type
            });
          }

          return JSON.stringify({
            success: true,
            markers: markers,
            count: markers.length
          });
        }
      } catch (e) {
        return JSON.stringify({
          success: false,
          error: e.toString()
        });
      }
    `;
    return await this.bridge.executeScript(script);
  }

  // Track Management Implementation
  private async addTrack(_sequenceId: string, trackType: string, _position?: string): Promise<any> {
    const numVideo = trackType === 'video' ? 1 : 0;
    const numAudio = trackType === 'audio' ? 1 : 0;
    const script = `
      try {
        app.enableQE();
        var qeSeq = qe.project.getActiveSequence();
        qeSeq.addTracks(${numVideo}, ${numAudio}, 0);
        return JSON.stringify({
          success: true,
          message: "${trackType} track added"
        });
      } catch (e) {
        return JSON.stringify({ success: false, error: e.toString() });
      }
    `;
    return await this.bridge.executeScript(script);
  }

  private async deleteTrack(_sequenceId: string, trackType: string, trackIndex: number): Promise<any> {
    const script = `
      try {
        var sequence = app.project.activeSequence;
        if (!sequence) {
          return JSON.stringify({
            success: false,
            error: "No active sequence"
          });
        } else {
          var tracks = ${trackType === 'video' ? 'sequence.videoTracks' : 'sequence.audioTracks'};
          if (${trackIndex} >= 0 && ${trackIndex} < tracks.numTracks) {
            tracks.deleteTrack(${trackIndex});
            return JSON.stringify({
              success: true,
              message: "Track deleted successfully"
            });
          } else {
            return JSON.stringify({
              success: false,
              error: "Track index out of range"
            });
          }
        }
      } catch (e) {
        return JSON.stringify({
          success: false,
          error: e.toString()
        });
      }
    `;
    return await this.bridge.executeScript(script);
  }

  private async lockTrack(_sequenceId: string, trackType: string, trackIndex: number, locked: boolean): Promise<any> {
    const script = `
      try {
        var sequence = app.project.activeSequence;
        if (!sequence) {
          return JSON.stringify({
            success: false,
            error: "No active sequence"
          });
        } else {
          var tracks = ${trackType === 'video' ? 'sequence.videoTracks' : 'sequence.audioTracks'};
          if (${trackIndex} >= 0 && ${trackIndex} < tracks.numTracks) {
            tracks[${trackIndex}].setLocked(${locked});
            return JSON.stringify({
              success: true,
              message: "Track " + (${locked} ? "locked" : "unlocked")
            });
          } else {
            return JSON.stringify({
              success: false,
              error: "Track index out of range"
            });
          }
        }
      } catch (e) {
        return JSON.stringify({
          success: false,
          error: e.toString()
        });
      }
    `;
    return await this.bridge.executeScript(script);
  }

  private async toggleTrackVisibility(_sequenceId: string, trackIndex: number, visible: boolean): Promise<any> {
    const script = `
      try {
        var sequence = app.project.activeSequence;
        if (!sequence) {
          return JSON.stringify({
            success: false,
            error: "No active sequence"
          });
        } else {
          if (${trackIndex} >= 0 && ${trackIndex} < sequence.videoTracks.numTracks) {
            sequence.videoTracks[${trackIndex}].setTargeted(${visible}, true);
            return JSON.stringify({
              success: true,
              message: "Track visibility toggled"
            });
          } else {
            return JSON.stringify({
              success: false,
              error: "Track index out of range"
            });
          }
        }
      } catch (e) {
        return JSON.stringify({
          success: false,
          error: e.toString()
        });
      }
    `;
    return await this.bridge.executeScript(script);
  }

  private async linkAudioVideo(clipId: string, linked: boolean): Promise<any> {
    const script = `
      try {
        var clip = app.project.getClipByID(${JSON.stringify(clipId)});
        if (clip) {
          clip.setLinked(${linked});
          return JSON.stringify({
            success: true,
            message: "Audio-video " + (${linked} ? "linked" : "unlinked")
          });
        } else {
          return JSON.stringify({
            success: false,
            error: "Clip not found"
          });
        }
      } catch (e) {
        return JSON.stringify({
          success: false,
          error: e.toString()
        });
      }
    `;
    return await this.bridge.executeScript(script);
  }

  private async applyAudioEffect(clipId: string, effectName: string, parameters?: any): Promise<any> {
    return await this.applyEffect(clipId, effectName, parameters);
  }

  // Nested Sequences
  private async createNestedSequence(_clipIds: string[], _name: string): Promise<any> {
    return {
      success: false,
      error: "create_nested_sequence: This feature requires selection and nesting APIs. Implementation pending.",
      note: "You can manually nest clips via right-click > Nest"
    };
  }

  private async unnestSequence(_nestedSequenceClipId: string): Promise<any> {
    return {
      success: false,
      error: "unnest_sequence: This feature is not available in Premiere Pro scripting API",
      note: "You can manually unnest via Edit > Paste Attributes"
    };
  }

  // Additional Clip Operations
  private async duplicateClip(clipId: string, offset?: number): Promise<any> {
    const script = `
      try {
        var clip = app.project.getClipByID(${JSON.stringify(clipId)});
        if (clip) {
          var duplicate = clip.duplicate();
          ${offset !== undefined ? `duplicate.move(${offset});` : ''}
          return JSON.stringify({
            success: true,
            duplicateId: duplicate.nodeId,
            message: "Clip duplicated successfully"
          });
        } else {
          return JSON.stringify({
            success: false,
            error: "Clip not found"
          });
        }
      } catch (e) {
        return JSON.stringify({
          success: false,
          error: e.toString()
        });
      }
    `;
    return await this.bridge.executeScript(script);
  }

  private async reverseClip(clipId: string, maintainAudioPitch?: boolean): Promise<any> {
    return await this.speedChange(clipId, -100, maintainAudioPitch !== false);
  }

  private async enableDisableClip(clipId: string, enabled: boolean): Promise<any> {
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
    return await this.bridge.executeScript(script);
  }

  private async replaceClip(_clipId: string, _newProjectItemId: string, _preserveEffects?: boolean): Promise<any> {
    return {
      success: false,
      error: "replace_clip: This feature requires complex clip replacement logic. Implementation pending.",
      note: "You can manually replace clips via right-click > Replace With Clip"
    };
  }

  // Project Settings
  private async getSequenceSettings(_sequenceId: string): Promise<any> {
    const script = `
      try {
        var sequence = __findSequence(${JSON.stringify(_sequenceId)});
        if (!sequence) sequence = app.project.activeSequence;
        if (!sequence) {
          return JSON.stringify({
            success: false,
            error: "No active sequence"
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
    return await this.bridge.executeScript(script);
  }

  private async setSequenceSettings(_sequenceId: string, _settings: any): Promise<any> {
    return {
      success: false,
      error: "set_sequence_settings: Sequence settings cannot be changed after creation in Premiere Pro",
      note: "Create a new sequence with desired settings instead"
    };
  }

  private async getClipProperties(clipId: string): Promise<any> {
    const script = `
      try {
        var info = __findClip(${JSON.stringify(clipId)});
        if (!info) return JSON.stringify({ success: false, error: "Clip not found" });
        var clip = info.clip;
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
    return await this.bridge.executeScript(script);
  }

  private async setClipProperties(_clipId: string, _properties: any): Promise<any> {
    return {
      success: false,
      error: "set_clip_properties: Use specific tools like apply_effect for motion/opacity changes",
      note: "Motion graphics require Effects panel adjustments"
    };
  }

  // Render Queue
  private async addToRenderQueue(sequenceId: string, outputPath: string, presetPath?: string, _startImmediately?: boolean): Promise<any> {
    return await this.exportSequence(sequenceId, outputPath, presetPath);
  }

  private async getRenderQueueStatus(): Promise<any> {
    return {
      success: false,
      error: "get_render_queue_status: Render queue monitoring requires Adobe Media Encoder integration",
      note: "Check Adobe Media Encoder application for render status"
    };
  }
} 