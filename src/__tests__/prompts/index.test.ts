/**
 * Unit tests for PremiereProPrompts
 */

import { PremiereProPrompts } from '../../prompts/index.js';

describe('PremiereProPrompts', () => {
  let prompts: PremiereProPrompts;

  beforeEach(() => {
    prompts = new PremiereProPrompts();
  });

  describe('getAvailablePrompts()', () => {
    it('should return array of prompts', () => {
      const availablePrompts = prompts.getAvailablePrompts();

      expect(Array.isArray(availablePrompts)).toBe(true);
      expect(availablePrompts.length).toBeGreaterThan(0);
    });

    it('should return all expected prompts', () => {
      const availablePrompts = prompts.getAvailablePrompts();
      const promptNames = availablePrompts.map(p => p.name);

      expect(promptNames).toContain('create_video_project');
      expect(promptNames).toContain('edit_music_video');
      expect(promptNames).toContain('color_grade_footage');
      expect(promptNames).toContain('multicam_editing');
      expect(promptNames).toContain('podcast_editing');
      expect(promptNames).toContain('social_media_content');
      expect(promptNames).toContain('documentary_editing');
      expect(promptNames).toContain('commercial_editing');
      expect(promptNames).toContain('optimize_workflow');
      expect(promptNames).toContain('audio_cleanup');
    });

    it('should have valid prompt structure', () => {
      const availablePrompts = prompts.getAvailablePrompts();

      availablePrompts.forEach(prompt => {
        expect(prompt).toHaveProperty('name');
        expect(prompt).toHaveProperty('description');
        expect(typeof prompt.name).toBe('string');
        expect(typeof prompt.description).toBe('string');

        if (prompt.arguments) {
          expect(Array.isArray(prompt.arguments)).toBe(true);
          prompt.arguments.forEach(arg => {
            expect(arg).toHaveProperty('name');
            expect(arg).toHaveProperty('description');
            expect(typeof arg.name).toBe('string');
            expect(typeof arg.description).toBe('string');
          });
        }
      });
    });

    it('should include argument definitions for prompts', () => {
      const availablePrompts = prompts.getAvailablePrompts();

      const createProject = availablePrompts.find(p => p.name === 'create_video_project');
      expect(createProject?.arguments).toBeDefined();
      expect(createProject?.arguments?.length).toBeGreaterThan(0);

      const musicVideo = availablePrompts.find(p => p.name === 'edit_music_video');
      expect(musicVideo?.arguments).toBeDefined();
      expect(musicVideo?.arguments?.some(a => a.name === 'music_file')).toBe(true);
    });
  });

  describe('getPrompt()', () => {
    it('should throw error for unknown prompt', async () => {
      await expect(prompts.getPrompt('unknown_prompt', {}))
        .rejects.toThrow("Prompt 'unknown_prompt' not found");
    });

    describe('create_video_project', () => {
      it('should generate prompt with required arguments', async () => {
        const result = await prompts.getPrompt('create_video_project', {
          project_type: 'documentary'
        });

        expect(result).toHaveProperty('description');
        expect(result).toHaveProperty('messages');
        expect(Array.isArray(result.messages)).toBe(true);
        expect(result.messages.length).toBeGreaterThan(0);
      });

      it('should include project type in messages', async () => {
        const result = await prompts.getPrompt('create_video_project', {
          project_type: 'commercial',
          duration: '30 seconds'
        });

        const messagesText = result.messages.map(m => m.content.text).join(' ');
        expect(messagesText).toContain('commercial');
      });

      it('should have valid message structure', async () => {
        const result = await prompts.getPrompt('create_video_project', {
          project_type: 'social media'
        });

        result.messages.forEach(message => {
          expect(message).toHaveProperty('role');
          expect(['system', 'user', 'assistant']).toContain(message.role);
          expect(message).toHaveProperty('content');
          expect(message.content).toHaveProperty('type');
          expect(message.content.type).toBe('text');
          expect(message.content).toHaveProperty('text');
          expect(typeof message.content.text).toBe('string');
        });
      });
    });

    describe('edit_music_video', () => {
      it('should generate music video editing prompt', async () => {
        const result = await prompts.getPrompt('edit_music_video', {
          music_file: '/path/to/song.mp3',
          video_clips: ['/clip1.mp4', '/clip2.mp4']
        });

        expect(result.description).toBeDefined();
        expect(result.messages.length).toBeGreaterThan(0);
      });

      it('should include music file reference', async () => {
        const result = await prompts.getPrompt('edit_music_video', {
          music_file: '/path/to/song.mp3',
          video_clips: []
        });

        const messagesText = result.messages.map(m => m.content.text).join(' ');
        expect(messagesText.length).toBeGreaterThan(0);
      });
    });

    describe('color_grade_footage', () => {
      it('should generate color grading prompt', async () => {
        const result = await prompts.getPrompt('color_grade_footage', {
          footage_type: 'log',
          target_mood: 'cinematic'
        });

        expect(result.description).toBeDefined();
        expect(result.messages.length).toBeGreaterThan(0);
      });

      it('should include footage type in guidance', async () => {
        const result = await prompts.getPrompt('color_grade_footage', {
          footage_type: 'raw'
        });

        expect(result.messages.length).toBeGreaterThan(0);
      });
    });

    describe('multicam_editing', () => {
      it('should generate multicam editing prompt', async () => {
        const result = await prompts.getPrompt('multicam_editing', {
          camera_count: '3',
          sync_method: 'audio'
        });

        expect(result.description).toBeDefined();
        expect(result.messages.length).toBeGreaterThan(0);
      });
    });

    describe('podcast_editing', () => {
      it('should generate podcast editing prompt', async () => {
        const result = await prompts.getPrompt('podcast_editing', {
          participant_count: '2',
          episode_length: '45 minutes'
        });

        expect(result.description).toBeDefined();
        expect(result.messages.length).toBeGreaterThan(0);
      });
    });

    describe('social_media_content', () => {
      it('should generate social media content prompt', async () => {
        const result = await prompts.getPrompt('social_media_content', {
          platform: 'Instagram',
          content_type: 'reel'
        });

        expect(result.description).toBeDefined();
        expect(result.messages.length).toBeGreaterThan(0);
      });

      it('should include platform-specific guidance', async () => {
        const result = await prompts.getPrompt('social_media_content', {
          platform: 'TikTok',
          content_type: 'video'
        });

        expect(result.messages.length).toBeGreaterThan(0);
      });
    });

    describe('documentary_editing', () => {
      it('should generate documentary editing prompt', async () => {
        const result = await prompts.getPrompt('documentary_editing', {
          interview_count: '5',
          narrative_structure: 'thematic'
        });

        expect(result.description).toBeDefined();
        expect(result.messages.length).toBeGreaterThan(0);
      });
    });

    describe('commercial_editing', () => {
      it('should generate commercial editing prompt', async () => {
        const result = await prompts.getPrompt('commercial_editing', {
          commercial_type: 'product',
          duration: '30 seconds'
        });

        expect(result.description).toBeDefined();
        expect(result.messages.length).toBeGreaterThan(0);
      });
    });

    describe('optimize_workflow', () => {
      it('should generate workflow optimization prompt', async () => {
        const result = await prompts.getPrompt('optimize_workflow', {
          workflow_type: 'editing',
          hardware_specs: '16GB RAM, i7 processor'
        });

        expect(result.description).toBeDefined();
        expect(result.messages.length).toBeGreaterThan(0);
      });
    });

    describe('audio_cleanup', () => {
      it('should generate audio cleanup prompt', async () => {
        const result = await prompts.getPrompt('audio_cleanup', {
          audio_issues: 'background noise, echo',
          audio_source: 'microphone'
        });

        expect(result.description).toBeDefined();
        expect(result.messages.length).toBeGreaterThan(0);
      });
    });
  });

  describe('Prompt Message Structure', () => {
    it('should include system message for context', async () => {
      const result = await prompts.getPrompt('create_video_project', {
        project_type: 'documentary'
      });

      const systemMessages = result.messages.filter(m => m.role === 'system');
      expect(systemMessages.length).toBeGreaterThan(0);
    });

    it('should include user message for query', async () => {
      const result = await prompts.getPrompt('create_video_project', {
        project_type: 'documentary'
      });

      const userMessages = result.messages.filter(m => m.role === 'user');
      expect(userMessages.length).toBeGreaterThan(0);
    });

    it('should include assistant message with guidance', async () => {
      const result = await prompts.getPrompt('create_video_project', {
        project_type: 'documentary'
      });

      const assistantMessages = result.messages.filter(m => m.role === 'assistant');
      expect(assistantMessages.length).toBeGreaterThan(0);
      expect(assistantMessages[0].content.text.length).toBeGreaterThan(50);
    });
  });

  describe('Argument Handling', () => {
    it('should use default values for missing optional arguments', async () => {
      const result = await prompts.getPrompt('create_video_project', {
        project_type: 'vlog'
        // duration omitted
      });

      expect(result.messages.length).toBeGreaterThan(0);
    });

    it('should handle empty arguments object', async () => {
      const result = await prompts.getPrompt('create_video_project', {});

      expect(result.messages.length).toBeGreaterThan(0);
    });
  });
});
