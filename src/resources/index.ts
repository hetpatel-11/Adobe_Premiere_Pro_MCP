/**
 * MCP Resources for Adobe Premiere Pro
 * 
 * This module provides resources that give AI agents access to contextual
 * information about Adobe Premiere Pro projects, sequences, and media.
 */

import { PremiereProBridge } from '../bridge/index.js';
import { Logger } from '../utils/logger.js';

export interface MCPResource {
  uri: string;
  name: string;
  description: string;
  mimeType: string;
}

export class PremiereProResources {
  private bridge: PremiereProBridge;
  private logger: Logger;

  constructor(bridge: PremiereProBridge) {
    this.bridge = bridge;
    this.logger = new Logger('PremiereProResources');
  }

  getAvailableResources(): MCPResource[] {
    return [
      {
        uri: 'premiere://project/info',
        name: 'Current Project Information',
        description: 'Information about the currently open Premiere Pro project',
        mimeType: 'application/json'
      },
      {
        uri: 'premiere://project/sequences',
        name: 'Project Sequences',
        description: 'List of all sequences in the current project',
        mimeType: 'application/json'
      },
      {
        uri: 'premiere://project/media',
        name: 'Project Media',
        description: 'List of all media items in the current project',
        mimeType: 'application/json'
      },
      {
        uri: 'premiere://project/bins',
        name: 'Project Bins',
        description: 'Organizational structure of bins in the current project',
        mimeType: 'application/json'
      },
      {
        uri: 'premiere://timeline/clips',
        name: 'Timeline Clips',
        description: 'All clips currently on the timeline',
        mimeType: 'application/json'
      },
      {
        uri: 'premiere://timeline/tracks',
        name: 'Timeline Tracks',
        description: 'Information about video and audio tracks',
        mimeType: 'application/json'
      },
      {
        uri: 'premiere://timeline/markers',
        name: 'Timeline Markers',
        description: 'Markers and their positions on the timeline',
        mimeType: 'application/json'
      },
      {
        uri: 'premiere://effects/available',
        name: 'Available Effects',
        description: 'List of all available effects in Premiere Pro',
        mimeType: 'application/json'
      },
      {
        uri: 'premiere://effects/applied',
        name: 'Applied Effects',
        description: 'Effects currently applied to clips',
        mimeType: 'application/json'
      },
      {
        uri: 'premiere://transitions/available',
        name: 'Available Transitions',
        description: 'List of all available transitions in Premiere Pro',
        mimeType: 'application/json'
      },
      {
        uri: 'premiere://export/presets',
        name: 'Export Presets',
        description: 'Available export presets and their settings',
        mimeType: 'application/json'
      },
      {
        uri: 'premiere://project/metadata',
        name: 'Project Metadata',
        description: 'Metadata information for the current project',
        mimeType: 'application/json'
      },
      {
        uri: 'premiere://config/get_instructions',
        name: 'Premiere Operating Instructions',
        description: 'Attach this before editing to give the model workflow and safety guidance for using the Premiere MCP server',
        mimeType: 'text/plain'
      }
    ];
  }

  async readResource(uri: string): Promise<any> {
    this.logger.info(`Reading resource: ${uri}`);
    
    switch (uri) {
      case 'premiere://project/info':
        return await this.getProjectInfo();
      
      case 'premiere://project/sequences':
        return await this.getProjectSequences();
      
      case 'premiere://project/media':
        return await this.getProjectMedia();
      
      case 'premiere://project/bins':
        return await this.getProjectBins();
      
      case 'premiere://timeline/clips':
        return await this.getTimelineClips();
      
      case 'premiere://timeline/tracks':
        return await this.getTimelineTracks();
      
      case 'premiere://timeline/markers':
        return await this.getTimelineMarkers();
      
      case 'premiere://effects/available':
        return await this.getAvailableEffects();
      
      case 'premiere://effects/applied':
        return await this.getAppliedEffects();
      
      case 'premiere://transitions/available':
        return await this.getAvailableTransitions();
      
      case 'premiere://export/presets':
        return await this.getExportPresets();
      
      case 'premiere://project/metadata':
        return await this.getProjectMetadata();

      case 'premiere://config/get_instructions':
        return this.getInstructions();
      
      default:
        throw new Error(`Resource '${uri}' not found`);
    }
  }

