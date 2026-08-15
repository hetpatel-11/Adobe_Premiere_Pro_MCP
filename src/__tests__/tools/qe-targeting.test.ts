/**
 * The half-finished sweeps.
 *
 * Two rewrites in this branch — "address the sequence the caller asked for" and
 * "match QE items by start time, not DOM index" — were applied at the tool call
 * sites and missed the shared helpers and a few stragglers. An independent audit
 * executed the generated scripts against a mock host and showed the leftovers
 * still mutating the wrong clip in the wrong sequence while reporting success.
 *
 * Every test here was confirmed to fail when its fix is reverted.
 */

import { PremiereProTools } from '../../tools/index.js';
import { executeExpandedTool } from '../../tools/expanded.js';

describe('QE targeting, second pass', () => {
  const expandedScript = async (name: string): Promise<string> => {
    let script = '';
    const bridge = { executeScript: async (s: string) => { script = s; return { success: true }; } };
    try { await executeExpandedTool(bridge as any, name, {}); } catch { /* arg guards are fine */ }
    return script;
  };

  /**
   * The block for one tool inside the shared script.
   *
   * All 171 expanded tools emit the same ~123 KB body, differing only in the tool
   * name near the top, so asserting `toContain` against the whole script says
   * nothing about the tool under test: `sequenceRequestError()` appears in it 39
   * times no matter which tool asked. Every case below therefore passed while the
   * silent active-sequence fallback was restored in one of them.
   */
  /**
   * Naming the shapes of the fallback did not work. Two spellings were listed,
   * `x || activeSequence()` and `if (!x) x = activeSequence()`, and a third —
   * `x = x ? x : activeSequence()` — walked straight past both; the second group
   * of cases had never been given the check at all, so even a listed spelling
   * survived there. These blocks resolve through `targetSequence()`, which already
   * handles an absent id, so none of them has any business naming the active
   * sequence directly: all ten contain it zero times. Asserting its absence is
   * independent of how a fallback might be written.
   */
  const caseBlock = (script: string, tool: string): string => {
    const start = script.indexOf(`case "${tool}":`);
    expect(start).toBeGreaterThan(-1);

    // Several tools share one body through consecutive case labels
    // (`case "insert_from_source":` sits directly above `case
    // "overwrite_from_source":`). Cutting at the next label would return an empty
    // block and assert nothing, so leading labels are consumed first and the
    // block ends at the next label that follows actual statements.
    const lines = script.slice(start).split('\n');
    const isLabel = (line: string): boolean => /^\s*case "/.test(line);
    const body: string[] = [];
    let seenStatement = false;
    for (const line of lines) {
      if (isLabel(line) && seenStatement) break;
      if (!isLabel(line) && line.trim()) seenStatement = true;
      body.push(line);
    }

    const block = body.join('\n');
    // A block that collapsed to nothing would make every assertion below vacuous.
    expect(seenStatement).toBe(true);
    expect(block.length).toBeGreaterThan(40);
    return block;
  };

  describe('shared helpers', () => {
    it('qeClipForClip resolves the clip own sequence, not the active one', async () => {
      // This helper feeds set_frame_blend, set_time_interpolation, set_clip_volume,
      // set_clip_pan and set_clip_opacity. While it used getActiveSequence() every
      // one of them mutated whatever sat at that index on screen.
      const script = await expandedScript('set_frame_blend');
      const body = script.slice(script.indexOf('function qeClipForClip'), script.indexOf('function markerCollectionForTool'));

      expect(body).toContain('qeSequenceFor(found.sequence)');
      expect(body).not.toContain('qe.project.getActiveSequence()');
    });

    it('qeClipForClip matches the QE item by start time, not by index', async () => {
      const script = await expandedScript('set_frame_blend');
      const body = script.slice(script.indexOf('function qeClipForClip'), script.indexOf('function markerCollectionForTool'));

      expect(body).toContain('__findQeClipByDomClip(qeTrack, found.clip)');
      expect(body).not.toContain('getItemAt(found.clipIndex)');
    });
  });

  describe('stragglers', () => {
    it('set_clip_speed_qe addresses the requested sequence', async () => {
      const script = await expandedScript('set_clip_speed_qe');

      expect(script).toContain('qeSequenceFor(speedClip.sequence)');
      expect(script).not.toContain('var speedQeSeq = qe.project.getActiveSequence()');
      expect(script).not.toContain('getItemAt(speedClip.clipIndex)');
    });

    it('batch_apply_effect matches items by start time', async () => {
      const script = await expandedScript('batch_apply_effect');

      expect(script).toContain('__findQeClipByDomClip(qeBatchTrack,');
      expect(script).not.toContain('getItemAt(batchClips[bai].clipIndex)');
    });

    it('expanded.ts has no getActiveSequence left outside the guid-checked fallback', async () => {
      const script = await expandedScript('set_frame_blend');
      const helper = script.slice(script.indexOf('function qeSequenceFor'));
      const inFallback = helper.slice(0, helper.indexOf('function ', 10));

      // Count code only. Comments in the generated script mention the call by
      // name to explain what replaced it, and a naive count picks those up.
      const code = script.split('\n').filter((l) => !l.trim().startsWith('//')).join('\n');
      const total = (code.match(/qe\.project\.getActiveSequence\(\)/g) || []).length;
      expect(total).toBe(1);
      expect(inFallback).toContain('String(activeCandidate.guid) === String(seq.sequenceID)');
    });
  });

  describe('tools that took a sequenceId and ignored it', () => {
    it.each([
      'rename_track', 'set_target_track', 'get_track_info', 'get_target_tracks',
      'insert_from_source', 'unnest_sequence', 'get_clip_at_playhead',
    ])('%s resolves the requested sequence', async (tool) => {
      const block = caseBlock(await expandedScript(tool), tool);

      expect(block).toContain('var seqErr = sequenceRequestError();');
      expect(block).toContain('targetSequence()');
      expect(block).not.toContain('activeSequence()');
    });

    it.each([
      'get_timeline_summary', 'get_total_clip_count', 'get_sequence_structure',
    ])('%s rejects an id that does not resolve', async (tool) => {
      // These answered a stale id with success:true and a null sequence, which a
      // caller cannot tell apart from a genuinely empty one.
      const block = caseBlock(await expandedScript(tool), tool);

      expect(block).toContain('var seqErr = sequenceRequestError();');
      expect(block).not.toContain('activeSequence()');
    });
  });

  describe('split_clip timecode', () => {
    it('takes the frame rate from the clip own sequence', async () => {
      const bridge = { executeScript: jest.fn().mockResolvedValue({ success: true }) };
      const tools = new PremiereProTools(bridge as any);
      await tools.executeTool('split_clip', { clipId: 'c', splitTime: 12.5 });
      const script = bridge.executeScript.mock.calls[0][0] as string;

      expect(script).toContain('var seq = info.sequence;');
      expect(script).not.toContain('var seq = app.project.activeSequence;');
    });
  });

  describe('move_clip', () => {
    it('rejects a leftover newTrackIndex instead of dropping it', async () => {
      const bridge = { executeScript: jest.fn().mockResolvedValue({ success: true }) };
      const tools = new PremiereProTools(bridge as any);

      const result = await tools.executeTool('move_clip', {
        clipId: 'c', newTime: 1, newTrackIndex: 3,
      });

      expect(result.success).toBe(false);
      expect(bridge.executeScript).not.toHaveBeenCalled();
    });
  });

  describe('remaining uncovered fixes', () => {
    /** All three could be reverted with the suite staying green. */
    it('toggle_track_visibility sets track output, not targeting', async () => {
      const bridge = { executeScript: jest.fn().mockResolvedValue({ success: true }) };
      const tools = new PremiereProTools(bridge as any);
      await tools.executeTool('toggle_track_visibility', {
        sequenceId: 'seq', trackIndex: 0, visible: false,
      });
      const script = bridge.executeScript.mock.calls[0][0] as string;

      // setTargeted is the V1/A1 patch button; the eye is setMute on a video track.
      expect(script).toContain('visibilityTrack.setMute(');
      expect(script).not.toContain('.setTargeted(');
      // Assignment is not evidence of effect anywhere else in this API.
      expect(script).toContain('isMuted()');
    });

    it('set_sequence_pixel_aspect_ratio sends a ratio string, not a number', async () => {
      // videoPixelAspectRatio throws "Illegal Parameter type" for a number, which
      // is why this tool never worked at all.
      const script = await expandedScript('set_sequence_pixel_aspect_ratio');

      expect(script).toContain('parRatioString(');
      expect(script).not.toContain('videoPixelAspectRatio = Number(');
    });

    it('parRatioString reduces a decimal to an exact fraction', async () => {
      const script = await expandedScript('set_sequence_pixel_aspect_ratio');
      const body = script.slice(script.indexOf('function parRatioString'));

      expect(body).toContain('function gcd');
      expect(body).toContain('indexOf(":")');
    });
  });
});
