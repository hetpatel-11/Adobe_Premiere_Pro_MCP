import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { homedir as osHomedir } from 'node:os';
import { dirname, join } from 'node:path';
import { PACKAGE_VERSION } from '../version.js';

export const NPM_LATEST_URL = 'https://registry.npmjs.org/adobe-premiere-pro-mcp/latest';
export const INSTALL_COMMAND =
  'npm install -g adobe-premiere-pro-mcp@latest && premiere-pro-mcp --install-cep';
export const UPDATE_SNOOZE_MS = 7 * 24 * 60 * 60 * 1000;
export const UPDATE_CACHE_TTL_MS = 6 * 60 * 60 * 1000;
const UPDATE_FETCH_TIMEOUT_MS = 2500;

export type UpdateEnv = NodeJS.Dict<string | undefined>;

export type UpdateStatus = {
  current: string;
  available: boolean;
  snoozed: boolean;
  latest?: string;
  skipped?: string;
  nextStep?: string;
  installCommand?: string;
};

export type UpdateCheckDeps = {
  env?: UpdateEnv;
  now?: () => number;
  homedir?: () => string;
  currentVersion?: string;
  fetchFn?: typeof fetch;
};

type CachedLatest = {
  latest: string;
  checkedAt: number;
};

function envFlag(env: UpdateEnv, name: string): boolean | undefined {
  const raw = env[name];
  if (raw === undefined) return undefined;
  const normalized = String(raw).trim().toLowerCase();
  if (['0', 'false', 'no', 'off'].includes(normalized)) return false;
  if (['1', 'true', 'yes', 'on'].includes(normalized)) return true;
  return undefined;
}

function readJsonObject(path: string): Record<string, unknown> | null {
  try {
    if (!existsSync(path)) return null;
    const parsed = JSON.parse(readFileSync(path, 'utf8')) as unknown;
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return null;
    return parsed as Record<string, unknown>;
  } catch {
    return null;
  }
}

function writeJson(path: string, value: Record<string, unknown>): void {
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, JSON.stringify(value, null, 2));
}

function configDir(homedirPath: string): string {
  return join(homedirPath, '.premiere-mcp-bridge');
}

function configPath(homedirPath: string): string {
  return join(configDir(homedirPath), 'config.json');
}

function cachePath(homedirPath: string): string {
  return join(configDir(homedirPath), 'update-check.json');
}

export function compareSemver(a: string, b: string): number {
  const left = String(a).split('.').map((part) => parseInt(part, 10) || 0);
  const right = String(b).split('.').map((part) => parseInt(part, 10) || 0);
  for (let i = 0; i < 3; i++) {
    const l = left[i] ?? 0;
    const r = right[i] ?? 0;
    if (l > r) return 1;
    if (l < r) return -1;
  }
  return 0;
}

export function isUpdateCheckEnabled(
  env: UpdateEnv = process.env,
  configEnabled = true,
): boolean {
  if (env.JEST_WORKER_ID && envFlag(env, 'PREMIERE_MCP_UPDATE_CHECK') !== true) {
    return false;
  }
  const explicit = envFlag(env, 'PREMIERE_MCP_UPDATE_CHECK');
  if (explicit === false) return false;
  if (explicit === true) return true;
  return configEnabled;
}

function configAllowsUpdateCheck(homedirPath: string): boolean {
  const config = readJsonObject(configPath(homedirPath));
  return config?.updateCheck !== false;
}

function snoozedUntil(homedirPath: string): number {
  const config = readJsonObject(configPath(homedirPath));
  const value = config?.updateSnoozedUntil;
  return typeof value === 'number' && Number.isFinite(value) ? value : 0;
}

function cachedLatest(homedirPath: string, now: number): string | undefined {
  const cached = readJsonObject(cachePath(homedirPath)) as CachedLatest | null;
  if (!cached || typeof cached.latest !== 'string' || typeof cached.checkedAt !== 'number') {
    return undefined;
  }
  if (now - cached.checkedAt > UPDATE_CACHE_TTL_MS) return undefined;
  return cached.latest;
}

function statusFor(current: string, latest: string | undefined, snoozed: boolean): UpdateStatus {
  const available = Boolean(latest && compareSemver(latest, current) > 0);
  const nextStep = available && !snoozed
    ? `Update recommended: ${latest} is available (you have ${current}). Give the user this command, or later: ${INSTALL_COMMAND}. Then reload Window > Extensions > MCP Bridge and restart the MCP client.`
    : undefined;
  return {
    current,
    available,
    snoozed,
    ...(latest ? { latest } : {}),
    ...(nextStep ? { nextStep, installCommand: INSTALL_COMMAND } : {}),
  };
}

async function fetchLatestVersion(
  fetchFn: typeof fetch,
): Promise<string | undefined> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), UPDATE_FETCH_TIMEOUT_MS);
  try {
    const response = await fetchFn(NPM_LATEST_URL, {
      signal: controller.signal,
      headers: {
        Accept: 'application/json',
        'User-Agent': `adobe-premiere-pro-mcp/${PACKAGE_VERSION}`,
      },
    });
    if (!response.ok) return undefined;
    const body = (await response.json()) as { version?: unknown };
    return typeof body.version === 'string' ? body.version : undefined;
  } catch {
    return undefined;
  } finally {
    clearTimeout(timer);
  }
}

export async function checkForUpdate(deps: UpdateCheckDeps = {}): Promise<UpdateStatus> {
  const env = deps.env ?? process.env;
  const now = (deps.now ?? Date.now)();
  const homedirPath = (deps.homedir ?? osHomedir)();
  const current = deps.currentVersion ?? PACKAGE_VERSION;
  const fetchFn = deps.fetchFn ?? globalThis.fetch;

  if (!isUpdateCheckEnabled(env, configAllowsUpdateCheck(homedirPath))) {
    return { current, available: false, snoozed: false, skipped: 'disabled' };
  }

  const snoozed = snoozedUntil(homedirPath) > now;
  let latest = cachedLatest(homedirPath, now);
  if (!latest && typeof fetchFn === 'function') {
    latest = await fetchLatestVersion(fetchFn);
    if (latest) {
      writeJson(cachePath(homedirPath), { latest, checkedAt: now });
    }
  }

  return statusFor(current, latest, snoozed);
}

export function snoozeUpdate(deps: Pick<UpdateCheckDeps, 'now' | 'homedir'> = {}): void {
  const now = (deps.now ?? Date.now)();
  const homedirPath = (deps.homedir ?? osHomedir)();
  const path = configPath(homedirPath);
  const config = readJsonObject(path) ?? {};
  config.updateSnoozedUntil = now + UPDATE_SNOOZE_MS;
  writeJson(path, config);
}
