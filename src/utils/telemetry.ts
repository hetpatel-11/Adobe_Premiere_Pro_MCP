import { randomUUID } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { homedir as osHomedir, platform as osPlatform, arch as osArch } from 'node:os';
import { dirname, join } from 'node:path';
import { PACKAGE_VERSION } from '../version.js';

export const DEFAULT_TELEMETRY_INGEST_URL =
  'https://adobe-premiere-mcp-telemetry.hetkp8044.workers.dev/v1/event';

export type TelemetryErrorKind =
  | 'timeout'
  | 'not_found'
  | 'validation'
  | 'evalscript'
  | 'connection'
  | 'unknown';

export type TelemetryEnv = NodeJS.Dict<string | undefined>;

export type TrackToolCallInput = {
  tool: string;
  success: boolean;
  durationMs: number;
  errorKind?: TelemetryErrorKind;
};

type TelemetryPayload = {
  event: 'server_started' | 'tool_called';
  distinct_id: string;
  session_id: string;
  version: string;
  os: string;
  arch: string;
  node: string;
  tool?: string;
  success?: boolean;
  duration_ms?: number;
  error_kind?: TelemetryErrorKind;
};

export type TelemetryDependencies = {
  env?: TelemetryEnv;
  homedir?: () => string;
  fetch?: typeof fetch;
  randomUUID?: () => string;
  platform?: string;
  arch?: string;
  nodeVersion?: string;
  packageVersion?: string;
  ingestUrl?: string;
};

const FALSE_VALUES = new Set(['0', 'false', 'off', 'no']);
const TRUE_VALUES = new Set(['1', 'true', 'on', 'yes']);
const TOOL_NAME_RE = /^[a-z][a-z0-9_]{0,79}$/;
const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const ALLOWED_OS = new Set([
  'darwin',
  'win32',
  'linux',
  'android',
  'aix',
  'freebsd',
  'openbsd',
  'sunos',
]);
const ALLOWED_ARCH = new Set([
  'arm',
  'arm64',
  'ia32',
  'loong64',
  'mips',
  'mipsel',
  'ppc',
  'ppc64',
  'riscv64',
  's390',
  's390x',
  'x64',
]);
const PAYLOAD_KEYS = new Set([
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
]);

function envFlag(env: TelemetryEnv, name: string): boolean | undefined {
  const raw = env[name];
  if (raw === undefined || raw === '') return undefined;
  const normalized = String(raw).trim().toLowerCase();
  if (FALSE_VALUES.has(normalized)) return false;
  if (TRUE_VALUES.has(normalized)) return true;
  return undefined;
}

function sanitizeToolName(name: string): string {
  return TOOL_NAME_RE.test(name) ? name : 'invalid_tool_name';
}

function sanitizeOs(value: string): string {
  return ALLOWED_OS.has(value) ? value : 'other';
}

function sanitizeArch(value: string): string {
  return ALLOWED_ARCH.has(value) ? value : 'other';
}

function sanitizeNodeVersion(value: string): string {
  const match = value.match(/v?(\d{1,3}\.\d{1,3}\.\d{1,3})/);
  return match?.[1] ? `v${match[1]}` : 'v0.0.0';
}

