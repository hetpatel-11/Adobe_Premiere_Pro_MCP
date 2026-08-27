/**
 * Unit tests for anonymous usage telemetry.
 */

import { mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  Telemetry,
  classifyToolError,
  isTelemetryEnabled,
  sanitizeErrorDetail,
  summarizeToolFailure,
} from '../../utils/telemetry.js';

const ALLOWED_PAYLOAD_KEYS = new Set([
  'event',
  'distinct_id',
  'session_id',
  'version',
  'os',
  'arch',
  'node',
  'tool',
  'success',
  'duration_ms',
  'error_kind',
  'error_code',
  'error_fields',
  'error_detail',
  'retry',
  'status',
]);

function tempHome(): string {
  return mkdtempSync(join(tmpdir(), 'premiere-mcp-telemetry-'));
}

function writeConfig(home: string, telemetry: boolean | undefined): void {
  mkdirSync(join(home, '.premiere-mcp-bridge'), { recursive: true });
  const config: Record<string, unknown> = { tempDirectory: '/tmp/premiere-mcp-bridge' };
  if (telemetry !== undefined) config.telemetry = telemetry;
  writeFileSync(join(home, '.premiere-mcp-bridge', 'config.json'), JSON.stringify(config));
}

describe('isTelemetryEnabled', () => {
  it('is on by default', () => {
    expect(isTelemetryEnabled({}, true)).toBe(true);
  });

  it('turns off for PREMIERE_MCP_TELEMETRY=0', () => {
    expect(isTelemetryEnabled({ PREMIERE_MCP_TELEMETRY: '0' }, true)).toBe(false);
  });

  it('turns off for DO_NOT_TRACK=1', () => {
    expect(isTelemetryEnabled({ DO_NOT_TRACK: '1' }, true)).toBe(false);
  });

  it('turns off when config.json sets telemetry false', () => {
    expect(isTelemetryEnabled({}, false)).toBe(false);
  });

  it('lets PREMIERE_MCP_TELEMETRY=1 override DO_NOT_TRACK and config', () => {
    expect(
      isTelemetryEnabled({ PREMIERE_MCP_TELEMETRY: '1', DO_NOT_TRACK: '1' }, false),
    ).toBe(true);
  });

  it('stays off inside Jest unless explicitly enabled', () => {
    expect(isTelemetryEnabled({ JEST_WORKER_ID: '1' }, true)).toBe(false);
    expect(
      isTelemetryEnabled({ JEST_WORKER_ID: '1', PREMIERE_MCP_TELEMETRY: '1' }, true),
    ).toBe(true);
  });
});

describe('classifyToolError', () => {
  it('classifies timeout, validation, connection, and missing-entity errors', () => {
    expect(classifyToolError('ExtendScript execution timed out after 45000ms')).toBe('timeout');
    expect(classifyToolError("Invalid arguments for tool 'add_marker'")).toBe('validation');
    expect(classifyToolError('Bridge is not connected')).toBe('connection');
    expect(classifyToolError('MCP Bridge is not running. Click Start Bridge.')).toBe('connection');
    expect(classifyToolError("Tool 'nope' not found")).toBe('not_found');
    expect(classifyToolError('evalScript failed')).toBe('evalscript');
    expect(classifyToolError('add_text_overlay cannot create titles from text alone. needs a .mogrt')).toBe(
      'unsupported',
    );
    expect(classifyToolError('/Users/het/secret.prproj could not be opened')).toBe('unknown');
  });
});

describe('sanitizeErrorDetail', () => {
  it('strips filesystem paths and keeps the diagnostic shape', () => {
    expect(
      sanitizeErrorDetail(
        'Bridge response timeout. Temp Directory is set to /Users/het/secret, and Start Bridge is clicked.',
      ),
    ).toBe(
      'Bridge response timeout. Temp Directory is set to <path>, and Start Bridge is clicked.',
    );
    expect(sanitizeErrorDetail('Could not open C:\\Users\\het\\cut.prproj')).toBe(
      'Could not open <path>',
    );
    expect(sanitizeErrorDetail('import failed for "/tmp/nudge.mp4"')).toMatch(/<file>|<path>/);
    expect(JSON.stringify(sanitizeErrorDetail('/Users/het/secret.prproj missing'))).not.toContain(
      '/Users',
    );
  });
});

describe('summarizeToolFailure', () => {
  it('keeps zod field names and a path-stripped template, not the raw path', () => {
    const summary = summarizeToolFailure({
      success: false,
      status: 'validation',
      retry: false,
      errorCode: 'zod.invalid_type',
      errorFields: 'duration,position',
      error:
        'Invalid arguments for tool \'add_transition_to_clip\': [{"code":"invalid_type","path":["duration"],"expected":"number","received":"string"}]',
    });
    expect(summary.errorKind).toBe('validation');
    expect(summary.errorCode).toBe('zod.invalid_type');
    expect(summary.errorFields).toBe('duration,position');
    expect(summary.retry).toBe(false);
    expect(summary.errorDetail).toContain('duration');
    expect(summary.errorDetail).toContain('invalid_type');
  });

  it('codes a missing panel separately from a host not-found', () => {
    expect(
      summarizeToolFailure({
        success: false,
        status: 'bridge_unavailable',
        retry: false,
        error: 'MCP Bridge is not running. Open Premiere Pro, then click Start Bridge.',
      }).errorCode,
    ).toBe('bridge.panel_absent');
    expect(
      summarizeToolFailure({
        success: false,
        error: 'Clip not found',
      }).errorCode,
    ).toBe('host.not_found');
  });
});

