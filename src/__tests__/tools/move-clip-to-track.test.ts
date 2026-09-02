/**
 * move_clip_to_track: the fallback must not be able to destroy anything the
 * caller did not ask it to touch.
 *
 * The current fallback removes the source clip first and then calls
 * track.overwriteClip(item, moveStart). Both halves of that are destructive:
 *
 * - overwriteClip lays the projectItem down at its OWN duration, not the
 *   trimmed length of the timeline clip. The occupancy guard only checks the
 *   trimmed span [start, end), so a trimmed still with a long item default
 *   still reaches past the span and takes out a neighbour -- trimming the
 *   placed clip afterwards cannot bring that neighbour back.
 * - the source is already gone when later steps run, so every failure path
 *   after the removal reports the error having destroyed the clip it failed
 *   to move.
 *
 * The safe shape is park -> trim -> slide -> lift-last: write the item past
 * the last clip on the target track (guaranteed empty), trim it back to the
 * source in/out there, slide it into the span the guard verified, and only
 * then lift the original. Every failure after the park removes the parked
 * copy and leaves the source untouched.
 *
 * Each test below fails against the previous implementation.
 */

import { executeExpandedTool } from '../../tools/expanded.js';

describe('move_clip_to_track fallback safety', () => {
  /**
   * All expanded tools emit the same shared body, so asserting against the
   * whole script says nothing about the tool under test. Cut out this one
   * case block first -- same reasoning as qe-targeting.test.ts.
   */
  const caseBlock = async (): Promise<string> => {
    let script = '';
    const bridge = { executeScript: async (s: string) => { script = s; return { success: true }; } };
    await executeExpandedTool(bridge as any, 'move_clip_to_track', { clipId: 'clip-1', trackIndex: 1 });

    const start = script.indexOf('case "move_clip_to_track":');
    expect(start).toBeGreaterThan(-1);
    const lines = script.slice(start).split('\n');
    const isLabel = (line: string): boolean => /^\s*case "/.test(line);
    const body: string[] = [];
    let seenStatement = false;
    for (const line of lines) {
      if (isLabel(line) && seenStatement) break;
      if (!isLabel(line) && line.trim()) seenStatement = true;
      body.push(line);
    }
    return body.join('\n');
  };

  it('lifts the source clip only after the copy is verified in the destination span', async () => {
    const block = await caseBlock();

    // The source removal must be the LAST mutation. If it runs before the
    // copy exists at the destination, every later failure has already
    // destroyed the clip it is reporting on.
    const slide = block.indexOf('placed.move(');
    const sourceRemoval = block.indexOf('moveTrackClip.clip.remove(');
    expect(slide).toBeGreaterThan(-1);
    expect(sourceRemoval).toBeGreaterThan(-1);
    expect(sourceRemoval).toBeGreaterThan(slide);
  });

  it('parks past the last clip and trims before sliding into the span', async () => {
    const block = await caseBlock();

    // Parked on guaranteed-empty space first: overwriteClip writes the item
    // at its own full duration, which can reach past [start, end) and take
    // out a neighbour the occupancy guard never looked at.
    expect(block).toContain('var moveParkTime = moveLastEnd + 1.0;');
    const park = block.indexOf('var moveParkTime = moveLastEnd + 1.0;');
    const trim = block.indexOf('placed.inPoint = secondsToTime(moveIn);');
    const slide = block.indexOf('placed.move(');
    expect(trim).toBeGreaterThan(park);
    expect(slide).toBeGreaterThan(trim);

    // And the destination is never written at its own coordinates.
    expect(block).not.toContain('overwriteClip(moveItem, moveStart)');
  });

  it('writes the timeline duration (end) while parked, before the slide', async () => {
    const block = await caseBlock();

    // Premiere does not shrink a timeline clip when only inPoint/outPoint are
    // written -- trim_clip and replace_clip both set `end` for that reason.
    // Without it, the slide carries the item's FULL length into a hole the
    // occupancy guard only measured as [start, end): the neighbour overwrite
    // this PR exists to stop. The write has to be relative to the parked
    // start (moveEnd is an absolute time on the original timeline).
    expect(block).toContain('var moveDur = moveEnd - moveStart;');
    const endWrite = 'placed.end = secondsToTime(valueOfTime(placed.start) + moveDur);';
    expect(block).toContain(endWrite);
    const trim = block.indexOf('placed.inPoint = secondsToTime(moveIn);');
    const end = block.indexOf(endWrite);
    const slide = block.indexOf('placed.move(');
    expect(end).toBeGreaterThan(trim);
    expect(slide).toBeGreaterThan(end);

    // And the restore check refuses to slide unless the duration took.
    const check = block.indexOf('var trimRestored =');
    const checkLine = block.slice(check, block.indexOf('\n', check));
    expect(checkLine).toContain('valueOfTime(placed.end) - valueOfTime(placed.start) - moveDur');
    expect(check).toBeGreaterThan(end);
    expect(slide).toBeGreaterThan(check);
  });

  it('identifies the parked clip by projectItem identity, not nearest start', async () => {
    const block = await caseBlock();

    // A nearest-start pick silently trims a bystander when overwriteClip
    // no-ops. The parked clip is the one holding our projectItem at the
    // park position.
    expect(block).toContain('__idsMatch(candidate.projectItem.nodeId, moveItem.nodeId)');
  });

  it('removes the parked copy on every failure path after parking', async () => {
    const block = await caseBlock();

    // A call on each post-park failure path: lookup miss, trim not
    // restored, slide landed wrong. (The definition's `= function(` shape
    // keeps it out of this count.)
    const calls = block.split('moveCleanupParked(').length - 1;
    expect(calls).toBeGreaterThanOrEqual(3);

    // Cleanup precedes each post-park fail, so no failure strands a
    // full-length parked clip on the target track.
    const parkIdx = block.indexOf('var moveParkTime');
    let cursor = parkIdx;
    let checkedFails = 0;
    for (;;) {
      const failIdx = block.indexOf('return fail(', cursor + 1);
      if (failIdx === -1) break;
      const cleanupIdx = block.lastIndexOf('moveCleanupParked(', failIdx);
      expect(cleanupIdx).toBeGreaterThan(cursor);
      cursor = failIdx;
      checkedFails++;
    }
    expect(checkedFails).toBeGreaterThanOrEqual(3);
  });

  it('clears occupants explicitly under overwrite:true, since the slide will not overwrite', async () => {
    const block = await caseBlock();

    // All overlapping occupants, not just the first -- and lifted, so the
    // destination track keeps its timing.
    expect(block).toContain('occupants.push(other)');
    expect(block).toContain('occupants[ori].remove(false, true)');
  });
});
