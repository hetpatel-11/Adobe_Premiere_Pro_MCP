/**
 * Effects, transitions, color, and keyframes.
 *
 * Each entry declares the tool an agent sees and the handler that runs it,
 * so the two cannot drift apart. Handlers reach Premiere through ToolContext.
 */
import { z } from 'zod';
import type { ToolContext, ToolModule } from '../context.js';
import { ClipTransitionDurationSchema, ClipTransitionPositionSchema } from '../schemas.js';

export const effectsTools: ToolModule[] = [
  {
    name: 'apply_effect',
    description: 'Applies a visual or audio effect to a clip, identifies the exact newly created component, and verifies parameter readbacks.',
    inputSchema: z.object({
      clipId: z.string().describe('The ID of the clip to apply the effect to'),
      effectName: z.string().describe('The name of the effect to apply (e.g., "Gaussian Blur", "Lumetri Color")'),
      parameters: z.record(z.string(), z.any()).optional().describe('Key-value pairs for the effect\'s parameters')
    }),
    run: (ctx, args) => applyEffect(ctx, args.clipId, args.effectName, args.parameters),
  },
  {
    name: 'crop_clip',
    description: 'Crops a timeline clip using Premiere Pro\'s built-in Crop video effect. Reuses an existing Crop effect on the clip when present; otherwise adds one. Omitted parameters keep their current/default values.',
    inputSchema: z.object({
      clipId: z.string().describe('The ID of the timeline video clip to crop'),
      left: z.number().min(0).max(100).optional().describe('Percent to crop from the left edge (0-100)'),
      right: z.number().min(0).max(100).optional().describe('Percent to crop from the right edge (0-100)'),
      top: z.number().min(0).max(100).optional().describe('Percent to crop from the top edge (0-100)'),
      bottom: z.number().min(0).max(100).optional().describe('Percent to crop from the bottom edge (0-100)'),
      zoom: z.boolean().optional().describe('Crop effect Zoom toggle: scales the cropped image back up to fill the frame'),
      edgeFeather: z.number().min(0).optional().describe('Edge Feather amount in pixels')
    }),
    run: (ctx, args) => cropClip(ctx, args.clipId, { left: args.left, right: args.right, top: args.top, bottom: args.bottom, zoom: args.zoom, edgeFeather: args.edgeFeather }),
  },
  {
    name: 'add_transition',
    description: 'Adds a transition (e.g., cross dissolve) between two adjacent clips on the timeline.',
    inputSchema: z.object({
      clipId1: z.string().describe('The ID of the first clip (outgoing)'),
      clipId2: z.string().describe('The ID of the second clip (incoming)'),
      transitionName: z.string().describe('The name of the transition to add (e.g., "Cross Dissolve")'),
      duration: z.number().describe('The duration of the transition in seconds')
    }),
    run: (ctx, args) => addTransition(ctx, args.clipId1, args.clipId2, args.transitionName, args.duration),
  },
  {
    name: 'add_transition_to_clip',
    description: 'Adds a transition to the beginning or end of a single clip. Check status and verified in the result: accepted_unverified means Premiere accepted the command but inspection could not prove the edit, so do not retry automatically.',
    inputSchema: z.object({
      clipId: z.string().describe('The ID of the clip'),
      transitionName: z.string().describe('The name of the transition'),
      position: ClipTransitionPositionSchema.describe('Whether to add the transition at the start or end of the clip. Case-insensitive; in/head/beginning and out/tail are accepted.'),
      duration: ClipTransitionDurationSchema.describe('The duration of the transition in seconds. A numeric string is accepted.')
    }),
    run: (ctx, args) => addTransitionToClip(ctx, args.clipId, args.transitionName, args.position, args.duration),
  },
  {
    name: 'batch_add_transitions',
    description: 'Adds a transition to all clip boundaries on a track. Useful for quickly adding cross dissolves or other transitions between every clip.',
    inputSchema: z.object({
      sequenceId: z.string().describe('The ID of the sequence'),
      trackIndex: z.number().describe('The video track index (0-based)'),
      transitionName: z.string().describe('The name of the transition (e.g., "Cross Dissolve")'),
      duration: z.number().describe('The duration of each transition in seconds')
    }),
    run: (ctx, args) => batchAddTransitions(ctx, args.sequenceId, args.trackIndex, args.transitionName, args.duration),
  },
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
    }),
    run: (ctx, args) => colorCorrect(ctx, args.clipId, args),
  },
  {
    name: 'apply_lut',
    description: 'Applies a Look-Up Table (LUT) to a clip for color grading.',
    inputSchema: z.object({
      clipId: z.string().describe('The ID of the clip'),
      lutPath: z.string().describe('The absolute path to the .cube or .3dl LUT file'),
      intensity: z.number().optional().describe('LUT intensity (0-100)')
    }),
    run: (ctx, args) => applyLut(ctx, args.clipId, args.lutPath, args.intensity),
  },
  {
    name: 'add_keyframe',
    description: 'Adds a keyframe to a clip component parameter at a specific time.',
    inputSchema: z.object({
      clipId: z.string().describe('The ID of the clip'),
      componentName: z.string().describe('The display name of the component (e.g., "Motion", "Opacity")'),
      paramName: z.string().describe('The display name of the parameter (e.g., "Position", "Scale")'),
      time: z.number().describe('The time in seconds for the keyframe'),
      value: z.union([z.number(), z.array(z.number())]).describe('The value to set at this keyframe. A number for Scale/Opacity/Rotation; [x,y] for Position.')
    }),
    run: (ctx, args) => addKeyframe(ctx, args.clipId, args.componentName, args.paramName, args.time, args.value),
  },
  {
    name: 'remove_keyframe',
    description: 'Removes a keyframe from a clip component parameter at a specific time.',
    inputSchema: z.object({
      clipId: z.string().describe('The ID of the clip'),
      componentName: z.string().describe('The display name of the component'),
      paramName: z.string().describe('The display name of the parameter'),
      time: z.number().describe('The time in seconds of the keyframe to remove')
    }),
    run: (ctx, args) => removeKeyframe(ctx, args.clipId, args.componentName, args.paramName, args.time),
  },
  {
    name: 'get_keyframes',
    description: 'Gets all keyframes for a clip component parameter.',
    inputSchema: z.object({
      clipId: z.string().describe('The ID of the clip'),
      componentName: z.string().describe('The display name of the component'),
      paramName: z.string().describe('The display name of the parameter')
    }),
    run: (ctx, args) => getKeyframes(ctx, args.clipId, args.componentName, args.paramName),
  },
];

