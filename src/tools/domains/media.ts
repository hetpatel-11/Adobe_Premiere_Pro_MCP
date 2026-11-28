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
    description: 'Imports all media files from a folder into the current Premiere Pro project. With recursive, the folder tree is mirrored as bins (the source folder itself becomes a bin inside the destination) instead of being flattened, and existing bins of the same name are reused rather than duplicated.',
    inputSchema: z.object({
      folderPath: z.string().describe('The absolute path to the folder containing media files'),
      binName: z.string().optional().describe('The destination bin. Accepts a bin name found anywhere in the project, or a path like "master-footage/2026-08-27". The bin must already exist.'),
      recursive: z.boolean().optional().describe('Whether to import from subfolders recursively, mirroring the folder tree as bins'),
      excludeFolders: z.array(z.string()).optional().describe('Folder names to skip during a recursive import, e.g. ["_originals"] for an archive folder that would otherwise import duplicates')
    }),
    run: (ctx, args) => importFolder(ctx, args.folderPath, args.binName, args.recursive, args.excludeFolders),
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
    const result: any = await ctx.bridge.importMedia(filePath, binName);
    if (!result.success) {
      return {
        ...result,
        filePath: filePath,
        binName: binName || result.binName
      };
    }
    return {
      success: true,
      message: `Media imported successfully`,
      filePath: filePath,
      ...result,
      binName: result.binName || binName || 'Root',
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

async function importFolder(ctx: ToolContext, folderPath: string, binName?: string, recursive = false, excludeFolders: string[] = []): Promise<any> {
  const script = `
      try {
        var folder = new Folder(${JSON.stringify(folderPath)});
        if (!folder.exists) {
          return JSON.stringify({ success: false, error: "Folder not found: " + ${JSON.stringify(folderPath)} });
        }

        var excluded = ${JSON.stringify(excludeFolders)};
        var imported = [];
        var errors = [];

        function isExcluded(name) {
          for (var i = 0; i < excluded.length; i++) {
            if (String(excluded[i]).toLowerCase() === String(name).toLowerCase()) return true;
          }
          return false;
        }

        function __binByName(parent, wanted) {
          // children[name] does not resolve: Premiere's ProjectItemCollection is
          // index-only, so a string key returns undefined even when a child of that
          // name exists. Verified against 26.0.2. Walk and compare instead.
          if (!parent || !parent.children) return null;
          for (var i = 0; i < parent.children.numItems; i++) {
            var child = parent.children[i];
            if (child && String(child.name) === String(wanted) && child.type === 2) return child;
          }
          return null;
        }

        function findBinDeep(parent, wanted) {
          var direct = __binByName(parent, wanted);
          if (direct) return direct;
          if (!parent || !parent.children) return null;
          for (var i = 0; i < parent.children.numItems; i++) {
            var child = parent.children[i];
            if (child && child.type === 2) {
              var hit = findBinDeep(child, wanted);
              if (hit) return hit;
            }
          }
          return null;
        }

        function resolveBin(spec) {
          // A plain name is searched project-wide; a "parent/child" path is walked so a
          // nested destination can be addressed when several bins share a leaf name.
          var parts = String(spec).split("/");
          var node = null;
          for (var i = 0; i < parts.length; i++) {
            var part = parts[i];
            if (part === "") continue;
            node = (i === 0) ? findBinDeep(app.project.rootItem, part) : __binByName(node, part);
            if (!node) return null;
          }
          return node;
        }

        // ProjectItem exposes no importFiles method -- only app.project does, and it takes
        // the destination bin as its third argument. Passing every file of a directory in
        // one call also keeps a large folder inside the bridge timeout; a per-file loop
        // over a thousand stills does not finish.
        function importDir(dir, targetBin) {
          var entries = dir.getFiles();
          var paths = [];
          var subdirs = [];
          for (var i = 0; i < entries.length; i++) {
            var entry = entries[i];
            if (entry instanceof File) {
              paths.push(entry.fsName);
            } else if (entry instanceof Folder && ${recursive} && !isExcluded(entry.name)) {
              subdirs.push(entry);
            }
          }

          if (paths.length > 0) {
            var before = targetBin.children.numItems;
            try {
              app.project.importFiles(paths, true, targetBin, false);
            } catch (e) {
              errors.push({ folder: dir.fsName, error: e.toString() });
            }
            var after = targetBin.children.numItems;
            for (var j = before; j < after; j++) {
              var item = targetBin.children[j];
              imported.push({ name: item.name, id: item.nodeId, bin: String(targetBin.name) });
            }
            if (after - before < paths.length) {
              errors.push({
                folder: dir.fsName,
                error: "Premiere imported " + (after - before) + " of " + paths.length +
                       " files; the remainder are formats it refused."
              });
            }
          }

          for (var k = 0; k < subdirs.length; k++) {
            var sub = subdirs[k];
            var subBin = __binByName(targetBin, sub.name);
            if (!subBin) subBin = targetBin.createBin(sub.name);
            importDir(sub, subBin);
          }
        }

        var targetBin = app.project.rootItem;
        ${binName ? `
        targetBin = resolveBin(${JSON.stringify(binName)});
        if (!targetBin) {
          return JSON.stringify({
            success: false,
            error: "Destination bin not found: " + ${JSON.stringify(binName)} + ". Nothing was imported. Omit binName to import to the project root.",
            binName: ${JSON.stringify(binName)}
          });
        }` : ''}

        var rootBin = targetBin;
        if (${recursive}) {
          // Mirror the source folder itself, the way dragging a folder into the project
          // panel does, so two days of footage do not merge into one flat bin.
          rootBin = __binByName(targetBin, folder.name);
          if (!rootBin) rootBin = targetBin.createBin(folder.name);
        }

        importDir(folder, rootBin);

        return JSON.stringify({
          success: errors.length === 0,
          binName: ${binName ? JSON.stringify(binName) : 'null'},
          destinationBin: String(rootBin.name),
          totalImported: imported.length,
          totalErrors: errors.length,
          importedItems: imported,
          errors: errors
        });
      } catch (e) {
        return JSON.stringify({
          success: false,
          error: e.toString()
        });
      }
    `;

  // A thousand stills take Premiere well past the bridge's 60s default, and a timed-out
  // import reports nothing while Premiere keeps working -- the failure mode that made
  // this look like a silent no-op.
  return await ctx.bridge.executeScript(script, 900000);
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
