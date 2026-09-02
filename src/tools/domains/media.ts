/**
 * Media and interchange import.
 *
 * Each entry declares the tool an agent sees and the handler that runs it,
 * so the two cannot drift apart. Handlers reach Premiere through ToolContext.
 */
import { z } from 'zod';
import type { ToolContext, ToolModule } from '../context.js';

export const mediaTools: ToolModule[] = [
  {
    name: 'import_media',
    description: 'Imports a media file (video, audio, image) into the current Premiere Pro project.',
    inputSchema: z.object({
      filePath: z.string().describe('The absolute path to the media file to import'),
      binName: z.string().optional().describe('The name of the bin to import the media into. If not provided, it will be imported into the root.')
    }),
    run: (ctx, args) => importMedia(ctx, args.filePath, args.binName),
  },
  {
    name: 'import_fcp_xml',
    description: 'Imports a Final Cut Pro 7 XML (XMEML) file into the current project. Premiere creates a new sequence with the cuts/clips defined in the XML. The import requests Premiere UI suppression, but malformed or unsupported XML can still be rejected by Premiere. Use legacy FCP7 XML, not modern FCPXML 1.x from Final Cut Pro X.',
    inputSchema: z.object({
      filePath: z.string().describe('The absolute path to the FCP7 XML file (.xml extension typical)')
    }),
    run: (ctx, args) => importFcpXml(ctx, args.filePath),
  },
  {
    name: 'import_edl',
    description: 'Reports that CMX 3600 EDL import is unavailable through this dialog-safe MCP server. Premiere\'s EDL API opens an interactive sequence/source-media dialog that blocks CEP. Use import_fcp_xml for unattended timeline interchange instead.',
    inputSchema: z.object({
      filePath: z.string().describe('The absolute path to the .edl file')
    }),
    run: (_ctx, args) => importEdl(args.filePath),
  },
  {
    name: 'import_folder',
    description: 'Imports all media files from a folder into the current Premiere Pro project.',
    inputSchema: z.object({
      folderPath: z.string().describe('The absolute path to the folder containing media files'),
      binName: z.string().optional().describe('The name of the bin to import the media into'),
      recursive: z.boolean().optional().describe('Whether to import from subfolders recursively')
    }),
    run: (ctx, args) => importFolder(ctx, args.folderPath, args.binName, args.recursive),
  },
  {
    name: 'import_sequences_from_project',
    description: 'Imports sequences from another Premiere Pro project file.',
    inputSchema: z.object({
      projectPath: z.string().describe('The absolute path to the source .prproj file'),
      sequenceIds: z.array(z.string()).describe('Array of sequence IDs to import from the source project')
    }),
    run: (ctx, args) => importSequencesFromProject(ctx, args.projectPath, args.sequenceIds),
  },
];