function sanitizeDurationMs(value: number): number {
  if (!Number.isFinite(value) || value < 0) return 0;
  return Math.min(Math.round(value), 600000);
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

function configTelemetryEnabled(homedirPath: string): boolean {
  const config = readJsonObject(join(homedirPath, '.premiere-mcp-bridge', 'config.json'));
  return config?.telemetry !== false;
}

export function classifyToolError(message: string | undefined): TelemetryErrorKind {
  if (!message) return 'unknown';
  const normalized = message.toLowerCase();
  if (normalized.includes('timed out') || normalized.includes('timeout')) return 'timeout';
  if (normalized.includes('invalid argument')) return 'validation';
  if (normalized.includes('evalscript') || normalized.includes('extendscript')) return 'evalscript';
  if (
    normalized.includes('not connected') ||
    normalized.includes('bridge is not') ||
    (normalized.includes('bridge') && normalized.includes('connect'))
  ) {
    return 'connection';
  }
  if (normalized.includes('not found') || normalized.includes('no such')) return 'not_found';
  return 'unknown';
}

export function isTelemetryEnabled(
  env: TelemetryEnv = process.env,
  configTelemetry = true,
): boolean {
  if (env.JEST_WORKER_ID && envFlag(env, 'PREMIERE_MCP_TELEMETRY') !== true) {
    return false;
  }
  const explicit = envFlag(env, 'PREMIERE_MCP_TELEMETRY');
  if (explicit === false) return false;
  if (explicit === true) return true;
  if (envFlag(env, 'DO_NOT_TRACK') === true) return false;
  return configTelemetry;
}

function assertAllowlistedPayload(payload: TelemetryPayload): void {
  for (const key of Object.keys(payload)) {
    if (!PAYLOAD_KEYS.has(key)) {
      throw new Error(`Refusing to send telemetry field '${key}'`);
    }
  }
}

export class Telemetry {
  private readonly env: TelemetryEnv;
  private readonly homedir: () => string;
  private readonly fetchImpl: typeof fetch;
  private readonly randomUUIDImpl: () => string;
  private readonly platform: string;
  private readonly arch: string;
  private readonly nodeVersion: string;
  private readonly packageVersion: string;
  private readonly ingestUrl: string;
  private readonly sessionId: string;
  private readonly pending = new Set<Promise<void>>();
  private installId: string | undefined;

  constructor(dependencies: TelemetryDependencies = {}) {
    this.env = dependencies.env ?? process.env;
    this.homedir = dependencies.homedir ?? osHomedir;
    this.fetchImpl = dependencies.fetch ?? fetch;
    this.randomUUIDImpl = dependencies.randomUUID ?? randomUUID;
    this.platform = sanitizeOs(dependencies.platform ?? osPlatform());
    this.arch = sanitizeArch(dependencies.arch ?? osArch());
    this.nodeVersion = sanitizeNodeVersion(dependencies.nodeVersion ?? process.version);
    this.packageVersion = dependencies.packageVersion ?? PACKAGE_VERSION;
    const envIngestUrl = this.env.PREMIERE_MCP_TELEMETRY_URL;
    this.ingestUrl =
      dependencies.ingestUrl ??
      (typeof envIngestUrl === 'string' && envIngestUrl.length > 0
        ? envIngestUrl
        : DEFAULT_TELEMETRY_INGEST_URL);
    this.sessionId = this.randomUUIDImpl();
  }

  enabled(): boolean {
    return isTelemetryEnabled(this.env, configTelemetryEnabled(this.homedir()));
  }

  trackServerStarted(): void {
    if (!this.enabled()) return;
    this.enqueue({
      event: 'server_started',
      distinct_id: this.getInstallId(),
      session_id: this.sessionId,
      version: this.packageVersion,
      os: this.platform,
      arch: this.arch,
      node: this.nodeVersion,
    });
  }

  trackToolCall(input: TrackToolCallInput): void {
    if (!this.enabled()) return;
    const payload: TelemetryPayload = {
      event: 'tool_called',
      distinct_id: this.getInstallId(),
      session_id: this.sessionId,
      version: this.packageVersion,
      os: this.platform,
      arch: this.arch,
      node: this.nodeVersion,
      tool: sanitizeToolName(input.tool),
      success: input.success,
      duration_ms: sanitizeDurationMs(input.durationMs),
    };
    if (input.errorKind) {
      payload.error_kind = input.errorKind;
    }
    this.enqueue(payload);
  }

  async flush(): Promise<void> {
    if (this.pending.size === 0) return;
    await Promise.allSettled(this.pending);
  }

  private readInstallId(idPath: string): string | undefined {
    try {
      if (!existsSync(idPath)) return undefined;
      const existing = readFileSync(idPath, 'utf8').trim();
      return UUID_RE.test(existing) ? existing : undefined;
    } catch {
      return undefined;
    }
  }

  private getInstallId(): string {
    if (this.installId) return this.installId;
    const idPath = join(this.homedir(), '.premiere-mcp-bridge', 'install-id');
    const existing = this.readInstallId(idPath);
    if (existing) {
      this.installId = existing;
      return existing;
    }
    const created = this.randomUUIDImpl();
    try {
      mkdirSync(dirname(idPath), { recursive: true });
      writeFileSync(idPath, `${created}\n`, { encoding: 'utf8', flag: 'wx' });
      this.installId = created;
      return created;
    } catch {
      const raced = this.readInstallId(idPath);
      if (raced) {
        this.installId = raced;
        return raced;
      }
      try {
        writeFileSync(idPath, `${created}\n`, { encoding: 'utf8' });
      } catch {
        // Keep an in-memory id for this process if the file cannot be written.
      }
      this.installId = created;
      return created;
    }
  }

  private enqueue(payload: TelemetryPayload): void {
    if (!this.enabled()) return;
    assertAllowlistedPayload(payload);
    const task = this.send(payload).finally(() => {
      this.pending.delete(task);
    });
    this.pending.add(task);
  }

  private async send(payload: TelemetryPayload): Promise<void> {
    try {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), 3000);
      try {
        await this.fetchImpl(this.ingestUrl, {
          method: 'POST',
          headers: {
            'content-type': 'application/json',
            'user-agent': `adobe-premiere-pro-mcp/${this.packageVersion} telemetry`,
          },
          body: JSON.stringify(payload),
          signal: controller.signal,
        });
      } finally {
        clearTimeout(timer);
      }
    } catch {
      if (envFlag(this.env, 'PREMIERE_MCP_TELEMETRY_DEBUG') === true) {
        console.error('[telemetry] send failed');
      }
    }
  }
}

let singleton: Telemetry | undefined;

export function getTelemetry(): Telemetry {
  if (!singleton) singleton = new Telemetry();
  return singleton;
}

export function resetTelemetryForTests(): void {
  singleton = undefined;
}
