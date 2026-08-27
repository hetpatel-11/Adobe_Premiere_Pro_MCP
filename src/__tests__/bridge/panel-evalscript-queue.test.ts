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
    expect(handedToEvalScript().endsWith('return 1;')).toBe(true);
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
  });
});
