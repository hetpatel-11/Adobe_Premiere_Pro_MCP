/**
 * Export/QC utility tool tests.
 */

import { promises as fs } from 'fs';
import { join } from 'path';
import { tmpdir } from 'os';
import { PremiereProBridge } from '../../bridge/index.js';
import { PremiereProTools } from '../../tools/index.js';

jest.mock('../../bridge/index.js');

describe('export and QC utility tools', () => {
  let tools: PremiereProTools;
  let mockBridge: jest.Mocked<PremiereProBridge>;

  beforeEach(() => {
    mockBridge = new PremiereProBridge() as jest.Mocked<PremiereProBridge>;
    tools = new PremiereProTools(mockBridge);
    jest.clearAllMocks();
  });

  it('exposes focused Phase 6 helpers while skipping broad AME encode wrappers', () => {
    const toolNames = tools.getAvailableTools().map((tool) => tool.name);

    expect(toolNames).toEqual(expect.arrayContaining([
      'capture_frame',
      'export_omf',
      'export_frame',
      'export_as_fcp_xml',
      'export_aaf',
      'qc_rendered_media',
      'list_export_presets'
    ]));
    expect(toolNames).not.toEqual(expect.arrayContaining([
      'encode_file',
      'encode_project_item',
      'execute_extendscript'
    ]));
  });

  it('captures an explicit frame path as base64 image data and preserves it by default', async () => {
    const frameDir = await fs.mkdtemp(join(tmpdir(), 'capture-frame-test-'));
    const framePath = join(frameDir, 'frame.png');
    const frameBytes = Buffer.from('fake png bytes');

    mockBridge.executeScript.mockImplementation(async () => {
      await fs.writeFile(framePath, frameBytes);
      return {
        success: true,
        outputPath: framePath,
        requestedOutputPath: framePath,
        format: 'png',
        exportSignature: 'secondsString_outputBase'
      };
    });

    const result = await tools.executeTool('capture_frame', {
      sequenceId: 'seq-1',
      time: 2.5,
      outputPath: framePath
    });

    expect(result.success).toBe(true);
    expect(result.captured).toBe(true);
    expect(result.sequenceId).toBe('seq-1');
    expect(result.time).toBe(2.5);
    expect(result.mimeType).toBe('image/png');
    expect(result.base64).toBe(frameBytes.toString('base64'));
    expect(result.sizeBytes).toBe(frameBytes.length);
    expect(result.outputPath).toBe(framePath);
    expect(result.deleteAfterRead).toBe(false);
    await expect(fs.stat(framePath)).resolves.toBeDefined();

    const script = mockBridge.executeScript.mock.calls[0][0];
    expect(script).toContain('(function __exportFrame()');
    expect(script).toContain('var payload =');
    expect(script).toContain('__findSequence(payload.sequenceId)');
    expect(script).toContain('qeSequence[methodName](String(timeValue), exportBasePath)');
  });

  it('deletes internally generated temporary frame captures by default', async () => {
    const frameBytes = Buffer.from('temporary png bytes');
    let generatedPath = '';
    mockBridge.executeScript.mockImplementation(async (script: string) => {
      const outputPathMatch = script.match(/"outputPath":"((?:\\\\.|[^"])*)"/);
      if (!outputPathMatch) throw new Error('outputPath literal not found');
      generatedPath = JSON.parse(`"${outputPathMatch[1]}"`);
      await fs.writeFile(generatedPath, frameBytes);
      return {
        success: true,
        outputPath: generatedPath,
        requestedOutputPath: generatedPath,
        format: 'png',
        exportSignature: 'secondsString_outputBase'
      };
    });

    const result = await tools.executeTool('capture_frame', {
      sequenceId: 'seq-1',
      time: 2.5
    });

    expect(result.success).toBe(true);
    expect(result.deleteAfterRead).toBe(true);
    expect(result.deletedAfterRead).toBe(true);
    expect(result.base64).toBe(frameBytes.toString('base64'));
    expect(generatedPath).toContain('premiere-mcp-capture-frame-');
    await expect(fs.stat(generatedPath)).rejects.toThrow();
  });

  it('can keep the captured frame file when deleteAfterRead is false', async () => {
    const frameDir = await fs.mkdtemp(join(tmpdir(), 'capture-frame-keep-test-'));
    const framePath = join(frameDir, 'frame.jpg');

    mockBridge.executeScript.mockImplementation(async () => {
      await fs.writeFile(framePath, Buffer.from('jpg bytes'));
      return {
        success: true,
        outputPath: framePath,
        requestedOutputPath: framePath,
        format: 'jpg',
        exportSignature: 'secondsString_outputBase'
      };
    });

    const result = await tools.executeTool('capture_frame', {
      sequenceId: 'seq-1',
      time: 1,
      outputPath: framePath,
      format: 'jpg',
      deleteAfterRead: false
    });

    expect(result.success).toBe(true);
    expect(result.mimeType).toBe('image/jpeg');
    await expect(fs.stat(framePath)).resolves.toBeDefined();
  });

  it('accepts the lowercase QE output path for an explicit frame path with uppercase extension', async () => {
    const frameDir = await fs.mkdtemp(join(tmpdir(), 'capture-frame-extension-case-test-'));
    const requestedPath = join(frameDir, 'frame.PNG');
    const actualPath = join(frameDir, 'frame.png');
    const frameBytes = Buffer.from('png bytes with lowercase qe extension');

    mockBridge.executeScript.mockImplementation(async () => {
      await fs.writeFile(actualPath, frameBytes);
      return {
        success: true,
        outputPath: actualPath,
        requestedOutputPath: requestedPath,
        format: 'png',
        exportSignature: 'secondsString_outputBase'
      };
    });

    const result = await tools.executeTool('capture_frame', {
      sequenceId: 'seq-1',
      time: 1,
      outputPath: requestedPath,
      format: 'png'
    });

    expect(result.success).toBe(true);
    expect(result.outputPath).toBe(actualPath);
    expect(result.expectedOutputPath).toBe(actualPath);
    expect(result.base64).toBe(frameBytes.toString('base64'));
    expect(result.deleteAfterRead).toBe(false);
  });

  it('refuses to read or delete a stale pre-existing capture output when export freshness is not proven', async () => {
    const frameDir = await fs.mkdtemp(join(tmpdir(), 'capture-frame-stale-test-'));
    const framePath = join(frameDir, 'frame.png');
    const staleBytes = Buffer.from('stale png bytes');
    await fs.writeFile(framePath, staleBytes);
    const beforeStat = await fs.stat(framePath);

    mockBridge.executeScript.mockResolvedValue({
      success: true,
      outputPath: framePath,
      requestedOutputPath: framePath,
      format: 'png',
      exportSignature: 'secondsString_outputBase'
    });

    const result = await tools.executeTool('capture_frame', {
      sequenceId: 'seq-1',
      time: 1,
      outputPath: framePath,
      deleteAfterRead: true
    });

    expect(result.success).toBe(false);
    expect(result.captured).toBe(false);
    expect(result.base64).toBeUndefined();
    expect(result.staleExistingFile).toBe(true);
    expect(result.error).toContain('stale pre-existing frame');
    const script = mockBridge.executeScript.mock.calls[0][0];
    expect(script).toContain('preExportExists');
    expect(script).toContain('staleExistingFile');
    expect(script).toContain('refusing to treat stale existing frame as success');
    const afterStat = await fs.stat(framePath);
    expect(afterStat.size).toBe(beforeStat.size);
    expect(afterStat.mtimeMs).toBe(beforeStat.mtimeMs);
  });

  it('refuses to read or delete a frame path that differs from the requested export target', async () => {
    const frameDir = await fs.mkdtemp(join(tmpdir(), 'capture-frame-mismatch-test-'));
    const expectedPath = join(frameDir, 'expected.png');
    const unexpectedPath = join(frameDir, 'unexpected.png');
    await fs.writeFile(unexpectedPath, Buffer.from('do not read me'));

    mockBridge.executeScript.mockResolvedValue({
      success: true,
      outputPath: unexpectedPath,
      requestedOutputPath: expectedPath,
      format: 'png',
      exportSignature: 'secondsString_outputBase'
    });

    const result = await tools.executeTool('capture_frame', {
      sequenceId: 'seq-1',
      time: 1,
      outputPath: expectedPath,
      deleteAfterRead: true
    });

    expect(result.success).toBe(false);
    expect(result.captured).toBe(false);
    expect(result.base64).toBeUndefined();
    expect(result.error).toContain('unexpected output path');
    expect(result.expectedOutputPath).toBe(expectedPath);
    await expect(fs.stat(unexpectedPath)).resolves.toBeDefined();
  });

  it('embeds capture frame arguments through a serialized payload instead of raw interpolation', async () => {
    const frameDir = await fs.mkdtemp(join(tmpdir(), 'capture-frame-escape-test-'));
    const framePath = join(frameDir, 'frame "quoted".png');
    mockBridge.executeScript.mockResolvedValue({ success: false, error: 'intentional script inspection stop' });

    await tools.executeTool('capture_frame', {
      sequenceId: 'seq-"quoted"',
      time: 1,
      outputPath: framePath
    });

    const script = mockBridge.executeScript.mock.calls[0][0];
    expect(script).toContain('var payload =');
    expect(script).toContain('__findSequence(payload.sequenceId)');
    expect(script).toContain('String(payload.outputPath)');
    expect(script).not.toContain('__findSequence("seq-"quoted"")');
    expect(script).not.toContain(`var requestedOutputPath = "${framePath}"`);
  });

  it('rejects invalid export OMF and capture-frame inputs before bridge execution', async () => {
    const emptySequence = await tools.executeTool('export_omf', { sequenceId: '', outputPath: '/tmp/out.omf' });
    const invalidRate = await tools.executeTool('export_omf', { sequenceId: 'seq-1', outputPath: '/tmp/out.omf', sampleRate: 0 });
    const invalidFormat = await tools.executeTool('export_omf', { sequenceId: 'seq-1', outputPath: '/tmp/out.omf', audioFileFormat: 'mp3' });
    const invalidOmfExtension = await tools.executeTool('export_omf', { sequenceId: 'seq-1', outputPath: '/tmp/out.txt' });
    const invalidFrameTime = await tools.executeTool('capture_frame', { sequenceId: 'seq-1', time: -1 });

    expect(emptySequence.success).toBe(false);
    expect(invalidRate.success).toBe(false);
    expect(invalidFormat.success).toBe(false);
    expect(invalidOmfExtension.success).toBe(false);
    expect(invalidFrameTime.success).toBe(false);
    expect(mockBridge.executeScript).not.toHaveBeenCalled();
  });

  it('dry-runs OMF export by default with host capability diagnostics and no mutation call', async () => {
    mockBridge.executeScript.mockResolvedValue({
      success: true,
      dryRun: true,
      supported: true,
      wouldExport: true
    });

    const result = await tools.executeTool('export_omf', {
      sequenceId: 'seq-1',
      outputPath: '/tmp/out.omf',
      title: 'Audio turnover',
      sampleRate: 48000,
      bitsPerSample: 24,
      audioFileFormat: 'wav'
    });

    expect(result.success).toBe(true);
    const script = mockBridge.executeScript.mock.calls[0][0];
    expect(script).toContain('(function __exportOmf()');
    expect(script).toContain('typeof app.project.exportOMF');
    expect(script).toContain('if (payload.dryRun !== false)');
    expect(script).toContain('audioFileFormatCode');
    expect(script).toContain('wouldExport: true');
  });

  it('verifies OMF output on live execution instead of blindly claiming success', async () => {
    mockBridge.executeScript.mockResolvedValue({
      success: true,
      dryRun: false,
      exported: true,
      outputExists: true,
      sizeBytes: 1234
    });

    const result = await tools.executeTool('export_omf', {
      sequenceId: 'seq-1',
      outputPath: '/tmp/out.omf',
      dryRun: false,
      overwrite: true
    });

    expect(result.success).toBe(true);
    const script = mockBridge.executeScript.mock.calls[0][0];
    expect(script).toContain('"overwrite":true');
    expect(script).toContain('app.project.exportOMF(');
    expect(script).toContain('File(payload.outputPath)');
    expect(script).toContain('outputExists');
    expect(script).toContain('sizeBytes');
    expect(script).not.toContain('outputFile.remove');
    expect(script).not.toContain('app.encoder.encodeFile');
  });

  it('makes standalone frame exports fail closed for stale or empty outputs', async () => {
    mockBridge.executeScript.mockResolvedValue({
      success: false,
      outputExists: true,
      sizeBytes: 0,
      error: 'Frame export returned but no non-empty frame file was created'
    });

    const result = await tools.executeTool('export_frame', {
      sequenceId: 'seq-1',
      time: 1,
      outputPath: '/tmp/out.png',
      format: 'png'
    });

    expect(result.success).toBe(false);
    const script = mockBridge.executeScript.mock.calls[0][0];
    expect(script).toContain('postExportLength > 0');
    expect(script).toContain('sizeBytes');
    expect(script).toContain('staleExistingFile');
    expect(script).toContain('no non-empty frame file was created');
  });

  it('guards overwrite:true OMF verification against stale pre-existing files', async () => {
    mockBridge.executeScript.mockResolvedValue({
      success: false,
      dryRun: false,
      exported: false,
      outputExists: true,
      staleExistingFile: true,
      error: 'exportOMF returned but output path was not modified; refusing to treat stale existing OMF as success'
    });

    const result = await tools.executeTool('export_omf', {
      sequenceId: 'seq-1',
      outputPath: '/tmp/out.omf',
      dryRun: false,
      overwrite: true
    });

    expect(result.success).toBe(false);
    const script = mockBridge.executeScript.mock.calls[0][0];
    expect(script).toContain('preExportExists');
    expect(script).toContain('preExportLength');
    expect(script).toContain('preExportModified');
    expect(script).toContain('modifiedAfterExport');
    expect(script).toContain('sizeChangedAfterExport');
    expect(script).toContain('staleExistingFile');
    expect(script).toContain('refusing to treat stale existing OMF as success');
  });

  it('fails OMF live export before mutation when the target exists and overwrite is not explicit', async () => {
    mockBridge.executeScript.mockResolvedValue({
      success: false,
      dryRun: false,
      exported: false,
      outputExists: true,
      error: 'Output OMF already exists; pass overwrite:true to allow Premiere to replace it.'
    });

    const result = await tools.executeTool('export_omf', {
      sequenceId: 'seq-1',
      outputPath: '/tmp/out.omf',
      dryRun: false
    });

    expect(result.success).toBe(false);
    const script = mockBridge.executeScript.mock.calls[0][0];
    expect(script).toContain('preExportExists && payload.overwrite !== true');
    expect(script).toContain('Output OMF already exists');
    expect(script).not.toContain('outputFile.remove');
  });

  it('verifies FCP XML output existence, freshness, and size before reporting success', async () => {
    mockBridge.executeScript.mockResolvedValue({
      success: false,
      exported: false,
      outputExists: true,
      staleExistingFile: true,
      error: 'exportAsFinalCutProXML returned but output path was not modified'
    });

    const result = await tools.executeTool('export_as_fcp_xml', {
      sequenceId: 'seq-1',
      outputPath: '/tmp/out.xml'
    });

    expect(result.success).toBe(false);
    const script = mockBridge.executeScript.mock.calls[0][0];
    expect(script).toContain('(function __exportAsFcpXml()');
    expect(script).toContain('var payload =');
    expect(script).toContain('File(payload.outputPath)');
    expect(script).toContain('preExportExists');
    expect(script).toContain('sizeBytes');
    expect(script).toContain('staleExistingFile');
    expect(script).toContain('success: verified');
  });

  it('verifies AAF output existence, freshness, and size before reporting success', async () => {
    mockBridge.executeScript.mockResolvedValue({
      success: false,
      exported: false,
      outputExists: false,
      error: 'exportAAF returned but no non-empty AAF file was created'
    });

    const result = await tools.executeTool('export_aaf', {
      sequenceId: 'seq-1',
      outputPath: '/tmp/out.aaf'
    });

    expect(result.success).toBe(false);
    const script = mockBridge.executeScript.mock.calls[0][0];
    expect(script).toContain('(function __exportAaf()');
    expect(script).toContain('var payload =');
    expect(script).toContain('app.project.exportAAF(seq, payload.outputPath');
    expect(script).toContain('File(payload.outputPath)');
    expect(script).toContain('preExportModified');
    expect(script).toContain('sizeChangedAfterExport');
    expect(script).toContain('success: verified');
  });
});