  getResource(uri: string): MCPResource | undefined {
    return this.getAvailableResources().find((resource) => resource.uri === uri);
  }

  private async getProjectInfo(): Promise<any> {
    const script = `
      var project = app.project;
      JSON.stringify({
        id: project.documentID,
        name: project.name,
        path: project.path,
        isModified: project.dirty,
        settings: {
          scratchDiskPath: project.scratchDiskPath,
          captureFormat: project.captureFormat,
          previewFormat: project.previewFormat
        },
        statistics: {
          sequenceCount: project.sequences.numSequences,
          projectItemCount: project.rootItem.children.numItems
        }
      });
    `;
    
    return await this.bridge.executeScript(script);
  }

  private async getProjectSequences(): Promise<any> {
    const script = `
      var project = app.project;
      var sequences = [];
      
      for (var i = 0; i < project.sequences.numSequences; i++) {
        var sequence = project.sequences[i];
        sequences.push({
          id: sequence.sequenceID,
          name: sequence.name,
          frameRate: sequence.framerate,
          duration: sequence.end - sequence.zeroPoint,
          videoTracks: sequence.videoTracks.numTracks,
          audioTracks: sequence.audioTracks.numTracks,
          settings: {
            frameSize: {
              width: sequence.frameSizeHorizontal,
              height: sequence.frameSizeVertical
            },
            pixelAspectRatio: sequence.pixelAspectRatio,
            fieldType: sequence.fieldType
          }
        });
      }
      
      JSON.stringify({
        sequences: sequences,
        totalCount: project.sequences.numSequences
      });
    `;
    
    return await this.bridge.executeScript(script);
  }

  private async getProjectMedia(): Promise<any> {
    const script = `
      var project = app.project;
      var mediaItems = [];
      
      function traverseProjectItems(item) {
        for (var i = 0; i < item.children.numItems; i++) {
          var child = item.children[i];
          if (child.type === ProjectItemType.CLIP) {
            mediaItems.push({
              id: child.nodeId,
              name: child.name,
              type: child.type,
              mediaPath: child.getMediaPath(),
              duration: child.getOutPoint() - child.getInPoint(),
              frameRate: child.getVideoFrameRate(),
              hasVideo: child.hasVideo(),
              hasAudio: child.hasAudio(),
              metadata: {
                creationTime: child.getCreationTime(),
                modificationTime: child.getModificationTime(),
                fileSize: child.getFileSize()
              }
            });
          } else if (child.type === ProjectItemType.BIN) {
            traverseProjectItems(child);
          }
        }
      }
      
      traverseProjectItems(project.rootItem);
      
      JSON.stringify({
        mediaItems: mediaItems,
        totalCount: mediaItems.length
      });
    `;
    
    return await this.bridge.executeScript(script);
  }

  private async getProjectBins(): Promise<any> {
    const script = `
      var project = app.project;
      var bins = [];
      
      function traverseBins(item, depth = 0) {
        for (var i = 0; i < item.children.numItems; i++) {
          var child = item.children[i];
          if (child.type === ProjectItemType.BIN) {
            bins.push({
              id: child.nodeId,
              name: child.name,
              depth: depth,
              itemCount: child.children.numItems,
              path: child.treePath
            });
            traverseBins(child, depth + 1);
          }
        }
      }
      
      traverseBins(project.rootItem);
      
      JSON.stringify({
        bins: bins,
        totalCount: bins.length
      });
    `;
    
    return await this.bridge.executeScript(script);
  }

