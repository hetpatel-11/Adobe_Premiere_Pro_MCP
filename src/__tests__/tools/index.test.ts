/**
 * Unit tests for PremiereProTools
 */

import { EventEmitter } from 'events';
import { z } from 'zod';
import { spawn } from 'child_process';
import { promises as fs } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { PremiereProTools, evaluateTextInjectionResult } from '../../tools/index.js';
import { PremiereProBridge } from '../../bridge/index.js';
import { executeExpandedTool, expandedToolNames, unimplementedExpandedToolNames } from '../../tools/expanded.js';

jest.mock('../../bridge/index.js');
jest.mock('child_process');

const mockSpawn = spawn as jest.MockedFunction<typeof spawn>;

/** Builds a fake child_process for a scripted ffmpeg run: emits stderr, then closes. */
function fakeFfmpegProcess(stderrOutput: string, closeCode: number | null = 0): any {
  const proc: any = new EventEmitter();
  proc.stderr = new EventEmitter();
  process.nextTick(() => {
    if (stderrOutput) proc.stderr.emit('data', Buffer.from(stderrOutput));
    proc.emit('close', closeCode);
  });
  return proc;
}

/** Builds a fake child_process that immediately errors (e.g. ffmpeg not on PATH). */
function fakeMissingFfmpegProcess(): any {
  const proc: any = new EventEmitter();
  proc.stderr = new EventEmitter();
  process.nextTick(() => proc.emit('error', new Error('ENOENT')));
  return proc;
}

async function createTempPreset(name = 'Test Preset'): Promise<{ root: string; presetPath: string; outputPath: string }> {
  const root = await fs.mkdtemp(join(tmpdir(), 'premiere-tools-test-'));
  const presetPath = join(root, `${name}.epr`);
  await fs.writeFile(presetPath, `<Preset><PresetName>${name}</PresetName></Preset>`, 'utf8');
  return { root, presetPath, outputPath: join(root, 'out.mp4') };
}

