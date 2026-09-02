/**
 * Text overlays and Motion Graphics templates.
 *
 * Each entry declares the tool an agent sees and the handler that runs it,
 * so the two cannot drift apart. Handlers reach Premiere through ToolContext.
 */
import { z } from 'zod';
import type { ToolContext, ToolModule } from '../context.js';

export const graphicsTools: ToolModule[] = [
  {
    name: 'add_text_overlay',
    description: 'Adds a text overlay from a Motion Graphics Template. Premiere cannot create titles from text alone — mogrtPath is required (a .mogrt file). Without it this tool fails immediately and must not be retried. Supports up to 4 text fields (text, text2, text3, text4) on the Nth AE.ADBE Text component.',
    inputSchema: z.object({
      text: z.string().describe('Text for the first AE text component in the MOGRT (typically the main title)'),
      text2: z.string().optional().describe('Text for the second AE text component (e.g., subtitle of a lower third)'),
      text3: z.string().optional().describe('Text for the third AE text component (if present)'),
      text4: z.string().optional().describe('Text for the fourth AE text component (if present)'),
      sequenceId: z.string().describe('The sequence to add the text to'),
      trackIndex: z.number().describe('The video track to place the text on (0-indexed; create the track first via add_track if needed)'),
      startTime: z.number().describe('The time in seconds when the text should appear'),
      duration: z.number().describe('How long the text should remain on screen in seconds (best-effort; the MOGRT\'s natural duration may take precedence)'),
      mogrtPath: z.string().optional().describe('Absolute path to a .mogrt template file (required for text overlays)'),
      textPropertyName: z.string().optional().describe('Override: explicit displayName of the property to write into. When set, only `text` is written (text2/text3/text4 are ignored) and the call fails if no property with that displayName exists. Use only when auto-detection picks the wrong field.'),
      rollbackOnTextFailure: z.boolean().optional().describe('If true, remove the imported timeline Graphic when every requested text write fails. Defaults to false; the imported project item may remain in the Project panel.')
    }),
    run: (ctx, args) => addTextOverlay(ctx, args),
  },
  {
    name: 'import_mogrt',
    description: 'Imports a Motion Graphics Template (.mogrt) file into a sequence.',
    inputSchema: z.object({
      sequenceId: z.string().describe('The ID of the sequence'),
      mogrtPath: z.string().describe('The absolute path to the .mogrt file'),
      time: z.number().describe('The time in seconds where the MOGRT should be placed'),
      videoTrackIndex: z.number().optional().describe('The video track index (default: 0)'),
      audioTrackIndex: z.number().optional().describe('The audio track index (default: 0)')
    }),
    run: (ctx, args) => importMogrt(ctx, args.sequenceId, args.mogrtPath, args.time, args.videoTrackIndex, args.audioTrackIndex),
  },
  {
    name: 'import_mogrt_from_library',
    description: 'Imports a Motion Graphics Template from a Creative Cloud Library.',
    inputSchema: z.object({
      sequenceId: z.string().describe('The ID of the sequence'),
      libraryName: z.string().describe('The name of the Creative Cloud Library'),
      mogrtName: z.string().describe('The name of the MOGRT in the library'),
      time: z.number().describe('The time in seconds where the MOGRT should be placed'),
      videoTrackIndex: z.number().optional().describe('The video track index (default: 0)'),
      audioTrackIndex: z.number().optional().describe('The audio track index (default: 0)')
    }),
    run: (ctx, args) => importMogrtFromLibrary(ctx, args.sequenceId, args.libraryName, args.mogrtName, args.time, args.videoTrackIndex, args.audioTrackIndex),
  },
];

interface TextInjectionEntry {
  textIndex?: number;
  ok?: boolean;
  [key: string]: any;
}