function transitionVerificationScript(): string {
  return `
        function __readQeTransitionState(qeClip) {
          var state = { available: false, count: null, names: [] };
          if (!qeClip) return state;
          function numberValue(value) {
            if (typeof value === "number" && !isNaN(value)) return value;
            if (value && typeof value.numItems === "number") return value.numItems;
            if (value && typeof value.length === "number") return value.length;
            return null;
          }
          var countProps = ["numTransitions", "numVideoTransitions", "numAudioTransitions", "transitions"];
          for (var i = 0; i < countProps.length; i++) {
            try {
              var prop = qeClip[countProps[i]];
              var count = numberValue(typeof prop === "function" ? prop.call(qeClip) : prop);
              if (count !== null) {
                state.available = true;
                state.count = count;
                break;
              }
            } catch (e) {}
          }
          if (state.count !== null && state.count > 0) {
            var getterNames = ["getTransitionAt", "getVideoTransitionAt", "getAudioTransitionAt"];
            for (var g = 0; g < getterNames.length; g++) {
              if (typeof qeClip[getterNames[g]] !== "function") continue;
              try {
                for (var t = 0; t < state.count; t++) {
                  var transition = qeClip[getterNames[g]](t);
                  if (transition) {
                    state.names.push(transition.name || transition.displayName || transition.toString());
                  }
                }
                break;
              } catch (e2) {}
            }
          }
          return state;
        }
        function __transitionWasVerified(before, after) {
          if (!before.available || !after.available) return false;
          if (before.count !== null && after.count !== null && after.count > before.count) return true;
          if (after.names && before.names && after.names.length > before.names.length) return true;
          return false;
        }
        function __transitionXmlCount(seq) {
          // Do not call seq.exportAsFinalCutProXML here. Each export opens Premiere's
          // FCP Translation Results window (suppressUI does not apply to exports).
          // Transition tools verify through QE enumeration only.
          return {
            available: false,
            count: 0,
            path: null,
            error: "Skipped: FCP XML export opens Translation Results dialogs"
          };
        }
        function __transitionWasVerifiedByXml(beforeXml, afterXml) {
          return beforeXml && afterXml && beforeXml.available && afterXml.available && afterXml.count > beforeXml.count;
        }
        function __findQeClipByDomClip(qeTrack, domClip) {
          if (!qeTrack || !domClip) return null;
          var targetTicks = null;
          try { targetTicks = String(domClip.start.ticks); } catch (targetError) {}
          var best = null;
          var bestDelta = null;
          for (var qi = 0; qi < qeTrack.numItems; qi++) {
            var item = qeTrack.getItemAt(qi);
            if (!item || String(item.type) !== "Clip") continue;
            if (targetTicks !== null) {
              var itemTicks = null;
              try { itemTicks = String(item.start.ticks); } catch (itemError) {}
              if (itemTicks === targetTicks) return item;
              if (itemTicks !== null) {
                var delta = Math.abs(parseInt(itemTicks, 10) - parseInt(targetTicks, 10));
                if (best === null || delta < bestDelta) {
                  best = item;
                  bestDelta = delta;
                }
              }
            }
          }
          return best;
        }
    `;
}

