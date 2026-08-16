/**
 * Bridge module for communicating with Adobe Premiere Pro
 * 
 * This module handles the communication between the MCP server and Adobe Premiere Pro
 * using various methods including UXP, ExtendScript, and file-based communication.
 */

import { Logger } from '../utils/logger.js';
import { ChildProcess } from 'child_process';
import { randomUUID } from 'node:crypto';
import { promises as fs } from 'fs';
import { extname, join } from 'path';
import { createSecureTempDir, validateFilePath } from '../utils/security.js';
import type { PremiereProTransport } from './types.js';

const UNSUPPORTED_MODAL_PRONE_IMPORT_EXTENSIONS = new Set([
  '.ass',
  '.ssa'
]);

const EXTENDSCRIPT_HELPERS = `
function __mcpEscapeString(value) {
  return String(value)
    .replace(/\\\\/g, '\\\\\\\\')
    .replace(/"/g, '\\\\"')
    .replace(/\\r/g, '\\\\r')
    .replace(/\\n/g, '\\\\n')
    .replace(/\\t/g, '\\\\t');
}
function __mcpStringify(value) {
  if (value === null) return 'null';
  var valueType = typeof value;
  if (valueType === 'string') return '"' + __mcpEscapeString(value) + '"';
  if (valueType === 'number') return isFinite(value) ? String(value) : 'null';
  if (valueType === 'boolean') return value ? 'true' : 'false';
  if (value instanceof Array) {
    var arrayParts = [];
    for (var i = 0; i < value.length; i++) {
      arrayParts.push(__mcpStringify(value[i]));
    }
    return '[' + arrayParts.join(',') + ']';
  }
  if (valueType === 'object') {
    var objectParts = [];
    for (var key in value) {
      if (value.hasOwnProperty && !value.hasOwnProperty(key)) continue;
      if (typeof value[key] === 'undefined' || typeof value[key] === 'function') continue;
      objectParts.push(__mcpStringify(String(key)) + ':' + __mcpStringify(value[key]));
    }
    return '{' + objectParts.join(',') + '}';
  }
  return 'null';
}
if (typeof JSON === 'undefined') { JSON = {}; }
if (typeof JSON.stringify !== 'function') { JSON.stringify = __mcpStringify; }
function __findSequence(id) {
  if (!app.project || !app.project.sequences) return null;
  for (var i = 0; i < app.project.sequences.numSequences; i++) {
    if (app.project.sequences[i].sequenceID === id) return app.project.sequences[i];
  }
  return null;
}
function __findClipInSequence(seq, nodeId) {
  if (!seq) return null;
  for (var t = 0; t < seq.videoTracks.numTracks; t++) {
    var track = seq.videoTracks[t];
    for (var c = 0; c < track.clips.numItems; c++) {
      if (track.clips[c].nodeId === nodeId)
        return { clip: track.clips[c], track: track, trackIndex: t, clipIndex: c, trackType: 'video', sequence: seq, sequenceId: seq.sequenceID, sequenceName: seq.name };
    }
  }
  for (var t = 0; t < seq.audioTracks.numTracks; t++) {
    var track = seq.audioTracks[t];
    for (var c = 0; c < track.clips.numItems; c++) {
      if (track.clips[c].nodeId === nodeId)
        return { clip: track.clips[c], track: track, trackIndex: t, clipIndex: c, trackType: 'audio', sequence: seq, sequenceId: seq.sequenceID, sequenceName: seq.name };
    }
  }
  return null;
}
function __findClip(nodeId, sequenceId) {
  if (!app.project) return null;
  if (sequenceId) return __findClipInSequence(__findSequence(sequenceId), nodeId);

  var found = __findClipInSequence(app.project.activeSequence, nodeId);
  if (found) return found;

  if (!app.project.sequences) return null;
  for (var i = 0; i < app.project.sequences.numSequences; i++) {
    found = __findClipInSequence(app.project.sequences[i], nodeId);
    if (found) return found;
  }
  return null;
}
function __samePath(a, b) {
  function normalize(value) {
    return String(value || '').replace(/\\\\/g, '/').replace(/\\/+$/g, '');
  }
  return normalize(a) === normalize(b);
}
function __findProjectItem(nodeId) {
  if (!app.project || !app.project.rootItem) return null;
  function walk(item) {
    if (item.nodeId === nodeId) return item;
    if (item.children) {
      for (var i = 0; i < item.children.numItems; i++) {
        var found = walk(item.children[i]);
        if (found) return found;
      }
    }
    return null;
  }
  return walk(app.project.rootItem);
}
function __ticksToSeconds(ticks) {
  return parseInt(ticks, 10) / 254016000000;
}
function __secondsToTicks(seconds) {
  return String(Math.round(seconds * 254016000000));
}
`;

export interface PremiereProProject {
  id: string;
  name: string;
  path: string;
  isOpen: boolean;
  sequences: PremiereProSequence[];
  projectItems: PremiereProProjectItem[];
}

export interface PremiereProSequence {
  id: string;
  name: string;
  duration: number;
  frameRate: number;
  videoTracks: PremiereProTrack[];
  audioTracks: PremiereProTrack[];
}

export interface PremiereProTrack {
  id: string;
  name: string;
  type: 'video' | 'audio';
  clips: PremiereProClip[];
}

export interface PremiereProClip {
  id: string;
  name: string;
  inPoint: number;
  outPoint: number;
  duration: number;
  mediaPath?: string;
}

