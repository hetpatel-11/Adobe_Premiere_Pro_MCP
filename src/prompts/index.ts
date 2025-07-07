/**
 * MCP Prompts for Adobe Premiere Pro
 * 
 * This module provides templated prompts for common video editing workflows
 * that can be used by AI agents to guide users through complex operations.
 */

import { Logger } from '../utils/logger.js';

export interface MCPPrompt {
  name: string;
  description: string;
  arguments?: Array<{
    name: string;
    description: string;
    required?: boolean;
  }>;
}

export interface PromptMessage {
  role: 'system' | 'user' | 'assistant';
  content: {
    type: 'text';
    text: string;
  };
}

export interface GeneratedPrompt {
  description: string;
  messages: PromptMessage[];
}

export class PremiereProPrompts {
  private logger: Logger;

  constructor() {
    this.logger = new Logger('PremiereProPrompts');
  }

  getAvailablePrompts(): MCPPrompt[] {
    return [
      {
        name: 'create_video_project',
        description: 'Guide to create a new video project from scratch',
        arguments: [
          {
            name: 'project_type',
            description: 'Type of video project (e.g., "social media", "documentary", "commercial")',
            required: true
          },
          {
            name: 'duration',
            description: 'Expected duration of the final video',
            required: false
          }
        ]
      },
      {
        name: 'edit_music_video',
        description: 'Workflow for editing a music video with beat synchronization',
        arguments: [
          {
            name: 'music_file',
            description: 'Path to the music file',
            required: true
          },
          {
            name: 'video_clips',
            description: 'List of video clip paths',
            required: true
          }
        ]
      },
      {
        name: 'color_grade_footage',
        description: 'Step-by-step color grading workflow',
        arguments: [
          {
            name: 'footage_type',
            description: 'Type of footage (e.g., "log", "standard", "raw")',
            required: true
          },
          {
            name: 'target_mood',
            description: 'Desired mood or look (e.g., "cinematic", "vibrant", "moody")',
            required: false
          }
        ]
      },
      {
        name: 'multicam_editing',
        description: 'Guide for multicam editing workflow',
        arguments: [
          {
            name: 'camera_count',
            description: 'Number of camera angles',
            required: true
          },
          {
            name: 'sync_method',
            description: 'Method for syncing cameras (timecode, audio, markers)',
            required: true
          }
        ]
      },
      {
        name: 'podcast_editing',
        description: 'Workflow for editing podcast episodes',
        arguments: [
          {
            name: 'participant_count',
            description: 'Number of participants in the podcast',
            required: true
          },
          {
            name: 'episode_length',
            description: 'Target length of the episode',
            required: false
          }
        ]
      },
      {
        name: 'social_media_content',
        description: 'Create content optimized for social media platforms',
        arguments: [
          {
            name: 'platform',
            description: 'Target platform (Instagram, TikTok, YouTube, etc.)',
            required: true
          },
          {
            name: 'content_type',
            description: 'Type of content (story, post, reel, etc.)',
            required: true
          }
        ]
      },
      {
        name: 'documentary_editing',
        description: 'Workflow for documentary film editing',
        arguments: [
          {
            name: 'interview_count',
            description: 'Number of interview subjects',
            required: true
          },
          {
            name: 'narrative_structure',
            description: 'Narrative structure (chronological, thematic, etc.)',
            required: false
          }
        ]
      },
      {
        name: 'commercial_editing',
        description: 'Guide for editing commercial advertisements',
        arguments: [
          {
            name: 'commercial_length',
            description: 'Length of the commercial (15s, 30s, 60s, etc.)',
            required: true
          },
          {
            name: 'product_type',
            description: 'Type of product being advertised',
            required: false
          }
        ]
      },
      {
        name: 'optimize_workflow',
        description: 'Tips for optimizing Premiere Pro workflow and performance',
        arguments: [
          {
            name: 'project_size',
            description: 'Size of the project (small, medium, large)',
            required: true
          },
          {
            name: 'hardware_specs',
            description: 'Hardware specifications',
            required: false
          }
        ]
      },
      {
        name: 'audio_cleanup',
        description: 'Guide for cleaning up and enhancing audio',
        arguments: [
          {
            name: 'audio_issues',
            description: 'Specific audio issues to address',
            required: true
          },
          {
            name: 'audio_source',
            description: 'Source of the audio (microphone, phone, etc.)',
            required: false
          }
        ]
      }
    ];
  }

