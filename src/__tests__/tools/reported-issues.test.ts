import { executeExpandedTool } from '../../tools/expanded.js';

async function caseBlock(tool: string, args: Record<string, unknown>): Promise<string> {
  let script = '';
  const bridge = { executeScript: async (source: string) => { script = source; return { success: true }; } };
  await executeExpandedTool(bridge as any, tool, args);
  const start = script.indexOf(`case "${tool}":`);
  expect(start).toBeGreaterThan(-1);
  const lines = script.slice(start).split('\n');
  const body: string[] = [];
  let seenStatement = false;
  for (const line of lines) {
    if (/^\s*case "/.test(line) && seenStatement) break;
    if (!/^\s*case "/.test(line) && line.trim()) seenStatement = true;
    body.push(line);
  }
  return body.join('\n');
}

describe('reported Premiere issues', () => {
  it('ripple_delete does not claim a ripple until later clips and linked audio are checked', async () => {
    const block = await caseBlock('ripple_delete', { clipId: 'clip-1' });
    expect(block).toContain('rippleClip.clip.remove(false, true)');
    expect(block).not.toContain('rippleClip.clip.remove(true, true)');
    expect(block).toContain('Linked audio is still on the timeline');
    expect(block).toContain('later clips did not ripple');
    expect(block).toContain('shiftInfo.clip.move(-rippleGap)');
    expect(block).not.toContain('shiftInfo.clip.move(rippleStart - valueOfTime(shiftInfo.clip.start))');
    const verified = block.indexOf('ripple: true, verified: true');
    const unchecked = block.indexOf('return ok({ removed: true, ripple: true, clipId:');
    expect(verified).toBeGreaterThan(-1);
    expect(unchecked).toBe(-1);
  });

  it('add_adjustment_layer places a real project item across the requested range', async () => {
    const block = await caseBlock('add_adjustment_layer', { endTime: 10, startTime: 2 });
    expect(block).not.toContain('generated_transparent_png');
    expect(block).not.toContain('createAdjustmentLayer');
    expect(block).toContain('File > New > Adjustment Layer');
    expect(block).toContain('args.endTime');
    expect(block).toContain('isSequence');
    expect(block).toContain('adjTrack.overwriteClip(adjItem, adjStart)');
    expect(block).toContain('mediaType: "adjustment_layer"');
  });
});