export interface PremiereProProjectItem {
  id: string;
  name: string;
  type: 'footage' | 'sequence' | 'bin';
  mediaPath?: string;
  duration?: number;
  frameRate?: number;
}

export interface PremiereProEffect {
  id: string;
  name: string;
  category: string;
  parameters: Record<string, any>;
}

export class PremiereProBridge implements PremiereProTransport {
  private logger: Logger;
  private communicationMethod: 'uxp' | 'extendscript' | 'file';
  private tempDir: string;
  private readonly usesExternalTempDir: boolean;
  private uxpProcess?: ChildProcess;
  private isInitialized = false;
  private sessionId: string;

  constructor() {
    this.logger = new Logger('PremiereProBridge');
    this.communicationMethod = 'file'; // Default to file-based communication
    this.sessionId = randomUUID();
    // Use PREMIERE_TEMP_DIR if set (same path as UXP plugin "Temp Directory"), else session-specific
    const envDir = process.env.PREMIERE_TEMP_DIR;
    this.usesExternalTempDir = Boolean(envDir);
    this.tempDir = envDir ? envDir.replace(/\/$/, '') : createSecureTempDir(this.sessionId);
  }

  async initialize(): Promise<void> {
    try {
      await this.setupTempDirectory();
      await this.detectPremiereProInstallation();
      await this.initializeCommunication();
      this.isInitialized = true;
      this.logger.info('Adobe Premiere Pro bridge initialized successfully');
    } catch (error) {
      this.logger.error('Failed to initialize Adobe Premiere Pro bridge:', error);
      throw error;
    }
  }

  private async setupTempDirectory(): Promise<void> {
    try {
      await fs.mkdir(this.tempDir, { recursive: true, mode: 0o700 }); // Restrict to owner only
      this.logger.debug(`Secure temp directory created: ${this.tempDir}`);
    } catch (error) {
      this.logger.error('Failed to create temp directory:', error);
      throw error;
    }
  }

  private async detectPremiereProInstallation(): Promise<void> {
    // Scan the install root instead of hardcoding release years, so new
    // versions (2025, 2026, ...) are detected without a code change.
    const searchDirs = process.platform === 'win32'
      ? [join(process.env['ProgramFiles'] || 'C:\\Program Files', 'Adobe')]
      : ['/Applications'];

    for (const dir of searchDirs) {
      let entries: string[] = [];
      try {
        const listing = await fs.readdir(dir);
        entries = Array.isArray(listing) ? listing : [];
      } catch (error) {
        continue; // Install root is missing on this machine
      }

      // Newest release first, e.g. "Adobe Premiere Pro 2026" before "... 2024"
      const candidates = entries
        .filter(entry => entry.startsWith('Adobe Premiere Pro'))
        .sort()
        .reverse();

      for (const candidate of candidates) {
        const path = join(dir, candidate);
        try {
          await fs.access(path);
          this.logger.info(`Found Adobe Premiere Pro at: ${path}`);
          return;
        } catch (error) {
          // Continue checking other candidates
        }
      }
    }

    this.logger.warn('Adobe Premiere Pro installation not found in common paths');
  }

  private async initializeCommunication(): Promise<void> {
    // For now, we'll use file-based communication as it's the most reliable
    // In a production environment, you would set up UXP or ExtendScript communication
    this.communicationMethod = 'file';
    this.logger.info(`Using ${this.communicationMethod} communication method`);
  }

  private isSelfInvokingScript(script: string): boolean {
    const trimmed = script.trim();
    return /^\(function\s*\(\)\s*\{[\s\S]*\}\)\s*\(\)\s*;?$/.test(trimmed);
  }

  private buildExecutableScript(script: string): string {
    if (this.isSelfInvokingScript(script)) {
      return EXTENDSCRIPT_HELPERS + script.trim();
    }

    // Wrap script bodies so top-level "return ..." remains valid in ExtendScript.
    return EXTENDSCRIPT_HELPERS + '(function(){\n' + script + '\n})();';
  }

  async executeScript(script: string, timeoutMs?: number): Promise<any> {
    if (!this.isInitialized) {
      throw new Error('Bridge not initialized. Call initialize() first.');
    }

    const commandId = randomUUID();
    const commandFile = join(this.tempDir, `command-${commandId}.json`);
    const responseFile = join(this.tempDir, `response-${commandId}.json`);

    try {
      const fullScript = this.buildExecutableScript(script);

      // Write command to file. Include timeoutMs so the CEP/UXP panel can extend its own
      // execution watchdog to match — otherwise the panel's default (45s) kills long batch
      // scripts well before the server's own timeout elapses.
      await fs.writeFile(commandFile, JSON.stringify({
        id: commandId,
        script: fullScript,
        timeoutMs: timeoutMs,
        timestamp: new Date().toISOString()
      }));

      // Wait for response (in a real implementation, this would be handled by the UXP plugin).
      // Batch operations pass a larger timeout because a single round-trip does the work of
      // dozens of individual calls inside one ExtendScript pass.
      const response = await this.waitForResponse(responseFile, timeoutMs);
      
      // Clean up files
      await fs.unlink(commandFile).catch(() => {});
      await fs.unlink(responseFile).catch(() => {});

      return response;
    } catch (error) {
      this.logger.error(`Failed to execute script: ${error}`);
      throw error;
    }
  }