  async getPrompt(name: string, args: Record<string, any>): Promise<GeneratedPrompt> {
    this.logger.info(`Generating prompt: ${name}`);
    
    switch (name) {
      case 'create_video_project':
        return this.createVideoProjectPrompt(args);
      
      case 'edit_music_video':
        return this.editMusicVideoPrompt(args);
      
      case 'color_grade_footage':
        return this.colorGradeFootagePrompt(args);
      
      case 'multicam_editing':
        return this.multicamEditingPrompt(args);
      
      case 'podcast_editing':
        return this.podcastEditingPrompt(args);
      
      case 'social_media_content':
        return this.socialMediaContentPrompt(args);
      
      case 'documentary_editing':
        return this.documentaryEditingPrompt(args);
      
      case 'commercial_editing':
        return this.commercialEditingPrompt(args);
      
      case 'optimize_workflow':
        return this.optimizeWorkflowPrompt(args);
      
      case 'audio_cleanup':
        return this.audioCleanupPrompt(args);
      
      default:
        throw new Error(`Prompt '${name}' not found`);
    }
  }

  private createVideoProjectPrompt(args: Record<string, any>): GeneratedPrompt {
    const projectType = args.project_type || 'general';
    const duration = args.duration || 'unspecified';
    
    return {
      description: `Guide for creating a ${projectType} video project`,
      messages: [
        {
          role: 'system',
          content: {
            type: 'text',
            text: `You are an expert video editor helping someone create a ${projectType} video project in Adobe Premiere Pro. Provide step-by-step guidance that is specific to their project type and requirements.`
          }
        },
        {
          role: 'user',
          content: {
            type: 'text',
            text: `I want to create a ${projectType} video project${duration !== 'unspecified' ? ` that's ${duration} long` : ''}. Can you guide me through the process step by step?`
          }
        },
        {
          role: 'assistant',
          content: {
            type: 'text',
            text: `I'll help you create a ${projectType} video project. Here's a step-by-step workflow:

1. **Project Setup**
   - Create a new project with appropriate settings for ${projectType}
   - Set up your project folder structure
   - Configure sequence settings for your target format

2. **Import and Organize**
   - Import your media files
   - Create bins to organize your footage
   - Review and log your footage

3. **Rough Cut**
   - Create your initial edit
   - Focus on story structure and pacing
   - Add basic transitions

4. **Fine Cut**
   - Refine your edit
   - Add effects and color correction
   - Sync and clean up audio

5. **Final Polish**
   - Add titles and graphics
   - Apply final color grade
   - Mix and master audio

6. **Export**
   - Choose appropriate export settings
   - Render and review final output

Would you like me to help you with any specific step?`
          }
        }
      ]
    };
  }

  private editMusicVideoPrompt(args: Record<string, any>): GeneratedPrompt {
    const musicFile = args.music_file || 'your music track';
    const videoClips = args.video_clips || 'your video clips';
    
    return {
      description: 'Workflow for editing a music video with beat synchronization',
      messages: [
        {
          role: 'system',
          content: {
            type: 'text',
            text: 'You are a music video editor expert. Help the user create a compelling music video that syncs with the beat and tells a visual story.'
          }
        },
        {
          role: 'user',
          content: {
            type: 'text',
            text: `I want to edit a music video using ${musicFile} and ${videoClips}. How should I approach this?`
          }
        },
        {
          role: 'assistant',
          content: {
            type: 'text',
            text: `Here's a comprehensive workflow for editing your music video:

1. **Preparation**
   - Import your music track and video clips
   - Create a new sequence matching your footage specs
   - Place the music track on the timeline first

2. **Beat Mapping**
   - Listen to the music and mark beats with markers
   - Identify song structure (intro, verse, chorus, bridge, outro)
   - Note any tempo changes or key moments

3. **Rough Assembly**
   - Lay out video clips roughly matching the song structure
   - Don't worry about perfect sync yet
   - Focus on the overall flow and energy

4. **Beat Synchronization**
   - Cut video clips to match the beat
   - Use quick cuts during high-energy sections
   - Longer shots during verses or quieter moments
   - Sync key visual moments with musical accents

5. **Visual Enhancement**
   - Add effects that complement the music genre
   - Use color grading to match the mood
   - Consider speed ramping for dramatic effect

6. **Final Touches**
   - Add any text or graphics
   - Fine-tune the timing
   - Export with high-quality settings

Tools to use:
- Beat detection (if available)
- Multicam editing for multiple angles
- Speed/Duration effects
- Color correction and grading

Would you like detailed help with any of these steps?`
          }
        }
      ]
    };
  }