export async function applyEffect(ctx: ToolContext, clipId: string, effectName: string, parameters?: Record<string, any>): Promise<any> {
  const paramJson = JSON.stringify(parameters || {});
  const clipIdJson = JSON.stringify(clipId);
  const effectNameJson = JSON.stringify(effectName);
  const script = `
      try {
        app.enableQE();
        var info = __findClip(${clipIdJson});
        if (!info) return JSON.stringify({ success: false, error: "Clip not found" });
        var clip = info.clip;
        function stableValue(value) {
          try {
            var encoded = JSON.stringify(value);
            return encoded === undefined ? String(value) : encoded;
          } catch (e) {
            try { return String(value); } catch (e2) { return "<unreadable>"; }
          }
        }
        function snapshotComponent(component) {
          var propertyParts = [];
          var propertyCount = -1;
          var componentProperties = null;
          try {
            componentProperties = component.properties;
            propertyCount = componentProperties.numItems;
          } catch (e3) {
            propertyParts.push("<properties unreadable>");
          }
          for (var si = 0; si < propertyCount; si++) {
            try {
              var snapshotProperty = componentProperties[si];
              var snapshotValue = "<getValue failed>";
              try { snapshotValue = stableValue(snapshotProperty.getValue()); } catch (e4) {}
              propertyParts.push(String(snapshotProperty.displayName) + "=" + snapshotValue);
            } catch (e5) {
              propertyParts.push("<property " + si + " unreadable>");
            }
          }
          var matchName = "";
          try { matchName = String(component.matchName || ""); } catch (e6) {}
          var displayName = String(component.displayName);
          return {
            displayName: displayName,
            matchName: matchName,
            propertyCount: propertyCount,
            fingerprint: displayName + "|" + matchName + "|" + propertyParts.join("|")
          };
        }
        function snapshotComponents(targetClip) {
          var snapshots = [];
          for (var sci = 0; sci < targetClip.components.numItems; sci++) {
            snapshots.push(snapshotComponent(targetClip.components[sci]));
          }
          return snapshots;
        }
        function fingerprintsEqual(left, right) {
          if (left.length !== right.length) return false;
          for (var fei = 0; fei < left.length; fei++) {
            if (left[fei].fingerprint !== right[fei].fingerprint) return false;
          }
          return true;
        }
        var beforeComponents = snapshotComponents(clip);
        var beforeCount = beforeComponents.length;
        // Addressed by id, not by whatever is on screen. __findClip() searches every
        // sequence in the project, so a clip can be resolved out of one sequence and
        // then, through getActiveSequence(), have the effect applied to whichever
        // clip sits at the same track and index in a different one.
        var qeSeq = __qeSequenceFor(info.sequence);
        if (!qeSeq) return JSON.stringify({ success: false, error: "Could not address sequence '" + info.sequenceName + "' through the QE API." });
        var qeTrack, effect;
        if (info.trackType === 'video') {
          qeTrack = qeSeq.getVideoTrackAt(info.trackIndex);
          effect = __findQeNamed("videoEffect", ${effectNameJson});
        } else {
          qeTrack = qeSeq.getAudioTrackAt(info.trackIndex);
          effect = __findQeNamed("audioEffect", ${effectNameJson});
        }
        if (!effect) return JSON.stringify({ success: false, error: "Effect not found: " + ${effectNameJson} + ". Use list_available_effects to see available effects." });
        function findQeClipByTime() {
          var targetTicks = String(info.clip.start.ticks);
          var best = null;
          var bestDelta = null;
          for (var qi = 0; qi < qeTrack.numItems; qi++) {
            var item = qeTrack.getItemAt(qi);
            if (!item || String(item.type) !== "Clip") continue;
            var itemTicks = String(item.start.ticks);
            if (itemTicks === targetTicks) return item;
            var delta = Math.abs(parseInt(itemTicks, 10) - parseInt(targetTicks, 10));
            if (best === null || delta < bestDelta) {
              best = item;
              bestDelta = delta;
            }
          }
          return best;
        }
        var qeClip = findQeClipByTime();
        if (!qeClip) return JSON.stringify({ success: false, error: "Could not locate matching QE clip for effect application" });
        if (info.trackType === 'video') { qeClip.addVideoEffect(effect); } else { qeClip.addAudioEffect(effect); }

        // Re-resolve after the QE mutation, then locate the unique inserted component by
        // finding the index whose removal restores the complete pre-add fingerprint sequence.
        var afterInfo = __findClip(${clipIdJson});
        if (!afterInfo) return JSON.stringify({ success: false, error: "Clip could not be re-resolved after effect add" });
        clip = afterInfo.clip;
        var afterComponents = snapshotComponents(clip);
        var afterCount = afterComponents.length;
        var candidateIndices = [];
        if (afterCount <= beforeCount) {
          var existingIdx = -1;
          for (var ei = 0; ei < afterComponents.length; ei++) {
            if (__namesMatch(afterComponents[ei].displayName, ${effectNameJson}) ||
                __namesMatch(afterComponents[ei].matchName, ${effectNameJson})) {
              existingIdx = ei;
              break;
            }
          }
          if (existingIdx < 0) {
            return JSON.stringify({
              success: false,
              error: "Effect add did not create a new component on the target clip",
              clipId: ${clipIdJson},
              effectName: ${effectNameJson},
              beforeComponentCount: beforeCount,
              afterComponentCount: afterCount
            });
          }
          candidateIndices = [existingIdx];
        } else if (afterCount === beforeCount + 1) {
          for (var candidateIndex = 0; candidateIndex < afterCount; candidateIndex++) {
            var withoutCandidate = [];
            for (var afterIndex = 0; afterIndex < afterCount; afterIndex++) {
              if (afterIndex !== candidateIndex) withoutCandidate.push(afterComponents[afterIndex]);
            }
            if (fingerprintsEqual(beforeComponents, withoutCandidate)) candidateIndices.push(candidateIndex);
          }
        }
        if (candidateIndices.length !== 1) {
          function componentDiagnostics(snapshots) {
            var diagnostics = [];
            for (var di = 0; di < snapshots.length; di++) {
              diagnostics.push({
                componentIndex: di,
                displayName: snapshots[di].displayName,
                matchName: snapshots[di].matchName,
                propertyCount: snapshots[di].propertyCount
              });
            }
            return diagnostics;
          }
          return JSON.stringify({
            success: false,
            error: "Effect was added, but its component could not be uniquely identified; no parameters were written and an automatic retry is unsafe",
            effectAdded: true,
            retryUnsafe: true,
            clipId: ${clipIdJson},
            effectName: ${effectNameJson},
            beforeComponents: componentDiagnostics(beforeComponents),
            afterComponents: componentDiagnostics(afterComponents),
            candidateComponentIndices: candidateIndices
          });
        }
        var newCompIdx = candidateIndices[0];
        var newComp = clip.components[newCompIdx];

        // Dump every property name + current value
        var propsDump = [];
        for (var i = 0; i < newComp.properties.numItems; i++) {
          var prop = newComp.properties[i];
          var dn = String(prop.displayName);
          var val = null;
          try { val = prop.getValue(); } catch (e1) { val = "<getValue threw: " + e1.toString() + ">"; }
          propsDump.push({ index: i, displayName: dn, value: val });
        }

        // Apply parameters by displayName match (exact first, then normalized)
        var requestedParams = ${paramJson};
        var paramResults = [];
        function normalize(s) { return String(s).toLowerCase().replace(/[\\s_-]+/g, ''); }
        function valuesEquivalent(actual, requested) {
          var actualIsArray = Object.prototype.toString.call(actual) === "[object Array]";
          var requestedIsArray = Object.prototype.toString.call(requested) === "[object Array]";
          if (actualIsArray || requestedIsArray) {
            if (!actualIsArray || !requestedIsArray || actual.length !== requested.length) return false;
            for (var vai = 0; vai < actual.length; vai++) {
              if (!valuesEquivalent(actual[vai], requested[vai])) return false;
            }
            return true;
          }
          if (typeof actual === "number" && typeof requested === "number") {
            return Math.abs(actual - requested) <= 0.0001;
          }
          if (typeof requested === "boolean" && typeof actual === "number" && (actual === 0 || actual === 1)) {
            return Boolean(actual) === requested;
          }
          if (typeof actual === "boolean" && typeof requested === "number" && (requested === 0 || requested === 1)) {
            return actual === Boolean(requested);
          }
          return stableValue(actual) === stableValue(requested);
        }
        for (var pName in requestedParams) {
          if (requestedParams.hasOwnProperty && !requestedParams.hasOwnProperty(pName)) continue;
          var requestedVal = requestedParams[pName];
          var matched = null;
          // Pass 1: exact displayName match
          for (var k = 0; k < newComp.properties.numItems; k++) {
            if (String(newComp.properties[k].displayName) === pName) {
              matched = { idx: k, prop: newComp.properties[k], strategy: "exact" };
              break;
            }
          }
          // Pass 2: locale-aware / folded match (Exposure/Exposition, Scale/Escala)
          if (!matched) {
            for (var k = 0; k < newComp.properties.numItems; k++) {
              if (__namesMatch(newComp.properties[k].displayName, pName)) {
                matched = { idx: k, prop: newComp.properties[k], strategy: "canonical" };
                break;
              }
            }
          }
          if (!matched) {
            var nameN = normalize(pName);
            for (var k = 0; k < newComp.properties.numItems; k++) {
              if (normalize(String(newComp.properties[k].displayName)) === nameN) {
                matched = { idx: k, prop: newComp.properties[k], strategy: "normalized" };
                break;
              }
            }
          }
          if (matched) {
            try {
              var valueBefore = null;
              var beforeReadable = true;
              try { valueBefore = matched.prop.getValue(); } catch (eB) { beforeReadable = false; }
              var coercedVal = __coercePropertyValue(matched.prop, requestedVal, null);
              matched.prop.setValue(coercedVal, true);
              var valueAfter = null;
              var afterReadable = true;
              try { valueAfter = matched.prop.getValue(); } catch (eA) { afterReadable = false; }
              var verified = afterReadable && valuesEquivalent(valueAfter, coercedVal);
              var changed = beforeReadable && afterReadable && !valuesEquivalent(valueAfter, valueBefore);
              var acceptedWithWarning = !verified && changed;
              var unverifiable = !afterReadable;
              var resultOk = verified || acceptedWithWarning;
              paramResults.push({
                requestedName: pName,
                matchedDisplayName: String(matched.prop.displayName),
                strategy: matched.strategy,
                valueRequested: requestedVal,
                valueBefore: valueBefore,
                valueAfter: valueAfter,
                verification: verified ? "verified" : (acceptedWithWarning ? "changed_with_warning" : (unverifiable ? "unverifiable" : "failed")),
                warning: acceptedWithWarning
                  ? "Premiere changed the property but readback differs from the requested value (possibly clamped or coerced)"
                  : (unverifiable ? "Premiere accepted setValue but the resulting value could not be read back" : undefined),
                ok: resultOk
              });
            } catch (e2) {
              paramResults.push({ requestedName: pName, ok: false, error: "setValue threw: " + e2.toString() });
            }
          } else {
            paramResults.push({ requestedName: pName, ok: false, error: "no property matches this displayName (exact or normalized)" });
          }
        }

        var failedParams = [];
        var paramWarnings = [];
        for (var pr = 0; pr < paramResults.length; pr++) {
          if (!paramResults[pr].ok) failedParams.push(paramResults[pr]);
          if (paramResults[pr].warning) paramWarnings.push({
            requestedName: paramResults[pr].requestedName,
            verification: paramResults[pr].verification,
            warning: paramResults[pr].warning
          });
        }

        return JSON.stringify({
          success: failedParams.length === 0,
          message: "Effect applied",
          clipId: ${clipIdJson},
          effectName: ${effectNameJson},
          addedComponent: {
            displayName: String(newComp.displayName),
            componentIndex: newCompIdx,
            identificationStrategy: "unique ordered component fingerprint insertion",
            propertyCount: propsDump.length,
            properties: propsDump
          },
          paramResults: paramResults,
          warnings: paramWarnings,
          error: failedParams.length ? "One or more effect parameters could not be set" : undefined
        });
      } catch (e) {
        return JSON.stringify({ success: false, error: "QE DOM error: " + e.toString() });
      }
    `;

  return await ctx.bridge.executeScript(script);
}

