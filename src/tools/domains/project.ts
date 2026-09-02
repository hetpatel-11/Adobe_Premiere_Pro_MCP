/**
 * Project lifecycle, bins, project items, metadata, and undo.
 *
 * Each entry declares the tool an agent sees and the handler that runs it,
 * so the two cannot drift apart. Handlers reach Premiere through ToolContext.
 */
import { z } from 'zod';
import type { ToolContext, ToolModule } from '../context.js';

export const projectTools: ToolModule[] = [
  {
    name: 'create_project',
    description: 'Creates a new Adobe Premiere Pro project. Use this when the user wants to start a new video editing project from scratch.',
    inputSchema: z.object({
      name: z.string().describe('The name for the new project, e.g., "My Summer Vacation"'),
      location: z.string().describe('The absolute directory path where the project file should be saved, e.g., "/Users/user/Documents/Videos"')
    }),
    run: (ctx, args) => createProject(ctx, args.name, args.location),
  },
  {
    name: 'open_project',
    description: 'Opens an existing Adobe Premiere Pro project from a specified file path.',
    inputSchema: z.object({
      path: z.string().describe('The absolute path to the .prproj file to open')
    }),
    run: (ctx, args) => openProject(ctx, args.path),
  },
  {
    name: 'save_project',
    description: 'Saves the currently active Adobe Premiere Pro project.',
    inputSchema: z.object({}),
    run: (ctx) => saveProject(ctx),
  },
  {
    name: 'save_project_as',
    description: 'Saves the current project with a new name and location.',
    inputSchema: z.object({
      name: z.string().describe('The new name for the project'),
      location: z.string().describe('The absolute directory path where the project should be saved')
    }),
    run: (ctx, args) => saveProjectAs(ctx, args.name, args.location),
  },
  {
    name: 'create_bin',
    description: 'Creates a new bin (folder) in the project panel to organize media.',
    inputSchema: z.object({
      name: z.string().describe('The name for the new bin'),
      parentBinName: z.string().optional().describe('The name of the parent bin to create this bin inside')
    }),
    run: (ctx, args) => createBin(ctx, args.name, args.parentBinName),
  },
  {
    name: 'move_item_to_bin',
    description: 'Moves a project item into a different bin (folder).',
    inputSchema: z.object({
      projectItemId: z.string().describe('The ID of the project item to move'),
      targetBinId: z.string().describe('The ID of the destination bin')
    }),
    run: (ctx, args) => moveItemToBin(ctx, args.projectItemId, args.targetBinId),
  },
  {
    name: 'rename_project_item',
    description: 'Renames a project item (sequence, bin, clip) by setting its name. Use this when duplicate_sequence does not propagate the new name to the project panel.',
    inputSchema: z.object({
      projectItemId: z.string().describe('The ID of the project item to rename'),
      newName: z.string().describe('The new name for the project item')
    }),
    run: (ctx, args) => renameProjectItem(ctx, args.projectItemId, args.newName),
  },
  {
    name: 'create_subclip',
    description: 'Creates a subclip from a project item with specified in/out points.',
    inputSchema: z.object({
      projectItemId: z.string().describe('The ID of the source project item'),
      name: z.string().describe('Name for the subclip'),
      startTime: z.number().describe('In point in seconds'),
      endTime: z.number().describe('Out point in seconds'),
      hasHardBoundaries: z.boolean().optional().describe('Whether boundaries are hard (cannot be extended)'),
      takeAudio: z.boolean().optional().describe('Whether to include audio (default: true)'),
      takeVideo: z.boolean().optional().describe('Whether to include video (default: true)')
    }),
    run: (ctx, args) => createSubclip(ctx, args.projectItemId, args.name, args.startTime, args.endTime, args.hasHardBoundaries, args.takeAudio, args.takeVideo),
  },
  {
    name: 'relink_media',
    description: 'Relinks an offline or moved media file to a new file path.',
    inputSchema: z.object({
      projectItemId: z.string().describe('The ID of the project item to relink'),
      newFilePath: z.string().describe('The new absolute file path to relink to')
    }),
    run: (ctx, args) => relinkMedia(ctx, args.projectItemId, args.newFilePath),
  },
  {
    name: 'set_color_label',
    description: 'Sets the color label on a project item.',
    inputSchema: z.object({
      projectItemId: z.string().describe('The ID of the project item'),
      colorIndex: z.number().describe('Color label index 0-15 (0=Violet, 1=Iris, 2=Caribbean, 3=Lavender, 4=Cerulean, 5=Forest, 6=Rose, 7=Mango, 8=Purple, 9=Blue, 10=Teal, 11=Magenta, 12=Tan, 13=Green, 14=Brown, 15=Yellow)')
    }),
    run: (ctx, args) => setColorLabel(ctx, args.projectItemId, args.colorIndex),
  },
  {
    name: 'get_color_label',
    description: 'Gets the color label index of a project item.',
    inputSchema: z.object({
      projectItemId: z.string().describe('The ID of the project item')
    }),
    run: (ctx, args) => getColorLabel(ctx, args.projectItemId),
  },
  {
    name: 'get_metadata',
    description: 'Gets project metadata and XMP metadata for a project item.',
    inputSchema: z.object({
      projectItemId: z.string().describe('The ID of the project item')
    }),
    run: (ctx, args) => getMetadata(ctx, args.projectItemId),
  },
  {
    name: 'set_metadata',
    description: 'Sets a project metadata value on a project item.',
    inputSchema: z.object({
      projectItemId: z.string().describe('The ID of the project item'),
      key: z.string().describe('The metadata key/field name'),
      value: z.union([z.string(), z.number(), z.boolean()]).transform(String).describe('The metadata value to set')
    }),
    run: (ctx, args) => setMetadata(ctx, args.projectItemId, args.key, args.value),
  },
  {
    name: 'get_footage_interpretation',
    description: 'Gets the footage interpretation settings (frame rate, pixel aspect ratio, field type, etc.) for a project item.',
    inputSchema: z.object({
      projectItemId: z.string().describe('The ID of the project item')
    }),
    run: (ctx, args) => getFootageInterpretation(ctx, args.projectItemId),
  },
  {
    name: 'set_footage_interpretation',
    description: 'Sets footage interpretation settings (frame rate, pixel aspect ratio) for a project item.',
    inputSchema: z.object({
      projectItemId: z.string().describe('The ID of the project item'),
      frameRate: z.number().optional().describe('Override frame rate'),
      pixelAspectRatio: z.number().optional().describe('Override pixel aspect ratio')
    }),
    run: (ctx, args) => setFootageInterpretation(ctx, args.projectItemId, args.frameRate, args.pixelAspectRatio),
  },
  {
    name: 'consolidate_duplicates',
    description: 'Consolidates duplicate media items in the project.',
    inputSchema: z.object({}),
    run: (ctx) => consolidateDuplicates(ctx),
  },
  {
    name: 'refresh_media',
    description: 'Refreshes the media for a project item, reloading it from disk.',
    inputSchema: z.object({
      projectItemId: z.string().describe('The ID of the project item to refresh')
    }),
    run: (ctx, args) => refreshMedia(ctx, args.projectItemId),
  },
  {
    name: 'manage_proxies',
    description: 'Checks proxy status, attaches a proxy file, or gets the proxy path for a project item.',
    inputSchema: z.object({
      projectItemId: z.string().describe('The ID of the project item'),
      action: z.enum(['check', 'attach', 'get_path']).describe('The proxy action: check status, attach a proxy, or get proxy path'),
      proxyPath: z.string().optional().describe('The absolute path to the proxy file (required for attach action)')
    }),
    run: (ctx, args) => manageProxies(ctx, args.projectItemId, args.action, args.proxyPath),
  },
  {
    name: 'undo',
    description: 'Performs an undo operation in Premiere Pro.',
    inputSchema: z.object({}),
    run: (ctx) => undo(ctx),
  },
];

