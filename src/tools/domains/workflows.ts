/**
 * Multi-step demo and spot builders that drive many primitives in one call.
 *
 * Each entry declares the tool an agent sees and the handler that runs it,
 * so the two cannot drift apart. Handlers reach Premiere through ToolContext.
 */
import { z } from 'zod';
import { createMotionDemoAssets } from '../../utils/demoAssets.js';
import type { ToolContext, ToolModule } from '../context.js';
import { motionStyleSchema, clipPlanSchema } from '../schemas.js';
import { listSequenceTracks } from './discovery.js';
import { addKeyframe, addTransitionToClip, applyEffect, colorCorrect } from './effects.js';
import { importMogrt } from './graphics.js';
import { importMedia } from './media.js';
import { addToTimeline, trimClip } from './timeline.js';

export const workflowsTools: ToolModule[] = [
  {
    name: 'build_motion_graphics_demo',
    description: 'Generates clean demo stills, creates a sequence, lays the shots out on the timeline, adds dissolves, and applies subtle scale animation for a polished minimalist ad-style demo.',
    inputSchema: z.object({
      sequenceName: z.string().optional().describe('Optional sequence name. Defaults to "Apple Like Motion Demo".')
    }),
    run: (ctx, args) => buildMotionGraphicsDemo(ctx, args.sequenceName),
  },
  {
    name: 'assemble_product_spot',
    description: 'Builds a production-oriented promo timeline from real media assets. Supports either template defaults or an explicit clipPlan for LLM-directed pacing, transitions, motion, trims, and per-clip effects.',
    inputSchema: z.object({
      sequenceName: z.string().describe('Name for the new sequence'),
      assetPaths: z.array(z.string()).min(1).describe('Absolute paths to video or image assets in playback order'),
      clipDuration: z.number().optional().describe('Default placement duration in seconds for stills and rough spacing for assets. Defaults to 4.0'),
      videoTrackIndex: z.number().optional().describe('Target video track index. Defaults to 0'),
      transitionName: z.string().optional().describe('Default transition when clipPlan does not override it. Defaults to "Cross Dissolve" in template mode.'),
      transitionDuration: z.number().optional().describe('Transition duration in seconds. Defaults to 0.5'),
      motionStyle: motionStyleSchema.optional().describe('Fallback motion style when clipPlan does not override it. Defaults to "alternate" in template mode.'),
      clipPlan: z.array(clipPlanSchema).optional().describe('Optional explicit edit plan. When provided, each step can override timing, track, transition, motion, trim, effects, and color.')
    }),
    run: (ctx, args) => assembleProductSpot(ctx, args as AssembleProductSpotArgs),
  },
  {
    name: 'build_brand_spot_from_mogrt_and_assets',
    description: 'Builds a branded ad assembly from real media assets, supports optional MOGRT overlay, and allows explicit clipPlan control. Default polish is optional so creative direction can come from LLM planning instead of hardcoded passes.',
    inputSchema: z.object({
      sequenceName: z.string().describe('Name for the new sequence'),
      assetPaths: z.array(z.string()).min(1).describe('Absolute paths to source assets in edit order'),
      mogrtPath: z.string().optional().describe('Optional absolute path to a .mogrt title or branding template'),
      clipDuration: z.number().optional().describe('Default spacing in seconds for asset placement. Defaults to 4.0'),
      videoTrackIndex: z.number().optional().describe('Base video track for the main assets. Defaults to 0'),
      titleTrackIndex: z.number().optional().describe('Video track for the optional MOGRT overlay. Defaults to 1'),
      titleStartTime: z.number().optional().describe('Timeline start time in seconds for the optional MOGRT. Defaults to 0.4'),
      transitionName: z.string().optional().describe('Default transition when clipPlan does not override it. Defaults to "Cross Dissolve" in template mode.'),
      transitionDuration: z.number().optional().describe('Transition duration in seconds. Defaults to 0.5'),
      motionStyle: motionStyleSchema.optional().describe('Fallback motion style when clipPlan does not override it. Defaults to "alternate" in template mode.'),
      clipPlan: z.array(clipPlanSchema).optional().describe('Optional explicit edit plan. Reuses assemble_product_spot clipPlan semantics.'),
      applyDefaultPolish: z.boolean().optional().describe('Whether to apply the legacy light polish pass (blur + small color tweak). Defaults to false.')
    }),
    run: (ctx, args) => buildBrandSpotFromMogrtAndAssets(ctx, args as BuildBrandSpotArgs),
  },
];