describe('PremiereProTools', () => {
  let tools: PremiereProTools;
  let mockBridge: jest.Mocked<PremiereProBridge>;

  beforeEach(() => {
    mockBridge = new PremiereProBridge() as jest.Mocked<PremiereProBridge>;
    tools = new PremiereProTools(mockBridge);
    jest.clearAllMocks();
    mockSpawn.mockReset();
  });

  describe('getAvailableTools()', () => {
    it('returns the current tool catalog', () => {
      const availableTools = tools.getAvailableTools();
      const toolNames = availableTools.map((tool) => tool.name);

      expect(availableTools.length).toBeGreaterThan(50);
      expect(toolNames).toContain('list_project_items');
      expect(toolNames).toContain('build_motion_graphics_demo');
      expect(toolNames).toContain('assemble_product_spot');
      expect(toolNames).toContain('build_brand_spot_from_mogrt_and_assets');
      expect(toolNames).toContain('import_media');
      expect(toolNames).toContain('add_to_timeline');
      expect(toolNames).toContain('import_mogrt');
      expect(toolNames).toContain('setup_ducking');
      expect(toolNames).toContain('validate_project_for_export');
      expect(toolNames).toContain('verify_premiere_connection');
      expect(toolNames).toContain('get_capabilities');
      expect(toolNames).toContain('detect_silence');
      expect(toolNames).toContain('ping');
      expect(toolNames).toContain('get_full_project_overview');
      expect(toolNames).toContain('open_in_source');
      expect(toolNames).toContain('nest_clips');
      expect(toolNames).toContain('unnest_sequence');
      expect(toolNames).toContain('ripple_delete');
      expect(toolNames).toContain('capture_frame');
      expect(toolNames).toContain('add_tracks');
      expect(toolNames).toContain('get_encoder_presets');
      expect(toolNames).toContain('search_tools');
      expect(toolNames).toContain('get_tool_schema');
      expect(toolNames).toContain('invoke_tool');
      expect(toolNames).not.toContain('import_ae_comps');
      expect(availableTools).toHaveLength(283);
      expect(unimplementedExpandedToolNames).toEqual([]);
      for (const name of expandedToolNames) {
        expect(toolNames).toContain(name);
      }
    });

    it('returns valid tool metadata', () => {
      for (const tool of tools.getAvailableTools()) {
        expect(typeof tool.name).toBe('string');
        expect(typeof tool.description).toBe('string');
        expect(tool.inputSchema).toBeDefined();
      }
    });
  });

  describe('executeTool()', () => {
    describe('marker colours', () => {
      // Premiere's setColorByIndex() order, verified against 26.0.2 by writing
      // each index and reading the rendered colour back off the timeline.
      const EXPECTED_INDEX: Array<[string, number]> = [
        ['green', 0], ['red', 1], ['purple', 2], ['orange', 3],
        ['yellow', 4], ['white', 5], ['blue', 6], ['cyan', 7],
      ];

      it.each(EXPECTED_INDEX)('maps %s to index %i', async (name, index) => {
        mockBridge.executeScript.mockResolvedValue({ success: true });

        await tools.executeTool('add_marker', {
          sequenceId: 'seq', time: 1, name: 'm', color: name,
        });

        const script = mockBridge.executeScript.mock.calls[0][0] as string;
        expect(script).toContain(`setColorByIndex(${index})`);
      });

      it('accepts a numeric index directly', async () => {
        mockBridge.executeScript.mockResolvedValue({ success: true });

        await tools.executeTool('add_marker', {
          sequenceId: 'seq', time: 1, name: 'm', color: 5,
        });

        expect(mockBridge.executeScript.mock.calls[0][0]).toContain('setColorByIndex(5)');
      });

      it('ignores surrounding whitespace and case', async () => {
        mockBridge.executeScript.mockResolvedValue({ success: true });

        await tools.executeTool('add_marker', {
          sequenceId: 'seq', time: 1, name: 'm', color: '  PuRPle ',
        });

        expect(mockBridge.executeScript.mock.calls[0][0]).toContain('setColorByIndex(2)');
      });

      it('leaves the marker at Premiere\'s default when no colour is given', async () => {
        mockBridge.executeScript.mockResolvedValue({ success: true });

        await tools.executeTool('add_marker', { sequenceId: 'seq', time: 1, name: 'm' });

        expect(mockBridge.executeScript.mock.calls[0][0]).not.toContain('setColorByIndex');
      });

      // Premiere silently no-ops an index above 7 and silently truncates a
      // non-integer, so accepting either would report success for a colour the
      // caller never gets. Reject before the bridge is touched.
      it.each([
        ['an unknown colour name', 'chartreuse'],
        ['an index above the palette', 8],
        ['a negative index', -1],
        ['a non-integer index', 3.5],
      ])('rejects %s rather than silently defaulting', async (_label, color) => {
        const result = await tools.executeTool('add_marker', {
          sequenceId: 'seq', time: 1, name: 'm', color,
        });

        expect(result.success).toBe(false);
        expect(result.error).toContain('Invalid arguments');
        expect(result.errorCode).toMatch(/^zod\./);
        expect(result.errorFields).toMatch(/color/);
        expect(result.status).toBe('validation');
        expect(mockBridge.executeScript).not.toHaveBeenCalled();
      });

      it('applies the same mapping in update_marker', async () => {
        mockBridge.executeScript.mockResolvedValue({ success: true });

        await tools.executeTool('update_marker', {
          sequenceId: 'seq', markerId: 'guid', color: 'cyan',
        });

        expect(mockBridge.executeScript.mock.calls[0][0]).toContain('setColorByIndex(7)');
      });

      it('does not touch colour when update_marker omits it', async () => {
        mockBridge.executeScript.mockResolvedValue({ success: true });

        await tools.executeTool('update_marker', {
          sequenceId: 'seq', markerId: 'guid', name: 'renamed',
        });

        expect(mockBridge.executeScript.mock.calls[0][0]).not.toContain('setColorByIndex');
      });

      it('accepts a numeric index sent as a string', async () => {
        mockBridge.executeScript.mockResolvedValue({ success: true });

        // Some MCP clients stringify every argument; without this the caller
        // silently loses index input.
        await tools.executeTool('add_marker', {
          sequenceId: 'seq', time: 1, name: 'm', color: '3',
        });

        expect(mockBridge.executeScript.mock.calls[0][0]).toContain('setColorByIndex(3)');
      });

      it.each([
        ['name', 'marker.name = ""'],
        ['comment', 'marker.comments = ""'],
      ])('update_marker applies an empty %s instead of silently ignoring it', async (field, expected) => {
        mockBridge.executeScript.mockResolvedValue({ success: true });

        // Same truthiness class the colour fix removed: `updates.name ? ...`
        // treated "" as absent, so the call reported success and changed nothing.
        await tools.executeTool('update_marker', {
          sequenceId: 'seq', markerId: 'guid', [field]: '',
        });

        expect(mockBridge.executeScript.mock.calls[0][0]).toContain(expected);
      });

      it('add_marker_to_project_item applies colour rather than dropping it', async () => {
        mockBridge.executeScript.mockResolvedValue({ success: true });

        await executeExpandedTool(mockBridge, 'add_marker_to_project_item', {
          projectItemId: 'item', time: 1, name: 'm', color: 'cyan',
        });

        const script = mockBridge.executeScript.mock.calls[0][0] as string;
        expect(script).toContain('resolveMarkerColorIndex(args.color)');
        expect(script).toContain('setColorByIndex(itemColorIndex)');
        // Colour was readable through get_clip_markers but unwritable here.
        expect(script).toContain('colorName: appliedColor.name');
      });

      it('add_marker_to_project_item refuses an unrecognised colour', async () => {
        mockBridge.executeScript.mockResolvedValue({ success: true });

        await executeExpandedTool(mockBridge, 'add_marker_to_project_item', {
          projectItemId: 'item', time: 1, name: 'm', color: 'chartreuse',
        });

        const script = mockBridge.executeScript.mock.calls[0][0] as string;
        // Expanded tools declare z.record(z.any()), so schema-layer rejection is
        // not available; the guard has to live in the generated script.
        expect(script).toContain('Unrecognised marker colour');
      });

      it.each(['get_clip_markers', 'get_sequence_markers_by_type'])(
        '%s also reports marker colour',
        async (tool) => {
          mockBridge.executeScript.mockResolvedValue({ success: true });

          await executeExpandedTool(mockBridge, tool, {});

          const script = mockBridge.executeScript.mock.calls[0][0] as string;
          // These share one implementation with list_markers' problem: colour was
          // readable from the DOM but never surfaced, so a caller could not verify
          // what it had written.
          expect(script).toContain('markerColor(marker)');
          expect(script).toContain('color: markerColorInfo.index');
          expect(script).toContain('colorName: markerColorInfo.name');
          // Same -1 guard as list_markers.
          expect(script).toContain('index < MARKER_COLOR_NAMES.length');
        },
      );

      it('reads colour back, guarding the unassigned -1 state', async () => {
        mockBridge.executeScript.mockResolvedValue({ success: true, markers: [] });

        await tools.executeTool('list_markers', { sequenceId: 'seq' });

        const script = mockBridge.executeScript.mock.calls[0][0] as string;
        expect(script).toContain('getColorByIndex()');
        // getColorByIndex() can return -1 ("no colour assigned"). An unguarded
        // lookup yields undefined, which JSON.stringify drops entirely, making
        // the response shape unstable.
        expect(script).toContain('colorIndex >= 0');
        expect(script).toContain(': null');
      });
    });

    describe('ExtendScript interpolation safety', () => {
      // Two severities, both proven on this codebase before the fix. Full code
      // execution, where a payload closes the call and runs its own script; and
      // response-shape injection, where a payload adds keys to the JSON the
      // calling model reads back — quieter, and worse for an agent.
      const CLOSE_CALL = 'zz"); return JSON.stringify({PWNED:"x"}); ("';
      const ADD_KEY = 'zz", INJECTED_KEY: "yes';
      const EXPRESSION = '" + app.project.name + "';

      it.each([
        ['get_clip_properties', 'clipId'],
        ['apply_effect', 'clipId'],
        ['add_transition_to_clip', 'transitionName'],
        ['export_frame', 'outputPath'],
      ])('%s escapes %s', async (tool, param) => {
        for (const payload of [CLOSE_CALL, ADD_KEY, EXPRESSION]) {
          jest.clearAllMocks();
          mockBridge.executeScript.mockResolvedValue({ success: true });

          const args: Record<string, unknown> = {
            sequenceId: 'seq', clipId: 'clip', time: 0, outputPath: '/tmp/a.png',
            transitionName: 'Cross Dissolve', effectName: 'Gain', lutPath: '/tmp/a.cube',
            name: 'bin', [param]: payload,
          };
          await tools.executeTool(tool, args);
          if (!mockBridge.executeScript.mock.calls.length) continue;

          const script = mockBridge.executeScript.mock.calls[0][0] as string;
          // The payload must appear only as an escaped literal, never bare
          // between the quotes the generator wrote.
          expect(script).not.toContain(`"${payload}"`);
          expect(script).toContain(JSON.stringify(payload));
        }
      });

    });

    describe('schema validation output', () => {
      /** Swap one tool's schema in the catalog executeTool actually reads. */
      function withSchema(toolName: string, schema: unknown) {
        const catalog = tools.getAvailableTools();
        jest.spyOn(tools, 'getAvailableTools').mockReturnValue(
          catalog.map((t) => (t.name === toolName ? { ...t, inputSchema: schema as never } : t)),
        );
      }

      it('passes the validated value to the handler, not the raw args', async () => {
        mockBridge.executeScript.mockResolvedValue({ success: true });
        // parse() used to run and have its result discarded, so every
        // .transform(), .default() and z.coerce() in this file was inert.
        withSchema('add_marker', z.object({
          sequenceId: z.string(),
          time: z.number(),
          name: z.string().transform((v) => `${v}-transformed`),
        }));

        await tools.executeTool('add_marker', { sequenceId: 'seq', time: 1, name: 'probe' });

        expect(mockBridge.executeScript.mock.calls[0][0]).toContain('probe-transformed');
      });

      it('applies a schema default for an argument the caller omitted', async () => {
        mockBridge.executeScript.mockResolvedValue({ success: true });
        withSchema('add_marker', z.object({
          sequenceId: z.string(),
          time: z.number(),
          name: z.string().default('defaulted-name'),
        }));

        await tools.executeTool('add_marker', { sequenceId: 'seq', time: 1 });

        expect(mockBridge.executeScript.mock.calls[0][0]).toContain('defaulted-name');
      });

      it('keeps unknown keys the schema would strip', async () => {
        mockBridge.executeScript.mockResolvedValue({ success: true });
        // Zod strips unknown keys, and handlers read alternate spellings such as
        // args.itemId || args.item_id — so the validated value is merged over
        // the raw args rather than replacing them.
        withSchema('add_marker', z.object({ sequenceId: z.string(), time: z.number() }));

        await tools.executeTool('add_marker', { sequenceId: 'seq', time: 1, name: 'survives' });

        expect(mockBridge.executeScript.mock.calls[0][0]).toContain('survives');
      });

      it('accepts snake_case keys and numeric strings that agents actually send', async () => {
        mockBridge.executeScript.mockResolvedValue({ success: true, tracks: [] });

        const result = await tools.executeTool('list_sequence_tracks', { sequence_id: 'seq-1' });

        expect(result.success).not.toBe(false);
        expect(mockBridge.executeScript).toHaveBeenCalled();
        expect(mockBridge.executeScript.mock.calls[0][0]).toContain('seq-1');
      });

      it('coerces a string time so razor_timeline_at_time reaches Premiere', async () => {
        mockBridge.executeScript.mockResolvedValue({ success: true });

        const result = await tools.executeTool('razor_timeline_at_time', {
          sequenceId: 'seq-1',
          time: '12.5',
        });

        expect(result.success).toBe(true);
        expect(mockBridge.executeScript).toHaveBeenCalled();
      });
    });
    describe('expanded tools reject an unresolvable sequence id', () => {
      // These declare inputSchema: z.record(z.any()), so schema-layer rejection
      // is unavailable — the guard has to live in the generated script.
      it.each([
        'add_tracks', 'razor_all_tracks', 'get_timeline_gaps',
        'get_next_edit_point', 'set_all_tracks_targeted', 'nest_clips',
      ])('%s guards before acting', async (tool) => {
        mockBridge.executeScript.mockResolvedValue({ success: true });

        await executeExpandedTool(mockBridge, tool, { sequenceId: 'no-such-sequence' });

        const script = mockBridge.executeScript.mock.calls[0][0] as string;
        // Previously every site did targetSequence() then fell back to the
        // active sequence, so a stale id silently acted on whatever was on
        // screen and reported success — razor_all_tracks cut the wrong timeline.
        expect(script).toContain('var seqErr = sequenceRequestError();');
        expect(script).toContain('if (seqErr) return fail(seqErr);');
        expect(script).not.toContain('targetSequence() || activeSequence()');
      });

      it('emits a guard that can actually reach the empty-id branch', async () => {
        mockBridge.executeScript.mockResolvedValue({ success: true });

        await executeExpandedTool(mockBridge, 'get_timeline_gaps', { sequenceId: '' });
        const script = mockBridge.executeScript.mock.calls[0][0] as string;

        // Asserting only that the message string appears is vacuous — it is in
        // the function body whether or not the logic ever reaches it. These two
        // assertions pin the parts that were actually wrong.
        //
        // 1. The alias fallback must not treat "" as absent, or an empty id
        //    takes the omitted-id path and lands on the active sequence.
        expect(script).toContain('if (requested === undefined || requested === null) requested = args.sequence_id;');
        expect(script).not.toContain('String(requested) === "") requested = args.sequence_id');
        // 2. This lives in a template literal, where \s collapses to a bare "s".
        //    The emitted regex must strip whitespace, not the letter s.
        expect(script).toContain('replace(/^\\s+|\\s+$/g, "")');
        expect(script).not.toContain('replace(/^s+|s+$/g, "")');
        expect(script).toContain('sequenceId was supplied but empty');
      });

      it('leaves the omitted-id case alone', () => {
        // An omitted id must still mean "the active sequence" — that is the
        // documented contract, and only a supplied-but-unresolvable id is an error.
        const src = require('fs').readFileSync(
          require('path').join(__dirname, '../../tools/expanded.ts'), 'utf8',
        ) as string;
        expect(src).toContain('if (requested === undefined || requested === null) return null;');
        expect(src).toMatch(/function targetSequence\(\)[\s\S]{0,200}activeSequence\(\)/);
      });

      it('no silent fallback remains anywhere in the expanded dispatcher', () => {
        const src = require('fs').readFileSync(
          require('path').join(__dirname, '../../tools/expanded.ts'), 'utf8',
        ) as string;
        expect(src).not.toContain('targetSequence() || activeSequence()');
      });
    });

    describe('export_frame', () => {
      const scriptFor = async (args: Record<string, unknown>): Promise<string> => {
        mockBridge.executeScript.mockResolvedValue({ success: true });
        await tools.executeTool('export_frame', args);
        return mockBridge.executeScript.mock.calls[0][0] as string;
      };

      it('exports the sequence that was asked for, not the active one', async () => {
        // Proven live against 26.0.2: with an empty sequence active, asking for
        // a populated one returned success, echoed the requested sequenceId,
        // and wrote the empty sequence's black frame.
        const script = await scriptFor({
          sequenceId: 'seq-guid', time: 15, outputPath: '/tmp/f.png',
        });

        expect(script).toContain('var qeSequence = __qeSequenceForRetry(sequence);');
        // Match the assignment, not the bare call: the surrounding comment
        // names getActiveSequence() to explain what it replaced.
        expect(script).not.toContain('var qeSequence = qe.project.getActiveSequence()');
      });

      it('hands Premiere the stem so the frame lands at the requested path', async () => {
        // exportFramePNG appends "." + format to whatever path it is given, so
        // passing "shot.png" through wrote "shot.png.png".
        const script = await scriptFor({
          sequenceId: 'seq-guid', time: 15, outputPath: '/tmp/shot.png',
        });

        expect(script).toContain('var exportStem = requestedPath;');
        expect(script).toContain('tryExport(timeNumber, exportStem)');
        expect(script).not.toContain('tryExport(timeNumber, "/tmp/shot.png")');
      });

      it('reports the path it actually wrote rather than the one requested', async () => {
        const script = await scriptFor({
          sequenceId: 'seq-guid', time: 15, outputPath: '/tmp/shot.png',
        });

        expect(script).toContain('outputPath: actualPath');
        expect(script).toContain('requestedPath: requestedPath');
      });

      it('fails when the export call throws nothing but writes nothing', async () => {
        const script = await scriptFor({
          sequenceId: 'seq-guid', time: 15, outputPath: '/tmp/shot.png',
        });

        expect(script).toContain('if (!exported || !actualPath)');
        expect(script).toContain('wrote no file');
      });

      it('picks the extension from the format, not the supplied path', async () => {
        const jpg = await scriptFor({
          sequenceId: 'seq-guid', time: 1, outputPath: '/tmp/shot.png', format: 'jpg',
        });

        expect(jpg).toContain('=== "jpg"');
        expect(jpg).toContain('".jpg"');
      });

      it('escapes the output path instead of interpolating it', async () => {
        const path = 'INJ"+(1000*1000+7)+"END';
        const script = await scriptFor({ sequenceId: 'seq-guid', time: 1, outputPath: path });

        expect(script).toContain(JSON.stringify(path));
        expect(script).not.toContain('= "' + path + '"');
      });
    });

    describe('sequence targeting hardening', () => {
      const INJECTION = 'INJ"+(1000*1000+7)+"END';

      it.each(['add_marker', 'list_markers', 'razor_timeline_at_time'])(
        '%s escapes the sequence id instead of interpolating it into the script',
        async (tool) => {
          mockBridge.executeScript.mockResolvedValue({ success: true });

          const args: Record<string, unknown> = { sequenceId: INJECTION };
          if (tool === 'add_marker') Object.assign(args, { time: 1, name: 'm' });
          if (tool === 'razor_timeline_at_time') Object.assign(args, { time: 1 });

          await tools.executeTool(tool, args);

          const script = mockBridge.executeScript.mock.calls[0][0] as string;
          // Raw interpolation would close the string and let the arithmetic run,
          // which is how this was proven live: the id came back as INJ1000007END.
          expect(script).not.toContain('"' + INJECTION + '"');
          expect(script).toContain(JSON.stringify(INJECTION));
        },
      );

      it.each(['add_track', 'apply_audio_effect_to_all_clips', 'razor_timeline_at_time'])(
        '%s restores the previously active sequence',
        async (tool) => {
          mockBridge.executeScript.mockResolvedValue({ success: true });

          const args: Record<string, unknown> = { sequenceId: 'seq-guid' };
          if (tool === 'add_track') Object.assign(args, { trackType: 'video' });
          if (tool === 'apply_audio_effect_to_all_clips') Object.assign(args, { effectName: 'Gain' });
          if (tool === 'razor_timeline_at_time') Object.assign(args, { time: 1 });

          await tools.executeTool(tool, args);

          const script = mockBridge.executeScript.mock.calls[0][0] as string;
          // Honouring the id by switching the active sequence and leaving it
          // switched moves the user's timeline and retargets later calls.
          expect(script).toContain('var __priorActive = app.project.activeSequence');
          expect(script).toContain('app.project.activeSequence = __priorActive');
          expect(script).toContain('finally');
        },
      );

      it('read_sequence_captions fails on an unresolved id rather than reading the active sequence', async () => {
        mockBridge.executeScript.mockResolvedValue({ success: true });

        await tools.executeTool('read_sequence_captions', { sequenceId: 'no-such-sequence' });

        const script = mockBridge.executeScript.mock.calls[0][0] as string;
        expect(script).toContain('Sequence not found by id');
        // The old shape silently reassigned to the active sequence on a miss.
        expect(script).not.toContain('if (!sequence) sequence = app.project.activeSequence;');
      });

      it('escapes the effect name too', async () => {
        mockBridge.executeScript.mockResolvedValue({ success: true });

        await tools.executeTool('apply_audio_effect_to_all_clips', {
          sequenceId: 'seq-guid', effectName: 'Gain" + (2*2) + "',
        });

        const script = mockBridge.executeScript.mock.calls[0][0] as string;
        expect(script).toContain(JSON.stringify('Gain" + (2*2) + "'));
      });
    });

    it('reports local capabilities without probing the Premiere bridge by default', async () => {
      const previous = process.env.PREMIERE_MCP_TOOLSET;
      delete process.env.PREMIERE_MCP_TOOLSET;
      try {
        const result = await tools.executeTool('get_capabilities', {});

        expect(result.success).toBe(true);
        expect(result.catalog).toEqual({
          tools: 283,
          advertised: 5,
          toolset: 'search',
          search: 'search_tools',
          invoke: 'invoke_tool',
          resources: 13,
          prompts: 10,
        });
        expect(result.liveConnection.checked).toBe(false);
        expect(result.update.current).toBeTruthy();
        expect(result.update.available).toBe(false);
        expect(mockBridge.executeScript).not.toHaveBeenCalled();
      } finally {
        if (previous === undefined) delete process.env.PREMIERE_MCP_TOOLSET;
        else process.env.PREMIERE_MCP_TOOLSET = previous;
      }
    });

    it('can include an explicit read-only live connection check in capabilities', async () => {
      mockBridge.executeScript.mockResolvedValue({ success: true, status: 'connected' });

      const result = await tools.executeTool('get_capabilities', { checkConnection: true });

      expect(result.success).toBe(true);
      expect(result.liveConnection.checked).toBe(true);
      expect(result.liveConnection.result).toEqual({ success: true, status: 'connected' });
      expect(mockBridge.executeScript).toHaveBeenCalledTimes(1);
    });

    it('returns a clear error for unknown tools', async () => {
      const result = await tools.executeTool('unknown_tool', {});

      expect(result.success).toBe(false);
      expect(result.error).toContain('not found');
    });

    it('validates tool arguments with zod', async () => {
      const result = await tools.executeTool('create_project', {});

      expect(result.success).toBe(false);
      expect(result.error).toContain('Invalid arguments');
    });

    it('converts bridge exceptions into tool errors', async () => {
      mockBridge.executeScript.mockRejectedValue(new Error('Bridge error'));

      const result = await tools.executeTool('list_project_items', {});

      expect(result.success).toBe(false);
      expect(result.error).toContain('Tool execution failed');
    });

    it('tells the caller not to sit and retry when the bridge is down', async () => {
      mockBridge.executeScript.mockRejectedValue(
        new Error('MCP Bridge is not running. Open Premiere Pro, choose Window > Extensions > MCP Bridge, then click Start Bridge.'),
      );

      const result = await tools.executeTool('list_project_items', {});

      expect(result.success).toBe(false);
      expect(result.retry).toBe(false);
      expect(result.userActionRequired).toBe(true);
      expect(result.agentAction).toBe('verify_premiere_connection');
      expect(result.nextStep).toMatch(/verify_premiere_connection/);
    });

    it('executes expanded tools through our bridge dispatcher', async () => {
      mockBridge.executeScript.mockResolvedValue({
        success: true,
        tool: 'ping',
        data: { connected: true }
      });

      const result = await tools.executeTool('ping', {});

      expect(mockBridge.executeScript).toHaveBeenCalled();
      expect(mockBridge.executeScript.mock.calls[0][1]).toBe(8000);
      expect(result.success).toBe(true);
      expect(result.data.connected).toBe(true);
    });

    it('runs the connection verification as a read-only bridge call', async () => {
      mockBridge.executeScript.mockResolvedValue({
        success: true,
        status: 'connected',
        bridge: 'responsive',
        premiere: { version: '26.0', build: '123' },
        readOnly: true
      });

      const result = await tools.executeTool('verify_premiere_connection', {});

      expect(result.success).toBe(true);
      expect(mockBridge.executeScript.mock.calls[0][1]).toBe(8000);
      const script = mockBridge.executeScript.mock.calls[0][0] as string;
      expect(script).toContain("status: 'connected'");
      expect(script).toContain('readOnly: true');
      expect(script).not.toContain('save()');
      expect(script).not.toContain('create');
    });

    it('does not report expanded track creation as successful unless Premiere confirms it', async () => {
      mockBridge.executeScript.mockResolvedValue({
        success: false,
        tool: 'add_tracks',
        error: 'Premiere did not add the requested tracks'
      });

      const result = await tools.executeTool('add_tracks', {
        sequenceId: 'seq-123',
        videoTracks: 1
      });

      expect(result.success).toBe(false);
      expect(result.error).toContain('Premiere did not add');
      expect(mockBridge.executeScript).toHaveBeenCalled();
    });

    it('keeps the expanded dispatcher fail-closed for missing handlers and defaults capture_frame output', async () => {
      mockBridge.executeScript.mockResolvedValue({ success: false, error: 'not executed in unit test' });

      await executeExpandedTool(mockBridge, 'ripple_delete', { clipId: 'clip-123' });
      const missingHandlerScript = mockBridge.executeScript.mock.calls[0][0];
      expect(missingHandlerScript).toContain('Expanded tool is advertised but has no implemented handler');
      expect(missingHandlerScript).not.toContain('accepted: true');

      await executeExpandedTool(mockBridge, 'capture_frame', {});
      const captureScript = mockBridge.executeScript.mock.calls[1][0] as string;
      expect(captureScript).toContain('__qeSequenceForRetry');
      expect(captureScript).toContain('premiere-mcp-frame-');
    });

    it('creates a sequence from a single projectItemId or a timeline clip id', async () => {
      mockBridge.executeScript.mockResolvedValue({ success: true });

      await executeExpandedTool(mockBridge, 'create_sequence_from_clips', { projectItemId: 'item-1', name: 'Cut' });
      const script = mockBridge.executeScript.mock.calls[0][0] as string;
      expect(script).toContain('mergeIds(args.projectItemId)');
      expect(script).toContain('__expandIdList');
      expect(script).toContain('asTimelineClip.clip.projectItem');
      expect(script).toContain('findClipAnywhere(wantedId)');
      expect(script).toContain('findParentItem(clipItems[0])');
    });
  });

  describe('bridge-backed wrappers', () => {
    it('surfaces create_project bridge failures instead of claiming success', async () => {
      mockBridge.createProject = jest.fn().mockResolvedValue({
        success: false,
        error: 'Premiere Pro did not create or activate the requested project',
        projectPath: '/tmp/Test.prproj'
      } as any);

      const result = await tools.executeTool('create_project', {
        name: 'Test',
        location: '/tmp'
      });

      expect(result.success).toBe(false);
      expect(result.error).toContain('did not create');
      expect(result.projectPath).toBe('/tmp/Test.prproj');
    });

    it('surfaces open_project bridge failures instead of claiming success', async () => {
      mockBridge.openProject = jest.fn().mockResolvedValue({
        success: false,
        error: 'Premiere Pro did not activate the requested project',
        projectPath: '/tmp/Target.prproj',
        actualPath: '/tmp/AlreadyOpen.prproj'
      } as any);

      const result = await tools.executeTool('open_project', {
        path: '/tmp/Target.prproj'
      });

      expect(result.success).toBe(false);
      expect(result.error).toContain('did not activate');
      expect(result.actualPath).toBe('/tmp/AlreadyOpen.prproj');
    });

    it('does not run automatic create_sequence recovery after a bridge timeout', async () => {
      mockBridge.createSequence = jest.fn().mockRejectedValue(new Error('Bridge response timeout'));

      const result = await tools.executeTool('create_sequence', {
        name: 'Possibly Created Sequence',
        presetPath: '/tmp/sequence.sqpreset'
      });

      expect(result.success).toBe(false);
      expect(result.error).toContain('Bridge response timeout');
      expect(result.warning).toContain('does not run automatic recovery');
      expect(mockBridge.executeScript).not.toHaveBeenCalled();
    });

    it('surfaces create_sequence bridge failures without timeout recovery guidance', async () => {
      mockBridge.createSequence = jest.fn().mockRejectedValue(new Error('Premiere rejected the preset'));

      const result = await tools.executeTool('create_sequence', {
        name: 'Missing Sequence',
        presetPath: '/tmp/sequence.sqpreset'
      });

      expect(result.success).toBe(false);
      expect(result.error).toContain('Premiere rejected the preset');
      expect(result.warning).toBeUndefined();
    });

    it('rejects dialog-prone sequence creation without a preset before calling Premiere', async () => {
      const result = await tools.executeTool('create_sequence', {
        name: 'No Dialog Sequence'
      });

      expect(result.success).toBe(false);
      expect(result.error).toContain('Invalid arguments');
      expect(mockBridge.createSequence).not.toHaveBeenCalled();
    });

    it('blocks EDL import before calling Premiere because it requires an interactive dialog', async () => {
      const result = await tools.executeTool('import_edl', {
        filePath: '/tmp/edit.edl'
      });

      expect(result.success).toBe(false);
      expect(result.blockedBeforePremiere).toBe(true);
      expect(result.error).toContain('interactive dialog');
      expect(mockBridge.executeScript).not.toHaveBeenCalled();
    });

    it('requests Premiere UI suppression for FCP XML imports', async () => {
      mockBridge.executeScript.mockResolvedValue({ success: true, imported: true, method: 'importFiles(suppressUI=true)' });

      const result = await tools.executeTool('import_fcp_xml', {
        filePath: '/tmp/edit.xml'
      });

      expect(result.success).toBe(true);
      const script = mockBridge.executeScript.mock.calls[0][0];
      expect(script).toContain('app.project.importFiles(["/tmp/edit.xml"], true, app.project.rootItem, false)');
      expect(script).not.toContain('app.openFCPXML');
    });

    it('passes through successful imports', async () => {
      mockBridge.importMedia = jest.fn().mockResolvedValue({
        success: true,
        id: 'item-123',
        name: 'video.mp4',
        type: 'footage',
        mediaPath: '/path/to/video.mp4'
      });

      const result = await tools.executeTool('import_media', {
        filePath: '/path/to/video.mp4'
      });

      expect(mockBridge.importMedia).toHaveBeenCalledWith('/path/to/video.mp4');
      expect(result.success).toBe(true);
      expect(result.id).toBe('item-123');
    });

    it('surfaces import failures instead of claiming success', async () => {
      mockBridge.importMedia = jest.fn().mockResolvedValue({
        success: false,
        error: 'Import failed'
      } as any);

      const result = await tools.executeTool('import_media', {
        filePath: '/path/to/video.mp4'
      });

      expect(result.success).toBe(false);
      expect(result.error).toBe('Import failed');
    });

    it('adds an actionable modal warning when import_media times out', async () => {
      mockBridge.importMedia = jest.fn().mockRejectedValue(new Error('Bridge response timeout'));

      const result = await tools.executeTool('import_media', {
        filePath: '/path/to/captions.ass'
      });

      expect(result.success).toBe(false);
      expect(result.error).toContain('Bridge response timeout');
      expect(result.warning).toContain('blocking modal dialog');
    });

    it('passes through successful timeline placement', async () => {
      mockBridge.addToTimeline = jest.fn().mockResolvedValue({
        success: true,
        id: 'clip-123',
        name: 'video.mp4'
      } as any);

      const result = await tools.executeTool('add_to_timeline', {
        sequenceId: 'seq-123',
        projectItemId: 'item-456',
        trackIndex: 0,
        time: 0
      });

      expect(result.success).toBe(true);
      expect(result.id).toBe('clip-123');
    });

    it('surfaces timeline placement failures instead of claiming success', async () => {
      mockBridge.addToTimeline = jest.fn().mockResolvedValue({
        success: false,
        error: 'Track not found'
      } as any);

      const result = await tools.executeTool('add_to_timeline', {
        sequenceId: 'seq-123',
        projectItemId: 'item-456',
        trackIndex: 99,
        time: 0
      });

      expect(result.success).toBe(false);
      expect(result.error).toBe('Track not found');
    });
  });

  describe('detect_silence', () => {
    it('rejects when neither mediaPath nor projectItemId is provided', async () => {
      const result = await tools.executeTool('detect_silence', {});

      expect(result.success).toBe(false);
      expect(result.error).toContain('Invalid arguments');
      expect(mockSpawn).not.toHaveBeenCalled();
      expect(mockBridge.executeScript).not.toHaveBeenCalled();
    });

    it('returns an explicit error when ffmpeg is not on PATH, rather than a cryptic spawn failure', async () => {
      mockSpawn.mockReturnValueOnce(fakeMissingFfmpegProcess());

      const result = await tools.executeTool('detect_silence', {
        mediaPath: '/tmp/some-clip.mp4'
      });

      expect(result.success).toBe(false);
      expect(result.error).toContain('ffmpeg was not found on PATH');
      // Only the version-check spawn should have happened -- never attempted the real analysis.
      expect(mockSpawn).toHaveBeenCalledTimes(1);
    });

    it('parses silence_start/silence_end pairs from ffmpeg stderr into intervals', async () => {
      const ffmpegStderr = [
        '[silencedetect @ 0x0] silence_start: 1.999977',
        '[silencedetect @ 0x0] silence_end: 5.000045 | silence_duration: 3.000068',
        '[silencedetect @ 0x0] silence_start: 6.999977',
        '[silencedetect @ 0x0] silence_end: 10.000000 | silence_duration: 3.000023'
      ].join('\n');

      // Dispatch on the actual args ffmpeg was invoked with, rather than call order --
      // more robust than chained mockReturnValueOnce for a two-spawn-call code path.
      mockSpawn.mockImplementation((_cmd: any, spawnArgs: any) => {
        const isVersionCheck = Array.isArray(spawnArgs) && spawnArgs.includes('-version');
        return isVersionCheck ? fakeFfmpegProcess('', 0) : fakeFfmpegProcess(ffmpegStderr, 0);
      });

      const result = await tools.executeTool('detect_silence', {
        mediaPath: '/tmp/some-clip.mp4',
        noiseThresholdDb: -30,
        minDurationSeconds: 1
      });

      expect(result.success).toBe(true);
      expect(result.silenceIntervals).toEqual([
        { start: 1.999977, end: 5.000045, duration: 3 },
        { start: 6.999977, end: 10, duration: 3 }
      ]);
      expect(result.note).toContain('Detection only');
    });

    it('resolves a projectItemId to a media path via the bridge before running ffmpeg', async () => {
      mockBridge.executeScript.mockResolvedValueOnce({
        success: true,
        mediaPath: '/Volumes/Footage/session.mp4'
      });
      mockSpawn.mockImplementation(() => fakeFfmpegProcess('', 0));

      const result = await tools.executeTool('detect_silence', {
        projectItemId: 'item-789'
      });

      expect(mockBridge.executeScript).toHaveBeenCalledTimes(1);
      expect(result.success).toBe(true);
      expect(result.mediaPath).toBe('/Volumes/Footage/session.mp4');
      expect(result.silenceIntervals).toEqual([]);
    });

    it('surfaces a clear error when the project item cannot be resolved to a media path', async () => {
      mockBridge.executeScript.mockResolvedValueOnce({
        success: false,
        error: 'Project item has no media path (is it a sequence or bin?)'
      });

      const result = await tools.executeTool('detect_silence', {
        projectItemId: 'item-a-bin'
      });

      expect(result.success).toBe(false);
      expect(result.error).toContain('no media path');
      expect(mockSpawn).not.toHaveBeenCalled();
    });

    it('reports a clear failure when ffmpeg cannot read the file at all', async () => {
      mockSpawn.mockImplementation((_cmd: any, spawnArgs: any) => {
        const isVersionCheck = Array.isArray(spawnArgs) && spawnArgs.includes('-version');
        return isVersionCheck ? fakeFfmpegProcess('', 0) : fakeFfmpegProcess('Error opening input file', 254);
      });

      const result = await tools.executeTool('detect_silence', {
        mediaPath: '/tmp/does-not-exist.mp4'
      });

      expect(result.success).toBe(false);
      expect(result.error).toContain("couldn't be read");
    });
  });

  describe('script-backed tools', () => {
    it('does not send add_text_overlay to Premiere when no mogrt was given', async () => {
      const result = await tools.executeTool('add_text_overlay', {
        text: 'Hello',
        sequenceId: 'seq-1',
        trackIndex: 0,
        startTime: 0,
        duration: 3,
      });

      expect(result.success).toBe(false);
      expect(result.retry).toBe(false);
      expect(result.error).toMatch(/mogrt/i);
      expect(result.nextStep).toMatch(/mogrtPath|\.mogrt/i);
      expect(mockBridge.executeScript).not.toHaveBeenCalled();
    });

    it('probes MOGRT text fields by name and by JSON, including a scanned brace header', async () => {
      mockBridge.executeScript.mockResolvedValue({ success: true, textRequestedCount: 0 });

      await tools.executeTool('add_text_overlay', {
        sequenceId: 'seq-123',
        trackIndex: 1,
        startTime: 1,
        duration: 7,
        mogrtPath: '/templates/Basic Title.mogrt',
        text: 'HELLO',
      });

      const script = mockBridge.executeScript.mock.calls[0][0] as string;
      expect(script).toContain('function looksLikeTextProperty');
      expect(script).toContain('scan_brace+json');
      expect(script).toContain('mTextString');
      expect(script).not.toContain('mpVal.length > 50');
    });

    it('fails add_text_overlay when every requested text write fails', async () => {
      mockBridge.executeScript.mockResolvedValue({
        success: true,
        clipId: 'graphic-123',
        premiereVersion: '26.0',
        premiereBuild: '12',
        textRequestedCount: 1,
        textInjectionResults: [
          { _strategy: 'components_fallback', textCompsFound: 1 },
          {
            textIndex: 0,
            compIndex: 3,
            propIndex: 0,
            requestedText: 'TREETOP TRANSMISSIONS',
            ok: false,
            error: 'Both JSON parse strategies failed'
          }
        ]
      });

      const result = await tools.executeTool('add_text_overlay', {
        sequenceId: 'seq-123',
        trackIndex: 1,
        startTime: 1,
        duration: 7,
        mogrtPath: '/templates/Basic Title.mogrt',
        text: 'TREETOP TRANSMISSIONS'
      });

      expect(result.success).toBe(false);
      expect(result.textInjectionStatus).toBe('failed');
      expect(result.textInjectionSummary).toEqual({ requested: 1, succeeded: 0, failed: 1 });
      expect(result.error).toContain('Premiere Pro 26.0 (build 12)');
      expect(result.error).toContain('remains on the timeline');
      expect(mockBridge.executeScript).toHaveBeenCalledTimes(1);
    });

    it('optionally removes the timeline Graphic after total text injection failure', async () => {
      mockBridge.executeScript
        .mockResolvedValueOnce({
          success: true,
          clipId: 'graphic-rollback',
          premiereVersion: '26.0',
          textRequestedCount: 1,
          textInjectionResults: [{ textIndex: 0, compIndex: 3, propIndex: 0, ok: false }]
        })
        .mockResolvedValueOnce({
          success: true,
          timelineGraphicRemoved: true,
          note: 'The imported project item may remain in the Project panel.'
        });

      const result = await tools.executeTool('add_text_overlay', {
        sequenceId: 'seq-123',
        trackIndex: 1,
        startTime: 1,
        duration: 7,
        mogrtPath: '/templates/Basic Title.mogrt',
        text: 'TREETOP TRANSMISSIONS',
        rollbackOnTextFailure: true
      });

      expect(result.success).toBe(false);
      expect(result.rollback.timelineGraphicRemoved).toBe(true);
      expect(result.error).toContain('timeline Graphic was removed');
      expect(result.clipId).toBeUndefined();
      expect(result.removedClipId).toBe('graphic-rollback');
      expect(mockBridge.executeScript).toHaveBeenCalledTimes(2);
      expect(mockBridge.executeScript.mock.calls[1][0]).toContain(
        '__findClip("graphic-rollback", "seq-123")'
      );
      expect(mockBridge.executeScript.mock.calls[1][0]).toContain('info.clip.remove(false, true)');
    });

    it('reports partial add_text_overlay writes without treating strategy markers as attempts', async () => {
      mockBridge.executeScript.mockResolvedValue({
        success: true,
        clipId: 'graphic-partial',
        textRequestedCount: 2,
        textInjectionResults: [
          { _strategy: 'getMGTComponent', textCompsFound: 2 },
          { textIndex: 0, ok: true },
          { textIndex: 1, ok: false, error: 'readback mismatch' }
        ]
      });

      const result = await tools.executeTool('add_text_overlay', {
        sequenceId: 'seq-123',
        trackIndex: 1,
        startTime: 1,
        duration: 7,
        mogrtPath: '/templates/Lower Third.mogrt',
        text: 'Title',
        text2: 'Subtitle'
      });

      expect(result.success).toBe(true);
      expect(result.textInjectionStatus).toBe('partial');
      expect(result.textInjectionSummary).toEqual({ requested: 2, succeeded: 1, failed: 1 });
      expect(result.warning).toContain('1 of 2');
    });

    it('does not roll back an imported Graphic when at least one requested text write succeeds', async () => {
      mockBridge.executeScript.mockResolvedValue({
        success: true,
        clipId: 'graphic-partial',
        textRequestedCount: 2,
        textInjectionResults: [
          { textIndex: 0, ok: true },
          { textIndex: 1, ok: false }
        ]
      });

      const result = await tools.executeTool('add_text_overlay', {
        sequenceId: 'seq-123',
        trackIndex: 1,
        startTime: 1,
        duration: 7,
        mogrtPath: '/templates/Lower Third.mogrt',
        text: 'Title',
        text2: 'Subtitle',
        rollbackOnTextFailure: true
      });

      expect(result.textInjectionStatus).toBe('partial');
      expect(mockBridge.executeScript).toHaveBeenCalledTimes(1);
    });

    it('reports rollback failure while preserving the original text injection failure', async () => {
      mockBridge.executeScript
        .mockResolvedValueOnce({
          success: true,
          clipId: 'graphic-stuck',
          premiereVersion: '26.0',
          textRequestedCount: 1,
          textInjectionResults: [{ textIndex: 0, ok: false }]
        })
        .mockResolvedValueOnce({
          success: false,
          timelineGraphicRemoved: false,
          error: 'Track item is locked'
        });

      const result = await tools.executeTool('add_text_overlay', {
        sequenceId: 'seq-123',
        trackIndex: 1,
        startTime: 1,
        duration: 7,
        mogrtPath: '/templates/Basic Title.mogrt',
        text: 'Title',
        rollbackOnTextFailure: true
      });

      expect(result.success).toBe(false);
      expect(result.error).toContain('Text injection failed');
      expect(result.error).toContain('Rollback of the imported timeline Graphic also failed');
      expect(result.rollback.error).toBe('Track item is locked');
      expect(result.clipId).toBe('graphic-stuck');
      expect(result.removedClipId).toBeUndefined();
    });

    it('rolls back a Graphic surfaced by a hard post-import script failure', async () => {
      mockBridge.executeScript
        .mockResolvedValueOnce({
          success: false,
          error: 'Unexpected property access failure',
          clipId: 'graphic-hard-failure'
        })
        .mockResolvedValueOnce({
          success: true,
          timelineGraphicRemoved: true
        });

      const result = await tools.executeTool('add_text_overlay', {
        sequenceId: 'seq-123',
        trackIndex: 1,
        startTime: 1,
        duration: 7,
        mogrtPath: '/templates/Basic Title.mogrt',
        text: 'Title',
        rollbackOnTextFailure: true
      });

      expect(result.success).toBe(false);
      expect(result.error).toContain('Unexpected property access failure');
      expect(result.error).toContain('timeline Graphic was removed');
      expect(result.removedClipId).toBe('graphic-hard-failure');
      expect(mockBridge.executeScript).toHaveBeenCalledTimes(2);
    });

    it('keeps import-only text overlay results distinct from failed injection', () => {
      const result = evaluateTextInjectionResult({
        success: true,
        textRequestedCount: 0,
        textInjectionResults: [{ _strategy: 'components_fallback', textCompsFound: 0 }]
      });

      expect(result.success).toBe(true);
      expect(result.textInjectionStatus).toBe('not_requested');
      expect(result.textInjectionSummary).toEqual({ requested: 0, succeeded: 0, failed: 0 });
    });

    it('executes list_project_items', async () => {
      mockBridge.executeScript.mockResolvedValue({
        success: true,
        items: [],
        bins: [],
        totalItems: 0,
        totalBins: 0
      });

      const result = await tools.executeTool('list_project_items', {});

      expect(mockBridge.executeScript).toHaveBeenCalled();
      expect(result.success).toBe(true);
    });

    it('uses current argument names for split_clip', async () => {
      mockBridge.executeScript.mockResolvedValue({
        success: true,
        clips: ['clip-a', 'clip-b']
      });

      const result = await tools.executeTool('split_clip', {
        clipId: 'clip-123',
        splitTime: 5.5
      });

      expect(mockBridge.executeScript).toHaveBeenCalled();
      expect(result.success).toBe(true);
    });

    it('supports razoring a timeline across multiple tracks', async () => {
      mockBridge.executeScript.mockResolvedValue({
        success: true,
        sequenceId: 'seq-123',
        time: 12.5,
        timecode: '00:00:12:15',
        cutVideoTracks: [0, 1],
        cutAudioTracks: [0, 2, 3]
      });

      const result = await tools.executeTool('razor_timeline_at_time', {
        sequenceId: 'seq-123',
        time: 12.5,
        videoTrackIndices: [0, 1],
        audioTrackIndices: [0, 2, 3]
      });

      expect(mockBridge.executeScript).toHaveBeenCalled();
      expect(result.success).toBe(true);
      expect(result.cutVideoTracks).toEqual([0, 1]);
      expect(result.cutAudioTracks).toEqual([0, 2, 3]);
    });

    it('validates crop_clip bounds before calling the bridge', async () => {
      const result = await tools.executeTool('crop_clip', {
        clipId: 'clip-123',
        left: 101
      });

      expect(result.success).toBe(false);
      expect(result.error).toContain('Invalid arguments');
      expect(mockBridge.executeScript).not.toHaveBeenCalled();
    });

    it('identifies the newly inserted apply_effect component instead of assuming it is last', async () => {
      mockBridge.executeScript.mockResolvedValue({
        success: true,
        effectName: 'Lumetri Color',
        addedComponent: {
          displayName: 'Lumetri Color',
          componentIndex: 2,
          identificationStrategy: 'unique ordered component fingerprint insertion'
        }
      });

      const result = await tools.executeTool('apply_effect', {
        clipId: 'clip-123',
        effectName: 'Lumetri Color',
        parameters: { Exposure: 0 }
      });

      expect(result.success).toBe(true);
      const script = mockBridge.executeScript.mock.calls[0][0];
      expect(script).toContain('var beforeComponents = snapshotComponents(clip)');
      expect(script).toContain('var afterInfo = __findClip("clip-123")');
      expect(script).toContain('if (afterIndex !== candidateIndex) withoutCandidate.push(afterComponents[afterIndex])');
      expect(script).toContain('if (candidateIndices.length !== 1)');
      expect(script).toContain('no parameters were written');
      expect(script).toContain('effectAdded: true');
      expect(script).toContain('retryUnsafe: true');
      expect(script).not.toContain('var newCompIdx = afterCount - 1');
    });

    it('requires apply_effect parameter readback to verify or demonstrably change', async () => {
      mockBridge.executeScript.mockResolvedValue({
        success: false,
        error: 'One or more effect parameters could not be set'
      });

      await tools.executeTool('apply_effect', {
        clipId: 'clip-123',
        effectName: 'Lumetri Color',
        parameters: { Exposure: -5.7 }
      });

      const script = mockBridge.executeScript.mock.calls[0][0];
      expect(script).toContain('verification: verified ? "verified"');
      expect(script).toContain('var resultOk = verified || acceptedWithWarning');
      expect(script).toContain('Premiere changed the property but readback differs');
      expect(script).toContain('Premiere accepted setValue but the resulting value could not be read back');
      expect(script).toContain('if (!valuesEquivalent(actual[vai], requested[vai]))');
      expect(script).toContain('warnings: paramWarnings');
      expect(script).toContain('if (__namesMatch(newComp.properties[k].displayName, pName))');
      expect(script).toContain('__coercePropertyValue');
    });

    it('returns an explicit unsupported result for caption track deletion', async () => {
      const result = await tools.executeTool('delete_track', {
        sequenceId: 'seq-123',
        trackType: 'caption',
        trackIndex: 0
      });

      expect(result.success).toBe(false);
      expect(result.unsupportedByPremiereApi).toBe(true);
      expect(result.error).toContain('Caption track deletion is not supported');
      expect(mockBridge.executeScript).not.toHaveBeenCalled();
    });

    it('executes crop_clip through the dedicated Crop implementation', async () => {
      mockBridge.executeScript.mockResolvedValue({
        success: true,
        effectName: 'Crop',
        effectAdded: true,
        paramResults: [
          { requestedName: 'Left', ok: true, valueAfter: 12 },
          { requestedName: 'Bottom', ok: true, valueAfter: 25 }
        ]
      });

      const result = await tools.executeTool('crop_clip', {
        clipId: 'clip-123',
        left: 12,
        bottom: 25,
        zoom: true
      });

      expect(result.success).toBe(true);
      expect(result.effectName).toBe('Crop');
      expect(mockBridge.executeScript).toHaveBeenCalledTimes(1);
      const script = mockBridge.executeScript.mock.calls[0][0];
      expect(script).toContain('__findQeNamed("videoEffect", "Crop")');
      expect(script).toContain('findQeClipByTime');
      expect(script).toContain('"Left":12');
      expect(script).toContain('"Bottom":25');
      expect(script).toContain('"Zoom":true');
    });

    it('uses current argument names for add_transition', async () => {
      mockBridge.executeScript.mockResolvedValue({
        success: true,
        transitionId: 'trans-123'
      });

      const result = await tools.executeTool('add_transition', {
        clipId1: 'clip-1',
        clipId2: 'clip-2',
        transitionName: 'Cross Dissolve',
        duration: 0.75
      });

      expect(mockBridge.executeScript).toHaveBeenCalled();
      expect(result.success).toBe(true);
    });

    it('verifies trim_clip duration writes instead of trusting a silent Premiere no-op', async () => {
      mockBridge.executeScript.mockResolvedValue({
        success: true,
        newDuration: 2.5
      });

      const result = await tools.executeTool('trim_clip', {
        clipId: 'clip-123',
        duration: 2.5
      });

      expect(result.success).toBe(true);
      const script = mockBridge.executeScript.mock.calls[0][0];
      expect(script).toContain('clip.end = timeFromSeconds(secondsOf(clip.start) + targetDuration)');
      expect(script).toContain('if (closeEnough(durationAfterEnd.duration, targetDuration))');
      expect(script).toContain('clip.outPoint = timeFromSeconds(targetOutPoint)');
      expect(script).not.toContain('new Time(clip.inPoint.seconds + 2.5)');
      expect(script).toContain('timeline duration did not change to requested value');
      expect(script).toContain('TRIM_UNSUPPORTED_FOR_CLIP');
      expect(script).toContain('rollback("outPoint", original.outPoint)');
    });

    it('rejects conflicting trim_clip duration and outPoint arguments before calling Premiere', async () => {
      const result = await tools.executeTool('trim_clip', {
        clipId: 'clip-123',
        outPoint: 8,
        duration: 2.5
      });

      expect(result.success).toBe(false);
      expect(result.error).toContain('outPoint and duration cannot be used together');
      expect(mockBridge.executeScript).not.toHaveBeenCalled();
    });

    it('does not mutate a source outPoint when a duration extension is unsupported', async () => {
      mockBridge.executeScript.mockResolvedValue({ success: true });
      await tools.executeTool('trim_clip', { clipId: 'graphic-1', duration: 7 });
      const script = mockBridge.executeScript.mock.calls[0][0];
      const ticksPerSecond = 254016000000;
      class FakeTime {
        private value = 0;
        get seconds() { return this.value; }
        set seconds(value: number) { this.value = value; }
        get ticks() { return String(Math.round(this.value * ticksPerSecond)); }
        set ticks(value: string) { this.value = Number(value) / ticksPerSecond; }
      }
      const at = (seconds: number) => {
        const time = new FakeTime();
        time.seconds = seconds;
        return time;
      };
      let outPointWrites = 0;
      const clip: any = {
        inPoint: at(3599.9964),
        start: at(0),
        duration: at(4.97163333333333)
      };
      let sourceOut = at(3604.96803333333);
      let timelineEnd = at(4.97163333333333);
      Object.defineProperty(clip, 'outPoint', {
        get: () => sourceOut,
        set: (value) => { outPointWrites++; sourceOut = value; }
      });
      Object.defineProperty(clip, 'end', {
        get: () => timelineEnd,
        set: () => { /* Premiere silently ignores this native Graphic extension. */ }
      });
      const runScript = new Function('__findClip', 'Time', script);
      const parsed = JSON.parse(runScript(
        () => ({ clip, sequence: { timebase: String(Math.round(ticksPerSecond * 1001 / 30000)) } }),
        FakeTime
      ));

      expect(parsed.success).toBe(false);
      expect(parsed.errorCode).toBe('TRIM_UNSUPPORTED_FOR_CLIP');
      expect(parsed.attempted.outPoint).toBeCloseTo(3604.96803333333);
      expect(parsed.restored.outPoint).toBeCloseTo(3604.96803333333);
      expect(parsed.rolledBack).toBe(true);
      expect(outPointWrites).toBe(0);
    });

    it('accepts a duration that Premiere quantizes to the nearest frame', async () => {
      mockBridge.executeScript.mockResolvedValue({ success: true });
      await tools.executeTool('trim_clip', { clipId: 'clip-123', duration: 7 });
      const script = mockBridge.executeScript.mock.calls[0][0];
      const ticksPerSecond = 254016000000;
      class FakeTime {
        private value = 0;
        get seconds() { return this.value; }
        set seconds(value: number) { this.value = value; }
        get ticks() { return String(Math.round(this.value * ticksPerSecond)); }
        set ticks(value: string) { this.value = Number(value) / ticksPerSecond; }
      }
      const at = (seconds: number) => {
        const time = new FakeTime();
        time.seconds = seconds;
        return time;
      };
      const clip: any = { inPoint: at(0), outPoint: at(5), start: at(0) };
      let timelineEnd = at(5);
      Object.defineProperty(clip, 'end', {
        get: () => timelineEnd,
        set: () => { timelineEnd = at(7.007); }
      });
      Object.defineProperty(clip, 'duration', {
        get: () => at(timelineEnd.seconds - clip.start.seconds)
      });
      const runScript = new Function('__findClip', 'Time', script);
      const parsed = JSON.parse(runScript(
        () => ({ clip, sequence: { timebase: String(Math.round(ticksPerSecond * 1001 / 30000)) } }),
        FakeTime
      ));

      expect(parsed.success).toBe(true);
      expect(parsed.newDuration).toBeCloseTo(7.007);
    });

    it('writes a one-frame duration change instead of treating it as an idempotent no-op', async () => {
      mockBridge.executeScript.mockResolvedValue({ success: true });
      await tools.executeTool('trim_clip', { clipId: 'clip-123', duration: 5.0333666667 });
      const script = mockBridge.executeScript.mock.calls[0][0];

      expect(script).toContain('if (!exactEnough(before.duration, targetDuration))');
      expect(script).not.toContain('if (!closeEnough(before.duration, targetDuration))');
      expect(script).toContain('frameDurationSeconds / 2');
    });

    it('generates a non-destructive export readiness validation script', async () => {
      mockBridge.executeScript.mockResolvedValue({
        success: true,
        readyForExport: true,
        errors: [],
        warnings: [],
        summary: { videoClipCount: 1 }
      });

      const result = await tools.executeTool('validate_project_for_export', {
        sequenceId: 'seq-1',
        outputPath: '/tmp/output.mp4',
        presetPath: '/tmp/export.epr'
      });

      expect(result.success).toBe(true);
      const script = mockBridge.executeScript.mock.calls[0][0];
      expect(script).toContain('readyForExport');
      expect(script).toContain('OFFLINE_OR_MISSING_MEDIA');
      expect(script).toContain('PRESET_NOT_FOUND');
      expect(script).toContain('TIMELINE_GAPS');
      expect(script).not.toContain('encodeSequence');
      expect(script).not.toContain('renderSequence');
    });

    it('reads export validation duration from tick strings while keeping ZERO_DURATION', async () => {
      mockBridge.executeScript.mockResolvedValue({
        success: true,
        readyForExport: true,
        errors: [],
        warnings: [],
        summary: { videoClipCount: 1 }
      });

      await tools.executeTool('validate_project_for_export', {
        sequenceId: 'seq-1',
        outputPath: '/tmp/output.mp4',
        presetPath: '/tmp/export.epr'
      });

      const script = mockBridge.executeScript.mock.calls[0][0] as string;

      // The readiness gate itself must be untouched: still an error, still keyed
      // off a non-positive duration, still sourced from the active sequence.
      expect(script).toContain('durationSeconds: sequence ? secondsOf(sequence.end) : 0');
      expect(script).toContain('if (summary.durationSeconds <= 0)');
      expect(script).toContain('code: "ZERO_DURATION"');

      const extracted = script.match(/ {8}function secondsOf\(value\) \{[\s\S]*?\n {8}\}/);
      expect(extracted).not.toBeNull();
      // eslint-disable-next-line @typescript-eslint/no-implied-eval
      const secondsOf = new Function(`${extracted![0]}\nreturn secondsOf;`)() as (value: unknown) => number;

      const TICKS_PER_SECOND = 254016000000;

      // A real sequence holding clips: Premiere 26.3 hands back a tick string.
      expect(secondsOf(String(Math.round(3.211 * TICKS_PER_SECOND)))).toBeCloseTo(3.211, 6);
      // A genuinely empty sequence still reports zero, so ZERO_DURATION survives.
      expect(secondsOf('0')).toBe(0);
      // No active sequence resolves to zero through the ternary above.
      expect(secondsOf(undefined)).toBe(0);
      expect(secondsOf(null)).toBe(0);
      // Legacy Time object shapes keep working unchanged.
      expect(secondsOf({ seconds: 5 })).toBe(5);
      expect(secondsOf({ ticks: String(TICKS_PER_SECOND) })).toBe(1);
      expect(secondsOf(2.5)).toBe(2.5);
      // Malformed host values fail safe to zero rather than leaking NaN, which
      // would slip past the `<= 0` comparison and disable the guard entirely.
      expect(secondsOf('not-a-number')).toBe(0);
      expect(secondsOf(NaN)).toBe(0);
      expect(secondsOf({ seconds: 'oops' })).toBe(0);
      expect(secondsOf({ ticks: 'oops' })).toBe(0);
    });

    it('keeps timeline inspection tools reading sequence end as ticks', async () => {
      mockBridge.executeScript.mockResolvedValue({ success: true, sequences: [], count: 0 });

      await tools.executeTool('list_sequences', {});

      expect(mockBridge.executeScript.mock.calls[0][0] as string).toContain('__ticksToSeconds(seq.end)');
    });

    it('uses verifiable QE transition calls for add_transition', async () => {
      mockBridge.executeScript.mockResolvedValue({
        success: true,
        transitionId: 'trans-123'
      });

      const result = await tools.executeTool('add_transition', {
        clipId1: 'clip-1',
        clipId2: 'clip-2',
        transitionName: 'Cross Dissolve',
        duration: 0.75
      });

      expect(result.success).toBe(true);
      const script = mockBridge.executeScript.mock.calls[0][0];
      expect(script).toContain('var info2 = __findClip("clip-2")');
      expect(script).toContain('qeClip.addTransition(transition, info2 ? false : true, String(frames), "0"');
      expect(script).toContain(', 0.5, true, true)');
      expect(script).not.toContain('frames + ":00"');
      expect(script).toContain('__transitionWasVerified(before, after)');
      expect(script).toContain('__transitionWasVerifiedByXml(beforeXml, afterXml)');
      expect(script).toContain('accepted_unverified');
      expect(script).not.toContain('Transition call completed but Premiere Pro did not expose a verified transition change');
    });

    it('distinguishes verified, accepted-unverified, and failed add_transition_to_clip results', async () => {
      mockBridge.executeScript.mockResolvedValue({
        success: true,
        status: 'accepted_unverified',
        verified: false
      });

      const result = await tools.executeTool('add_transition_to_clip', {
        clipId: 'clip-1',
        transitionName: 'Cross Dissolve',
        position: 'start',
        duration: 0.5
      });

      expect(result).toMatchObject({
        success: true,
        status: 'accepted_unverified',
        verified: false
      });
      const script = mockBridge.executeScript.mock.calls[0][0];
      expect(script).toContain('var qeVerified = __transitionWasVerified(before, after)');
      expect(script).toContain('var xmlVerified = __transitionWasVerifiedByXml(beforeXml, afterXml)');
      expect(script).toContain('if (!qeVerified && !xmlVerified)');
      expect(script).toContain('status: "accepted_unverified"');
      expect(script).toContain('verified: false');
      expect(script).toContain('status: "applied_verified"');
      expect(script).toContain('verified: true');
      expect(script).toContain('transitionEnumeration: {');
      expect(script).toContain('finalCutProXml: {');
      expect(script).toContain('beforeError: beforeXml.error');
      expect(script).toContain('warning: "Transition command accepted; result could not be independently verified."');
      expect(script).toContain('status: "failed"');
      expect(script).not.toContain('applied: true');
      expect(script).not.toContain('Transition call completed but Premiere Pro did not expose a verified transition change');
      expect(script).toContain('Skipped: FCP XML export opens Translation Results dialogs');
      expect(script).not.toContain('seq.exportAsFinalCutProXML(file.fsName)');

      const tool = tools.getAvailableTools().find((candidate) => candidate.name === 'add_transition_to_clip');
      expect(tool?.description).toContain('do not retry automatically');
    });

    describe('add_transition_to_clip argument normalisation', () => {
      // Telemetry on this tool was almost entirely schema validation (~12ms),
      // not Premiere. Agents send a string duration and a capitalised or
      // synonymous position; the enum and number schemas rejected those
      // before the bridge was touched, and the same caller then retried.
      const BASE = {
        clipId: 'clip-1',
        transitionName: 'Cross Dissolve',
      };

      it('reaches Premiere when duration is a numeric string', async () => {
        mockBridge.executeScript.mockResolvedValue({ success: true, status: 'applied_verified', verified: true });

        const result = await tools.executeTool('add_transition_to_clip', {
          ...BASE,
          position: 'start',
          duration: '0.5',
        });

        expect(result.success).toBe(true);
        expect(mockBridge.executeScript).toHaveBeenCalled();
        expect(mockBridge.executeScript.mock.calls[0][0]).toContain('Math.round(0.5 * fps)');
      });

      it.each([
        ['End', true],
        ['START', false],
        [' in ', false],
        ['out', true],
        ['head', false],
        ['tail', true],
      ])('maps position %j to atEnd=%s', async (position, atEnd) => {
        mockBridge.executeScript.mockResolvedValue({ success: true, status: 'applied_verified', verified: true });

        const result = await tools.executeTool('add_transition_to_clip', {
          ...BASE,
          position,
          duration: 0.5,
        });

        expect(result.success).toBe(true);
        expect(mockBridge.executeScript.mock.calls[0][0]).toContain(
          `qeClip.addTransition(transition, ${atEnd}, String(frames)`,
        );
      });

      it('still rejects a position that is not start or end', async () => {
        const result = await tools.executeTool('add_transition_to_clip', {
          ...BASE,
          position: 'middle',
          duration: 0.5,
        });

        expect(result.success).toBe(false);
        expect(result.error).toContain('Invalid arguments');
        expect(mockBridge.executeScript).not.toHaveBeenCalled();
      });
    });

    it('passes speed_change multipliers to QE as ratios with the 5-arg signature', async () => {
      mockBridge.executeScript.mockResolvedValue({ success: true });

      await tools.executeTool('speed_change', { clipId: 'clip-1', speed: 0.5, maintainAudio: true });
      expect(mockBridge.executeScript.mock.calls[0][0]).toContain(
        '__setClipSpeed(qeClip, info.clip, ratio, false, true, false)',
      );
      expect(mockBridge.executeScript.mock.calls[0][0]).toContain('__normalizeSpeedRatio(0.5)');
      expect(mockBridge.executeScript.mock.calls[0][0]).not.toContain('setSpeed(50, true)');

      jest.clearAllMocks();
      mockBridge.executeScript.mockResolvedValue({ success: true });
      await tools.executeTool('speed_change', { clipId: 'clip-1', speed: 2 });
      expect(mockBridge.executeScript.mock.calls[0][0]).toContain('__normalizeSpeedRatio(2)');

      jest.clearAllMocks();
      mockBridge.executeScript.mockResolvedValue({ success: true });
      await tools.executeTool('speed_change', { clipId: 'clip-1', speed: 150 });
      expect(mockBridge.executeScript.mock.calls[0][0]).toContain('__normalizeSpeedRatio(150)');
    });

    it('matches add_keyframe component and parameter names through locale aliases', async () => {
      mockBridge.executeScript.mockResolvedValue({ success: true });

      await tools.executeTool('add_keyframe', {
        clipId: 'clip-1',
        componentName: 'motion',
        paramName: 'scale',
        time: 1,
        value: 120,
      });

      const script = mockBridge.executeScript.mock.calls[0][0] as string;
      expect(script).toContain('__resolveClipProperty');
      expect(script).toContain('"motion"');
      expect(script).toContain('"scale"');
    });

    it('accepts a Position array as add_keyframe value', async () => {
      mockBridge.executeScript.mockResolvedValue({ success: true });

      const result = await tools.executeTool('add_keyframe', {
        clipId: 'clip-1',
        componentName: 'Motion',
        paramName: 'Position',
        time: 1,
        value: [0.4, 0.6],
      });

      expect(result.success).not.toBe(false);
      const script = mockBridge.executeScript.mock.calls[0][0] as string;
      expect(script).toContain('[0.4,0.6]');
    });

    it('fails batch_add_transitions when no transition is verifiably added', async () => {
      mockBridge.executeScript.mockResolvedValue({
        success: false,
        error: 'No transitions were verifiably added'
      });

      const result = await tools.executeTool('batch_add_transitions', {
        sequenceId: 'seq-123',
        trackIndex: 0,
        transitionName: 'Cross Dissolve',
        duration: 0.5
      });

      expect(result.success).toBe(false);
      const script = mockBridge.executeScript.mock.calls[0][0];
      expect(script).toContain('qeClip.addTransition(transition, true, String(frames), "0"');
      expect(script).not.toContain('frames + ":00"');
      expect(script).toContain('No transitions were verifiably added');
    });

    it('looks up clip properties in the requested sequence', async () => {
      mockBridge.executeScript.mockResolvedValue({ success: true, properties: {} });

      const result = await tools.executeTool('get_clip_properties', {
        clipId: 'clip-123',
        sequenceId: 'seq-456'
      });

      expect(result.success).toBe(true);
      expect(mockBridge.executeScript).toHaveBeenCalledWith(expect.stringContaining('__findClip("clip-123", "seq-456")'));
    });

    it('removes clips from the requested sequence', async () => {
      mockBridge.executeScript.mockResolvedValue({ success: true, clipId: 'clip-123' });

      const result = await tools.executeTool('remove_from_timeline', {
        clipId: 'clip-123',
        sequenceId: 'seq-456',
        deleteMode: 'lift'
      });

      expect(result.success).toBe(true);
      expect(mockBridge.executeScript).toHaveBeenCalledWith(expect.stringContaining('__findClip("clip-123", "seq-456")'));
      expect(mockBridge.executeScript).toHaveBeenCalledWith(expect.stringContaining('var isRipple = "lift" === "ripple";'));
    });
  });

  describe('marker sequence targeting', () => {
    // Premiere's ExtendScript DOM can mutate any sequence in the project, not only the one
    // on screen, so these tools must act on the sequenceId they advertise instead of
    // silently retargeting app.project.activeSequence.
    const markerCalls: Array<{ tool: string; args: Record<string, any> }> = [
      { tool: 'add_marker', args: { sequenceId: 'seq-target', time: 3, name: 'Cue' } },
      { tool: 'delete_marker', args: { sequenceId: 'seq-target', markerId: 'marker-1' } },
      { tool: 'update_marker', args: { sequenceId: 'seq-target', markerId: 'marker-1', name: 'Renamed' } },
      { tool: 'list_markers', args: { sequenceId: 'seq-target' } }
    ];

    it.each(markerCalls)('resolves the requested sequence for $tool', async ({ tool, args }) => {
      mockBridge.executeScript.mockResolvedValue({ success: true });

      await tools.executeTool(tool, args);

      const script = mockBridge.executeScript.mock.calls[0][0] as string;
      expect(script).toContain('__findSequence("seq-target")');
      expect(script).not.toContain('app.project.activeSequence');
    });

    it.each(markerCalls)('returns a truthful error instead of retargeting for $tool', async ({ tool, args }) => {
      mockBridge.executeScript.mockResolvedValue({ success: true });

      await tools.executeTool(tool, args);

      const script = mockBridge.executeScript.mock.calls[0][0] as string;
      expect(script).toContain('"Sequence not found by id: "');
      expect(script).toContain('Use list_sequences or get_active_sequence to obtain a valid sequence ID.');
    });

    it.each(markerCalls)('rejects an empty sequenceId for $tool before touching the bridge', async ({ tool, args }) => {
      const result = await tools.executeTool(tool, { ...args, sequenceId: '' });

      expect(result.success).toBe(false);
      expect(result.error).toContain('Invalid arguments');
      expect(mockBridge.executeScript).not.toHaveBeenCalled();
    });

    it('escapes quoted sequence ids so they cannot break out of the generated script', async () => {
      mockBridge.executeScript.mockResolvedValue({ success: true });

      await tools.executeTool('list_markers', { sequenceId: 'seq-"quoted"' });

      const script = mockBridge.executeScript.mock.calls[0][0] as string;
      expect(script).toContain('__findSequence("seq-\\"quoted\\"")');
      expect(script).not.toContain('__findSequence("seq-"quoted"")');
    });

    it('reports which sequence a marker was written to', async () => {
      mockBridge.executeScript.mockResolvedValue({ success: true });

      await tools.executeTool('add_marker', { sequenceId: 'seq-target', time: 3, name: 'Cue' });

      const script = mockBridge.executeScript.mock.calls[0][0] as string;
      expect(script).toContain('sequenceId: sequence.sequenceID');
      expect(script).toContain('sequenceName: sequence.name');
    });
  });

  describe('track tool sequence targeting', () => {
    // Same class of bug as the marker tools: these declared a sequenceId and then operated on
    // app.project.activeSequence, or resolved the id and silently fell back to the active
    // sequence when it did not match.
    const trackCalls: Array<{ tool: string; args: Record<string, any> }> = [
      { tool: 'lock_track', args: { sequenceId: 'seq-target', trackType: 'video', trackIndex: 0, locked: true } },
      { tool: 'toggle_track_visibility', args: { sequenceId: 'seq-target', trackIndex: 0, visible: false } },
      { tool: 'delete_track', args: { sequenceId: 'seq-target', trackType: 'video', trackIndex: 1 } }
    ];

    it('fails truthfully instead of falling back for list_sequence_tracks', async () => {
      // This one keeps its existing lookup and replaces only the silent fallback,
      // which previously echoed the requested id beside a different sequence's
      // tracks -- a substitution the caller had no way to detect.
      mockBridge.executeScript.mockResolvedValue({ success: true });

      await tools.executeTool('list_sequence_tracks', { sequenceId: 'seq-target' });

      const script = mockBridge.executeScript.mock.calls[0][0] as string;
      expect(script).toContain('Sequence not found by id:');
      expect(script).not.toContain('sequence = app.project.activeSequence;');
    });

    it.each(trackCalls)('resolves the requested sequence for $tool', async ({ tool, args }) => {
      mockBridge.executeScript.mockResolvedValue({ success: true });

      await tools.executeTool(tool, args);

      const script = mockBridge.executeScript.mock.calls[0][0] as string;
      expect(script).toContain('__findSequence("seq-target")');
      expect(script).toContain('"Sequence not found by id: "');
    });

    it.each(trackCalls)('rejects an empty sequenceId for $tool before touching the bridge', async ({ tool, args }) => {
      const result = await tools.executeTool(tool, { ...args, sequenceId: '' });

      expect(result.success).toBe(false);
      expect(result.error).toContain('Invalid arguments');
      expect(mockBridge.executeScript).not.toHaveBeenCalled();
    });

    it.each([
      { tool: 'list_sequence_tracks', args: { sequenceId: 'seq-target' } },
      { tool: 'lock_track', args: { sequenceId: 'seq-target', trackType: 'video', trackIndex: 0, locked: true } },
      { tool: 'toggle_track_visibility', args: { sequenceId: 'seq-target', trackIndex: 0, visible: false } }
    ])('never falls back to the active sequence for $tool', async ({ tool, args }) => {
      mockBridge.executeScript.mockResolvedValue({ success: true });

      await tools.executeTool(tool, args);

      const script = mockBridge.executeScript.mock.calls[0][0] as string;
      expect(script).not.toContain('app.project.activeSequence');
    });

    it('echoes the resolved sequence id from list_sequence_tracks rather than the requested one', async () => {
      mockBridge.executeScript.mockResolvedValue({ success: true });

      await tools.executeTool('list_sequence_tracks', { sequenceId: 'seq-target' });

      const script = mockBridge.executeScript.mock.calls[0][0] as string;
      expect(script).toContain('sequenceId: sequence.sequenceID');
      expect(script).not.toContain('sequenceId: "seq-target"');
    });

    it('deletes from the requested sequence rather than requiring it to be active', async () => {
      // Premiere 26 has no DOM trackCollection.deleteTrack, so deletion falls
      // through to QE. QE reaches sequences by index through getSequenceAt(),
      // not just the active one — verified against 26.0.2 — so requiring the
      // target to be active refused work QE can actually do.
      mockBridge.executeScript.mockResolvedValue({ success: true });

      await tools.executeTool('delete_track', { sequenceId: 'seq-target', trackType: 'video', trackIndex: 1 });

      const script = mockBridge.executeScript.mock.calls[0][0] as string;
      expect(script).toContain('var qeSeq = __qeSequenceFor(sequence);');
      expect(script).not.toContain('activeSeq.sequenceID !== sequence.sequenceID');
      expect(script).not.toContain('var qeSeq = qe.project.getActiveSequence()');
    });

    it('reports a sequence QE cannot address instead of deleting from the wrong one', async () => {
      mockBridge.executeScript.mockResolvedValue({ success: true });

      await tools.executeTool('delete_track', { sequenceId: 'seq-target', trackType: 'video', trackIndex: 1 });

      const script = mockBridge.executeScript.mock.calls[0][0] as string;
      expect(script).toContain('requiresOpenSequence: true');
      // The refusal has to name the sequence, so a caller can tell which one
      // needs opening rather than guessing.
      expect(script).toContain("cannot address sequence '\" + sequence.name + \"'");
    });

    it('still reports caption track deletion as unsupported without touching the bridge', async () => {
      const result = await tools.executeTool('delete_track', {
        sequenceId: 'seq-target',
        trackType: 'caption',
        trackIndex: 0
      });

      expect(result.success).toBe(false);
      expect(result.unsupportedByPremiereApi).toBe(true);
      expect(result.sequenceId).toBe('seq-target');
      expect(mockBridge.executeScript).not.toHaveBeenCalled();
    });
  });

  describe('high-level workflow tools', () => {
    it('builds a motion graphics demo sequence', async () => {
      mockBridge.importMedia = jest
        .fn()
        .mockResolvedValueOnce({ success: true, id: 'item-1', name: '01_focus.png' } as any)
        .mockResolvedValueOnce({ success: true, id: 'item-2', name: '02_precision.png' } as any)
        .mockResolvedValueOnce({ success: true, id: 'item-3', name: '03_finish.png' } as any);
      mockBridge.addToTimeline = jest
        .fn()
        .mockResolvedValueOnce({ success: true, id: 'clip-1', name: '01_focus.png' } as any)
        .mockResolvedValueOnce({ success: true, id: 'clip-2', name: '02_precision.png' } as any)
        .mockResolvedValueOnce({ success: true, id: 'clip-3', name: '03_finish.png' } as any);
      mockBridge.executeScript
        .mockResolvedValueOnce({ success: true, id: 'seq-1', name: 'Demo Sequence' })
        .mockResolvedValue({ success: true, videoTracks: [], audioTracks: [] });

      const result = await tools.executeTool('build_motion_graphics_demo', {
        sequenceName: 'Demo Sequence'
      });

      expect(result.success).toBe(true);
      expect(result.sequence.id).toBe('seq-1');
      expect(result.assets).toHaveLength(3);
      expect(mockBridge.importMedia).toHaveBeenCalledTimes(3);
      expect(mockBridge.addToTimeline).toHaveBeenCalledTimes(3);
    }, 30000);

    it('assembles a product spot from provided assets', async () => {
      mockBridge.importMedia = jest
        .fn()
        .mockResolvedValueOnce({ success: true, id: 'item-a', name: 'a.mp4' } as any)
        .mockResolvedValueOnce({ success: true, id: 'item-b', name: 'b.mp4' } as any);
      mockBridge.addToTimeline = jest
        .fn()
        .mockResolvedValueOnce({ success: true, id: 'clip-a', name: 'a.mp4', inPoint: 0, outPoint: 4 } as any)
        .mockResolvedValueOnce({ success: true, id: 'clip-b', name: 'b.mp4', inPoint: 4, outPoint: 8 } as any);
      mockBridge.executeScript
        .mockResolvedValueOnce({ success: true, id: 'seq-2', name: 'Product Spot' })
        .mockResolvedValue({ success: true, videoTracks: [], audioTracks: [] });

      const result = await tools.executeTool('assemble_product_spot', {
        sequenceName: 'Product Spot',
        assetPaths: ['/a.mp4', '/b.mp4'],
        clipDuration: 4,
        motionStyle: 'alternate'
      });

      expect(result.success).toBe(true);
      expect(result.sequence.id).toBe('seq-2');
      expect(result.imported).toHaveLength(2);
      expect(result.placements).toHaveLength(2);
    });

    it('supports directed clip plans without forcing template transitions or motion', async () => {
      mockBridge.importMedia = jest
        .fn()
        .mockResolvedValueOnce({ success: true, id: 'item-a', name: 'a.mp4' } as any)
        .mockResolvedValueOnce({ success: true, id: 'item-b', name: 'b.mp4' } as any);
      mockBridge.addToTimeline = jest
        .fn()
        .mockResolvedValueOnce({ success: true, id: 'clip-a', name: 'a.mp4', inPoint: 1.5, outPoint: 3.5 } as any)
        .mockResolvedValueOnce({ success: true, id: 'clip-b', name: 'b.mp4', inPoint: 3.6, outPoint: 6.6 } as any);
      mockBridge.executeScript
        .mockResolvedValueOnce({ success: true, id: 'seq-2b', name: 'Directed Spot' })
        .mockResolvedValue({ success: true, videoTracks: [], audioTracks: [] });

      const result = await tools.executeTool('assemble_product_spot', {
        sequenceName: 'Directed Spot',
        assetPaths: ['/a.mp4', '/b.mp4'],
        clipPlan: [
          { assetIndex: 0, time: 1.5, trackIndex: 1, transitionAfter: { name: 'none' } },
          { assetIndex: 1, time: 3.6, trackIndex: 2 }
        ]
      });

      expect(result.success).toBe(true);
      expect(result.message).toContain('directed clip plan');
      expect(result.transitions).toHaveLength(0);
      expect(result.animations).toHaveLength(0);
      expect(mockBridge.addToTimeline).toHaveBeenNthCalledWith(1, 'seq-2b', 'item-a', 1, 1.5, true, undefined, undefined, 'overwrite');
      expect(mockBridge.addToTimeline).toHaveBeenNthCalledWith(2, 'seq-2b', 'item-b', 2, 3.6, true, undefined, undefined, 'overwrite');
    });

    it('builds a brand spot from assets without requiring a mogrt', async () => {
      mockBridge.importMedia = jest
        .fn()
        .mockResolvedValueOnce({ success: true, id: 'item-a', name: 'a.mp4' } as any)
        .mockResolvedValueOnce({ success: true, id: 'item-b', name: 'b.mp4' } as any);
      mockBridge.addToTimeline = jest
        .fn()
        .mockResolvedValueOnce({ success: true, id: 'clip-a', name: 'a.mp4', inPoint: 0, outPoint: 4 } as any)
        .mockResolvedValueOnce({ success: true, id: 'clip-b', name: 'b.mp4', inPoint: 4, outPoint: 8 } as any);
      mockBridge.executeScript
        .mockResolvedValueOnce({ success: true, id: 'seq-3', name: 'Brand Spot' })
        .mockResolvedValue({ success: true, videoTracks: [], audioTracks: [] });

      const result = await tools.executeTool('build_brand_spot_from_mogrt_and_assets', {
        sequenceName: 'Brand Spot',
        assetPaths: ['/a.mp4', '/b.mp4']
      });

      expect(result.success).toBe(true);
      expect(result.message).toBe('Brand spot assembled successfully');
      expect(result.sequence.id).toBe('seq-3');
      expect(result.overlays[0].skipped).toBe(true);
      expect(result.polish[0].skipped).toBe(true);
    });
  });

  describe('setup_ducking', () => {
    it('emits 4 keyframes per duck window plus boundaries (sustained-base curve)', async () => {
      // Bridge.executeScript is what addAudioKeyframes ultimately invokes; capture and inspect.
      mockBridge.executeScript.mockResolvedValue({ success: true, addedKeyframes: [], failedKeyframes: [] });

      const result = await tools.executeTool('setup_ducking', {
        clipId: 'music-1',
        baseDb: -25,
        duckingWindows: [
          { startTime: 40.5, endTime: 41.4, duckedDb: -38 },
          { startTime: 60.0, endTime: 61.5, duckedDb: -38 },
        ],
        fadeSeconds: 0.2,
        clipStartTime: 0,
        clipEndTime: 132,
      });

      // Expected keyframe times (sorted, deduped): 0, 40.3, 40.5, 41.4, 41.6, 59.8, 60.0, 61.5, 61.7, 132
      // → 10 keyframes total: 2 boundaries + 4×2 duck windows = 10
      expect(result.keyframes_emitted).toBe(10);
      expect(result.ducking_windows).toBe(2);
      expect(result.fade_seconds).toBe(0.2);
      expect(result.base_db).toBe(-25);

      const computed = result.computed_keyframes as Array<{ time: number; level: number }>;
      const times = computed.map((k) => k.time);

      // Boundaries sit at baseDb
      expect(computed[0]).toEqual({ time: 0, level: -25 });
      expect(computed[computed.length - 1]).toEqual({ time: 132, level: -25 });

      // Duck-in/out points sit at duckedDb
      const at = (t: number) => computed.find((k) => Math.abs(k.time - t) < 1e-9);
      expect(at(40.5)?.level).toBe(-38);
      expect(at(41.4)?.level).toBe(-38);
      expect(at(60.0)?.level).toBe(-38);
      expect(at(61.5)?.level).toBe(-38);

      // Fade points sit at baseDb
      expect(at(40.3)?.level).toBe(-25);
      expect(at(41.6)?.level).toBe(-25);
      expect(at(59.8)?.level).toBe(-25);
      expect(at(61.7)?.level).toBe(-25);

      // Times are monotonic
      for (let i = 1; i < times.length; i++) {
        expect(times[i]).toBeGreaterThan(times[i - 1]!);
      }
    });

    it('handles empty duckingWindows (sustained baseDb only, 2 boundary keyframes)', async () => {
      mockBridge.executeScript.mockResolvedValue({ success: true, addedKeyframes: [], failedKeyframes: [] });

      const result = await tools.executeTool('setup_ducking', {
        clipId: 'music-empty',
        baseDb: -22,
        duckingWindows: [],
        clipStartTime: 0,
        clipEndTime: 60,
      });

      expect(result.keyframes_emitted).toBe(2);
      expect(result.computed_keyframes).toEqual([
        { time: 0, level: -22 },
        { time: 60, level: -22 },
      ]);
    });

    it('clamps pre-fade to clipStartTime when window starts before fadeSeconds', async () => {
      mockBridge.executeScript.mockResolvedValue({ success: true, addedKeyframes: [], failedKeyframes: [] });

      const result = await tools.executeTool('setup_ducking', {
        clipId: 'music-clamp',
        baseDb: -25,
        duckingWindows: [{ startTime: 0.1, endTime: 1.0, duckedDb: -38 }], // fade 0.2 would push pre-fade to -0.1
        fadeSeconds: 0.2,
        clipStartTime: 0,
        clipEndTime: 5,
      });

      const computed = result.computed_keyframes as Array<{ time: number; level: number }>;
      // The dedup map collapses pre-fade@0 with boundary@0 — both want baseDb so it's fine
      const at = (t: number) => computed.find((k) => Math.abs(k.time - t) < 1e-9);
      expect(at(0)?.level).toBe(-25); // boundary + pre-fade collapsed
      expect(at(0.1)?.level).toBe(-38); // duck-in
      expect(at(1.0)?.level).toBe(-38); // duck-out
      expect(at(1.2)?.level).toBe(-25); // post-fade
    });
  });

  describe('get_encoder_presets', () => {
    it('discovers readable user .epr presets from supplied AME preset directories', async () => {
      const root = await fs.mkdtemp(join(tmpdir(), 'premiere-presets-test-'));
      const presetDir = join(root, '26.0', 'Presets');
      await fs.mkdir(presetDir, { recursive: true });
      const presetPath = join(presetDir, 'YouTube UHD 4K.epr');
      await fs.writeFile(presetPath, '<Preset><PresetName>YouTube UHD 4K Custom</PresetName></Preset>', 'utf8');
      await fs.writeFile(join(presetDir, 'ignore.txt'), 'not a preset', 'utf8');

      const result = await tools.executeTool('get_encoder_presets', {
        directories: [presetDir],
      });

      expect(result).toMatchObject({
        success: true,
        count: 1,
        presets: [{
          name: 'YouTube UHD 4K Custom',
          path: presetPath,
          source: 'user',
          ameVersion: '26.0',
        }],
        factoryPresets: {
          supported: false,
        },
      });
    });

    it('returns an empty list for missing preset directories', async () => {
      const result = await tools.executeTool('get_encoder_presets', {
        directories: ['/tmp/premiere-missing-presets-for-test'],
      });

      expect(result.success).toBe(true);
      expect(result.presets).toEqual([]);
      expect(result.count).toBe(0);
      expect(result.errors).toEqual([]);
    });
  });

  describe('export_sequence', () => {
    // Pre-fix bugs (commit 6 of PR #14):
    //   1. Wrapper accepted no presetPath and silently substituted "H.264" / "ProRes"
    //      string literals — Adobe encodeSequence requires absolute .epr path.
    //   2. Wrapper unconditionally returned {success:true} even when bridge.renderSequence
    //      reported {success:false} — false-positive that hid AME-never-received errors.

    it('rejects calls without presetPath instead of substituting a string literal', async () => {
      const result = await tools.executeTool('export_sequence', {
        sequenceId: 'seq-1',
        outputPath: '/tmp/out.mp4',
      });

      expect(result.success).toBe(false);
      expect(result.error).toMatch(/presetPath or presetName required/);
      expect(result.hint).toMatch(/\.epr/);
      expect(mockBridge.renderSequence).not.toHaveBeenCalled();
    });

    it('rejects calls without presetPath even when format is "mp4" (no H.264 fallback)', async () => {
      // Pre-fix: format=mp4 → defaultPreset="H.264" string literal sent to encodeSequence.
      const result = await tools.executeTool('export_sequence', {
        sequenceId: 'seq-1',
        outputPath: '/tmp/out.mp4',
        format: 'mp4',
      });

      expect(result.success).toBe(false);
      expect(result.error).toMatch(/presetPath or presetName required/);
      expect(mockBridge.renderSequence).not.toHaveBeenCalled();
    });

    it('propagates bridge {success:false} response instead of claiming success', async () => {
      const { presetPath, outputPath } = await createTempPreset();
      mockBridge.renderSequence.mockResolvedValue({
        success: false,
        error: 'encodeSequence returned no jobID — preset path may be invalid or AME not connected',
        outputPath,
        presetPath,
      });

      const result = await tools.executeTool('export_sequence', {
        sequenceId: 'seq-1',
        outputPath,
        presetPath,
      });

      expect(result.success).toBe(false);
      expect(result.error).toMatch(/encodeSequence returned no jobID/);
      expect(result.sequenceId).toBe('seq-1');
    });

    it('returns success with jobID when bridge confirms AME queue accepted', async () => {
      const { presetPath, outputPath } = await createTempPreset();
      mockBridge.renderSequence.mockResolvedValue({
        success: true,
        queued: true,
        queueStarted: true,
        status: 'queued',
        jobID: 'job-abc-123',
        outputPath,
        presetPath,
        sourceRange: 'entire',
        resolvedRange: { in: 0, out: 10, inMarked: false, outMarked: false },
        encoderRangeConstant: 'ENCODE_ENTIRE',
      });

      const result = await tools.executeTool('export_sequence', {
        sequenceId: 'seq-1',
        outputPath,
        presetPath,
      });

      expect(result.success).toBe(true);
      expect(result.jobID).toBe('job-abc-123');
      expect(result.queued).toBe(true);
      expect(result.queueStarted).toBe(true);
      expect(result.sourceRange).toBe('entire');
      expect(result.encoderRangeConstant).toBe('ENCODE_ENTIRE');
      expect(result.message).toMatch(/queued in Adobe Media Encoder/);
      expect(mockBridge.renderSequence).toHaveBeenCalledWith(
        'seq-1',
        outputPath,
        presetPath,
        { sourceRange: 'entire', removeOnCompletion: true },
      );
    });

    it('passes requested sourceRange and removeOnCompletion to the bridge', async () => {
      const { presetPath, outputPath } = await createTempPreset();
      mockBridge.renderSequence.mockResolvedValue({
        success: true,
        queued: true,
        queueStarted: false,
        jobID: 'job-in-out',
        sourceRange: 'in_out',
        resolvedRange: { in: 0, out: 5, inMarked: false, outMarked: true },
        encoderRangeConstant: 'ENCODE_IN_TO_OUT',
      });

      const result = await tools.executeTool('export_sequence', {
        sequenceId: 'seq-1',
        outputPath,
        presetPath,
        sourceRange: 'in_out',
        removeOnCompletion: false,
      });

      expect(result.success).toBe(true);
      expect(result.resolvedRange).toEqual({ in: 0, out: 5, inMarked: false, outMarked: true });
      expect(mockBridge.renderSequence).toHaveBeenCalledWith(
        'seq-1',
        outputPath,
        presetPath,
        { sourceRange: 'in_out', removeOnCompletion: false },
      );
    });

    it('rejects non-absolute, unreadable, and existing output paths before queueing', async () => {
      const { presetPath, outputPath } = await createTempPreset();
      await fs.writeFile(outputPath, 'already here', 'utf8');

      const result = await tools.executeTool('export_sequence', {
        sequenceId: 'seq-1',
        outputPath,
        presetPath,
      });

      expect(result.success).toBe(false);
      expect(result.errors).toEqual(expect.arrayContaining([
        expect.objectContaining({ code: 'OUTPUT_EXISTS' }),
      ]));
      expect(mockBridge.renderSequence).not.toHaveBeenCalled();
    });

    it('resolves a unique presetName exactly and rejects ambiguous names', async () => {
      const { presetPath, outputPath } = await createTempPreset('Named Preset');
      const toolsAny = tools as any;
      jest.spyOn(toolsAny, 'getEncoderPresets').mockResolvedValue({
        success: true,
        presets: [
          { name: 'Named Preset', path: presetPath, source: 'user', ameVersion: '26.0' },
        ],
        count: 1,
        searchedDirectories: ['/presets'],
        errors: [],
        factoryPresets: { supported: false, note: 'unsupported' },
      });
      mockBridge.renderSequence.mockResolvedValue({ success: true, queued: true, jobID: 'job-name' });

      const result = await tools.executeTool('export_sequence', {
        sequenceId: 'seq-1',
        outputPath,
        presetName: 'Named Preset',
      });

      expect(result.success).toBe(true);
      expect(result.presetPath).toBe(presetPath);

      toolsAny.getEncoderPresets.mockResolvedValue({
        success: true,
        presets: [
          { name: 'Duplicate', path: presetPath, source: 'user', ameVersion: '26.0' },
          { name: 'Duplicate', path: presetPath.replace('.epr', '-2.epr'), source: 'user', ameVersion: '26.0' },
        ],
        count: 2,
        searchedDirectories: ['/presets'],
        errors: [],
        factoryPresets: { supported: false, note: 'unsupported' },
      });

      const ambiguous = await tools.executeTool('export_sequence', {
        sequenceId: 'seq-1',
        outputPath,
        presetName: 'Duplicate',
      });

      expect(ambiguous.success).toBe(false);
      expect(ambiguous.error).toMatch(/ambiguous/);
    });
  });

  describe('add_to_render_queue', () => {
    // add_to_render_queue delegates to exportSequence — same fixes apply transitively.
    it('rejects calls without presetPath (delegates to exportSequence guard)', async () => {
      const result = await tools.executeTool('add_to_render_queue', {
        sequenceId: 'seq-1',
        outputPath: '/tmp/out.mp4',
      });

      expect(result.success).toBe(false);
      expect(result.error).toMatch(/presetPath or presetName required/);
      expect(mockBridge.renderSequence).not.toHaveBeenCalled();
    });

    it('propagates bridge failure responses through the delegation', async () => {
      const { presetPath, outputPath } = await createTempPreset();
      mockBridge.renderSequence.mockResolvedValue({
        success: false,
        error: 'app.encoder not available in this Premiere build',
      });

      const result = await tools.executeTool('add_to_render_queue', {
        sequenceId: 'seq-1',
        outputPath,
        presetPath,
      });

      expect(result.success).toBe(false);
      expect(result.error).toMatch(/app.encoder not available/);
    });
  });
});
