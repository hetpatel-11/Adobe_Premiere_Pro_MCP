/**
 * The argument seeder must produce arguments the tools accept.
 *
 * Every guard in this suite drives tools through this helper, so when it produces
 * a value a schema rejects, that tool emits nothing and drops out of *all* of them
 * silently. Nothing goes red; coverage just quietly shrinks. That has now happened
 * three times, each from reading a zod internal that is wrong in this build:
 *
 *   _def.typeName  undefined, so every field became the string "x"
 *   _def.values    undefined for enums, so all 20 enum fields got "start"
 *   _def.type      the string "array", not the element schema
 *
 * Guarding the accessors individually would only catch the ones I thought to
 * check. This asserts the property that actually matters and is independent of how
 * the seeder is written: whatever it produces, the schema takes it.
 */

import { PremiereProTools } from '../../tools/index.js';
import { seedArgs, seedRequiredArgs, accepts } from '../helpers/schema-args.js';

describe('seeded arguments', () => {
  const tools = new PremiereProTools({ executeScript: async () => ({ success: true }) } as never)
    .getAvailableTools();

  it('are accepted by the schema of every tool', () => {
    const rejected: string[] = [];

    for (const tool of tools) {
      const schema = (tool as { inputSchema?: { safeParse?: (v: unknown) => { success: boolean } } })
        .inputSchema;
      if (typeof schema?.safeParse !== 'function') continue;
      if (!accepts(schema as never, seedArgs(tool as never))) rejected.push(tool.name);
    }

    expect(rejected).toEqual([]);
  });

  it('are accepted when only the required parameters are supplied', () => {
    // detect_silence is excluded by construction, not by convenience: it requires
    // one of mediaPath or projectItemId and both are optional, so an object
    // holding only required fields cannot satisfy it.
    const CANNOT_BE_SATISFIED_BY_REQUIRED_ONLY = new Set(['detect_silence']);
    const rejected: string[] = [];

    for (const tool of tools) {
      const schema = (tool as { inputSchema?: { safeParse?: (v: unknown) => { success: boolean } } })
        .inputSchema;
      if (typeof schema?.safeParse !== 'function') continue;
      if (CANNOT_BE_SATISFIED_BY_REQUIRED_ONLY.has(tool.name)) continue;
      if (!accepts(schema as never, seedRequiredArgs(tool as never))) rejected.push(tool.name);
    }

    expect(rejected).toEqual([]);
  });

  it('give every enum a member of that enum', () => {
    // The failure that motivated this: enums fell back to the literal "start",
    // which 19 of 20 enum fields reject, taking those tools out of every sweep.
    const wrong: string[] = [];

    for (const tool of tools) {
      const shape = (tool as { inputSchema?: { shape?: Record<string, unknown> } }).inputSchema?.shape ?? {};
      const args = seedArgs(tool as never);
      for (const [key, field] of Object.entries(shape)) {
        const inner = field as { constructor?: { name?: string }; unwrap?: () => unknown };
        const kind = inner?.constructor?.name;
        const target = kind === 'ZodOptional' && typeof inner.unwrap === 'function'
          ? (inner.unwrap() as { constructor?: { name?: string } })
          : inner;
        if (target?.constructor?.name !== 'ZodEnum') continue;
        if (!accepts(target as never, args[key])) wrong.push(`${tool.name}.${key}`);
      }
    }

    expect(wrong).toEqual([]);
  });

  it('reach a meaningful share of the tools with a script', async () => {
    // A floor on tools that actually EMIT, not on schema arithmetic: the previous
    // floor counted tools with a string position and would have been satisfied
    // while a third of them silently emitted nothing.
    let emitted = 0;

    for (const tool of tools) {
      let script = '';
      const driver = new PremiereProTools({
        executeScript: async (s: string) => { script = s; return { success: true }; },
      } as never);
      try {
        await driver.executeTool(tool.name, seedArgs(tool as never));
      } catch {
        // Handlers that never reach the bridge are fine.
      }
      if (script) emitted++;
    }

    expect(emitted).toBeGreaterThan(230);
  }, 300_000);
});
