/**
 * Export, render queue, and interchange output.
 *
 * Each entry declares the tool an agent sees and the handler that runs it,
 * so the two cannot drift apart. Handlers reach Premiere through ToolContext.
 */
import { z } from 'zod';
import { constants as fsConstants, promises as fs } from 'node:fs';
import { dirname, extname, isAbsolute, parse } from 'node:path';
import type { ToolContext, ToolModule } from '../context.js';
import { EncoderPresetEntry, getEncoderPresets } from './discovery.js';

export const exportTools: ToolModule[] = [
  {
    name: 'export_sequence',
    description: 'Renders and exports a sequence to a video file. This is for creating the final video.',
    inputSchema: z.object({
      sequenceId: z.string().describe('The ID of the sequence to export'),
      outputPath: z.string().describe('The absolute path where the final video file will be saved'),
      presetPath: z.string().optional().describe('Absolute path to an export preset file (.epr). Required unless presetName uniquely resolves through get_encoder_presets.'),
      presetName: z.string().optional().describe('Exact user preset display name or filename stem. Must resolve to exactly one discovered .epr preset.'),
      sourceRange: z.enum(['entire', 'in_out', 'work_area']).optional().describe('Export source range. Defaults to entire. Requested ranges are never silently substituted.'),
      allowOverwrite: z.boolean().optional().describe('Allow writing to an existing output file. Defaults to false.'),
      removeOnCompletion: z.boolean().optional().describe('Pass AME removeOnCompletion. Defaults to true to preserve existing queue behavior.'),
      format: z.enum(['mp4', 'mov', 'avi', 'h264', 'prores']).optional().describe('Deprecated hint only; the .epr preset controls codec/container.'),
      quality: z.enum(['low', 'medium', 'high', 'maximum']).optional().describe('Deprecated hint only; the .epr preset controls quality.'),
      resolution: z.string().optional().describe('Deprecated hint only; the .epr preset controls resolution.')
    }),
    run: (ctx, args) => exportSequence(ctx, { sequenceId: args.sequenceId, outputPath: args.outputPath, presetPath: args.presetPath, presetName: args.presetName, sourceRange: args.sourceRange, allowOverwrite: args.allowOverwrite, removeOnCompletion: args.removeOnCompletion, format: args.format, quality: args.quality, resolution: args.resolution }),
  },
  {
    name: 'export_frame',
    description: 'Exports a single frame from a sequence as an image file.',
    inputSchema: z.object({
      sequenceId: z.string().describe('The ID of the sequence'),
      time: z.number().describe('The time in seconds to export the frame from'),
      outputPath: z.string().describe('The absolute path where the image file will be saved'),
      format: z.enum(['png', 'jpg', 'tiff']).optional().describe('The image format')
    }),
    run: (ctx, args) => exportFrame(ctx, args.sequenceId, args.time, args.outputPath, args.format),
  },
  {
    name: 'add_to_render_queue',
    description: 'Adds a sequence to the Adobe Media Encoder render queue.',
    inputSchema: z.object({
      sequenceId: z.string().describe('The ID of the sequence to render'),
      outputPath: z.string().describe('Output file path'),
      presetPath: z.string().optional().describe('Export preset file path'),
      presetName: z.string().optional().describe('Exact user preset display name or filename stem. Must resolve to exactly one discovered .epr preset.'),
      sourceRange: z.enum(['entire', 'in_out', 'work_area']).optional().describe('Export source range. Defaults to entire.'),
      allowOverwrite: z.boolean().optional().describe('Allow writing to an existing output file. Defaults to false.'),
      removeOnCompletion: z.boolean().optional().describe('Pass AME removeOnCompletion. Defaults to true.'),
      startImmediately: z.boolean().optional().describe('Whether to start rendering immediately (default: false)')
    }),
    run: (ctx, args) => addToRenderQueue(ctx, { sequenceId: args.sequenceId, outputPath: args.outputPath, presetPath: args.presetPath, presetName: args.presetName, sourceRange: args.sourceRange, allowOverwrite: args.allowOverwrite, removeOnCompletion: args.removeOnCompletion, startImmediately: args.startImmediately }),
  },
  {
    name: 'get_render_queue_status',
    description: 'Reports whether render queue monitoring is available. This currently returns guidance for Adobe Media Encoder rather than live queue telemetry.',
    inputSchema: z.object({}),
    run: (_ctx) => getRenderQueueStatus(),
  },
  {
    name: 'export_as_fcp_xml',
    description: 'Exports a sequence as Final Cut Pro XML.',
    inputSchema: z.object({
      sequenceId: z.string().describe('The ID of the sequence to export'),
      outputPath: z.string().describe('The absolute file path for the exported XML file')
    }),
    run: (ctx, args) => exportAsFcpXml(ctx, args.sequenceId, args.outputPath),
  },
  {
    name: 'export_aaf',
    description: 'Exports a sequence as an AAF file for interchange with other editing/audio applications.',
    inputSchema: z.object({
      sequenceId: z.string().describe('The ID of the sequence to export'),
      outputPath: z.string().describe('The absolute file path for the exported AAF file'),
      mixDownVideo: z.boolean().optional().describe('Whether to mix down video (default: true)'),
      explodeToMono: z.boolean().optional().describe('Whether to explode audio to mono (default: false)'),
      sampleRate: z.number().optional().describe('Audio sample rate (default: 48000)'),
      bitsPerSample: z.number().optional().describe('Audio bits per sample (default: 16)')
    }),
    run: (ctx, args) => exportAaf(ctx, args.sequenceId, args.outputPath, args.mixDownVideo, args.explodeToMono, args.sampleRate, args.bitsPerSample),
  },
];

