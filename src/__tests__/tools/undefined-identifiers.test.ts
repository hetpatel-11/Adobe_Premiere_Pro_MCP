/**
 * No generated script may reference an identifier it never declares.
 *
 * Generated ExtendScript is assembled from template literals, so a rename or a
 * search-and-replace across similar methods can leave one site referring to a
 * variable that exists only in its neighbour. Nothing catches that: the
 * TypeScript compiles, the script parses, and the failure appears only when the
 * host runs it — as a ReferenceError on every call to that tool.
 *
 * Two ways the earlier version of this file missed exactly that:
 *
 *   - It collected every binding anywhere in the script into one flat set, so a
 *     name that exists only as a parameter of a nested function counted as
 *     declared at top level. Referencing `wanted` — a parameter of the nested
 *     `__binByName(parent, wanted)` — from `create_bin`'s body threw
 *     `ReferenceError` at runtime and passed here. Scopes are now tracked, with
 *     `var` hoisting to the enclosing function as ES3 requires.
 *   - It drove every tool from one hand-written `ARGS` object, so a branch
 *     guarded by a key that object lacked was never emitted. `add_marker`'s
 *     `${comment ? ... : ''}` was never in the AST being walked. Arguments now
 *     come from each tool's own schema, optionals included.
 */

import { parse } from 'acorn';
import { PremiereProTools } from '../../tools/index.js';
import { expandedToolNames } from '../../tools/expanded.js';
import { seedArgs, seedRequiredArgs } from '../helpers/schema-args.js';

// Provided by the ExtendScript host or by the prelude the bridge prepends.
const HOST_GLOBALS = new Set([
  'app', 'qe', 'JSON', 'Sequence', 'File', 'Folder', 'Time', 'String', 'Number', 'Boolean',
  'Math', 'Date', 'Array', 'Object', 'RegExp', 'Error', 'parseInt', 'parseFloat',
  'isFinite', 'isNaN', 'undefined', 'NaN', 'Infinity', '$', 'XMPMeta', 'ExternalObject',
  '__findSequence', '__findClip', '__findClipInSequence', '__findProjectItem',
  '__samePath', '__ticksToSeconds', '__secondsToTicks', '__mcpStringify',
  '__mcpEscapeString', '__qeSequenceFor', '__findQeClipByDomClip',
  '__idsMatch', '__normalizeSpeedRatio', '__setClipSpeed',
  '__foldName', '__canonicalName', '__namesMatch', '__resolveClipProperty',
  '__coercePropertyValue', '__resolveProjectItem', '__secondsToTimecode',
  '__qeSequenceForRetry', '__findQeNamed',
]);

type Node = Record<string, any>;

interface Scope { parent: Scope | null; names: Set<string> }

const newScope = (parent: Scope | null): Scope => ({ parent, names: new Set() });

const isFunction = (n: Node): boolean =>
  n.type === 'FunctionDeclaration' || n.type === 'FunctionExpression';

const resolves = (scope: Scope, name: string): boolean => {
  for (let s: Scope | null = scope; s; s = s.parent) if (s.names.has(name)) return true;
  return HOST_GLOBALS.has(name);
};

const children = (node: Node): Node[] => {
  const out: Node[] = [];
  for (const key of Object.keys(node)) {
    if (key === 'type' || key === 'start' || key === 'end') continue;
    const value = node[key];
    if (Array.isArray(value)) {
      for (const v of value) if (v && typeof v === 'object') out.push(v);
    } else if (value && typeof value === 'object') {
      out.push(value);
    }
  }
  return out;
};

/**
 * `var` and function declarations reachable without entering a nested function.
 * ES3 hoists both to the top of the enclosing function, so a use above the
 * declaration is legal and must not be reported.
 */