async function cropClip(ctx: ToolContext, clipId: string, options: { left?: number; right?: number; top?: number; bottom?: number; zoom?: boolean; edgeFeather?: number }): Promise<any> {
  const params: Record<string, any> = {};
  if (options.left !== undefined) params['Left'] = options.left;
  if (options.top !== undefined) params['Top'] = options.top;
  if (options.right !== undefined) params['Right'] = options.right;
  if (options.bottom !== undefined) params['Bottom'] = options.bottom;
  if (options.zoom !== undefined) params['Zoom'] = options.zoom;
  if (options.edgeFeather !== undefined) params['Edge Feather'] = options.edgeFeather;

  const paramJson = JSON.stringify(params);
  const script = `
      try {
        app.enableQE();
        var info = __findClip(${JSON.stringify(clipId)});
        if (!info) return JSON.stringify({ success: false, error: "Clip not found" });
        if (info.trackType !== "video") return JSON.stringify({ success: false, error: "crop_clip only supports video clips" });

        var clip = info.clip;
        var cropComp = null;
        var cropCompIdx = -1;

        function isCropComponent(component) {
          var matchName = "";
          try { matchName = String(component.matchName || ""); } catch (eCrop) {}
          return __namesMatch(component.displayName, "Crop") || matchName === "AE.ADBE AECrop";
        }

        function findCropComponent() {
          for (var i = clip.components.numItems - 1; i >= 0; i--) {
            var component = clip.components[i];
            if (isCropComponent(component)) {
              cropComp = component;
              cropCompIdx = i;
              return true;
            }
          }
          return false;
        }

        var effectAdded = false;
        if (!findCropComponent()) {
          // Addressed by id, not by whatever is on screen. __findClip() searches every
          // sequence in the project, so a clip can be resolved out of one sequence and
          // then, through getActiveSequence(), have the effect applied to whichever
          // clip sits at the same track and index in a different one.
          var qeSeq = __qeSequenceFor(info.sequence);
          if (!qeSeq) return JSON.stringify({ success: false, error: "QE active sequence not available" });
          var qeTrack = qeSeq.getVideoTrackAt(info.trackIndex);
          if (!qeTrack) return JSON.stringify({ success: false, error: "QE video track not found for clip" });
          var effect = __findQeNamed("videoEffect", "Crop");
          if (!effect) return JSON.stringify({ success: false, error: "Crop effect not found. Use list_available_effects to inspect installed effects." });

          function findQeClipByTime() {
            var targetTicks = String(info.clip.start.ticks);
            var best = null;
            var bestDelta = null;
            for (var qi = 0; qi < qeTrack.numItems; qi++) {
              var item = qeTrack.getItemAt(qi);
              if (!item || String(item.type) !== "Clip") continue;
              var itemTicks = String(item.start.ticks);
              if (itemTicks === targetTicks) return item;
              var delta = Math.abs(parseInt(itemTicks, 10) - parseInt(targetTicks, 10));
              if (best === null || delta < bestDelta) {
                best = item;
                bestDelta = delta;
              }
            }
            return best;
          }

          var beforeCount = clip.components.numItems;
          var qeClip = findQeClipByTime();
          if (!qeClip) return JSON.stringify({ success: false, error: "Could not locate matching QE clip for Crop effect" });
          qeClip.addVideoEffect(effect);
          if (clip.components.numItems <= beforeCount && !findCropComponent()) {
            return JSON.stringify({
              success: false,
              error: "Crop effect add did not create a new component on the target clip",
              beforeComponentCount: beforeCount,
              afterComponentCount: clip.components.numItems
            });
          }
          effectAdded = clip.components.numItems > beforeCount;
          if (!findCropComponent()) {
            var addedNames = [];
            for (var ai = beforeCount; ai < clip.components.numItems; ai++) {
              addedNames.push(String(clip.components[ai].displayName));
            }
            return JSON.stringify({
              success: false,
              error: "Effect add completed but the new component was not Crop",
              addedComponents: addedNames
            });
          }
        }

        var requestedParams = ${paramJson};
        var paramResults = [];
        function normalize(s) { return String(s).toLowerCase().replace(/[\\s_-]+/g, ''); }
        for (var pName in requestedParams) {
          if (requestedParams.hasOwnProperty && !requestedParams.hasOwnProperty(pName)) continue;
          var requestedVal = requestedParams[pName];
          var matched = null;
          for (var k = 0; k < cropComp.properties.numItems; k++) {
            if (String(cropComp.properties[k].displayName) === pName) {
              matched = { prop: cropComp.properties[k], strategy: "exact" };
              break;
            }
          }
          if (!matched) {
            var nameN = normalize(pName);
            for (var nk = 0; nk < cropComp.properties.numItems; nk++) {
              if (normalize(String(cropComp.properties[nk].displayName)) === nameN) {
                matched = { prop: cropComp.properties[nk], strategy: "normalized" };
                break;
              }
            }
          }
          if (!matched) {
            paramResults.push({ requestedName: pName, ok: false, error: "no Crop property matches this displayName" });
            continue;
          }
          try {
            var valueBefore = null;
            try { valueBefore = matched.prop.getValue(); } catch (eB) {}
            matched.prop.setValue(requestedVal, true);
            var valueAfter = null;
            try { valueAfter = matched.prop.getValue(); } catch (eA) {}
            var clamped = false;
            if (typeof valueAfter === "number" && typeof requestedVal === "number") {
              clamped = Math.abs(valueAfter - requestedVal) > 0.0001;
            } else {
              clamped = valueAfter !== requestedVal;
            }
            paramResults.push({
              requestedName: pName,
              matchedDisplayName: String(matched.prop.displayName),
              strategy: matched.strategy,
              valueRequested: requestedVal,
              valueBefore: valueBefore,
              valueAfter: valueAfter,
              clamped: clamped,
              ok: true
            });
          } catch (eSet) {
            paramResults.push({ requestedName: pName, ok: false, error: "setValue threw: " + eSet.toString() });
          }
        }

        var propsDump = [];
        for (var pi = 0; pi < cropComp.properties.numItems; pi++) {
          var prop = cropComp.properties[pi];
          var val = null;
          try { val = prop.getValue(); } catch (eVal) { val = "<getValue threw: " + eVal.toString() + ">"; }
          propsDump.push({ index: pi, displayName: String(prop.displayName), value: val });
        }

        var failedParams = [];
        for (var pr = 0; pr < paramResults.length; pr++) {
          if (!paramResults[pr].ok) failedParams.push(paramResults[pr]);
        }

        return JSON.stringify({
          success: failedParams.length === 0,
          message: effectAdded ? "Crop effect applied" : "Existing Crop effect updated",
          clipId: ${JSON.stringify(clipId)},
          effectName: "Crop",
          effectAdded: effectAdded,
          componentIndex: cropCompIdx,
          properties: propsDump,
          paramResults: paramResults,
          error: failedParams.length ? "One or more Crop parameters could not be set" : undefined
        });
      } catch (e) {
        return JSON.stringify({ success: false, error: "Crop effect failed: " + e.toString() });
      }
    `;

  return await ctx.bridge.executeScript(script);
}