type ExportSourceRange = 'entire' | 'in_out' | 'work_area';

interface ExportSequenceArgs {
  sequenceId: string;
  outputPath: string;
  presetPath?: string;
  presetName?: string;
  sourceRange?: ExportSourceRange;
  allowOverwrite?: boolean;
  removeOnCompletion?: boolean;
  format?: string;
  quality?: string;
  resolution?: string;
}

interface AddToRenderQueueArgs extends ExportSequenceArgs {
  startImmediately?: boolean;
}

async function resolvePresetPath(presetPath?: string, presetName?: string): Promise<
  { success: true; presetPath: string; presetName?: string; presetResolution?: any } |
  { success: false; error: string; presetName?: string; matches?: EncoderPresetEntry[]; searchedDirectories?: string[] }
> {
  if (presetPath && presetName) {
    return { success: false, error: 'Provide either presetPath or presetName, not both.', presetName };
  }

  if (presetPath) {
    return { success: true, presetPath };
  }

  if (!presetName) {
    return {
      success: false,
      error: 'presetPath or presetName required — Adobe encodeSequence requires an absolute .epr preset file.',
    };
  }

  const discovery = await getEncoderPresets();
  const matches = discovery.presets.filter((preset) => preset.name === presetName || parse(preset.path).name === presetName);
  if (matches.length === 1) {
    const [match] = matches as [EncoderPresetEntry];
    return {
      success: true,
      presetPath: match.path,
      presetName,
      presetResolution: {
        method: 'exact_name',
        name: match.name,
        path: match.path,
        ameVersion: match.ameVersion,
      },
    };
  }
  if (matches.length > 1) {
    return {
      success: false,
      error: `presetName "${presetName}" is ambiguous; pass presetPath instead.`,
      presetName,
      matches,
      searchedDirectories: discovery.searchedDirectories,
    };
  }
  return {
    success: false,
    error: `presetName "${presetName}" was not found in user AME presets.`,
    presetName,
    searchedDirectories: discovery.searchedDirectories,
  };
}

async function validateExportPaths(outputPath: string, presetPath: string, allowOverwrite = false): Promise<Array<{ code: string; message: string; path?: string }>> {
  const errors: Array<{ code: string; message: string; path?: string }> = [];

  if (!isAbsolute(presetPath)) {
    errors.push({ code: 'PRESET_PATH_NOT_ABSOLUTE', message: 'presetPath must be an absolute .epr path.', path: presetPath });
  } else if (extname(presetPath).toLowerCase() !== '.epr') {
    errors.push({ code: 'PRESET_EXTENSION', message: 'presetPath must point to a .epr file.', path: presetPath });
  } else {
    try {
      await fs.access(presetPath, fsConstants.R_OK);
    } catch {
      errors.push({ code: 'PRESET_NOT_READABLE', message: 'Export preset file does not exist or is not readable.', path: presetPath });
    }
  }

  if (!isAbsolute(outputPath)) {
    errors.push({ code: 'OUTPUT_PATH_NOT_ABSOLUTE', message: 'outputPath must be absolute.', path: outputPath });
  } else {
    const outputDirectory = dirname(outputPath);
    try {
      const stat = await fs.stat(outputDirectory);
      if (!stat.isDirectory()) {
        errors.push({ code: 'OUTPUT_FOLDER_NOT_DIRECTORY', message: 'Output parent path is not a directory.', path: outputDirectory });
      }
    } catch {
      errors.push({ code: 'OUTPUT_FOLDER_NOT_FOUND', message: 'Output parent folder does not exist.', path: outputDirectory });
    }

    try {
      await fs.access(outputPath, fsConstants.F_OK);
      if (!allowOverwrite) {
        errors.push({ code: 'OUTPUT_EXISTS', message: 'Output file already exists; pass allowOverwrite:true to replace it.', path: outputPath });
      }
    } catch {
      // Missing output file is the normal export case.
    }
  }

  return errors;
}

