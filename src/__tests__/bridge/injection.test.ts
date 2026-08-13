/**
 * The highest-severity fix in this branch had no test at all.
 *
 * Reverting `JSON.stringify(sequenceId)` to `"${sequenceId}"` in
 * bridge.addToTimeline re-opens arbitrary ExtendScript execution, and without
 * these tests the entire suite stays green. Against the unescaped version a
 * caller-supplied id can run `app.project.saveAs(...)` and return a forged
 * `{success: true}` while no clip is placed.
 *
 * These tests execute the generated script against a mock host, so they fail on
 * the behaviour rather than on the shape of the source.
 */

import vm from 'vm';
import { PremiereProBridge } from '../../bridge/index.js';
import { promises as fs } from 'fs';

jest.mock('fs', () => ({
  promises: {
    mkdir: jest.fn(), access: jest.fn(), readdir: jest.fn(),
    writeFile: jest.fn(), readFile: jest.fn(), unlink: jest.fn(),
    rename: jest.fn(), rm: jest.fn(),
  }
}));
jest.mock('node:crypto', () => ({ randomUUID: jest.fn(() => 'test-uuid-1234') }));

/** Closes the string, runs code, and returns a forged success payload. */
const HOSTILE = 'zz"); __OWNED = true; return JSON.stringify({success:true,forged:true}); ("';

describe('ExtendScript injection', () => {
  const mockFs = fs as jest.Mocked<typeof fs>;
  // Written straight to the polled name here. Publishing via a scratch file and
  // a rename is a separate change to the transport and is not part of this one.
  const commandPath = '/tmp/premiere-mcp-bridge-test/command-test-uuid-1234.json';

  beforeEach(() => {
    jest.clearAllMocks();
    process.env.PREMIERE_TEMP_DIR = '/tmp/premiere-mcp-bridge-test';
    mockFs.mkdir.mockResolvedValue(undefined);
    mockFs.access.mockRejectedValue(new Error('Not found'));
    mockFs.writeFile.mockResolvedValue(undefined);
    mockFs.unlink.mockResolvedValue(undefined);
    mockFs.readFile.mockResolvedValue(JSON.stringify({ result: { ok: true } }));
  });
  afterEach(() => { delete process.env.PREMIERE_TEMP_DIR; });

  const emittedFor = async (sequenceId: string, projectItemId = 'item'): Promise<string> => {
    const bridge = new PremiereProBridge();
    await bridge.initialize();
    await bridge.addToTimeline(sequenceId, projectItemId, 0, 1, false);
    const call = mockFs.writeFile.mock.calls.find(
      ([, payload]) => typeof payload === 'string' && payload.includes('"script"'),
    );
    return JSON.parse(call![1] as string).script as string;
  };

  /**
   * Runs the emitted script against a mock host.
   *
   * `withSequence` matters: __findSequence runs first and returns early when it
   * finds nothing, so a projectItemId payload is never reached unless the id
   * before it resolves. Without this the projectItemId test passes vacuously —
   * it did, until the revert check caught it.
   */
  const runAgainstMockHost = (script: string, withSequence = false) => {
    const sequences: Record<string, unknown> = withSequence
      ? { numSequences: 1, 0: { sequenceID: 'seq', name: 'Mock', videoTracks: { numTracks: 0 }, audioTracks: { numTracks: 0 } } }
      : { numSequences: 0 };
    const sandbox: Record<string, unknown> = {
      __OWNED: false,
      app: {
        project: {
          sequences,
          rootItem: { nodeId: 'root', children: { numItems: 0 } },
          saveAs: () => { (sandbox as { __SAVED?: boolean }).__SAVED = true; },
        },
      },
      qe: undefined,
      $: { writeln: () => {} },
    };
    vm.createContext(sandbox);
    let returned: unknown;
    try {
      returned = vm.runInContext(script, sandbox, { timeout: 5000 });
    } catch (error) {
      returned = { threw: String(error) };
    }
    return { sandbox, returned };
  };

  it('does not execute code smuggled through sequenceId', async () => {
    const script = await emittedFor(HOSTILE);
    const { sandbox } = runAgainstMockHost(script);

    expect(sandbox.__OWNED).toBe(false);
  });

  it('does not let a hostile id forge a success response', async () => {
    const script = await emittedFor(HOSTILE);
    const { returned } = runAgainstMockHost(script);

    const parsed = typeof returned === 'string' ? JSON.parse(returned) : returned;
    expect(parsed).not.toHaveProperty('forged');
    expect(parsed.success).toBe(false);
  });

  it('does not execute code smuggled through projectItemId', async () => {
    // The second interpolated id on the same path, missed by the first sweep.
    const script = await emittedFor('seq', HOSTILE);
    const { sandbox } = runAgainstMockHost(script, true);

    expect(sandbox.__OWNED).toBe(false);
  });

  it('carries the hostile id through as inert data', async () => {
    // Escaping must not silently drop the value: the error still names what was
    // asked for, it just cannot execute.
    const script = await emittedFor(HOSTILE);
    const { returned } = runAgainstMockHost(script);

    const parsed = typeof returned === 'string' ? JSON.parse(returned) : returned;
    expect(String(parsed.error)).toContain('zz');
  });

  it('emits a quoted literal rather than a bare interpolation', async () => {
    const script = await emittedFor(HOSTILE);

    expect(script).toContain(JSON.stringify(HOSTILE));
    expect(script).not.toContain(`__findSequence("${HOSTILE}")`);
  });

  it('survives an ordinary name containing a double quote', async () => {
    // The benign half of the same defect: a bin called 12" produced a script that
    // would not parse at all.
    const script = await emittedFor('a "quoted" name');
    const { returned } = runAgainstMockHost(script);

    const parsed = typeof returned === 'string' ? JSON.parse(returned) : returned;
    expect(parsed).not.toHaveProperty('threw');
    expect(parsed.success).toBe(false);
  });
});