export function evaluateTextInjectionResult(result: any): any {
  if (!result || result.success === false) return result;

  const requestedCount = Number(result.textRequestedCount || 0);
  if (requestedCount === 0) {
    return {
      ...result,
      textInjectionStatus: 'not_requested',
      textInjectionSummary: { requested: 0, succeeded: 0, failed: 0 }
    };
  }

  const attempts = Array.isArray(result.textInjectionResults)
    ? result.textInjectionResults.filter(
        (entry: TextInjectionEntry) => typeof entry.textIndex === 'number'
      )
    : [];
  const succeededCount = attempts.filter((entry: TextInjectionEntry) => entry.ok === true).length;
  const failedCount = requestedCount - succeededCount;
  const summary = {
    requested: requestedCount,
    succeeded: succeededCount,
    failed: failedCount
  };

  if (succeededCount === 0) {
    const version = result.premiereVersion || 'unknown';
    const build = result.premiereBuild ? ` (build ${result.premiereBuild})` : '';
    return {
      ...result,
      success: false,
      message: 'MOGRT imported, but requested text was not written',
      error:
        `Text injection failed for all ${requestedCount} requested field(s) in ` +
        `Premiere Pro ${version}${build}.`,
      textInjectionStatus: 'failed',
      textInjectionSummary: summary
    };
  }

  if (succeededCount < requestedCount) {
    return {
      ...result,
      success: true,
      message: 'MOGRT imported; some requested text was written and read back',
      warning: `${failedCount} of ${requestedCount} requested text field(s) could not be written`,
      textInjectionStatus: 'partial',
      textInjectionSummary: summary
    };
  }

  return {
    ...result,
    success: true,
    message: 'MOGRT imported; all requested text was written and read back',
    textInjectionStatus: 'complete',
    textInjectionSummary: summary
  };
}