function deprecatedExportOptionWarnings(format?: string, quality?: string, resolution?: string): Array<{ code: string; message: string; value?: string }> {
  const warnings: Array<{ code: string; message: string; value?: string }> = [];
  if (format) warnings.push({ code: 'FORMAT_IGNORED', message: 'format is deprecated for export_sequence; the .epr preset controls the container and codec.', value: format });
  if (quality) warnings.push({ code: 'QUALITY_IGNORED', message: 'quality is deprecated for export_sequence; the .epr preset controls export quality.', value: quality });
  if (resolution) warnings.push({ code: 'RESOLUTION_IGNORED', message: 'resolution is deprecated for export_sequence; the .epr preset controls output dimensions.', value: resolution });
  return warnings;
}

async function exportSequence(ctx: ToolContext, args: ExportSequenceArgs): Promise<any> {
  const {
    sequenceId,
    outputPath,
    presetName,
    sourceRange = 'entire',
    allowOverwrite = false,
    removeOnCompletion = true,
    format,
    quality,
    resolution,
  } = args;
  // app.encoder.encodeSequence() expects an absolute path to a .epr preset file.
  // Passing a string name like "H.264" silently fails: encodeSequence returns
  // no jobID and the JSX bridge reports {success:false}. Reject early with a
  // clear error rather than letting the user think a queue happened.
  const presetResolution = await resolvePresetPath(args.presetPath, presetName);
  if (!presetResolution.success) {
    return {
      success: false,
      error: presetResolution.error,
      hint: 'Create the preset in AME UI: File → Export Settings → configure → Save Preset → exports to ~/Library/Application Support/Adobe/Common/AME/<version>/Presets/. Pass that .epr path as presetPath.',
      sequenceId,
      outputPath,
      presetName,
      matches: presetResolution.matches,
      searchedDirectories: presetResolution.searchedDirectories,
      format,
      quality,
      resolution,
    };
  }
  const presetPath = presetResolution.presetPath;

  const pathErrors = await validateExportPaths(outputPath, presetPath, allowOverwrite);
  const warnings = deprecatedExportOptionWarnings(format, quality, resolution);
  if (pathErrors.length > 0) {
    return {
      success: false,
      error: pathErrors.map((pathError) => pathError.message).join(' '),
      errors: pathErrors,
      warnings,
      sequenceId,
      outputPath,
      presetPath,
      presetName,
      sourceRange,
      allowOverwrite,
      format,
      quality,
      resolution,
    };
  }

  try {
    // bridge.renderSequence returns a structured response; propagate it instead
    // of unconditionally claiming success. Pre-fix wrapper reported success even
    // when AME never received the job (false-success false positives).
    const result = await ctx.bridge.renderSequence(sequenceId, outputPath, presetPath, {
      sourceRange,
      removeOnCompletion,
    });

    if (result && result.success === false) {
      return {
        ...result,
        sequenceId,
        outputPath,
        presetPath,
        presetName,
        presetResolution: presetResolution.presetResolution,
        sourceRange,
        allowOverwrite,
        warnings: [...warnings, ...(result.warnings ?? [])],
        format,
        quality,
        resolution,
      };
    }

    return {
      success: true,
      status: result?.status ?? 'queued',
      message: 'Sequence queued in Adobe Media Encoder. Render runs asynchronously — verify by checking the output file size growth.',
      sequenceId,
      outputPath,
      presetPath,
      presetName,
      presetResolution: presetResolution.presetResolution,
      sourceRange,
      resolvedRange: result?.resolvedRange,
      encoderRangeConstant: result?.encoderRangeConstant,
      removeOnCompletion,
      format,
      quality,
      resolution,
      warnings: [...warnings, ...(result?.warnings ?? [])],
      jobID: result?.jobID,
      queued: result?.queued,
      queueStarted: result?.queueStarted,
      verify: `ffprobe -show_entries format=duration,size '${outputPath}'`,
    };
  } catch (error) {
    return {
      success: false,
      error: `Failed to export sequence: ${error instanceof Error ? error.message : String(error)}`,
      sequenceId,
      outputPath,
    };
  }
}

