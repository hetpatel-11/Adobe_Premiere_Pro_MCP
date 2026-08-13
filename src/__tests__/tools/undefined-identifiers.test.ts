/**
 * No generated script may reference an identifier it never declares.
 *
 * Generated ExtendScript is assembled from template literals, so a rename or a
 * search-and-replace across similar methods can leave one site referring to a
 * variable that exists only in its neighbour. Nothing catches that: the
 * TypeScript compiles, the script parses, and the failure appears only when the
 * host runs it — as a ReferenceError on every call to that tool.
 *
 * This walks the emitted script's AST and reports any identifier that is read
 * without being declared, parameterised, or provided by the host.
 */

import { parse } from 'acorn';
import { PremiereProTools } from '../../tools/index.js';

// Provided by the ExtendScript host or by the prelude the bridge prepends.
const HOST_GLOBALS = new Set([
  'app', 'qe', 'JSON', 'Sequence', 'File', 'Folder', 'Time', 'String', 'Number', 'Boolean',
  'Math', 'Date', 'Array', 'Object', 'RegExp', 'Error', 'parseInt', 'parseFloat',
  'isFinite', 'isNaN', 'undefined', 'NaN', 'Infinity', '$', 'XMPMeta', 'ExternalObject',
  '__findSequence', '__findClip', '__findClipInSequence', '__findProjectItem',
  '__samePath', '__ticksToSeconds', '__secondsToTicks', '__mcpStringify',
  '__mcpEscapeString', '__qeSequenceFor', '__findQeClipByDomClip',
]);

/** Every name bound anywhere in the script: vars, functions, params, catch clauses. */
function declaredNames(node: any, into: Set<string>): void {
  if (!node || typeof node !== 'object') return;
  if (Array.isArray(node)) {
    for (const child of node) declaredNames(child, into);
    return;
  }
  if (node.type === 'VariableDeclarator' && node.id?.type === 'Identifier') {
    into.add(node.id.name);
  }
  if (node.type === 'FunctionDeclaration' || node.type === 'FunctionExpression') {
    if (node.id?.type === 'Identifier') into.add(node.id.name);
    for (const param of node.params ?? []) {
      if (param.type === 'Identifier') into.add(param.name);
    }
  }
  if (node.type === 'CatchClause' && node.param?.type === 'Identifier') {
    into.add(node.param.name);
  }
  for (const key of Object.keys(node)) {
    if (key === 'type' || key === 'start' || key === 'end') continue;
    declaredNames(node[key], into);
  }
}

/** Identifiers actually read, ignoring property names and assignment targets. */
function readNames(node: any, into: Set<string>, parent?: any, key?: string): void {
  if (!node || typeof node !== 'object') return;
  if (Array.isArray(node)) {
    for (const child of node) readNames(child, into, parent, key);
    return;
  }
  if (node.type === 'Identifier') {
    const isProperty = parent?.type === 'MemberExpression' && key === 'property' && !parent.computed;
    const isKey = parent?.type === 'Property' && key === 'key';
    if (!isProperty && !isKey) into.add(node.name);
    return;
  }
  for (const k of Object.keys(node)) {
    if (k === 'type' || k === 'start' || k === 'end') continue;
    readNames(node[k], into, node, k);
  }
}

describe('generated scripts declare everything they reference', () => {
  const ARGS: Record<string, unknown> = {
    sequenceId: 'S', clipId: 'C', clipId1: 'A', clipId2: 'B', projectItemId: 'P',
    name: 'N', newName: 'N2', binName: 'B', parentBinName: 'PB', folderPath: '/tmp/f',
    filePath: '/tmp/f.xml', outputPath: '/tmp/o.png', lutPath: '/tmp/l.cube',
    presetPath: '/tmp/p.epr', transitionName: 'Cross Dissolve', effectName: 'Gain',
    trackType: 'video', trackIndex: 0, time: 1, newTime: 2, splitTime: 1, duration: 1,
    speed: 100, volume: 0, locked: true, visible: true, enabled: true, markerId: 'M',
    settings: {}, adjustments: {}, location: '/tmp', text: 'T', format: 'png',
    // add_transition_to_clip needs this or it is rejected before emitting anything,
    // which silently excluded it from this sweep.
    position: 'end',
  };

  const capture = async (tool: string): Promise<string> => {
    let script = '';
    const tools = new PremiereProTools({
      executeScript: async (s: string) => { script = s; return { success: true }; },
    } as never);
    try {
      await tools.executeTool(tool, ARGS);
    } catch {
      // A schema rejection means no script; skipped below.
    }
    return script;
  };

  it('references no identifier that is never declared', async () => {
    const probe = new PremiereProTools({ executeScript: async () => ({ success: true }) } as never);
    const offenders: string[] = [];
    let checked = 0;

    for (const tool of probe.getAvailableTools()) {
      const script = await capture(tool.name);
      if (!script) continue;
      checked++;

      let ast: unknown;
      try {
        ast = parse(script, { ecmaVersion: 3, allowReturnOutsideFunction: true });
      } catch {
        continue; // parse failures are the syntax suite's business, not this one
      }

      const declared = new Set<string>();
      const read = new Set<string>();
      declaredNames(ast, declared);
      readNames(ast, read);

      for (const name of read) {
        if (declared.has(name) || HOST_GLOBALS.has(name)) continue;
        offenders.push(`${tool.name}: ${name}`);
      }
    }

    // Guard against a silently broken capture making this pass vacuously.
    expect(checked).toBeGreaterThan(40);
    expect(offenders).toEqual([]);
    // Walks every generated script; the default 5s limit is not enough.
  }, 120_000);
});
