/**
 * A NUL in a tool argument has to be refused at the tool layer.
 *
 * The bridge already refuses a NUL in the script text, but that guard never
 * fires for this: JSON.stringify turns the NUL into a \u0000 escape on the way
 * into the generated script, so the script the bridge inspects is clean and only
 * the host ever sees the real character. Premiere then truncates the string at
 * the first NUL on assignment and reports success for the shortened value.
 *
 * executeTool holds the caller's actual value and is the last place that can
 * tell the difference, so these drive it rather than the exported helper alone.
 */

import { PremiereProTools, findNulByteArgument } from '../../tools/index.js';

const NUL = '\u0000';

const toolsWith = (capture: { script?: string }): PremiereProTools =>
  new PremiereProTools({
    executeScript: async (s: string) => { capture.script = s; return { success: true }; },
  } as never);

describe('arguments containing a NUL', () => {
  it('are refused before anything reaches the host', async () => {
    const capture: { script?: string } = {};
    const tools = toolsWith(capture);

    const result = await tools.executeTool('create_bin', { name: `p${NUL}q` });

    expect(result.success).toBe(false);
    expect(result.error).toMatch(/NUL/);
    // The point of the guard: nothing was sent, so nothing was truncated.
    expect(capture.script).toBeUndefined();
  });

  it('name the argument that carried it', async () => {
    const tools = toolsWith({});

    const result = await tools.executeTool('create_bin', { name: `p${NUL}q` });

    expect(result.error).toContain("'name'");
  });

  it('are found inside nested objects and arrays', () => {
    expect(findNulByteArgument({ a: { b: [`x${NUL}`] } })).toBe('a.b[0]');
    expect(findNulByteArgument({ settings: { title: 'clean' } })).toBeNull();
  });

  it('do not reject an ordinary argument', async () => {
    const capture: { script?: string } = {};
    const tools = toolsWith(capture);

    const result = await tools.executeTool('create_bin', { name: 'Ordinary Bin' });

    expect(result.success).not.toBe(false);
    expect(capture.script).toBeDefined();
  });
});
