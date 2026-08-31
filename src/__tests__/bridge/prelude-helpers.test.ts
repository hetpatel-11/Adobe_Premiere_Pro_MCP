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

  describe('__namesMatch locale aliases', () => {
    it('treats localized Motion/Scale/Volume names as the English ones', async () => {
      const sandbox = await runWithPrelude(`
        __motion = __namesMatch('Movimento', 'Motion');
        __scale = __namesMatch('Escala', 'Scale');
        __volume = __namesMatch('Lautstärke', 'Volume');
        __level = __namesMatch('Nivel', 'Level');
        __opacity = __namesMatch('Opacité', 'Opacity');
        __blur = __namesMatch('Flou gaussien', 'Gaussian Blur');
        __no = __namesMatch('Rotation', 'Scale');
      `);

      expect(sandbox.__motion).toBe(true);
      expect(sandbox.__scale).toBe(true);
      expect(sandbox.__volume).toBe(true);
      expect(sandbox.__level).toBe(true);
      expect(sandbox.__opacity).toBe(true);
      expect(sandbox.__blur).toBe(true);
      expect(sandbox.__no).toBe(false);
    });
  });

  describe('__resolveClipProperty', () => {
    it('finds Scale on a Portuguese Motion component when the caller used English names', async () => {
      const sandbox = await runWithPrelude(`
        var clip = { components: { numItems: 1 } };
        clip.components[0] = {
          displayName: 'Movimento',
          matchName: 'AE.ADBE Motion',
          properties: { numItems: 2 }
        };
        clip.components[0].properties[0] = { displayName: 'Posição', getValue: function () { return [0.5, 0.5]; } };
        clip.components[0].properties[1] = { displayName: 'Escala', getValue: function () { return 100; } };
        __result = __resolveClipProperty(clip, 'Motion', 'Scale');
      `);

      const result = sandbox.__result as { ok: boolean; property: { displayName: string } };
      expect(result.ok).toBe(true);
      expect(result.property.displayName).toBe('Escala');
    });

    it('maps Opacity requested on Motion to the Opacity component', async () => {
      const sandbox = await runWithPrelude(`
        var clip = { components: { numItems: 2 } };
        clip.components[0] = { displayName: 'Motion', matchName: '', properties: { numItems: 1 } };
        clip.components[0].properties[0] = { displayName: 'Scale', getValue: function () { return 100; } };
        clip.components[1] = { displayName: 'Opacity', matchName: '', properties: { numItems: 1 } };
        clip.components[1].properties[0] = { displayName: 'Opacity', getValue: function () { return 100; } };
        __result = __resolveClipProperty(clip, 'Motion', 'Opacity');
      `);

      const result = sandbox.__result as { ok: boolean; property: { displayName: string } };
      expect(result.ok).toBe(true);
      expect(result.property.displayName).toBe('Opacity');
    });

    it('maps Position X to the Position array and reports the x axis', async () => {
      const sandbox = await runWithPrelude(`
        var clip = { components: { numItems: 1 } };
        clip.components[0] = { displayName: 'Motion', matchName: '', properties: { numItems: 1 } };
        clip.components[0].properties[0] = { displayName: 'Position', getValue: function () { return [0.4, 0.6]; } };
        __result = __resolveClipProperty(clip, 'Motion', 'Position X');
      `);

      const result = sandbox.__result as { ok: boolean; axis: string };
      expect(result.ok).toBe(true);
      expect(result.axis).toBe('x');
    });
  });

  describe('__coercePropertyValue', () => {
    it('writes a scalar into the X slot of a Position array', async () => {
      const sandbox = await runWithPrelude(`
        var prop = { getValue: function () { return [0.4, 0.6]; } };
        __result = __coercePropertyValue(prop, 0.25, 'x');
      `);

      expect(sandbox.__result).toEqual([0.25, 0.6]);
    });

    it('does not pass an array to a scalar Scale property', async () => {
      const sandbox = await runWithPrelude(`
        var prop = { getValue: function () { return 100; } };
        __result = __coercePropertyValue(prop, [110, 90], null);
      `);

      expect(sandbox.__result).toBe(110);
    });
  });

  describe('__findSequence project-item ids', () => {
    it('resolves a sequence by its project-item hex nodeId, not only by GUID', async () => {
      const sandbox = await runWithPrelude(`
        var seqItem = { nodeId: 1000260, name: 'Cut', treePath: '/Cut' };
        var seq = { sequenceID: 'guid-cut', name: 'Cut', projectItem: seqItem };
        app.project = {
          sequences: { numSequences: 1, 0: seq },
          rootItem: { nodeId: 1, name: 'Root', children: { numItems: 1, 0: seqItem } }
        };
        __byGuid = __findSequence('guid-cut');
        __byHex = __findSequence('000f4344');
        __byName = __findSequence('Cut');
      `);

      expect((sandbox.__byGuid as { name: string }).name).toBe('Cut');
      expect((sandbox.__byHex as { name: string }).name).toBe('Cut');
      expect((sandbox.__byName as { name: string }).name).toBe('Cut');
    });
  });

  describe('__resolveProjectItem', () => {
    it('falls back from a missing project-item id to the timeline clip projectItem', async () => {
      const sandbox = await runWithPrelude(`
        var footage = { nodeId: 200, name: 'A.mp4' };
        var clip = { nodeId: '000f4241', name: 'A.mp4', projectItem: footage };
        app.project = {
          rootItem: { nodeId: 1, name: 'Root', children: { numItems: 1, 0: footage } },
          activeSequence: {
            sequenceID: 's1',
            name: 'Seq',
            videoTracks: { numTracks: 1, 0: { clips: { numItems: 1, 0: clip } } },
            audioTracks: { numTracks: 0 }
          },
          sequences: { numSequences: 0 }
        };
        __direct = __resolveProjectItem(200);
        __viaClip = __resolveProjectItem('000f4241');
        __missing = __resolveProjectItem('nope');
      `);

      expect((sandbox.__direct as { name: string }).name).toBe('A.mp4');
      expect((sandbox.__viaClip as { name: string }).name).toBe('A.mp4');
      expect(sandbox.__missing).toBeNull();
    });
  });

  describe('tick conversion', () => {
    it('converts seconds, tick strings, and Time objects', async () => {
      const sandbox = await runWithPrelude(`
        __fromSeconds = __secondsToTicks(2);
        __fromTicks = __ticksToSeconds('508032000000');
        __fromTime = __ticksToSeconds({ seconds: 3.5, ticks: '889056000000' });
        __fromNumberTicks = __ticksToSeconds(254016000000);
      `);

      expect(sandbox.__fromSeconds).toBe('508032000000');
      expect(sandbox.__fromTicks).toBe(2);
      expect(sandbox.__fromTime).toBe(3.5);
      expect(sandbox.__fromNumberTicks).toBe(1);
    });
  });

  describe('__expandIdList', () => {
    it('parses a JSON array string of timeline hex ids', async () => {
      const sandbox = await runWithPrelude(`
        __fromJson = __expandIdList('["000f4241","000f4242"]');
        __fromCsv = __expandIdList('000f4241,000f4242');
        __fromObject = __expandIdList({ nodeId: '000f4243' });
      `);

      expect(sandbox.__fromJson).toEqual(['000f4241', '000f4242']);
      expect(sandbox.__fromCsv).toEqual(['000f4241', '000f4242']);
      expect(sandbox.__fromObject).toEqual(['000f4243']);
    });
  });

  describe('__secondsToTimecode', () => {
    it('formats seconds as HH:MM:SS:FF at the sequence frame rate', async () => {
      const sandbox = await runWithPrelude(`
        __zero = __secondsToTimecode(0, 30);
        __one = __secondsToTimecode(1, 30);
        __drop = __secondsToTimecode(1.5, 24);
      `);

      expect(sandbox.__zero).toBe('00:00:00:00');
      expect(sandbox.__one).toBe('00:00:01:00');
      expect(sandbox.__drop).toBe('00:00:01:12');
    });
  });

  describe('__findQeNamed', () => {
    it('matches a localized effect list entry when the exact English name misses', async () => {
      const sandbox = await runWithPrelude(`
        qe = { project: {
          getVideoEffectByName: function (name) {
            if (name === 'Flou gaussien') return { name: name };
            return null;
          },
          getVideoEffectList: function () { return ['Flou gaussien', 'Crop']; }
        }};
        __result = __findQeNamed('videoEffect', 'Gaussian Blur');
      `);

      expect((sandbox.__result as { name: string }).name).toBe('Flou gaussien');
    });
  });
});
