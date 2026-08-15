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

/**
 * Zod exposes these publicly. Reaching into `_def` is what produced the bugs this
 * helper exists to avoid: `_def.typeName` is undefined here, `_def.values` is
 * undefined for enums (members live on `.options`), and `_def.type` is the string
 * "array" rather than the element schema. Each wrong guess degraded silently to a
 * default that the schema then rejected, dropping the tool from every sweep.
 */
export type Schema = {
  constructor?: { name?: string };
  shape?: Record<string, Schema>;
  element?: Schema;
  options?: Schema[] | string[];
  unwrap?: () => Schema;
  safeParse?: (value: unknown) => { success: boolean };
};

export type ToolLike = { name: string; inputSchema?: { shape?: Record<string, Schema> } };

const kindOf = (s: Schema): string => s?.constructor?.name ?? '';

/** Does this schema accept the value? The only question that actually matters. */
export const accepts = (schema: Schema, value: unknown): boolean => {
  if (typeof schema?.safeParse !== 'function') return true;
  try {
    return schema.safeParse(value).success;
  } catch {
    return false;
  }
};

/** Values that must stay plausible or the tool rejects before emitting anything. */
const NUMERIC: Record<string, number> = {
  width: 1920, height: 1080, frameRate: 25, speed: 100, volume: 0, opacity: 100,
  scale: 100, rotation: 0, level: 0, trackIndex: 0, time: 1, newTime: 2,
  splitTime: 1, duration: 1,
};

/** Tried in order against the field's own schema; the first accepted one wins. */
const CANDIDATES: unknown[] = [
  'x', '0', '1', 'video', 'audio', 'green', 'start', 'end', 'png', 'both',
  'Cross Dissolve', '/tmp/f.xml', '00:00:01:00', 'true', 'none', 'default',
  1, 0, true, false, [], {}, null,
];

/** Preferred value where several are legal and one exercises more of the tool. */
const STRINGY: Record<string, string> = { position: 'end', format: 'png' };

/** A structural guess, from public accessors only. */
function shapedGuess(schema: Schema, key: string): unknown {
  switch (kindOf(schema)) {
    case 'ZodOptional':
    case 'ZodNullable':
    case 'ZodDefault': {
      const inner = typeof schema.unwrap === 'function' ? schema.unwrap() : undefined;
      return inner ? seed(inner, key) : 'x';
    }
    case 'ZodArray':
      return [schema.element ? seed(schema.element, key) : 'x'];
    case 'ZodObject': {
      const out: Record<string, unknown> = {};
      for (const [k, v] of Object.entries(schema.shape ?? {})) out[k] = seed(v, k);
      return out;
    }
    case 'ZodUnion': {
      const first = (schema.options ?? [])[0];
      return first && typeof first === 'object' ? seed(first as Schema, key) : 'x';
    }
    case 'ZodEnum': {
      const members = (schema.options ?? []) as string[];
      return members.length ? members[0] : 'x';
    }
    case 'ZodNumber':
      return NUMERIC[key] ?? 1;
    case 'ZodBoolean':
      return true;
    default:
      return STRINGY[key] ?? 'x';
  }
}

/**
 * A value the schema accepts.
 *
 * The structural guess is checked rather than trusted: if an accessor is wrong for
 * this zod build, the guess is rejected and candidates are tried instead, so a
 * mis-read schema costs a slower path rather than a silently dropped tool.
 */
export function seed(schema: Schema, key = ''): unknown {
  const guess = shapedGuess(schema, key);
  if (accepts(schema, guess)) return guess;

  const preferred = STRINGY[key];
  if (preferred !== undefined && accepts(schema, preferred)) return preferred;
  for (const candidate of CANDIDATES) if (accepts(schema, candidate)) return candidate;
  return guess;
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

  const schema = tool.inputSchema as unknown as Schema | undefined;
  if (!schema || accepts(schema, args)) return args;

  // Some tools carry cross-field rules that supplying everything violates -- 
  // trim_clip refuses outPoint and duration together. Drop one optional at a
  // time until the whole object is accepted, so the tool still emits instead of
  // dropping out of every sweep.
  const optionalKeys = Object.entries(shape)
    .filter(([, v]) => kindOf(v) === 'ZodOptional' || kindOf(v) === 'ZodDefault')
    .map(([k]) => k);

  for (const key of optionalKeys) {
    const trimmed = { ...args };
    delete trimmed[key];
    if (accepts(schema, trimmed)) return trimmed;
  }
  return args;
}

/** Only the parameters a tool actually requires, so omitted-branch code is emitted too. */
export function seedRequiredArgs(tool: ToolLike): Record<string, unknown> {
  const shape = tool.inputSchema?.shape ?? {};
  const args: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(shape)) {
    if (kindOf(v) === 'ZodOptional' || kindOf(v) === 'ZodDefault') continue;
    args[k] = seed(v, k);
  }
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