async function createProject(ctx: ToolContext, name: string, location: string): Promise<any> {
  try {
    const result: any = await ctx.bridge.createProject(name, location);
    const projectPath = `${location.replace(/[\\/]+$/, '')}/${name.endsWith('.prproj') ? name : `${name}.prproj`}`;
    if (result?.success === false) {
      return {
        ...result,
        projectPath: result.projectPath || projectPath
      };
    }

    return {
      success: true,
      message: `Project "${name}" created successfully`,
      projectPath,
      ...result
    };
  } catch (error) {
    return {
      success: false,
      error: `Failed to create project: ${error instanceof Error ? error.message : String(error)}`
    };
  }
}

async function openProject(ctx: ToolContext, path: string): Promise<any> {
  try {
    const result: any = await ctx.bridge.openProject(path);
    if (result?.success === false) {
      return {
        ...result,
        projectPath: result.projectPath || path
      };
    }

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

async function saveProject(ctx: ToolContext): Promise<any> {
  try {
    await ctx.bridge.saveProject();
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

async function saveProjectAs(ctx: ToolContext, name: string, location: string): Promise<any> {
  const script = `
      try {
        var project = app.project;
        var newPath = ${JSON.stringify(location)} + "/" + ${JSON.stringify(name)} + ".prproj";
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
  
  return await ctx.bridge.executeScript(script);
}

async function createBin(ctx: ToolContext, name: string, parentBinName?: string): Promise<any> {
  const script = `
      try {
        var parentBin = app.project.rootItem;
        ${parentBinName ? `
        // Naming a parent that does not resolve used to fall through to the project
        // root, so the bin landed somewhere the caller never asked for while the
        // response echoed the parent name back as though it had been used.
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
        parentBin = __binByName(app.project.rootItem, ${JSON.stringify(parentBinName)});
        if (!parentBin) {
          return JSON.stringify({
            success: false,
            error: "Parent bin not found: " + ${JSON.stringify(parentBinName)} + ". Nothing was created. Omit parentBinName to create at the project root.",
            parentBinName: ${JSON.stringify(parentBinName)}
          });
        }` : ''}

        var newBin = parentBin.createBin(${JSON.stringify(name)});

        return JSON.stringify({
          success: true,
          binName: ${JSON.stringify(name)},
          binId: newBin.nodeId,
          parentBin: ${parentBinName ? `${JSON.stringify(parentBinName)}` : '"Root"'}
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

async function renameProjectItem(ctx: ToolContext, projectItemId: string, newName: string): Promise<any> {
  const safeName = JSON.stringify(newName);
  const script = `
      try {
        var item = __findProjectItem(${JSON.stringify(projectItemId)});
        if (!item) return JSON.stringify({ success: false, error: "Project item not found" });
        var oldName = item.name;
        item.name = ${safeName};
        return JSON.stringify({
          success: true,
          projectItemId: ${JSON.stringify(projectItemId)},
          oldName: oldName,
          newName: ${safeName}
        });
      } catch (e) {
        return JSON.stringify({ success: false, error: e.toString() });
      }
    `;
  return await ctx.bridge.executeScript(script);
}

async function moveItemToBin(ctx: ToolContext, projectItemId: string, targetBinId: string): Promise<any> {
  const script = `
      try {
        var item = __findProjectItem(${JSON.stringify(projectItemId)});
        if (!item) return JSON.stringify({ success: false, error: "Project item not found" });
        var bin = __findProjectItem(${JSON.stringify(targetBinId)});
        if (!bin) return JSON.stringify({ success: false, error: "Target bin not found" });
        item.moveBin(bin);
        return JSON.stringify({
          success: true,
          message: "Item moved to bin",
          itemId: ${JSON.stringify(projectItemId)},
          targetBinId: ${JSON.stringify(targetBinId)}
        });
      } catch (e) {
        return JSON.stringify({ success: false, error: e.toString() });
      }
    `;
  return await ctx.bridge.executeScript(script);
}

async function createSubclip(ctx: ToolContext, projectItemId: string, name: string, startTime: number, endTime: number, hasHardBoundaries?: boolean, takeAudio?: boolean, takeVideo?: boolean): Promise<any> {
  const hardBounds = hasHardBoundaries ? 1 : 0;
  const audio = takeAudio !== false ? 1 : 0;
  const video = takeVideo !== false ? 1 : 0;
  const script = `
      try {
        var item = __findProjectItem(${JSON.stringify(projectItemId)});
        if (!item) return JSON.stringify({ success: false, error: "Project item not found" });
        var startTicks = __secondsToTicks(${startTime});
        var endTicks = __secondsToTicks(${endTime});
        item.createSubClip(${JSON.stringify(name)}, startTicks, endTicks, ${hardBounds}, ${audio}, ${video});
        return JSON.stringify({
          success: true,
          message: "Subclip created",
          name: ${JSON.stringify(name)},
          startTime: ${startTime},
          endTime: ${endTime}
        });
      } catch (e) {
        return JSON.stringify({ success: false, error: e.toString() });
      }
    `;
  return await ctx.bridge.executeScript(script);
}

async function relinkMedia(ctx: ToolContext, projectItemId: string, newFilePath: string): Promise<any> {
  const script = `
      try {
        var item = __findProjectItem(${JSON.stringify(projectItemId)});
        if (!item) return JSON.stringify({ success: false, error: "Project item not found" });
        if (item.canChangeMediaPath()) {
          item.changeMediaPath(${JSON.stringify(newFilePath)}, true);
          return JSON.stringify({
            success: true,
            message: "Media relinked successfully",
            projectItemId: ${JSON.stringify(projectItemId)},
            newFilePath: ${JSON.stringify(newFilePath)}
          });
        } else {
          return JSON.stringify({ success: false, error: "Cannot change media path for this item" });
        }
      } catch (e) {
        return JSON.stringify({ success: false, error: e.toString() });
      }
    `;
  return await ctx.bridge.executeScript(script);
}

async function setColorLabel(ctx: ToolContext, projectItemId: string, colorIndex: number): Promise<any> {
  const script = `
      try {
        var item = __findProjectItem(${JSON.stringify(projectItemId)});
        if (!item) return JSON.stringify({ success: false, error: "Project item not found" });
        item.setColorLabel(${colorIndex});
        return JSON.stringify({
          success: true,
          message: "Color label set",
          projectItemId: ${JSON.stringify(projectItemId)},
          colorIndex: ${colorIndex}
        });
      } catch (e) {
        return JSON.stringify({ success: false, error: e.toString() });
      }
    `;
  return await ctx.bridge.executeScript(script);
}

async function getColorLabel(ctx: ToolContext, projectItemId: string): Promise<any> {
  const script = `
      try {
        var item = __findProjectItem(${JSON.stringify(projectItemId)});
        if (!item) return JSON.stringify({ success: false, error: "Project item not found" });
        var colorLabel = item.getColorLabel();
        return JSON.stringify({
          success: true,
          projectItemId: ${JSON.stringify(projectItemId)},
          colorLabel: colorLabel
        });
      } catch (e) {
        return JSON.stringify({ success: false, error: e.toString() });
      }
    `;
  return await ctx.bridge.executeScript(script);
}

async function getMetadata(ctx: ToolContext, projectItemId: string): Promise<any> {
  const script = `
      try {
        var item = __findProjectItem(${JSON.stringify(projectItemId)});
        if (!item) return JSON.stringify({ success: false, error: "Project item not found" });
        var projectMetadata = item.getProjectMetadata();
        var xmpMetadata = item.getXMPMetadata();
        return JSON.stringify({
          success: true,
          projectItemId: ${JSON.stringify(projectItemId)},
          projectMetadata: projectMetadata,
          xmpMetadata: xmpMetadata
        });
      } catch (e) {
        return JSON.stringify({ success: false, error: e.toString() });
      }
    `;
  return await ctx.bridge.executeScript(script);
}

async function setMetadata(ctx: ToolContext, projectItemId: string, key: string, value: string): Promise<any> {
  const script = `
      try {
        var item = __findProjectItem(${JSON.stringify(projectItemId)});
        if (!item) return JSON.stringify({ success: false, error: "Project item not found" });
        var schema = "http://ns.adobe.com/premierePrivateProjectMetaData/1.0/";
        var fullKey = schema + ${JSON.stringify(key)};
        item.setProjectMetadata(${JSON.stringify(value)}, [fullKey]);
        return JSON.stringify({
          success: true,
          message: "Metadata set",
          projectItemId: ${JSON.stringify(projectItemId)},
          key: ${JSON.stringify(key)},
          value: ${JSON.stringify(value)}
        });
      } catch (e) {
        return JSON.stringify({ success: false, error: e.toString() });
      }
    `;
  return await ctx.bridge.executeScript(script);
}

async function getFootageInterpretation(ctx: ToolContext, projectItemId: string): Promise<any> {
  const script = `
      try {
        var item = __findProjectItem(${JSON.stringify(projectItemId)});
        if (!item) return JSON.stringify({ success: false, error: "Project item not found" });
        var interp = item.getFootageInterpretation();
        return JSON.stringify({
          success: true,
          projectItemId: ${JSON.stringify(projectItemId)},
          frameRate: interp.frameRate,
          pixelAspectRatio: interp.pixelAspectRatio,
          fieldType: interp.fieldType,
          removePulldown: interp.removePulldown,
          alphaUsage: interp.alphaUsage
        });
      } catch (e) {
        return JSON.stringify({ success: false, error: e.toString() });
      }
    `;
  return await ctx.bridge.executeScript(script);
}

async function setFootageInterpretation(ctx: ToolContext, projectItemId: string, frameRate?: number, pixelAspectRatio?: number): Promise<any> {
  const setFrameRate = frameRate !== undefined;
  const setPar = pixelAspectRatio !== undefined;
  const script = `
      try {
        var item = __findProjectItem(${JSON.stringify(projectItemId)});
        if (!item) return JSON.stringify({ success: false, error: "Project item not found" });
        var interp = item.getFootageInterpretation();
        ${setFrameRate ? 'interp.frameRate = ' + frameRate + ';' : ''}
        ${setPar ? 'interp.pixelAspectRatio = ' + pixelAspectRatio + ';' : ''}
        item.setFootageInterpretation(interp);
        return JSON.stringify({
          success: true,
          message: "Footage interpretation updated",
          projectItemId: ${JSON.stringify(projectItemId)},
          frameRate: interp.frameRate,
          pixelAspectRatio: interp.pixelAspectRatio
        });
      } catch (e) {
        return JSON.stringify({ success: false, error: e.toString() });
      }
    `;
  return await ctx.bridge.executeScript(script);
}

async function undo(ctx: ToolContext): Promise<any> {
  const script = `
      try {
        app.enableQE();
        qe.project.undo();
        return JSON.stringify({
          success: true,
          message: "Undo performed"
        });
      } catch (e) {
        return JSON.stringify({ success: false, error: e.toString() });
      }
    `;
  return await ctx.bridge.executeScript(script);
}

async function consolidateDuplicates(ctx: ToolContext): Promise<any> {
  const script = `
      try {
        app.project.consolidateDuplicates();
        return JSON.stringify({
          success: true,
          message: "Duplicates consolidated"
        });
      } catch (e) {
        return JSON.stringify({ success: false, error: e.toString() });
      }
    `;
  return await ctx.bridge.executeScript(script);
}

async function refreshMedia(ctx: ToolContext, projectItemId: string): Promise<any> {
  const script = `
      try {
        var item = __findProjectItem(${JSON.stringify(projectItemId)});
        if (!item) return JSON.stringify({ success: false, error: "Project item not found" });
        item.refreshMedia();
        return JSON.stringify({
          success: true,
          message: "Media refreshed",
          projectItemId: ${JSON.stringify(projectItemId)}
        });
      } catch (e) {
        return JSON.stringify({ success: false, error: e.toString() });
      }
    `;
  return await ctx.bridge.executeScript(script);
}

async function manageProxies(ctx: ToolContext, projectItemId: string, action: string, proxyPath?: string): Promise<any> {
  const script = `
      try {
        var item = __findProjectItem(${JSON.stringify(projectItemId)});
        if (!item) return JSON.stringify({ success: false, error: "Project item not found" });
        var actionType = ${JSON.stringify(action)};
        if (actionType === "check") {
          return JSON.stringify({
            success: true,
            projectItemId: ${JSON.stringify(projectItemId)},
            hasProxy: item.hasProxy(),
            canProxy: item.canProxy()
          });
        } else if (actionType === "attach") {
          var pPath = ${JSON.stringify(proxyPath || '')};
          if (!pPath || pPath === "") return JSON.stringify({ success: false, error: "proxyPath is required for attach action" });
          item.attachProxy(pPath, 0);
          return JSON.stringify({
            success: true,
            message: "Proxy attached",
            projectItemId: ${JSON.stringify(projectItemId)},
            proxyPath: pPath
          });
        } else if (actionType === "get_path") {
          return JSON.stringify({
            success: true,
            projectItemId: ${JSON.stringify(projectItemId)},
            proxyPath: item.getProxyPath()
          });
        } else {
          return JSON.stringify({ success: false, error: "Unknown action: " + actionType });
        }
      } catch (e) {
        return JSON.stringify({ success: false, error: e.toString() });
      }
    `;
  return await ctx.bridge.executeScript(script);
}