async function exportFrame(ctx: ToolContext, sequenceId: string, time: number, outputPath: string, format = 'png'): Promise<any> {
  const script = `
      try {
        var sequence = __findSequence(${JSON.stringify(sequenceId)});
        if (!sequence) return JSON.stringify({ success: false, error: "Sequence not found by id: " + ${JSON.stringify(sequenceId)} });

        if (sequence.openInTimeline) {
          try { sequence.openInTimeline(); } catch (e0) {}
        }

        // Resolve the QE handle for the sequence the caller named. Reaching for
        // qe.project.getActiveSequence() here exported whatever happened to be
        // open in the timeline instead: asking for a non-active sequence
        // returned success, echoed back the requested sequenceId, and wrote a
        // frame of the active sequence's content.
        var qeSequence = __qeSequenceForRetry(sequence);
        if (!qeSequence) {
          return JSON.stringify({
            success: false,
            error: "Could not address sequence '" + sequence.name + "' through the QE API, which frame export requires. Open it in a timeline and retry."
          });
        }

        var methodName = ${JSON.stringify(format)} === "jpg" ? "exportFrameJPEG" : (${JSON.stringify(format)} === "tiff" ? "exportFrameTiff" : "exportFramePNG");
        if (typeof qeSequence[methodName] !== "function") {
          return JSON.stringify({
            success: false,
            error: "Frame export format '" + ${JSON.stringify(format)} + "' is not supported by the available Premiere API"
          });
        }

        var timeNumber = ${time};
        var timeString = String(timeNumber);
        var timeTicks = timeString;
        try {
          var exportTime = new Time();
          exportTime.seconds = timeNumber;
          timeTicks = exportTime.ticks;
        } catch (e1) {}
        var fps = 30;
        try {
          fps = sequence.timebase ? (254016000000 / parseInt(sequence.timebase, 10)) : 30;
        } catch (eFps) {}
        var timeCode = __secondsToTimecode(timeNumber, fps);

        // Premiere's exportFrame* methods always append "." + format to the
        // path they are handed, so passing the caller's "shot.png" wrote
        // "shot.png.png" while the tool reported "shot.png" — a path with no
        // file at it. Hand Premiere the stem and let it add the extension back,
        // so the frame lands exactly where the caller asked.
        var formatExtension = ${JSON.stringify(format)} === "jpg"
          ? ".jpg"
          : (${JSON.stringify(format)} === "tiff" ? ".tiff" : ".png");
        var requestedPath = ${JSON.stringify(outputPath)};
        var exportStem = requestedPath;
        if (requestedPath.length > formatExtension.length) {
          var tail = requestedPath.substring(requestedPath.length - formatExtension.length);
          if (tail.toLowerCase() === formatExtension) {
            exportStem = requestedPath.substring(0, requestedPath.length - formatExtension.length);
          }
        }

        // Where the frame should land, and where it would land if some future
        // version stopped appending the extension.
        var candidatePaths = [exportStem + formatExtension, requestedPath];

        // A non-throwing call is not proof that a file was written, so record
        // what is on disk first. Comparing modification stamps rather than mere
        // existence keeps a stale file from an earlier run from being reported
        // as this call's output.
        var beforeState = [];
        for (var p = 0; p < candidatePaths.length; p++) {
          var state = { existed: false, stamp: 0, length: -1 };
          try {
            var probe = new File(candidatePaths[p]);
            if (probe.exists) {
              state.existed = true;
              state.stamp = probe.modified ? probe.modified.getTime() : 0;
              state.length = probe.length;
            }
          } catch (eProbe) {}
          beforeState.push(state);
        }

        // Returns the path that looks freshly written, or null. Freshness is judged
        // on modification time first and length second, because a filesystem with
        // one-second timestamp granularity can rewrite a file within the same second
        // and leave the stamp unchanged.
        function writtenPath(acceptUnchanged) {
          for (var w = 0; w < candidatePaths.length; w++) {
            try {
              var file = new File(candidatePaths[w]);
              if (!file.exists) continue;
              if (!beforeState[w].existed) return candidatePaths[w];
              var stamp = file.modified ? file.modified.getTime() : 0;
              if (stamp !== beforeState[w].stamp) return candidatePaths[w];
              if (file.length !== beforeState[w].length) return candidatePaths[w];
              // Neither moved. The export may still have written identical bytes over
              // an existing file, so on the final check accept it rather than report a
              // failure for a write that did happen -- a false failure invites a retry.
              if (acceptUnchanged) return candidatePaths[w];
            } catch (eCheck) {}
          }
          return null;
        }

        var exportError = null;
        function tryExport(arg1, arg2) {
          try {
            qeSequence[methodName](arg1, arg2);
          } catch (e2) {
            exportError = e2.toString();
            return false;
          }
          // Some argument orders are accepted without throwing and without
          // producing anything, so keep probing the remaining orders rather
          // than reporting a success that left no file behind.
          return writtenPath(false) !== null;
        }

        var exported =
          tryExport(timeCode, exportStem) ||
          tryExport(exportStem, timeCode) ||
          tryExport(timeNumber, exportStem) ||
          tryExport(exportStem, timeNumber) ||
          tryExport(timeString, exportStem) ||
          tryExport(exportStem, timeString) ||
          tryExport(timeTicks, exportStem) ||
          tryExport(exportStem, timeTicks);

        var actualPath = writtenPath(true);
        if (!exported || !actualPath) {
          return JSON.stringify({
            success: false,
            error: exportError || "Frame export reported no error but wrote no file"
          });
        }

        return JSON.stringify({
          success: true,
          message: "Frame exported successfully",
          sequenceId: ${JSON.stringify(sequenceId)},
          sequenceName: sequence.name,
          time: ${time},
          outputPath: actualPath,
          requestedPath: requestedPath,
          format: ${JSON.stringify(format)}
        });
      } catch (e) {
        return JSON.stringify({ success: false, error: e.toString() });
      }
    `;

  return await ctx.bridge.executeScript(script);
}

