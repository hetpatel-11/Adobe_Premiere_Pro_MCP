/**
 * Bridge module for communicating with Adobe Premiere Pro
 *
 * This module handles the communication between the MCP server and Adobe Premiere Pro
 * using various methods including UXP, ExtendScript, and file-based communication.
 */
import { Logger } from '../utils/logger.js';
import { promises as fs } from 'fs';
import { join } from 'path';
import { v4 as uuidv4 } from 'uuid';
import { createSecureTempDir, validateFilePath, sanitizeInput } from '../utils/security.js';
export class PremiereProBridge {
    logger;
    communicationMethod;
    tempDir;
    uxpProcess;
    isInitialized = false;
    sessionId;
    constructor() {
        this.logger = new Logger('PremiereProBridge');
        this.communicationMethod = 'file'; // Default to file-based communication
        this.sessionId = uuidv4();
        // Use session-specific secure temp directory
        this.tempDir = createSecureTempDir(this.sessionId);
    }
    async initialize() {
        try {
            await this.setupTempDirectory();
            await this.detectPremiereProInstallation();
            await this.initializeCommunication();
            this.isInitialized = true;
            this.logger.info('Adobe Premiere Pro bridge initialized successfully');
        }
        catch (error) {
            this.logger.error('Failed to initialize Adobe Premiere Pro bridge:', error);
            throw error;
        }
    }
    async setupTempDirectory() {
        try {
            await fs.mkdir(this.tempDir, { recursive: true, mode: 0o700 }); // Restrict to owner only
            this.logger.debug(`Secure temp directory created: ${this.tempDir}`);
        }
        catch (error) {
            this.logger.error('Failed to create temp directory:', error);
            throw error;
        }
    }
    async detectPremiereProInstallation() {
        // Check for common Premiere Pro installation paths
        const commonPaths = [
            '/Applications/Adobe Premiere Pro 2024/Adobe Premiere Pro 2024.app',
            '/Applications/Adobe Premiere Pro 2023/Adobe Premiere Pro 2023.app',
            'C:\\Program Files\\Adobe\\Adobe Premiere Pro 2024\\Adobe Premiere Pro.exe',
            'C:\\Program Files\\Adobe\\Adobe Premiere Pro 2023\\Adobe Premiere Pro.exe'
        ];
        for (const path of commonPaths) {
            try {
                await fs.access(path);
                this.logger.info(`Found Adobe Premiere Pro at: ${path}`);
                return;
            }
            catch (error) {
                // Continue checking other paths
            }
        }
        this.logger.warn('Adobe Premiere Pro installation not found in common paths');
    }
    async initializeCommunication() {
        // For now, we'll use file-based communication as it's the most reliable
        // In a production environment, you would set up UXP or ExtendScript communication
        this.communicationMethod = 'file';
        this.logger.info(`Using ${this.communicationMethod} communication method`);
    }
    async executeScript(script) {
        if (!this.isInitialized) {
            throw new Error('Bridge not initialized. Call initialize() first.');
        }
        const commandId = uuidv4();
        const commandFile = join(this.tempDir, `command-${commandId}.json`);
        const responseFile = join(this.tempDir, `response-${commandId}.json`);
        try {
            // Write command to file
            await fs.writeFile(commandFile, JSON.stringify({
                id: commandId,
                script,
                timestamp: new Date().toISOString()
            }));
            // Wait for response (in a real implementation, this would be handled by the UXP plugin)
            const response = await this.waitForResponse(responseFile);
            // Clean up files
            await fs.unlink(commandFile).catch(() => { });
            await fs.unlink(responseFile).catch(() => { });
            return response;
        }
        catch (error) {
            this.logger.error(`Failed to execute script: ${error}`);
            throw error;
        }
    }
    async waitForResponse(responseFile, timeout = 30000) {
        const startTime = Date.now();
        while (Date.now() - startTime < timeout) {
            try {
                const response = await fs.readFile(responseFile, 'utf8');
                return JSON.parse(response);
            }
            catch (error) {
                // File doesn't exist yet, wait a bit
                await new Promise(resolve => setTimeout(resolve, 100));
            }
        }
        throw new Error('Response timeout');
    }
    // Project Management
    async createProject(name, location) {
        const script = `
      // Create new project
      app.newProject("${name}", "${location}");
      var project = app.project;
      
      // Return project info
      JSON.stringify({
        id: project.documentID,
        name: project.name,
        path: project.path,
        isOpen: true,
        sequences: [],
        projectItems: []
      });
    `;
        return await this.executeScript(script);
    }
    async openProject(path) {
        const script = `
      // Open existing project
      app.openDocument("${path}");
      var project = app.project;
      
      // Return project info
      JSON.stringify({
        id: project.documentID,
        name: project.name,
        path: project.path,
        isOpen: true,
        sequences: [],
        projectItems: []
      });
    `;
        return await this.executeScript(script);
    }
    async saveProject() {
        const script = `
      // Save current project
      app.project.save();
      JSON.stringify({ success: true });
    `;
        await this.executeScript(script);
    }
    async importMedia(filePath) {
        // Validate file path for security
        const pathValidation = validateFilePath(filePath);
        if (!pathValidation.valid) {
            throw new Error(`Invalid file path: ${pathValidation.error}`);
        }
        const safePath = sanitizeInput(filePath);
        const script = `
      // Import media file
      var file = new File(${JSON.stringify(safePath)});
      var importedItem = app.project.importFiles([file.fsName]);

      // Return imported item info
      JSON.stringify({
        id: importedItem.nodeId,
        name: importedItem.name,
        type: importedItem.type,
        mediaPath: importedItem.getMediaPath(),
        duration: importedItem.getOutPoint() - importedItem.getInPoint(),
        frameRate: importedItem.getVideoFrameRate()
      });
    `;
        return await this.executeScript(script);
    }
    async createSequence(name, presetPath) {
        const script = `
      // Create new sequence
      var sequence = app.project.createNewSequence("${name}", "${presetPath || ''}");
      
      // Return sequence info
      JSON.stringify({
        id: sequence.sequenceID,
        name: sequence.name,
        duration: sequence.end - sequence.zeroPoint,
        frameRate: sequence.framerate,
        videoTracks: [],
        audioTracks: []
      });
    `;
        return await this.executeScript(script);
    }
    async addToTimeline(sequenceId, projectItemId, trackIndex, time) {
        const script = `
      // Add item to timeline
      var sequence = app.project.getSequenceByID("${sequenceId}");
      var projectItem = app.project.getProjectItemByID("${projectItemId}");
      var track = sequence.videoTracks[${trackIndex}];
      
      var clip = track.insertClip(projectItem, ${time});
      
      // Return clip info
      JSON.stringify({
        id: clip.clipID,
        name: clip.name,
        inPoint: clip.start,
        outPoint: clip.end,
        duration: clip.duration,
        mediaPath: clip.projectItem.getMediaPath()
      });
    `;
        return await this.executeScript(script);
    }
    async renderSequence(sequenceId, outputPath, presetPath) {
        const script = `
      // Render sequence
      var sequence = app.project.getSequenceByID("${sequenceId}");
      var encoder = app.encoder;
      
      encoder.encodeSequence(sequence, "${outputPath}", "${presetPath}", 
        encoder.ENCODE_ENTIRE, false);
      
      JSON.stringify({ success: true });
    `;
        await this.executeScript(script);
    }
    async listProjectItems() {
        const script = `
      try {
        if (!app.project || !app.project.rootItem) {
          throw new Error('No open project');
        }
        function walk(item) {
          var results = [];
          if (item.type === ProjectItemType.BIN) {
            for (var i = 0; i < item.children.numItems; i++) {
              results = results.concat(walk(item.children[i]));
            }
          } else {
            results.push({
              id: item.nodeId || item.treePath || item.name,
              name: item.name,
              type: item.type === ProjectItemType.BIN ? 'bin' : (item.type === ProjectItemType.SEQUENCE ? 'sequence' : 'footage'),
              mediaPath: item.getMediaPath ? item.getMediaPath() : undefined,
              duration: item.getOutPoint ? (item.getOutPoint() - item.getInPoint()) : undefined,
              frameRate: item.getVideoFrameRate ? item.getVideoFrameRate() : undefined
            });
          }
          return results;
        }
        var items = walk(app.project.rootItem);
        JSON.stringify({ ok: true, items });
      } catch (e) {
        JSON.stringify({ ok: false, error: String(e) });
      }
    `;
        const result = await this.executeScript(script);
        if (result.ok)
            return result.items;
        throw new Error(result.error || 'Unknown error listing project items');
    }
    async cleanup() {
        if (this.uxpProcess) {
            this.uxpProcess.kill();
        }
        // Clean up temp directory
        try {
            await fs.rm(this.tempDir, { recursive: true });
        }
        catch (error) {
            this.logger.warn('Failed to clean up temp directory:', error);
        }
        this.logger.info('Adobe Premiere Pro bridge cleaned up');
    }
}
//# sourceMappingURL=index.js.map