type MotionStyle = 'push_in' | 'pull_out' | 'alternate' | 'none';

type InsertMode = 'overwrite' | 'insert';

interface ClipPlanTransition {
  name?: string;
  duration?: number;
}

interface ClipPlanMotion {
  style?: MotionStyle;
  from?: number;
  to?: number;
  startTime?: number;
  endTime?: number;
  componentName?: string;
  paramName?: string;
}

interface ClipPlanTrim {
  inPoint?: number;
  outPoint?: number;
  duration?: number;
}

interface ClipPlanColor {
  brightness?: number;
  contrast?: number;
  saturation?: number;
  hue?: number;
  temperature?: number;
  tint?: number;
  highlights?: number;
  shadows?: number;
}

interface ClipPlanStep {
  assetIndex?: number;
  time?: number;
  trackIndex?: number;
  insertMode?: InsertMode;
  transitionAfter?: ClipPlanTransition;
  motion?: ClipPlanMotion;
  trim?: ClipPlanTrim;
  effects?: string[];
  color?: ClipPlanColor;
}

interface AssembleProductSpotArgs {
  sequenceName: string;
  assetPaths: string[];
  clipDuration?: number;
  videoTrackIndex?: number;
  transitionName?: string;
  transitionDuration?: number;
  motionStyle?: MotionStyle;
  clipPlan?: ClipPlanStep[];
}

interface BuildBrandSpotArgs extends AssembleProductSpotArgs {
  mogrtPath?: string;
  titleTrackIndex?: number;
  titleStartTime?: number;
  applyDefaultPolish?: boolean;
}

async function buildMotionGraphicsDemo(ctx: ToolContext, sequenceName = 'Apple Like Motion Demo'): Promise<any> {
  const assetBase = process.env.PREMIERE_TEMP_DIR || '/tmp';
  const assetDir = `${assetBase.replace(/\/$/, '')}/motion-demo-${Date.now()}`;
  const assets = await createMotionDemoAssets(assetDir);

  const imported = [];
  for (const asset of assets) {
    const result = await importMedia(ctx, asset.path);
    imported.push(result);
    if (!result.success || !result.id) {
      return {
        success: false,
        error: result.error || `Failed to import asset ${asset.name}`,
        assetDir,
        assets,
        imported
      };
    }
  }

  const createdSequence = await createSequenceFromProjectItems(ctx, 
    sequenceName,
    imported.map((item: any) => item.id)
  );
  if (!createdSequence.success || !createdSequence.id) {
    return {
      success: false,
      error: createdSequence.error || 'Failed to create demo sequence from imported assets',
      assetDir,
      assets,
      imported
    };
  }

  const placements = [];
  for (let index = 0; index < imported.length; index++) {
    const placement = await addToTimeline(ctx, createdSequence.id, imported[index].id, 0, index * 5);
    placements.push(placement);
    if (!placement.success) {
      return {
        success: false,
        error: placement.error || `Failed to place ${imported[index].name} on the timeline`,
        assetDir,
        assets,
        createdSequence,
        imported,
        placements
      };
    }
  }

  const clips = placements.map((placement: any) => placement.id).filter(Boolean);
  const transitions = [];
  if (clips[0]) {
    transitions.push(await addTransitionToClip(ctx, clips[0], 'Cross Dissolve', 'end', 0.75));
  }
  if (clips[1]) {
    transitions.push(await addTransitionToClip(ctx, clips[1], 'Cross Dissolve', 'end', 0.75));
  }

  const animations = [];
  const scaleFrames = [
    { start: 0, end: 4.8, from: 100, to: 108 },
    { start: 5.005, end: 9.8, from: 112, to: 100 },
    { start: 10.01, end: 14.7, from: 100, to: 106 },
  ];
  for (let index = 0; index < clips.length && index < scaleFrames.length; index++) {
    const frame = scaleFrames[index];
    if (!frame) {
      continue;
    }
    animations.push(await addKeyframe(ctx, clips[index], 'Motion', 'Scale', frame.start, frame.from));
    animations.push(await addKeyframe(ctx, clips[index], 'Motion', 'Scale', frame.end, frame.to));
  }

  const tracks = await listSequenceTracks(ctx, createdSequence.id);

  return {
    success: true,
    message: 'Motion graphics demo sequence created',
    assetDir,
    assets,
    sequence: createdSequence,
    imported,
    placements,
    transitions,
    animations,
    tracks
  };
}