  private async getTimelineClips(): Promise<any> {
    const script = `
      var project = app.project;
      var clips = [];
      
      if (project.activeSequence) {
        var sequence = project.activeSequence;
        
        // Video tracks
        for (var v = 0; v < sequence.videoTracks.numTracks; v++) {
          var track = sequence.videoTracks[v];
          for (var c = 0; c < track.clips.numItems; c++) {
            var clip = track.clips[c];
            clips.push({
              id: clip.nodeId,
              name: clip.name,
              trackType: 'video',
              trackIndex: v,
              startTime: clip.start,
              endTime: clip.end,
              duration: clip.duration,
              inPoint: clip.inPoint,
              outPoint: clip.outPoint,
              mediaPath: clip.projectItem ? clip.projectItem.getMediaPath() : null,
              effects: clip.components.numItems
            });
          }
        }
        
        // Audio tracks
        for (var a = 0; a < sequence.audioTracks.numTracks; a++) {
          var track = sequence.audioTracks[a];
          for (var c = 0; c < track.clips.numItems; c++) {
            var clip = track.clips[c];
            clips.push({
              id: clip.nodeId,
              name: clip.name,
              trackType: 'audio',
              trackIndex: a,
              startTime: clip.start,
              endTime: clip.end,
              duration: clip.duration,
              inPoint: clip.inPoint,
              outPoint: clip.outPoint,
              mediaPath: clip.projectItem ? clip.projectItem.getMediaPath() : null,
              effects: clip.components.numItems
            });
          }
        }
      }
      
      JSON.stringify({
        clips: clips,
        totalCount: clips.length,
        activeSequence: project.activeSequence ? project.activeSequence.name : null
      });
    `;
    
    return await this.bridge.executeScript(script);
  }

  private async getTimelineTracks(): Promise<any> {
    const script = `
      var project = app.project;
      var tracks = [];
      
      if (project.activeSequence) {
        var sequence = project.activeSequence;
        
        // Video tracks
        for (var v = 0; v < sequence.videoTracks.numTracks; v++) {
          var track = sequence.videoTracks[v];
          tracks.push({
            id: track.id,
            name: track.name,
            type: 'video',
            index: v,
            enabled: track.enabled,
            locked: track.locked,
            muted: track.muted,
            clipCount: track.clips.numItems,
            transitionCount: track.transitions.numItems
          });
        }
        
        // Audio tracks
        for (var a = 0; a < sequence.audioTracks.numTracks; a++) {
          var track = sequence.audioTracks[a];
          tracks.push({
            id: track.id,
            name: track.name,
            type: 'audio',
            index: a,
            enabled: track.enabled,
            locked: track.locked,
            muted: track.muted,
            clipCount: track.clips.numItems,
            transitionCount: track.transitions.numItems
          });
        }
      }
      
      JSON.stringify({
        tracks: tracks,
        totalCount: tracks.length,
        activeSequence: project.activeSequence ? project.activeSequence.name : null
      });
    `;
    
    return await this.bridge.executeScript(script);
  }

  private async getTimelineMarkers(): Promise<any> {
    const script = `
      var project = app.project;
      var markers = [];
      
      if (project.activeSequence) {
        var sequence = project.activeSequence;
        
        for (var i = 0; i < sequence.markers.numMarkers; i++) {
          var marker = sequence.markers[i];
          markers.push({
            id: marker.guid,
            name: marker.name,
            comment: marker.comment,
            startTime: marker.start,
            endTime: marker.end,
            duration: marker.duration,
            type: marker.type,
            color: marker.color
          });
        }
      }
      
      JSON.stringify({
        markers: markers,
        totalCount: markers.length,
        activeSequence: project.activeSequence ? project.activeSequence.name : null
      });
    `;
    
    return await this.bridge.executeScript(script);
  }

