/**
 * Catalog-honesty tests for the expanded Premiere tool set.
 *
 * The expanded catalog is a hand-maintained list of tool names plus a switch statement in
 * generated ExtendScript. Those two can drift apart, and when they do the failure is silent:
 * an unhandled name used to fall through to a permissive `default:` branch that returned
 * `{ success: true }` without touching Premiere, so the calling agent was told an edit had
 * landed when nothing had happened.
 *
 * These tests pin the invariant: every advertised expanded tool has a real handler, and
 * anything without one is neither advertised nor reported as a success.
 */

import { jest } from '@jest/globals';
import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import {
  buildExpandedToolScript,
  executeExpandedTool,
  expandedToolNames,
  getExpandedTools,
  isExpandedTool,
  isUnimplementedExpandedTool,
  unimplementedExpandedToolNames
} from '../../tools/expanded.js';
import type { PremiereProTransport } from '../../bridge/types.js';

const here = dirname(fileURLToPath(import.meta.url));
const expandedSource = readFileSync(join(here, '../../tools/expanded.ts'), 'utf8');

/** Tool names reachable through a `case` label in the generated ExtendScript switch. */
const scriptHandledNames = new Set(
  (expandedSource
    .slice(expandedSource.indexOf('function buildExpandedToolScript'))
    .match(/case "[a-z_0-9]+":/g) || []).map((label) => label.slice(6, -2))
);

/** Tool names short-circuited in TypeScript before any script is generated. */
const typescriptHandledNames = new Set(['execute_extendscript']);

function hasHandler(name: string): boolean {
  return scriptHandledNames.has(name) || typescriptHandledNames.has(name);
}

/** Bridge stub that records the script it was asked to run and returns whatever it produces. */
function stubBridge(result: unknown = { success: true }): jest.Mocked<PremiereProTransport> {
  return {
    executeScript: jest.fn().mockResolvedValue(result)
  } as unknown as jest.Mocked<PremiereProTransport>;
}

describe('expanded tool catalog', () => {
  it('advertises only tools that have a real handler', () => {
    const advertisedWithoutHandler = expandedToolNames.filter((name) => !hasHandler(name));
    expect(advertisedWithoutHandler).toEqual([]);
  });

  it('parks every unimplemented tool outside the advertised catalog', () => {
    const overlap = unimplementedExpandedToolNames.filter((name) =>
      (expandedToolNames as readonly string[]).includes(name)
    );
    expect(overlap).toEqual([]);
  });

  it('does not leak parked tools into getExpandedTools()', () => {
    const advertised = new Set(getExpandedTools(new Set()).map((tool) => tool.name));
    const leaked = unimplementedExpandedToolNames.filter((name) => advertised.has(name));
    expect(leaked).toEqual([]);
  });

  it('still filters out names already provided by the core catalog', () => {
    const [first] = expandedToolNames;
    const advertised = getExpandedTools(new Set([first])).map((tool) => tool.name);
    expect(advertised).not.toContain(first);
  });

  it('classifies names consistently across the two predicates', () => {
    for (const name of expandedToolNames) {
      expect(isExpandedTool(name)).toBe(true);
      expect(isUnimplementedExpandedTool(name)).toBe(false);
    }
    for (const name of unimplementedExpandedToolNames) {
      expect(isExpandedTool(name)).toBe(false);
      expect(isUnimplementedExpandedTool(name)).toBe(true);
    }
  });
});

describe('executeExpandedTool()', () => {
  it('refuses a parked tool without touching the bridge', async () => {
    const bridge = stubBridge();
    const [parked] = unimplementedExpandedToolNames;

    const result = await executeExpandedTool(bridge, parked, {});

    expect(result.success).toBe(false);
    expect(result.implemented).toBe(false);
    expect(result.error).toContain(parked);
    expect(bridge.executeScript).not.toHaveBeenCalled();
  });

  it('reports add_tracks as a failure rather than a skipped success', async () => {
    const bridge = stubBridge();

    const result = await executeExpandedTool(bridge, 'add_tracks', {});

    expect(result.success).toBe(false);
    expect(result.error).toContain('add_track');
    expect(bridge.executeScript).not.toHaveBeenCalled();
  });

  it('rejects execute_extendscript with an empty script', async () => {
    const bridge = stubBridge();

    const result = await executeExpandedTool(bridge, 'execute_extendscript', { script: '   ' });

    expect(result.success).toBe(false);
    expect(bridge.executeScript).not.toHaveBeenCalled();
  });

  it('passes an advertised tool through to the bridge', async () => {
    const bridge = stubBridge({ success: true, tool: 'ping' });

    const result = await executeExpandedTool(bridge, 'ping', {});

    expect(bridge.executeScript).toHaveBeenCalledTimes(1);
    expect(result.success).toBe(true);
  });

  it('surfaces a bridge error as a failure', async () => {
    const bridge = {
      executeScript: jest.fn().mockRejectedValue(new Error('bridge timeout'))
    } as unknown as jest.Mocked<PremiereProTransport>;

    const result = await executeExpandedTool(bridge, 'ping', {});

    expect(result.success).toBe(false);
    expect(result.error).toContain('bridge timeout');
  });
});

describe('generated ExtendScript', () => {
  it('fails closed on an unrecognized tool name', () => {
    const script = buildExpandedToolScript('definitely_not_a_real_tool', {});
    const defaultBranch = script.slice(script.lastIndexOf('default:'));

    expect(defaultBranch).toContain('return fail(');
    expect(defaultBranch).not.toContain('return ok(');
  });

  it('never reports an unhandled tool as accepted', () => {
    expect(expandedSource).not.toContain('ok({ accepted');
  });

  it('embeds the tool name and args as JSON literals', () => {
    const script = buildExpandedToolScript('ping', { sequenceId: 'abc"def' });

    expect(script).toContain('var toolName = "ping";');
    expect(script).toContain(JSON.stringify({ sequenceId: 'abc"def' }));
  });
});
