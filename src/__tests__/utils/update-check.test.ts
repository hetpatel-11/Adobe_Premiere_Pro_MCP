import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  INSTALL_COMMAND,
  checkForUpdate,
  compareSemver,
  isUpdateCheckEnabled,
  snoozeUpdate,
} from '../../utils/update-check.js';
import { PACKAGE_VERSION } from '../../version.js';

function tempHome(): string {
  return mkdtempSync(join(tmpdir(), 'premiere-mcp-update-'));
}

function writeConfig(home: string, config: Record<string, unknown>): void {
  mkdirSync(join(home, '.premiere-mcp-bridge'), { recursive: true });
  writeFileSync(join(home, '.premiere-mcp-bridge', 'config.json'), JSON.stringify(config));
}

describe('compareSemver', () => {
  it('orders dotted versions numerically', () => {
    expect(compareSemver('1.2.10', '1.2.9')).toBe(1);
    expect(compareSemver('1.2.3', '1.2.3')).toBe(0);
    expect(compareSemver('1.2.3', '1.3.0')).toBe(-1);
  });
});

describe('isUpdateCheckEnabled', () => {
  it('is off inside Jest unless explicitly enabled', () => {
    expect(isUpdateCheckEnabled({ JEST_WORKER_ID: '1' })).toBe(false);
    expect(isUpdateCheckEnabled({ JEST_WORKER_ID: '1', PREMIERE_MCP_UPDATE_CHECK: '1' })).toBe(true);
  });

  it('turns off for PREMIERE_MCP_UPDATE_CHECK=0', () => {
    expect(isUpdateCheckEnabled({ PREMIERE_MCP_UPDATE_CHECK: '0' })).toBe(false);
  });
});

describe('checkForUpdate', () => {
  const homes: string[] = [];
  afterEach(() => {
    for (const home of homes) rmSync(home, { recursive: true, force: true });
    homes.length = 0;
  });

  it('reports an available update and does not treat snooze as current', async () => {
    const home = tempHome();
    homes.push(home);
    const fetchFn = jest.fn(async () => ({
      ok: true,
      json: async () => ({ version: '9.9.9' }),
    })) as unknown as typeof fetch;

    const status = await checkForUpdate({
      env: { PREMIERE_MCP_UPDATE_CHECK: '1' },
      homedir: () => home,
      currentVersion: '1.2.3',
      now: () => 1_000,
      fetchFn,
    });

    expect(status.available).toBe(true);
    expect(status.latest).toBe('9.9.9');
    expect(status.snoozed).toBe(false);
    expect(status.nextStep).toContain(INSTALL_COMMAND);
    expect(status.nextStep).toContain('later');
    expect(status.installCommand).toBe(INSTALL_COMMAND);
    expect(JSON.parse(readFileSync(join(home, '.premiere-mcp-bridge', 'update-check.json'), 'utf8'))).toEqual({
      latest: '9.9.9',
      checkedAt: 1_000,
    });
  });

  it('does not prompt while snoozed', async () => {
    const home = tempHome();
    homes.push(home);
    writeConfig(home, { updateSnoozedUntil: 5_000 });

    const status = await checkForUpdate({
      env: { PREMIERE_MCP_UPDATE_CHECK: '1' },
      homedir: () => home,
      currentVersion: '1.2.3',
      now: () => 1_000,
      fetchFn: jest.fn(async () => ({
        ok: true,
        json: async () => ({ version: '9.9.9' }),
      })) as unknown as typeof fetch,
    });

    expect(status.available).toBe(true);
    expect(status.snoozed).toBe(true);
    expect(status.nextStep).toBeUndefined();
  });

  it('skips the network in Jest by default', async () => {
    const fetchFn = jest.fn();
    const status = await checkForUpdate({
      env: { JEST_WORKER_ID: '1' },
      currentVersion: PACKAGE_VERSION,
      fetchFn: fetchFn as unknown as typeof fetch,
    });

    expect(status.skipped).toBe('disabled');
    expect(status.available).toBe(false);
    expect(fetchFn).not.toHaveBeenCalled();
  });
});

describe('snoozeUpdate', () => {
  it('writes a 7-day snooze without dropping other config keys', () => {
    const home = tempHome();
    writeConfig(home, { telemetry: false, tempDirectory: '/tmp/premiere-mcp-bridge' });
    snoozeUpdate({ homedir: () => home, now: () => 1_000 });

    const config = JSON.parse(readFileSync(join(home, '.premiere-mcp-bridge', 'config.json'), 'utf8'));
    expect(config.telemetry).toBe(false);
    expect(config.tempDirectory).toBe('/tmp/premiere-mcp-bridge');
    expect(config.updateSnoozedUntil).toBe(1_000 + 7 * 24 * 60 * 60 * 1000);
    rmSync(home, { recursive: true, force: true });
  });
});

describe('version stamps', () => {
  it('keeps package.json, src/version.ts, and the CEP stamp on the same version', () => {
    const pkg = JSON.parse(readFileSync(join(process.cwd(), 'package.json'), 'utf8')) as { version: string };
    const versionTs = readFileSync(join(process.cwd(), 'src/version.ts'), 'utf8');
    const cep = JSON.parse(readFileSync(join(process.cwd(), 'cep-plugin/mcp-version.json'), 'utf8')) as { version: string };
    expect(versionTs).toContain(`'${pkg.version}'`);
    expect(cep.version).toBe(pkg.version);
  });
});
