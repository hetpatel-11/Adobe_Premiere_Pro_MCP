/**
 * Bridge module for communicating with Adobe Premiere Pro
 * 
 * This module handles the communication between the MCP server and Adobe Premiere Pro
 * using various methods including UXP, ExtendScript, and file-based communication.
 */

import { Logger } from '../utils/logger.js';
import { spawn, execFile, type ChildProcess } from 'node:child_process';
import { promisify } from 'node:util';
import { randomUUID } from 'node:crypto';
import { promises as fs } from 'fs';
import { extname, join, posix as pathPosix, win32 as pathWin32 } from 'path';
import { createSecureTempDir, validateFilePath } from '../utils/security.js';
import type { EnsureHostOptions, EnsureHostResult, PremiereProTransport } from './types.js';

const execFileAsync = promisify(execFile);

export const BRIDGE_HEARTBEAT_FILE = 'bridge-heartbeat.json';
export const BRIDGE_PANEL_ABSENT_MS = 1500;
export const BRIDGE_HEARTBEAT_STALE_MS = 2500;
export const HEALTH_CHECK_TIMEOUT_MS = 8000;
export const BRIDGE_PANEL_NOT_RUNNING =
  'MCP Bridge is not running. Open Adobe Premiere Pro. The MCP Bridge panel auto-starts when Premiere opens it. If the panel is missing, choose Window > Extensions > MCP Bridge. Call verify_premiere_connection once rather than retrying other tools.';
export const BRIDGE_NOT_STARTED =
  'MCP Bridge panel is open but the bridge is not started. Click Start Bridge, wait until it says Connected, then retry once.';
export const PREMIERE_LAUNCH_WAIT_MS = 45000;

/**
 * Join Premiere install/launch paths using `process.platform`, not the OS
 * Node's default `path.join` was compiled for. Tests stub `process.platform`
 * to `darwin`/`win32`; on Windows CI the default joiner still uses
 * backslashes, which turned `open -a /Applications/...` into
 * `open -a \\Applications\\...`.
 */
export function joinPremiereHostPath(...segments: string[]): string {
  const joiner = process.platform === 'win32' ? pathWin32.join : pathPosix.join;
  return joiner(...segments);
}


const UNSUPPORTED_MODAL_PRONE_IMPORT_EXTENSIONS = new Set([
  '.ass',
  '.ssa'
]);