describe('Telemetry', () => {
  let home: string;
  const captured: Array<Record<string, unknown>> = [];

  const fetchMock: typeof fetch = jest.fn(async (_url, init) => {
    captured.push(JSON.parse(String(init?.body)) as Record<string, unknown>);
    return new Response(null, { status: 204 });
  });

  beforeEach(() => {
    home = tempHome();
    captured.length = 0;
    (fetchMock as jest.Mock).mockClear();
  });

  afterEach(() => {
    rmSync(home, { recursive: true, force: true });
  });

  function makeTelemetry(env: Record<string, string> = {}): Telemetry {
    return new Telemetry({
      env,
      homedir: () => home,
      fetch: fetchMock,
      randomUUID: () => 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
      platform: 'darwin',
      arch: 'arm64',
      nodeVersion: 'v20.11.0',
      packageVersion: '1.2.2',
      ingestUrl: 'https://example.test/v1/event',
    });
  }

  it('does not send when opted out, and does not create an install id', async () => {
    const telemetry = makeTelemetry({ PREMIERE_MCP_TELEMETRY: '0' });
    telemetry.trackServerStarted();
    telemetry.trackToolCall({ tool: 'get_project_info', success: true, durationMs: 12 });
    await telemetry.flush();

    expect(fetchMock).not.toHaveBeenCalled();
    expect(() =>
      readFileSync(join(home, '.premiere-mcp-bridge', 'install-id'), 'utf8'),
    ).toThrow();
  });

  it('does not send when config.json sets telemetry to false', async () => {
    writeConfig(home, false);
    const telemetry = makeTelemetry();
    telemetry.trackToolCall({ tool: 'ping', success: true, durationMs: 4 });
    await telemetry.flush();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('sends only allowlisted fields and never includes args, paths, or unsanitized error text', async () => {
    const telemetry = makeTelemetry();
    telemetry.trackServerStarted();
    telemetry.trackToolCall({
      tool: 'import_media',
      success: false,
      durationMs: 41,
      errorKind: 'timeout',
      errorCode: 'bridge.timeout',
      errorFields: 'mediaPath',
      errorDetail:
        'Bridge response timeout. Temp Directory is set to /Users/het/secret, and Start Bridge is clicked.',
      retry: false,
      status: 'bridge_unavailable',
    });
    await telemetry.flush();

    expect(captured).toHaveLength(2);
    for (const payload of captured) {
      for (const key of Object.keys(payload)) {
        expect(ALLOWED_PAYLOAD_KEYS.has(key)).toBe(true);
      }
      expect(payload).not.toHaveProperty('args');
      expect(payload).not.toHaveProperty('error');
      expect(payload).not.toHaveProperty('path');
      expect(JSON.stringify(payload)).not.toContain('/Users');
      expect(JSON.stringify(payload)).not.toContain('.prproj');
      expect(JSON.stringify(payload)).not.toContain('secret');
    }

    expect(captured[0]).toMatchObject({
      event: 'server_started',
      version: '1.2.2',
      os: 'darwin',
      arch: 'arm64',
      node: 'v20.11.0',
    });
    expect(captured[0]).not.toHaveProperty('tool');
    expect(captured[1]).toMatchObject({
      event: 'tool_called',
      tool: 'import_media',
      success: false,
      duration_ms: 41,
      error_kind: 'timeout',
      error_code: 'bridge.timeout',
      error_fields: 'mediaPath',
      error_detail:
        'Bridge response timeout. Temp Directory is set to <path>, and Start Bridge is clicked.',
      retry: false,
      status: 'bridge_unavailable',
    });
  });

  it('replaces illegal tool names instead of sending caller-supplied strings', async () => {
    const telemetry = makeTelemetry();
    telemetry.trackToolCall({
      tool: '../etc/passwd',
      success: true,
      durationMs: 1,
    });
    await telemetry.flush();
    expect(captured[0]?.tool).toBe('invalid_tool_name');
  });

  it('reuses the install id written to ~/.premiere-mcp-bridge/install-id', async () => {
    const first = makeTelemetry();
    first.trackServerStarted();
    await first.flush();

    const second = new Telemetry({
      env: {},
      homedir: () => home,
      fetch: fetchMock,
      randomUUID: () => 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
      platform: 'darwin',
      arch: 'arm64',
      nodeVersion: 'v20.11.0',
      packageVersion: '1.2.2',
      ingestUrl: 'https://example.test/v1/event',
    });
    second.trackServerStarted();
    await second.flush();

    expect(captured[0]?.distinct_id).toBe('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa');
    expect(captured[1]?.distinct_id).toBe('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa');
    expect(readFileSync(join(home, '.premiere-mcp-bridge', 'install-id'), 'utf8').trim()).toBe(
      'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
    );
  });

  it('swallows network failures so a telemetry outage cannot fail a tool call', async () => {
    const failingFetch: typeof fetch = jest.fn(async () => {
      throw new Error('network down');
    });
    const telemetry = new Telemetry({
      env: {},
      homedir: () => home,
      fetch: failingFetch,
      randomUUID: () => 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
      platform: 'darwin',
      arch: 'arm64',
      nodeVersion: 'v20.11.0',
      packageVersion: '1.2.2',
      ingestUrl: 'https://example.test/v1/event',
    });

    telemetry.trackToolCall({ tool: 'ping', success: true, durationMs: 2 });
    await expect(telemetry.flush()).resolves.toBeUndefined();
    expect(failingFetch).toHaveBeenCalled();
  });
});