  private async waitForResponse(responseFile: string, timeout = 60000): Promise<any> {
    const startTime = Date.now();

    while (Date.now() - startTime < timeout) {
      try {
        const response = await fs.readFile(responseFile, 'utf8');
        const parsed = JSON.parse(response);
        if (parsed.result !== undefined) return parsed.result;
        return parsed;
      } catch (error) {
        await new Promise(resolve => setTimeout(resolve, 150));
      }
    }

    throw new Error(
      'Bridge response timeout. Ensure Premiere Pro is open, MCP Bridge (CEP or UXP) panel is open, ' +
      'Temp Directory is set to ' + this.tempDir + ', and Start Bridge is clicked.'
    );
  }

  // Project Management
  async createProject(name: string, location: string): Promise<PremiereProProject> {
    const normalizedLocation = location.replace(/[\\/]+$/, '');
    const projectFileName = name.endsWith('.prproj') ? name : `${name}.prproj`;
    const projectPath = `${normalizedLocation}/${projectFileName}`;
    const script = `
      var projectPath = ${JSON.stringify(projectPath)};
      var projectFolder = new Folder(${JSON.stringify(normalizedLocation)});

      if (!projectFolder.exists && !projectFolder.create()) {
        return JSON.stringify({
          success: false,
          error: "Could not create project folder",
          projectPath: projectPath
        });
      }

      var createdResult = app.newProject(projectPath);
      var projectFile = new File(projectPath);

      if (!projectFile.exists && app.project && app.project.saveAs) {
        try {
          app.project.saveAs(projectPath);
        } catch (saveError) {}
      }

      var project = app.project;
      var actualPath = project && project.path ? String(project.path) : "";

      if (!projectFile.exists || !__samePath(actualPath, projectPath)) {
        return JSON.stringify({
          success: false,
          error: "Premiere Pro did not create or activate the requested project",
          projectPath: projectPath,
          actualPath: actualPath,
          createdResult: createdResult
        });
      }

      return JSON.stringify({
        success: true,
        id: project.documentID,
        name: project.name,
        path: project.path,
        isOpen: true,
        sequences: [],
        projectItems: []
      });
    `;
    
    return await this.executeScript(script);
  }

  async openProject(path: string): Promise<PremiereProProject> {
    const script = `
      var projectPath = ${JSON.stringify(path)};
      var projectFile = new File(projectPath);

      if (!projectFile.exists) {
        return JSON.stringify({
          success: false,
          error: "Project file does not exist",
          projectPath: projectPath
        });
      }

      var openResult = app.openDocument(projectPath);
      var project = app.project;
      var actualPath = project && project.path ? String(project.path) : "";

      if (!project || !__samePath(actualPath, projectPath)) {
        return JSON.stringify({
          success: false,
          error: "Premiere Pro did not activate the requested project",
          projectPath: projectPath,
          actualPath: actualPath,
          openResult: openResult
        });
      }

      return JSON.stringify({
        success: true,
        id: project.documentID,
        name: project.name,
        path: project.path,
        isOpen: true,
        sequences: [],
        projectItems: []
      });
    `;
    
    return await this.executeScript(script);
  }

  async saveProject(): Promise<void> {
    const script = `
      // Save current project
      app.project.save();
      return JSON.stringify({ success: true });
    `;
    
    await this.executeScript(script);
  }

  async importMedia(filePath: string): Promise<PremiereProProjectItem> {
    // Validate file path for security
    const pathValidation = validateFilePath(filePath);
    if (!pathValidation.valid) {
      throw new Error(`Invalid file path: ${pathValidation.error}`);
    }

    // Use the normalized path from validation (don't double-escape)
    const safePath = pathValidation.normalized || filePath;
    const ext = extname(safePath).toLowerCase();
    if (UNSUPPORTED_MODAL_PRONE_IMPORT_EXTENSIONS.has(ext)) {
      return {
        success: false,
        error: `Unsupported import format "${ext}". Premiere Pro can show a blocking "File format not supported" modal for this file type, so the MCP server refused to import it before calling Premiere. Convert it to .srt or another Premiere-supported media format first.`,
        filePath: safePath,
        blockedBeforePremiere: true
      } as any;
    }

    const script = `
      try {
        function __walkItems(parent, output) {
          for (var i = 0; i < parent.children.numItems; i++) {
            var child = parent.children[i];
            output.push(child);
            if (child.type === ProjectItemType.BIN) {
              __walkItems(child, output);
            }
          }
        }

        var file = new File(${JSON.stringify(safePath)});
        if (!file.exists) {
          return JSON.stringify({
            success: false,
            error: "File not found: " + ${JSON.stringify(safePath)}
          });
        }

        var existingItems = [];
        __walkItems(app.project.rootItem, existingItems);

        // Premiere returns true when asked to import media already in the
        // project, but it does not add another project item. Reuse that item
        // instead of reporting a fabricated import failure.
        for (var existingIndex = 0; existingIndex < existingItems.length; existingIndex++) {
          var existingItem = existingItems[existingIndex];
          try {
            if (existingItem.getMediaPath && existingItem.getMediaPath() === file.fsName) {
              return JSON.stringify({
                success: true,
                id: existingItem.nodeId,
                name: existingItem.name,
                type: existingItem.type.toString(),
                mediaPath: file.fsName,
                alreadyImported: true
              });
            }
          } catch (e) {}
        }

        var importResult = app.project.importFiles([file.fsName], true, app.project.rootItem, false);
        if (!importResult) {
          return JSON.stringify({
            success: false,
            error: "Failed to import file"
          });
        }

        var afterItems = [];
        __walkItems(app.project.rootItem, afterItems);

        var importedItem = null;
        for (var j = 0; j < afterItems.length; j++) {
          var candidate = afterItems[j];
          var alreadyPresent = false;
          for (var k = 0; k < existingItems.length; k++) {
            if (existingItems[k].nodeId === candidate.nodeId) {
              alreadyPresent = true;
              break;
            }
          }
          if (alreadyPresent) {
            continue;
          }
          try {
            if (candidate.getMediaPath && candidate.getMediaPath() === file.fsName) {
              importedItem = candidate;
              break;
            }
          } catch (e) {}
          if (!importedItem && candidate.name === file.name) {
            importedItem = candidate;
          }
        }

        if (!importedItem) {
          return JSON.stringify({
            success: false,
            error: "Import completed but imported item could not be located"
          });
        }

        return JSON.stringify({
          success: true,
          id: importedItem.nodeId,
          name: importedItem.name,
          type: importedItem.type.toString(),
          mediaPath: importedItem.getMediaPath ? importedItem.getMediaPath() : file.fsName
        });
      } catch (e) {
        return JSON.stringify({
          success: false,
          error: e.toString()
        });
      }
    `;

    return await this.executeScript(script);
  }