const EXTENDSCRIPT_HELPERS = `
function __mcpEscapeString(value) {
  // Built from character codes rather than backslash literals on purpose: this
  // function is written inside a TypeScript template literal, where an escape
  // is consumed once before it ever reaches Premiere.
  var text = String(value);
  var backslash = String.fromCharCode(92);
  var out = '';
  for (var i = 0; i < text.length; i++) {
    var code = text.charCodeAt(i);
    if (code === 34) { out += backslash + '"'; }
    else if (code === 92) { out += backslash + backslash; }
    else if (code === 8) { out += backslash + 'b'; }
    else if (code === 9) { out += backslash + 't'; }
    else if (code === 10) { out += backslash + 'n'; }
    else if (code === 12) { out += backslash + 'f'; }
    else if (code === 13) { out += backslash + 'r'; }
    else if (code < 32 || code === 0x2028 || code === 0x2029) {
      // Everything else below U+0020 has no short form and must go out as a
      // \\uXXXX escape. U+2028 and U+2029 are legal inside a JSON string but
      // are line terminators to a JavaScript parser, so they are escaped too
      // for any consumer that evaluates rather than parses the payload.
      var hex = code.toString(16);
      while (hex.length < 4) { hex = '0' + hex; }
      out += backslash + 'u' + hex;
    }
    else { out += text.charAt(i); }
  }
  return out;
}
// Saved before anything can shadow it. Reading hasOwnProperty off the value being
// serialised lets that value decide which of its own keys are emitted.
var __mcpOwnProperty = Object.prototype.hasOwnProperty;
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
      // Through the saved reference, because an own property named hasOwnProperty
      // shadows the method. A non-function threw and lost the whole response; a
      // function returning false was worse, emitting {} that parses cleanly while
      // every field silently vanished.
      //
      // Switching to the reference would drop data if a host object carried its
      // values on a prototype, so that was measured rather than assumed: across
      // Application, Project, ProjectItem, Sequence, SequenceSettings, Track,
      // TrackCollection, TrackItem and MarkerCollection on 26.0.2 -- 101 enumerable
      // keys -- every one is an own property and none inherited. Keys are kept if
      // the check itself throws: one extra inherited key is recoverable, dropping
      // data is not.
      var isOwn = true;
      try { isOwn = __mcpOwnProperty.call(value, key); } catch (ownError) { isOwn = true; }
      if (!isOwn) continue;
      // Read once, and survive a read that throws. Guarding the ownership check
      // while leaving the read unguarded still lost the whole response to a
      // property that raises on access -- and a DOM object reaches here directly
      // through evaluate_expression. Reading twice also ran any side effect twice.
      var member;
      try { member = value[key]; } catch (readError) { continue; }
      if (typeof member === 'undefined' || typeof member === 'function') continue;
      objectParts.push(__mcpStringify(String(key)) + ':' + __mcpStringify(member));
    }
    return '{' + objectParts.join(',') + '}';
  }
  return 'null';
}
if (typeof JSON === 'undefined') { JSON = {}; }
// This engine has no JSON of its own. Measured on ExtendScript build 80.1060872:
// neither JSON.parse nor JSON.stringify exists, so the object created on the line
// above is fabricated by this prelude, and both directions installed below are the
// only ones the engine will ever have. The parser is further down, after the
// escaper it mirrors.
//
// Mind the wording here: the panel validates the whole script, prelude included,
// against a list of patterns that includes a bare "process" followed by a dot.
// A comment matching one of those makes the panel reject every call.
//
// It replaces one that escaped only backslash, quote, carriage return, line
// feed and tab, passing every other control character through raw. Every tool
// returns its payload through this function, so a single U+0001 in a clip or
// marker name did not corrupt one field -- it made the entire response
// unparseable and the whole call was lost.
//
// Assigned unconditionally rather than behind a typeof guard. On this engine
// the guard can never be false; should a later host ship its own, a measured
// escaper is still preferable to an unmeasured one. That makes the limits below
// the limits, so they are listed in full. This covers what the tools return --
// strings, finite numbers, booleans, null, arrays and plain objects -- and
// differs from a conformant JSON.stringify:
//
//   Date              {} rather than an ISO string, and toJSON() is ignored.
//   circular refs     recurses until the stack gives out; no clean TypeError.
//   boxed primitives  new String/Number/Boolean serialise as objects.
//   undefined, fn     at the top level return "null" rather than undefined.
//   replacer, space   accepted positionally by callers and ignored; output is
//                     never indented.
//
// Add any of those to a tool response and this needs extending first.
JSON.stringify = __mcpStringify;
// Recursive descent, because the engine has no JSON.parse either and the object
// above is fabricated: installing only stringify leaves a JSON that answers
// typeof but has no read direction, so a caller that feature-detects it gets a
// missing-function error instead. add_text_overlay decodes a MOGRT text payload
// that way and could never succeed.
//
// Recursive descent rather than the usual one-liner built on the dynamic code
// evaluator: the panel rejects any script mentioning that function by name and
// would refuse every call. This comment cannot spell it either, which the
// generated-script test enforces. Characters are compared by code rather than by
// literal for the same reason __mcpEscapeString does it -- a backslash written
// here is consumed by the template literal before it reaches the host.
// Two limits, measured rather than assumed. Nesting is bounded by the JavaScript
// call stack: around 6,000 levels before it gives out, against no observed limit
// in a modern engine. And each string is built one character at a time, which is
// linear where the engine has rope strings and quadratic where it does not; both
// are far outside the shape of a tool payload, but a caller feeding this arbitrary
// third-party JSON should know. The host cost of either is unmeasured.
function __mcpParse(text) {
  var source = String(text);
  var at = 0;

  function fail(what) {
    throw new Error('JSON.parse: ' + what + ' at position ' + at);
  }
  function skipWhitespace() {
    while (at < source.length) {
      var code = source.charCodeAt(at);
      if (code === 32 || code === 9 || code === 10 || code === 13) { at++; } else { break; }
    }
  }
  function expect(code) {
    if (source.charCodeAt(at) !== code) fail('expected character ' + code);
    at++;
  }
  function parseString() {
    expect(34);
    var out = '';
    while (at < source.length) {
      var code = source.charCodeAt(at);
      if (code === 34) { at++; return out; }
      if (code === 92) {
        at++;
        var esc = source.charCodeAt(at);
        at++;
        if (esc === 34) { out += String.fromCharCode(34); }
        else if (esc === 92) { out += String.fromCharCode(92); }
        else if (esc === 47) { out += '/'; }
        else if (esc === 98) { out += String.fromCharCode(8); }
        else if (esc === 102) { out += String.fromCharCode(12); }
        else if (esc === 110) { out += String.fromCharCode(10); }
        else if (esc === 114) { out += String.fromCharCode(13); }
        else if (esc === 116) { out += String.fromCharCode(9); }
        else if (esc === 117) {
          var hex = source.substr(at, 4);
          if (hex.length !== 4 || !/^[0-9a-fA-F]{4}$/.test(hex)) fail('bad unicode escape');
          out += String.fromCharCode(parseInt(hex, 16));
          at += 4;
        }
        else fail('bad escape');
        continue;
      }
      // Unescaped control characters are not legal inside a JSON string.
      if (code < 32) fail('unescaped control character');
      out += source.charAt(at);
      at++;
    }
    fail('unterminated string');
  }
  // The escape below is doubled deliberately. A single backslash is consumed by
  // the template literal, and the host then receives a dot that matches any
  // character -- which accepted 012, 000 and 0123 as numbers on a live 26.0.2.
  function parseNumber() {
    var start = at;
    if (source.charCodeAt(at) === 45) at++;
    while (at < source.length && source.charCodeAt(at) >= 48 && source.charCodeAt(at) <= 57) at++;
    if (source.charCodeAt(at) === 46) {
      at++;
      while (at < source.length && source.charCodeAt(at) >= 48 && source.charCodeAt(at) <= 57) at++;
    }
    var exponent = source.charCodeAt(at);
    if (exponent === 101 || exponent === 69) {
      at++;
      var sign = source.charCodeAt(at);
      if (sign === 43 || sign === 45) at++;
      while (at < source.length && source.charCodeAt(at) >= 48 && source.charCodeAt(at) <= 57) at++;
    }
    var literal = source.substring(start, at);
    if (!/^-?(0|[1-9][0-9]*)(\\.[0-9]+)?([eE][-+]?[0-9]+)?$/.test(literal)) fail('bad number');
    return Number(literal);
  }
  function parseWord() {
    if (source.substr(at, 4) === 'true') { at += 4; return true; }
    if (source.substr(at, 5) === 'false') { at += 5; return false; }
    if (source.substr(at, 4) === 'null') { at += 4; return null; }
    fail('unexpected token');
  }
  function parseValue() {
    skipWhitespace();
    var code = source.charCodeAt(at);
    if (code === 34) return parseString();
    if (code === 123) {
      at++;
      var object = {};
      skipWhitespace();
      if (source.charCodeAt(at) === 125) { at++; return object; }
      for (;;) {
        skipWhitespace();
        var key = parseString();
        skipWhitespace();
        expect(58);
        var member = parseValue();
        if (key === '__proto__') {
          // Measured on 26.0.2: this engine implements the __proto__ setter, so
          // plain assignment grafts the payload onto the prototype instead of
          // adding a key -- a value carrying {"__proto__":{"mTextString":"X"}}
          // then reads back X from a field nobody set, and {"__proto__":null}
          // yields an object whose String() throws.
          //
          // Object.defineProperty does not exist here either, so the key cannot be
          // created as an ordinary property. It is dropped instead. That differs
          // from a conformant parser, which defines an own property, and the
          // difference is deliberate: losing one key is recoverable, silent field
          // injection is not. Where defineProperty does exist the conformant
          // behaviour is used.
          if (typeof Object.defineProperty === 'function') {
            try {
              Object.defineProperty(object, key, {
                value: member, enumerable: true, writable: true, configurable: true
              });
            } catch (defineError) { /* left out rather than assigned */ }
          }
        } else {
          object[key] = member;
        }
        skipWhitespace();
        if (source.charCodeAt(at) === 44) { at++; continue; }
        expect(125);
        return object;
      }
    }
    if (code === 91) {
      at++;
      var array = [];
      skipWhitespace();
      if (source.charCodeAt(at) === 93) { at++; return array; }
      for (;;) {
        array.push(parseValue());
        skipWhitespace();
        if (source.charCodeAt(at) === 44) { at++; continue; }
        expect(93);
        return array;
      }
    }
    if (code === 45 || (code >= 48 && code <= 57)) return parseNumber();
    return parseWord();
  }

  var result = parseValue();
  skipWhitespace();
  if (at < source.length) fail('unexpected trailing content');
  return result;
}
JSON.parse = __mcpParse;
function __findSequence(id) {
  if (!app.project || !app.project.sequences || id == null || id === "") return null;
  var wanted = String(id);
  var nameHits = [];
  for (var i = 0; i < app.project.sequences.numSequences; i++) {
    var seq = app.project.sequences[i];
    if (String(seq.sequenceID) === wanted || __idsMatch(seq.sequenceID, wanted)) return seq;
    try {
      if (seq.projectItem && (__idsMatch(seq.projectItem.nodeId, wanted) || seq.projectItem.treePath === wanted)) return seq;
    } catch (ePI) {}
    if (seq.name === wanted) nameHits.push(seq);
  }
  if (nameHits.length) return nameHits[0];
  var item = __findProjectItem(wanted);
  if (item) {
    for (var j = 0; j < app.project.sequences.numSequences; j++) {
      var s2 = app.project.sequences[j];
      try {
        if (s2.projectItem === item) return s2;
        if (s2.projectItem && __idsMatch(s2.projectItem.nodeId, item.nodeId)) return s2;
      } catch (e2) {}
      if (s2.name === item.name) return s2;
    }
  }
  return null;
}
function __qeSequenceLookup(seq) {
  if (!seq) return null;
  var count = 0;
  try { count = qe.project.numSequences; } catch (eCount) { return null; }
  for (var qi = 0; qi < count; qi++) {
    // Each index is guarded separately: qe.project.numSequences can report more
    // sequences than getSequenceAt() will actually return, and a throw at one
    // index must not abort the scan before the target index is reached.
    try {
      var candidate = qe.project.getSequenceAt(qi);
      if (candidate && String(candidate.guid) === String(seq.sequenceID)) return candidate;
    } catch (eAt) {}
  }
  // getSequenceAt() does not expose every sequence: one created by
  // duplicate_sequence and never opened in a timeline is invisible to it, even
  // while it is the active sequence. getActiveSequence() still returns a
  // working handle in that case — verified against 26.0.2, guid and all — so
  // fall back to it, but only once the guid confirms it is the sequence that
  // was asked for. Addressing the wrong one is the bug this helper exists to
  // prevent.
  try {
    var activeCandidate = qe.project.getActiveSequence();
    if (activeCandidate && String(activeCandidate.guid) === String(seq.sequenceID)) return activeCandidate;
  } catch (eActive) {}
  return null;
}
function __activateSequenceForQE(seq) {
  if (!seq) return;
  // Premiere 26: Sequence.openInTimeline is missing, and getSequenceAt throws
  // "Unknown error exception" for every index. QE can still address a sequence
  // after it is the active timeline. openSequence(id) and assigning
  // activeSequence are the APIs that actually work.
  try {
    if (typeof app.project.openSequence === "function") app.project.openSequence(seq.sequenceID);
  } catch (eOpen) {}
  try { app.project.activeSequence = seq; } catch (eSet) {}
  try { if (seq.openInTimeline) seq.openInTimeline(); } catch (eTL) {}
  try { if (typeof $ !== "undefined" && $.sleep) $.sleep(250); } catch (eSleep) {}
}
function __qeSequenceFor(seq) {
  if (!seq) return null;
  try { app.enableQE(); } catch (eEnable) { return null; }
  var found = __qeSequenceLookup(seq);
  if (found) return found;
  __activateSequenceForQE(seq);
  try { app.enableQE(); } catch (eEnable2) {}
  return __qeSequenceLookup(seq);
}
function __findQeClipByDomClip(qeTrack, domClip) {
  // QE track items are not the DOM clip list: they include gaps and
  // transitions, so the DOM clip index addresses a different item as soon as
  // anything precedes the target. Verified against 26.0.2 — a track holding
  // three clips with one gap reported five QE items, and color_correct on DOM
  // clip 2 landed on the gap at QE index 2 and reported success having done
  // nothing. Match on start time instead, and skip anything that is not a clip.
  if (!qeTrack || !domClip) return null;
  var targetTicks = null;
  try { targetTicks = String(domClip.start.ticks); } catch (eTarget) {}
  var best = null, bestDelta = null;
  for (var qi = 0; qi < qeTrack.numItems; qi++) {
    var item = qeTrack.getItemAt(qi);
    if (!item) continue;
    var itemType = null;
    try { itemType = String(item.type); } catch (eType) {}
    if (itemType !== "Clip") continue;
    if (targetTicks === null) return item;
    var itemTicks = null;
    try { itemTicks = String(item.start.ticks); } catch (eItem) {}
    if (itemTicks === targetTicks) return item;
    if (itemTicks !== null) {
      var delta = Math.abs(parseInt(itemTicks, 10) - parseInt(targetTicks, 10));
      if (best === null || delta < bestDelta) { best = item; bestDelta = delta; }
    }
  }
  return best;
}
function __idsMatch(a, b) {
  if (a == null || b == null) return false;
  var sa = String(a);
  var sb = String(b);
  if (sa === sb) return true;
  if (sa.toLowerCase() === sb.toLowerCase()) return true;
  function numericId(s) {
    if (/^[0-9]+$/.test(s)) return parseInt(s, 10);
    if (/^[0-9a-fA-F]+$/.test(s) && (/[a-fA-F]/.test(s) || s.charAt(0) === "0")) return parseInt(s, 16);
    return NaN;
  }
  var na = numericId(sa);
  var nb = numericId(sb);
  return !isNaN(na) && !isNaN(nb) && na === nb;
}
function __normalizeSpeedRatio(speed) {
  var n = Number(speed);
  if (!isFinite(n) || n <= 0) return null;
  if (n > 10) n = n / 100;
  return n;
}
function __setClipSpeed(qeClip, domClip, ratio, reverse, maintainPitch, ripple) {
  // QE setSpeed is five arguments: (multiplier, durationTicksString, reverse, pitch, ripple).
  // Two-arg (percent, boolean) throws "Not Enough Parameters" or "Illegal Parameter type".
  // Read ticks from the regular DOM — qeClip.duration is a timecode string, Number() of it is NaN.
  if (!qeClip || typeof qeClip.setSpeed !== "function") {
    throw new Error("QE clip setSpeed API unavailable");
  }
  var origTicks = 0;
  try { origTicks = Number(domClip.duration.ticks); } catch (eTicks) {}
  var targetTicks = (origTicks > 0 && ratio > 0) ? String(Math.round(origTicks / ratio)) : "";
  var rev = Boolean(reverse);
  var pitch = Boolean(maintainPitch);
  var rip = Boolean(ripple);
  try {
    return qeClip.setSpeed(ratio, targetTicks, rev, pitch, rip);
  } catch (ePrimary) {
    try {
      return qeClip.setSpeed(ratio, "", rev, pitch, rip);
    } catch (eEmpty) {
      throw ePrimary;
    }
  }
}
function __findClipInSequence(seq, nodeId) {
  if (!seq) return null;
  for (var t = 0; t < seq.videoTracks.numTracks; t++) {
    var track = seq.videoTracks[t];
    for (var c = 0; c < track.clips.numItems; c++) {
      if (__idsMatch(track.clips[c].nodeId, nodeId))
        return { clip: track.clips[c], track: track, trackIndex: t, clipIndex: c, trackType: 'video', sequence: seq, sequenceId: seq.sequenceID, sequenceName: seq.name };
    }
  }
  for (var t = 0; t < seq.audioTracks.numTracks; t++) {
    var track = seq.audioTracks[t];
    for (var c = 0; c < track.clips.numItems; c++) {
      if (__idsMatch(track.clips[c].nodeId, nodeId))
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
  if (!app.project || !app.project.rootItem || nodeId == null || nodeId === "") return null;
  function matches(item) {
    return __idsMatch(item.nodeId, nodeId) || item.name === nodeId || item.treePath === nodeId;
  }
  function walk(item) {
    if (matches(item)) return item;
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
function __resolveProjectItem(id) {
  var item = __findProjectItem(id);
  if (item) return item;
  var clipInfo = __findClip(id);
  if (clipInfo && clipInfo.clip && clipInfo.clip.projectItem) return clipInfo.clip.projectItem;
  return null;
}
function __foldName(s) {
  s = String(s || "").toLowerCase();
  var from = "àáâãäåèéêëìíîïòóôõöùúûüýÿñçß";
  var to = "aaaaaaeeeeiiiiooooouuuuyyncs";
  var out = "";
  for (var i = 0; i < s.length; i++) {
    var ch = s.charAt(i);
    var idx = from.indexOf(ch);
    out += idx >= 0 ? to.charAt(idx) : ch;
  }
  return out.split(" ").join("").split("_").join("").split("-").join("").split("/").join("");
}
function __canonicalName(s) {
  var n = __foldName(s);
  var aliases = {
    motion: "motion", movimento: "motion", mouvement: "motion", bewegung: "motion", movimiento: "motion",
    opacity: "opacity", opacite: "opacity", opazitat: "opacity", opacidad: "opacity", opacita: "opacity",
    volume: "volume", volumen: "volume", lautstarke: "volume",
    scale: "scale", escala: "scale", echelle: "scale", skalierung: "scale", scala: "scale",
    uniformscale: "scale", scalewidth: "scale", scaleheight: "scale",
    position: "position", posicion: "position", posizione: "position", positionx: "position", positiony: "position",
    posx: "position", posy: "position",
    rotation: "rotation", rotacion: "rotation", rotazione: "rotation", drehung: "rotation",
    level: "level", nivel: "level", pegel: "level", niveau: "level", livello: "level",
    gaussianblur: "gaussianblur", flougaussien: "gaussianblur", gausscherweichzeichner: "gaussianblur",
    desenfocadogaussiano: "gaussianblur",
    crop: "crop", recortar: "crop", recadrage: "crop", beschneiden: "crop",
    lumetricolor: "lumetricolor",
    exposure: "exposure", exposition: "exposure", belichtung: "exposure", esposizione: "exposure",
    contrast: "contrast", contraste: "contrast", kontrast: "contrast", contrasto: "contrast",
    saturation: "saturation", saturacion: "saturation", sattigung: "saturation", saturazione: "saturation",
    temperature: "temperature", temperatura: "temperature", temperatur: "temperature",
    tint: "tint", tinta: "tint",
    highlights: "highlights", altasluces: "highlights", hauteslumieres: "highlights",
    shadows: "shadows", sombras: "shadows", ombres: "shadows",
    crossdissolve: "crossdissolve", disolucioncruzada: "crossdissolve", fonduenchaine: "crossdissolve",
    uberblendung: "crossdissolve", dissolvenzacruise: "crossdissolve"
  };
  return aliases[n] || n;
}
function __namesMatch(a, b) {
  if (a == null || b == null) return false;
  if (String(a) === String(b)) return true;
  return __canonicalName(a) === __canonicalName(b);
}
function __resolveClipProperty(clip, componentName, paramName) {
  if (!clip || !clip.components) {
    return { ok: false, error: "Clip has no components", available: [] };
  }
  var wantComp = __canonicalName(componentName);
  var wantParam = __canonicalName(paramName);
  var rawParam = __foldName(paramName);
  var axis = null;
  if (rawParam === "positionx" || rawParam === "posx") axis = "x";
  if (rawParam === "positiony" || rawParam === "posy") axis = "y";
  var searchComps = [wantComp];
  if (wantParam === "opacity") searchComps.push("opacity");
  if (wantParam === "level") searchComps.push("volume");
  var available = [];
  var matchedComp = null;
  var matchedParam = null;
  for (var i = 0; i < clip.components.numItems; i++) {
    var comp = clip.components[i];
    var cName = String(comp.displayName);
    var cMatch = "";
    try { cMatch = String(comp.matchName || ""); } catch (eM) {}
    var props = [];
    for (var j = 0; j < comp.properties.numItems; j++) {
      props.push(String(comp.properties[j].displayName));
    }
    available.push({ component: cName, matchName: cMatch, properties: props });
    var compHits = false;
    for (var sc = 0; sc < searchComps.length; sc++) {
      if (__canonicalName(cName) === searchComps[sc] || __canonicalName(cMatch) === searchComps[sc]) {
        compHits = true;
      }
    }
    if (!compHits) continue;
    if (!matchedComp) matchedComp = comp;
    for (var k = 0; k < comp.properties.numItems; k++) {
      var p = comp.properties[k];
      if (__canonicalName(p.displayName) === wantParam) {
        matchedParam = p;
        break;
      }
    }
    if (matchedParam) break;
  }
  if (!matchedParam) {
    return {
      ok: false,
      error: "Parameter " + paramName + " not found in component " + componentName,
      available: available
    };
  }
  return { ok: true, component: matchedComp, property: matchedParam, axis: axis, available: available };
}
function __coercePropertyValue(property, value, axis) {
  var current = null;
  try { current = property.getValue(); } catch (eGet) {}
  var currentIsArray = Object.prototype.toString.call(current) === "[object Array]";
  var valueIsArray = Object.prototype.toString.call(value) === "[object Array]";
  if (axis && currentIsArray) {
    var next = [];
    for (var i = 0; i < current.length; i++) next[i] = current[i];
    if (axis === "x") next[0] = valueIsArray ? value[0] : value;
    if (axis === "y") next[1] = valueIsArray ? value[value.length > 1 ? 1 : 0] : value;
    return next;
  }
  if (currentIsArray && !valueIsArray && typeof value === "number") {
    if (current.length >= 2) return [value, value];
    return [value];
  }
  if (!currentIsArray && valueIsArray) return value[0];
  return value;
}
function __secondsToTimecode(seconds, fps) {
  fps = Number(fps);
  if (!isFinite(fps) || fps <= 0) fps = 30;
  var frameRate = Math.round(fps);
  var totalFrames = Math.round(Number(seconds) * fps);
  if (!isFinite(totalFrames) || totalFrames < 0) totalFrames = 0;
  var f = totalFrames % frameRate;
  var totalSeconds = Math.floor(totalFrames / frameRate);
  var s = totalSeconds % 60;
  var totalMinutes = Math.floor(totalSeconds / 60);
  var m = totalMinutes % 60;
  var h = Math.floor(totalMinutes / 60);
  function pad(n) { return (n < 10 ? "0" : "") + String(n); }
  return pad(h) + ":" + pad(m) + ":" + pad(s) + ":" + pad(f);
}
var __TICKS_PER_SECOND = 254016000000;
function __secondsToTicks(seconds) {
  return String(Math.round(Number(seconds || 0) * __TICKS_PER_SECOND));
}
function __ticksToSeconds(ticks) {
  if (ticks === undefined || ticks === null || ticks === "") return 0;
  if (typeof ticks === "object") {
    try {
      if (typeof ticks.seconds === "number" && isFinite(ticks.seconds)) return ticks.seconds;
    } catch (eSeconds) {}
    try {
      if (ticks.ticks !== undefined && ticks.ticks !== null) return __ticksToSeconds(ticks.ticks);
    } catch (eTicks) {}
    return 0;
  }
  if (typeof ticks === "number") {
    if (!isFinite(ticks)) return 0;
    return Math.abs(ticks) >= 1000000 ? ticks / __TICKS_PER_SECOND : ticks;
  }
  var parsed = parseInt(String(ticks), 10);
  if (!isFinite(parsed)) return 0;
  return Math.abs(parsed) >= 1000000 ? parsed / __TICKS_PER_SECOND : parsed;
}
function __coerceProjectItemId(value) {
  if (value == null) return "";
  if (typeof value === "object") {
    return String(value.projectItemId || value.nodeId || value.id || value.clipId || value.itemId || "");
  }
  return String(value);
}
function __expandIdList(value) {
  var out = [];
  function pushId(id) {
    if (id == null) return;
    var s = String(id).replace(/^\s+|\s+$/g, "");
    if (!s) return;
    for (var i = 0; i < out.length; i++) if (out[i] === s) return;
    out.push(s);
  }
  function looksLikeId(text) {
    return /^[0-9a-fA-F-]+$/.test(text);
  }
  function walk(v) {
    if (v == null || v === "") return;
    if (typeof v === "string") {
      var s = v.replace(/^\s+|\s+$/g, "");
      if (!s) return;
      if ((s.charAt(0) === "[" && s.charAt(s.length - 1) === "]") || (s.charAt(0) === "{" && s.charAt(s.length - 1) === "}")) {
        try { walk(__mcpParse(s)); return; } catch (eParse) {}
      }
      if (s.indexOf(",") >= 0) {
        var parts = s.split(",");
        var allIds = parts.length > 1;
        for (var pi = 0; pi < parts.length && allIds; pi++) {
          var part = parts[pi].replace(/^\s+|\s+$/g, "").replace(/^"+|"+$/g, "");
          if (part && !looksLikeId(part)) allIds = false;
        }
        if (allIds) {
          for (var pj = 0; pj < parts.length; pj++) {
            walk(parts[pj].replace(/^\s+|\s+$/g, "").replace(/^"+|"+$/g, ""));
          }
          return;
        }
      }
      pushId(s);
      return;
    }
    if (typeof v === "object") {
      var isArr = false;
      try { isArr = v instanceof Array; } catch (eArr) {}
      if (!isArr) {
        try { isArr = typeof v.length === "number" && typeof v.splice === "function"; } catch (eLen) {}
      }
      if (isArr) {
        for (var ai = 0; ai < v.length; ai++) walk(v[ai]);
        return;
      }
      walk(__coerceProjectItemId(v));
    }
  }
  walk(value);
  return out;
}
function __qeSequenceForRetry(seq) {
  var found = __qeSequenceFor(seq);
  if (found) return found;
  __activateSequenceForQE(seq);
  try { app.enableQE(); } catch (eEnable) {}
  found = __qeSequenceLookup(seq);
  if (found) return found;
  try {
    var active = qe.project.getActiveSequence();
    if (!active || !seq) return null;
    if (String(active.guid) === String(seq.sequenceID)) return active;
    if (String(active.name) === String(seq.name)) return active;
  } catch (eActive) {}
  return null;
}
function __findQeNamed(kind, name) {
  var getters = {
    videoEffect: "getVideoEffectByName",
    audioEffect: "getAudioEffectByName",
    videoTransition: "getVideoTransitionByName",
    audioTransition: "getAudioTransitionByName"
  };
  var lists = {
    videoEffect: "getVideoEffectList",
    audioEffect: "getAudioEffectList",
    videoTransition: "getVideoTransitionList",
    audioTransition: "getAudioTransitionList"
  };
  try { app.enableQE(); } catch (eEnable) { return null; }
  if (!qe || !qe.project) return null;
  var getter = getters[kind];
  var listName = lists[kind];
  if (!getter) return null;
  var direct = null;
  try { direct = qe.project[getter](name); } catch (eDirect) {}
  if (direct) return direct;
  var list = [];
  try { list = qe.project[listName]() || []; } catch (eList) {}
  for (var i = 0; i < list.length; i++) {
    if (__namesMatch(list[i], name)) {
      try {
        var found = qe.project[getter](list[i]);
        if (found) return found;
      } catch (eFound) {}
    }
  }
  return null;
}
`;

