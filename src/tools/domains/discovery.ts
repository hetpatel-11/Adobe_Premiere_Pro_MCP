/**
 * Catalog search, connection checks, and read-only project/sequence listings.
 *
 * Each entry declares the tool an agent sees and the handler that runs it,
 * so the two cannot drift apart. Handlers reach Premiere through ToolContext.
 */
import { z } from 'zod';
import { constants as fsConstants, promises as fs } from 'node:fs';
import { homedir, platform } from 'node:os';
import { basename, dirname, extname, join, parse } from 'node:path';
import { checkForUpdate } from '../../utils/update-check.js';
import { resolveToolset } from '../search.js';
import type { ToolContext, ToolModule } from '../context.js';
import { buildSequenceResolver } from './shared.js';

export const discoveryTools: ToolModule[] = [
  {
    name: 'list_project_items',
    description: 'Lists all media items, bins, and assets in the current Premiere Pro project. Use this to discover available media before performing operations.',
    inputSchema: z.object({
      includeBins: z.boolean().optional().describe('Whether to include bin information in the results'),
      includeMetadata: z.boolean().optional().describe('Whether to include detailed metadata for each item')
    }),
    run: (ctx, args) => listProjectItems(ctx, args.includeBins, args.includeMetadata),
  },
  {
    name: 'list_sequences',
    description: 'Lists all sequences in the current Premiere Pro project with their IDs, names, and basic properties.',
    inputSchema: z.object({}),
    run: (ctx) => listSequences(ctx),
  },
  {
    name: 'list_sequence_tracks',
    description: 'Lists all video and audio tracks in a specific sequence with their properties and clips.',
    inputSchema: z.object({
      sequenceId: z.string().min(1).describe('The sequence ID (GUID) to list tracks for, as returned in the "id" field by list_sequences or get_active_sequence')
    }),
    run: (ctx, args) => listSequenceTracks(ctx, args.sequenceId),
  },
  {
    name: 'get_project_info',
    description: 'Gets comprehensive information about the current project including name, path, settings, and status.',
    inputSchema: z.object({}),
    run: (ctx) => getProjectInfo(ctx),
  },
  {
    name: 'verify_premiere_connection',
    description: 'Readiness check for Premiere Pro and the MCP Bridge. Call this before any editing tool. If Premiere is installed and not running, this launches it and waits for the CEP panel, which auto-starts the bridge. If it fails, tell the user the nextStep and do not retry other tools.',
    inputSchema: z.object({
      launchIfNeeded: z.boolean().optional().describe('When true (the default), launch Premiere if it is installed and the bridge heartbeat is missing. Set false for a check that never starts the app.')
    }),
    run: (ctx, args) => verifyPremiereConnection(ctx, args.launchIfNeeded !== false),
  },
  {
    name: 'get_capabilities',
    description: 'Reports the local MCP runtime, installed bridge status, tool/resource/prompt catalog sizes, and supported versus experimental integration surfaces. Includes an npm update check: if update.available is true and not snoozed, give the user update.installCommand (or Later) before editing. Set checkConnection to true to run the read-only live Premiere connection check; otherwise no Premiere request is made.',
    inputSchema: z.object({
      checkConnection: z.boolean().optional().describe('When true, run verify_premiere_connection and include its live result. Defaults to false so capability discovery is fast and non-invasive.')
    }),
    run: (ctx, args) => getCapabilities(ctx, args.checkConnection),
  },
  {
    name: 'validate_project_for_export',
    description: 'Runs a non-destructive export readiness audit for the active or requested sequence. Checks timeline content, offline media, missing export preset/output folder inputs, gaps, markers, and basic audio/video track state before an agent queues an export.',
    inputSchema: z.object({
      sequenceId: z.string().optional().describe('Optional sequence ID to validate. Defaults to the active sequence.'),
      outputPath: z.string().optional().describe('Optional intended export output path. When provided, the parent folder is checked.'),
      presetPath: z.string().optional().describe('Optional Adobe Media Encoder .epr preset path. When provided, the file is checked.'),
      requireNonEmptyTimeline: z.boolean().optional().describe('When true, an empty timeline is an error. Defaults to true.'),
      checkGaps: z.boolean().optional().describe('When true, timeline gaps are reported as warnings. Defaults to true.')
    }),
    run: (ctx, args) => validateProjectForExport(ctx, args.sequenceId, args.outputPath, args.presetPath, args.requireNonEmptyTimeline, args.checkGaps),
  },
  {
    name: 'get_encoder_presets',
    description: 'Discovers readable user Adobe Media Encoder .epr presets from local AME preset folders. Factory preset enumeration is not claimed complete.',
    inputSchema: z.object({
      directories: z.array(z.string()).optional().describe('Optional absolute directories to scan instead of the default user AME preset folders. Intended for tests and advanced setups.')
    }),
    run: (_ctx, args) => getEncoderPresets(args.directories),
  },
  {
    name: 'list_available_effects',
    description: 'Lists all available video effects in Premiere Pro.',
    inputSchema: z.object({}),
    run: (ctx) => listAvailableEffects(ctx),
  },
  {
    name: 'list_available_transitions',
    description: 'Lists all available video transitions in Premiere Pro.',
    inputSchema: z.object({}),
    run: (ctx) => listAvailableTransitions(ctx),
  },
  {
    name: 'list_available_audio_effects',
    description: 'Lists all available audio effects in Premiere Pro.',
    inputSchema: z.object({}),
    run: (ctx) => listAvailableAudioEffects(ctx),
  },
  {
    name: 'list_available_audio_transitions',
    description: 'Lists all available audio transitions in Premiere Pro.',
    inputSchema: z.object({}),
    run: (ctx) => listAvailableAudioTransitions(ctx),
  },
  {
    name: 'find_project_item_by_name',
    description: 'Searches for project items by name. Useful for finding media files, sequences, or bins.',
    inputSchema: z.object({
      name: z.string().describe('The name to search for (case-insensitive partial match)'),
      type: z.enum(['footage', 'sequence', 'bin', 'any']).optional().describe('Filter by item type')
    }),
    run: (ctx, args) => findProjectItemByName(ctx, args.name, args.type),
  },
  {
    name: 'get_clip_at_position',
    description: 'Gets the clip at a specific time position on a track.',
    inputSchema: z.object({
      sequenceId: z.string().describe('The ID of the sequence'),
      trackType: z.enum(['video', 'audio']).describe('The type of track'),
      trackIndex: z.number().describe('The track index (0-based)'),
      time: z.number().describe('The time position in seconds')
    }),
    run: (ctx, args) => getClipAtPosition(ctx, args.sequenceId, args.trackType, args.trackIndex, args.time),
  },
  {
    name: 'check_offline_media',
    description: 'Checks all project items and returns a list of any that are offline (missing media).',
    inputSchema: z.object({}),
    run: (ctx) => checkOfflineMedia(ctx),
  },
];