  async createSequence(name: string, presetPath: string): Promise<PremiereProSequence> {
    const script = `
      try {
        var sequenceName = ${JSON.stringify(name)};
        var presetPath = ${JSON.stringify(presetPath)};
        var presetFile = new File(presetPath);
        if (!presetFile.exists) {
          return JSON.stringify({
            success: false,
            error: "Sequence preset file not found: " + presetPath,
            sequenceName: sequenceName,
            blockedBeforePremiere: true
          });
        }
        var beforeIds = {};

        if (app.project && app.project.sequences) {
          for (var i = 0; i < app.project.sequences.numSequences; i++) {
            beforeIds[app.project.sequences[i].sequenceID] = true;
          }
        }

        var sequence = null;
        var createError = null;
        try {
          // newSequence(name, presetPath) is Premiere's non-interactive preset API.
          // createNewSequence() treats its second argument differently and can open
          // the native New Sequence dialog on current Premiere releases.
          sequence = app.project.newSequence(sequenceName, presetFile.fsName);
        } catch (createException) {
          createError = createException;
        }

        var created = sequence || null;
        if (!created && app.project && app.project.sequences) {
          for (var j = 0; j < app.project.sequences.numSequences; j++) {
            var candidate = app.project.sequences[j];
            if (!beforeIds[candidate.sequenceID] && candidate.name === sequenceName) {
              created = candidate;
              break;
            }
          }
        }

        if (!created && app.project && app.project.sequences) {
          for (var k = app.project.sequences.numSequences - 1; k >= 0; k--) {
            var fallback = app.project.sequences[k];
            if (fallback.name === sequenceName) {
              created = fallback;
              break;
            }
          }
        }

        if (!created) {
          return JSON.stringify({
            success: false,
            error: createError
              ? createError.toString()
              : "Sequence creation completed but the new sequence could not be located",
            sequenceName: sequenceName
          });
        }

        return JSON.stringify({
          success: true,
          id: created.sequenceID,
          name: created.name,
          duration: created.end ? __ticksToSeconds(created.end) : 0,
          frameRate: created.timebase ? (254016000000 / parseInt(created.timebase, 10)) : null,
          videoTrackCount: created.videoTracks ? created.videoTracks.numTracks : 0,
          audioTrackCount: created.audioTracks ? created.audioTracks.numTracks : 0,
          videoTracks: [],
          audioTracks: []
        });
      } catch (e) {
        return JSON.stringify({
          success: false,
          error: e.toString(),
          sequenceName: ${JSON.stringify(name)}
        });
      }
    `;
    
    return await this.executeScript(script);
  }

