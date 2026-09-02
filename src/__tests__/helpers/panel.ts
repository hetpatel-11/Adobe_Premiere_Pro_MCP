/**
 * Loading the CEP panel so its own code can be driven.
 *
 * Tests here kept re-deriving what the panel does by reading its source — the
 * line that builds `fullScript`, the reject-pattern array, the length ceiling —
 * and every one of those was defeated by an ordinary edit that left the panel
 * behaving differently while the assertion still matched:
 *
 *   - pinning the `fullScript` assignment missed `evalScript(script)`, so the
 *     prelude stopped being prepended with the suite green
 *   - the length ceiling was read with a first-match regex, so a doc comment
 *     restating the old value hid a real ceiling low enough to reject every call
 *   - the pattern list was read up to the first `];`, so moving patterns into a
 *     second array silently shortened it
 *
 * Driving the panel removes the whole class: whatever it actually does is what
 * gets asserted. `jest.config.js` sets `roots: ['<rootDir>/src']`, so nothing
 * under `cep-plugin/` is collected as a test — this is how that code is reached.
 */

import vm from 'vm';
import path from 'path';

const realFs = jest.requireActual<typeof import('fs')>('fs');

export const PANEL_PATH = path.join(__dirname, '..', '..', '..', 'cep-plugin', 'bridge-cep.js');

export interface LoadedPanel {
  /** A bridge instance with its prototype methods, no constructor side effects. */
  bridge: Record<string, any>;
  /** Whatever the panel last handed to evalScript. */
  handedToEvalScript: () => string;
  /** The fs stub the panel closed over at load. */
  fs: { writeFileSync: jest.Mock; existsSync: jest.Mock };
}

/** Minimal stand-ins for what the panel pulls in at load time. */
function nodeStub(name: string, fsStub: Record<string, unknown>): unknown {
  if (name === 'fs') return fsStub;
  if (name === 'path') {
    return {
      join: (...parts: string[]) => parts.join('/'),
      basename: (value: string) => value.replace(/^.*[/\\]/, ''),
      dirname: (value: string) => {
        const normalized = String(value).replace(/\\/g, '/');
        const index = normalized.lastIndexOf('/');
        return index <= 0 ? normalized : normalized.slice(0, index);
      },
      delimiter: ':',
    };
  }
  if (name === 'os') {
    return {
      tmpdir: () => '/tmp',
      homedir: () => '/tmp',
      platform: () => 'darwin',
      arch: () => 'arm64',
    };
  }
  return {};
}

export function loadPanel(): LoadedPanel {
  const source = realFs.readFileSync(PANEL_PATH, 'utf8');
  let handed = '';
  const fsStub = {
    existsSync: jest.fn(() => false), mkdirSync: () => {}, readdirSync: () => [],
    readFileSync: () => '', writeFileSync: jest.fn(), unlinkSync: () => {},
    renameSync: () => {}, statSync: () => ({ isDirectory: () => false }),
  };

  const sandbox: Record<string, unknown> = {
    window: {} as Record<string, unknown>,
    document: { addEventListener() {}, getElementById: () => null, readyState: 'complete' },
    navigator: { userAgent: 'test' },
    setTimeout: (fn: (...args: unknown[]) => void, ms?: number) => setTimeout(fn, ms) as unknown as number,
    clearTimeout: (id: number) => clearTimeout(id),
    setInterval: () => 0,
    clearInterval: () => {},
    console: { log() {}, warn() {}, error() {} },
    require: (name: string) => nodeStub(name, fsStub),
    __dirname: '/fake-cep',
    CSInterface: function () {
      return {
        getHostEnvironment: () => ({ appName: 'PPRO', appVersion: '26.0.0' }),
        evalScript: (script: string) => { handed = script; },
        addEventListener() {},
      };
    },
  };
  vm.createContext(sandbox);
  vm.runInContext(source, sandbox);

  const Bridge = (sandbox.window as { MCPPremiereBridge?: new () => unknown }).MCPPremiereBridge;
  if (typeof Bridge !== 'function') throw new Error('panel did not export MCPPremiereBridge');

  // Prototype only: running the constructor would start timers and touch disk.
  const bridge = Object.create((Bridge as unknown as { prototype: object }).prototype) as Record<string, any>;
  bridge.csInterface = new (sandbox.CSInterface as new () => unknown)();
  bridge.normalizeHostEnvironment = (value: unknown) => value;
  bridge.log = () => {};

  return { bridge, handedToEvalScript: () => handed, fs: fsStub as LoadedPanel['fs'] };
}
