/**
 * Bridge module for communicating with Adobe Premiere Pro
 * 
 * This module handles the communication between the MCP server and Adobe Premiere Pro
 * using various methods including UXP, ExtendScript, and file-based communication.
 */

import { Logger } from '../utils/logger.js';
import { ChildProcess } from 'child_process';
import { promises as fs } from 'fs';
import { join } from 'path';
// import { tmpdir } from 'os';
import { v4 as uuidv4 } from 'uuid';

export interface PremiereProProject {
  id: string;
  name: string;
  path: string;
  isOpen: boolean;
  sequences: PremiereProSequence[];
  projectItems: PremiereProProjectItem[];
}

export interface PremiereProSequence {
  id: string;
  name: string;
  duration: number;
  frameRate: number;
  videoTracks: PremiereProTrack[];
  audioTracks: PremiereProTrack[];
}

export interface PremiereProTrack {
  id: string;
  name: string;
  type: 'video' | 'audio';
  clips: PremiereProClip[];
}

export interface PremiereProClip {
  id: string;
  name: string;
  inPoint: number;
  outPoint: number;
  duration: number;
  mediaPath?: string;
}

export interface PremiereProProjectItem {
  id: string;
  name: string;
  type: 'footage' | 'sequence' | 'bin';
  mediaPath?: string;
  duration?: number;
  frameRate?: number;
}

export interface PremiereProEffect {
  id: string;
  name: string;
  category: string;
  parameters: Record<string, any>;
}

export class PremiereProBridge {
  private logger: Logger;
  private communicationMethod: 'uxp' | 'extendscript' | 'file';
  private tempDir: string;
  private uxpProcess?: ChildProcess;
  private isInitialized = false;

  constructor() {
    this.logger = new Logger('PremiereProBridge');
    this.communicationMethod = 'file'; // Default to file-based communication
    // Use a fixed location so the CEP panel can watch the same folder
    this.tempDir = '/tmp/premiere-bridge';
  }

  async initialize(): Promise<void> {
    try {
      await this.setupTempDirectory();
      await this.detectPremiereProInstallation();
      await this.initializeCommunication();
      this.isInitialized = true;
      this.logger.info('Adobe Premiere Pro bridge initialized successfully');
    } catch (error) {
      this.logger.error('Failed to initialize Adobe Premiere Pro bridge:', error);
      throw error;
    }
  }

  private async setupTempDirectory(): Promise<void> {
    try {
      await fs.mkdir(this.tempDir, { recursive: true });
      this.logger.debug(`Temp directory created: ${this.tempDir}`);
    } catch (error) {
      this.logger.error('Failed to create temp directory:', error);
      throw error;
    }
  }

  private async detectPremiereProInstallation(): Promise<void> {
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
      } catch (error) {
        // Continue checking other paths
      }
    }

    this.logger.warn('Adobe Premiere Pro installation not found in common paths');
  }

  private async initializeCommunication(): Promise<void> {
    // For now, we'll use file-based communication as it's the most reliable
    // In a production environment, you would set up UXP or ExtendScript communication
    this.communicationMethod = 'file';
    this.logger.info(`Using ${this.communicationMethod} communication method`);
  }

  async executeScript(script: string): Promise<any> {
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
      await fs.unlink(commandFile).catch(() => {});
      await fs.unlink(responseFile).catch(() => {});

      return response;
    } catch (error) {
      this.logger.error(`Failed to execute script: ${error}`);
      throw error;
    }
  }

  private async waitForResponse(responseFile: string, timeout = 30000): Promise<any> {
    const startTime = Date.now();
    
    while (Date.now() - startTime < timeout) {
      try {
        const response = await fs.readFile(responseFile, 'utf8');
        return JSON.parse(response);
      } catch (error) {
        // File doesn't exist yet, wait a bit
        await new Promise(resolve => setTimeout(resolve, 100));
      }
    }
    
    throw new Error('Response timeout');
  }

  // Project Management
  async createProject(name: string, location: string): Promise<PremiereProProject> {
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

  async openProject(path: string): Promise<PremiereProProject> {
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

  async saveProject(): Promise<void> {
    const script = `
      // Save current project
      app.project.save();
      JSON.stringify({ success: true });
    `;
    
    await this.executeScript(script);
  }

  async importMedia(filePath: string): Promise<PremiereProProjectItem> {
    const script = `
      // Import media file
      var file = new File("${filePath}");
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

  async createSequence(name: string, presetPath?: string): Promise<PremiereProSequence> {
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

  async addToTimeline(sequenceId: string, projectItemId: string, trackIndex: number, time: number): Promise<PremiereProClip> {
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

  async renderSequence(sequenceId: string, outputPath: string, presetPath: string): Promise<void> {
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

  async listProjectItems(): Promise<PremiereProProjectItem[]> {
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
    if (result.ok) return result.items;
    throw new Error(result.error || 'Unknown error listing project items');
  }

  async cleanup(): Promise<void> {
    if (this.uxpProcess) {
      this.uxpProcess.kill();
    }
    
    // Clean up temp directory
    try {
      await fs.rm(this.tempDir, { recursive: true });
    } catch (error) {
      this.logger.warn('Failed to clean up temp directory:', error);
    }
    
    this.logger.info('Adobe Premiere Pro bridge cleaned up');
  }
} 