  async addToTimeline(sequenceId: string, projectItemId: string, trackIndex: number, time: number, linkAudio: boolean = true, sourceInPoint?: number, sourceOutPoint?: number): Promise<PremiereProClip> {
    const script = `
      try {
        var sequence = __findSequence("${sequenceId}");
        if (!sequence) {
          return JSON.stringify({ success: false, error: "Sequence not found" });
        }

        var projectItem = __findProjectItem("${projectItemId}");
        if (!projectItem) {
          return JSON.stringify({ success: false, error: "Project item not found" });
        }

        // Audio-only routing: detect by file extension and route to audioTracks instead of
        // videoTracks. Without this, mp3/wav/aif/m4a/aac/flac/ogg clips fail with
        // "Video track not found" because addToTimeline always indexed sequence.videoTracks.
        var mediaPath = projectItem.getMediaPath ? projectItem.getMediaPath() : "";
        var isAudioOnly = /\\.(mp3|wav|aif|aiff|m4a|aac|flac|ogg|wma)$/i.test(mediaPath);
        var trackKind;
        var track;
        if (isAudioOnly) {
          trackKind = "audio";
          track = sequence.audioTracks[${trackIndex}];
          if (!track) {
            return JSON.stringify({ success: false, error: "Audio track not found at index ${trackIndex}", audioTrackCount: sequence.audioTracks.numTracks });
          }
        } else {
          trackKind = "video";
          track = sequence.videoTracks[${trackIndex}];
          if (!track) {
            return JSON.stringify({ success: false, error: "Video track not found at index ${trackIndex}", videoTrackCount: sequence.videoTracks.numTracks });
          }
        }

        // Source in/out: replicate the Source-monitor "mark in / mark out then
        // overwrite" move. overwriteClip(projectItem, time) places whatever range
        // is currently marked on the projectItem, so set the marks first. Without
        // this, an arbitrary interior sub-range of a source cannot be placed.
        var srcIn = ${sourceInPoint === undefined ? 'null' : sourceInPoint};
        var srcOut = ${sourceOutPoint === undefined ? 'null' : sourceOutPoint};
        var appliedSourceInOut = false;
        var sourceInOutError = "";
        if (srcIn !== null && srcOut !== null) {
          try {
            // mediaType 4 = all streams (video + audio) in one call
            projectItem.setInPoint(srcIn, 4);
            projectItem.setOutPoint(srcOut, 4);
            appliedSourceInOut = true;
          } catch (eio) {
            try {
              // fall back to per-stream marks (video=1, audio=2)
              projectItem.setInPoint(srcIn, 1);
              projectItem.setOutPoint(srcOut, 1);
              projectItem.setInPoint(srcIn, 2);
              projectItem.setOutPoint(srcOut, 2);
              appliedSourceInOut = true;
            } catch (eio2) {
              try {
                // last resort: no mediaType arg
                projectItem.setInPoint(srcIn);
                projectItem.setOutPoint(srcOut);
                appliedSourceInOut = true;
              } catch (eio3) {
                sourceInOutError = String(eio3);
              }
            }
          }
        }

        track.overwriteClip(projectItem, ${time});

        var placedClip = null;
        for (var i = 0; i < track.clips.numItems; i++) {
          var candidate = track.clips[i];
          if (candidate && candidate.projectItem && candidate.projectItem.nodeId === projectItem.nodeId && Math.abs(candidate.start.seconds - ${time}) < 0.1) {
            placedClip = candidate;
            break;
          }
        }

        if (!placedClip && track.clips.numItems > 0) {
          placedClip = track.clips[track.clips.numItems - 1];
        }

        if (!placedClip) {
          return JSON.stringify({ success: false, error: "Clip placement did not produce a track item" });
        }

        // linkAudio=false post-processing: when placing a video-track clip whose source
        // media has an embedded audio stream (e.g. Remotion .mov outputs with silent PCM),
        // Premiere auto-links and places the audio counterpart on the next available
        // audio track via overwriteClip. This can DESTROY existing audio (Sprint 3 v14g
        // bug: silent overlay PCM overwrote founder voice on A1). Pass linkAudio=false
        // to scan audio tracks for the linked counterpart at the same start time and
        // remove it. The video on the target track is untouched.
        var unlinkedAudioRemoved = 0;
        if (!isAudioOnly && ${linkAudio} === false) {
          var videoStart = placedClip.start.seconds;
          var tolerance = 0.1;
          for (var at = 0; at < sequence.audioTracks.numTracks; at++) {
            var audioTrack = sequence.audioTracks[at];
            // iterate backwards because remove() may shift indices
            for (var ai = audioTrack.clips.numItems - 1; ai >= 0; ai--) {
              var audioClip = audioTrack.clips[ai];
              if (audioClip && audioClip.projectItem &&
                  audioClip.projectItem.nodeId === projectItem.nodeId &&
                  Math.abs(audioClip.start.seconds - videoStart) < tolerance) {
                try {
                  audioClip.remove(false, false); // ripple=false, alignToVideo=false
                  unlinkedAudioRemoved++;
                } catch (rmErr) {
                  // best effort — log but don't fail the whole add_to_timeline
                }
              }
            }
          }
        }

        return JSON.stringify({
          success: true,
          id: placedClip.nodeId,
          name: placedClip.name,
          trackKind: trackKind,
          inPoint: placedClip.start.seconds,
          outPoint: placedClip.end.seconds,
          duration: placedClip.duration.seconds,
          mediaPath: placedClip.projectItem && placedClip.projectItem.getMediaPath ? placedClip.projectItem.getMediaPath() : "",
          linkAudio: ${linkAudio},
          unlinkedAudioRemoved: unlinkedAudioRemoved,
          appliedSourceInOut: appliedSourceInOut,
          sourceInOutError: sourceInOutError
        });
      } catch (e) {
        return JSON.stringify({
          success: false,
          error: e.toString()
        });
      }
    `;

    return await this.executeScript(script);
  }