function getMotionRange(style: MotionStyle, index: number): { from: number; to: number } {
  if (style === 'push_in') {
    return { from: 100, to: 108 };
  }
  if (style === 'pull_out') {
    return { from: 108, to: 100 };
  }
  if (style === 'alternate') {
    const invert = index % 2 === 1;
    return invert ? { from: 110, to: 100 } : { from: 100, to: 108 };
  }
  return { from: 100, to: 100 };
}

function hasColorAdjustments(color?: ClipPlanColor): boolean {
  if (!color) {
    return false;
  }
  return Object.values(color).some((value) => value !== undefined);
}

async function assembleProductSpot(ctx: ToolContext, args: AssembleProductSpotArgs): Promise<any> {
  const clipDuration = args.clipDuration ?? 4;
  const videoTrackIndex = args.videoTrackIndex ?? 0;
  const hasDirectedPlan = Array.isArray(args.clipPlan) && args.clipPlan.length > 0;
  const transitionName = args.transitionName ?? (hasDirectedPlan ? undefined : 'Cross Dissolve');
  const transitionDuration = args.transitionDuration ?? 0.5;
  const motionStyle: MotionStyle = args.motionStyle ?? (hasDirectedPlan ? 'none' : 'alternate');

  const imported = [];
  for (const assetPath of args.assetPaths) {
    const result = await importMedia(ctx, assetPath);
    imported.push(result);
    if (!result.success || !result.id) {
      return {
        success: false,
        error: result.error || `Failed to import ${assetPath}`,
        imported
      };
    }
  }

  const createdSequence = await createSequenceFromProjectItems(ctx, 
    args.sequenceName,
    imported.map((item: any) => item.id)
  );
  if (!createdSequence.success || !createdSequence.id) {
    return {
      success: false,
      error: createdSequence.error || 'Failed to create sequence from imported assets',
      sequenceName: args.sequenceName,
      imported
    };
  }

  const planSteps: ClipPlanStep[] = hasDirectedPlan
    ? args.clipPlan ?? []
    : imported.map((_, index) => ({
      assetIndex: index,
      time: index * clipDuration,
      trackIndex: videoTrackIndex,
      insertMode: 'overwrite' as const
    }));

  const placements = [];
  const trims = [];
  const clipEffects = [];
  const colorAdjustments = [];

  for (let index = 0; index < planSteps.length; index++) {
    const step: ClipPlanStep = planSteps[index] ?? {};
    const assetIndex = step.assetIndex ?? index;
    const importedAsset = imported[assetIndex];

    if (!importedAsset?.id) {
      return {
        success: false,
        error: `Clip plan references asset index ${assetIndex}, but only ${imported.length} asset(s) were imported.`,
        sequence: createdSequence,
        imported,
        planSteps
      };
    }

    const placementTime = step.time ?? (index * clipDuration);
    const track = step.trackIndex ?? videoTrackIndex;
    const insertMode = step.insertMode ?? 'overwrite';
    const placement = await addToTimeline(ctx, 
      createdSequence.id,
      importedAsset.id,
      track,
      placementTime,
      insertMode,
    );

    placements.push(placement);
    if (!placement.success || !placement.id) {
      return {
        success: false,
        error: placement.error || `Failed to place ${importedAsset.name ?? importedAsset.id} on the timeline`,
        sequence: createdSequence,
        imported,
        placements,
        planSteps
      };
    }

    const trimConfig = step.trim;
    if (trimConfig && (trimConfig.inPoint !== undefined || trimConfig.outPoint !== undefined || trimConfig.duration !== undefined)) {
      trims.push(await trimClip(ctx, placement.id, trimConfig.inPoint, trimConfig.outPoint, trimConfig.duration));
    }

    const effects = step.effects ?? [];
    for (const effectName of effects) {
      clipEffects.push(await applyEffect(ctx, placement.id, effectName));
    }

    if (hasColorAdjustments(step.color)) {
      colorAdjustments.push(await colorCorrect(ctx, placement.id, {
        clipId: placement.id,
        ...step.color
      }));
    }
  }

  const transitions = [];
  for (let index = 0; index < placements.length - 1; index++) {
    const step: ClipPlanStep = planSteps[index] ?? {};
    const transitionAfter = step.transitionAfter;
    let transitionToApply: string | undefined;
    let durationToApply = transitionDuration;

    if (transitionAfter) {
      const explicitName = transitionAfter.name ?? transitionName;
      if (explicitName && explicitName.toLowerCase() !== 'none') {
        transitionToApply = explicitName;
        durationToApply = transitionAfter.duration ?? transitionDuration;
      }
    } else if (transitionName) {
      transitionToApply = transitionName;
    }

    if (transitionToApply) {
      transitions.push(await addTransitionToClip(ctx, 
        placements[index].id,
        transitionToApply,
        'end',
        durationToApply,
      ));
    }
  }

  const animations = [];
  for (let index = 0; index < placements.length; index++) {
    const placement = placements[index];
    const step: ClipPlanStep = planSteps[index] ?? {};
    const motion = step.motion;
    const style: MotionStyle = motion?.style ?? motionStyle;
    const hasExplicitRange = motion?.from !== undefined || motion?.to !== undefined;

    if (style === 'none' && !hasExplicitRange) {
      continue;
    }

    const range = getMotionRange(style, index);
    const from = motion?.from ?? range.from;
    const to = motion?.to ?? range.to;
    const start = motion?.startTime ?? placement.inPoint ?? (step.time ?? (index * clipDuration));
    const candidateEnd = motion?.endTime ?? ((placement.outPoint ?? (start + clipDuration)) - 0.1);
    const end = Math.max(start + 0.1, candidateEnd);
    const componentName = motion?.componentName ?? 'Motion';
    const paramName = motion?.paramName ?? 'Scale';

    animations.push(await addKeyframe(ctx, placement.id, componentName, paramName, start, from));
    animations.push(await addKeyframe(ctx, placement.id, componentName, paramName, end, to));
  }

  const tracks = await listSequenceTracks(ctx, createdSequence.id);

  return {
    success: true,
    message: hasDirectedPlan ? 'Product spot assembled from directed clip plan' : 'Product spot assembled successfully',
    sequence: createdSequence,
    imported,
    planSteps,
    placements,
    trims,
    transitions,
    animations,
    clipEffects,
    colorAdjustments,
    tracks
  };
}