  private colorGradeFootagePrompt(args: Record<string, any>): GeneratedPrompt {
    const footageType = args.footage_type || 'standard';
    const targetMood = args.target_mood || 'natural';
    
    return {
      description: 'Step-by-step color grading workflow',
      messages: [
        {
          role: 'system',
          content: {
            type: 'text',
            text: 'You are a professional colorist. Guide the user through a comprehensive color grading workflow that will enhance their footage and achieve their desired look.'
          }
        },
        {
          role: 'user',
          content: {
            type: 'text',
            text: `I have ${footageType} footage and want to achieve a ${targetMood} look. Can you guide me through the color grading process?`
          }
        },
        {
          role: 'assistant',
          content: {
            type: 'text',
            text: `Here's a professional color grading workflow for your ${footageType} footage:

1. **Preparation**
   - Apply Lumetri Color effect to your clips
   - Set up reference monitors if available
   - Create adjustment layers for consistent grading

2. **Primary Correction** (Fix first)
   - Balance exposure (lift shadows, reduce highlights)
   - Correct white balance
   - Adjust contrast and saturation
   - Fix any technical issues

3. **Secondary Correction** (Enhance)
   - Isolate and adjust specific colors
   - Enhance skin tones
   - Adjust specific areas with masks
   - Match shots for consistency

4. **Creative Grading** (${targetMood} look)
   ${this.getColorGradingTips(targetMood)}

5. **Final Polish**
   - Add subtle vignetting if appropriate
   - Fine-tune highlights and shadows
   - Check consistency across all shots
   - Export with proper color space

${footageType === 'log' ? `
**LOG Footage Specific Tips:**
- Apply a LUT as starting point
- Work in the correct color space
- Don't over-correct in the first pass
- Use exposure before gain
` : ''}

Tools to use:
- Lumetri Color panel
- Lumetri Scopes (Vectorscope, Waveform, Histogram)
- Color wheels and curves
- HSL Secondary adjustments

Would you like specific guidance for any step?`
          }
        }
      ]
    };
  }

  private multicamEditingPrompt(args: Record<string, any>): GeneratedPrompt {
    const cameraCount = args.camera_count || 'multiple';
    const syncMethod = args.sync_method || 'audio';
    
    return {
      description: 'Guide for multicam editing workflow',
      messages: [
        {
          role: 'system',
          content: {
            type: 'text',
            text: 'You are a multicam editing specialist. Help the user efficiently edit multicam footage with proper synchronization and smooth angle switching.'
          }
        },
        {
          role: 'user',
          content: {
            type: 'text',
            text: `I have ${cameraCount} cameras and want to sync them using ${syncMethod}. How do I set up multicam editing?`
          }
        },
        {
          role: 'assistant',
          content: {
            type: 'text',
            text: `Here's a complete multicam editing workflow:

1. **Preparation**
   - Import all camera angles
   - Organize footage by camera in separate bins
   - Check that all footage has ${syncMethod === 'timecode' ? 'matching timecode' : syncMethod === 'audio' ? 'clear audio' : 'visible markers'}

2. **Create Multicam Source**
   - Select all camera angles
   - Right-click and choose "Create Multi-Camera Source Sequence"
   - Choose "${syncMethod}" as sync method
   - Set camera angle assembly order

3. **Sync Settings**
   ${this.getMulticamSyncTips(syncMethod)}

4. **Create Multicam Sequence**
   - Create new sequence from multicam source
   - Set Program Monitor to Multi-Camera view
   - Enable multicam audio if needed

5. **Editing Workflow**
   - Use keyboard shortcuts (1-9) to switch angles
   - Cut first, then switch angles for efficiency
   - Use multicam blade tool for precise cuts
   - Monitor audio levels across all angles

6. **Fine-tuning**
   - Adjust sync if needed (slip clips)
   - Color match between cameras
   - Fix any audio issues
   - Add smooth transitions between angles

**Keyboard Shortcuts:**
- 1-9: Switch to camera angle
- \\ (backslash): Switch angle and cut
- Shift+1-9: Switch audio only

**Tips:**
- Edit story first, then worry about camera angles
- Use wide shots for establishing, close-ups for emotion
- Avoid rapid angle switching unless intentional
- Monitor audio continuity

Would you like help with any specific aspect of multicam editing?`
          }
        }
      ]
    };
  }

