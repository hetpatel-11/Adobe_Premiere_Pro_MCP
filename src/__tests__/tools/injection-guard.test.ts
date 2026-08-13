/**
 * No caller-supplied string may break out of the generated ExtendScript.
 *
 * This used to scan the TypeScript source for raw interpolation. That reads the
 * wrong artifact and it read it badly: the span scanner tracked `${` and `}`
 * depth, so an object literal inside an interpolation decremented the depth
 * early and the next backtick ended the span before the method did. Three spans
 * were truncated that way, two of them methods that handle caller-supplied bin
 * names, so a raw site there was invisible.
 *
 * So this drives every tool with a hostile value in every string parameter and
 * checks what the host would actually receive: that it still parses as ES3, and
 * that executing it cannot run the payload.
 */

import vm from 'vm';
import { parse } from 'acorn';
import { PremiereProTools } from '../../tools/index.js';

/** Closes the string, sets a flag, and reopens it so the rest still parses. */
const BREAKOUT = 'zz"); __OWNED = true; ("';
/** Adds a key to the returned JSON without breaking the call. */
const ADD_KEY = 'zz", INJECTED: "yes';
/** An ordinary name that happens to contain a quote. */
const BENIGN = '12" Cuts';

const PAYLOADS = [BREAKOUT, ADD_KEY, BENIGN];

/** Plausible non-string values, so a tool is not rejected before it emits. */
const FILLER: Record<string, unknown> = {
  trackIndex: 0, time: 1, newTime: 2, splitTime: 1, duration: 1, speed: 100,
  volume: 0, opacity: 100, scale: 100, rotation: 0, width: 1920, height: 1080,
  frameRate: 25, level: 0, position: 'end', locked: true, visible: true,
  enabled: true, muted: true, settings: {}, adjustments: {}, clips: [],
  parameters: {}, textItems: [], steps: [],
};

function stringParams(tool: { inputSchema?: { shape?: Record<string, unknown> } }): string[] {
  // This zod build does not expose _def.typeName; the runtime class name is what
  // identifies the type. Optionals are included because the value inside is
  // usually a string, and a wrong guess only costs a skipped case.
  const shape = tool.inputSchema?.shape ?? {};
  return Object.keys(shape).filter((key) => {
    const name = (shape[key] as { constructor?: { name?: string } })?.constructor?.name;
    return name === 'ZodString' || name === 'ZodOptional' || name === 'ZodUnion';
  });
}

function argsFor(tool: { inputSchema?: { shape?: Record<string, unknown> } },
                 param: string, payload: string): Record<string, unknown> {
  const shape = tool.inputSchema?.shape ?? {};
  const args: Record<string, unknown> = {};
  for (const key of Object.keys(shape)) {
    args[key] = key === param ? payload : (FILLER[key] ?? 'x');
  }
  return args;
}

/** Runs the emitted script against a host that records whether the payload fired. */
function payloadRuns(script: string): boolean {
  const sandbox: Record<string, unknown> = {
    __OWNED: false,
    app: {
      enableQE() {},
      project: {
        name: 'p',
        sequences: { numSequences: 0 },
        rootItem: { name: 'root', nodeId: 'r', children: { numItems: 0 }, createBin: () => ({ name: 'b', nodeId: 'n' }) },
        activeSequence: null,
        importFiles: () => true,
      },
    },
    qe: { project: {} },
    JSON,
    File: function () { return { exists: false }; },
    Folder: function () { return { exists: false, create: () => false }; },
  };
  vm.createContext(sandbox);
  try {
    vm.runInContext(`(function(){${script}})()`, sandbox, { timeout: 2000 });
  } catch {
    // A missing DOM member is expected; only the flag matters.
  }
  return sandbox.__OWNED === true;
}

describe('generated scripts cannot be broken out of', () => {
  it('survives a hostile value in every string parameter of every tool', async () => {
    const probe = new PremiereProTools({ executeScript: async () => ({ success: true }) } as never);
    const escaped: string[] = [];
    const unparseable: string[] = [];
    let checked = 0;

    for (const tool of probe.getAvailableTools()) {
      for (const param of stringParams(tool as never)) {
        for (const payload of PAYLOADS) {
          let script = '';
          const tools = new PremiereProTools({
            executeScript: async (s: string) => { script = s; return { success: true }; },
          } as never);
          try {
            await tools.executeTool(tool.name, argsFor(tool as never, param, payload));
          } catch {
            // schema rejection: nothing was emitted
          }
          if (!script) continue;
          checked++;

          try {
            parse(script, { ecmaVersion: 3, allowReturnOutsideFunction: true });
          } catch {
            unparseable.push(`${tool.name}.${param}`);
            continue;
          }
          if (payloadRuns(script)) escaped.push(`${tool.name}.${param}`);
        }
      }
    }

    // A broken harness would make the two assertions below pass vacuously.
    // 183 cases at present; the floor only catches a harness that stopped capturing.
    expect(checked).toBeGreaterThan(150);
    expect([...new Set(escaped)]).toEqual([]);
    expect([...new Set(unparseable)]).toEqual([]);
  }, 300_000);
});
