import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { resolveBridgeTempDir } from '../../utils/security.js';

describe('resolveBridgeTempDir', () => {
  let home: string;

  beforeEach(() => {
    home = mkdtempSync(join(tmpdir(), 'premiere-mcp-security-'));
  });

  afterEach(() => {
    rmSync(home, { recursive: true, force: true });
  });

  function writePanelConfig(config: Record<string, unknown>): void {
    mkdirSync(join(home, '.premiere-mcp-bridge'), { recursive: true });
    writeFileSync(join(home, '.premiere-mcp-bridge', 'config.json'), JSON.stringify(config));
  }

  it('prefers PREMIERE_TEMP_DIR and strips a trailing separator', () => {
    writePanelConfig({ tempDirectory: '/from/config' });
    expect(resolveBridgeTempDir({ PREMIERE_TEMP_DIR: '/from/env/' }, home)).toBe('/from/env');
  });

  it('uses the directory the CEP panel saved when the env var is unset', () => {
    writePanelConfig({ telemetry: false, tempDirectory: 'C:\\Users\\me\\Temp\\premiere-mcp-bridge\\' });
    expect(resolveBridgeTempDir({}, home)).toBe('C:\\Users\\me\\Temp\\premiere-mcp-bridge');
  });

  it("falls back to the panel's platform default without a saved config", () => {
    const expected = process.platform === 'win32'
      ? join('C:\\PanelTemp', 'premiere-mcp-bridge')
      : '/tmp/premiere-mcp-bridge';
    expect(resolveBridgeTempDir({ TEMP: 'C:\\PanelTemp' }, home)).toBe(expected);
  });

  it('ignores a config without a usable tempDirectory', () => {
    writePanelConfig({ tempDirectory: '   ' });
    expect(resolveBridgeTempDir({ TEMP: 'C:\\PanelTemp' }, home)).toMatch(/premiere-mcp-bridge$/);
  });
});
