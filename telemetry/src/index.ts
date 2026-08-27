const MAX_BODY_BYTES = 4096;
const EVENTS = new Set(['server_started', 'tool_called']);
const ERROR_KINDS = new Set([
  'timeout',
  'not_found',
  'validation',
  'evalscript',
  'connection',
  'unsupported',
  'unknown',
]);
const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const TOOL_RE = /^[a-z][a-z0-9_]{0,79}$/;
const VERSION_RE = /^\d{1,3}\.\d{1,3}\.\d{1,3}(?:-[0-9A-Za-z.-]{1,32})?$/;
const OS_RE = /^(darwin|win32|linux|android|aix|freebsd|openbsd|sunos|other)$/;
const ARCH_RE =
  /^(arm|arm64|ia32|loong64|mips|mipsel|ppc|ppc64|riscv64|s390|s390x|x64|other)$/;
const NODE_RE = /^v?\d{1,3}\.\d{1,3}\.\d{1,3}$/;
const ERROR_CODE_RE = /^[a-z][a-z0-9._]{0,63}$/;
const ERROR_FIELDS_RE = /^[A-Za-z0-9_.,]{1,120}$/;
const STATUS_RE = /^[a-z][a-z0-9_]{0,31}$/;
const PATH_LEAK_RE = /\/Users\/|\/home\/|[A-Za-z]:\\|file:\/\//i;

type StoredEvent = {
  distinct_id: string;
  session_id: string | null;
  event: string;
  tool: string | null;
  success: number | null;
  duration_ms: number | null;
  error_kind: string | null;
  error_code: string | null;
  error_fields: string | null;
  error_detail: string | null;
  retry: number | null;
  status: string | null;
  version: string | null;
  os: string | null;
  arch: string | null;
  node: string | null;
};

function json(status: number, body: unknown): Response {
  return Response.json(body, {
    status,
    headers: { 'cache-control': 'no-store' },
  });
}

function asRecord(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  return value as Record<string, unknown>;
}

function optionalString(
  value: unknown,
  pattern: RegExp,
): string | null | undefined {
  if (value === undefined) return undefined;
  if (value === null) return null;
  if (typeof value !== 'string' || value.length === 0) return null;
  return pattern.test(value) ? value : null;
}

function parseEvent(payload: unknown): StoredEvent | null {
  const record = asRecord(payload);
  if (!record) return null;

  const event = typeof record.event === 'string' ? record.event : '';
  if (!EVENTS.has(event)) return null;

  const distinctId = optionalString(record.distinct_id, UUID_RE);
  if (!distinctId) return null;

  const sessionId = optionalString(record.session_id, UUID_RE);
  if (sessionId === null && record.session_id !== undefined && record.session_id !== null) {
    return null;
  }

  let tool: string | null = null;
  if (event === 'tool_called') {
    if (typeof record.tool !== 'string' || !TOOL_RE.test(record.tool)) return null;
    tool = record.tool;
  } else if (record.tool !== undefined && record.tool !== null) {
    return null;
  }

  let success: number | null = null;
  if (event === 'tool_called') {
    if (typeof record.success !== 'boolean') return null;
    success = record.success ? 1 : 0;
  } else if (record.success !== undefined && record.success !== null) {
    return null;
  }

  let durationMs: number | null = null;
  if (event === 'tool_called') {
    if (
      typeof record.duration_ms !== 'number' ||
      !Number.isFinite(record.duration_ms) ||
      !Number.isInteger(record.duration_ms) ||
      record.duration_ms < 0 ||
      record.duration_ms > 600000
    ) {
      return null;
    }
    durationMs = record.duration_ms;
  } else if (record.duration_ms !== undefined && record.duration_ms !== null) {
    return null;
  }

  let errorKind: string | null = null;
  if (record.error_kind !== undefined && record.error_kind !== null) {
    if (typeof record.error_kind === 'string' && ERROR_KINDS.has(record.error_kind)) {
      errorKind = record.error_kind;
    } else {
      errorKind = 'unknown';
    }
  }

  let errorCode: string | null = null;
  if (typeof record.error_code === 'string' && ERROR_CODE_RE.test(record.error_code)) {
    errorCode = record.error_code;
  }

  let errorFields: string | null = null;
  if (typeof record.error_fields === 'string' && ERROR_FIELDS_RE.test(record.error_fields)) {
    errorFields = record.error_fields;
  }

  let errorDetail: string | null = null;
  if (
    typeof record.error_detail === 'string' &&
    record.error_detail.length > 0 &&
    record.error_detail.length <= 180 &&
    /^[\x20-\x7E]+$/.test(record.error_detail) &&
    !PATH_LEAK_RE.test(record.error_detail)
  ) {
    errorDetail = record.error_detail;
  }

  let retry: number | null = null;
  if (typeof record.retry === 'boolean') {
    retry = record.retry ? 1 : 0;
  }

  let status: string | null = null;
  if (typeof record.status === 'string' && STATUS_RE.test(record.status)) {
    status = record.status;
  }

  const version = optionalString(record.version, VERSION_RE) ?? null;
  const os = optionalString(record.os, OS_RE) ?? null;
  const arch = optionalString(record.arch, ARCH_RE) ?? null;
  const node = optionalString(record.node, NODE_RE) ?? null;

  return {
    distinct_id: distinctId,
    session_id: sessionId ?? null,
    event,
    tool,
    success,
    duration_ms: durationMs,
    error_kind: errorKind,
    error_code: errorCode,
    error_fields: errorFields,
    error_detail: errorDetail,
    retry,
    status,
    version,
    os,
    arch,
    node,
  };
}

export default {
  async fetch(request, env): Promise<Response> {
    if (request.method === 'GET' && new URL(request.url).pathname === '/health') {
      return json(200, { ok: true });
    }

    if (request.method !== 'POST' || new URL(request.url).pathname !== '/v1/event') {
      return json(404, { ok: false, error: 'not_found' });
    }

    const lengthHeader = request.headers.get('content-length');
    if (lengthHeader !== null) {
      const length = Number(lengthHeader);
      if (!Number.isFinite(length) || length < 0 || length > MAX_BODY_BYTES) {
        return json(413, { ok: false, error: 'payload_too_large' });
      }
    }

    const text = await request.text();
    if (text.length > MAX_BODY_BYTES) {
      return json(413, { ok: false, error: 'payload_too_large' });
    }

    let payload: unknown;
    try {
      payload = JSON.parse(text);
    } catch {
      return json(400, { ok: false, error: 'invalid_json' });
    }

    const event = parseEvent(payload);
    if (!event) {
      return json(400, { ok: false, error: 'invalid_event' });
    }

    try {
      await env.DB.prepare(
        `INSERT INTO events (
          distinct_id, session_id, event, tool, success, duration_ms,
          error_kind, error_code, error_fields, error_detail, retry, status,
          version, os, arch, node
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      )
        .bind(
          event.distinct_id,
          event.session_id,
          event.event,
          event.tool,
          event.success,
          event.duration_ms,
          event.error_kind,
          event.error_code,
          event.error_fields,
          event.error_detail,
          event.retry,
          event.status,
          event.version,
          event.os,
          event.arch,
          event.node,
        )
        .run();
    } catch {
      return json(500, { ok: false, error: 'store_failed' });
    }

    return new Response(null, { status: 204 });
  },
} satisfies ExportedHandler<Env>;
