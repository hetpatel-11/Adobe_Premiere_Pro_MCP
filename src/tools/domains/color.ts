/**
 * Project and sequence color management: log handling, graphics white, LUT
 * interpolation, working color space, linear compositing and tone mapping.
 *
 * Each entry declares the tool an agent sees and the handler that runs it,
 * so the two cannot drift apart. Handlers reach Premiere through ToolContext.
 *
 * API surface verified against 26.5.2 (Project / Sequence / ProjectItem reflect):
 *   Project      setLogColorManagement, get/setGraphicsWhiteLuminance,
 *                getSupportedGraphicsWhiteLuminances (100, 203, 300),
 *                get/setLUTInterpolationMethod, getSupportedLUTInterpolationMethods (0, 1).
 *                There is no getter for log color management.
 *   Sequence     getSettings()/setSettings() carry workingColorSpace (a ColorSpace
 *                OBJECT taken from workingColorSpaceList: "Rec. 709", "Rec. 2100 HLG",
 *                "Rec. 2100 PQ", "ACEScct"), compositeLinearColor, autoToneMapEnabled.
 *   ProjectItem  getColorSpace, getOriginalColorSpace, getOverrideColorSpace and
 *                getInputLUTID read back; there is no Input LUT setter.
 */
import { z } from 'zod';
import type { ToolContext, ToolModule } from '../context.js';

export const colorTools: ToolModule[] = [
  {
    name: 'get_color_management',
    description: 'Reads color management: project graphics white and LUT interpolation (with the values this Premiere build supports), a sequence\'s working color space, linear compositing and auto tone mapping, and optionally a project item\'s current, original and override color space plus its Input LUT id.',
    inputSchema: z.object({
      sequenceId: z.string().optional().describe('Sequence to read. Defaults to the active sequence.'),
      projectItemId: z.string().optional().describe('Project item (nodeId, name or tree path) whose media color space to report')
    }),
    run: (ctx, args) => getColorManagement(ctx, args.sequenceId, args.projectItemId),
  },
  {
    name: 'set_project_color_management',
    description: 'Sets project-wide color management: log color management (1 = auto-detect log media), graphics white luminance in nits (100, 203 or 300) and LUT interpolation (trilinear or tetrahedral). Graphics white and LUT interpolation are read back; log color management has no getter in the API and is reported as applied, not verified.',
    inputSchema: z.object({
      logColorManagement: z.number().int().min(0).max(2).optional().describe('Value passed to Project.setLogColorManagement. 1 auto-detects log media (the setting saved by HDR projects as enableLogColorManagement:1).'),
      graphicsWhiteLuminance: z.union([z.literal(100), z.literal(203), z.literal(300)]).optional().describe('Graphics white in nits. 203 is the BT.2408 reference white for HDR.'),
      lutInterpolation: z.enum(['trilinear', 'tetrahedral']).optional().describe('LUT interpolation method')
    }),
    run: (ctx, args) => setProjectColorManagement(ctx, args),
  },
  {
    name: 'set_sequence_color_settings',
    description: 'Sets a sequence\'s working color space by name (e.g. "Rec. 709", "Rec. 2100 HLG", "Rec. 2100 PQ", "ACEScct"), linear compositing and auto tone mapping, then reads the settings back and reports anything Premiere did not apply.',
    inputSchema: z.object({
      sequenceId: z.string().describe('The ID of the sequence'),
      workingColorSpace: z.string().optional().describe('Name of an entry in the sequence\'s workingColorSpaceList'),
      compositeLinearColor: z.boolean().optional().describe('Composite in linear color'),
      autoToneMapEnabled: z.boolean().optional().describe('Auto tone map media whose color space differs from the working space')
    }),
    run: (ctx, args) => setSequenceColorSettings(ctx, args.sequenceId, args),
  },
];

// LUT interpolation ids as Premiere stores them (lutInterpolationMethod in the
// saved ColorManagementSettings): HDR house projects that use tetrahedral save 1.
const LUT_INTERPOLATION: Record<string, number> = { trilinear: 0, tetrahedral: 1 };