  // Batch variant of addToTimeline: place many clips in ONE ExtendScript round-trip.
  // The per-call file/WS round-trip (~seconds each, 60s timeout) is the real bottleneck when
  // placing a whole edit; looping inside one script collapses N round-trips into 1. Mirrors the
  // single-clip logic: audio-only routing by extension, Source-monitor in/out marking (mediaType
  // 4 with per-stream + no-arg fallbacks), overwriteClip. Returns a per-clip result array so a
  // single bad clip never sinks the batch.
  async addToTimelineBatch(sequenceId: string, clips: Array<{ projectItemId: string; trackIndex: number; time: number; linkAudio?: boolean; sourceInPoint?: number; sourceOutPoint?: number }>): Promise<any> {
    const specs = clips.map(c => ({
      projectItemId: c.projectItemId,
      trackIndex: c.trackIndex,
      time: c.time,
      // Mirror the single-call default (true = keep Premiere's native audio linking).
      linkAudio: c.linkAudio === undefined ? true : c.linkAudio,
      sourceInPoint: c.sourceInPoint === undefined ? null : c.sourceInPoint,
      sourceOutPoint: c.sourceOutPoint === undefined ? null : c.sourceOutPoint,
    }));
    const script = `
      try {
        var sequence = __findSequence(${JSON.stringify(sequenceId)});
        if (!sequence) {
          return JSON.stringify({ success: false, error: "Sequence not found" });
        }
        var specs = ${JSON.stringify(specs)};
        var results = [];
        for (var c = 0; c < specs.length; c++) {
          var spec = specs[c];
          var r = { index: c, time: spec.time, success: false };
          try {
            var projectItem = __findProjectItem(spec.projectItemId);
            if (!projectItem) { r.error = "Project item not found"; results.push(r); continue; }

            var mediaPath = projectItem.getMediaPath ? projectItem.getMediaPath() : "";
            var isAudioOnly = /\\.(mp3|wav|aif|aiff|m4a|aac|flac|ogg|wma)$/i.test(mediaPath);
            var track = isAudioOnly ? sequence.audioTracks[spec.trackIndex] : sequence.videoTracks[spec.trackIndex];
            if (!track) { r.error = "Track not found at index " + spec.trackIndex; results.push(r); continue; }

            if (spec.sourceInPoint !== null && spec.sourceOutPoint !== null) {
              try {
                projectItem.setInPoint(spec.sourceInPoint, 4);
                projectItem.setOutPoint(spec.sourceOutPoint, 4);
              } catch (eio) {
                try {
                  projectItem.setInPoint(spec.sourceInPoint, 1);
                  projectItem.setOutPoint(spec.sourceOutPoint, 1);
                  projectItem.setInPoint(spec.sourceInPoint, 2);
                  projectItem.setOutPoint(spec.sourceOutPoint, 2);
                } catch (eio2) {
                  try {
                    projectItem.setInPoint(spec.sourceInPoint);
                    projectItem.setOutPoint(spec.sourceOutPoint);
                  } catch (eio3) {}
                }
              }
            }

            track.overwriteClip(projectItem, spec.time);

            var placedClip = null;
            for (var i = 0; i < track.clips.numItems; i++) {
              var candidate = track.clips[i];
              if (candidate && candidate.projectItem && candidate.projectItem.nodeId === projectItem.nodeId && Math.abs(candidate.start.seconds - spec.time) < 0.1) {
                placedClip = candidate;
                break;
              }
            }
            if (!placedClip && track.clips.numItems > 0) {
              placedClip = track.clips[track.clips.numItems - 1];
            }
            if (!placedClip) { r.error = "Clip placement did not produce a track item"; results.push(r); continue; }

            r.success = true;
            r.id = placedClip.nodeId;
            r.name = placedClip.name;
            r.inPoint = placedClip.start.seconds;
            r.outPoint = placedClip.end.seconds;

            // linkAudio=false cleanup — mirror the single-call addToTimeline path so batch
            // rebuild/overlay workflows don't reintroduce the silent embedded-audio overwrite
            // bug. When a video-track clip's source carries an embedded audio stream, Premiere
            // auto-links and overwrites its counterpart onto an audio track, which can DESTROY
            // existing audio. When linkAudio is false, remove that counterpart at the same
            // start time. The video on the target track is untouched.
            r.linkAudio = spec.linkAudio;
            r.unlinkedAudioRemoved = 0;
            if (!isAudioOnly && spec.linkAudio === false) {
              var videoStart = placedClip.start.seconds;
              var tolerance = 0.1;
              for (var at = 0; at < sequence.audioTracks.numTracks; at++) {
                var audioTrack = sequence.audioTracks[at];
                // iterate backwards because remove() may shift indices
                for (var ai = audioTrack.clips.numItems - 1; ai >= 0; ai--) {
                  var audioClip = audioTrack.clips[ai];
                  if (audioClip && audioClip.projectItem &&
                      audioClip.projectItem.nodeId === projectItem.nodeId &&
                      Math.abs(audioClip.start.seconds - videoStart) < tolerance) {
                    try {
                      audioClip.remove(false, false); // ripple=false, alignToVideo=false
                      r.unlinkedAudioRemoved++;
                    } catch (rmErr) {
                      // best effort — don't fail this clip over cleanup
                    }
                  }
                }
              }
            }
          } catch (e) {
            r.error = e.toString();
          }
          results.push(r);
        }
        var placed = 0;
        for (var k = 0; k < results.length; k++) { if (results[k].success) placed++; }
        var failed = specs.length - placed;
        // Aggregate status must reflect reality: success is true ONLY when every requested
        // clip placed. placed===0 => failure; some-but-not-all => partial. Per-clip results[]
        // still carry the detail. (PR #48 review: don't report success when placements failed.)
        var allPlaced = (specs.length > 0 && placed === specs.length);
        return JSON.stringify({
          success: allPlaced,
          status: (placed === 0 ? "failure" : (allPlaced ? "success" : "partial")),
          placed: placed,
          failed: failed,
          total: specs.length,
          results: results
        });
      } catch (e) {
        return JSON.stringify({ success: false, error: e.toString() });
      }
    `;
    return await this.executeScript(script, 300000);
  }