async function addTransition(ctx: ToolContext, clipId1: string, clipId2: string, transitionName: string, duration: number): Promise<any> {
  const script = `
      try {
        app.enableQE();
        var info1 = __findClip(${JSON.stringify(clipId1)});
        if (!info1) return JSON.stringify({ success: false, error: "First clip not found" });
        var info2 = __findClip(${JSON.stringify(clipId2)});
        var targetInfo = info2 || info1;
        // Addressed by id, not by whatever is on screen. __findClip() searches every
        // sequence in the project, so a clip can be resolved out of one sequence and
        // then, through getActiveSequence(), have the effect applied to whichever
        // clip sits at the same track and index in a different one.
        var qeSeq = __qeSequenceFor(targetInfo.sequence);
        if (!qeSeq) return JSON.stringify({ success: false, error: "Could not address sequence '" + targetInfo.sequenceName + "' through the QE API." });
        var qeTrack = qeSeq.getVideoTrackAt(targetInfo.trackIndex);
        var qeClip = __findQeClipByDomClip(qeTrack, targetInfo.clip);
        if (!qeClip) return JSON.stringify({ success: false, error: "Could not locate matching QE clip for transition" });
        var transition = __findQeNamed("videoTransition", ${JSON.stringify(transitionName)});
        if (!transition) return JSON.stringify({ success: false, error: "Transition not found: " + ${JSON.stringify(transitionName)} + ". Use list_available_transitions." });
        // The clip may live outside the active sequence, and a duration in frames
        // computed from the wrong timebase gives the transition the wrong length.
        var seq = targetInfo.sequence;
        var fps = seq && seq.timebase ? (254016000000 / parseInt(seq.timebase, 10)) : 30;
        var frames = Math.round(${duration} * fps);
        ${transitionVerificationScript()}
        var before = __readQeTransitionState(qeClip);
        var beforeXml = __transitionXmlCount(seq);
        qeClip.addTransition(transition, info2 ? false : true, String(frames), "0", 0.5, true, true);
        try { if (typeof $ !== "undefined" && $.sleep) $.sleep(150); } catch (eWait) {}
        var afterClip = __findQeClipByDomClip(qeTrack, targetInfo.clip);
        var after = __readQeTransitionState(afterClip);
        var afterXml = __transitionXmlCount(seq);
        var qeVerified = __transitionWasVerified(before, after);
        var xmlVerified = __transitionWasVerifiedByXml(beforeXml, afterXml);
        if (!qeVerified && !xmlVerified) {
          return JSON.stringify({
            success: true,
            status: "accepted_unverified",
            verified: false,
            warning: "Transition command accepted; Premiere did not expose a readable transition-list change. Same inspection gap as add_transition_to_clip.",
            transitionName: ${JSON.stringify(transitionName)},
            duration: ${duration},
            frames: frames,
            before: before,
            after: after,
            beforeXml: beforeXml,
            afterXml: afterXml
          });
        }
        return JSON.stringify({ success: true, status: "applied_verified", verified: true, message: "Transition added and verified", transitionName: ${JSON.stringify(transitionName)}, duration: ${duration}, frames: frames, before: before, after: after, beforeXml: beforeXml, afterXml: afterXml });
      } catch (e) {
        return JSON.stringify({ success: false, error: "QE DOM error: " + e.toString() });
      }
    `;

  return await ctx.bridge.executeScript(script);
}