async function buildBrandSpotFromMogrtAndAssets(ctx: ToolContext, args: BuildBrandSpotArgs): Promise<any> {
  const assemblyArgs: AssembleProductSpotArgs = {
    sequenceName: args.sequenceName,
    assetPaths: args.assetPaths,
  };
  if (args.clipDuration !== undefined) {
    assemblyArgs.clipDuration = args.clipDuration;
  }
  if (args.videoTrackIndex !== undefined) {
    assemblyArgs.videoTrackIndex = args.videoTrackIndex;
  }
  if (args.transitionName !== undefined) {
    assemblyArgs.transitionName = args.transitionName;
  }
  if (args.transitionDuration !== undefined) {
    assemblyArgs.transitionDuration = args.transitionDuration;
  }
  if (args.motionStyle !== undefined) {
    assemblyArgs.motionStyle = args.motionStyle;
  }
  if (args.clipPlan !== undefined) {
    assemblyArgs.clipPlan = args.clipPlan;
  }

  const assembly = await assembleProductSpot(ctx, assemblyArgs);

  if (!assembly.success || !assembly.sequence?.id) {
    return assembly;
  }

  const overlays = [];
  if (args.mogrtPath) {
    overlays.push(await importMogrt(ctx, 
      assembly.sequence.id,
      args.mogrtPath,
      args.titleStartTime ?? 0.4,
      args.titleTrackIndex ?? 1,
      0,
    ));
  } else {
    overlays.push({
      success: true,
      skipped: true,
      note: 'No MOGRT supplied; brand title overlay was skipped'
    });
  }

  const polish = [];
  if (args.applyDefaultPolish) {
    const placedClips = Array.isArray(assembly.placements) ? assembly.placements : [];
    const middleIndex = Math.floor(placedClips.length / 2);
    if (placedClips[middleIndex]?.id) {
      polish.push(await applyEffect(ctx, placedClips[middleIndex].id, 'Gaussian Blur'));
    }
    const lastClip = placedClips[placedClips.length - 1];
    if (lastClip?.id) {
      polish.push(await colorCorrect(ctx, lastClip.id, {
        clipId: lastClip.id,
        brightness: 4,
        contrast: 8,
        saturation: 6
      }));
    }
  } else {
    polish.push({
      success: true,
      skipped: true,
      note: 'Default polish disabled. Use clipPlan effects/color for directed finishing.'
    });
  }

  const refreshedTracks = await listSequenceTracks(ctx, assembly.sequence.id);

  return {
    success: true,
    ...assembly,
    message: 'Brand spot assembled successfully',
    overlays,
    polish,
    tracks: refreshedTracks
  };
}