  async renderSequence(
    sequenceId: string,
    outputPath: string,
    presetPath: string,
    options: { sourceRange?: 'entire' | 'in_out' | 'work_area'; removeOnCompletion?: boolean } = {}
  ): Promise<any> {
    const sourceRange = options.sourceRange ?? 'entire';
    const removeOnCompletion = options.removeOnCompletion ?? true;
    const encoder = await this.findInstalledMediaEncoder();
    if (encoder.available === false) {
      return {
        success: false,
        status: 'failed',
        code: 'MEDIA_ENCODER_NOT_INSTALLED',
        error: 'Adobe Media Encoder is not installed. The export was not sent to Premiere, so no native Media Encoder warning was shown.',
        searchedPaths: encoder.searchedPaths,
        outputPath,
        presetPath,
        sourceRange,
      };
    }
    const script = `
      try {
        var sequenceId = ${JSON.stringify(sequenceId)};
        var outputPath = ${JSON.stringify(outputPath)};
        var presetPath = ${JSON.stringify(presetPath)};
        var sourceRange = ${JSON.stringify(sourceRange)};
        var removeOnCompletion = ${removeOnCompletion ? 1 : 0};
        var warnings = [];

        function secondsOf(value) {
          if (value === null || typeof value === "undefined") return 0;
          try {
            if (typeof value.ticks !== "undefined") return Number(value.ticks) / 254016000000.0;
            if (typeof value.seconds !== "undefined") {
              var secondsValue = Number(value.seconds);
              return Math.abs(secondsValue) > 1000000 ? secondsValue / 254016000000.0 : secondsValue;
            }
          } catch (_) {}
          var numeric = Number(value);
          if (Math.abs(numeric) > 1000000) return numeric / 254016000000.0;
          return isNaN(numeric) ? 0 : numeric;
        }

        function rangeFailure(code, message, details) {
          var payload = {
            success: false,
            status: "failed",
            code: code,
            error: message,
            sourceRange: sourceRange,
            outputPath: outputPath,
            presetPath: presetPath,
            warnings: warnings
          };
          if (details) {
            for (var key in details) {
              if (details.hasOwnProperty(key)) payload[key] = details[key];
            }
          }
          return JSON.stringify(payload);
        }

        // Premiere 2026 dropped getSequenceByID; iterate via __findSequence helper.
        // Fail hard if the requested sequence isn't found — silently falling back to
        // app.project.activeSequence would queue/render the wrong timeline while still
        // reporting success, masking caller bugs (stale IDs, etc.).
        var sequence = __findSequence(sequenceId);
        if (!sequence) {
          return rangeFailure("SEQUENCE_NOT_FOUND", "Sequence not found by id: " + sequenceId);
        }
        if (typeof app.encoder === "undefined") {
          return rangeFailure("ENCODER_UNAVAILABLE", "app.encoder not available in this Premiere build");
        }

        // Boot AME if not already running so it can pick up the queue
        try { app.encoder.launchEncoder(); }
        catch (e1) {
          warnings.push({ code: "LAUNCH_ENCODER_FAILED", message: e1.toString() });
        }

        var sequenceEnd = secondsOf(sequence.end);
        var sequenceIn = 0;
        var sequenceOut = 0;
        try { sequenceIn = secondsOf(sequence.getInPointAsTime()); } catch (inReadError) {}
        try { sequenceOut = secondsOf(sequence.getOutPointAsTime()); } catch (outReadError) {}
        var inMarked = sequenceIn > 0;
        var outMarked = sequenceOut > 0;
        var range = null;
        var encoderRangeConstant = "";
        var resolvedRange = {
          "in": 0,
          "out": sequenceEnd,
          inMarked: inMarked,
          outMarked: outMarked,
          sequenceEnd: sequenceEnd
        };

        if (sourceRange === "in_out") {
          if (!inMarked && !outMarked) {
            return rangeFailure("IN_OUT_UNSET", "sourceRange in_out requested, but sequence In and Out are both unset.", { resolvedRange: resolvedRange });
          }
          if (!outMarked) {
            return rangeFailure("OUT_POINT_UNSET", "sourceRange in_out requested, but sequence Out is unset.", { resolvedRange: resolvedRange });
          }
          resolvedRange.in = inMarked ? sequenceIn : 0;
          resolvedRange.out = sequenceOut;
          if (resolvedRange.out <= resolvedRange.in) {
            return rangeFailure("INVALID_IN_OUT_RANGE", "sourceRange in_out requires Out to be greater than In.", { resolvedRange: resolvedRange });
          }
          if (sequenceEnd > 0 && resolvedRange.out > sequenceEnd + 0.001) {
            return rangeFailure("OUT_POINT_BEYOND_SEQUENCE_END", "Sequence Out exceeds the physical sequence end.", { resolvedRange: resolvedRange });
          }
          encoderRangeConstant = "ENCODE_IN_TO_OUT";
        } else if (sourceRange === "work_area") {
          var workIn = 0;
          var workOut = 0;
          try { workIn = secondsOf(sequence.getWorkAreaInPointAsTime()); } catch (workInReadError) {}
          try { workOut = secondsOf(sequence.getWorkAreaOutPointAsTime()); } catch (workOutReadError) {}
          resolvedRange = {
            "in": workIn,
            "out": workOut,
            inMarked: workIn > 0,
            outMarked: workOut > 0,
            sequenceEnd: sequenceEnd
          };
          if (workOut <= workIn) {
            return rangeFailure("INVALID_WORK_AREA_RANGE", "sourceRange work_area requires Work Area Out to be greater than Work Area In.", { resolvedRange: resolvedRange });
          }
          if (sequenceEnd > 0 && workOut > sequenceEnd + 0.001) {
            return rangeFailure("WORK_AREA_BEYOND_SEQUENCE_END", "Work Area Out exceeds the physical sequence end.", { resolvedRange: resolvedRange });
          }
          encoderRangeConstant = "ENCODE_WORKAREA";
        } else if (sourceRange === "entire") {
          encoderRangeConstant = "ENCODE_ENTIRE";
        } else {
          return rangeFailure("INVALID_SOURCE_RANGE", "Unsupported sourceRange: " + sourceRange);
        }

        if (typeof app.encoder[encoderRangeConstant] === "undefined") {
          return rangeFailure("ENCODER_RANGE_UNAVAILABLE", "Requested encoder range constant is unavailable: " + encoderRangeConstant, {
            encoderRangeConstant: encoderRangeConstant,
            resolvedRange: resolvedRange
          });
        }
        range = app.encoder[encoderRangeConstant];

        var jobID = app.encoder.encodeSequence(
          sequence,
          outputPath,
          presetPath,
          range,
          removeOnCompletion
        );

        if (!jobID) {
          return JSON.stringify({
            success: false,
            status: "failed",
            error: "encodeSequence returned no jobID — preset path may be invalid or AME not connected",
            outputPath: outputPath,
            presetPath: presetPath,
            sourceRange: sourceRange,
            resolvedRange: resolvedRange,
            encoderRangeConstant: encoderRangeConstant,
            warnings: warnings
          });
        }

        // Trigger AME to actually start processing the queued job
        var queueStarted = false;
        try {
          var startBatchResult = app.encoder.startBatch();
          queueStarted = startBatchResult !== false;
        } catch (e2) {
          warnings.push({ code: "START_BATCH_FAILED", message: e2.toString() });
        }

        return JSON.stringify({
          success: true,
          status: "queued",
          queued: true,
          queueStarted: queueStarted,
          jobID: String(jobID),
          outputPath: outputPath,
          presetPath: presetPath,
          sourceRange: sourceRange,
          resolvedRange: resolvedRange,
          encoderRangeConstant: encoderRangeConstant,
          removeOnCompletion: !!removeOnCompletion,
          warnings: warnings
        });
      } catch (e) {
        return JSON.stringify({ success: false, error: "encodeSequence threw: " + e.toString() });
      }
    `;

    const raw = await this.executeScript(script);
    // CEP returns the JSON.stringify'd object; bridge.executeScript returns parsed.result if present.
    // Some CEP plugins wrap as string; handle both.
    if (typeof raw === "string") {
      try { return JSON.parse(raw); } catch { return { success: false, error: "Bridge returned unparseable string: " + raw }; }
    }
    return raw;
  }