/** Function names the prelude actually defines. Tests must derive the host-global allowlist from this, not a parallel handwritten list. */
export function listPreludeHelperNames(source = EXTENDSCRIPT_HELPERS): string[] {
  const names: string[] = [];
  const re = /^function (__[A-Za-z0-9]+)\s*\(/gm;
  let match: RegExpExecArray | null;
  while ((match = re.exec(source))) {
    const name = match[1];
    if (name) names.push(name);
  }
  return names;
}

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
  private premiereInstallPath: string | null = null;
  private premiereLaunchPath: string | null = null;

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
      ? [joinPremiereHostPath(process.env['ProgramFiles'] || 'C:\\Program Files', 'Adobe')]
      : [joinPremiereHostPath('/Applications')];

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
        const installPath = joinPremiereHostPath(dir, candidate);
        try {
          await fs.access(installPath);
          const launchPath = await this.findPremiereLaunchPath(installPath);
          this.premiereInstallPath = installPath;
          if (launchPath) this.premiereLaunchPath = launchPath;
          this.logger.info(`Found Adobe Premiere Pro at: ${installPath}`);
          return;
        } catch {
          // Continue checking other candidates
        }
      }
    }

    this.logger.warn('Adobe Premiere Pro installation not found in common paths');
  }

  private async findPremiereLaunchPath(installPath: string): Promise<string | null> {
    if (process.platform === 'darwin') {
      try {
        const listing = await fs.readdir(installPath);
        const app = listing.find((entry) => entry.endsWith('.app'));
        if (app) return joinPremiereHostPath(installPath, app);
      } catch {
        return installPath;
      }
      return installPath;
    }
    if (process.platform === 'win32') {
      const exe = joinPremiereHostPath(installPath, 'Adobe Premiere Pro.exe');
      try {
        await fs.access(exe);
        return exe;
      } catch {
        return null;
      }
    }
    return null;
  }

  async ensureHost(options: EnsureHostOptions = {}): Promise<EnsureHostResult> {
    const launchIfNeeded = options.launchIfNeeded !== false;
    const waitMs = options.waitMs ?? PREMIERE_LAUNCH_WAIT_MS;
    const tool = 'verify_premiere_connection';

    if (!this.isInitialized) {
      await this.initialize();
    }

    const beat = await this.readHeartbeat();
    if (beat?.started) {
      return { ready: true, success: true, status: 'connected' };
    }
    if (beat && !beat.started) {
      return {
        ready: false,
        success: false,
        status: 'bridge_not_started',
        retry: false,
        userActionRequired: true,
        agentAction: 'verify_premiere_connection',
        nextStep: BRIDGE_NOT_STARTED,
        error: BRIDGE_NOT_STARTED,
        tool,
      };
    }

    const running = await this.isPremiereProcessRunning();
    let launched = false;
    if (!running && launchIfNeeded && this.premiereLaunchPath) {
      launched = this.launchPremiere();
    }

    if (!running && !launched) {
      const nextStep = this.premiereInstallPath
        ? 'Adobe Premiere Pro is installed but could not be launched from this environment. Open Premiere yourself. The MCP Bridge panel auto-starts. Then run verify_premiere_connection once.'
        : 'Adobe Premiere Pro is not installed in the usual location, so this server cannot launch it. Open Premiere, choose Window > Extensions > MCP Bridge if the panel does not appear, and run verify_premiere_connection once.';
      return {
        ready: false,
        success: false,
        status: 'premiere_not_running',
        retry: false,
        userActionRequired: true,
        agentAction: 'tell_user',
        nextStep,
        error: nextStep,
        tool,
        ...(this.premiereInstallPath ? { installPath: this.premiereInstallPath } : {}),
      };
    }

    const connected = await this.waitForStartedHeartbeat(waitMs);
    if (connected) {
      return {
        ready: true,
        success: true,
        status: 'connected',
        launched,
        premiereRunning: true,
        ...(this.premiereInstallPath ? { installPath: this.premiereInstallPath } : {}),
      };
    }

    const nextStep = launched
      ? 'Premiere was launched but the MCP Bridge panel did not connect in time. When Premiere finishes opening, confirm Window > Extensions > MCP Bridge is visible, then run verify_premiere_connection once. Do not retry other tools yet.'
      : BRIDGE_PANEL_NOT_RUNNING;
    return {
      ready: false,
      success: false,
      status: 'bridge_unavailable',
      launched,
      premiereRunning: true,
      retry: false,
      userActionRequired: true,
      agentAction: 'tell_user',
      nextStep,
      error: nextStep,
      tool,
      ...(this.premiereInstallPath ? { installPath: this.premiereInstallPath } : {}),
    };
  }

  private async isPremiereProcessRunning(): Promise<boolean> {
    try {
      if (process.platform === 'darwin') {
        await execFileAsync('pgrep', ['-f', 'Adobe Premiere Pro'], { timeout: 3000 });
        return true;
      }
      if (process.platform === 'win32') {
        const { stdout } = await execFileAsync(
          'tasklist',
          ['/FI', 'IMAGENAME eq Adobe Premiere Pro.exe'],
          { timeout: 5000 },
        );
        return /Adobe Premiere Pro\.exe/i.test(stdout);
      }
    } catch {
      return false;
    }
    return false;
  }

  private launchPremiere(): boolean {
    if (!this.premiereLaunchPath) return false;
    try {
      const child =
        process.platform === 'darwin'
          ? spawn('open', ['-a', this.premiereLaunchPath], { detached: true, stdio: 'ignore' })
          : spawn(this.premiereLaunchPath, [], { detached: true, stdio: 'ignore', windowsHide: false });
      child.unref();
      this.logger.info(`Launched Adobe Premiere Pro from ${this.premiereLaunchPath}`);
      return true;
    } catch (error) {
      this.logger.warn(`Failed to launch Adobe Premiere Pro: ${error instanceof Error ? error.message : String(error)}`);
      return false;
    }
  }

  private async waitForStartedHeartbeat(waitMs: number): Promise<boolean> {
    const deadline = Date.now() + waitMs;
    while (Date.now() < deadline) {
      const beat = await this.readHeartbeat();
      if (beat?.started) return true;
      await new Promise((resolve) => setTimeout(resolve, 500));
    }
    return false;
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

  /**
   * Repairs the two characters that survive JSON.stringify but not the trip
   * into Premiere. Both were reproduced against a live 26.0.2 host.
   *
   * U+2028 and U+2029 are legal unescaped inside a JSON string, so
   * JSON.stringify leaves them raw — but they are line terminators to a
   * JavaScript parser, so a marker named with one produced a generated script
   * with a string literal split across two lines, and the whole call died as
   * "ExtendScript execution failed via CEP evalScript()". Re-escaping them is
   * safe here because everything this server generates is otherwise ASCII, so
   * the only place either can appear is inside a string literal.
   */
  private static repairScriptLineTerminators(script: string): string {
    return script
      .replace(/\u2028/g, '\\u2028')
      .replace(/\u2029/g, '\\u2029');
  }

  /**
   * A NUL truncates the script at that byte on the way through evalScript, so
   * the host silently receives a prefix of what was sent — a marker named
   * "p\0q" was created as "p". Truncated input is worse than a rejected call,
   * so refuse it and say which argument carried it.
   */
  private static assertNoNulByte(script: string): void {
    const index = script.indexOf('\u0000');
    if (index === -1) return;

    const context = script.slice(Math.max(0, index - 40), index).replace(/\s+/g, ' ');
    throw new Error(
      'Script contains a NUL byte, which Premiere truncates at rather than ' +
      'rejecting, silently discarding everything after it. Remove the NUL ' +
      `from the offending argument. Context before it: ...${context}`,
    );
  }

  private buildExecutableScript(script: string, callerAuthored = false): string {
    PremiereProBridge.assertNoNulByte(script);

    // The line-terminator repair is only safe on scripts this server generated, where
    // everything outside a string literal is ASCII and a U+2028 can therefore only be
    // caller data inside a string. A script handed to execute_extendscript breaks that
    // assumption: rewriting it blindly turned a U+2028 the caller used as a line break
    // into the literal characters \u2028, producing a syntax error on a script that
    // previously ran. Caller-authored source is passed through untouched.
    const safeScript = callerAuthored
      ? script
      : PremiereProBridge.repairScriptLineTerminators(script);

    if (this.isSelfInvokingScript(safeScript)) {
      return EXTENDSCRIPT_HELPERS + safeScript.trim();
    }

    // Wrap script bodies so top-level "return ..." remains valid in ExtendScript.
    return EXTENDSCRIPT_HELPERS + '(function(){\n' + safeScript + '\n})();';
  }

  async executeScript(script: string, timeoutMs?: number, callerAuthored = false): Promise<any> {
    if (!this.isInitialized) {
      throw new Error('Bridge not initialized. Call initialize() first.');
    }

    const commandId = randomUUID();
    const commandFile = join(this.tempDir, `command-${commandId}.json`);
    const responseFile = join(this.tempDir, `response-${commandId}.json`);
    // Declared out here so the finally below can remove it: if rename() fails the
    // scratch file is still on disk, and nothing else ever matches that name.
    const commandStaging = join(this.tempDir, `.tmp-${commandId}.json`);

    try {
      const fullScript = this.buildExecutableScript(script, callerAuthored);

      // Write command to file. Include timeoutMs so the CEP/UXP panel can extend its own
      // execution watchdog to match — otherwise the panel's default (45s) kills long batch
      // scripts well before the server's own timeout elapses.
      //
      // Written to a scratch name and renamed into place, because the panel polls this
      // directory and picks up anything matching command-*.json the moment it appears. A
      // plain write publishes the filename before the content is complete, so the panel
      // can read a truncated command, fail to parse it, and — since its parse failure path
      // writes an error response and deletes the command — turn a transient race into a
      // permanent spurious failure with no retry. rename() within one directory is atomic,
      // so the file becomes visible only once it is whole.
      //
      // The scratch name must not itself look like a command to the panel, which matches on
      // a "command-" prefix; a leading dot keeps it out of that test.
      await fs.writeFile(commandStaging, JSON.stringify({
        id: commandId,
        script: fullScript,
        timeoutMs: timeoutMs,
        timestamp: new Date().toISOString()
      }));
      await fs.rename(commandStaging, commandFile);

      // Wait for response (in a real implementation, this would be handled by the UXP plugin).
      // Batch operations pass a larger timeout because a single round-trip does the work of
      // dozens of individual calls inside one ExtendScript pass.
      return await this.waitForResponse(responseFile, timeoutMs);
    } catch (error) {
      this.logger.error(`Failed to execute script: ${error}`);
      throw error;
    } finally {
      // Cleanup has to run on the failure path too. Previously it sat after the await, so a
      // timeout skipped it entirely and left the command file behind for the panel to pick
      // up and execute long after the caller had given up on it.
      //
      // One case this does not close: when the panel is merely slow, the response file is
      // written after this has already run, so it stays until the directory is cleaned. The
      // command file is the one that matters here, because a stale command still executes.
      await fs.unlink(commandStaging).catch(() => {});
      await fs.unlink(commandFile).catch(() => {});
      await fs.unlink(responseFile).catch(() => {});
    }
  }

  private async readHeartbeat(): Promise<{ t: number; started: boolean } | null> {
    try {
      const raw = await fs.readFile(join(this.tempDir, BRIDGE_HEARTBEAT_FILE), 'utf8');
      const parsed = JSON.parse(raw) as { t?: unknown; started?: unknown };
      if (typeof parsed?.t !== 'number' || !Number.isFinite(parsed.t)) return null;
      if (Date.now() - parsed.t > BRIDGE_HEARTBEAT_STALE_MS) return null;
      return { t: parsed.t, started: parsed.started === true };
    } catch {
      return null;
    }
  }

  private async waitForResponse(responseFile: string, timeout = 60000): Promise<any> {
    const startTime = Date.now();
    // A response that exists but will not parse is a different failure from one that has
    // not arrived, and reporting it as the latter sends the reader to check whether
    // Premiere is running when the real problem is the payload. Allow a few attempts for a
    // torn read — the panel's write is not atomic on every host — then surface the parse
    // error and a sample of what was actually on disk.
    let lastParseError: Error | null = null;
    let lastRawResponse = '';
    let parseAttempts = 0;

    while (Date.now() - startTime < timeout) {
      let raw: string | undefined;
      try {
        raw = await fs.readFile(responseFile, 'utf8');
      } catch {
        raw = undefined;
      }

      if (raw !== undefined) {
        try {
          const parsed = JSON.parse(raw);
          if (parsed.result !== undefined) return parsed.result;
          return parsed;
        } catch (error) {
          lastParseError = error instanceof Error ? error : new Error(String(error));
          lastRawResponse = raw;
          parseAttempts++;
        }
      }

      // The panel writes bridge-heartbeat.json on every poll. If that file is
      // missing or stale after a couple of seconds, Premiere is not listening —
      // waiting the remaining minute just makes the caller sit on a dead socket.
      // A fresh heartbeat with started:true means the panel has the command and
      // we should wait out the real timeout (evalScript can be slow).
      if (Date.now() - startTime >= BRIDGE_PANEL_ABSENT_MS) {
        const beat = await this.readHeartbeat();
        if (!beat) {
          throw new Error(BRIDGE_PANEL_NOT_RUNNING);
        }
        if (!beat.started) {
          throw new Error(BRIDGE_NOT_STARTED);
        }
      }

      await new Promise(resolve => setTimeout(resolve, 150));
    }

    if (lastParseError) {
      throw new Error(
        `Bridge response never became valid JSON before the ${timeout}ms timeout. Last parse ` +
        `error: ${lastParseError.message}. First 200 characters on disk: ` +
        JSON.stringify(lastRawResponse.slice(0, 200))
      );
    }

    throw new Error(
      'Bridge response timeout. Ensure Premiere Pro is open, MCP Bridge (CEP or UXP) panel is open, ' +
      'Temp Directory is set to ' + this.tempDir + ', and Start Bridge is clicked. Do not retry until the panel says Connected.'
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

  async addToTimeline(sequenceId: string, projectItemId: string, trackIndex: number, time: number, linkAudio: boolean = true, sourceInPoint?: number, sourceOutPoint?: number, insertMode: string = 'overwrite'): Promise<PremiereProClip> {
    const useInsert = insertMode === 'insert';
    const script = `
      try {
        // Both ids are caller-supplied and are embedded in generated ExtendScript.
        // Naive quoting here was a full code-execution hole, not just a bad error
        // message: an id of zz"); return JSON.stringify({PWNED:"..."}); (" closed
        // the call, ran arbitrary script, and returned a forged tool result while
        // the real work never happened.
        var sequence = __findSequence(${JSON.stringify(sequenceId)});
        if (!sequence) {
          return JSON.stringify({ success: false, error: "Sequence not found by id: " + ${JSON.stringify(sequenceId)} });
        }

        var projectItem = __findProjectItem(${JSON.stringify(projectItemId)});
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

        // insertMode was accepted by the tool, echoed back in its response, and then
        // dropped: placement was always an overwrite. A caller asking to insert-and-shift
        // therefore had existing footage destroyed and was told the opposite. Both methods
        // exist on video and audio tracks in 26.0.2, so honour the request — and refuse
        // rather than silently overwriting if this build lacks insertClip, since falling
        // back would be the destructive direction.
        var requestedInsert = ${useInsert ? 'true' : 'false'};
        if (requestedInsert) {
          if (typeof track.insertClip !== "function") {
            return JSON.stringify({
              success: false,
              error: "insertMode 'insert' was requested but this Premiere build exposes no track.insertClip. Refusing rather than overwriting, which would delete existing footage."
            });
          }
          track.insertClip(projectItem, ${time});
        } else {
          track.overwriteClip(projectItem, ${time});
        }

        var placedClip = null;
        for (var i = 0; i < track.clips.numItems; i++) {
          var candidate = track.clips[i];
          if (candidate && candidate.projectItem && candidate.projectItem.nodeId === projectItem.nodeId && Math.abs(candidate.start.seconds - ${time}) < 0.1) {
            placedClip = candidate;
            break;
          }
        }

        // No fallback to track.clips[numItems - 1]. That guessed at the last clip on the
        // track — which is simply whatever was already there when the placement did not
        // happen — and then reported its name, times and id back as though they were the
        // new clip. Worse, its start time drove the linkAudio=false sweep below, so a
        // placement that did nothing could delete a completely unrelated audio clip.
        // If the clip cannot be identified, nothing downstream may act on a guess.
        if (!placedClip) {
          return JSON.stringify({
            success: false,
            error: "Placement could not be confirmed: no clip from this project item appears at " + ${time} + "s on the target track. Nothing was reported back and no linked audio was removed.",
            trackKind: trackKind,
            requestedTime: ${time}
          });
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
          insertMode: ${JSON.stringify(useInsert ? 'insert' : 'overwrite')},
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
            // Same reasoning as the single-call path: never fall back to the last clip on
            // the track. An unconfirmed placement here fed both this result row and the
            // linkAudio=false sweep below, so one no-op could report a pre-existing clip
            // as placed and delete an unrelated audio clip alongside it.
            if (!placedClip) {
              r.error = "Placement could not be confirmed: no clip from this project item appears at " + spec.time + "s on the target track. No linked audio was removed.";
              results.push(r);
              continue;
            }

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
