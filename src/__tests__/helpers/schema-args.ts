/**
 * Building arguments for every tool, from its schema.
 *
 * Shared by the injection and undefined-identifier guards. Both used to drive
 * tools from a hand-maintained argument map, which decided what they could see:
 * a key missing from the map meant the branch guarded by that key was never
 * emitted, so a defect inside it was invisible while the suite stayed green.
 *
 * Nothing here dispatches on `_def.typeName`. It is `undefined` in this zod
 * build, and a guard that relied on it silently degraded to a default for every
 * field — reaching a third of the tools a working dispatch reaches.
 */

export type Schema = {
  constructor?: { name?: string };
  shape?: Record<string, Schema>;
  element?: Schema;
  _def?: {
    innerType?: Schema; type?: Schema; element?: Schema;
    values?: unknown[]; options?: Schema[];
  };
};

export type ToolLike = { name: string; inputSchema?: { shape?: Record<string, Schema> } };

const kindOf = (s: Schema): string => s?.constructor?.name ?? '';

/** The element schema of an array, across the spellings this zod build uses. */
const elementOf = (s: Schema): Schema | undefined => s._def?.type ?? s._def?.element ?? s.element;

/** Values that must stay plausible or the tool rejects before emitting anything. */
const NUMERIC: Record<string, number> = {
  width: 1920, height: 1080, frameRate: 25, speed: 100, volume: 0, opacity: 100,
  scale: 100, rotation: 0, level: 0, trackIndex: 0, time: 1, newTime: 2,
  splitTime: 1, duration: 1,
};

/**
 * Candidate strings, tried in order against the field's own schema.
 *
 * Several string parameters carry a regex or refinement — `color` is
 * `/^[0-7]$/` — and a value that fails it is rejected before the tool emits
 * anything, so the tool drops out of the sweep silently. Rather than keep a map
 * of field name to legal value and let it rot, each candidate is offered to the
 * schema and the first one it accepts is used.
 */
const CANDIDATES = [
  'x', '0', '1', 'video', 'audio', 'green', 'start', 'end', 'png', 'both',
  'Cross Dissolve', '/tmp/f.xml', '00:00:01:00', 'true', 'none', 'default',
];

/** Preferred value where several are legal and one exercises more of the tool. */
const STRINGY: Record<string, string> = { position: 'end', format: 'png' };

const accepts = (schema: Schema, value: unknown): boolean => {
  const parser = schema as unknown as { safeParse?: (v: unknown) => { success: boolean } };
  if (typeof parser.safeParse !== 'function') return true;
  try {
    return parser.safeParse(value).success;
  } catch {
    return false;
  }
};

/** The first candidate this schema accepts, preferring a named override. */
function stringFor(schema: Schema, key: string): string {
  const preferred = STRINGY[key];
  if (preferred !== undefined && accepts(schema, preferred)) return preferred;
  for (const candidate of CANDIDATES) if (accepts(schema, candidate)) return candidate;
  return preferred ?? 'x';
}

/** A valid-looking value for one schema node. */
export function seed(schema: Schema, key = ''): unknown {
  switch (kindOf(schema)) {
    case 'ZodOptional':
    case 'ZodNullable':
    case 'ZodDefault':
      return schema._def?.innerType ? seed(schema._def.innerType, key) : 'x';
    case 'ZodArray': {
      const element = elementOf(schema);
      return [element ? seed(element, key) : 'x'];
    }
    case 'ZodObject': {
      const out: Record<string, unknown> = {};
      for (const [k, v] of Object.entries(schema.shape ?? {})) out[k] = seed(v, k);
      return out;
    }
    case 'ZodUnion': {
      const first = schema._def?.options?.[0];
      return first ? seed(first, key) : 'x';
    }
    case 'ZodEnum':
      return (schema._def?.values ?? ['start'])[0];
    case 'ZodNumber':
      return NUMERIC[key] ?? 1;
    case 'ZodBoolean':
      return true;
    default:
      return stringFor(schema, key);
  }
}

/**
 * Every declared parameter populated, optionals included.
 *
 * Optionals matter most: a tool that emits `${comment ? ... : ''}` only reveals
 * that branch when `comment` is supplied.
 */
export function seedArgs(tool: ToolLike): Record<string, unknown> {
  const shape = tool.inputSchema?.shape ?? {};
  const args: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(shape)) args[k] = seed(v, k);
  return args;
}

/** Every path in a seeded value that holds a string, as a list of keys/indices. */
export function stringPaths(value: unknown, prefix: (string | number)[] = []): (string | number)[][] {
  if (typeof value === 'string') return [prefix];
  if (Array.isArray(value)) return value.flatMap((v, i) => stringPaths(v, [...prefix, i]));
  if (value && typeof value === 'object') {
    return Object.entries(value).flatMap(([k, v]) => stringPaths(v, [...prefix, k]));
  }
  return [];
}

/** A copy of `base` with `payload` substituted at `path`. */
export function withPayloadAt(base: unknown, path: (string | number)[], payload: string): unknown {
  if (path.length === 0) return payload;
  const [head, ...rest] = path;
  if (Array.isArray(base)) {
    const copy = [...base];
    copy[head as number] = withPayloadAt(copy[head as number], rest, payload);
    return copy;
  }
  const copy = { ...(base as Record<string, unknown>) };
  copy[head as string] = withPayloadAt(copy[head as string], rest, payload);
  return copy;
}