export async function addTransitionToClip(ctx: ToolContext, clipId: string, transitionName: string, position: 'start' | 'end', duration: number): Promise<any> {
  const atEnd = position === 'end';
  const script = `
      try {
        app.enableQE();
        var info = __findClip(${JSON.stringify(clipId)});
        if (!info) return JSON.stringify({ success: false, status: "failed", verified: false, error: "Clip not found" });
        // Addressed by id, not by whatever is on screen. __findClip() searches every
        // sequence in the project, so a clip can be resolved out of one sequence and
        // then, through getActiveSequence(), have the effect applied to whichever
        // clip sits at the same track and index in a different one.
        var qeSeq = __qeSequenceFor(info.sequence);
        if (!qeSeq) return JSON.stringify({ success: false, error: "Could not address sequence '" + info.sequenceName + "' through the QE API." });
        var qeTrack = info.trackType === 'video' ? qeSeq.getVideoTrackAt(info.trackIndex) : qeSeq.getAudioTrackAt(info.trackIndex);
        var qeClip = __findQeClipByDomClip(qeTrack, info.clip);
        if (!qeClip) return JSON.stringify({ success: false, status: "failed", verified: false, error: "Could not locate matching QE clip for transition" });
        var transition = info.trackType === 'video'
          ? __findQeNamed("videoTransition", ${JSON.stringify(transitionName)})
          : __findQeNamed("audioTransition", ${JSON.stringify(transitionName)});
        if (!transition) return JSON.stringify({ success: false, status: "failed", verified: false, error: "Transition not found: " + ${JSON.stringify(transitionName)} });
        // The clip may live outside the active sequence, and a duration in frames
        // computed from the wrong timebase gives the transition the wrong length.
        var seq = info.sequence;
        var fps = seq && seq.timebase ? (254016000000 / parseInt(seq.timebase, 10)) : 30;
        var frames = Math.round(${duration} * fps);
        ${transitionVerificationScript()}
        var before = __readQeTransitionState(qeClip);
        var beforeXml = __transitionXmlCount(seq);
        qeClip.addTransition(transition, ${atEnd}, String(frames), "0", 0.5, true, true);
        try { if (typeof $ !== "undefined" && $.sleep) $.sleep(150); } catch (eWait) {}
        var afterClip = __findQeClipByDomClip(qeTrack, info.clip);
        var after = __readQeTransitionState(afterClip);
        var afterXml = __transitionXmlCount(seq);
        var qeVerified = __transitionWasVerified(before, after);
        var xmlVerified = __transitionWasVerifiedByXml(beforeXml, afterXml);
        if (!qeVerified && !xmlVerified) {
          var qeInspectionAvailable = before.available && after.available;
          var xmlInspectionAvailable = beforeXml.available && afterXml.available;
          var inspectionAvailable = qeInspectionAvailable || xmlInspectionAvailable;
          return JSON.stringify({
            success: true,
            status: "accepted_unverified",
            verified: false,
            verification: {
              method: "transition_enumeration_and_xml",
              available: inspectionAvailable,
              channels: {
                transitionEnumeration: {
                  available: qeInspectionAvailable,
                  before: qeInspectionAvailable ? before : null,
                  after: qeInspectionAvailable ? after : null
                },
                finalCutProXml: {
                  available: xmlInspectionAvailable,
                  before: xmlInspectionAvailable ? beforeXml : null,
                  after: xmlInspectionAvailable ? afterXml : null,
                  beforeError: beforeXml.error,
                  afterError: afterXml.error
                }
              },
              reason: inspectionAvailable
                ? "Available Premiere Pro inspection channels did not confirm a transition change; these channels can omit transitions for some clip types"
                : "Premiere Pro did not expose a readable transition list for this clip type",
              before: inspectionAvailable ? { transitionEnumeration: before, finalCutProXml: beforeXml } : null,
              after: inspectionAvailable ? { transitionEnumeration: after, finalCutProXml: afterXml } : null
            },
            warning: "Transition command accepted; result could not be independently verified.",
            transitionName: ${JSON.stringify(transitionName)},
            position: ${JSON.stringify(position)},
            duration: ${duration},
            frames: frames
          });
        }
        return JSON.stringify({
          success: true,
          status: "applied_verified",
          verified: true,
          message: "Transition added at " + ${JSON.stringify(position)} + " and verified",
          verification: {
            method: qeVerified ? "transition_enumeration" : "final_cut_pro_xml",
            available: true,
            reason: qeVerified ? null : "Verified by a sequence-wide Final Cut Pro XML transition-count increase",
            before: qeVerified ? before : beforeXml,
            after: qeVerified ? after : afterXml
          },
          transitionName: ${JSON.stringify(transitionName)},
          position: ${JSON.stringify(position)},
          duration: ${duration},
          frames: frames
        });
      } catch (e) {
        return JSON.stringify({ success: false, status: "failed", verified: false, error: "QE DOM error: " + e.toString() });
      }
    `;

  return await ctx.bridge.executeScript(script);
}