  private podcastEditingPrompt(args: Record<string, any>): GeneratedPrompt {
    const participantCount = args.participant_count || 'multiple';
    const episodeLength = args.episode_length || 'standard';
    
    return {
      description: 'Workflow for editing podcast episodes',
      messages: [
        {
          role: 'system',
          content: {
            type: 'text',
            text: 'You are a podcast production expert. Help the user create a polished podcast episode with clean audio and good pacing.'
          }
        },
        {
          role: 'user',
          content: {
            type: 'text',
            text: `I need to edit a podcast with ${participantCount} participants${episodeLength !== 'standard' ? ` targeting ${episodeLength}` : ''}. What's the best workflow?`
          }
        },
        {
          role: 'assistant',
          content: {
            type: 'text',
            text: `Here's a professional podcast editing workflow:

1. **Setup and Import**
   - Create sequence with audio-focused settings
   - Import all participant tracks
   - Set up audio track layout (one per participant)

2. **Audio Cleanup**
   - Remove background noise with spectral display
   - Apply noise reduction (DeNoise or similar)
   - Remove mouth sounds, coughs, long pauses
   - Normalize audio levels

3. **Content Editing**
   - Remove "um"s, "uh"s, false starts
   - Trim long pauses (leave natural rhythm)
   - Remove tangents or off-topic content
   - Add smooth transitions between segments

4. **Audio Processing**
   - Apply compression for consistent levels
   - Use EQ to enhance voice clarity
   - Add de-esser for harsh S sounds
   - Set proper loudness levels (-16 LUFS for podcasts)

5. **Structure and Flow**
   - Add intro/outro music
   - Insert chapter markers if needed
   - Add sponsor segments or ads
   - Ensure smooth transitions

6. **Final Polish**
   - Check overall pacing and flow
   - Ensure consistent audio levels
   - Add fade-ins/fade-outs
   - Export in appropriate format (MP3, AAC)

**Audio Effects to Use:**
- Audition's Spectral Frequency Display
- Dynamics (Compressor)
- Parametric EQ
- DeNoise
- DeEsser

**Export Settings:**
- Format: MP3 or AAC
- Sample Rate: 44.1 kHz
- Bitrate: 128-192 kbps
- Mono for single speaker, stereo for music

Would you like specific guidance on any of these steps?`
          }
        }
      ]
    };
  }

  private socialMediaContentPrompt(args: Record<string, any>): GeneratedPrompt {
    const platform = args.platform || 'Instagram';
    const contentType = args.content_type || 'post';
    
    return {
      description: `Create ${contentType} content optimized for ${platform}`,
      messages: [
        {
          role: 'system',
          content: {
            type: 'text',
            text: `You are a social media content creator expert. Help the user create engaging ${contentType} content specifically optimized for ${platform}.`
          }
        },
        {
          role: 'user',
          content: {
            type: 'text',
            text: `I want to create ${contentType} content for ${platform}. What are the best practices and technical specs?`
          }
        },
        {
          role: 'assistant',
          content: {
            type: 'text',
            text: `Here's how to create optimized ${contentType} content for ${platform}:

**Technical Specifications:**
${this.getSocialMediaSpecs(platform, contentType)}

**Content Strategy:**
1. **Hook (First 3 seconds)**
   - Start with attention-grabbing visuals
   - Use text overlays for context
   - Create immediate visual interest

2. **Storytelling**
   - Keep it concise and engaging
   - Use visual storytelling techniques
   - Include call-to-action elements

3. **Visual Style**
   - Consistent branding/color scheme
   - High contrast for mobile viewing
   - Large, readable text
   - Eye-catching thumbnails

4. **Editing Techniques**
   - Quick cuts for engagement
   - Smooth transitions
   - Strategic use of effects
   - Captions/subtitles for accessibility

5. **Platform-Specific Tips:**
${this.getPlatformSpecificTips(platform, contentType)}

**Premiere Pro Workflow:**
1. Create sequence with correct specs
2. Edit with mobile viewing in mind
3. Add captions/text overlays
4. Use dynamic effects sparingly
5. Export with platform-optimized settings

**Export Settings:**
- Format: H.264
- Quality: High
- Frame Rate: Match source or ${platform === 'TikTok' ? '30fps' : '30fps'}
- Audio: AAC, 192kbps

Would you like specific help with any aspect of this workflow?`
          }
        }
      ]
    };
  }