async function createSequenceFromProjectItems(ctx: ToolContext, name: string, projectItemIds: string[]): Promise<any> {
  if (!projectItemIds.length) {
    return { success: false, error: 'At least one imported project item is required to create a sequence without a dialog.' };
  }

  const script = `
      try {
        function walk(parent, output) {
          for (var i = 0; i < parent.children.numItems; i++) {
            var item = parent.children[i];
            output.push(item);
            if (item.type === ProjectItemType.BIN) walk(item, output);
          }
        }
        var ids = ${JSON.stringify(projectItemIds)};
        var allItems = [];
        walk(app.project.rootItem, allItems);
        var items = [];
        for (var j = 0; j < ids.length; j++) {
          var wanted = ids[j];
          var resolved = __resolveProjectItem(wanted);
          if (resolved) {
            items.push(resolved);
            continue;
          }
          for (var k = 0; k < allItems.length; k++) {
            if (__idsMatch(allItems[k].nodeId, wanted) || allItems[k].name === wanted) {
              items.push(allItems[k]);
              break;
            }
          }
        }
        if (!items.length) return JSON.stringify({ success: false, error: 'Imported project items could not be found.' });
        var sequence = app.project.createNewSequenceFromClips(${JSON.stringify(name)}, items, app.project.rootItem);
        if (!sequence) return JSON.stringify({ success: false, error: 'Premiere did not create a sequence from the imported clips.' });
        return JSON.stringify({ success: true, id: sequence.sequenceID, name: sequence.name, itemCount: items.length });
      } catch (e) {
        return JSON.stringify({ success: false, error: e.toString() });
      }
    `;
  return await ctx.bridge.executeScript(script);
}
