import vm from 'vm';
import { executeExpandedTool, getExpandedTools } from '../../tools/expanded.js';

describe('batch_apply_effect clip scope', () => {
  const run = async (clips: unknown) => {
    const added: string[] = [];
    const items = ['target', 'other-video', 'other-audio'].map((nodeId, index) => ({
      nodeId,
      start: { ticks: String(index * 254016000000) },
    }));
    const collection = (item: unknown) => ({ numItems: 1, 0: item });
    const sequence = {
      sequenceID: 'seq', name: 'Sequence',
      videoTracks: { numTracks: 1, 0: { clips: { numItems: 2, 0: items[0], 1: items[1] } } },
      audioTracks: { numTracks: 1, 0: { clips: collection(items[2]) } },
    };
    const qeTrack = (prefix: string) => ({
      numItems: 2,
      getItemAt: (index: number) => ({
        start: { ticks: String(index * 254016000000) },
        addVideoEffect: () => added.push(`${prefix}-${index}`),
        addAudioEffect: () => added.push(`${prefix}-${index}`),
      }),
    });
    const qeSequence = {
      guid: 'seq',
      getVideoTrackAt: () => qeTrack('video'),
      getAudioTrackAt: () => qeTrack('audio'),
    };
    const sandbox = {
      app: {
        enableQE: () => {},
        project: { activeSequence: sequence, sequences: { numSequences: 1, 0: sequence } },
      },
      qe: { project: {
        numSequences: 1,
        getSequenceAt: () => qeSequence,
        getVideoEffectByName: () => ({ name: 'Lumetri Color' }),
        getAudioEffectByName: () => ({ name: 'Lumetri Color' }),
      } },
      __idsMatch: (a: unknown, b: unknown) => String(a) === String(b),
      __findQeClipByDomClip: (_track: unknown, clip: { nodeId: string }) => ({
        addVideoEffect: () => added.push(clip.nodeId),
        addAudioEffect: () => added.push(clip.nodeId),
      }),
    };
    const bridge = {
      executeScript: async (script: string) => JSON.parse(vm.runInNewContext(`(function(){${script}})()`, sandbox, { timeout: 2000 })),
    };
    const result = await executeExpandedTool(bridge as any, 'batch_apply_effect', { clips, effectName: 'Lumetri Color' });
    return { result, added };
  };

  it('only applies to the requested timeline clip, not every video and audio item', async () => {
    const { result, added } = await run([{ clipId: 'target' }]);

    expect(result.success).toBe(true);
    expect(result.data.results).toEqual([{ clipId: 'target', ok: true }]);
    expect(added).toEqual(['target']);
  });

  it('accepts string IDs and avoids applying twice to repeated IDs', async () => {
    const { result, added } = await run(['target', { clipId: 'target' }, 'other-audio']);

    expect(result.success).toBe(true);
    expect(result.data.results).toEqual([
      { clipId: 'target', ok: true },
      { clipId: 'other-audio', ok: true },
    ]);
    expect(added).toEqual(['target', 'other-audio']);
  });

  it('rejects missing IDs before changing any clip', async () => {
    const { result, added } = await run(['target', 'missing']);

    expect(result.success).toBe(false);
    expect(result.error).toContain('missing');
    expect(added).toEqual([]);
  });

  it('requires an explicit non-empty list in the tool schema and runtime', async () => {
    const schema = getExpandedTools(new Set()).find((tool) => tool.name === 'batch_apply_effect')!.inputSchema;
    expect(schema.safeParse({ effectName: 'Lumetri Color' }).success).toBe(false);
    expect(schema.safeParse({ clips: [], effectName: 'Lumetri Color' }).success).toBe(false);
    expect(schema.safeParse({ clips: ['target'], effectName: 'Lumetri Color' }).success).toBe(true);

    const { result, added } = await run(undefined);
    expect(result.success).toBe(false);
    expect(added).toEqual([]);
  });
});