const DESCRIBE_SPACE = `
        function describeSpace(cs) {
          if (!cs) return null;
          return {
            name: String(cs.name),
            empty: cs.empty === true,
            isSceneReferred: cs.isSceneReferred === true,
            primaries: cs.primaries,
            transferCharacteristic: cs.transferCharacteristic,
            matrixEquation: cs.matrixEquation
          };
        }
        function readSequenceColor(seq) {
          var s = seq.getSettings();
          var names = [];
          var list = s.workingColorSpaceList || [];
          for (var i = 0; i < list.length; i++) names.push(String(list[i].name));
          return {
            workingColorSpace: s.workingColorSpace ? String(s.workingColorSpace.name) : null,
            workingColorSpaceList: names,
            compositeLinearColor: s.compositeLinearColor,
            autoToneMapEnabled: s.autoToneMapEnabled
          };
        }
`;

async function getColorManagement(ctx: ToolContext, sequenceId?: string, projectItemId?: string): Promise<any> {
  const script = `
      try {
        ${DESCRIBE_SPACE}
        var project = app.project;
        if (!project) return JSON.stringify({ success: false, error: "No open project" });
        var result = { success: true, project: {} };
        try { result.project.graphicsWhiteLuminance = project.getGraphicsWhiteLuminance(); } catch (e1) {}
        try { result.project.supportedGraphicsWhiteLuminances = String(project.getSupportedGraphicsWhiteLuminances()).split(","); } catch (e2) {}
        try { result.project.lutInterpolationMethod = project.getLUTInterpolationMethod(); } catch (e3) {}
        try { result.project.supportedLUTInterpolationMethods = String(project.getSupportedLUTInterpolationMethods()).split(","); } catch (e4) {}

        var requestedSequence = ${JSON.stringify(sequenceId ?? null)};
        var sequence = requestedSequence ? __findSequence(requestedSequence) : project.activeSequence;
        if (requestedSequence && !sequence) return JSON.stringify({ success: false, error: "Sequence not found by id: " + requestedSequence });
        if (sequence) {
          result.sequence = readSequenceColor(sequence);
          result.sequence.sequenceId = sequence.sequenceID;
          result.sequence.name = sequence.name;
        }

        var requestedItem = ${JSON.stringify(projectItemId ?? null)};
        if (requestedItem) {
          var item = __findProjectItem(requestedItem);
          if (!item) return JSON.stringify({ success: false, error: "Project item not found: " + requestedItem });
          var media = { name: item.name };
          try { media.colorSpace = describeSpace(item.getColorSpace()); } catch (e5) {}
          try { media.originalColorSpace = describeSpace(item.getOriginalColorSpace()); } catch (e6) {}
          try { media.overrideColorSpace = describeSpace(item.getOverrideColorSpace()); } catch (e7) {}
          try { media.inputLUTID = String(item.getInputLUTID()); } catch (e8) {}
          result.projectItem = media;
        }
        return JSON.stringify(result);
      } catch (e) {
        return JSON.stringify({ success: false, error: e.toString() });
      }
    `;
  return await ctx.bridge.executeScript(script);
}