const HEALTH_CHECK_TIMEOUT_MS = 8000;

export interface EncoderPresetEntry {
  name: string;
  path: string;
  source: 'user';
  ameVersion: string;
}

interface EncoderPresetDiscovery {
  success: true;
  presets: EncoderPresetEntry[];
  count: number;
  searchedDirectories: string[];
  errors: Array<{ path: string; error: string }>;
  factoryPresets: {
    supported: false;
    note: string;
  };
}

async function listProjectItems(ctx: ToolContext, includeBins = true, _includeMetadata = false): Promise<any> {
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

  return await ctx.bridge.executeScript(script);
}

async function listSequences(ctx: ToolContext): Promise<any> {
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
  
  return await ctx.bridge.executeScript(script);
}

export async function listSequenceTracks(ctx: ToolContext, sequenceId: string): Promise<any> {
  const script = `
      try {
${buildSequenceResolver(sequenceId)}

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
          sequenceId: sequence.sequenceID,
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

  return await ctx.bridge.executeScript(script);
}

async function getProjectInfo(ctx: ToolContext): Promise<any> {
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

  return await ctx.bridge.executeScript(script);
}

async function verifyPremiereConnection(ctx: ToolContext, launchIfNeeded = true): Promise<any> {
  if (typeof ctx.bridge.ensureHost === 'function') {
    const ensured = await ctx.bridge.ensureHost({ launchIfNeeded });
    if (ensured && !ensured.ready) return ensured;
  }
  const script = `
      try {
        var project = app.project;
        var sequence = project ? project.activeSequence : null;
        return JSON.stringify({
          success: true,
          status: 'connected',
          bridge: 'responsive',
          premiere: {
            version: app.version || null,
            build: app.build || null
          },
          project: project ? {
            name: project.name || null,
            path: project.path || null,
            sequenceCount: project.sequences ? project.sequences.numSequences : 0
          } : null,
          activeSequence: sequence ? {
            id: sequence.sequenceID,
            name: sequence.name
          } : null,
          readOnly: true
        });
      } catch (e) {
        return JSON.stringify({
          success: false,
          status: 'unavailable',
          error: e.toString(),
          nextStep: 'Open Window > Extensions > MCP Bridge if the panel is missing, then run verify_premiere_connection again.'
        });
      }
    `;

  return await ctx.bridge.executeScript(script, HEALTH_CHECK_TIMEOUT_MS);
}

async function getCapabilities(ctx: ToolContext, checkConnection = false): Promise<any> {
  const currentPlatform = platform();
  const cepExtensionPath = currentPlatform === 'darwin'
    ? join(homedir(), 'Library', 'Application Support', 'Adobe', 'CEP', 'extensions', 'MCPBridgeCEP')
    : currentPlatform === 'win32'
      ? join(process.env.APPDATA || homedir(), 'Adobe', 'CEP', 'extensions', 'MCPBridgeCEP')
      : null;

  let cepInstalled = false;
  if (cepExtensionPath) {
    try {
      await fs.access(cepExtensionPath, fsConstants.R_OK);
      cepInstalled = true;
    } catch {
      cepInstalled = false;
    }
  }

  let liveConnection: any = {
    checked: false,
    status: 'not_checked',
    nextStep: 'Run get_capabilities with checkConnection=true or call verify_premiere_connection before editing.'
  };
  if (checkConnection) {
    try {
      liveConnection = {
        checked: true,
        result: await verifyPremiereConnection(ctx)
      };
    } catch (error) {
      liveConnection = {
        checked: true,
        status: 'unavailable',
        error: error instanceof Error ? error.message : String(error)
      };
    }
  }

  return {
    success: true,
    runtime: {
      platform: currentPlatform,
      transport: 'stdio',
      bridgeDirectory: process.env.PREMIERE_TEMP_DIR || null
    },
    update: await checkForUpdate(),
    bridge: {
      cep: {
        status: cepInstalled ? 'installed' : 'not_detected',
        path: cepExtensionPath,
        support: 'production bridge for Premiere Pro 2020+'
      },
      uxp: {
        status: 'experimental',
        support: 'not a replacement for the validated CEP bridge'
      }
    },
    catalog: {
      tools: ctx.listTools().length,
      advertised: ctx.listAdvertisedTools().length,
      toolset: resolveToolset(),
      search: 'search_tools',
      invoke: 'invoke_tool',
      resources: 13,
      prompts: 10
    },
    liveConnection,
    safety: {
      recommendedFirstCall: 'verify_premiere_connection',
      toolDiscovery: 'search_tools then invoke_tool. Set PREMIERE_MCP_TOOLSET=full to advertise every tool to the MCP host.',
      rawExtendScript: 'Available through execute_extendscript and evaluate_expression. Require explicit user approval before using either tool.',
      note: 'A detected CEP installation does not prove that Premiere is running or the bridge is connected.'
    }
  };
}

async function validateProjectForExport(ctx: ToolContext, sequenceId?: string, outputPath?: string, presetPath?: string, requireNonEmptyTimeline = true, checkGaps = true): Promise<any> {
  const script = `
      try {
        var errors = [];
        var warnings = [];
        var info = [];

        function secondsOf(value) {
          if (value === undefined || value === null) return 0;
          if (typeof value === "number") return isFinite(value) ? value : 0;
          // Premiere Pro 26.3 returns sequence.end as a plain tick string rather
          // than a Time object, which previously fell through to 0 and produced a
          // spurious ZERO_DURATION. The timeline inspection tools already read the
          // same value as ticks, so interpret it the same way here.
          if (typeof value === "string") {
            var stringTicks = parseInt(value, 10);
            return isFinite(stringTicks) ? stringTicks / 254016000000.0 : 0;
          }
          if (value.seconds !== undefined) {
            var seconds = Number(value.seconds);
            return isFinite(seconds) ? seconds : 0;
          }
          if (value.ticks !== undefined) {
            var ticks = Number(value.ticks);
            return isFinite(ticks) ? ticks / 254016000000.0 : 0;
          }
          return 0;
        }

        function pathExists(path, expectFolder) {
          if (!path) return false;
          try {
            return expectFolder ? new Folder(path).exists : new File(path).exists;
          } catch (_) {
            return false;
          }
        }

        function parentFolder(path) {
          try {
            return new File(path).parent.fsName;
          } catch (_) {
            return "";
          }
        }

        if (!app.project) {
          return JSON.stringify({
            success: true,
            readyForExport: false,
            errors: [{ code: "NO_PROJECT", message: "No Premiere project is open." }],
            warnings: [],
            info: [],
            summary: {}
          });
        }

        var sequence = ${sequenceId ? `__findSequence(${JSON.stringify(sequenceId)})` : 'app.project.activeSequence'};
        if (!sequence) {
          errors.push({
            code: ${sequenceId ? '"SEQUENCE_NOT_FOUND"' : '"NO_ACTIVE_SEQUENCE"'},
            message: ${sequenceId ? JSON.stringify(`Sequence not found: ${sequenceId}`) : '"No active sequence is selected."'}
          });
        }

        if (${presetPath ? 'true' : 'false'}) {
          if (!pathExists(${JSON.stringify(presetPath || '')}, false)) {
            errors.push({
              code: "PRESET_NOT_FOUND",
              message: "Export preset file does not exist.",
              path: ${JSON.stringify(presetPath || '')}
            });
          } else if (!/\\.epr$/i.test(${JSON.stringify(presetPath || '')})) {
            warnings.push({
              code: "PRESET_EXTENSION",
              message: "Preset path exists but does not end with .epr.",
              path: ${JSON.stringify(presetPath || '')}
            });
          }
        } else {
          warnings.push({
            code: "PRESET_NOT_PROVIDED",
            message: "No presetPath was provided; export_sequence requires an absolute .epr preset path."
          });
        }

        if (${outputPath ? 'true' : 'false'}) {
          var outputParent = parentFolder(${JSON.stringify(outputPath || '')});
          if (!outputParent || !pathExists(outputParent, true)) {
            errors.push({
              code: "OUTPUT_FOLDER_NOT_FOUND",
              message: "Output parent folder does not exist.",
              path: outputParent || ${JSON.stringify(outputPath || '')}
            });
          }
        } else {
          warnings.push({
            code: "OUTPUT_PATH_NOT_PROVIDED",
            message: "No outputPath was provided; export readiness is partial."
          });
        }

        var summary = {
          projectName: app.project.name || "",
          projectPath: app.project.path || "",
          sequenceId: sequence ? sequence.sequenceID : null,
          sequenceName: sequence ? sequence.name : null,
          durationSeconds: sequence ? secondsOf(sequence.end) : 0,
          videoTrackCount: sequence ? sequence.videoTracks.numTracks : 0,
          audioTrackCount: sequence ? sequence.audioTracks.numTracks : 0,
          videoClipCount: 0,
          audioClipCount: 0,
          markerCount: 0,
          offlineMediaCount: 0,
          gapCount: 0
        };

        var offlineMedia = [];
        var seenMedia = {};
        function inspectProjectItem(item) {
          if (!item) return;
          try {
            if (item.getMediaPath) {
              var mediaPath = String(item.getMediaPath() || "");
              if (mediaPath && !seenMedia[mediaPath]) {
                seenMedia[mediaPath] = true;
                var offline = false;
                try { offline = item.isOffline ? Boolean(item.isOffline()) : false; } catch (_) {}
                if (offline || !pathExists(mediaPath, false)) {
                  offlineMedia.push({
                    nodeId: item.nodeId,
                    name: item.name,
                    mediaPath: mediaPath,
                    offline: offline,
                    fileExists: pathExists(mediaPath, false)
                  });
                }
              }
            }
          } catch (_) {}
          if (item.children) {
            for (var childIndex = 0; childIndex < item.children.numItems; childIndex++) {
              inspectProjectItem(item.children[childIndex]);
            }
          }
        }
        inspectProjectItem(app.project.rootItem);
        summary.offlineMediaCount = offlineMedia.length;
        if (offlineMedia.length) {
          errors.push({
            code: "OFFLINE_OR_MISSING_MEDIA",
            message: "One or more project media files are offline or missing on disk.",
            items: offlineMedia
          });
        }

        var gaps = [];
        if (sequence) {
          var hasVideoClip = false;
          var hasAudioClip = false;

          function inspectTracks(trackCollection, trackType) {
            for (var trackIndex = 0; trackIndex < trackCollection.numTracks; trackIndex++) {
              var track = trackCollection[trackIndex];
              var clips = [];
              for (var clipIndex = 0; clipIndex < track.clips.numItems; clipIndex++) {
                var clip = track.clips[clipIndex];
                var start = secondsOf(clip.start);
                var end = secondsOf(clip.end);
                clips.push({ start: start, end: end, name: clip.name, nodeId: clip.nodeId });
                if (trackType === "video") {
                  summary.videoClipCount++;
                  hasVideoClip = true;
                } else {
                  summary.audioClipCount++;
                  hasAudioClip = true;
                }
              }
              clips.sort(function(a, b) { return a.start - b.start; });
              var cursor = 0;
              for (var gi = 0; gi < clips.length; gi++) {
                if (clips[gi].start - cursor > 0.05) {
                  gaps.push({
                    trackType: trackType,
                    trackIndex: trackIndex,
                    start: cursor,
                    end: clips[gi].start,
                    duration: clips[gi].start - cursor
                  });
                }
                if (clips[gi].end > cursor) cursor = clips[gi].end;
              }
            }
          }

          inspectTracks(sequence.videoTracks, "video");
          inspectTracks(sequence.audioTracks, "audio");

          if (${requireNonEmptyTimeline !== false ? 'true' : 'false'} && summary.videoClipCount + summary.audioClipCount === 0) {
            errors.push({
              code: "EMPTY_TIMELINE",
              message: "The sequence has no video or audio clips."
            });
          }
          if (!hasVideoClip) {
            warnings.push({
              code: "NO_VIDEO_CLIPS",
              message: "The sequence has no video clips."
            });
          }
          if (!hasAudioClip) {
            warnings.push({
              code: "NO_AUDIO_CLIPS",
              message: "The sequence has no audio clips."
            });
          }

          try {
            summary.markerCount = sequence.markers ? sequence.markers.numMarkers : 0;
          } catch (_) {}

          summary.gapCount = gaps.length;
          if (${checkGaps !== false ? 'true' : 'false'} && gaps.length) {
            warnings.push({
              code: "TIMELINE_GAPS",
              message: "Timeline gaps were found. This may be intentional, but agents should verify before export.",
              gaps: gaps
            });
          }

          if (summary.durationSeconds <= 0) {
            errors.push({
              code: "ZERO_DURATION",
              message: "The sequence duration is zero."
            });
          }
        }

        if (!errors.length) {
          info.push({
            code: "EXPORT_READY",
            message: "No blocking export readiness issues were found."
          });
        }

        return JSON.stringify({
          success: true,
          readyForExport: errors.length === 0,
          errors: errors,
          warnings: warnings,
          info: info,
          summary: summary,
          checked: {
            sequenceId: ${sequenceId ? JSON.stringify(sequenceId) : 'null'},
            outputPath: ${outputPath ? JSON.stringify(outputPath) : 'null'},
            presetPath: ${presetPath ? JSON.stringify(presetPath) : 'null'},
            requireNonEmptyTimeline: ${requireNonEmptyTimeline !== false ? 'true' : 'false'},
            checkGaps: ${checkGaps !== false ? 'true' : 'false'}
          }
        });
      } catch (e) {
        return JSON.stringify({ success: false, error: e.toString() });
      }
    `;

  return await ctx.bridge.executeScript(script);
}

function decodeXmlEntities(value: string): string {
  return value
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&amp;/g, '&')
    .trim();
}

function displayNameFromPresetXml(xml: string): string | undefined {
  const patterns = [
    /<PresetName[^>]*>([^<]+)<\/PresetName>/i,
    /<Name[^>]*>([^<]+)<\/Name>/i,
    /\bPresetName="([^"]+)"/i,
    /\bName="([^"]+)"/i,
  ];
  for (const pattern of patterns) {
    const match = pattern.exec(xml);
    const name = match?.[1] ? decodeXmlEntities(match[1]) : '';
    if (name) return name;
  }
  return undefined;
}

async function defaultEncoderPresetDirectories(): Promise<string[]> {
  const baseDirs = [
    join(homedir(), 'Library', 'Application Support', 'Adobe', 'Common', 'AME'),
  ];
  if (process.env.APPDATA) {
    baseDirs.push(join(process.env.APPDATA, 'Adobe', 'Common', 'AME'));
  }

  const presetDirs = new Set<string>();
  for (const baseDir of baseDirs) {
    let entries: Array<{ name: string; isDirectory(): boolean }>;
    try {
      entries = await fs.readdir(baseDir, { withFileTypes: true });
    } catch (error) {
      const code = (error as NodeJS.ErrnoException).code;
      if (code === 'ENOENT' || code === 'ENOTDIR') continue;
      presetDirs.add(join(baseDir, 'Presets'));
      continue;
    }

    for (const entry of entries) {
      if (entry.isDirectory()) {
        presetDirs.add(join(baseDir, entry.name, 'Presets'));
      }
    }
  }
  return [...presetDirs].sort();
}

function ameVersionFromPresetDirectory(directory: string): string {
  return basename(directory).toLowerCase() === 'presets'
    ? basename(dirname(directory))
    : basename(directory);
}

export async function getEncoderPresets(directories?: string[]): Promise<EncoderPresetDiscovery> {
  const searchedDirectories = directories && directories.length > 0
    ? directories
    : await defaultEncoderPresetDirectories();
  const presets: EncoderPresetEntry[] = [];
  const errors: Array<{ path: string; error: string }> = [];

  for (const directory of searchedDirectories) {
    let entries: Array<{ name: string; isFile(): boolean }>;
    try {
      entries = await fs.readdir(directory, { withFileTypes: true });
    } catch (error) {
      const code = (error as NodeJS.ErrnoException).code;
      if (code !== 'ENOENT' && code !== 'ENOTDIR') {
        errors.push({ path: directory, error: error instanceof Error ? error.message : String(error) });
      }
      continue;
    }

    for (const entry of entries) {
      if (!entry.isFile() || extname(entry.name).toLowerCase() !== '.epr') continue;
      const presetPath = join(directory, entry.name);
      try {
        await fs.access(presetPath, fsConstants.R_OK);
        const xml = await fs.readFile(presetPath, 'utf8');
        presets.push({
          name: displayNameFromPresetXml(xml) ?? parse(entry.name).name,
          path: presetPath,
          source: 'user',
          ameVersion: ameVersionFromPresetDirectory(directory),
        });
      } catch (error) {
        errors.push({ path: presetPath, error: error instanceof Error ? error.message : String(error) });
      }
    }
  }

  presets.sort((a, b) => a.name.localeCompare(b.name) || a.path.localeCompare(b.path));
  return {
    success: true,
    presets,
    count: presets.length,
    searchedDirectories,
    errors,
    factoryPresets: {
      supported: false,
      note: 'Factory preset enumeration is not complete or supported; save a user .epr preset in AME and rediscover it here.',
    },
  };
}

async function listAvailableEffects(ctx: ToolContext): Promise<any> {
  const script = `
      try {
        app.enableQE();
        var list = qe.project.getVideoEffectList();
        return JSON.stringify({
          success: true,
          effects: list,
          count: list.length
        });
      } catch (e) {
        return JSON.stringify({ success: false, error: e.toString() });
      }
    `;
  return await ctx.bridge.executeScript(script);
}

async function listAvailableTransitions(ctx: ToolContext): Promise<any> {
  const script = `
      try {
        app.enableQE();
        var list = qe.project.getVideoTransitionList();
        return JSON.stringify({
          success: true,
          transitions: list,
          count: list.length
        });
      } catch (e) {
        return JSON.stringify({ success: false, error: e.toString() });
      }
    `;
  return await ctx.bridge.executeScript(script);
}

async function listAvailableAudioEffects(ctx: ToolContext): Promise<any> {
  const script = `
      try {
        app.enableQE();
        var list = qe.project.getAudioEffectList();
        return JSON.stringify({
          success: true,
          effects: list,
          count: list.length
        });
      } catch (e) {
        return JSON.stringify({ success: false, error: e.toString() });
      }
    `;
  return await ctx.bridge.executeScript(script);
}

async function listAvailableAudioTransitions(ctx: ToolContext): Promise<any> {
  const script = `
      try {
        app.enableQE();
        var list = qe.project.getAudioTransitionList();
        return JSON.stringify({
          success: true,
          transitions: list,
          count: list.length
        });
      } catch (e) {
        return JSON.stringify({ success: false, error: e.toString() });
      }
    `;
  return await ctx.bridge.executeScript(script);
}

async function findProjectItemByName(ctx: ToolContext, name: string, type?: string): Promise<any> {
  const filterType = type || 'any';
  const script = `
      try {
        var searchName = ${JSON.stringify(name)}.toLowerCase();
        var filterType = ${JSON.stringify(filterType)};
        var results = [];
        function walkItems(parent) {
          for (var i = 0; i < parent.children.numItems; i++) {
            var item = parent.children[i];
            var itemType = item.type === 2 ? "bin" : (item.isSequence() ? "sequence" : "footage");
            if (item.name.toLowerCase().indexOf(searchName) !== -1) {
              if (filterType === "any" || filterType === itemType) {
                var info = {
                  id: item.nodeId,
                  name: item.name,
                  type: itemType,
                  treePath: item.treePath
                };
                try { info.mediaPath = item.getMediaPath(); } catch(e) {}
                results.push(info);
              }
            }
            if (item.type === 2) {
              walkItems(item);
            }
          }
        }
        walkItems(app.project.rootItem);
        return JSON.stringify({
          success: true,
          items: results,
          count: results.length
        });
      } catch (e) {
        return JSON.stringify({ success: false, error: e.toString() });
      }
    `;
  return await ctx.bridge.executeScript(script);
}

async function getClipAtPosition(ctx: ToolContext, sequenceId: string, trackType: string, trackIndex: number, time: number): Promise<any> {
  const script = `
      try {
        var sequence = __findSequence(${JSON.stringify(sequenceId)});
        if (!sequence) return JSON.stringify({ success: false, error: "Sequence not found by id: " + ${JSON.stringify(sequenceId)} });
        var tracks = ${JSON.stringify(trackType)} === "video" ? sequence.videoTracks : sequence.audioTracks;
        if (${trackIndex} < 0 || ${trackIndex} >= tracks.numTracks) return JSON.stringify({ success: false, error: "Track index out of range" });
        var track = tracks[${trackIndex}];
        var targetTime = ${time};
        for (var i = 0; i < track.clips.numItems; i++) {
          var clip = track.clips[i];
          if (clip.start.seconds <= targetTime && clip.end.seconds > targetTime) {
            return JSON.stringify({
              success: true,
              clip: {
                nodeId: clip.nodeId,
                name: clip.name,
                start: clip.start.seconds,
                end: clip.end.seconds,
                duration: clip.duration.seconds,
                inPoint: clip.inPoint.seconds,
                outPoint: clip.outPoint.seconds,
                trackIndex: ${trackIndex},
                trackType: ${JSON.stringify(trackType)},
                clipIndex: i
              }
            });
          }
        }
        return JSON.stringify({
          success: true,
          clip: null,
          message: "No clip found at time " + targetTime + "s on " + ${JSON.stringify(trackType)} + " track " + ${trackIndex}
        });
      } catch (e) {
        return JSON.stringify({ success: false, error: e.toString() });
      }
    `;
  return await ctx.bridge.executeScript(script);
}

async function checkOfflineMedia(ctx: ToolContext): Promise<any> {
  const script = `
      try {
        var offlineItems = [];
        function walkForOffline(parent) {
          for (var i = 0; i < parent.children.numItems; i++) {
            var item = parent.children[i];
            if (item.type === 2) {
              walkForOffline(item);
            } else {
              if (item.isOffline()) {
                offlineItems.push({
                  nodeId: item.nodeId,
                  name: item.name,
                  treePath: item.treePath
                });
              }
            }
          }
        }
        walkForOffline(app.project.rootItem);
        return JSON.stringify({
          success: true,
          offlineCount: offlineItems.length,
          offlineItems: offlineItems
        });
      } catch (e) {
        return JSON.stringify({ success: false, error: e.toString() });
      }
    `;
  return await ctx.bridge.executeScript(script);
}