  private documentaryEditingPrompt(args: Record<string, any>): GeneratedPrompt {
    const interviewCount = args.interview_count || 'multiple';
    const narrativeStructure = args.narrative_structure || 'thematic';
    
    return {
      description: 'Workflow for documentary film editing',
      messages: [
        {
          role: 'system',
          content: {
            type: 'text',
            text: 'You are a documentary editor expert. Help the user craft a compelling documentary that tells a clear story with strong narrative structure.'
          }
        },
        {
          role: 'user',
          content: {
            type: 'text',
            text: `I'm editing a documentary with ${interviewCount} interviews using a ${narrativeStructure} structure. What's the best approach?`
          }
        },
        {
          role: 'assistant',
          content: {
            type: 'text',
            text: `Here's a comprehensive documentary editing workflow:

1. **Organization and Review**
   - Create bins for interviews, B-roll, archival footage
   - Review all footage and create detailed notes
   - Identify key soundbites and moments
   - Log B-roll footage by category/topic

2. **Story Structure (${narrativeStructure})**
   ${this.getDocumentaryStructureTips(narrativeStructure)}

3. **Paper Edit**
   - Create rough outline of story beats
   - Identify strongest soundbites
   - Plan B-roll coverage needs
   - Map emotional arc of the story

4. **Rough Assembly**
   - Start with audio-only edit of interviews
   - Focus on story flow and pacing
   - Don't worry about visuals yet
   - Create "string-out" of best moments

5. **B-roll Integration**
   - Add B-roll to support interview content
   - Use cutaways to hide interview edits
   - Create visual interest and context
   - Maintain authenticity and accuracy

6. **Refining and Polishing**
   - Tighten pacing and remove redundancy
   - Add music and sound design
   - Color correct for consistency
   - Add titles and lower thirds

7. **Final Review**
   - Check story clarity and flow
   - Ensure factual accuracy
   - Verify all rights and permissions
   - Final audio mix and color grade

**Key Techniques:**
- Use L-cuts and J-cuts for natural flow
- Vary shot sizes for visual interest
- Use reaction shots effectively
- Maintain eye line and screen direction
- Build tension and release

**Interview Editing Tips:**
- Keep natural speech patterns
- Use "um" removal judiciously
- Maintain authenticity of responses
- Use cutaways to compress time

Would you like detailed guidance on any specific aspect?`
          }
        }
      ]
    };
  }

  private commercialEditingPrompt(args: Record<string, any>): GeneratedPrompt {
    const commercialLength = args.commercial_length || '30s';
    const productType = args.product_type || 'general';
    
    return {
      description: 'Guide for editing commercial advertisements',
      messages: [
        {
          role: 'system',
          content: {
            type: 'text',
            text: 'You are a commercial editor expert. Help the user create compelling advertisements that effectively communicate the brand message and drive action.'
          }
        },
        {
          role: 'user',
          content: {
            type: 'text',
            text: `I'm editing a ${commercialLength} commercial${productType !== 'general' ? ` for ${productType}` : ''}. What's the most effective approach?`
          }
        },
        {
          role: 'assistant',
          content: {
            type: 'text',
            text: `Here's a strategic approach for editing your ${commercialLength} commercial:

**Commercial Structure:**
${this.getCommercialStructureTips(commercialLength)}

**Key Editing Principles:**
1. **Opening Hook (First 2-3 seconds)**
   - Grab attention immediately
   - Establish brand or product quickly
   - Create visual or emotional impact

2. **Message Delivery**
   - Communicate key benefits clearly
   - Use powerful visuals to support claims
   - Build emotional connection with audience

3. **Call to Action**
   - Clear, compelling CTA
   - Make it easy to remember/act on
   - Reinforce brand message

**Editing Techniques:**
- Quick cuts for energy and pace
- Match cuts for product features
- Emotional close-ups for connection
- Dynamic camera moves for excitement
- Strategic use of slow motion

**Visual Style:**
- Consistent brand colors/fonts
- High-quality product shots
- Professional lighting and composition
- Clean, modern aesthetics

**Audio Considerations:**
- Clear, professional voiceover
- Music that enhances mood
- Sound effects for product interaction
- Proper audio levels and mixing

**Technical Requirements:**
- Export for broadcast specifications
- Multiple versions (TV, web, social)
- Closed captions for accessibility
- Quality control for all formats

**${commercialLength} Specific Tips:**
${this.getCommercialLengthTips(commercialLength)}

Would you like specific guidance on any aspect of commercial editing?`
          }
        }
      ]
    };
  }