async function addToRenderQueue(ctx: ToolContext, args: AddToRenderQueueArgs): Promise<any> {
  return await exportSequence(ctx, args);
}

async function getRenderQueueStatus(): Promise<any> {
  return {
    success: true,
    available: false,
    queueStatusAvailable: false,
    note: "Render queue monitoring requires Adobe Media Encoder integration. Check Adobe Media Encoder for live render status."
  };
}

async function exportAsFcpXml(ctx: ToolContext, sequenceId: string, outputPath: string): Promise<any> {
  const script = `
      try {
        var seq = __findSequence(${JSON.stringify(sequenceId)});
        if (!seq) return JSON.stringify({ success: false, error: "Sequence not found" });
        seq.exportAsFinalCutProXML(${JSON.stringify(outputPath)});
        return JSON.stringify({
          success: true,
          message: "Exported as Final Cut Pro XML",
          sequenceId: ${JSON.stringify(sequenceId)},
          outputPath: ${JSON.stringify(outputPath)}
        });
      } catch (e) {
        return JSON.stringify({ success: false, error: e.toString() });
      }
    `;
  return await ctx.bridge.executeScript(script);
}

async function exportAaf(ctx: ToolContext, sequenceId: string, outputPath: string, mixDownVideo?: boolean, explodeToMono?: boolean, sampleRate?: number, bitsPerSample?: number): Promise<any> {
  const mixDown = mixDownVideo !== false ? 1 : 0;
  const explode = explodeToMono ? 1 : 0;
  const rate = sampleRate || 48000;
  const bits = bitsPerSample || 16;
  const script = `
      try {
        var seq = __findSequence(${JSON.stringify(sequenceId)});
        if (!seq) return JSON.stringify({ success: false, error: "Sequence not found" });
        app.project.exportAAF(seq, ${JSON.stringify(outputPath)}, ${mixDown}, ${explode}, ${rate}, ${bits}, 0, 0, 1, 0);
        return JSON.stringify({
          success: true,
          message: "Exported as AAF",
          sequenceId: ${JSON.stringify(sequenceId)},
          outputPath: ${JSON.stringify(outputPath)}
        });
      } catch (e) {
        return JSON.stringify({ success: false, error: e.toString() });
      }
    `;
  return await ctx.bridge.executeScript(script);
}
