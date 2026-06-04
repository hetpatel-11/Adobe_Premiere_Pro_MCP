/**
 * Unit tests for PremiereProTools
 */

import { promises as fs } from 'fs';
import { join } from 'path';
import { tmpdir } from 'os';
import { PremiereProTools } from '../../tools/index.js';
import { PremiereProBridge } from '../../bridge/index.js';

jest.mock('../../bridge/index.js');
jest.mock('../../utils/demoAssets.js', () => ({
  createMotionDemoAssets: jest.fn(async (assetDir: string) => [
    { name: '01_focus.png', path: `${assetDir}/01_focus.png` },
    { name: '02_precision.png', path: `${assetDir}/02_precision.png` },
    { name: '03_finish.png', path: `${assetDir}/03_finish.png` }
  ])
}));

describe('PremiereProTools', () => {
  let tools: PremiereProTools;
  let mockBridge: jest.Mocked<PremiereProBridge>;

  beforeEach(() => {
    mockBridge = new PremiereProBridge() as jest.Mocked<PremiereProBridge>;
    tools = new PremiereProTools(mockBridge);
    jest.clearAllMocks();
  });

  describe('getAvailableTools()', () => {
    it('returns the current tool catalog', () => {
      const availableTools = tools.getAvailableTools();
      const toolNames = availableTools.map((tool) => tool.name);

      expect(availableTools.length).toBeGreaterThan(50);
      expect(toolNames).toContain('test_connection');
      expect(toolNames).toContain('bridge_health_report');
      expect(toolNames).toContain('live_tool_sweep_safe');
      expect(toolNames).toContain('list_clip_effects');
      expect(toolNames).toContain('set_effect_parameter');
      expect(toolNames).toContain('set_clip_opacity');
      expect(toolNames).toContain('set_clip_blend_mode');
      expect(toolNames).toContain('set_clip_scale');
      expect(toolNames).toContain('set_clip_scale_mode');
      expect(toolNames).toContain('set_clip_position');
      expect(toolNames).toContain('batch_set_clip_properties');
      expect(toolNames).toContain('set_clip_speed_settings');
      expect(toolNames).toContain('set_clip_time_remap_settings');
      expect(toolNames).toContain('list_project_items');
      expect(toolNames).toContain('build_motion_graphics_demo');
      expect(toolNames).toContain('assemble_product_spot');
      expect(toolNames).toContain('assemble_from_edit_plan');
      expect(toolNames).toContain('build_brand_spot_from_mogrt_and_assets');
      expect(toolNames).toContain('list_export_presets');
      expect(toolNames).toContain('qc_rendered_media');
      expect(toolNames).toContain('import_media');
      expect(toolNames).toContain('add_to_timeline');
      expect(toolNames).toContain('import_mogrt');
      expect(toolNames).toContain('setup_ducking');
      expect(toolNames).toContain('scan_conform_media_metadata');
      expect(toolNames).toContain('snapshot_sequence_for_conform');
      expect(toolNames).toContain('analyze_stacked_online_conform');
      expect(toolNames).toContain('create_stacked_online_conform_sequence');
      expect(toolNames).toContain('copy_conform_clip_effects');
      expect(toolNames).toContain('qc_stacked_online_conform');
      expect(toolNames).toContain('scan_timeline_cleanup_state');
      expect(toolNames).toContain('analyze_timeline_cleanup');
      expect(toolNames).toContain('create_clean_timeline_sequence');
      expect(toolNames).toContain('qc_timeline_cleanup');
      expect(toolNames).toEqual(expect.arrayContaining([
        'probe_native_transcription_capabilities',
        'generate_sequence_transcript',
        'generate_captions_from_premiere_transcript',
        'format_captions',
        'qc_captions',
        'search_captions',
        'export_captions',
        'import_captions_to_sequence',
        'remove_caption_tracks',
        'duplicate_sequence_without_captions'
      ]));
      expect(toolNames).not.toContain('create_nested_sequence');
      expect(toolNames).not.toContain('unnest_sequence');
    });

    it('does not expose raw ExtendScript or DOM execution tools in the public catalog', () => {
      const toolNames = tools.getAvailableTools().map((tool) => tool.name);

      expect(toolNames).not.toEqual(expect.arrayContaining([
        'execute_extendscript',
        'evaluate_expression',
        'inspect_dom_object',
        'sendRawCommand'
      ]));
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
  });

  describe('sequence discovery tools', () => {
    it('does not fall back to the active sequence when list_sequence_tracks receives a missing sequenceId', async () => {
      mockBridge.executeScript.mockResolvedValue({ success: false, error: 'Sequence not found by id: missing-seq' });

      const result = await tools.executeTool('list_sequence_tracks', { sequenceId: 'missing-seq' });

      expect(result.success).toBe(false);
      const script = mockBridge.executeScript.mock.calls[0][0];
      expect(script).toContain('var requestedSequenceId = "missing-seq";');
      expect(script).toContain('Sequence not found by id: " + requestedSequenceId');
      expect(script).not.toContain('falling back to active sequence');
    });

    it('uses the active sequence only when list_sequence_tracks omits sequenceId', async () => {
      mockBridge.executeScript.mockResolvedValue({ success: true, sequenceId: 'active-seq', videoTracks: [], audioTracks: [] });

      const result = await tools.executeTool('list_sequence_tracks', {});

      expect(result.success).toBe(true);
      const script = mockBridge.executeScript.mock.calls[0][0];
      expect(script).toContain('var requestedSequenceId = null;');
      expect(script).toContain('app.project.activeSequence');
    });
  });

  describe('render/export helper tools', () => {
    it('finds .epr files from a temporary search root without touching the Premiere bridge', async () => {
      const presetDir = await fs.mkdtemp(join(tmpdir(), 'export-preset-test-'));
      const nestedDir = join(presetDir, 'Nested');
      await fs.mkdir(nestedDir);
      const presetPath = join(nestedDir, 'YouTube 1080p.epr');
      await fs.writeFile(presetPath, '<Preset />');
      await fs.writeFile(join(presetDir, 'ignore.txt'), 'not a preset');

      const result = await tools.executeTool('list_export_presets', {
        searchRoots: [presetDir],
        includeAdobeDefaults: false,
        query: 'youtube'
      });

      expect(result.success).toBe(true);
      expect(result.presetCount).toBe(1);
      expect(result.presets).toHaveLength(1);
      expect(result.presets[0]).toMatchObject({
        name: 'YouTube 1080p',
        path: presetPath,
        source: 'search_root',
        mtimeMs: expect.any(Number),
        sizeBytes: expect.any(Number)
      });
      expect(mockBridge.executeScript).not.toHaveBeenCalled();
    });

    it('reports a missing rendered media file as unsuccessful', async () => {
      const missingPath = join(tmpdir(), `missing-render-${Date.now()}.mp4`);

      const result = await tools.executeTool('qc_rendered_media', { filePath: missingPath });

      expect(result.success).toBe(false);
      expect(result.exists).toBe(false);
      expect(result.error).toContain('not found or unreadable');
      expect(mockBridge.executeScript).not.toHaveBeenCalled();
    });

    it('stats a rendered media path without relying on ffprobe assertions or touching the bridge', async () => {
      const outputDir = await fs.mkdtemp(join(tmpdir(), 'render-qc-test-'));
      const filePath = join(outputDir, 'render.mp4');
      const contents = 'placeholder render bytes';
      await fs.writeFile(filePath, contents);

      const result = await tools.executeTool('qc_rendered_media', {
        filePath,
        minSizeBytes: Buffer.byteLength(contents)
      });

      expect(result.success).toBe(true);
      expect(result.exists).toBe(true);
      expect(result.isFile).toBe(true);
      expect(result.sizeBytes).toBe(Buffer.byteLength(contents));
      expect(result.mtimeMs).toEqual(expect.any(Number));
      expect(result.ffprobe).toBeDefined();
      expect(mockBridge.executeScript).not.toHaveBeenCalled();
    });

    it('fails duration QC when expectedDurationSeconds is supplied but no probeable duration is available', async () => {
      const outputDir = await fs.mkdtemp(join(tmpdir(), 'render-duration-qc-test-'));
      const filePath = join(outputDir, 'render.mp4');
      const contents = 'placeholder render bytes';
      await fs.writeFile(filePath, contents);

      const result = await tools.executeTool('qc_rendered_media', {
        filePath,
        minSizeBytes: Buffer.byteLength(contents),
        expectedDurationSeconds: 10
      });

      expect(result.success).toBe(false);
      expect(result.exists).toBe(true);
      expect(result.sizeOk).toBe(true);
      expect(result.durationWithinTolerance).toBe(false);
      expect(result.warnings.join('\n')).toContain('duration tolerance check failed');
      expect(mockBridge.executeScript).not.toHaveBeenCalled();
    });
  });

  describe('caption suite tools', () => {
    it('exports inline captions to an SRT sidecar without touching the Premiere bridge', async () => {
      const outputDir = await fs.mkdtemp(join(tmpdir(), 'caption-export-test-'));
      const outputPath = join(outputDir, 'captions.srt');

      const result = await tools.executeTool('export_captions', {
        captions: [{ start: 1, end: 2.5, text: 'Hello world' }],
        outputPath,
        format: 'srt'
      });

      expect(result.success).toBe(true);
      expect(result.captionCount).toBe(1);
      expect(result.outputPath).toBe(outputPath);
      expect(await fs.readFile(outputPath, 'utf8')).toBe('1\n00:00:01,000 --> 00:00:02,500\nHello world\n');
      expect(mockBridge.executeScript).not.toHaveBeenCalled();
    });

    it('exports sequence captions by reading Premiere caption tracks when no sidecar source is supplied', async () => {
      const outputDir = await fs.mkdtemp(join(tmpdir(), 'caption-sequence-export-test-'));
      const outputPath = join(outputDir, 'captions.vtt');
      mockBridge.executeScript.mockResolvedValue({
        success: true,
        sequenceId: 'seq-1',
        captions: [{ start: 3, end: 4, text: 'From Premiere' }]
      });

      const result = await tools.executeTool('export_captions', {
        sequenceId: 'seq-1',
        outputPath,
        format: 'vtt'
      });

      expect(result.success).toBe(true);
      expect(result.source).toBe('sequence');
      expect(await fs.readFile(outputPath, 'utf8')).toContain('WEBVTT');
      expect(await fs.readFile(outputPath, 'utf8')).toContain('From Premiere');
      expect(mockBridge.executeScript).toHaveBeenCalledTimes(1);
    });

    it('formats inline captions and writes wrapped VTT output', async () => {
      const outputDir = await fs.mkdtemp(join(tmpdir(), 'caption-format-test-'));
      const outputPath = join(outputDir, 'formatted.vtt');

      const result = await tools.executeTool('format_captions', {
        captions: [{ start: 0, end: 2, text: 'One two three four five' }],
        outputPath,
        format: 'vtt',
        maxCharsPerLine: 13,
        maxLines: 2
      });

      expect(result.success).toBe(true);
      expect(result.captions[0].text).toBe('One two three\nfour five');
      expect(await fs.readFile(outputPath, 'utf8')).toContain('One two three\nfour five');
    });

    it('honors format_captions mergeGapSeconds and splitLongLines flags', async () => {
      const result = await tools.executeTool('format_captions', {
        captions: [
          { start: 0, end: 1, text: 'First cue' },
          { start: 1.2, end: 2, text: 'Second cue that would normally wrap' }
        ],
        mergeGapSeconds: 0.25,
        maxCharsPerLine: 10,
        splitLongLines: false
      });

      expect(result.success).toBe(true);
      expect(result.captionCount).toBe(1);
      expect(result.captions[0]).toMatchObject({
        start: 0,
        end: 2,
        text: 'First cue Second cue that would normally wrap'
      });
    });

    it('refuses to overwrite format, QC, and search outputs unless overwrite is true', async () => {
      const outputDir = await fs.mkdtemp(join(tmpdir(), 'caption-overwrite-test-'));
      const formatPath = join(outputDir, 'formatted.srt');
      const qcPath = join(outputDir, 'qc.json');
      const searchPath = join(outputDir, 'search.json');
      const exportPath = join(outputDir, 'export.srt');
      await fs.writeFile(formatPath, 'keep me');
      await fs.writeFile(qcPath, 'keep me');
      await fs.writeFile(searchPath, 'keep me');
      await fs.writeFile(exportPath, 'keep me');

      const captions = [{ start: 0, end: 1, text: 'target' }];
      const formatResult = await tools.executeTool('format_captions', { captions, outputPath: formatPath, format: 'srt' });
      const qcResult = await tools.executeTool('qc_captions', { captions, outputPath: qcPath });
      const searchResult = await tools.executeTool('search_captions', { captions, query: 'target', outputPath: searchPath });
      const exportResult = await tools.executeTool('export_captions', { captions, outputPath: exportPath, format: 'srt' });

      expect(formatResult.success).toBe(false);
      expect(qcResult.success).toBe(false);
      expect(searchResult.success).toBe(false);
      expect(exportResult.success).toBe(false);
      expect(await fs.readFile(formatPath, 'utf8')).toBe('keep me');
      expect(await fs.readFile(qcPath, 'utf8')).toBe('keep me');
      expect(await fs.readFile(searchPath, 'utf8')).toBe('keep me');
      expect(await fs.readFile(exportPath, 'utf8')).toBe('keep me');

      const overwriteSearchResult = await tools.executeTool('search_captions', {
        captions,
        query: 'target',
        outputPath: searchPath,
        overwrite: true
      });
      const overwriteExportResult = await tools.executeTool('export_captions', {
        captions,
        outputPath: exportPath,
        format: 'srt',
        overwrite: true
      });
      expect(overwriteSearchResult.success).toBe(true);
      expect(overwriteExportResult.success).toBe(true);
      expect(await fs.readFile(searchPath, 'utf8')).toContain('target');
      expect(await fs.readFile(exportPath, 'utf8')).toContain('target');
    });

    it('round-trips multiline caption text through CSV sidecars', async () => {
      const outputDir = await fs.mkdtemp(join(tmpdir(), 'caption-csv-roundtrip-test-'));
      const outputPath = join(outputDir, 'captions.csv');

      const exportResult = await tools.executeTool('export_captions', {
        captions: [{ start: 0, end: 2, text: 'line one\nline two' }],
        outputPath,
        format: 'csv'
      });
      expect(exportResult.success).toBe(true);

      const searchResult = await tools.executeTool('search_captions', {
        inputPath: outputPath,
        query: 'line two'
      });
      expect(searchResult.success).toBe(true);
      expect(searchResult.captionCount).toBe(1);
      expect(searchResult.matchCount).toBe(1);
      expect(searchResult.matches[0].entry.text).toBe('line one\nline two');
    });

    it('rejects sidecar formats that the parser/exporter does not support yet', async () => {
      const outputDir = await fs.mkdtemp(join(tmpdir(), 'caption-unsupported-format-test-'));
      const outputPath = join(outputDir, 'captions.scc');

      const result = await tools.executeTool('export_captions', {
        captions: [{ start: 0, end: 1, text: 'Unsupported' }],
        outputPath,
        format: 'scc'
      });

      expect(result.success).toBe(false);
      expect(result.error).toContain('Invalid arguments');
    });

    it('surfaces sequence caption readback failures instead of exporting empty success', async () => {
      const outputDir = await fs.mkdtemp(join(tmpdir(), 'caption-sequence-read-failure-test-'));
      const outputPath = join(outputDir, 'captions.srt');
      mockBridge.executeScript.mockResolvedValue({
        success: false,
        error: 'Caption API unavailable'
      });

      const result = await tools.executeTool('export_captions', {
        sequenceId: 'seq-1',
        outputPath,
        format: 'srt'
      });

      expect(result.success).toBe(false);
      expect(result.error).toContain('Failed to read captions from sequence seq-1');
      expect(result.error).toContain('Caption API unavailable');
      await expect(fs.readFile(outputPath, 'utf8')).rejects.toThrow();
    });

    it('runs QC against inline captions including empty text and overlaps', async () => {
      const result = await tools.executeTool('qc_captions', {
        captions: [
          { start: 0, end: 1, text: 'Too much text for one second' },
          { start: 0.5, end: 1.5, text: '' }
        ],
        maxReadingCps: 5,
        maxCharsPerLine: 10,
        requireNonEmptyText: true
      });

      expect(result.success).toBe(true);
      expect(result.findings.map((finding: any) => finding.code)).toEqual(expect.arrayContaining([
        'cpsTooFast',
        'lineTooLong',
        'emptyText',
        'overlap'
      ]));
    });

    it('searches captions with regex and context cues', async () => {
      const result = await tools.executeTool('search_captions', {
        captions: [
          { start: 0, end: 1, text: 'Before' },
          { start: 1, end: 2, text: 'Clip 42 target' },
          { start: 2, end: 3, text: 'After' }
        ],
        query: 'Clip\\s+\\d+',
        useRegex: true,
        caseSensitive: true,
        contextCues: 1
      });

      expect(result.success).toBe(true);
      expect(result.matchCount).toBe(1);
      expect(result.matches[0]).toMatchObject({ entryIndex: 1, matchText: 'Clip 42' });
      expect(result.matches[0].before[0].text).toBe('Before');
      expect(result.matches[0].after[0].text).toBe('After');
    });

    it('safely embeds create_caption_track identifiers in ExtendScript', async () => {
      const sequenceId = 'seq-"bad"\nnext';
      mockBridge.executeScript.mockResolvedValue({ success: false, error: 'Sequence not found' });

      await tools.executeTool('create_caption_track', {
        sequenceId,
        projectItemId: 'caption-item-1'
      });

      const script = mockBridge.executeScript.mock.calls[0][0];
      expect(script).toContain(`var sequence = __findSequence(${JSON.stringify(sequenceId)})`);
      expect(script).toContain(`error: ${JSON.stringify(`Sequence not found by id: ${sequenceId}`)}`);
      expect(script).not.toContain(`error: "Sequence not found by id: ${sequenceId}"`);
    });

    it('rejects unsupported caption sidecar imports before touching Premiere', async () => {
      const outputDir = await fs.mkdtemp(join(tmpdir(), 'caption-import-unsupported-test-'));
      const filePath = join(outputDir, 'captions.scc');
      await fs.writeFile(filePath, 'unsupported');

      const result = await tools.executeTool('import_captions_to_sequence', {
        sequenceId: 'seq-1',
        filePath
      });

      expect(result.success).toBe(false);
      expect(result.error).toContain('Unsupported caption sidecar format');
      expect(mockBridge.importMedia).not.toHaveBeenCalled();
      expect(mockBridge.executeScript).not.toHaveBeenCalled();
    });

    it('imports supported SRT sidecars and maps friendly caption format constants', async () => {
      const outputDir = await fs.mkdtemp(join(tmpdir(), 'caption-import-srt-test-'));
      const filePath = join(outputDir, 'captions.srt');
      await fs.writeFile(filePath, '1\n00:00:00,000 --> 00:00:01,000\nHello\n');
      mockBridge.importMedia.mockResolvedValue({ success: true, id: 'caption-item-1' } as any);
      mockBridge.executeScript.mockResolvedValue({ success: true, message: 'Caption track created' });

      const result = await tools.executeTool('import_captions_to_sequence', {
        sequenceId: 'seq-1',
        filePath,
        captionFormat: 'cea-708'
      });

      expect(result.success).toBe(true);
      expect(mockBridge.importMedia).toHaveBeenCalledWith(filePath);
      const script = mockBridge.executeScript.mock.calls[0][0];
      expect(script).toContain('Sequence.CAPTION_FORMAT_708');
      expect(script).not.toContain('Subtitle Default');
    });

    it('rejects unsupported create_caption_track caption formats before bridge execution', async () => {
      const result = await tools.executeTool('create_caption_track', {
        sequenceId: 'seq-1',
        projectItemId: 'caption-item-1',
        captionFormat: 'Totally Custom Caption Format'
      });

      expect(result.success).toBe(false);
      expect(result.error).toContain('Invalid arguments');
      expect(mockBridge.executeScript).not.toHaveBeenCalled();
    });

    it('maps create_caption_track friendly caption formats to Premiere constants', async () => {
      mockBridge.executeScript.mockResolvedValue({ success: true, message: 'Caption track created' });

      const result = await tools.executeTool('create_caption_track', {
        sequenceId: 'seq-1',
        projectItemId: 'caption-item-1',
        captionFormat: 'subtitle'
      });

      expect(result.success).toBe(true);
      const script = mockBridge.executeScript.mock.calls[0][0];
      expect(script).toContain('Sequence.CAPTION_FORMAT_SUBTITLE');
      expect(script).not.toContain('Subtitle Default');
    });

    it('creates caption tracks using a Premiere Time object before numeric fallback', async () => {
      mockBridge.executeScript.mockResolvedValue({ success: true, message: 'Caption track created' });

      await tools.executeTool('create_caption_track', {
        sequenceId: 'seq-1',
        projectItemId: 'caption-item-1',
        startTime: 3.25
      });

      const script = mockBridge.executeScript.mock.calls[0][0];
      expect(script).toContain('var startAtTime = new Time();');
      expect(script).toContain('startAtTime.seconds = startTimeVal;');
      expect(script).toContain('sequence.createCaptionTrack(projectItem, startAtTime, captionFormatValue);');
      expect(script).toContain('sequence.createCaptionTrack(projectItem, startTimeVal, captionFormatValue);');
      expect(script).toContain('createCaptionTrackSignature');
    });

    it('builds read_sequence_captions without fabricating text from video clip names', async () => {
      mockBridge.executeScript.mockResolvedValue({
        success: true,
        supported: false,
        captions: []
      });

      const result = await tools.executeTool('read_sequence_captions', { sequenceId: 'seq-1' });
      expect(result.success).toBe(true);
      const script = mockBridge.executeScript.mock.calls[0][0];
      expect(script).toContain('Sequence not found by id: " + "seq-1"');
      expect(script).not.toContain('if (!sequence) sequence = app.project.activeSequence');
      expect(script).not.toContain('clip.name');
      expect(script).not.toContain('sequence.videoTracks');
      expect(script).toContain('supported: false');
      expect(script).toContain('trackCount === 0');
      expect(script).toContain('supported: true');
    });

    it('builds remove_caption_tracks dry-run from native caption track collections only', async () => {
      mockBridge.executeScript.mockResolvedValue({
        success: true,
        supported: true,
        dryRun: true,
        trackCount: 1,
        removedTrackCount: 0
      });

      const result = await tools.executeTool('remove_caption_tracks', { sequenceId: 'seq-1' });
      expect(result.success).toBe(true);
      const script = mockBridge.executeScript.mock.calls[0][0];
      expect(script).toContain('"dryRun":true');
      expect(script).toContain('Sequence not found by id: " + payload.sequenceId');
      expect(script).not.toContain('if (!sequence) sequence = app.project.activeSequence');
      expect(script).toContain('sequence.getCaptionTracks');
      expect(script).toContain('sequence.captionTracks');
      expect(script).toContain('no public caption track remove/delete API');
      expect(script).not.toContain('clip.name');
      expect(script).not.toContain('sequence.videoTracks');
    });

    it('dry-runs duplicate_sequence_without_captions without calling the bridge', async () => {
      const result = await tools.executeTool('duplicate_sequence_without_captions', {
        sequenceId: 'seq-1',
        newName: 'Captionless copy'
      });

      expect(result).toMatchObject({
        success: true,
        dryRun: true,
        mutationPlanned: false,
        sequenceId: 'seq-1',
        intendedDuplicateName: 'Captionless copy'
      });
      expect(mockBridge.executeScript).not.toHaveBeenCalled();
    });

    it('fails duplicate_sequence_without_captions when the duplicate sequence id cannot be resolved for cleanup', async () => {
      mockBridge.executeScript
        .mockResolvedValueOnce({ success: true, newSequenceId: 'dup-seq-1', newName: 'Captionless copy' })
        .mockResolvedValueOnce({ success: false, supported: false, error: 'Sequence not found by id: dup-seq-1' })
        .mockResolvedValueOnce({ success: false, supported: false, error: 'Sequence not found by id: dup-seq-1' });

      const result = await tools.executeTool('duplicate_sequence_without_captions', {
        sequenceId: 'seq-1',
        newName: 'Captionless copy',
        dryRun: false
      });

      expect(result.success).toBe(false);
      expect(result.error).toContain('Sequence not found by id: dup-seq-1');
      const removeScript = mockBridge.executeScript.mock.calls[1][0];
      const readbackScript = mockBridge.executeScript.mock.calls[2][0];
      expect(removeScript).toContain('Sequence not found by id: " + payload.sequenceId');
      expect(readbackScript).toContain('Sequence not found by id: " + "dup-seq-1"');
      expect(removeScript).not.toContain('if (!sequence) sequence = app.project.activeSequence');
      expect(readbackScript).not.toContain('if (!sequence) sequence = app.project.activeSequence');
    });

    it('builds a read-only native transcription capability probe script', async () => {
      mockBridge.executeScript.mockResolvedValue({ success: true, supported: false, diagnostics: { candidates: [] } });

      const result = await tools.executeTool('probe_native_transcription_capabilities', { sequenceId: 'seq-1' });

      expect(result.success).toBe(true);
      const script = mockBridge.executeScript.mock.calls[0][0];
      expect(script).toContain('__probeNativeTranscriptionCapabilities');
      expect(script).toContain('transcript');
      expect(script).toContain('speechAnalysisSupported: false');
      expect(script).toContain('supported: false');
      expect(script).toContain('probedMethodTypes');
      expect(script).toContain('liveVerifiedPublicApi: false');
      expect(script).not.toContain('supported: transcriptSupported || captionSupported');
      expect(script).not.toContain("category === 'transcript' || candidates[c].category === 'speech'");
      expect(script).not.toContain('Whisper');
    });

    it('builds capability-honest native transcript and caption generation scripts', async () => {
      mockBridge.executeScript.mockResolvedValueOnce({ success: true, supported: false, dryRun: true, diagnostics: { candidates: [] } });
      const transcriptResult = await tools.executeTool('generate_sequence_transcript', { sequenceId: 'seq-1', dryRun: true });
      expect(transcriptResult.supported).toBe(false);
      const transcriptScript = mockBridge.executeScript.mock.calls[0][0];
      expect(transcriptScript).toContain('__generateSequenceTranscriptNative');
      expect(transcriptScript).toContain('diagnosticTranscriptMethods');
      expect(transcriptScript).toContain('supported: false');
      expect(transcriptScript).not.toContain('selected.target[selected.method]');

      mockBridge.executeScript.mockResolvedValueOnce({ success: true, supported: false, dryRun: true, diagnostics: { candidates: [] } });
      const captionsResult = await tools.executeTool('generate_captions_from_premiere_transcript', { sequenceId: 'seq-1', dryRun: true });
      expect(captionsResult.supported).toBe(false);
      const captionsScript = mockBridge.executeScript.mock.calls[1][0];
      expect(captionsScript).toContain('__generateCaptionsFromPremiereTranscriptNative');
      expect(captionsScript).toContain('diagnosticCaptionMethods');
      expect(captionsScript).toContain('supported: false');
      expect(captionsScript).not.toContain('selected.target[selected.method]');
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
        name: 'Possibly Created Sequence'
      });

      expect(result.success).toBe(false);
      expect(result.error).toContain('Bridge response timeout');
      expect(result.warning).toContain('does not run automatic recovery');
      expect(mockBridge.executeScript).not.toHaveBeenCalled();
    });

    it('rejects create_sequence preset/custom-setting arguments before they can open Premiere modal UI', async () => {
      const result = await tools.executeTool('create_sequence', {
        name: 'Custom Settings Sequence',
        presetPath: '/Applications/Adobe Premiere Pro 2026/Adobe Premiere Pro 2026.app/Contents/Settings/SequencePresets/HD 1080p/HD 1080p 29.97 fps.sqpreset',
        width: 1920,
        height: 1080,
        frameRate: 29.97,
        sampleRate: 48000
      });

      expect(result.success).toBe(false);
      expect(result.supported).toBe(false);
      expect(result.error).toContain('Project.createNewSequence(sequenceName, sequenceID)');
      expect(result.error).toContain('native New Sequence dialog');
      expect(mockBridge.createSequence).not.toHaveBeenCalled();
    });

    it('surfaces create_sequence bridge failures without timeout recovery guidance', async () => {
      mockBridge.createSequence = jest.fn().mockRejectedValue(new Error('Premiere rejected the preset'));

      const result = await tools.executeTool('create_sequence', {
        name: 'Missing Sequence'
      });

      expect(result.success).toBe(false);
      expect(result.error).toContain('Premiere rejected the preset');
      expect(result.warning).toBeUndefined();
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

  describe('script-backed tools', () => {
    it('executes test_connection and returns bridge diagnostics', async () => {
      mockBridge.executeScript.mockResolvedValue({
        success: true,
        connected: true,
        premiereVersion: '26.2.2',
        project: {
          name: 'Untitled',
          path: '/tmp/Untitled.prproj'
        }
      });

      const result = await tools.executeTool('test_connection', {});

      expect(mockBridge.executeScript).toHaveBeenCalled();
      const script = mockBridge.executeScript.mock.calls[0][0];
      expect(script).toContain('app.version');
      expect(script).toContain('app.project');
      expect(result.success).toBe(true);
      expect(result.connected).toBe(true);
      expect(result.premiereVersion).toBe('26.2.2');
    });

    it('executes bridge_health_report with filesystem checks and a non-mutating round trip', async () => {
      const tempDir = await fs.mkdtemp(join(tmpdir(), 'premiere-health-test-'));
      process.env.PREMIERE_TEMP_DIR = tempDir;
      await fs.writeFile(join(tempDir, 'command-old.json'), '{}');
      await fs.writeFile(join(tempDir, 'response-old.json'), '{}');
      const oldTime = new Date(Date.now() - 10_000);
      await fs.utimes(join(tempDir, 'command-old.json'), oldTime, oldTime);
      await fs.utimes(join(tempDir, 'response-old.json'), oldTime, oldTime);
      mockBridge.executeScript.mockResolvedValue({
        success: true,
        connected: true,
        premiereVersion: '26.2.2'
      });

      try {
        const result = await tools.executeTool('bridge_health_report', { staleAfterSeconds: 1 });

        expect(mockBridge.executeScript).toHaveBeenCalled();
        expect(result.success).toBe(true);
        expect(result.checks.tempDir.path).toBe(tempDir);
        expect(result.checks.tempDir.exists).toBe(true);
        expect(result.checks.tempDir.commandFiles).toBe(1);
        expect(result.checks.tempDir.responseFiles).toBe(1);
        expect(result.checks.tempDir.staleCommandFiles).toBe(1);
        expect(result.checks.tempDir.staleResponseFiles).toBe(1);
        expect(result.checks.roundTrip.success).toBe(true);
        expect(result.checks.roundTrip.premiereVersion).toBe('26.2.2');
        expect(result.warnings).toEqual(expect.any(Array));
      } finally {
        delete process.env.PREMIERE_TEMP_DIR;
        await fs.rm(tempDir, { recursive: true, force: true });
      }
    });

    it('uses bridge-reported diagnostics as the source of truth for health checks', async () => {
      const tempDir = await fs.mkdtemp(join(tmpdir(), 'premiere-health-diagnostics-test-'));
      delete process.env.PREMIERE_TEMP_DIR;
      (mockBridge as any).getDiagnostics = jest.fn().mockReturnValue({
        tempDir,
        communicationMethod: 'file',
        usesExternalTempDir: false,
        isInitialized: true,
        premierePath: '/Applications/Adobe Premiere Pro 2025/Adobe Premiere Pro 2025.app'
      });
      mockBridge.executeScript.mockResolvedValue({
        success: true,
        connected: true,
        premiereVersion: '25.0.0'
      });

      try {
        const result = await tools.executeTool('bridge_health_report', {});

        expect(result.checks.bridge.tempDir).toBe(tempDir);
        expect(result.checks.tempDir.path).toBe(tempDir);
        expect(result.checks.cepExtension.appBundlePath).toBe('/Applications/Adobe Premiere Pro 2025/Adobe Premiere Pro 2025.app/Contents/CEP/extensions/MCPBridgeCEP');
      } finally {
        await fs.rm(tempDir, { recursive: true, force: true });
      }
    });

    it('runs live_tool_sweep_safe in a disposable scratch project and writes a report', async () => {
      const tempDir = await fs.mkdtemp(join(tmpdir(), 'premiere-safe-sweep-test-'));
      const reportPath = join(tempDir, 'report.json');
      const projectPath = join(tempDir, 'Safe Sweep Test.prproj');
      mockBridge.createProject = jest.fn().mockResolvedValue({
        success: true,
        name: 'Safe Sweep Test',
        projectPath
      } as any);
      mockBridge.createSequence = jest.fn();
      mockBridge.executeScript.mockResolvedValue({
        success: true,
        connected: true,
        premiereVersion: '26.2.2',
        project: {
          name: 'Safe Sweep Test',
          path: projectPath
        }
      });

      try {
        const result = await tools.executeTool('live_tool_sweep_safe', {
          scratchProjectName: 'Safe Sweep Test',
          scratchProjectDir: tempDir,
          reportPath,
          mode: 'smoke'
        });

        expect(mockBridge.createProject).toHaveBeenCalledWith('Safe Sweep Test', tempDir);
        expect(mockBridge.createSequence).not.toHaveBeenCalled();
        expect(mockBridge.executeScript).toHaveBeenCalled();
        expect(result.success).toBe(true);
        expect(result.mode).toBe('smoke');
        expect(result.scratchProjectPath).toBe(projectPath);
        expect(result.reportPath).toBe(reportPath);
        expect(result.counts.executed).toBeGreaterThan(0);

        const report = JSON.parse(await fs.readFile(reportPath, 'utf8'));
        expect(report.scratchProjectPath).toBe(projectPath);
        expect(report.results.map((entry: any) => entry.name)).toEqual(expect.arrayContaining([
          'create_project',
          'test_connection',
          'list_sequences'
        ]));
      } finally {
        await fs.rm(tempDir, { recursive: true, force: true });
      }
    });

    it('requires an explicit scratch project directory for live_tool_sweep_safe', async () => {
      const result = await tools.executeTool('live_tool_sweep_safe', {
        scratchProjectName: 'Missing Scratch Dir'
      });

      expect(result.success).toBe(false);
      expect(result.error).toContain('Invalid arguments');
      expect(mockBridge.createProject).not.toHaveBeenCalled();
    });

    it('rejects scratch project names that could escape the scratch directory', async () => {
      const tempDir = await fs.mkdtemp(join(tmpdir(), 'premiere-safe-sweep-name-escape-test-'));
      try {
        const result = await tools.executeTool('live_tool_sweep_safe', {
          scratchProjectName: '../Escape',
          scratchProjectDir: tempDir,
          reportPath: join(tempDir, 'report.json')
        });

        expect(result.success).toBe(false);
        expect(result.error).toContain('scratchProjectName');
        expect(mockBridge.createProject).not.toHaveBeenCalled();
      } finally {
        await fs.rm(tempDir, { recursive: true, force: true });
      }
    });

    it('rejects report paths outside the scratch project directory', async () => {
      const tempDir = await fs.mkdtemp(join(tmpdir(), 'premiere-safe-sweep-report-escape-test-'));
      try {
        const result = await tools.executeTool('live_tool_sweep_safe', {
          scratchProjectName: 'Report Escape Test',
          scratchProjectDir: tempDir,
          reportPath: join(tempDir, '..', 'escaped-report.json')
        });

        expect(result.success).toBe(false);
        expect(result.error).toContain('reportPath');
        expect(mockBridge.createProject).not.toHaveBeenCalled();
      } finally {
        await fs.rm(tempDir, { recursive: true, force: true });
      }
    });

    it('rejects report paths whose parent symlink resolves outside the scratch directory', async () => {
      const tempDir = await fs.mkdtemp(join(tmpdir(), 'premiere-safe-sweep-symlink-report-test-'));
      const outsideDir = await fs.mkdtemp(join(tmpdir(), 'premiere-safe-sweep-outside-report-test-'));
      const symlinkPath = join(tempDir, 'outside-link');
      const outsideReportPath = join(outsideDir, 'report.json');
      await fs.symlink(outsideDir, symlinkPath, 'dir');
      mockBridge.createProject = jest.fn().mockResolvedValue({
        success: true,
        name: 'Symlink Report Test',
        projectPath: join(tempDir, 'Symlink Report Test.prproj')
      } as any);
      mockBridge.executeScript.mockResolvedValue({ success: true, sequences: [], items: [], bins: [] });

      try {
        const result = await tools.executeTool('live_tool_sweep_safe', {
          scratchProjectName: 'Symlink Report Test',
          scratchProjectDir: tempDir,
          reportPath: 'outside-link/report.json'
        });

        expect(result.success).toBe(false);
        expect(result.error).toContain('reportPath');
        expect(mockBridge.createProject).not.toHaveBeenCalled();
        await expect(fs.access(outsideReportPath)).rejects.toThrow();
      } finally {
        await fs.rm(tempDir, { recursive: true, force: true });
        await fs.rm(outsideDir, { recursive: true, force: true });
      }
    });

    it('rejects nested report paths under symlinked parents without creating directories outside scratch', async () => {
      const tempDir = await fs.mkdtemp(join(tmpdir(), 'premiere-safe-sweep-nested-symlink-report-test-'));
      const outsideDir = await fs.mkdtemp(join(tmpdir(), 'premiere-safe-sweep-nested-outside-report-test-'));
      const symlinkPath = join(tempDir, 'outside-link');
      const outsideNestedDir = join(outsideDir, 'nested');
      await fs.symlink(outsideDir, symlinkPath, 'dir');
      mockBridge.createProject = jest.fn().mockResolvedValue({
        success: true,
        name: 'Nested Symlink Report Test',
        projectPath: join(tempDir, 'Nested Symlink Report Test.prproj')
      } as any);
      mockBridge.executeScript.mockResolvedValue({ success: true, sequences: [], items: [], bins: [] });

      try {
        const result = await tools.executeTool('live_tool_sweep_safe', {
          scratchProjectName: 'Nested Symlink Report Test',
          scratchProjectDir: tempDir,
          reportPath: 'outside-link/nested/report.json'
        });

        expect(result.success).toBe(false);
        expect(result.error).toContain('reportPath');
        expect(mockBridge.createProject).not.toHaveBeenCalled();
        await expect(fs.access(outsideNestedDir)).rejects.toThrow();
      } finally {
        await fs.rm(tempDir, { recursive: true, force: true });
        await fs.rm(outsideDir, { recursive: true, force: true });
      }
    });

    it('resolves relative report paths inside the scratch project directory', async () => {
      const tempDir = await fs.mkdtemp(join(tmpdir(), 'premiere-safe-sweep-relative-report-test-'));
      const projectPath = join(tempDir, 'Relative Report Test.prproj');
      mockBridge.createProject = jest.fn().mockResolvedValue({
        success: true,
        name: 'Relative Report Test',
        projectPath
      } as any);
      mockBridge.executeScript.mockResolvedValue({ success: true, sequences: [], items: [], bins: [] });

      try {
        const result = await tools.executeTool('live_tool_sweep_safe', {
          scratchProjectName: 'Relative Report Test',
          scratchProjectDir: tempDir,
          reportPath: 'nested/report.json'
        });

        const expectedReportPath = join(tempDir, 'nested', 'report.json');
        expect(result.success).toBe(true);
        expect(result.reportPath).toBe(expectedReportPath);
        await expect(fs.access(expectedReportPath)).resolves.toBeUndefined();
      } finally {
        await fs.rm(tempDir, { recursive: true, force: true });
      }
    });

    it('rejects modal-prone standard sweeps during the P0 safe sweep slice', async () => {
      const tempDir = await fs.mkdtemp(join(tmpdir(), 'premiere-safe-sweep-standard-reject-test-'));
      try {
        const result = await tools.executeTool('live_tool_sweep_safe', {
          scratchProjectName: 'Standard Reject Test',
          scratchProjectDir: tempDir,
          mode: 'standard'
        });

        expect(result.success).toBe(false);
        expect(result.error).toContain('Invalid arguments');
        expect(mockBridge.createSequence).not.toHaveBeenCalled();
      } finally {
        await fs.rm(tempDir, { recursive: true, force: true });
      }
    });

    it('does not run the live_tool_sweep_safe sweep when scratch project creation fails', async () => {
      const tempDir = await fs.mkdtemp(join(tmpdir(), 'premiere-safe-sweep-fail-test-'));
      mockBridge.createProject = jest.fn().mockResolvedValue({
        success: false,
        error: 'Premiere did not create the scratch project',
        projectPath: join(tempDir, 'Failed.prproj')
      } as any);
      mockBridge.createSequence = jest.fn();

      try {
        const result = await tools.executeTool('live_tool_sweep_safe', {
          scratchProjectName: 'Failed',
          scratchProjectDir: tempDir,
          mode: 'smoke'
        });

        expect(result.success).toBe(false);
        expect(result.error).toContain('Premiere did not create');
        expect(result.stage).toBe('create_project');
        expect(mockBridge.createSequence).not.toHaveBeenCalled();
        expect(mockBridge.executeScript).not.toHaveBeenCalled();
      } finally {
        await fs.rm(tempDir, { recursive: true, force: true });
      }
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

    it('looks up clip properties in the requested sequence', async () => {
      mockBridge.executeScript.mockResolvedValue({ success: true, properties: {} });

      const result = await tools.executeTool('get_clip_properties', {
        clipId: 'clip-123',
        sequenceId: 'seq-456'
      });

      expect(result.success).toBe(true);
      expect(mockBridge.executeScript).toHaveBeenCalledWith(expect.stringContaining('__findClip("clip-123", "seq-456")'));
    });

    it('lists clip effects and component properties in the requested sequence', async () => {
      mockBridge.executeScript.mockResolvedValue({
        success: true,
        clipId: 'clip-123',
        sequenceId: 'seq-456',
        effects: [
          {
            componentIndex: 0,
            displayName: 'Motion',
            matchName: 'ADBE Motion',
            propertyCount: 2,
            properties: [
              { propertyIndex: 0, displayName: 'Scale', value: 100 },
              { propertyIndex: 1, displayName: 'Position', value: [960, 540] }
            ]
          }
        ],
        count: 1
      });

      const result = await tools.executeTool('list_clip_effects', {
        clipId: 'clip-123',
        sequenceId: 'seq-456'
      });

      expect(result.success).toBe(true);
      expect(result.count).toBe(1);
      expect(result.effects[0].displayName).toBe('Motion');
      expect(mockBridge.executeScript).toHaveBeenCalledWith(expect.stringContaining('__findClip("clip-123", "seq-456")'));
      expect(mockBridge.executeScript).toHaveBeenCalledWith(expect.stringContaining('__safeGetPropertyValue'));
      expect(mockBridge.executeScript).toHaveBeenCalledWith(expect.stringContaining('propertyIndex'));
      expect(mockBridge.executeScript).toHaveBeenCalledWith(expect.stringContaining('matchName'));
    });

    it('requires a clipId for list_clip_effects', async () => {
      const result = await tools.executeTool('list_clip_effects', { sequenceId: 'seq-456' });

      expect(result.success).toBe(false);
      expect(result.error).toContain('Invalid arguments');
      expect(mockBridge.executeScript).not.toHaveBeenCalled();
    });

    it('rejects an empty clipId for list_clip_effects before calling the bridge', async () => {
      const result = await tools.executeTool('list_clip_effects', { clipId: '', sequenceId: 'seq-456' });

      expect(result.success).toBe(false);
      expect(result.error).toContain('Invalid arguments');
      expect(mockBridge.executeScript).not.toHaveBeenCalled();
    });

    it('sets an effect parameter by component and property name in the requested sequence', async () => {
      mockBridge.executeScript.mockResolvedValue({
        success: true,
        clipId: 'clip-123',
        sequenceId: 'seq-456',
        component: { componentIndex: 1, displayName: 'Motion', matchName: 'AE.ADBE Motion' },
        property: { propertyIndex: 1, displayName: 'Scale', matchName: 'AE.ADBE Scale' },
        valueBefore: 100,
        valueRequested: 125,
        valueAfter: 125,
        clamped: false
      });

      const result = await tools.executeTool('set_effect_parameter', {
        clipId: 'clip-123',
        sequenceId: 'seq-456',
        componentName: 'Motion',
        propertyName: 'Scale',
        value: 125
      });

      expect(result.success).toBe(true);
      expect(result.valueAfter).toBe(125);
      const script = mockBridge.executeScript.mock.calls[0][0];
      expect(script).toContain('__findClip("clip-123", "seq-456")');
      expect(script).toContain('__findComponent');
      expect(script).toContain('__findEffectProperty');
      expect(script).toContain('setValue(requestedValue, true)');
      expect(script).toContain('valueBefore');
      expect(script).toContain('valueAfter');
    });

    it('supports effect and property selection by index or matchName for set_effect_parameter', async () => {
      mockBridge.executeScript.mockResolvedValue({ success: true, valueAfter: 50 });

      const result = await tools.executeTool('set_effect_parameter', {
        clipId: 'clip-123',
        componentIndex: 0,
        propertyMatchName: 'AE.ADBE Opacity',
        value: 50
      });

      expect(result.success).toBe(true);
      const script = mockBridge.executeScript.mock.calls[0][0];
      expect(script).toContain('componentIndex');
      expect(script).toContain('propertyMatchName');
      expect(script).toContain('__namesEqual');
    });

    it('requires a component selector for set_effect_parameter before calling the bridge', async () => {
      const result = await tools.executeTool('set_effect_parameter', {
        clipId: 'clip-123',
        propertyName: 'Scale',
        value: 125
      });

      expect(result.success).toBe(false);
      expect(result.error).toContain('Invalid arguments');
      expect(mockBridge.executeScript).not.toHaveBeenCalled();
    });

    it('requires a property selector for set_effect_parameter before calling the bridge', async () => {
      const result = await tools.executeTool('set_effect_parameter', {
        clipId: 'clip-123',
        componentName: 'Motion',
        value: 125
      });

      expect(result.success).toBe(false);
      expect(result.error).toContain('Invalid arguments');
      expect(mockBridge.executeScript).not.toHaveBeenCalled();
    });

    it('requires a value for set_effect_parameter before calling the bridge', async () => {
      const result = await tools.executeTool('set_effect_parameter', {
        clipId: 'clip-123',
        componentName: 'Motion',
        propertyName: 'Scale'
      });

      expect(result.success).toBe(false);
      expect(result.error).toContain('Invalid arguments');
      expect(mockBridge.executeScript).not.toHaveBeenCalled();
    });

    it('safely escapes string selectors for set_effect_parameter scripts', async () => {
      mockBridge.executeScript.mockResolvedValue({ success: true });

      await tools.executeTool('set_effect_parameter', {
        clipId: 'clip-"quote',
        sequenceId: 'seq-"quote',
        componentName: 'Motion"; MALICIOUS(); //',
        propertyName: 'Scale"; MALICIOUS(); //',
        value: 100
      });

      const script = mockBridge.executeScript.mock.calls[0][0];
      expect(script).toContain('__findClip("clip-\\"quote", "seq-\\"quote")');
      expect(script).toContain('"Motion\\"; MALICIOUS(); //"');
      expect(script).toContain('"Scale\\"; MALICIOUS(); //"');
    });

    it('sets clip opacity through the reviewed effect parameter setter', async () => {
      mockBridge.executeScript.mockResolvedValue({
        success: true,
        valueBefore: 100,
        valueRequested: 42,
        valueAfter: 42
      });

      const result = await tools.executeTool('set_clip_opacity', {
        clipId: 'clip-123',
        sequenceId: 'seq-456',
        opacity: 42
      });

      expect(result.success).toBe(true);
      expect(result.valueRequested).toBe(42);
      const script = mockBridge.executeScript.mock.calls[0][0];
      expect(script).toContain('__findClip("clip-123", "seq-456")');
      expect(script).toContain('"componentName":"Opacity"');
      expect(script).toContain('"propertyName":"Opacity"');
      expect(script).toContain('var requestedValue = 42');
    });

    it('rejects invalid set_clip_opacity values before calling the bridge', async () => {
      const tooHigh = await tools.executeTool('set_clip_opacity', {
        clipId: 'clip-123',
        opacity: 101
      });
      expect(tooHigh.success).toBe(false);
      expect(tooHigh.error).toContain('Invalid arguments');

      const emptyClip = await tools.executeTool('set_clip_opacity', {
        clipId: '',
        opacity: 50
      });
      expect(emptyClip.success).toBe(false);
      expect(emptyClip.error).toContain('Invalid arguments');
      expect(mockBridge.executeScript).not.toHaveBeenCalled();
    });

    it('sets clip blend mode through the reviewed effect parameter setter', async () => {
      mockBridge.executeScript.mockResolvedValue({
        success: true,
        valueBefore: 18,
        valueRequested: 1,
        valueAfter: 1
      });

      const result = await tools.executeTool('set_clip_blend_mode', {
        clipId: 'clip-123',
        sequenceId: 'seq-456',
        blendMode: 1,
        blendModePropertyIndex: 1
      });

      expect(result.success).toBe(true);
      expect(result.valueRequested).toBe(1);
      const script = mockBridge.executeScript.mock.calls[0][0];
      expect(script).toContain('__findClip("clip-123", "seq-456")');
      expect(script).toContain('"componentName":"Opacity"');
      expect(script).toContain('"propertyIndex":1');
      expect(script).toContain('var requestedValue = 1');
    });

    it('defaults set_clip_blend_mode to the live-proven first Opacity Blend Mode property index', async () => {
      mockBridge.executeScript.mockResolvedValue({ success: true, valueRequested: 18 });

      await tools.executeTool('set_clip_blend_mode', {
        clipId: 'clip-123',
        blendMode: 18
      });

      const script = mockBridge.executeScript.mock.calls[0][0];
      expect(script).toContain('"componentName":"Opacity"');
      expect(script).toContain('"propertyIndex":1');
      expect(script).toContain('var requestedValue = 18');
    });

    it('rejects invalid set_clip_blend_mode values before calling the bridge', async () => {
      const negativeMode = await tools.executeTool('set_clip_blend_mode', {
        clipId: 'clip-123',
        blendMode: -1
      });
      expect(negativeMode.success).toBe(false);
      expect(negativeMode.error).toContain('Invalid arguments');

      const nonIntegerMode = await tools.executeTool('set_clip_blend_mode', {
        clipId: 'clip-123',
        blendMode: 1.5
      });
      expect(nonIntegerMode.success).toBe(false);
      expect(nonIntegerMode.error).toContain('Invalid arguments');

      const infiniteMode = await tools.executeTool('set_clip_blend_mode', {
        clipId: 'clip-123',
        blendMode: Number.POSITIVE_INFINITY
      });
      expect(infiniteMode.success).toBe(false);
      expect(infiniteMode.error).toContain('Invalid arguments');

      const emptyClip = await tools.executeTool('set_clip_blend_mode', {
        clipId: '',
        blendMode: 1
      });
      expect(emptyClip.success).toBe(false);
      expect(emptyClip.error).toContain('Invalid arguments');
      expect(mockBridge.executeScript).not.toHaveBeenCalled();
    });

    it('rejects invalid set_clip_blend_mode property indexes before calling the bridge', async () => {
      const zeroIndex = await tools.executeTool('set_clip_blend_mode', {
        clipId: 'clip-123',
        blendMode: 1,
        blendModePropertyIndex: 0
      });
      expect(zeroIndex.success).toBe(false);
      expect(zeroIndex.error).toContain('Invalid arguments');
      expect(mockBridge.executeScript).not.toHaveBeenCalled();
    });

    it('sets clip scale through the reviewed effect parameter setter', async () => {
      mockBridge.executeScript.mockResolvedValue({
        success: true,
        valueBefore: 100,
        valueRequested: 125,
        valueAfter: 125
      });

      const result = await tools.executeTool('set_clip_scale', {
        clipId: 'clip-123',
        sequenceId: 'seq-456',
        scale: 125
      });

      expect(result.success).toBe(true);
      expect(result.valueRequested).toBe(125);
      const script = mockBridge.executeScript.mock.calls[0][0];
      expect(script).toContain('__findClip("clip-123", "seq-456")');
      expect(script).toContain('"componentName":"Motion"');
      expect(script).toContain('"propertyName":"Scale"');
      expect(script).toContain('var requestedValue = 125');
    });

    it('rejects invalid set_clip_scale values before calling the bridge', async () => {
      const negativeScale = await tools.executeTool('set_clip_scale', {
        clipId: 'clip-123',
        scale: -1
      });
      expect(negativeScale.success).toBe(false);
      expect(negativeScale.error).toContain('Invalid arguments');

      const emptyClip = await tools.executeTool('set_clip_scale', {
        clipId: '',
        scale: 100
      });
      expect(emptyClip.success).toBe(false);
      expect(emptyClip.error).toContain('Invalid arguments');
      expect(mockBridge.executeScript).not.toHaveBeenCalled();
    });

    it('computes fit and fill scaling before delegating set_clip_scale_mode to batch_set_clip_properties', async () => {
      mockBridge.executeScript.mockResolvedValue({ success: true });

      const fitResult = await tools.executeTool('set_clip_scale_mode', {
        clipId: 'clip-123',
        sequenceId: 'seq-456',
        mode: 'fit',
        sourceWidth: 1000,
        sourceHeight: 500,
        sequenceWidth: 1920,
        sequenceHeight: 1080
      });

      expect(fitResult.success).toBe(true);
      expect(fitResult.delegatedTool).toBe('batch_set_clip_properties');
      expect(fitResult.computedScaleMode.properties).toEqual({ uniformScale: true, scale: 192 });
      let script = mockBridge.executeScript.mock.calls[0][0];
      expect(script).toContain('__findClip("clip-123", "seq-456")');
      expect(script).toContain('"label":"uniformScale"');
      expect(script).toContain('"value":true');
      expect(script).toContain('"label":"scale"');
      expect(script).toContain('"value":192');

      jest.clearAllMocks();
      mockBridge.executeScript.mockResolvedValue({ success: true });
      const fillResult = await tools.executeTool('set_clip_scale_mode', {
        clipId: 'clip-123',
        sequenceId: 'seq-456',
        mode: 'fill',
        sourceWidth: 1000,
        sourceHeight: 500,
        sequenceWidth: 1920,
        sequenceHeight: 1080
      });

      expect(fillResult.success).toBe(true);
      expect(fillResult.computedScaleMode.properties).toEqual({ uniformScale: true, scale: 216 });
      script = mockBridge.executeScript.mock.calls[0][0];
      expect(script).toContain('"label":"uniformScale"');
      expect(script).toContain('"value":true');
      expect(script).toContain('"label":"scale"');
      expect(script).toContain('"value":216');
    });

    it('computes stretch scaling before delegating set_clip_scale_mode to batch_set_clip_properties', async () => {
      mockBridge.executeScript.mockResolvedValue({ success: true });

      const result = await tools.executeTool('set_clip_scale_mode', {
        clipId: 'clip-123',
        sequenceId: 'seq-456',
        mode: 'stretch',
        sourceWidth: 1000,
        sourceHeight: 500,
        sequenceWidth: 1920,
        sequenceHeight: 1080
      });

      expect(result.success).toBe(true);
      expect(result.delegatedTool).toBe('batch_set_clip_properties');
      expect(result.computedScaleMode.properties).toEqual({ uniformScale: false, scale: 216, scaleWidth: 192 });
      const script = mockBridge.executeScript.mock.calls[0][0];
      expect(script).toContain('__findClip("clip-123", "seq-456")');
      expect(script).toContain('"label":"uniformScale"');
      expect(script).toContain('"value":false');
      expect(script).toContain('"label":"scaleWidth"');
      expect(script).toContain('"value":192');
      expect(script).toContain('"label":"scale"');
      expect(script).toContain('"value":216');
    });

    it('returns supported false for set_clip_scale_mode when dimensions are missing without calling the bridge', async () => {
      const result = await tools.executeTool('set_clip_scale_mode', {
        clipId: 'clip-123',
        mode: 'fit',
        sourceWidth: 1000,
        sourceHeight: 500,
        sequenceWidth: 1920
      });

      expect(result.success).toBe(false);
      expect(result.supported).toBe(false);
      expect(result.error).toContain('Missing: sequenceHeight');
      expect(mockBridge.executeScript).not.toHaveBeenCalled();
    });

    it('sets clip position through the reviewed effect parameter setter', async () => {
      mockBridge.executeScript.mockResolvedValue({
        success: true,
        valueBefore: [0.5, 0.5],
        valueRequested: [0.45, 0.55],
        valueAfter: [0.45, 0.55]
      });

      const result = await tools.executeTool('set_clip_position', {
        clipId: 'clip-123',
        sequenceId: 'seq-456',
        x: 0.45,
        y: 0.55
      });

      expect(result.success).toBe(true);
      expect(result.valueRequested).toEqual([0.45, 0.55]);
      const script = mockBridge.executeScript.mock.calls[0][0];
      expect(script).toContain('__findClip("clip-123", "seq-456")');
      expect(script).toContain('"componentName":"Motion"');
      expect(script).toContain('"propertyName":"Position"');
      expect(script).toContain('var requestedValue = [0.45,0.55]');
    });

    it('rejects invalid set_clip_position values before calling the bridge', async () => {
      const missingY = await tools.executeTool('set_clip_position', {
        clipId: 'clip-123',
        x: 100
      });
      expect(missingY.success).toBe(false);
      expect(missingY.error).toContain('Invalid arguments');

      const emptyClip = await tools.executeTool('set_clip_position', {
        clipId: '',
        x: 100,
        y: 200
      });
      expect(emptyClip.success).toBe(false);
      expect(emptyClip.error).toContain('Invalid arguments');
      expect(mockBridge.executeScript).not.toHaveBeenCalled();
    });

    it('sets clip properties in one safe batch operation', async () => {
      mockBridge.executeScript.mockResolvedValue({
        success: true,
        clipId: 'clip-123',
        sequenceId: 'seq-456',
        results: [
          { label: 'opacity', success: true, valueRequested: 42 },
          { label: 'scale', success: true, valueRequested: 125 }
        ],
        speed: { success: true, valueRequested: 150 }
      });

      const result = await tools.executeTool('batch_set_clip_properties', {
        clipId: 'clip-123',
        sequenceId: 'seq-456',
        properties: {
          opacity: 42,
          blendMode: 18,
          blendModePropertyIndex: 1,
          scale: 125,
          scaleWidth: 110,
          uniformScale: false,
          position: { x: 0.45, y: 0.55 },
          rotation: 12,
          anchorPoint: { x: 0.5, y: 0.5 },
          antiFlickerFilter: 0.25,
          crop: { left: 1, top: 2, right: 3, bottom: 4 },
          speed: { percent: 150, maintainAudioPitch: false }
        }
      });

      expect(result.success).toBe(true);
      const script = mockBridge.executeScript.mock.calls[0][0];
      expect(script).toContain('__findClip("clip-123", "seq-456")');
      expect(script).toContain('var operations = ');
      expect(script).toContain('"label":"opacity"');
      expect(script).toContain('"componentName":"Opacity"');
      expect(script).toContain('"propertyName":"Opacity"');
      expect(script).toContain('"label":"blendMode"');
      expect(script).toContain('"propertyIndex":1');
      expect(script).toContain('"label":"position"');
      expect(script).toContain('"propertyName":"Position"');
      expect(script).toContain('"value":[0.45,0.55]');
      expect(script).toContain('"label":"scaleWidth"');
      expect(script).toContain('"propertyName":"Scale Width"');
      expect(script).toContain('"label":"uniformScale"');
      expect(script).toContain('"propertyName":"Uniform Scale"');
      expect(script).toContain('"label":"anchorPoint"');
      expect(script).toContain('"propertyName":"Anchor Point"');
      expect(script).toContain('"label":"cropLeft"');
      expect(script).toContain('var speedSettings = {"percent":150,"maintainAudioPitch":false}');
    });

    it('rejects invalid batch clip properties before calling the bridge', async () => {
      const noProperties = await tools.executeTool('batch_set_clip_properties', {
        clipId: 'clip-123',
        properties: {}
      });
      expect(noProperties.success).toBe(false);
      expect(noProperties.error).toContain('Invalid arguments');

      const badOpacity = await tools.executeTool('batch_set_clip_properties', {
        clipId: 'clip-123',
        properties: { opacity: 101 }
      });
      expect(badOpacity.success).toBe(false);
      expect(badOpacity.error).toContain('Invalid arguments');

      const zeroSpeed = await tools.executeTool('batch_set_clip_properties', {
        clipId: 'clip-123',
        properties: { speed: { percent: 0 } }
      });
      expect(zeroSpeed.success).toBe(false);
      expect(zeroSpeed.error).toContain('Invalid arguments');

      const negativeSpeed = await tools.executeTool('batch_set_clip_properties', {
        clipId: 'clip-123',
        properties: { speed: { percent: -100 } }
      });
      expect(negativeSpeed.success).toBe(false);
      expect(negativeSpeed.error).toContain('Invalid arguments');

      const infiniteScale = await tools.executeTool('batch_set_clip_properties', {
        clipId: 'clip-123',
        properties: { scale: Number.POSITIVE_INFINITY }
      });
      expect(infiniteScale.success).toBe(false);
      expect(infiniteScale.error).toContain('Invalid arguments');

      const infiniteSpeed = await tools.executeTool('batch_set_clip_properties', {
        clipId: 'clip-123',
        properties: { speed: { percent: Number.POSITIVE_INFINITY } }
      });
      expect(infiniteSpeed.success).toBe(false);
      expect(infiniteSpeed.error).toContain('Invalid arguments');
      expect(mockBridge.executeScript).not.toHaveBeenCalled();
    });

    it('sets clip speed settings with safe JSON payloads and source timing controls', async () => {
      mockBridge.executeScript.mockResolvedValue({
        success: true,
        clipId: 'clip-123',
        sequenceId: 'seq-456',
        timing: { success: true, outPointAfter: 3.25 },
        speed: { attempted: true, success: false, error: 'Error: Illegal Parameter type' }
      });

      const result = await tools.executeTool('set_clip_speed_settings', {
        clipId: 'clip-123',
        sequenceId: 'seq-456',
        sourceInPointSeconds: 1.25,
        sourceDurationSeconds: 2,
        speedPercent: 150,
        maintainAudioPitch: false
      });

      expect(result.success).toBe(true);
      const script = mockBridge.executeScript.mock.calls[0][0];
      expect(script).toContain('__findClip("clip-123", "seq-456")');
      expect(script).toContain('var settings = {"sourceInPointSeconds":1.25,"sourceDurationSeconds":2,"speedPercent":150,"maintainAudioPitch":false}');
      expect(script).toContain('function __makeTime(seconds)');
      expect(script).toContain('clip.inPoint = __makeTime(Number(settings.sourceInPointSeconds));');
      expect(script).toContain('clip.outPoint = __makeTime(outPointSeconds);');
      expect(script).toContain('var requestedInPointSeconds = settings.sourceInPointSeconds !== undefined ? Number(settings.sourceInPointSeconds) : before.sourceInPoint;');
      expect(script).toContain('Requested source in point must be before requested source out point');
      expect(script).toContain('speedAttempted: true');
      expect(script).toContain('var requestedMultiplier = Number(settings.speedPercent) / 100;');
      expect(script).toContain('var directionMatchesRequest = reversedAfter !== true;');
    });

    it('supports source out-point-only speed setting updates', async () => {
      mockBridge.executeScript.mockResolvedValue({ success: true, timing: { success: true } });

      const result = await tools.executeTool('set_clip_speed_settings', {
        clipId: 'clip-123',
        sourceOutPointSeconds: 4.5
      });

      expect(result.success).toBe(true);
      const script = mockBridge.executeScript.mock.calls[0][0];
      expect(script).toContain('var settings = {"sourceOutPointSeconds":4.5}');
      expect(script).toContain('clip.outPoint = __makeTime(Number(settings.sourceOutPointSeconds));');
      expect(script).not.toContain('var settings = {"sourceOutPointSeconds":null}');
    });

    it('rejects invalid clip speed settings before calling the bridge', async () => {
      const noSettings = await tools.executeTool('set_clip_speed_settings', {
        clipId: 'clip-123'
      });
      expect(noSettings.success).toBe(false);
      expect(noSettings.error).toContain('Invalid arguments');

      const zeroSpeed = await tools.executeTool('set_clip_speed_settings', {
        clipId: 'clip-123',
        speedPercent: 0
      });
      expect(zeroSpeed.success).toBe(false);
      expect(zeroSpeed.error).toContain('Invalid arguments');

      const negativeSpeed = await tools.executeTool('set_clip_speed_settings', {
        clipId: 'clip-123',
        speedPercent: -100
      });
      expect(negativeSpeed.success).toBe(false);
      expect(negativeSpeed.error).toContain('Invalid arguments');

      const infiniteDuration = await tools.executeTool('set_clip_speed_settings', {
        clipId: 'clip-123',
        sourceDurationSeconds: Number.POSITIVE_INFINITY
      });
      expect(infiniteDuration.success).toBe(false);
      expect(infiniteDuration.error).toContain('Invalid arguments');

      const negativeDuration = await tools.executeTool('set_clip_speed_settings', {
        clipId: 'clip-123',
        sourceDurationSeconds: -1
      });
      expect(negativeDuration.success).toBe(false);
      expect(negativeDuration.error).toContain('Invalid arguments');

      const invertedRange = await tools.executeTool('set_clip_speed_settings', {
        clipId: 'clip-123',
        sourceInPointSeconds: 5,
        sourceOutPointSeconds: 4
      });
      expect(invertedRange.success).toBe(false);
      expect(invertedRange.error).toContain('Invalid arguments');

      const emptyClip = await tools.executeTool('set_clip_speed_settings', {
        clipId: '',
        sourceOutPointSeconds: 1
      });
      expect(emptyClip.success).toBe(false);
      expect(emptyClip.error).toContain('Invalid arguments');
      expect(mockBridge.executeScript).not.toHaveBeenCalled();
    });

    it('rejects mutually exclusive clip source duration and source out-point settings', async () => {
      const result = await tools.executeTool('set_clip_speed_settings', {
        clipId: 'clip-123',
        sourceDurationSeconds: 2,
        sourceOutPointSeconds: 3
      });

      expect(result.success).toBe(false);
      expect(result.error).toContain('Invalid arguments');
      expect(mockBridge.executeScript).not.toHaveBeenCalled();
    });

    it('sets clip time-remap speed keyframes only through a discovered Time Remapping property', async () => {
      mockBridge.executeScript.mockResolvedValue({
        success: true,
        supported: true,
        staticSpeed: { requested: 100, valueAfter: 100 },
        keyframes: [
          { timeSeconds: 0, speedPercent: 100, success: true },
          { timeSeconds: 0.5, speedPercent: 50, success: true }
        ]
      });

      const result = await tools.executeTool('set_clip_time_remap_settings', {
        clipId: 'clip-123',
        sequenceId: 'seq-456',
        staticSpeedPercent: 100,
        keyframes: [
          { timeSeconds: 0, speedPercent: 100 },
          { timeSeconds: 0.5, speedPercent: 50 }
        ]
      });

      expect(result.success).toBe(true);
      const script = mockBridge.executeScript.mock.calls[0][0];
      expect(script).toContain('__findClip("clip-123", "seq-456")');
      expect(script).toContain('var settings = {"staticSpeedPercent":100,"keyframes":[{"timeSeconds":0,"speedPercent":100},{"timeSeconds":0.5,"speedPercent":50}]}');
      expect(script).toContain('function __findTimeRemapSpeedProperty(clip)');
      expect(script).toContain('setTimeVarying(true)');
      expect(script).toContain('speedProp.addKey(Number(keyframe.timeSeconds));');
      expect(script).toContain('speedProp.setValueAtKey(Number(keyframe.timeSeconds), Number(keyframe.speedPercent), true);');
      expect(script).toContain('Time Remapping speed property is not exposed to ExtendScript on this clip');
    });

    it('reports unsupported time-remap hosts without pretending mutation succeeded', async () => {
      mockBridge.executeScript.mockResolvedValue({
        success: false,
        supported: false,
        error: 'Time Remapping speed property is not exposed to ExtendScript on this clip',
        availableComponents: ['Opacity', 'Motion'],
        qeTimeRemapCapabilities: { speed: 'number', setSpeed: 'function' }
      });

      const result = await tools.executeTool('set_clip_time_remap_settings', {
        clipId: 'clip-123',
        staticSpeedPercent: 100
      });

      expect(result.success).toBe(false);
      expect(result.supported).toBe(false);
      expect(result.error).toContain('not exposed');
      expect(result.availableComponents).toEqual(['Opacity', 'Motion']);
    });

    it('rejects invalid clip time-remap settings before calling the bridge', async () => {
      const noSettings = await tools.executeTool('set_clip_time_remap_settings', {
        clipId: 'clip-123'
      });
      expect(noSettings.success).toBe(false);
      expect(noSettings.error).toContain('Invalid arguments');

      const zeroStaticSpeed = await tools.executeTool('set_clip_time_remap_settings', {
        clipId: 'clip-123',
        staticSpeedPercent: 0
      });
      expect(zeroStaticSpeed.success).toBe(false);
      expect(zeroStaticSpeed.error).toContain('Invalid arguments');

      const negativeKeyframeSpeed = await tools.executeTool('set_clip_time_remap_settings', {
        clipId: 'clip-123',
        keyframes: [{ timeSeconds: 0, speedPercent: -50 }]
      });
      expect(negativeKeyframeSpeed.success).toBe(false);
      expect(negativeKeyframeSpeed.error).toContain('Invalid arguments');

      const unsortedKeyframes = await tools.executeTool('set_clip_time_remap_settings', {
        clipId: 'clip-123',
        keyframes: [
          { timeSeconds: 1, speedPercent: 100 },
          { timeSeconds: 0.5, speedPercent: 50 }
        ]
      });
      expect(unsortedKeyframes.success).toBe(false);
      expect(unsortedKeyframes.error).toContain('Invalid arguments');

      const infiniteTime = await tools.executeTool('set_clip_time_remap_settings', {
        clipId: 'clip-123',
        keyframes: [{ timeSeconds: Number.POSITIVE_INFINITY, speedPercent: 100 }]
      });
      expect(infiniteTime.success).toBe(false);
      expect(infiniteTime.error).toContain('Invalid arguments');

      const emptyClip = await tools.executeTool('set_clip_time_remap_settings', {
        clipId: '',
        staticSpeedPercent: 100
      });
      expect(emptyClip.success).toBe(false);
      expect(emptyClip.error).toContain('Invalid arguments');
      expect(mockBridge.executeScript).not.toHaveBeenCalled();
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

  describe('high-level workflow tools', () => {
    it('builds a motion graphics demo sequence', async () => {
      mockBridge.createSequence = jest.fn().mockResolvedValue({
        id: 'seq-1',
        name: 'Demo Sequence'
      } as any);
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
      mockBridge.executeScript.mockResolvedValue({
        success: true,
        videoTracks: [],
        audioTracks: []
      });

      const result = await tools.executeTool('build_motion_graphics_demo', {
        sequenceName: 'Demo Sequence'
      });

      expect(result.success).toBe(true);
      expect(result.sequence.id).toBe('seq-1');
      expect(result.assets).toHaveLength(3);
      expect(mockBridge.importMedia).toHaveBeenCalledTimes(3);
      expect(mockBridge.addToTimeline).toHaveBeenCalledTimes(3);
    });

    it('assembles a product spot from provided assets', async () => {
      mockBridge.createSequence = jest.fn().mockResolvedValue({
        id: 'seq-2',
        name: 'Product Spot'
      } as any);
      mockBridge.importMedia = jest
        .fn()
        .mockResolvedValueOnce({ success: true, id: 'item-a', name: 'a.mp4' } as any)
        .mockResolvedValueOnce({ success: true, id: 'item-b', name: 'b.mp4' } as any);
      mockBridge.addToTimeline = jest
        .fn()
        .mockResolvedValueOnce({ success: true, id: 'clip-a', name: 'a.mp4', inPoint: 0, outPoint: 4 } as any)
        .mockResolvedValueOnce({ success: true, id: 'clip-b', name: 'b.mp4', inPoint: 4, outPoint: 8 } as any);
      mockBridge.executeScript.mockResolvedValue({
        success: true,
        videoTracks: [],
        audioTracks: []
      });

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
      mockBridge.createSequence = jest.fn().mockResolvedValue({
        id: 'seq-2b',
        name: 'Directed Spot'
      } as any);
      mockBridge.importMedia = jest
        .fn()
        .mockResolvedValueOnce({ success: true, id: 'item-a', name: 'a.mp4' } as any)
        .mockResolvedValueOnce({ success: true, id: 'item-b', name: 'b.mp4' } as any);
      mockBridge.addToTimeline = jest
        .fn()
        .mockResolvedValueOnce({ success: true, id: 'clip-a', name: 'a.mp4', inPoint: 1.5, outPoint: 3.5 } as any)
        .mockResolvedValueOnce({ success: true, id: 'clip-b', name: 'b.mp4', inPoint: 3.6, outPoint: 6.6 } as any);
      mockBridge.executeScript.mockResolvedValue({
        success: true,
        videoTracks: [],
        audioTracks: []
      });

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
      expect(mockBridge.addToTimeline).toHaveBeenNthCalledWith(1, 'seq-2b', 'item-a', 1, 1.5, true);
      expect(mockBridge.addToTimeline).toHaveBeenNthCalledWith(2, 'seq-2b', 'item-b', 2, 3.6, true);
    });

    it('builds a brand spot from assets without requiring a mogrt', async () => {
      mockBridge.createSequence = jest.fn().mockResolvedValue({
        id: 'seq-3',
        name: 'Brand Spot'
      } as any);
      mockBridge.importMedia = jest
        .fn()
        .mockResolvedValueOnce({ success: true, id: 'item-a', name: 'a.mp4' } as any)
        .mockResolvedValueOnce({ success: true, id: 'item-b', name: 'b.mp4' } as any);
      mockBridge.addToTimeline = jest
        .fn()
        .mockResolvedValueOnce({ success: true, id: 'clip-a', name: 'a.mp4', inPoint: 0, outPoint: 4 } as any)
        .mockResolvedValueOnce({ success: true, id: 'clip-b', name: 'b.mp4', inPoint: 4, outPoint: 8 } as any);
      mockBridge.executeScript.mockResolvedValue({
        success: true,
        videoTracks: [],
        audioTracks: []
      });

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

  describe('stacked online conform scan primitives', () => {
    it('executes scan_conform_media_metadata as a read-only metadata diagnostic', async () => {
      mockBridge.executeScript.mockResolvedValue({
        success: true,
        mutationPlanned: false,
        items: [
          {
            projectItemId: 'item-1',
            name: 'A001_C001.mov',
            mediaPath: '/online/A001_C001.mov',
            reelName: 'A001',
            durationSeconds: 10,
            warnings: [],
          },
        ],
      });

      const result = await tools.executeTool('scan_conform_media_metadata', {
        projectItemIds: ['item-1'],
        mediaPaths: ['/online/A001_C001.mov'],
        includeXmp: true,
      });

      expect(result.success).toBe(true);
      expect(result.mutationPlanned).toBe(false);
      expect(mockBridge.executeScript).toHaveBeenCalledTimes(1);
      const script = mockBridge.executeScript.mock.calls[0][0];
      expect(script).toContain('__scanConformMediaMetadata');
      expect(script).toContain('return __scanConformMediaMetadata();');
      expect(script).toContain('__findProjectItem');
      expect(script).toContain('getProjectMetadata');
      expect(script).toContain('getXMPMetadata');
      expect(script).toContain('getFootageInterpretation');
      expect(script).toContain('durationFrames');
      expect(script).toContain('sourceStartFrame');
      expect(script).toContain('dropFrames * (totalMinutes - Math.floor(totalMinutes / 10))');
      expect(script).toContain('dropFrameTimecodeAtNonNtscRate');
      expect(script).toContain('__isNtscDropFrameRate');
      expect(script).not.toContain("warnings.push('dropFrameTimecode');");
      expect(script).toContain('sourceVideoWidth');
      expect(script).toContain('sourceVideoHeight');
      expect(script).toContain('raster');
      expect(script).toContain('mutationPlanned: false');
      expect(script).not.toContain('changeMediaPath');
      expect(script).not.toContain('setProjectMetadata');
      expect(script).not.toContain('remove(');
    });

    it('rejects empty conform media identifiers before calling the bridge', async () => {
      const result = await tools.executeTool('scan_conform_media_metadata', {
        projectItemIds: [''],
      });

      expect(result.success).toBe(false);
      expect(result.error).toContain('Invalid arguments');
      expect(mockBridge.executeScript).not.toHaveBeenCalled();
    });

    it('executes snapshot_sequence_for_conform as a read-only sequence snapshot', async () => {
      mockBridge.executeScript.mockResolvedValue({
        success: true,
        mutationPlanned: false,
        sequence: { sequenceId: 'seq-1', name: 'Offline v1', frameRate: { fps: 24 } },
        tracks: [{ trackType: 'video', trackIndex: 0, role: 'picture', clipCount: 1, warnings: [] }],
        clips: [{ offlineClipId: 'offline-1', trackIndex: 0, timelineStartFrame: 24, timelineEndFrame: 72 }],
      });

      const result = await tools.executeTool('snapshot_sequence_for_conform', {
        sequenceId: 'seq-1',
        trackRoles: {
          video: { '0': 'picture', '1': 'passthrough' },
          audio: { '0': 'audio' },
        },
        includeEffects: true,
        includeKeyframes: false,
      });

      expect(result.success).toBe(true);
      expect(result.mutationPlanned).toBe(false);
      expect(mockBridge.executeScript).toHaveBeenCalledTimes(1);
      const script = mockBridge.executeScript.mock.calls[0][0];
      expect(script).toContain('__snapshotSequenceForConform');
      expect(script).toContain('return __snapshotSequenceForConform();');
      expect(script).toContain('__findSequence');
      expect(script).toContain('videoTracks');
      expect(script).toContain('audioTracks');
      expect(script).toContain('timelineStartFrame');
      expect(script).toContain('sourceInFrame');
      expect(script).toContain('mediaIdentity');
      expect(script).toContain('sourceStartTimecode');
      expect(script).toContain('frameRate');
      expect(script).toContain('durationFrames');
      expect(script).toContain('raster');
      expect(script).toContain('missingSourceFrameRateForSourceTimecode');
      expect(script).toContain('invalidSourceStartTimecode');
      expect(script).toContain('dropFrameTimecodeAtNonNtscRate');
      expect(script).toContain('__isNtscDropFrameRate');
      expect(script).not.toContain("warnings.push('dropFrameTimecode');");
      expect(script).not.toContain('footageInterpretation.frameRate ? footageInterpretation.frameRate : sequenceFrameRate');
      expect(script).toContain('var sourceFrameRate = mediaIdentityDetails.frameRate && mediaIdentityDetails.frameRate.fps ? mediaIdentityDetails.frameRate.fps : null;');
      expect(script).toContain("warnings.push('missingSourceFrameRateForSourceInOut')");
      expect(script).toContain('var sourceInFrame = __secondsToFrame(sourceInSeconds, sourceFrameRate);');
      expect(script).toContain('var sourceOutFrame = __secondsToFrame(sourceOutSeconds, sourceFrameRate);');
      expect(script).not.toContain('var sourceInFrame = __secondsToFrame(sourceInSeconds, frameRate);');
      expect(script).not.toContain('var sourceOutFrame = __secondsToFrame(sourceOutSeconds, frameRate);');
      expect(script).toContain('payload.includeDisabled || __clipEnabled');
      expect(script).toContain('includeDisabled: false');
      expect(script).not.toContain('payload.sequenceFrameRate || 24');
      expect(script).toContain('mutationPlanned: false');
      expect(script).not.toContain('insertClip');
      expect(script).not.toContain('overwriteClip');
      expect(script).not.toContain('remove(');
    });

    it('requires sequenceId for snapshot_sequence_for_conform', async () => {
      const result = await tools.executeTool('snapshot_sequence_for_conform', {
        includeEffects: true,
      });

      expect(result.success).toBe(false);
      expect(result.error).toContain('Invalid arguments');
      expect(mockBridge.executeScript).not.toHaveBeenCalled();
    });
  });

  describe('stacked online conform analyzer', () => {
    it('analyzes a provided sequence snapshot without mutating Premiere', async () => {
      const result = await tools.executeTool('analyze_stacked_online_conform', {
        sequenceSnapshot: {
          sequence: { sequenceId: 'seq-1', name: 'Offline', frameRate: { numerator: 24, denominator: 1, fps: 24, nominalFps: 24 } },
          tracks: [{ trackType: 'video', trackIndex: 0, role: 'picture', clipCount: 1, warnings: [] }],
          clips: [
            {
              offlineClipId: 'offline-1',
              trackType: 'video',
              trackIndex: 0,
              timelineStartFrame: 240,
              timelineEndFrame: 288,
              sourceInFrame: 24,
              sourceDurationFrames: 48,
              name: 'A001_C001_offline.mov',
              mediaIdentity: { reelName: 'A001', sourceStartFrame: 1000, frameRate: { numerator: 24, denominator: 1, fps: 24, nominalFps: 24 } },
              warnings: [],
            },
          ],
        },
        onlineMedia: [
          {
            projectItemId: 'online-1',
            name: 'A001_C001.mov',
            reelName: 'A001',
            sourceStartFrame: 900,
            durationFrames: 500,
            frameRate: { numerator: 24, denominator: 1, fps: 24, nominalFps: 24 },
            warnings: [],
          },
        ],
        sourceTrackIndices: [0],
        matchFields: ['reelName', 'startTimecode', 'duration'],
        toleranceFrames: 1,
      });

      expect(result.success).toBe(true);
      expect(result.mutationPlanned).toBe(false);
      expect(result.placementPlan).toHaveLength(1);
      expect(result.placementPlan[0]).toMatchObject({
        offlineClipId: 'offline-1',
        onlineProjectItemId: 'online-1',
        targetTrackIndex: 1,
        safeToPlace: true,
      });
      expect(mockBridge.executeScript).not.toHaveBeenCalled();
    });

    it('can snapshot a sequence first and still returns dry-run analysis only', async () => {
      mockBridge.executeScript.mockResolvedValue({
        success: true,
        mutationPlanned: false,
        sequence: { sequenceId: 'seq-1', name: 'Offline', frameRate: { numerator: 24, denominator: 1, fps: 24, nominalFps: 24 } },
        tracks: [{ trackType: 'video', trackIndex: 0, role: 'picture', clipCount: 1, warnings: [] }],
        clips: [{ offlineClipId: 'offline-1', trackType: 'video', trackIndex: 0, timelineStartFrame: 0, timelineEndFrame: 24, sourceInFrame: 0, sourceDurationFrames: 24, name: 'A.mov', mediaIdentity: { reelName: 'A', sourceStartFrame: 100, frameRate: { numerator: 24, denominator: 1, fps: 24, nominalFps: 24 } }, warnings: [] }],
      });

      const result = await tools.executeTool('analyze_stacked_online_conform', {
        sequenceId: 'seq-1',
        onlineMedia: [{ projectItemId: 'online-a', name: 'A.mov', reelName: 'A', sourceStartFrame: 100, durationFrames: 100, frameRate: { numerator: 24, denominator: 1, fps: 24, nominalFps: 24 }, warnings: [] }],
        sourceTrackIndices: [0],
      });

      expect(result.success).toBe(true);
      expect(result.mutationPlanned).toBe(false);
      expect(mockBridge.executeScript).toHaveBeenCalledTimes(1);
      const script = mockBridge.executeScript.mock.calls[0][0];
      expect(script).toContain('__snapshotSequenceForConform');
      expect(script).not.toContain('insertClip');
      expect(script).not.toContain('overwriteClip');
      expect(script).not.toContain('replaceClip');
    });

    it('requires onlineMedia for analyze_stacked_online_conform', async () => {
      const result = await tools.executeTool('analyze_stacked_online_conform', {
        sequenceId: 'seq-1',
      });

      expect(result.success).toBe(false);
      expect(result.error).toContain('Invalid arguments');
      expect(mockBridge.executeScript).not.toHaveBeenCalled();
    });
  });

  describe('stacked online conform executor', () => {
    const safePlacementPlan = [
      {
        offlineClipId: 'offline-1',
        onlineProjectItemId: 'online-1',
        sourceTrackIndex: 0,
        targetTrackIndex: 1,
        startTime: 10,
        sourceInPoint: 5,
        sourceOutPoint: 7,
        duration: 2,
        safeToPlace: true,
      },
    ];

    it('dry-runs create_stacked_online_conform_sequence without calling the bridge', async () => {
      const result = await tools.executeTool('create_stacked_online_conform_sequence', {
        sourceSequenceId: 'seq-1',
        conformSequenceName: 'Seq Online Conform',
        placementPlan: safePlacementPlan,
        duplicateSequence: true,
        dryRun: true,
      });

      expect(result.success).toBe(true);
      expect(result.dryRun).toBe(true);
      expect(result.mutationPlanned).toBe(false);
      expect(result.operations.map((op: any) => op.type)).toEqual(['duplicateSequence', 'ensureVideoTrack', 'placeOnlineClip']);
      expect(mockBridge.executeScript).not.toHaveBeenCalled();
    });

    it('rejects unsafe stacked conform plans before bridge execution', async () => {
      const result = await tools.executeTool('create_stacked_online_conform_sequence', {
        sourceSequenceId: 'seq-1',
        conformSequenceName: 'Seq Online Conform',
        placementPlan: [{ ...safePlacementPlan[0], targetTrackIndex: 0 }],
        duplicateSequence: true,
        dryRun: false,
      });

      expect(result.success).toBe(false);
      expect(result.error).toMatch(/Unsafe stacked conform plan/);
      expect(result.validation.errors).toContain('placement[0].targetTrackIndex must be greater than sourceTrackIndex');
      expect(mockBridge.executeScript).not.toHaveBeenCalled();
    });

    it('rejects attempts to live-conform without duplicating the source sequence', async () => {
      const result = await tools.executeTool('create_stacked_online_conform_sequence', {
        sourceSequenceId: 'seq-1',
        conformSequenceName: 'Seq Online Conform',
        placementPlan: safePlacementPlan,
        duplicateSequence: false,
        allowMutatingSourceSequence: true,
        dryRun: false,
      });

      expect(result.success).toBe(false);
      expect(result.error).toMatch(/Unsafe stacked conform plan/);
      expect(result.validation.errors).toContain('duplicateSequence must be true for non-destructive stacked conform execution');
      expect(mockBridge.executeScript).not.toHaveBeenCalled();
    });

    it('builds a live-safe execution script that duplicates and stacks online clips without replacing offline clips', async () => {
      mockBridge.executeScript.mockResolvedValue({
        success: true,
        mutationPlanned: true,
        duplicatedSequenceId: 'seq-online',
        placedClips: [{ offlineClipId: 'offline-1', onlineClipId: 'online-clip-1' }],
      });

      const result = await tools.executeTool('create_stacked_online_conform_sequence', {
        sourceSequenceId: 'seq-1',
        conformSequenceName: 'Seq Online Conform',
        placementPlan: safePlacementPlan,
        duplicateSequence: true,
        dryRun: false,
      });

      expect(result.success).toBe(true);
      expect(mockBridge.executeScript).toHaveBeenCalledTimes(1);
      const script = mockBridge.executeScript.mock.calls[0][0];
      expect(script).toContain('__createStackedOnlineConformSequence');
      expect(script).toContain('__cloneSequenceAndResolve');
      expect(script).toContain('sourceSequence.clone()');
      expect(script).toContain('beforeSequenceIds');
      expect(script).toContain('cloneReturnType');
      expect(script).toContain('Unable to identify cloned sequence after Sequence.clone()');
      expect(script).toContain('targetSequence.videoTracks');
      expect(script).toContain('insertClip');
      expect(script).toContain('preExistingVideoTrackCount');
      expect(script).toContain('__preflightStackedConformExecution');
      expect(script).toContain('missingOnlineProjectItems');
      expect(script).toContain('cannotSetProjectItemInOut');
      expect(script).toContain('sourceOutPointExceedsProjectItemDuration');
      expect(script).toContain('__projectItemDurationSeconds');
      expect(script).toContain('originalInPointUnavailable');
      expect(script).toContain('originalOutPointUnavailable');
      expect(script).toContain('trackCreationFailures');
      expect(script).toContain('trackCreationNoProgress');
      expect(script).toContain('targetTrackIndex < preExistingVideoTrackCount');
      expect(script.indexOf('__preflightStackedConformExecution')).toBeLessThan(script.indexOf('sourceSequence.clone()'));
      expect(script.indexOf('cannotSetProjectItemInOut')).toBeLessThan(script.indexOf('sourceSequence.clone()'));
      expect(script.indexOf('targetTrackIndex < preExistingVideoTrackCount')).toBeLessThan(script.indexOf('sourceSequence.clone()'));
      expect(script).toContain('setInPoint');
      expect(script).toContain('setOutPoint');
      expect(script).toContain('placement.sourceOutPoint');
      expect(script).not.toContain('placement.sourceInPoint + placement.duration');
      expect(script).toContain('__restoreProjectItemInOut');
      expect(script).toContain('__audioClipKeyMap');
      expect(script).toContain('beforeAudioClipKeys');
      expect(script).toContain('linkedAudioInserted');
      expect(script).toContain('mutationPlanned: true');
      expect(script).not.toContain('replaceClip');
      expect(script).not.toContain('remove(');
    });
  });

  describe('conform effect copying', () => {
    const sourceEffects = [
      {
        componentName: 'Motion',
        properties: [
          { displayName: 'Scale', value: 100, keyframesIncluded: true },
          { displayName: 'Position', value: { x: 960, y: 540, coordinateSpace: 'sequencePixels' }, keyframesIncluded: true },
        ],
      },
      {
        componentName: 'Opacity',
        properties: [
          { displayName: 'Opacity', value: 75, keyframesIncluded: true },
        ],
      },
      {
        componentName: 'Unsupported Plugin',
        properties: [
          { displayName: 'Amount', value: 10, keyframesIncluded: true },
        ],
      },
    ];

    it('dry-runs copy_conform_clip_effects with resolution-aware Motion conversion and unsupported reporting', async () => {
      const result = await tools.executeTool('copy_conform_clip_effects', {
        sourceClipId: 'offline-clip-1',
        targetClipId: 'online-clip-1',
        sequenceId: 'seq-1',
        sourceEffects,
        offlineSourceRaster: { width: 1920, height: 1080 },
        onlineSourceRaster: { width: 3840, height: 2160 },
        dryRun: true,
      });

      expect(result.success).toBe(true);
      expect(result.dryRun).toBe(true);
      expect(result.mutationPlanned).toBe(false);
      expect(result.plan.assignments).toContainEqual({ componentName: 'Motion', propertyName: 'Scale', value: 50 });
      expect(result.plan.unsupportedComponents).toEqual(['Unsupported Plugin']);
      expect(mockBridge.executeScript).not.toHaveBeenCalled();
    });

    it('builds a script that copies supported built-in properties and reports unsupported components', async () => {
      mockBridge.executeScript.mockResolvedValue({
        success: true,
        mutationPlanned: true,
        copiedProperties: [{ componentName: 'Opacity', propertyName: 'Opacity' }],
        unsupportedComponents: ['Unsupported Plugin'],
      });

      const result = await tools.executeTool('copy_conform_clip_effects', {
        sourceClipId: 'offline-clip-1',
        targetClipId: 'online-clip-1',
        sequenceId: 'seq-1',
        sourceEffects,
        offlineSourceRaster: { width: 1920, height: 1080 },
        onlineSourceRaster: { width: 3840, height: 2160 },
        dryRun: false,
      });

      expect(result.success).toBe(true);
      expect(mockBridge.executeScript).toHaveBeenCalledTimes(1);
      const script = mockBridge.executeScript.mock.calls[0][0];
      expect(script).toContain('__copyConformClipEffects');
      expect(script).toContain('setValue');
      expect(script).toContain('Motion');
      expect(script).toContain('Opacity');
      expect(script).toContain('unsupportedComponents');
      expect(script).toContain('mutationPlanned: true');
      expect(script).not.toContain('replaceClip');
      expect(script).not.toContain('remove(');
    });
  });

  describe('stacked conform QC', () => {
    const comparisons = [
      {
        offlineClipId: 'offline-1',
        onlineClipId: 'online-1',
        sourceTrackIndex: 0,
        targetTrackIndex: 1,
        startTime: 10,
        duration: 4,
      },
    ];

    it('dry-runs qc_stacked_online_conform with frame export planning only', async () => {
      const result = await tools.executeTool('qc_stacked_online_conform', {
        sequenceId: 'seq-1',
        outputDir: '/tmp/conform-qc',
        comparisons,
        sampleOffsets: [0.5],
        dryRun: true,
      });

      expect(result.success).toBe(true);
      expect(result.dryRun).toBe(true);
      expect(result.mutationPlanned).toBe(false);
      expect(result.plan.frameExports).toHaveLength(2);
      expect(result.plan.frameExports.map((entry: any) => entry.view)).toEqual(['offline', 'online']);
      expect(result.plan.structuralReport).toEqual({
        passed: true,
        findings: [],
        summary: {
          errors: 0,
          warnings: 0,
          timingDrift: 0,
          sourceDrift: 0,
          missingPlacements: 0,
          wrongTracks: 0,
          unsupportedEffects: 0,
        },
      });
      expect(mockBridge.executeScript).not.toHaveBeenCalled();
    });

    it('dry-runs qc_stacked_online_conform with structural drift and unsupported-effect reporting', async () => {
      const result = await tools.executeTool('qc_stacked_online_conform', {
        sequenceId: 'seq-1',
        outputDir: '/tmp/conform-qc',
        comparisons: [
          {
            offlineClipId: 'offline-1',
            onlineClipId: 'online-1',
            sourceTrackIndex: 0,
            targetTrackIndex: 1,
            startTime: 10,
            duration: 4,
            actualStartTime: 10.25,
            actualDuration: 4.5,
            expectedSourceInPoint: 5,
            actualSourceInPoint: 5.25,
            expectedSourceOutPoint: 9,
            actualSourceOutPoint: 9.5,
            unsupportedEffects: ['Third Party Glow'],
          },
        ],
        sampleOffsets: [0.5],
        dryRun: true,
      });

      expect(result.success).toBe(true);
      expect(result.plan.safeToExecute).toBe(true);
      expect(result.plan.structuralReport.passed).toBe(false);
      expect(result.plan.structuralReport.summary).toMatchObject({
        errors: 0,
        warnings: 3,
        timingDrift: 1,
        sourceDrift: 1,
        unsupportedEffects: 1,
      });
      expect(result.plan.structuralReport.findings).toEqual(expect.arrayContaining([
        expect.objectContaining({ type: 'timing-drift', offlineClipId: 'offline-1', onlineClipId: 'online-1', severity: 'warning' }),
        expect.objectContaining({ type: 'source-drift', offlineClipId: 'offline-1', onlineClipId: 'online-1', severity: 'warning' }),
        expect.objectContaining({ type: 'unsupported-effects', offlineClipId: 'offline-1', onlineClipId: 'online-1', severity: 'warning', details: { unsupportedEffects: ['Third Party Glow'] } }),
      ]));
      expect(mockBridge.executeScript).not.toHaveBeenCalled();
    });

    it('builds a live-safe QC script that exports frames and restores track visibility or clip-disabled fallback isolation', async () => {
      mockBridge.executeScript.mockResolvedValue({
        success: true,
        mutationPlanned: true,
        exportedFrames: [{ outputPath: '/tmp/conform-qc/offline-1_00_offline_12.000.png' }],
        restoredTrackVisibility: true,
        restoredClipDisabledStates: true,
        isolationMethod: 'clip-disabled',
      });

      const result = await tools.executeTool('qc_stacked_online_conform', {
        sequenceId: 'seq-1',
        outputDir: '/tmp/conform-qc',
        allowedOutputRoot: '/tmp',
        comparisons,
        sampleOffsets: [0.5],
        dryRun: false,
      });

      expect(result.success).toBe(true);
      expect(mockBridge.executeScript).toHaveBeenCalledTimes(1);
      const script = mockBridge.executeScript.mock.calls[0][0];
      expect(script).toContain('__qcStackedOnlineConform');
      expect(script).toContain('exportFramePNG');
      expect(script).toContain('restoreTrackVisibility');
      expect(script).toContain('setVisible');
      expect(script).toContain('restoreClipDisabledStates');
      expect(script).toContain('__rememberAllVideoClips');
      expect(script).toContain('__findUniqueClipAtTime');
      expect(script).toContain('resolvedBy: "unique-time-overlap"');
      expect(script).toContain('clip.disabled');
      expect(script).toContain('isolationMethod');
      expect(script).toContain('clip-disabled');
      expect(script).toContain('restoreFailures');
      expect(script).toContain('visibilityReadFailures');
      expect(script).toContain('isVisible returned non-boolean');
      expect(script).toContain('structuralReport: payload.structuralReport');
      expect(script).not.toContain('restoredTrackVisibility: true,');
      expect(script).toContain('__preflightQcFrameExports');
      expect(script.indexOf('__preflightQcFrameExports')).toBeLessThan(script.indexOf('new Folder(payload.outputDir)'));
      expect(script).toContain('for (var vt = 0; vt < sequence.videoTracks.numTracks; vt++)');
      expect(script).toContain('activeViewTrackIndex');
      expect(script).toContain('Track visibility isolation unavailable');
      expect(script).toContain('sourceTrackIndex >= sequence.videoTracks.numTracks');
      expect(script).toContain('mutationPlanned: true');
      expect(script).toContain('qeSequence[methodName](String(timeValue), exportBasePath)');
      expect(script).toContain('File(actualOutputPath).exists');
      expect(script).toContain('requestedOutputPath');
      expect(script).toContain('exportSignature');
      expect(script).not.toContain('tryExport(frameExport.time, frameExport.outputPath)');
      expect(script).not.toContain('tryExport(frameExport.outputPath, frameExport.time)');
      expect(script).not.toContain('replaceClip');
      expect(script).not.toContain('remove(');
    });

    it('requires an allowedOutputRoot for live QC exports before calling the bridge', async () => {
      const result = await tools.executeTool('qc_stacked_online_conform', {
        sequenceId: 'seq-1',
        outputDir: '/tmp/conform-qc',
        comparisons,
        sampleOffsets: [0.5],
        dryRun: false,
      });

      expect(result.success).toBe(false);
      expect(result.error).toContain('allowedOutputRoot is required for live QC export');
      expect(mockBridge.executeScript).not.toHaveBeenCalled();
    });
  });

  describe('timeline cleanup tools', () => {
    const cleanupSnapshot = {
      sequence: { sequenceId: 'seq-1', name: 'Messy Timeline' },
      tracks: [
        { trackType: 'video', trackIndex: 0, name: 'V1', clipCount: 1, warnings: [] },
        { trackType: 'video', trackIndex: 1, name: 'V2', clipCount: 0, warnings: [] },
      ],
      clips: [
        {
          clipId: 'clip-1',
          trackType: 'video',
          trackIndex: 0,
          clipIndex: 0,
          name: 'Picture.mov',
          startTime: 0,
          endTime: 10,
          duration: 10,
          enabled: true,
          riskFlags: [],
          warnings: [],
        },
      ],
      warnings: [],
    };

    it('executes scan_timeline_cleanup_state as a read-only dependency audit', async () => {
      mockBridge.executeScript.mockResolvedValue({
        success: true,
        mutationPlanned: false,
        ...cleanupSnapshot,
      });

      const result = await tools.executeTool('scan_timeline_cleanup_state', {
        sequenceId: 'seq-1',
        includeDisabled: true,
        includeEffects: true,
        includeKeyframes: true,
      });

      expect(result.success).toBe(true);
      expect(result.mutationPlanned).toBe(false);
      expect(mockBridge.executeScript).toHaveBeenCalledTimes(1);
      const script = mockBridge.executeScript.mock.calls[0][0];
      expect(script).toContain('__scanTimelineCleanupState');
      expect(script).toContain('return __scanTimelineCleanupState();');
      expect(script).toContain('__findSequence');
      expect(script).toContain('videoTracks');
      expect(script).toContain('audioTracks');
      expect(script).toContain('riskFlags');
      expect(script).toContain('Track Matte');
      expect(script).toContain('Set Matte');
      expect(script).toContain('adjustment');
      expect(script).toContain('nested');
      expect(script).toContain('graphic');
      expect(script).toContain('mutationPlanned: false');
      expect(script).toContain('effectInspectionDisabled');
      expect(script).toContain('clipComponentsUnavailable');
      expect(script).toContain('linkedAudioUnknown');
      expect(script).not.toContain('insertClip');
      expect(script).not.toContain('overwriteClip');
      expect(script).not.toContain('replaceClip');
      expect(script).not.toContain('remove(');
      expect(script).not.toContain('.move(');
    });

    it('requires sequenceId for scan_timeline_cleanup_state', async () => {
      const result = await tools.executeTool('scan_timeline_cleanup_state', {
        includeEffects: true,
      });

      expect(result.success).toBe(false);
      expect(result.error).toContain('Invalid arguments');
      expect(mockBridge.executeScript).not.toHaveBeenCalled();
    });

    it('analyzes a supplied cleanup snapshot without mutating Premiere', async () => {
      const result = await tools.executeTool('analyze_timeline_cleanup', {
        cleanupSnapshot,
        mode: 'conservative',
      });

      expect(result.success).toBe(true);
      expect(result.mutationPlanned).toBe(false);
      expect(result.trackClassifications).toContainEqual(expect.objectContaining({ trackIndex: 1, classification: 'safe_remove' }));
      expect(mockBridge.executeScript).not.toHaveBeenCalled();
    });

    it('can scan before analyzing and still performs no mutation', async () => {
      mockBridge.executeScript.mockResolvedValue({
        success: true,
        mutationPlanned: false,
        ...cleanupSnapshot,
      });

      const result = await tools.executeTool('analyze_timeline_cleanup', {
        sequenceId: 'seq-1',
        mode: 'conservative',
      });

      expect(result.success).toBe(true);
      expect(result.mutationPlanned).toBe(false);
      expect(mockBridge.executeScript).toHaveBeenCalledTimes(1);
      const script = mockBridge.executeScript.mock.calls[0][0];
      expect(script).toContain('__scanTimelineCleanupState');
      expect(script).not.toContain('remove(');
      expect(script).not.toContain('insertClip');
    });

    it('dry-runs create_clean_timeline_sequence without calling the bridge', async () => {
      const result = await tools.executeTool('create_clean_timeline_sequence', {
        sourceSequenceId: 'seq-1',
        cleanSequenceName: 'Messy Timeline CLEAN',
        duplicateSequence: true,
        analysisId: 'analysis-1',
        actions: [
          { type: 'removeTrack', trackType: 'video', trackIndex: 1, classification: 'safe_remove', reason: 'empty track' },
        ],
        dryRun: true,
      });

      expect(result.success).toBe(true);
      expect(result.dryRun).toBe(true);
      expect(result.mutationPlanned).toBe(false);
      expect(result.operations.map((op: any) => op.type)).toEqual(['duplicateSequence', 'removeTrack']);
      expect(mockBridge.executeScript).not.toHaveBeenCalled();
    });

    it('rejects unsafe cleanup execution plans before bridge execution', async () => {
      const result = await tools.executeTool('create_clean_timeline_sequence', {
        sourceSequenceId: 'seq-1',
        cleanSequenceName: 'Messy Timeline CLEAN',
        duplicateSequence: true,
        analysisId: 'analysis-1',
        actions: [
          { type: 'removeClip', clipId: 'matte-source', trackType: 'video', trackIndex: 0, classification: 'preserve_visual_dependency', reason: 'matte source' },
        ],
        dryRun: false,
      });

      expect(result.success).toBe(false);
      expect(result.error).toMatch(/Unsafe timeline cleanup plan/);
      expect(result.validation.errors).toContain('actions[0] classification preserve_visual_dependency is not executable');
      expect(mockBridge.executeScript).not.toHaveBeenCalled();
    });

    it('rejects forged safe actions that are not present in a fresh cleanup analysis before live mutation', async () => {
      mockBridge.executeScript.mockResolvedValueOnce({
        success: true,
        mutationPlanned: false,
        ...cleanupSnapshot,
      });

      const result = await tools.executeTool('create_clean_timeline_sequence', {
        sourceSequenceId: 'seq-1',
        cleanSequenceName: 'Messy Timeline CLEAN',
        duplicateSequence: true,
        analysisId: 'seq-1:timeline-cleanup:conservative',
        actions: [
          { type: 'removeClip', clipId: 'clip-1', trackType: 'video', trackIndex: 0, classification: 'safe_remove', reason: 'forged safe label' },
        ],
        dryRun: false,
      });

      expect(result.success).toBe(false);
      expect(result.error).toContain('not present in fresh timeline cleanup analysis');
      expect(mockBridge.executeScript).toHaveBeenCalledTimes(1);
      expect(mockBridge.executeScript.mock.calls[0][0]).toContain('__scanTimelineCleanupState');
    });

    it('builds a live-safe cleanup script that clones before mutating the duplicate only', async () => {
      mockBridge.executeScript
        .mockResolvedValueOnce({
          success: true,
          mutationPlanned: false,
          ...cleanupSnapshot,
        })
        .mockResolvedValueOnce({
          success: true,
          mutationPlanned: true,
          duplicatedSequenceId: 'seq-clean',
          actionsApplied: [{ type: 'removeTrack', trackType: 'video', trackIndex: 1, classification: 'safe_remove', reason: 'empty track' }],
        });

      const result = await tools.executeTool('create_clean_timeline_sequence', {
        sourceSequenceId: 'seq-1',
        cleanSequenceName: 'Messy Timeline CLEAN',
        duplicateSequence: true,
        analysisId: 'seq-1:timeline-cleanup:conservative',
        actions: [
          { type: 'removeTrack', trackType: 'video', trackIndex: 1, classification: 'safe_remove', reason: 'empty track' },
        ],
        dryRun: false,
      });

      expect(result.success).toBe(true);
      expect(mockBridge.executeScript).toHaveBeenCalledTimes(2);
      const scanScript = mockBridge.executeScript.mock.calls[0][0];
      const script = mockBridge.executeScript.mock.calls[1][0];
      expect(scanScript).toContain('__scanTimelineCleanupState');
      expect(script).toContain('__createCleanTimelineSequence');
      expect(script).toContain('__cloneSequenceAndResolve');
      expect(script).toContain('sourceSequence.clone()');
      expect(script).toContain('beforeSequenceIds');
      expect(script).toContain('cloneReturnType');
      expect(script).toContain('Unable to identify cloned sequence after Sequence.clone()');
      expect(script).toContain('targetSequence');
      expect(script).toContain('__preflightTimelineCleanupExecution');
      expect(script.indexOf('__preflightTimelineCleanupExecution')).toBeLessThan(script.indexOf('var cloneResolution = __cloneSequenceAndResolve'));
      expect(script.indexOf('Timeline cleanup execution preflight failed')).toBeLessThan(script.indexOf('var cloneResolution = __cloneSequenceAndResolve'));
      expect(script).toContain('warnings: warnings');
      expect(script).toContain('removeVideoTrack');
      expect(script).toContain('removeAudioTrack');
      expect(script).toContain('made no progress');
      expect(script).not.toContain('targetTracks.deleteTrack');
      expect(script).not.toContain('actionsSkipped.map');
      expect(script).toContain('mutationPlanned: true');
      expect(script).toContain('"classification":"safe_remove"');
      expect(script).toContain('"reason":"empty track"');
      expect(script).not.toContain('replaceClip');
      expect(script).not.toContain('insertClip');
      expect(script).not.toContain('overwriteClip');

      const qcResult = await tools.executeTool('qc_timeline_cleanup', {
        sourceSequenceId: 'seq-1',
        cleanSequenceId: 'seq-clean',
        outputDir: '/tmp/timeline-cleanup-qc',
        cleanupResult: {
          sourceSequenceId: 'seq-1',
          cleanSequenceId: 'seq-clean',
          actionsApplied: result.actionsApplied,
          preservedItems: [],
        },
        dryRun: true,
      });
      expect(qcResult.success).toBe(true);
      expect(qcResult.plan.structuralReport.summary.unsafeRemovals).toBe(0);
    });

    it('dry-runs qc_timeline_cleanup with before/after frame planning only', async () => {
      const result = await tools.executeTool('qc_timeline_cleanup', {
        sourceSequenceId: 'seq-1',
        cleanSequenceId: 'seq-clean',
        outputDir: '/tmp/timeline-cleanup-qc',
        cleanupResult: { sourceSequenceId: 'seq-1', cleanSequenceId: 'seq-clean', actionsApplied: [], preservedItems: [] },
        sampleTimes: [0, 5],
        dryRun: true,
      });

      expect(result.success).toBe(true);
      expect(result.dryRun).toBe(true);
      expect(result.mutationPlanned).toBe(false);
      expect(result.plan.frameExports.map((entry: any) => entry.view)).toEqual(['before', 'after', 'before', 'after']);
      expect(mockBridge.executeScript).not.toHaveBeenCalled();
    });

    it('requires allowedOutputRoot for live timeline cleanup QC exports', async () => {
      const result = await tools.executeTool('qc_timeline_cleanup', {
        sourceSequenceId: 'seq-1',
        cleanSequenceId: 'seq-clean',
        outputDir: '/tmp/timeline-cleanup-qc',
        cleanupResult: { sourceSequenceId: 'seq-1', cleanSequenceId: 'seq-clean', actionsApplied: [], preservedItems: [] },
        dryRun: false,
      });

      expect(result.success).toBe(false);
      expect(result.error).toContain('allowedOutputRoot is required for live timeline cleanup QC export');
      expect(mockBridge.executeScript).not.toHaveBeenCalled();
    });

    it('uses live-verified QE frame export arguments for timeline cleanup QC', async () => {
      mockBridge.executeScript.mockResolvedValue({
        success: true,
        exportedFrames: [{ outputPath: '/tmp/timeline-cleanup-qc/seq-1_00_before_0.000.png', exportSignature: 'secondsString_outputBase' }],
        failedExports: [],
      });

      const result = await tools.executeTool('qc_timeline_cleanup', {
        sourceSequenceId: 'seq-1',
        cleanSequenceId: 'seq-clean',
        outputDir: '/tmp/timeline-cleanup-qc',
        allowedOutputRoot: '/tmp',
        cleanupResult: { sourceSequenceId: 'seq-1', cleanSequenceId: 'seq-clean', actionsApplied: [], preservedItems: [] },
        dryRun: false,
      });

      expect(result.success).toBe(true);
      expect(mockBridge.executeScript).toHaveBeenCalledTimes(1);
      const script = mockBridge.executeScript.mock.calls[0][0];
      expect(script).toContain('qeSequence[methodName](String(timeValue), exportBasePath)');
      expect(script).toContain('File(actualOutputPath).exists');
      expect(script).toContain('requestedOutputPath');
      expect(script).toContain('exportSignature');
      expect(script).not.toContain('__tryExport(frameExport.time, frameExport.outputPath)');
      expect(script).not.toContain('__tryExport(frameExport.outputPath, frameExport.time)');
    });
  });

  describe('export_frame', () => {
    it('uses the live-verified QE frame export signature and reports the actual generated path', async () => {
      mockBridge.executeScript.mockResolvedValue({
        success: true,
        outputPath: '/tmp/frame.png',
        requestedOutputPath: '/tmp/frame.png',
        exportBasePath: '/tmp/frame',
        exportSignature: 'secondsString_outputBase',
      });

      const result = await tools.executeTool('export_frame', {
        sequenceId: 'seq-1',
        time: 0,
        outputPath: '/tmp/frame.png',
        format: 'png',
      });

      expect(result.success).toBe(true);
      expect(mockBridge.executeScript).toHaveBeenCalledTimes(1);
      const script = mockBridge.executeScript.mock.calls[0][0];
      expect(script).toContain('qeSequence[methodName](String(timeValue), exportBasePath)');
      expect(script).toContain('File(actualOutputPath).exists');
      expect(script).toContain('requestedOutputPath');
      expect(script).toContain('exportSignature');
      expect(script).not.toContain('tryExport(timeNumber,');
      expect(script).not.toContain('qeSequence[methodName](arg1, arg2)');
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
      expect(result.error).toMatch(/presetPath required/);
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
      expect(result.error).toMatch(/presetPath required/);
      expect(mockBridge.renderSequence).not.toHaveBeenCalled();
    });

    it('propagates bridge {success:false} response instead of claiming success', async () => {
      mockBridge.renderSequence.mockResolvedValue({
        success: false,
        error: 'encodeSequence returned no jobID — preset path may be invalid or AME not connected',
        outputPath: '/tmp/out.mp4',
        presetPath: '/path/that/does/not/exist.epr',
      });

      const result = await tools.executeTool('export_sequence', {
        sequenceId: 'seq-1',
        outputPath: '/tmp/out.mp4',
        presetPath: '/path/that/does/not/exist.epr',
      });

      expect(result.success).toBe(false);
      expect(result.error).toMatch(/encodeSequence returned no jobID/);
      expect(result.sequenceId).toBe('seq-1');
    });

    it('returns success with jobID when bridge confirms AME queue accepted', async () => {
      mockBridge.renderSequence.mockResolvedValue({
        success: true,
        queued: true,
        jobID: 'job-abc-123',
        outputPath: '/tmp/out.mp4',
        presetPath: '/Users/me/preset.epr',
      });

      const result = await tools.executeTool('export_sequence', {
        sequenceId: 'seq-1',
        outputPath: '/tmp/out.mp4',
        presetPath: '/Users/me/preset.epr',
      });

      expect(result.success).toBe(true);
      expect(result.jobID).toBe('job-abc-123');
      expect(result.queued).toBe(true);
      expect(result.message).toMatch(/queued in Adobe Media Encoder/);
      expect(mockBridge.renderSequence).toHaveBeenCalledWith(
        'seq-1',
        '/tmp/out.mp4',
        '/Users/me/preset.epr',
      );
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
      expect(result.error).toMatch(/presetPath required/);
      expect(mockBridge.renderSequence).not.toHaveBeenCalled();
    });

    it('propagates bridge failure responses through the delegation', async () => {
      mockBridge.renderSequence.mockResolvedValue({
        success: false,
        error: 'app.encoder not available in this Premiere build',
      });

      const result = await tools.executeTool('add_to_render_queue', {
        sequenceId: 'seq-1',
        outputPath: '/tmp/out.mp4',
        presetPath: '/Users/me/preset.epr',
      });

      expect(result.success).toBe(false);
      expect(result.error).toMatch(/app.encoder not available/);
    });
  });
});