  private optimizeWorkflowPrompt(args: Record<string, any>): GeneratedPrompt {
    const projectSize = args.project_size || 'medium';
    const hardwareSpecs = args.hardware_specs || 'standard';
    
    return {
      description: 'Tips for optimizing Premiere Pro workflow and performance',
      messages: [
        {
          role: 'system',
          content: {
            type: 'text',
            text: 'You are a Premiere Pro optimization expert. Help the user improve their workflow efficiency and system performance.'
          }
        },
        {
          role: 'user',
          content: {
            type: 'text',
            text: `I'm working on ${projectSize} projects${hardwareSpecs !== 'standard' ? ` with ${hardwareSpecs} hardware` : ''}. How can I optimize my Premiere Pro workflow?`
          }
        },
        {
          role: 'assistant',
          content: {
            type: 'text',
            text: `Here's how to optimize your Premiere Pro workflow for ${projectSize} projects:

**Project Organization:**
1. **File Structure**
   - Create consistent folder hierarchies
   - Use descriptive naming conventions
   - Separate media, projects, and exports
   - Archive completed projects properly

2. **Premiere Pro Setup**
   - Organize bins logically
   - Use color coding for different content types
   - Create custom workspaces for different tasks
   - Set up keyboard shortcuts for common actions

**Performance Optimization:**
${this.getPerformanceOptimizationTips(projectSize, hardwareSpecs)}

**Workflow Efficiency:**
1. **Proxy Workflow**
   - Use proxies for 4K/8K footage
   - Edit with low-res, finish with high-res
   - Automatic proxy generation
   - Proper proxy settings

2. **Collaboration**
   - Use Team Projects for multi-user editing
   - Implement version control
   - Clear communication protocols
   - Regular project backups

3. **Render Management**
   - Use in-to-out rendering
   - Render at optimal points
   - Background rendering settings
   - Export queue management

**Hardware Optimization:**
- Allocate RAM properly in preferences
- Use fast storage for media cache
- Optimize GPU acceleration
- Monitor system resources

**Maintenance:**
- Regular cache cleaning
- Database optimization
- Plugin management
- System updates

**Time-Saving Tips:**
- Use keyboard shortcuts extensively
- Create custom effects presets
- Build template projects
- Automate repetitive tasks

Would you like specific guidance on any optimization area?`
          }
        }
      ]
    };
  }

  private audioCleanupPrompt(args: Record<string, any>): GeneratedPrompt {
    const audioIssues = args.audio_issues || 'general noise';
    const audioSource = args.audio_source || 'microphone';
    
    return {
      description: 'Guide for cleaning up and enhancing audio',
      messages: [
        {
          role: 'system',
          content: {
            type: 'text',
            text: 'You are an audio post-production expert. Help the user clean up and enhance their audio to professional standards.'
          }
        },
        {
          role: 'user',
          content: {
            type: 'text',
            text: `I have audio with ${audioIssues} recorded from ${audioSource}. How can I clean it up and make it sound professional?`
          }
        },
        {
          role: 'assistant',
          content: {
            type: 'text',
            text: `Here's a comprehensive audio cleanup workflow for your ${audioSource} audio:

**Assessment and Planning:**
1. **Identify Issues**
   - ${audioIssues}
   - Background noise levels
   - Frequency response problems
   - Dynamic range issues

2. **Set Up Workflow**
   - Use Audition for detailed audio work
   - Create audio-focused sequence
   - Duplicate tracks for backup
   - Set up proper monitoring

**Cleanup Process:**
${this.getAudioCleanupSteps(audioIssues, audioSource)}

**Enhancement Techniques:**
1. **EQ (Equalization)**
   - Remove mud (200-300 Hz)
   - Enhance clarity (2-5 kHz)
   - Reduce harshness (6-8 kHz)
   - Custom EQ for voice characteristics

2. **Dynamics Processing**
   - Gentle compression (3:1 ratio)
   - De-esser for harsh sibilants
   - Limiter for peak control
   - Expander/gate for noise reduction

3. **Spatial Enhancement**
   - Stereo imaging if appropriate
   - Reverb for space (subtle)
   - Delay for depth (creative use)

**Quality Control:**
- A/B compare with original
- Check on different speakers
- Ensure consistent levels
- Verify no artifacts introduced

**Export Settings:**
- High-quality format (WAV/AIFF)
- Match project sample rate
- Proper bit depth (24-bit minimum)
- Metadata inclusion

**Tools in Premiere Pro:**
- Essential Sound panel
- Audition integration
- Spectral Frequency Display
- Audio effects rack

Would you like specific guidance on any audio issue?`
          }
        }
      ]
    };
  }