async function addTextOverlay(ctx: ToolContext, args: any): Promise<any> {
  if (!args.mogrtPath) {
    return {
      success: false,
      retry: false,
      status: 'unsupported',
      errorCode: 'unsupported.mogrt',
      error:
        'add_text_overlay cannot create titles from text alone. Premiere has no title API; it needs a Motion Graphics Template (.mogrt).',
      nextStep:
        'Pass mogrtPath as an absolute path to a .mogrt file (Essential Graphics > Browse, or import_mogrt). Do not retry this call without a template.',
    };
  }
  if (args.mogrtPath) {
    // FIX vs upstream: upstream silently ignored args.text; the MOGRT was imported but
    // its text properties stayed at default placeholders ("Su nombre aquí", etc.)
    // This version:
    //   1. importMGT (existing)
    //   2. After import, get trackItem.getMGTComponent() — the special MGT component
    //      that exposes the parameters defined in the Essential Graphics template
    //   3. Dump those properties for debugging (so callers see what's available)
    //   4. If args.text is provided, attempt to set it by:
    //      a. The first text-typed property whose value JSON-parses to {mTextString: ...}
    //      b. Or by displayName match against args.textPropertyName (optional override)
    //   Premiere stores text values as JSON: '{"mTextString":"...", ...}'
    const textJson = args.text !== undefined ? JSON.stringify(args.text) : 'null';
    // When set, the script restricts the write to the property whose displayName matches
    // (instead of running the auto-detect). text2/text3/text4 are ignored in override mode
    // — the override targets a single field by name.
    const textPropNameJson = args.textPropertyName !== undefined
      ? JSON.stringify(args.textPropertyName)
      : 'null';
    const script = `
        try {
          var sequence = __findSequence(${JSON.stringify(args.sequenceId)});
          if (!sequence) return JSON.stringify({ success: false, error: "Sequence not found" });
          var timeTicks = __secondsToTicks(${args.startTime});
          var trackItem = sequence.importMGT(${JSON.stringify(args.mogrtPath)}, timeTicks, ${args.trackIndex}, 0);
          if (!trackItem) return JSON.stringify({ success: false, error: "Failed to import MOGRT. Ensure the .mogrt file exists." });

          // First, probe ALL plausible MGT-access APIs (so we know what's available)
          var apiProbe = {};
          var premiereVersion = "unknown";
          var premiereBuild = "";
          try {
            if (typeof app.version !== "undefined" && app.version !== null) premiereVersion = String(app.version);
          } catch (eVersion) {}
          try {
            if (typeof app.build !== "undefined" && app.build !== null) premiereBuild = String(app.build);
          } catch (eBuild) {}
          apiProbe.hasGetMGTComponent = (typeof trackItem.getMGTComponent === "function");
          apiProbe.hasGetMGT = (typeof trackItem.getMGT === "function");
          apiProbe.hasGetMogrtComponent = (typeof trackItem.getMogrtComponent === "function");
          apiProbe.hasGetComponentParameters = (typeof trackItem.getComponentParameters === "function");
          // App-level
          apiProbe.appHasMOGRTAPI = (app.project && typeof app.project.openMGT === "function");
          // Try calling getMGTComponent and capture more detail
          if (apiProbe.hasGetMGTComponent) {
            try {
              var mgtTry = trackItem.getMGTComponent();
              apiProbe.getMGTComponent_returned = (mgtTry === null) ? "null" : (typeof mgtTry);
              if (mgtTry) {
                apiProbe.getMGTComponent_displayName = String(mgtTry.displayName || "");
                apiProbe.getMGTComponent_propertyCount = (mgtTry.properties ? mgtTry.properties.numItems : -1);
                // Dump first 3 properties of MGT comp
                var mgtPropsSample = [];
                if (mgtTry.properties) {
                  for (var mp = 0; mp < Math.min(5, mgtTry.properties.numItems); mp++) {
                    var mprop = mgtTry.properties[mp];
                    var mval = null;
                    try { mval = mprop.getValue(); } catch (eMg) { mval = "<getValue threw>"; }
                    mgtPropsSample.push({
                      index: mp,
                      displayName: String(mprop.displayName),
                      valueType: typeof mval,
                      valuePreview: (typeof mval === "string" ? mval.substring(0, 80) : mval)
                    });
                  }
                }
                apiProbe.getMGTComponent_propertiesSample = mgtPropsSample;
              }
            } catch (eMG) {
              apiProbe.getMGTComponent_threw = eMG.toString();
            }
          }
          // Probe trackItem.name (some MOGRT-specific stuff might surface here)
          try { apiProbe.trackItemName = String(trackItem.name); } catch (e) {}
          // Probe sequence-level methods
          try { apiProbe.sequenceHasGetSelection = (typeof sequence.getSelection === "function"); } catch (e) {}

          // Iterate ALL components of the imported trackItem (MOGRT params live as
          // properties on one of its components, not always via getMGTComponent)
          var componentsDump = [];
          var textPropsFound = [];  // {compIndex, propIndex, displayName, currentValue}
          for (var ci = 0; ci < trackItem.components.numItems; ci++) {
            var comp = trackItem.components[ci];
            var compName = String(comp.displayName);
            var compMatch = (comp.matchName !== undefined) ? String(comp.matchName) : "";
            var compProps = [];
            for (var i = 0; i < comp.properties.numItems; i++) {
              var prop = comp.properties[i];
              var dn = String(prop.displayName);
              var val = null;
              try { val = prop.getValue(); } catch (eV) { val = "<getValue threw>"; }
              var truncatedVal = (typeof val === "string" ? val.substring(0, 250) : val);
              compProps.push({ index: i, displayName: dn, value: truncatedVal });
              if (typeof val === "string" && (val.indexOf("mTextString") >= 0 || val.indexOf("textEditValue") >= 0 || val.indexOf("mTextParam") >= 0)) {
                textPropsFound.push({ compIndex: ci, propIndex: i, compDisplayName: compName, propDisplayName: dn, currentValue: val });
              }
            }
            componentsDump.push({ index: ci, displayName: compName, matchName: compMatch, propertyCount: compProps.length, properties: compProps });
          }

          // Set custom text(s). Each "AE.ADBE Text" component in the MOGRT exposes its
          // editable text as property 0 (display name "Texto de origen" / "Source Text").
          // Only one setValue per property — raw_string strategy worked in earlier tests; no
          // JSON wrapping (that broke rendering).
          //
          // Inputs:
          //   args.text  → first text component (e.g., main title in Basic Lower Third)
          //   args.text2 → second text component (e.g., subtitle)
          //   args.text3 → third (if MOGRT has more)
          //   ...
          // Auto-collected from numbered keys.
          var textsByIndex = [];
          if (${textJson} !== null) textsByIndex.push(${textJson});
          ${args.text2 !== undefined ? `textsByIndex.push(${JSON.stringify(args.text2)});` : ''}
          ${args.text3 !== undefined ? `textsByIndex.push(${JSON.stringify(args.text3)});` : ''}
          ${args.text4 !== undefined ? `textsByIndex.push(${JSON.stringify(args.text4)});` : ''}
          var setResults = [];
          function looksLikeTextProperty(displayName, mpVal) {
            var dn = String(displayName || "").toLowerCase();
            if (dn.indexOf("source text") >= 0 || dn.indexOf("texto de origen") >= 0 || dn.indexOf("texte source") >= 0) return true;
            if (dn === "text" || dn === "title" || dn === "subtitle" || dn === "headline") return true;
            if (typeof mpVal === "string" && (
                mpVal.indexOf("mTextString") >= 0 ||
                mpVal.indexOf("textEditValue") >= 0 ||
                mpVal.indexOf("mTextParam") >= 0 ||
                mpVal.indexOf("capPropTextRunCount") >= 0)) return true;
            return false;
          }
          if (textsByIndex.length > 0) {
            // PREFERRED PATH: getMGTComponent() for AE-exported MOGRTs (Adobe-CEP canonical).
            // Properties exposed there are the Essential Graphics parameters and contain
            // FULL JSON values that ARE editable.
            // FALLBACK PATH: iterate trackItem.components for "AE.ADBE Text" — only works for
            // some MOGRTs and tokens are opaque single-char references in Premiere-native MOGRTs.
            var textComps = [];
            var textCompsViaMGT = false;
            var textPropNameOverride = ${textPropNameJson};
            // OVERRIDE PATH: caller named a specific property by displayName.
            // Search both the MGT component and all trackItem components for an exact
            // displayName match, then restrict textComps to that single hit.
            // text2/text3/text4 are ignored in override mode — caller targeted one field.
            if (textPropNameOverride) {
              try {
                var mgtCompO = trackItem.getMGTComponent();
                if (mgtCompO && mgtCompO.properties) {
                  for (var miO = 0; miO < mgtCompO.properties.numItems; miO++) {
                    var mpO = mgtCompO.properties[miO];
                    if (String(mpO.displayName) === textPropNameOverride) {
                      textComps.push({ comp: mgtCompO, compIndex: -1, prop: mpO, propIndex: miO, displayName: String(mpO.displayName) });
                      textCompsViaMGT = true;
                      break;
                    }
                  }
                }
              } catch (eOMG) {}
              if (textComps.length === 0) {
                for (var ciO = 0; ciO < trackItem.components.numItems && textComps.length === 0; ciO++) {
                  var cO = trackItem.components[ciO];
                  for (var piO = 0; piO < cO.properties.numItems; piO++) {
                    var pO = cO.properties[piO];
                    if (String(pO.displayName) === textPropNameOverride) {
                      textComps.push({ comp: cO, compIndex: ciO, prop: pO, propIndex: piO, displayName: String(pO.displayName) });
                      break;
                    }
                  }
                }
              }
              if (textComps.length === 0) {
                return JSON.stringify({
                  success: false,
                  error: "textPropertyName override did not match any property displayName: " + textPropNameOverride,
                  componentCount: componentsDump.length,
                  components: componentsDump
                });
              }
              // In override mode keep only the first text (named-target write).
              textsByIndex = [textsByIndex[0]];
              setResults.push({ _strategy: "textPropertyName_override", overrideName: textPropNameOverride });
            }
            // AUTO-DETECT PATH (only when no override).
            if (textComps.length === 0) {
              try {
                var mgtComp = trackItem.getMGTComponent();
                if (mgtComp && mgtComp.properties) {
                  for (var mi = 0; mi < mgtComp.properties.numItems; mi++) {
                    var mp = mgtComp.properties[mi];
                    var mpVal = null;
                    try { mpVal = mp.getValue(); } catch (eMPv) {}
                    if (looksLikeTextProperty(mp.displayName, mpVal)) {
                      textComps.push({ comp: mgtComp, compIndex: -1, prop: mp, propIndex: mi, displayName: String(mp.displayName) });
                    }
                  }
                  if (textComps.length > 0) textCompsViaMGT = true;
                }
              } catch (eMGTC) {}
              // Fallback to component iteration if MGT didn't yield text params
              if (textComps.length === 0) {
                for (var ci3 = 0; ci3 < trackItem.components.numItems; ci3++) {
                  var c3 = trackItem.components[ci3];
                  var mn = (c3.matchName !== undefined) ? String(c3.matchName) : "";
                  if (mn === "AE.ADBE Text") {
                    textComps.push({ comp: c3, compIndex: ci3, prop: c3.properties[0], propIndex: 0, displayName: "Source Text (legacy)" });
                  } else if (c3.properties) {
                    for (var pi3 = 0; pi3 < c3.properties.numItems; pi3++) {
                      var p3 = c3.properties[pi3];
                      var p3val = null;
                      try { p3val = p3.getValue(); } catch (eP3) {}
                      if (looksLikeTextProperty(p3.displayName, p3val)) {
                        textComps.push({ comp: c3, compIndex: ci3, prop: p3, propIndex: pi3, displayName: String(p3.displayName) });
                      }
                    }
                  }
                }
              }
              if (textComps.length === 0 && textPropsFound.length > 0) {
                for (var tpf = 0; tpf < textPropsFound.length; tpf++) {
                  var hit = textPropsFound[tpf];
                  var hitComp = trackItem.components[hit.compIndex];
                  if (hitComp && hitComp.properties) {
                    textComps.push({
                      comp: hitComp,
                      compIndex: hit.compIndex,
                      prop: hitComp.properties[hit.propIndex],
                      propIndex: hit.propIndex,
                      displayName: hit.propDisplayName
                    });
                  }
                }
              }
              setResults.push({ _strategy: textCompsViaMGT ? "getMGTComponent" : "components_fallback", textCompsFound: textComps.length });
            }
            for (var ti2 = 0; ti2 < textsByIndex.length && ti2 < textComps.length; ti2++) {
              var tc = textComps[ti2];
              var sourceTextProp = tc.prop;
              var newText = String(textsByIndex[ti2]);
              try {
                // Source Text in Premiere/After Effects MOGRTs is stored as:
                //   <4 bytes binary header> + <JSON payload of mTextParam structure>
                // Source: Adobe Community (Kurt_Clark) + Adobe-CEP samples + reproduced
                // independently across multiple Premiere versions (incl. 2026).
                // The agent investigation confirmed this format. Direct setValue("text")
                // stores the value but the renderer cannot parse it → no visual update.
                // Correct mutation: parse JSON (skipping header), patch
                // mTextParam.mStyleSheet.mText, re-prepend header, setValue(...).
                var rawVal = sourceTextProp.getValue();
                var rawValStr = String(rawVal);
                var rawValLen = rawValStr.length;
                var headerBytes = "";
                var jsonStr = "";
                var textObj = null;
                var parseStrategy = "";
                var parseError1 = "";
                var parseError2 = "";
                // Strategy 1: 4-byte header + JSON
                try {
                  headerBytes = rawValStr.substring(0, 4);
                  jsonStr = rawValStr.substring(4);
                  textObj = JSON.parse(jsonStr);
                  parseStrategy = "header4+json";
                } catch (eP1) {
                  parseError1 = eP1.toString();
                  // Strategy 2: pure JSON (AE 14.3+ no header)
                  try {
                    textObj = JSON.parse(rawValStr);
                    headerBytes = "";
                    parseStrategy = "pure_json";
                  } catch (eP2) {
                    parseError2 = eP2.toString();
                    // Strategy 3: scan for the first '{' — some 26.x payloads use a longer binary prefix
                    var brace = rawValStr.indexOf("{");
                    if (brace >= 0) {
                      try {
                        headerBytes = rawValStr.substring(0, brace);
                        textObj = JSON.parse(rawValStr.substring(brace));
                        parseStrategy = "scan_brace+json";
                      } catch (eP3) {
                        textObj = null;
                      }
                    }
                  }
                }
                function textFromObj(obj) {
                  if (!obj) return "";
                  if (obj.mTextParam && obj.mTextParam.mStyleSheet && obj.mTextParam.mStyleSheet.mText !== undefined) return String(obj.mTextParam.mStyleSheet.mText);
                  if (obj.textEditValue !== undefined) return String(obj.textEditValue);
                  if (obj.mTextString !== undefined) return String(obj.mTextString);
                  return "";
                }
                if (!textObj) {
                  var rawOk = false;
                  try {
                    sourceTextProp.setValue(newText, true);
                    var afterRawWrite = "";
                    try { afterRawWrite = String(sourceTextProp.getValue()); } catch (eRW) {}
                    rawOk = afterRawWrite.indexOf(newText) >= 0;
                    setResults.push({
                      textIndex: ti2, compIndex: tc.compIndex, propIndex: tc.propIndex, requestedText: newText,
                      parseStrategy: "raw_string",
                      ok: rawOk,
                      error: rawOk ? undefined : "JSON parse failed and raw setValue did not read back",
                      rawValLength: rawValLen,
                      rawValPreview: rawValStr.substring(0, 50),
                      parseError1: parseError1,
                      parseError2: parseError2
                    });
                  } catch (eRaw) {
                    setResults.push({
                      textIndex: ti2, compIndex: tc.compIndex, propIndex: tc.propIndex, requestedText: newText,
                      ok: false,
                      error: "JSON parse failed: " + eRaw.toString(),
                      rawValLength: rawValLen,
                      rawValPreview: rawValStr.substring(0, 50),
                      parseError1: parseError1,
                      parseError2: parseError2
                    });
                  }
                  continue;
                }
                // Mutate the text in the proper nested path(s)
                var mutated = [];
                if (textObj.mTextParam && textObj.mTextParam.mStyleSheet) {
                  textObj.mTextParam.mStyleSheet.mText = newText;
                  mutated.push("mTextParam.mStyleSheet.mText");
                }
                // AE 14.3+ alternate: textEditValue + fontTextRunLength
                if (textObj.textEditValue !== undefined) {
                  textObj.textEditValue = newText;
                  textObj.fontTextRunLength = [newText.length];
                  mutated.push("textEditValue+fontTextRunLength");
                }
                if (textObj.mTextString !== undefined) {
                  textObj.mTextString = newText;
                  mutated.push("mTextString");
                }
                if (mutated.length === 0) {
                  setResults.push({
                    textIndex: ti2, compIndex: tc.compIndex, propIndex: tc.propIndex, requestedText: newText,
                    ok: false,
                    error: "Parsed JSON but no known text field found",
                    parseStrategy: parseStrategy,
                    jsonKeys: (function(){ var ks=[]; for (var k in textObj) ks.push(k); return ks; })()
                  });
                  continue;
                }
                // Re-encode + write back
                var newRawVal = headerBytes + JSON.stringify(textObj);
                sourceTextProp.setValue(newRawVal, true);
                // Verify
                var afterRaw = "";
                try { afterRaw = String(sourceTextProp.getValue()); } catch (eVA) {}
                var afterParseOk = false;
                var afterText = "";
                try {
                  var afterPayload = headerBytes ? afterRaw.substring(headerBytes.length) : afterRaw;
                  var braceAfter = afterPayload.indexOf("{");
                  if (braceAfter > 0) afterPayload = afterPayload.substring(braceAfter);
                  var afterObj = JSON.parse(afterPayload);
                  afterText = textFromObj(afterObj);
                  afterParseOk = afterText.length > 0;
                } catch (eAP) {
                  if (afterRaw.indexOf(newText) >= 0) afterText = newText;
                }
                setResults.push({
                  textIndex: ti2,
                  compIndex: tc.compIndex,
                  propIndex: tc.propIndex,
                  requestedText: newText,
                  parseStrategy: parseStrategy,
                  fieldsMutated: mutated,
                  rawValLength: rawValLen,
                  newRawValLength: newRawVal.length,
                  readbackParseOk: afterParseOk,
                  readbackText: afterText,
                  ok: (afterText === newText)
                });
              } catch (eS) {
                setResults.push({ textIndex: ti2, compIndex: tc.compIndex, propIndex: tc.propIndex, requestedText: newText, ok: false, error: eS.toString() });
              }
            }
            if (textComps.length === 0) {
              setResults.push({ ok: false, error: "No 'AE.ADBE Text' components found in MOGRT" });
            } else if (textsByIndex.length > textComps.length) {
              setResults.push({ ok: false, warning: "More texts requested (" + textsByIndex.length + ") than text components in MOGRT (" + textComps.length + ")" });
            }
          }

          return JSON.stringify({
            success: true,
            message: "MOGRT imported as text overlay",
            clipId: trackItem.nodeId,
            premiereVersion: premiereVersion,
            premiereBuild: premiereBuild,
            apiProbe: apiProbe,
            componentCount: componentsDump.length,
            components: componentsDump,
            textPropsAutoDetected: textPropsFound,
            textRequestedCount: textsByIndex.length,
            textInjectionResults: setResults
          });
        } catch (e) {
          var failedClipId = null;
          try {
            if (typeof trackItem !== "undefined" && trackItem) failedClipId = trackItem.nodeId;
          } catch (eClipId) {}
          return JSON.stringify({ success: false, error: e.toString(), clipId: failedClipId });
        }
      `;
    const bridgeResult = await ctx.bridge.executeScript(script);
    const evaluatedResult = evaluateTextInjectionResult(bridgeResult);
    if (
      (evaluatedResult?.textInjectionStatus === 'failed' ||
        (evaluatedResult?.success === false && evaluatedResult?.clipId)) &&
      args.rollbackOnTextFailure === true &&
      evaluatedResult.clipId
    ) {
      const rollbackScript = `
          try {
            var info = __findClip(${JSON.stringify(evaluatedResult.clipId)}, ${JSON.stringify(args.sequenceId)});
            if (!info) return JSON.stringify({ success: false, error: "Imported Graphic was not found for rollback" });
            info.clip.remove(false, true);
            return JSON.stringify({
              success: true,
              timelineGraphicRemoved: true,
              note: "The timeline Graphic was removed; the imported project item may remain in the Project panel."
            });
          } catch (e) {
            return JSON.stringify({ success: false, timelineGraphicRemoved: false, error: e.toString() });
          }
        `;
      const rollback = await ctx.bridge.executeScript(rollbackScript);
      const rollbackSucceeded = rollback?.success === true;
      if (rollbackSucceeded) {
        const { clipId: removedClipId, ...failureResult } = evaluatedResult;
        return {
          ...failureResult,
          error: `${evaluatedResult.error} The imported timeline Graphic was removed.`,
          removedClipId,
          rollback
        };
      }
      return {
        ...evaluatedResult,
        error: `${evaluatedResult.error} Rollback of the imported timeline Graphic also failed.`,
        rollback
      };
    }
    if (evaluatedResult?.textInjectionStatus === 'failed') {
      return {
        ...evaluatedResult,
        error: `${evaluatedResult.error} The imported Graphic remains on the timeline.`
      };
    }
    return evaluatedResult;
  }

  return {
    success: false,
    retry: false,
    status: 'unsupported',
    errorCode: 'unsupported.mogrt',
    error:
      'add_text_overlay cannot create titles from text alone. Premiere has no title API; it needs a Motion Graphics Template (.mogrt).',
    nextStep:
      'Pass mogrtPath as an absolute path to a .mogrt file (Essential Graphics > Browse, or import_mogrt). Do not retry this call without a template.',
  };
}