  /**
   * Avoid calling app.encoder.launchEncoder() when AME is absent: Premiere shows
   * a blocking native warning in that case. An unreadable install directory is
   * treated as unknown, so a transient filesystem error does not disable export.
   */
  private async findInstalledMediaEncoder(): Promise<{ available: boolean; searchedPaths: string[] }> {
    if (process.platform === 'darwin') {
      const applications = '/Applications';
      try {
        const entries = await fs.readdir(applications);
        const found = entries.some((entry) => /^Adobe Media Encoder(?: \d+)?\.app$/i.test(entry));
        return { available: found, searchedPaths: [applications] };
      } catch {
        return { available: true, searchedPaths: [applications] };
      }
    }

    if (process.platform === 'win32') {
      const roots = [process.env.ProgramFiles, process.env['ProgramFiles(x86)']].filter((value): value is string => Boolean(value));
      const searchedPaths = roots.map((root) => join(root, 'Adobe'));
      if (searchedPaths.length === 0) return { available: true, searchedPaths };
      try {
        for (const directory of searchedPaths) {
          const entries = await fs.readdir(directory);
          if (entries.some((entry) => /^Adobe Media Encoder(?: \d+)?$/i.test(entry))) {
            return { available: true, searchedPaths };
          }
        }
        return { available: false, searchedPaths };
      } catch {
        return { available: true, searchedPaths };
      }
    }

    return { available: true, searchedPaths: [] };
  }

  async listProjectItems(): Promise<PremiereProProjectItem[]> {
    const script = `
      try {
        if (!app.project || !app.project.rootItem) {
          throw new Error('No open project');
        }
        function walk(item) {
          var results = [];
          if (item.type === ProjectItemType.BIN) {
            for (var i = 0; i < item.children.numItems; i++) {
              results = results.concat(walk(item.children[i]));
            }
          } else {
            results.push({
              id: item.nodeId || item.treePath || item.name,
              name: item.name,
              type: item.type === ProjectItemType.BIN ? 'bin' : (item.type === ProjectItemType.SEQUENCE ? 'sequence' : 'footage'),
              mediaPath: item.getMediaPath ? item.getMediaPath() : undefined,
              duration: item.getOutPoint ? (item.getOutPoint() - item.getInPoint()) : undefined,
              frameRate: item.getVideoFrameRate ? item.getVideoFrameRate() : undefined
            });
          }
          return results;
        }
        var items = walk(app.project.rootItem);
        return JSON.stringify({ ok: true, items: items });
      } catch (e) {
        return JSON.stringify({ ok: false, error: String(e) });
      }
    `;
    const result = await this.executeScript(script);
    if (result.ok) return result.items;
    throw new Error(result.error || 'Unknown error listing project items');
  }

  async cleanup(): Promise<void> {
    if (this.uxpProcess) {
      this.uxpProcess.kill();
    }
    
    // Only remove temp dirs created by this server. The shared bridge directory is
    // configured externally and should persist across restarts.
    try {
      if (!this.usesExternalTempDir) {
        await fs.rm(this.tempDir, { recursive: true });
      }
    } catch (error) {
      this.logger.warn('Failed to clean up temp directory:', error);
    }
    
    this.logger.info('Adobe Premiere Pro bridge cleaned up');
  }
} 