  // Helper methods for generating specific tips
  private getColorGradingTips(targetMood: string): string {
    const tips: Record<string, string> = {
      'cinematic': '- Add subtle blue/orange color contrast\n   - Use film grain effect\n   - Slightly desaturate overall\n   - Add gentle vignetting',
      'vibrant': '- Increase saturation selectively\n   - Enhance primary colors\n   - Boost contrast\n   - Use complementary color schemes',
      'moody': '- Lower overall brightness\n   - Enhance shadows and highlights\n   - Use teal/orange grading\n   - Add atmospheric effects',
      'natural': '- Maintain realistic color balance\n   - Subtle saturation boost\n   - Clean, neutral look\n   - Focus on exposure correction'
    };
    return tips[targetMood] ?? tips['natural']!;
  }

  private getMulticamSyncTips(syncMethod: string): string {
    const tips: Record<string, string> = {
      'timecode': '- Ensure all cameras have matching timecode\n   - Use external timecode generator if possible\n   - Check for timecode drift\n   - Verify frame rate consistency',
      'audio': '- Ensure all cameras recorded audio\n   - Use slate or clap for reference\n   - Check audio waveform alignment\n   - Account for audio/video sync offset',
      'markers': '- Add markers at sync points during recording\n   - Use flashbulb or visual cue\n   - Ensure markers are visible in all angles\n   - Manual sync verification may be needed'
    };
    return tips[syncMethod] ?? tips['audio']!;
  }

  private getSocialMediaSpecs(platform: string, contentType: string): string {
    const specs: Record<string, Record<string, string>> = {
      'Instagram': {
        'post': '- Aspect Ratio: 1:1 (square) or 4:5 (portrait)\n- Resolution: 1080x1080 or 1080x1350\n- Duration: Up to 60 seconds\n- Format: MP4 or MOV',
        'story': '- Aspect Ratio: 9:16 (vertical)\n- Resolution: 1080x1920\n- Duration: Up to 15 seconds\n- Format: MP4 or MOV',
        'reel': '- Aspect Ratio: 9:16 (vertical)\n- Resolution: 1080x1920\n- Duration: Up to 90 seconds\n- Format: MP4'
      },
      'TikTok': {
        'default': '- Aspect Ratio: 9:16 (vertical)\n- Resolution: 1080x1920\n- Duration: 15-60 seconds\n- Format: MP4\n- Frame Rate: 30fps'
      },
      'YouTube': {
        'short': '- Aspect Ratio: 9:16 (vertical)\n- Resolution: 1080x1920\n- Duration: Up to 60 seconds\n- Format: MP4',
        'video': '- Aspect Ratio: 16:9 (landscape)\n- Resolution: 1920x1080 or 4K\n- Duration: Variable\n- Format: MP4'
      }
    };
    
    return specs[platform]?.[contentType] ?? specs[platform]?.['default'] ?? 'Standard HD specifications';
  }

  private getPlatformSpecificTips(platform: string, _contentType: string): string {
    const tips: Record<string, string> = {
      'Instagram': '- Use hashtags strategically\n   - Include captions for accessibility\n   - Create thumb-stopping content\n   - Use brand colors consistently',
      'TikTok': '- Start with trending sounds\n   - Use quick cuts and transitions\n   - Add text overlays for context\n   - Create content that encourages interaction',
      'YouTube': '- Create compelling thumbnails\n   - Use clear titles and descriptions\n   - Include end screens and cards\n   - Optimize for search discovery'
    };
    return tips[platform] ?? 'Create engaging, platform-appropriate content';
  }