export async function importMedia(ctx: ToolContext, filePath: string, binName?: string): Promise<any> {
  try {
    const result: any = await ctx.bridge.importMedia(filePath);
    if (!result.success) {
      return {
        ...result,
        filePath: filePath,
        binName: binName || 'Root'
      };
    }
    return {
      success: true,
      message: `Media imported successfully`,
      filePath: filePath,
      binName: binName || 'Root',
      ...result
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    const maybeModalTimeout = /timeout|timed out/i.test(message);
    return {
      success: false,
      error: `Failed to import media: ${message}`,
      filePath: filePath,
      ...(maybeModalTimeout ? {
        warning: 'Premiere may be showing a blocking modal dialog, such as "File format not supported". Dismiss the dialog in Premiere, then retry. For subtitle files, convert unsupported formats like .ass/.ssa to .srt before importing.'
      } : {})
    };
  }
}

async function importFcpXml(ctx: ToolContext, filePath: string): Promise<any> {
  try {
    // No hand-escaping here. JSON.stringify below already produces a correctly
    // quoted literal; escaping first and then serialising doubled every backslash,
    // so C:\\Users\\bob\\seq.xml reached the host as C:\\\\Users\\\\bob\\\\seq.xml and every
    // Windows path failed. Introduced by the interpolation sweep, which wrapped a
    // site that was already escaped.
    const script = `
        try {
          var f = new File(${JSON.stringify(filePath)});
          if (!f.exists) {
            return JSON.stringify({ success: false, error: "File not found: " + ${JSON.stringify(filePath)} });
          }
          // suppressUI=true asks Premiere not to surface import warning dialogs.
          var imported = app.project.importFiles([${JSON.stringify(filePath)}], true, app.project.rootItem, false);
          if (!imported) {
            return JSON.stringify({ success: false, imported: false, path: ${JSON.stringify(filePath)}, method: "importFiles(suppressUI=true)", error: "Premiere rejected the FCP7 XML import" });
          }
          return JSON.stringify({
            success: true,
            imported: true,
            path: ${JSON.stringify(filePath)},
            method: "importFiles(suppressUI=true)",
            warning: "Premiere may still open FCP Translation Results windows. suppressUI does not hide those reports. Click OK on each; they are not import failures."
          });
        } catch (e) {
          return JSON.stringify({ success: false, error: e.toString() });
        }
      `;
    const result: any = await ctx.bridge.executeScript(script);
    const parsed = typeof result === 'string' ? JSON.parse(result) : result;
    return {
      ...parsed,
      message: parsed.success
        ? `FCP XML imported successfully via ${parsed.method} — Premiere created new sequence atomically`
        : `Failed to import FCP XML — ${parsed.error || 'Premiere rejected the import'}`,
      filePath
    };
  } catch (error) {
    return {
      success: false,
      error: `Failed to import FCP XML: ${error instanceof Error ? error.message : String(error)}`,
      filePath
    };
  }
}

async function importEdl(filePath: string): Promise<any> {
  return {
    success: false,
    blockedBeforePremiere: true,
    filePath,
    error: 'CMX 3600 EDL import is disabled because Premiere only exposes it through an interactive dialog that blocks CEP. Convert the EDL to FCP7 XML and use import_fcp_xml for unattended import.'
  };
}

async function importFolder(ctx: ToolContext, folderPath: string, binName?: string, recursive = false): Promise<any> {
  const script = `
      try {
        var folder = new Folder(${JSON.stringify(folderPath)});
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
        ${binName ? `
        // Same silent reparent as create_bin: an unresolved destination bin sent the
        // whole import to the project root instead of failing.
        function __binByName(parent, wanted) {
          // children[name] does not resolve: Premiere's ProjectItemCollection is
          // index-only, so a string key returns undefined even when a child of that
          // name exists. Verified against 26.0.2. Walk and compare instead.
          if (!parent || !parent.children) return null;
          for (var i = 0; i < parent.children.numItems; i++) {
            var child = parent.children[i];
            if (child && String(child.name) === String(wanted)) return child;
          }
          return null;
        }
        targetBin = __binByName(app.project.rootItem, ${JSON.stringify(binName)});
        if (!targetBin) {
          return JSON.stringify({
            success: false,
            error: "Destination bin not found: " + ${JSON.stringify(binName)} + ". Nothing was imported. Omit binName to import to the project root.",
            binName: ${JSON.stringify(binName)}
          });
        }` : ''}
        
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
  
  return await ctx.bridge.executeScript(script);
}

async function importSequencesFromProject(ctx: ToolContext, projectPath: string, sequenceIds: string[]): Promise<any> {
  const script = `
      try {
        var seqIds = ${JSON.stringify(sequenceIds)};
        app.project.importSequences(${JSON.stringify(projectPath)}, seqIds);
        return JSON.stringify({
          success: true,
          message: "Sequences imported from project",
          projectPath: ${JSON.stringify(projectPath)},
          sequenceIds: seqIds
        });
      } catch (e) {
        return JSON.stringify({ success: false, error: e.toString() });
      }
    `;
  return await ctx.bridge.executeScript(script);
}
