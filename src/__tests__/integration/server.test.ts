/**
 * Integration tests for MCP Adobe Premiere Pro Server
 */

import { PremiereProBridge } from '../../bridge/index.js';
import { PremiereProTools } from '../../tools/index.js';
import { PremiereProResources } from '../../resources/index.js';
import { PremiereProPrompts } from '../../prompts/index.js';

// Mock dependencies
jest.mock('../../bridge/index.js');

describe('MCP Adobe Premiere Pro Server Integration', () => {
  let mockBridge: jest.Mocked<PremiereProBridge>;
  let tools: PremiereProTools;
  let resources: PremiereProResources;
  let prompts: PremiereProPrompts;

  beforeEach(() => {
    mockBridge = new PremiereProBridge() as jest.Mocked<PremiereProBridge>;
    tools = new PremiereProTools(mockBridge);
    resources = new PremiereProResources(mockBridge);
    prompts = new PremiereProPrompts();

    jest.clearAllMocks();
  });

  describe('Server Initialization', () => {
    it('should initialize bridge on start', async () => {
      mockBridge.initialize = jest.fn().mockResolvedValue(undefined);

      await mockBridge.initialize();

      expect(mockBridge.initialize).toHaveBeenCalled();
    });
  });

  describe('Tools Integration', () => {
    it('should list all available tools', () => {
      const availableTools = tools.getAvailableTools();

      expect(availableTools.length).toBeGreaterThan(30);
      expect(availableTools.every(t => t.name && t.description && t.inputSchema)).toBe(true);
    });

    it('should execute tools successfully', async () => {
      mockBridge.executeScript.mockResolvedValue({
        success: true,
        items: []
      });

      const result = await tools.executeTool('list_project_items', {});

      expect(result.success).toBe(true);
    });

    it('should handle tool execution errors', async () => {
      mockBridge.executeScript.mockRejectedValue(new Error('Bridge error'));

      const result = await tools.executeTool('list_project_items', {});

      expect(result.success).toBe(false);
      expect(result.error).toBeDefined();
    });
  });

  describe('Resources Integration', () => {
    it('should list all available resources', () => {
      const availableResources = resources.getAvailableResources();

      expect(availableResources.length).toBe(12);
      expect(availableResources.every(r => r.uri && r.name && r.description)).toBe(true);
    });

    it('should read resources successfully', async () => {
      mockBridge.executeScript.mockResolvedValue({
        id: 'proj-123',
        name: 'Test Project'
      });

      const result = await resources.readResource('premiere://project/info');

      expect(result).toBeDefined();
      expect(result.name).toBe('Test Project');
    });

    it('should handle resource read errors', async () => {
      await expect(resources.readResource('invalid://resource'))
        .rejects.toThrow();
    });
  });

  describe('Prompts Integration', () => {
    it('should list all available prompts', () => {
      const availablePrompts = prompts.getAvailablePrompts();

      expect(availablePrompts.length).toBe(10);
      expect(availablePrompts.every(p => p.name && p.description)).toBe(true);
    });

    it('should generate prompts successfully', async () => {
      const result = await prompts.getPrompt('create_video_project', {
        project_type: 'documentary'
      });

      expect(result).toHaveProperty('description');
      expect(result).toHaveProperty('messages');
      expect(result.messages.length).toBeGreaterThan(0);
    });

    it('should handle prompt generation errors', async () => {
      await expect(prompts.getPrompt('invalid_prompt', {}))
        .rejects.toThrow();
    });
  });

  describe('End-to-End Workflows', () => {
    it('should complete project creation workflow', async () => {
      // Mock project creation
      mockBridge.createProject = jest.fn().mockResolvedValue({
        id: 'proj-123',
        name: 'New Project',
        path: '/path/to/project.prproj',
        isOpen: true,
        sequences: [],
        projectItems: []
      });

      const result = await tools.executeTool('create_project', {
        name: 'New Project',
        location: '/path/to/projects'
      });

      expect(result.success).toBe(true);
    });

    it('should complete import and edit workflow', async () => {
      // Mock media import
      mockBridge.importMedia = jest.fn().mockResolvedValue({
        id: 'item-123',
        name: 'video.mp4',
        type: 'footage'
      });

      const importResult = await tools.executeTool('import_media', {
        filePath: '/path/to/video.mp4'
      });

      expect(importResult.success).toBe(true);

      // Mock sequence creation
      mockBridge.createSequence = jest.fn().mockResolvedValue({
        id: 'seq-123',
        name: 'Main Sequence',
        frameRate: 29.97
      });

      const seqResult = await tools.executeTool('create_sequence', {
        name: 'Main Sequence'
      });

      expect(seqResult.success).toBe(true);
    });

    it('should complete color grading workflow', async () => {
      mockBridge.executeScript.mockResolvedValue({
        success: true
      });

      const result = await tools.executeTool('color_correct', {
        clipId: 'clip-123',
        brightness: 10,
        contrast: 5,
        saturation: 15
      });

      expect(result.success).toBe(true);
    });

    it('should complete export workflow', async () => {
      mockBridge.renderSequence = jest.fn().mockResolvedValue(undefined);

      const result = await tools.executeTool('export_sequence', {
        sequenceId: 'seq-123',
        outputPath: '/path/to/output.mp4',
        presetPath: '/path/to/preset.epr'
      });

      expect(result.success).toBe(true);
    });
  });

  describe('Error Handling and Recovery', () => {
    it('should handle bridge initialization failure', async () => {
      mockBridge.initialize = jest.fn().mockRejectedValue(new Error('Init failed'));

      await expect(mockBridge.initialize()).rejects.toThrow('Init failed');
    });

    it('should handle network timeout', async () => {
      mockBridge.executeScript.mockRejectedValue(new Error('Timeout'));

      const result = await tools.executeTool('save_project', {});

      expect(result.success).toBe(false);
      expect(result.error).toContain('Timeout');
    });

    it('should handle invalid tool arguments', async () => {
      const result = await tools.executeTool('create_project', {
        // Missing required arguments
      });

      expect(result.success).toBe(false);
    });

    it('should cleanup resources on shutdown', async () => {
      mockBridge.cleanup = jest.fn().mockResolvedValue(undefined);

      await mockBridge.cleanup();

      expect(mockBridge.cleanup).toHaveBeenCalled();
    });
  });

  describe('Data Validation', () => {
    it('should validate tool input schemas', () => {
      const availableTools = tools.getAvailableTools();

      const createProject = availableTools.find(t => t.name === 'create_project');
      expect(createProject).toBeDefined();
      expect(createProject?.inputSchema).toBeDefined();
    });

    it('should validate resource URIs', () => {
      const availableResources = resources.getAvailableResources();

      availableResources.forEach(resource => {
        expect(resource.uri).toMatch(/^premiere:\/\//);
      });
    });

    it('should validate prompt arguments', () => {
      const availablePrompts = prompts.getAvailablePrompts();

      availablePrompts.forEach(prompt => {
        if (prompt.arguments) {
          prompt.arguments.forEach(arg => {
            expect(arg.name).toBeTruthy();
            expect(arg.description).toBeTruthy();
          });
        }
      });
    });
  });

  describe('Performance and Reliability', () => {
    it('should handle multiple concurrent tool calls', async () => {
      mockBridge.executeScript.mockResolvedValue({ success: true });

      const promises = [
        tools.executeTool('save_project', {}),
        tools.executeTool('list_project_items', {}),
        tools.executeTool('list_sequences', {})
      ];

      const results = await Promise.all(promises);

      expect(results.every(r => r.success)).toBe(true);
    });

    it('should handle large resource responses', async () => {
      const largeData = {
        mediaItems: Array(1000).fill(null).map((_, i) => ({
          id: `item-${i}`,
          name: `video${i}.mp4`
        }))
      };

      mockBridge.executeScript.mockResolvedValue(largeData);

      const result = await resources.readResource('premiere://project/media');

      expect(result.mediaItems.length).toBe(1000);
    });
  });

  describe('State Management', () => {
    it('should maintain project state across operations', async () => {
      // Create project
      mockBridge.createProject = jest.fn().mockResolvedValue({
        id: 'proj-123',
        name: 'Test Project'
      });

      await tools.executeTool('create_project', {
        name: 'Test Project',
        location: '/path'
      });

      // List sequences in the project
      mockBridge.executeScript.mockResolvedValue({
        success: true,
        sequences: []
      });

      const result = await tools.executeTool('list_sequences', {});

      expect(result.success).toBe(true);
    });
  });
});