  private getDocumentaryStructureTips(narrativeStructure: string): string {
    const tips: Record<string, string> = {
      'chronological': '- Follow events in time order\n   - Use dates and timestamps\n   - Build toward climax or resolution\n   - Show cause and effect clearly',
      'thematic': '- Organize by topics or themes\n   - Use interviews to explore each theme\n   - Create smooth transitions between topics\n   - Build overall narrative arc',
      'character-driven': '- Focus on personal journeys\n   - Use character development\n   - Show transformation over time\n   - Balance multiple perspectives'
    };
    return tips[narrativeStructure] ?? tips['thematic']!;
  }

  private getCommercialStructureTips(commercialLength: string): string {
    const tips: Record<string, string> = {
      '15s': '- Hook: 0-2 seconds\n- Message: 2-12 seconds\n- CTA: 12-15 seconds\n- Every second counts - be concise',
      '30s': '- Hook: 0-3 seconds\n- Build: 3-20 seconds\n- Climax: 20-25 seconds\n- CTA: 25-30 seconds',
      '60s': '- Hook: 0-5 seconds\n- Story development: 5-45 seconds\n- Emotional peak: 45-50 seconds\n- CTA: 50-60 seconds'
    };
    return tips[commercialLength] ?? tips['30s']!;
  }

  private getCommercialLengthTips(commercialLength: string): string {
    const tips: Record<string, string> = {
      '15s': '- Focus on one key message\n- Use dynamic visuals\n- Strong opening essential\n- Immediate brand recognition',
      '30s': '- Standard commercial format\n- Time for story development\n- Balance message and emotion\n- Clear three-act structure',
      '60s': '- Room for detailed storytelling\n- Character development possible\n- Multiple benefits can be shown\n- Stronger emotional connection'
    };
    return tips[commercialLength] ?? tips['30s']!;
  }

  private getPerformanceOptimizationTips(projectSize: string, _hardwareSpecs: string): string {
    const tips: Record<string, string> = {
      'small': '- Basic optimization usually sufficient\n- Standard preview settings\n- Minimal proxy usage needed\n- Regular project maintenance',
      'medium': '- Use proxy workflow for 4K+\n- Optimize preview quality\n- Monitor system resources\n- Consider GPU acceleration',
      'large': '- Mandatory proxy workflow\n- Team Projects for collaboration\n- Dedicated storage solutions\n- Advanced system optimization'
    };
    return tips[projectSize] ?? tips['medium']!;
  }

  private getAudioCleanupSteps(audioIssues: string, audioSource: string): string {
    const steps = `
1. **Noise Reduction**
   - Use Audition's noise reduction
   - Capture noise print from quiet section
   - Apply gentle reduction (50-70%)
   - Preserve natural voice quality

2. **Spectral Editing**
   - Use Spectral Frequency Display
   - Remove specific noise frequencies
   - Fix mouth sounds and clicks
   - Remove background interruptions

3. **${audioSource} Specific Fixes**
   ${this.getSourceSpecificTips(audioSource)}

4. **Problem-Specific Solutions**
   ${this.getAudioProblemSolutions(audioIssues)}
`;
    return steps;
  }

  private getSourceSpecificTips(audioSource: string): string {
    const tips: Record<string, string> = {
      'microphone': '- Check for proximity effect\n   - Remove handling noise\n   - Fix plosives and breath sounds\n   - Enhance presence frequencies',
      'phone': '- Enhance frequency range\n   - Remove compression artifacts\n   - Boost midrange for clarity\n   - Minimize digital distortion',
      'camera': '- Remove camera motor noise\n   - Fix automatic gain control issues\n   - Enhance dialogue frequencies\n   - Separate from camera noise'
    };
    return tips[audioSource] ?? tips['microphone']!;
  }

  private getAudioProblemSolutions(audioIssues: string): string {
    const solutions: Record<string, string> = {
      'background noise': '- Use adaptive noise reduction\n   - Apply gentle high-pass filter\n   - Use expander/gate for pauses\n   - Spectral repair for specific sounds',
      'echo': '- Use DeReverb effect\n   - Apply EQ to reduce reflections\n   - Use compression carefully\n   - Manual editing for worst sections',
      'distortion': '- Use Declip effect\n   - Apply gentle compression\n   - EQ to reduce harsh frequencies\n   - Consider re-recording if severe'
    };
    return solutions[audioIssues] ?? solutions['background noise']!;
  }
} 