export async function colorCorrect(ctx: ToolContext, clipId: string, adjustments: any): Promise<any> {
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
        var info = __findClip(${JSON.stringify(clipId)});
        if (!info) return JSON.stringify({ success: false, error: "Clip not found" });
        // Addressed by id, not by whatever is on screen. __findClip() searches every
        // sequence in the project, so a clip can be resolved out of one sequence and
        // then, through getActiveSequence(), have the effect applied to whichever
        // clip sits at the same track and index in a different one.
        var qeSeq = __qeSequenceFor(info.sequence);
        if (!qeSeq) return JSON.stringify({ success: false, error: "Could not address sequence '" + info.sequenceName + "' through the QE API." });
        var qeTrack = qeSeq.getVideoTrackAt(info.trackIndex);
        var qeClip = __findQeClipByDomClip(qeTrack, info.clip);
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
        return JSON.stringify({ success: true, message: "Color correction applied", clipId: ${JSON.stringify(clipId)} });
      } catch (e) {
        return JSON.stringify({ success: false, error: e.toString() });
      }
    `;

  return await ctx.bridge.executeScript(script);
}

async function applyLut(ctx: ToolContext, clipId: string, lutPath: string, _intensity = 100): Promise<any> {
  const script = `
      try {
        app.enableQE();
        var info = __findClip(${JSON.stringify(clipId)});
        if (!info) return JSON.stringify({ success: false, error: "Clip not found" });
        // Addressed by id, not by whatever is on screen. __findClip() searches every
        // sequence in the project, so a clip can be resolved out of one sequence and
        // then, through getActiveSequence(), have the effect applied to whichever
        // clip sits at the same track and index in a different one.
        var qeSeq = __qeSequenceFor(info.sequence);
        if (!qeSeq) return JSON.stringify({ success: false, error: "Could not address sequence '" + info.sequenceName + "' through the QE API." });
        var qeTrack = qeSeq.getVideoTrackAt(info.trackIndex);
        var qeClip = __findQeClipByDomClip(qeTrack, info.clip);
        var effect = qe.project.getVideoEffectByName("Lumetri Color");
        if (!effect) return JSON.stringify({ success: false, error: "Lumetri Color not found" });
        qeClip.addVideoEffect(effect);
        var clip = info.clip;
        var lastComp = clip.components[clip.components.numItems - 1];
        for (var j = 0; j < lastComp.properties.numItems; j++) {
          var p = lastComp.properties[j];
          try {
            if (p.displayName === "Input LUT") p.setValue(${JSON.stringify(lutPath)}, true);
          } catch (e2) {}
        }
        return JSON.stringify({ success: true, message: "LUT applied", clipId: ${JSON.stringify(clipId)}, lutPath: ${JSON.stringify(lutPath)} });
      } catch (e) {
        return JSON.stringify({ success: false, error: e.toString() });
      }
    `;

  return await ctx.bridge.executeScript(script);
}

export async function addKeyframe(ctx: ToolContext, clipId: string, componentName: string, paramName: string, time: number, value: number | number[]): Promise<any> {
  const script = `
      try {
        var info = __findClip(${JSON.stringify(clipId)});
        if (!info) return JSON.stringify({ success: false, error: "Clip not found" });
        var resolved = __resolveClipProperty(info.clip, ${JSON.stringify(componentName)}, ${JSON.stringify(paramName)});
        if (!resolved.ok) return JSON.stringify({ success: false, error: resolved.error, available: resolved.available });
        var param = resolved.property;
        var coerced = __coercePropertyValue(param, ${JSON.stringify(value)}, resolved.axis);
        param.setTimeVarying(true);
        param.addKey(${time});
        param.setValueAtKey(${time}, coerced, true);
        return JSON.stringify({
          success: true,
          message: "Keyframe added",
          componentName: ${JSON.stringify(componentName)},
          paramName: ${JSON.stringify(paramName)},
          resolvedComponent: String(resolved.component.displayName),
          resolvedParam: String(param.displayName),
          time: ${time},
          value: ${JSON.stringify(value)}
        });
      } catch (e) {
        return JSON.stringify({ success: false, error: e.toString() });
      }
    `;
  return await ctx.bridge.executeScript(script);
}

async function removeKeyframe(ctx: ToolContext, clipId: string, componentName: string, paramName: string, time: number): Promise<any> {
  const script = `
      try {
        var info = __findClip(${JSON.stringify(clipId)});
        if (!info) return JSON.stringify({ success: false, error: "Clip not found" });
        var resolved = __resolveClipProperty(info.clip, ${JSON.stringify(componentName)}, ${JSON.stringify(paramName)});
        if (!resolved.ok) return JSON.stringify({ success: false, error: resolved.error, available: resolved.available });
        var param = resolved.property;
        param.removeKey(${time});
        return JSON.stringify({
          success: true,
          message: "Keyframe removed",
          time: ${time}
        });
      } catch (e) {
        return JSON.stringify({ success: false, error: e.toString() });
      }
    `;
  return await ctx.bridge.executeScript(script);
}

async function getKeyframes(ctx: ToolContext, clipId: string, componentName: string, paramName: string): Promise<any> {
  const script = `
      try {
        var info = __findClip(${JSON.stringify(clipId)});
        if (!info) return JSON.stringify({ success: false, error: "Clip not found" });
        var resolved = __resolveClipProperty(info.clip, ${JSON.stringify(componentName)}, ${JSON.stringify(paramName)});
        if (!resolved.ok) return JSON.stringify({ success: false, error: resolved.error, available: resolved.available });
        var param = resolved.property;
        var isTimeVarying = param.isTimeVarying();
        if (!isTimeVarying) {
          return JSON.stringify({
            success: true,
            isTimeVarying: false,
            keyframes: [],
            staticValue: param.getValue()
          });
        }
        var keys = param.getKeys();
        var result = [];
        for (var k = 0; k < keys.length; k++) {
          result.push({
            time: keys[k],
            value: param.getValueAtKey(keys[k])
          });
        }
        return JSON.stringify({
          success: true,
          isTimeVarying: true,
          keyframes: result,
          count: result.length
        });
      } catch (e) {
        return JSON.stringify({ success: false, error: e.toString() });
      }
    `;
  return await ctx.bridge.executeScript(script);
}

async function batchAddTransitions(ctx: ToolContext, sequenceId: string, trackIndex: number, transitionName: string, duration: number): Promise<any> {
  const script = `
      try {
        app.enableQE();
        var sequence = __findSequence(${JSON.stringify(sequenceId)});
        if (!sequence) return JSON.stringify({ success: false, error: "Sequence not found by id: " + ${JSON.stringify(sequenceId)} });
        var track = sequence.videoTracks[${trackIndex}];
        if (!track) return JSON.stringify({ success: false, error: "Track not found at index ${trackIndex}" });
        var clipCount = track.clips.numItems;
        if (clipCount < 2) return JSON.stringify({ success: false, error: "Need at least 2 clips to add transitions, found " + clipCount });
        var qeSeq = __qeSequenceFor(sequence);
        if (!qeSeq) return JSON.stringify({ success: false, error: "Could not address sequence '" + sequence.name + "' through the QE API." });
        var qeTrack = qeSeq.getVideoTrackAt(${trackIndex});
        var transition = __findQeNamed("videoTransition", ${JSON.stringify(transitionName)});
        if (!transition) return JSON.stringify({ success: false, error: "Transition not found: " + ${JSON.stringify(transitionName)} });
        var added = 0;
        var errors = [];
        var fps = 254016000000 / parseInt(sequence.timebase, 10);
        var frames = Math.round(${duration} * fps);
        ${transitionVerificationScript()}
        var beforeXml = __transitionXmlCount(sequence);
        for (var i = 0; i < clipCount; i++) {
          try {
            var domClip = track.clips[i];
            var qeClip = __findQeClipByDomClip(qeTrack, domClip);
            if (!qeClip) {
              errors.push("Clip " + i + ": Could not locate matching QE clip");
              continue;
            }
            var before = __readQeTransitionState(qeClip);
            qeClip.addTransition(transition, true, String(frames), "0", 0.5, false, true);
            var afterClip = __findQeClipByDomClip(qeTrack, domClip);
            var after = __readQeTransitionState(afterClip);
            if (__transitionWasVerified(before, after)) {
              added++;
            } else {
              errors.push("Clip " + i + ": transition call completed but no verified transition change was exposed");
            }
          } catch (e) {
            errors.push("Clip " + i + ": " + e.toString());
          }
        }
        var afterXml = __transitionXmlCount(sequence);
        if (added === 0 && __transitionWasVerifiedByXml(beforeXml, afterXml)) {
          added = afterXml.count - beforeXml.count;
        }
        if (added === 0) {
          return JSON.stringify({
            success: false,
            error: "No transitions were verifiably added",
            transitionsAdded: 0,
            totalClips: clipCount,
            frames: frames,
            errors: errors,
            beforeXml: beforeXml,
            afterXml: afterXml
          });
        }
        return JSON.stringify({
          success: true,
          transitionsAdded: added,
          totalClips: clipCount,
          frames: frames,
          errors: errors,
          beforeXml: beforeXml,
          afterXml: afterXml
        });
      } catch (e) {
        return JSON.stringify({ success: false, error: e.toString() });
      }
    `;
  return await ctx.bridge.executeScript(script);
}