export async function importMogrt(ctx: ToolContext, sequenceId: string, mogrtPath: string, time: number, videoTrackIndex?: number, audioTrackIndex?: number): Promise<any> {
  const vidTrack = videoTrackIndex || 0;
  const audTrack = audioTrackIndex || 0;
  const script = `
      try {
        var seq = __findSequence(${JSON.stringify(sequenceId)});
        if (!seq) return JSON.stringify({ success: false, error: "Sequence not found" });
        var ticks = __secondsToTicks(${time});
        var clip = seq.importMGT(${JSON.stringify(mogrtPath)}, ticks, ${vidTrack}, ${audTrack});
        var clipId = "";
        if (clip && clip.nodeId) clipId = clip.nodeId;
        return JSON.stringify({
          success: true,
          message: "MOGRT imported",
          clipId: clipId
        });
      } catch (e) {
        return JSON.stringify({ success: false, error: e.toString() });
      }
    `;
  return await ctx.bridge.executeScript(script);
}

async function importMogrtFromLibrary(ctx: ToolContext, sequenceId: string, libraryName: string, mogrtName: string, time: number, videoTrackIndex?: number, audioTrackIndex?: number): Promise<any> {
  const vidTrack = videoTrackIndex || 0;
  const audTrack = audioTrackIndex || 0;
  const script = `
      try {
        var seq = __findSequence(${JSON.stringify(sequenceId)});
        if (!seq) return JSON.stringify({ success: false, error: "Sequence not found" });
        var ticks = __secondsToTicks(${time});
        var clip = seq.importMGTFromLibrary(${JSON.stringify(libraryName)}, ${JSON.stringify(mogrtName)}, ticks, ${vidTrack}, ${audTrack});
        var clipId = "";
        if (clip && clip.nodeId) clipId = clip.nodeId;
        return JSON.stringify({
          success: true,
          message: "MOGRT imported from library",
          clipId: clipId
        });
      } catch (e) {
        return JSON.stringify({ success: false, error: e.toString() });
      }
    `;
  return await ctx.bridge.executeScript(script);
}