  private async getAvailableEffects(): Promise<any> {
    const script = `
      var effects = [];
      
      // Get video effects
      var videoEffects = app.getAvailableVideoEffects();
      for (var i = 0; i < videoEffects.length; i++) {
        effects.push({
          name: videoEffects[i].name,
          matchName: videoEffects[i].matchName,
          category: videoEffects[i].category,
          type: 'video'
        });
      }
      
      // Get audio effects
      var audioEffects = app.getAvailableAudioEffects();
      for (var i = 0; i < audioEffects.length; i++) {
        effects.push({
          name: audioEffects[i].name,
          matchName: audioEffects[i].matchName,
          category: audioEffects[i].category,
          type: 'audio'
        });
      }
      
      JSON.stringify({
        effects: effects,
        totalCount: effects.length
      });
    `;
    
    return await this.bridge.executeScript(script);
  }

  private async getAppliedEffects(): Promise<any> {
    const script = `
      var project = app.project;
      var appliedEffects = [];
      
      if (project.activeSequence) {
        var sequence = project.activeSequence;
        
        // Check video tracks
        for (var v = 0; v < sequence.videoTracks.numTracks; v++) {
          var track = sequence.videoTracks[v];
          for (var c = 0; c < track.clips.numItems; c++) {
            var clip = track.clips[c];
            for (var e = 0; e < clip.components.numItems; e++) {
              var effect = clip.components[e];
              appliedEffects.push({
                clipId: clip.nodeId,
                clipName: clip.name,
                effectName: effect.displayName,
                effectMatchName: effect.matchName,
                trackType: 'video',
                trackIndex: v,
                enabled: effect.enabled
              });
            }
          }
        }
        
        // Check audio tracks
        for (var a = 0; a < sequence.audioTracks.numTracks; a++) {
          var track = sequence.audioTracks[a];
          for (var c = 0; c < track.clips.numItems; c++) {
            var clip = track.clips[c];
            for (var e = 0; e < clip.components.numItems; e++) {
              var effect = clip.components[e];
              appliedEffects.push({
                clipId: clip.nodeId,
                clipName: clip.name,
                effectName: effect.displayName,
                effectMatchName: effect.matchName,
                trackType: 'audio',
                trackIndex: a,
                enabled: effect.enabled
              });
            }
          }
        }
      }
      
      JSON.stringify({
        appliedEffects: appliedEffects,
        totalCount: appliedEffects.length
      });
    `;
    
    return await this.bridge.executeScript(script);
  }

  private async getAvailableTransitions(): Promise<any> {
    const script = `
      var transitions = [];
      
      // Get video transitions
      var videoTransitions = app.getAvailableVideoTransitions();
      for (var i = 0; i < videoTransitions.length; i++) {
        transitions.push({
          name: videoTransitions[i].name,
          matchName: videoTransitions[i].matchName,
          category: videoTransitions[i].category,
          type: 'video'
        });
      }
      
      // Get audio transitions
      var audioTransitions = app.getAvailableAudioTransitions();
      for (var i = 0; i < audioTransitions.length; i++) {
        transitions.push({
          name: audioTransitions[i].name,
          matchName: audioTransitions[i].matchName,
          category: audioTransitions[i].category,
          type: 'audio'
        });
      }
      
      JSON.stringify({
        transitions: transitions,
        totalCount: transitions.length
      });
    `;
    
    return await this.bridge.executeScript(script);
  }

  private async getExportPresets(): Promise<any> {
    const script = `
      var presets = [];
      var encoder = app.encoder;
      
      // Get available export presets
      var exportPresets = encoder.getExportPresets();
      for (var i = 0; i < exportPresets.length; i++) {
        presets.push({
          name: exportPresets[i].name,
          matchName: exportPresets[i].matchName,
          category: exportPresets[i].category,
          description: exportPresets[i].description,
          fileExtension: exportPresets[i].fileExtension
        });
      }
      
      JSON.stringify({
        presets: presets,
        totalCount: presets.length
      });
    `;
    
    return await this.bridge.executeScript(script);
  }

