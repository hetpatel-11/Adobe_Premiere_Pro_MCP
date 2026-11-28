/**
 * CEP evalScript is single-flight. A JS timeout that starts a second native
 * call while the first callback is still outstanding wedges Premiere until
 * restart (GitHub issue 86).
 */

import { loadPanel } from '../helpers/panel.js';

describe('CEP evalScript single-flight', () => {
  afterEach(() => {
    jest.useRealTimers();
  });

  it('does not start a second evalScript until the first native callback runs, even after the waiter times out', () => {
    jest.useFakeTimers();
    const { bridge } = loadPanel();
    const evalCalls: Array<(result: string) => void> = [];

    bridge.csInterface = {
      getHostEnvironment: () => ({ appName: 'PPRO', appVersion: '26.0.0' }),
      evalScript: (_script: string, callback: (result: string) => void) => {
        evalCalls.push(callback);
      }
    };
    bridge.normalizeHostEnvironment = (value: unknown) => value;
    bridge.log = () => {};

    const waiterResults: string[] = [];
    bridge.executeExtendScript('return 1;', (err: Error | null) => {
      waiterResults.push(err ? err.message : 'ok');
    });

    expect(evalCalls).toHaveLength(1);

    bridge.executeExtendScript('return 2;', () => {});
    expect(evalCalls).toHaveLength(1);

    jest.advanceTimersByTime(45000);
    expect(waiterResults[0]).toMatch(/timed out after 45000ms/);
    expect(evalCalls).toHaveLength(1);

    evalCalls[0](JSON.stringify({ ok: true }));
    jest.advanceTimersByTime(0);

    expect(evalCalls).toHaveLength(2);
  });

  it('still prepends the prelude on the script handed to evalScript', () => {
    jest.useFakeTimers();
    const { bridge, handedToEvalScript } = loadPanel();
    bridge.log = () => {};
    bridge.executeExtendScript('return 1;', () => {});
    expect(handedToEvalScript()).toContain('function __mcpStringify');
    // Statement bodies are wrapped in an undo IIFE that still runs the original return.
    expect(handedToEvalScript()).toContain('return 1;');
    expect(handedToEvalScript()).toContain('beginUndoGroup');
  });
});

describe('CEP undo groups', () => {
  it('wraps a statement body so Premiere can undo the call as one step and still return the result', () => {
    const { bridge, handedToEvalScript } = loadPanel();
    bridge.log = () => {};
    bridge.executeExtendScript('return 1;', () => {});
    const handed = handedToEvalScript();
    expect(handed).toContain('beginUndoGroup("MCP Bridge")');
    expect(handed).toContain('endUndoGroup');
    expect(handed).toMatch(/return \(function\(\)\s*\{[\s\S]*return 1;/);
  });

  it('returns a production IIFE payload instead of discarding its value', () => {
    const { bridge, handedToEvalScript } = loadPanel();
    bridge.log = () => {};
    const iife = '(function(){ return JSON.stringify({ success: true }); })();';
    bridge.executeExtendScript(iife, () => {});
    const handed = handedToEvalScript();
    expect(handed).toContain('beginUndoGroup("MCP Bridge")');
    // Outer undo IIFE must return the Node-bridge IIFE call, or evalScript yields undefined.
    expect(handed).toMatch(/return\s+\(function\(\)\s*\{\s*return JSON\.stringify\(\{\s*success:\s*true\s*\}\);\s*\}\)\(\)/);
  });

  it('leaves scripts that already open an undo group alone', () => {
    const { bridge, handedToEvalScript } = loadPanel();
    bridge.log = () => {};
    const alreadyGrouped = '(function(){ app.beginUndoGroup("mine"); return 1; })();';
    bridge.executeExtendScript(alreadyGrouped, () => {});
    const handed = handedToEvalScript();
    expect(handed).toContain(alreadyGrouped);
    // Only the caller's group; no outer MCP Bridge wrapper.
    expect(handed).not.toContain('beginUndoGroup("MCP Bridge")');
  });
});

describe('CEP panel auto-start', () => {
  it('starts the bridge when the panel initializes and a temp directory exists', () => {
    const { bridge } = loadPanel();
    const started: string[] = [];
    bridge.loadConfig = () => {};
    bridge.updateUI = () => {};
    bridge.startCommandPolling = () => {};
    bridge.checkForPackageUpdate = () => {};
    bridge.getTempDirectory = () => '/tmp/premiere-mcp-bridge';
    bridge.startBridge = function () { started.push('started'); };
    bridge.csInterface = { getHostEnvironment: () => ({ appName: 'PPRO', appVersion: '26.0.0' }) };
    bridge.log = () => {};
    bridge.init();
    expect(started).toEqual(['started']);
  });
});

describe('CEP panel heartbeat', () => {
  it('writes bridge-heartbeat.json so the server can fail fast when Premiere is not listening', () => {
    const { bridge, fs } = loadPanel();
    bridge.getTempDirectory = () => '/tmp/premiere-mcp-bridge';
    bridge.isConnected = true;

    bridge.writeHeartbeat();

    expect(fs.writeFileSync).toHaveBeenCalledWith(
      '/tmp/premiere-mcp-bridge/bridge-heartbeat.json',
      expect.stringMatching(/"started":true/),
    );
    expect(fs.writeFileSync).toHaveBeenCalledWith(
      '/tmp/premiere-mcp-bridge/bridge-heartbeat.json',
      expect.stringMatching(/"scriptOkAt":/),
    );
  });
});
