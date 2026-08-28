/**
 * __qeSequenceFor and __findQeClipByDomClip, executed rather than greped.
 *
 * Sixteen tools rely on these two to reach the right sequence and the right clip.
 * Gutting either one — deleting the guid check, or reducing the item match to
 * getItemAt(0) — used to leave the full suite green, because the only coverage
 * was a source-text assertion on the expanded.ts copy.
 *
 * The helpers live in the prelude the bridge prepends to every script, so the
 * script has to be captured on its way to the command file to get at them.
 */

import vm from 'vm';
import { PremiereProBridge } from '../../bridge/index.js';
import { promises as fs } from 'fs';

jest.mock('fs', () => ({
  promises: {
    mkdir: jest.fn(), access: jest.fn(), readdir: jest.fn(),
    writeFile: jest.fn(), readFile: jest.fn(), unlink: jest.fn(),
    rename: jest.fn(), rm: jest.fn(),
  }
}));
jest.mock('node:crypto', () => ({ randomUUID: jest.fn(() => 'test-uuid-1234') }));

describe('prelude QE helpers', () => {
  const mockFs = fs as jest.Mocked<typeof fs>;
  const commandPath = '/tmp/premiere-mcp-bridge-test/command-test-uuid-1234.json';

  beforeEach(() => {
    jest.clearAllMocks();
    process.env.PREMIERE_TEMP_DIR = '/tmp/premiere-mcp-bridge-test';
    mockFs.mkdir.mockResolvedValue(undefined);
    mockFs.access.mockRejectedValue(new Error('Not found'));
    mockFs.writeFile.mockResolvedValue(undefined);
    mockFs.unlink.mockResolvedValue(undefined);
    mockFs.readFile.mockResolvedValue(JSON.stringify({ result: { ok: true } }));
  });
  afterEach(() => { delete process.env.PREMIERE_TEMP_DIR; });

  /** Runs the prelude's helper definitions, then `extra`, in an isolated context. */
  const runWithPrelude = async (extra: string): Promise<Record<string, unknown>> => {
    const bridge = new PremiereProBridge();
    await bridge.initialize();
    await bridge.executeScript('return 1;');
    const call = mockFs.writeFile.mock.calls.find(
      ([, payload]) => typeof payload === 'string' && payload.includes('"script"'),
    );
    const full = JSON.parse(call![1] as string).script as string;

    // Everything up to the first non-helper statement is the prelude.
    const prelude = full.slice(0, full.indexOf('(function(){'));

    const sandbox: Record<string, unknown> = { app: { enableQE: () => {} } };
    vm.createContext(sandbox);
    vm.runInContext(prelude + '\n' + extra, sandbox);
    return sandbox;
  };

  describe('__qeSequenceFor', () => {
    it('matches on guid, not on position', async () => {
      const sandbox = await runWithPrelude(`
        qe = { project: {
          numSequences: 3,
          getSequenceAt: function (i) { return [{guid:'other-a'}, {guid:'WANTED'}, {guid:'other-b'}][i]; },
          getActiveSequence: function () { return {guid:'other-a'}; }
        }};
        __result = __qeSequenceFor({ sequenceID: 'WANTED' });
      `);

      expect((sandbox.__result as { guid: string }).guid).toBe('WANTED');
    });

    it('returns null rather than some other sequence', async () => {
      const sandbox = await runWithPrelude(`
        qe = { project: {
          numSequences: 2,
          getSequenceAt: function (i) { return [{guid:'a'}, {guid:'b'}][i]; },
          getActiveSequence: function () { return {guid:'a'}; }
        }};
        __result = __qeSequenceFor({ sequenceID: 'NOT-PRESENT' });
      `);

      expect(sandbox.__result).toBeNull();
    });

    it('keeps scanning past an index that throws', async () => {
      // numSequences over-reports: it counts sequences getSequenceAt then refuses
      // to return, throwing "Unknown error exception". One try around the whole
      // loop aborts the scan before the target index is ever reached.
      const sandbox = await runWithPrelude(`
        qe = { project: {
          numSequences: 3,
          getSequenceAt: function (i) {
            if (i === 0) { throw new Error('Unknown error exception'); }
            return [null, {guid:'x'}, {guid:'WANTED'}][i];
          },
          getActiveSequence: function () { return null; }
        }};
        __result = __qeSequenceFor({ sequenceID: 'WANTED' });
      `);

      expect((sandbox.__result as { guid: string }).guid).toBe('WANTED');
    });

    it('falls back to the active sequence only when its guid matches', async () => {
      // The fallback exists because a duplicate never opened in a timeline is
      // invisible to getSequenceAt even while active. The guid check is what stops
      // it from becoming the original wrong-sequence bug again.
      const sandbox = await runWithPrelude(`
        qe = { project: {
          numSequences: 0,
          getSequenceAt: function () { return null; },
          getActiveSequence: function () { return {guid:'ACTIVE-ONE'}; }
        }};
        __matching = __qeSequenceFor({ sequenceID: 'ACTIVE-ONE' });
        __mismatched = __qeSequenceFor({ sequenceID: 'WANTED' });
      `);

      expect((sandbox.__matching as { guid: string }).guid).toBe('ACTIVE-ONE');
      expect(sandbox.__mismatched).toBeNull();
    });
  });

  describe('__findQeClipByDomClip', () => {
    it('skips gaps instead of counting them as clips', async () => {
      // Three DOM clips with one gap: DOM index 2 is QE item 3, and QE item 2 is
      // the gap. Positional indexing lands on the gap and silently does nothing.
      const sandbox = await runWithPrelude(`
        var track = { numItems: 4, getItemAt: function (i) {
          return [
            { type: 'Clip',  start: { ticks: '0' } },
            { type: 'Clip',  start: { ticks: '100' } },
            { type: 'Empty', start: { ticks: '200' } },
            { type: 'Clip',  start: { ticks: '300' } }
          ][i];
        }};
        __result = __findQeClipByDomClip(track, { start: { ticks: '300' } });
      `);

      expect((sandbox.__result as { start: { ticks: string } }).start.ticks).toBe('300');
    });

    it('never returns a non-clip item', async () => {
      const sandbox = await runWithPrelude(`
        var track = { numItems: 2, getItemAt: function (i) {
          return [{ type: 'Empty', start:{ticks:'0'} }, { type: 'Transition', start:{ticks:'5'} }][i];
        }};
        __result = __findQeClipByDomClip(track, { start: { ticks: '0' } });
      `);

      expect(sandbox.__result).toBeNull();
    });

    it('prefers an exact tick match over a nearer-looking index', async () => {
      const sandbox = await runWithPrelude(`
        var track = { numItems: 3, getItemAt: function (i) {
          return [
            { type: 'Clip', start: { ticks: '500' } },
            { type: 'Clip', start: { ticks: '250' } },
            { type: 'Clip', start: { ticks: '100' } }
          ][i];
        }};
        __result = __findQeClipByDomClip(track, { start: { ticks: '100' } });
      `);

      expect((sandbox.__result as { start: { ticks: string } }).start.ticks).toBe('100');
    });
  });

  describe('__idsMatch', () => {
    it('treats Premiere hex nodeIds and decimal nodeIds as the same clip', async () => {
      const sandbox = await runWithPrelude(`
        __same = __idsMatch('000f4242', 1000002);
        __padded = __idsMatch('000f4242', '000F4242');
        __different = __idsMatch('000f4242', '000f4243');
      `);

      expect(sandbox.__same).toBe(true);
      expect(sandbox.__padded).toBe(true);
      expect(sandbox.__different).toBe(false);
    });
  });

  describe('__normalizeSpeedRatio / __setClipSpeed', () => {
    it('keeps multipliers and converts percents above 10', async () => {
      const sandbox = await runWithPrelude(`
        __half = __normalizeSpeedRatio(0.5);
        __two = __normalizeSpeedRatio(2);
        __percent = __normalizeSpeedRatio(150);
        __invalid = __normalizeSpeedRatio(0);
      `);

      expect(sandbox.__half).toBe(0.5);
      expect(sandbox.__two).toBe(2);
      expect(sandbox.__percent).toBe(1.5);
      expect(sandbox.__invalid).toBeNull();
    });

    it('calls QE setSpeed with multiplier, ticks string, reverse, pitch, ripple', async () => {
      const sandbox = await runWithPrelude(`
        var calls = [];
        var qeClip = { setSpeed: function () { calls.push([].slice.call(arguments)); return true; } };
        var domClip = { duration: { ticks: '254016000000' } };
        __ok = __setClipSpeed(qeClip, domClip, 2, false, true, false);
        __calls = calls;
      `);

      expect(sandbox.__ok).toBe(true);
      expect(sandbox.__calls).toEqual([[2, '127008000000', false, true, false]]);
    });

    it('retries with an empty ticks string when the duration form is rejected', async () => {
      const sandbox = await runWithPrelude(`
        var calls = [];
        var qeClip = { setSpeed: function (ratio, ticks) {
          calls.push([].slice.call(arguments));
          if (ticks !== '') throw new Error('Illegal Parameter type');
          return true;
        } };
        var domClip = { duration: { ticks: '254016000000' } };
        __ok = __setClipSpeed(qeClip, domClip, 0.5, false, false, false);
        __calls = calls;
      `);

      expect(sandbox.__ok).toBe(true);
      expect(sandbox.__calls).toHaveLength(2);
      expect((sandbox.__calls as unknown[])[0]).toEqual([0.5, '508032000000', false, false, false]);
      expect((sandbox.__calls as unknown[])[1]).toEqual([0.5, '', false, false, false]);
    });
  });

  describe('__findClip hex/decimal', () => {
    it('finds a clip whose nodeId is a number when the caller passed padded hex', async () => {
      const sandbox = await runWithPrelude(`
        app.project = {
          activeSequence: {
            sequenceID: 's1',
            name: 'Seq',
            videoTracks: { numTracks: 1, 0: { clips: { numItems: 1, 0: { nodeId: 1000002, name: 'A' } } } },
            audioTracks: { numTracks: 0 }
          },
          sequences: { numSequences: 0 }
        };
        __result = __findClip('000f4242');
      `);

      expect((sandbox.__result as { clip: { name: string } }).clip.name).toBe('A');
    });
  });
});