  private async getProjectMetadata(): Promise<any> {
    const script = `
      var project = app.project;
      var metadata = {};
      
      if (project.activeSequence) {
        var sequence = project.activeSequence;
        
        metadata = {
          project: {
            name: project.name,
            path: project.path,
            creationTime: project.creationTime,
            modificationTime: project.modificationTime
          },
          sequence: {
            name: sequence.name,
            duration: sequence.end - sequence.zeroPoint,
            frameRate: sequence.framerate,
            settings: {
              frameSize: {
                width: sequence.frameSizeHorizontal,
                height: sequence.frameSizeVertical
              },
              pixelAspectRatio: sequence.pixelAspectRatio,
              fieldType: sequence.fieldType
            }
          },
          statistics: {
            totalClips: 0,
            totalEffects: 0,
            totalTransitions: 0
          }
        };
        
        // Count clips, effects, and transitions
        for (var v = 0; v < sequence.videoTracks.numTracks; v++) {
          var track = sequence.videoTracks[v];
          metadata.statistics.totalClips += track.clips.numItems;
          metadata.statistics.totalTransitions += track.transitions.numItems;
          
          for (var c = 0; c < track.clips.numItems; c++) {
            metadata.statistics.totalEffects += track.clips[c].components.numItems;
          }
        }
        
        for (var a = 0; a < sequence.audioTracks.numTracks; a++) {
          var track = sequence.audioTracks[a];
          metadata.statistics.totalClips += track.clips.numItems;
          metadata.statistics.totalTransitions += track.transitions.numItems;
          
          for (var c = 0; c < track.clips.numItems; c++) {
            metadata.statistics.totalEffects += track.clips[c].components.numItems;
          }
        }
      }
      
      JSON.stringify(metadata);
    `;
    
    return await this.bridge.executeScript(script);
  }

  private getInstructions(): string {
    return [
      'You are controlling Adobe Premiere Pro through the MCP server in this workspace.',
      '',
      'Operating rules:',
      '1. Inspect the project before editing. Start with list_sequences, list_sequence_tracks, list_project_items, or the premiere://project/* resources unless the user already gave exact IDs.',
      '2. Prefer non-destructive operations first. Duplicate sequences before risky changes when the user is exploring or when the request is ambiguous.',
      '3. When building edits, add clips first, then trims and timing changes, then transitions and effects, then export.',
      '4. For branded or ad-style assemblies, prefer assemble_product_spot or build_brand_spot_from_mogrt_and_assets with clipPlan rather than relying on fixed defaults.',
      '5. Use real MOGRTs, footage, LUTs, and audio when the user wants polished output. The server can automate assembly, but it does not invent final-quality design assets.',
      '6. For cuts across many layers, prefer razor_timeline_at_time instead of splitting each clip one by one.',
      '7. Keep transitions short unless the user asks otherwise. Cross dissolves usually work best when clips are adjacent and on the same track.',
      '8. Verify the active sequence before timeline operations. If needed, call set_active_sequence first.',
      '9. If a tool fails, report the real limitation instead of pretending success. Premiere scripting coverage is incomplete in some areas.',
      '10. The CEP bridge panel must be open, pointed at /tmp/premiere-mcp-bridge, and started, or tool calls may time out.',
      '',
      'Suggested discovery flow:',
      '- Read premiere://config/get_instructions',
      '- Read premiere://project/info',
      '- Read premiere://project/sequences',
      '- Read premiere://timeline/tracks when editing an existing sequence',
      '',
      'Suggested editing flow:',
      '- set_active_sequence if needed',
      '- import_media / import_folder / create_bin',
      '- add_to_timeline / razor_timeline_at_time / trim_clip / move_clip',
      '- add_transition / add_transition_to_clip / apply_effect / color_correct / apply_lut',
      '- export_sequence / export_frame / export_as_fcp_xml',
      '',
      'Be explicit with sequence IDs, clip IDs, track indices, file paths, and durations when the user gives them.'
    ].join('\n');
  }
}