function hoist(node: Node, scope: Scope): void {
  if (node.type === 'VariableDeclarator' && node.id?.type === 'Identifier') {
    scope.names.add(node.id.name);
  }
  if (node.type === 'FunctionDeclaration' && node.id?.type === 'Identifier') {
    scope.names.add(node.id.name);
    return; // its body belongs to its own scope
  }
  if (node.type === 'FunctionExpression') return;
  for (const child of children(node)) hoist(child, scope);
}

function walk(node: Node, scope: Scope, offenders: Set<string>, parent?: Node, key?: string): void {
  if (isFunction(node)) {
    const inner = newScope(scope);
    if (node.type === 'FunctionExpression' && node.id?.type === 'Identifier') {
      inner.names.add(node.id.name);
    }
    for (const param of node.params ?? []) {
      if (param.type === 'Identifier') inner.names.add(param.name);
    }
    hoist(node.body, inner);
    walk(node.body, inner, offenders);
    return;
  }

  if (node.type === 'CatchClause') {
    const inner = newScope(scope);
    if (node.param?.type === 'Identifier') inner.names.add(node.param.name);
    hoist(node.body, inner);
    walk(node.body, inner, offenders);
    return;
  }

  if (node.type === 'Identifier') {
    const isProperty = parent?.type === 'MemberExpression' && key === 'property' && !parent.computed;
    const isKey = parent?.type === 'Property' && key === 'key';
    if (!isProperty && !isKey && !resolves(scope, node.name)) offenders.add(node.name);
    return;
  }

  for (const k of Object.keys(node)) {
    if (k === 'type' || k === 'start' || k === 'end') continue;
    const value = node[k];
    if (Array.isArray(value)) {
      for (const v of value) if (v && typeof v === 'object') walk(v, scope, offenders, node, k);
    } else if (value && typeof value === 'object') {
      walk(value, scope, offenders, node, k);
    }
  }
}

describe('generated scripts declare everything they reference', () => {
  const capture = async (tool: { name: string }, args: Record<string, unknown>): Promise<string[]> => {
    const scripts: string[] = [];
    const tools = new PremiereProTools({
      executeScript: async (s: string) => { scripts.push(s); return { success: true }; },
    } as never);
    try {
      await tools.executeTool(tool.name, args);
    } catch {
      // A schema rejection means nothing was emitted; skipped below.
    }
    return scripts;
  };

  it('references no identifier that is never declared', async () => {
    const probe = new PremiereProTools({ executeScript: async () => ({ success: true }) } as never);
    const expanded = new Set<string>([...expandedToolNames]);
    const offenders: string[] = [];
    const localToolsSeen = new Set<string>();
    let checked = 0;

    for (const tool of probe.getAvailableTools()) {
      // Both argument sets. Supplying every optional was itself a blind spot: it
      // fixed "a key the map lacked hid its branch" and created the mirror of it,
      // where the branch taken when the caller omits that key is never emitted.
      const argumentSets = [seedArgs(tool as never), seedRequiredArgs(tool as never)];
      const scripts: string[] = [];
      for (const args of argumentSets) scripts.push(...await capture(tool, args));

      for (const script of scripts) {
        checked++;
        if (!expanded.has(tool.name)) localToolsSeen.add(tool.name);

        let ast: Node;
        try {
          ast = parse(script, { ecmaVersion: 3, allowReturnOutsideFunction: true }) as never;
        } catch {
          continue; // parse failures are the syntax suite's business, not this one
        }

        const top = newScope(null);
        hoist(ast, top);
        const found = new Set<string>();
        walk(ast, top, found);
        for (const name of found) offenders.push(`${tool.name}: ${name}`);
      }
    }

    // Floored on distinct LOCAL tools, not on total scripts. The old floor of 100
    // scripts was met by the expanded tools alone -- they all emit one shared body,
    // so sabotaging every local tool left it green.
    expect(localToolsSeen.size).toBeGreaterThan(60);
    expect(checked).toBeGreaterThan(100);
    expect([...new Set(offenders)]).toEqual([]);
    // Walks every generated script; the default 5s limit is not enough.
  }, 300_000);
});