async function setProjectColorManagement(ctx: ToolContext, args: {
  logColorManagement?: number; graphicsWhiteLuminance?: number; lutInterpolation?: string;
}): Promise<any> {
  const lut = args.lutInterpolation === undefined ? null : LUT_INTERPOLATION[args.lutInterpolation];
  const script = `
      try {
        var project = app.project;
        if (!project) return JSON.stringify({ success: false, error: "No open project" });
        var log = ${JSON.stringify(args.logColorManagement ?? null)};
        var white = ${JSON.stringify(args.graphicsWhiteLuminance ?? null)};
        var lut = ${JSON.stringify(lut)};
        if (log === null && white === null && lut === null) {
          return JSON.stringify({ success: true, message: "Nothing requested, nothing changed", changed: false });
        }
        var applied = [], notApplied = [];

        if (log !== null) {
          // No getter exists, so this cannot be read back; report it as applied only.
          project.setLogColorManagement(log);
          applied.push("logColorManagement");
        }
        if (white !== null) {
          var supported = String(project.getSupportedGraphicsWhiteLuminances()).split(",");
          var ok = false;
          for (var w = 0; w < supported.length; w++) if (Number(supported[w]) === white) ok = true;
          if (!ok) return JSON.stringify({ success: false, error: "Graphics white " + white + " not supported; supported: " + supported.join(", ") });
          project.setGraphicsWhiteLuminance(white);
          if (Number(project.getGraphicsWhiteLuminance()) === white) applied.push("graphicsWhiteLuminance");
          else notApplied.push("graphicsWhiteLuminance");
        }
        if (lut !== null) {
          project.setLUTInterpolationMethod(lut);
          if (Number(project.getLUTInterpolationMethod()) === lut) applied.push("lutInterpolation");
          else notApplied.push("lutInterpolation");
        }

        return JSON.stringify({
          success: notApplied.length === 0,
          error: notApplied.length ? "Premiere accepted but did not apply: " + notApplied.join(", ") : undefined,
          applied: applied,
          verified: {
            graphicsWhiteLuminance: project.getGraphicsWhiteLuminance(),
            lutInterpolationMethod: project.getLUTInterpolationMethod()
          },
          logColorManagementVerified: false
        });
      } catch (e) {
        return JSON.stringify({ success: false, error: e.toString() });
      }
    `;
  return await ctx.bridge.executeScript(script);
}

async function setSequenceColorSettings(ctx: ToolContext, sequenceId: string, args: {
  workingColorSpace?: string; compositeLinearColor?: boolean; autoToneMapEnabled?: boolean;
}): Promise<any> {
  const script = `
      try {
        ${DESCRIBE_SPACE}
        var sequence = __findSequence(${JSON.stringify(sequenceId)});
        if (!sequence) return JSON.stringify({ success: false, error: "Sequence not found by id: " + ${JSON.stringify(sequenceId)} });
        var wantSpace = ${JSON.stringify(args.workingColorSpace ?? null)};
        var wantLinear = ${JSON.stringify(args.compositeLinearColor ?? null)};
        var wantToneMap = ${JSON.stringify(args.autoToneMapEnabled ?? null)};
        var before = readSequenceColor(sequence);
        if (wantSpace === null && wantLinear === null && wantToneMap === null) {
          return JSON.stringify({ success: true, message: "Nothing requested, nothing changed", settings: before, changed: false });
        }

        var settings = sequence.getSettings();
        if (wantSpace !== null) {
          // workingColorSpace takes one of the list's ColorSpace OBJECTS (how HLG
          // sequences were set up live on 26.5.2); the ColorSpace-typed project item
          // APIs reject name strings with "Illegal Parameter type".
          var match = null;
          var list = settings.workingColorSpaceList || [];
          for (var i = 0; i < list.length; i++) if (String(list[i].name) === wantSpace) match = list[i];
          if (!match) return JSON.stringify({ success: false, error: "Working color space '" + wantSpace + "' not offered; available: " + before.workingColorSpaceList.join(", ") });
          settings.workingColorSpace = match;
        }
        if (wantLinear !== null) settings.compositeLinearColor = wantLinear;
        if (wantToneMap !== null) settings.autoToneMapEnabled = wantToneMap;
        sequence.setSettings(settings);

        var after = readSequenceColor(sequence);
        var notApplied = [];
        if (wantSpace !== null && after.workingColorSpace !== wantSpace) notApplied.push("workingColorSpace");
        if (wantLinear !== null && after.compositeLinearColor !== wantLinear) notApplied.push("compositeLinearColor");
        if (wantToneMap !== null && after.autoToneMapEnabled !== wantToneMap) notApplied.push("autoToneMapEnabled");
        return JSON.stringify({
          success: notApplied.length === 0,
          error: notApplied.length ? "Premiere accepted but did not apply: " + notApplied.join(", ") : undefined,
          sequenceId: sequence.sequenceID,
          sequenceName: sequence.name,
          before: before,
          after: after,
          changed: true
        });
      } catch (e) {
        return JSON.stringify({ success: false, error: e.toString() });
      }
    `;
  return await ctx.bridge.executeScript(script);
}
