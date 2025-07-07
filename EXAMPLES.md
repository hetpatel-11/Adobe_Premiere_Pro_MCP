# MCP Adobe Premiere Pro Examples

This document provides practical examples and workflows for using the MCP Adobe Premiere Pro tools.

## 🎬 Common Workflows

### 1. Social Media Content Creation

#### Instagram Reel from Raw Footage

```javascript
async function createInstagramReel() {
  console.log("Creating Instagram Reel...");
  
  // Step 1: Create project
  const project = await callTool('create_project', {
    name: 'Instagram Reel - Daily Vlog',
    location: '/Users/creator/Projects/Social'
  });
  
  // Step 2: Import raw footage
  const footage = await callTool('import_media', {
    filePath: '/Users/creator/Footage/daily_vlog_raw.mp4',
    binName: 'Raw Footage'
  });
  
  // Step 3: Create vertical sequence (9:16)
  const sequence = await callTool('create_sequence', {
    name: 'Reel Timeline',
    presetPath: 'Custom Preset: 1080x1920, 30fps'
  });
  
  // Step 4: Add footage to timeline
  await callTool('add_to_timeline', {
    sequenceId: sequence.id,
    projectItemId: footage.id,
    trackIndex: 0,
    time: 0
  });
  
  // Step 5: Apply trending color grade
  await callTool('color_correct', {
    clipId: footage.id,
    brightness: 5,
    contrast: 20,
    saturation: 15,
    highlights: -10,
    shadows: 10
  });
  
  // Step 6: Add engaging text overlay
  await callTool('add_text_overlay', {
    text: 'Daily Vlog ✨',
    sequenceId: sequence.id,
    trackIndex: 1,
    startTime: 1.0,
    duration: 3.0,
    fontFamily: 'Helvetica Bold',
    fontSize: 72,
    color: '#FFFFFF'
  });
  
  // Step 7: Export for Instagram
  await callTool('export_sequence', {
    sequenceId: sequence.id,
    outputPath: '/Users/creator/Exports/instagram_reel.mp4',
    format: 'mp4'
  });
  
  console.log("Instagram Reel created successfully!");
}
```

#### TikTok Compilation Video

```javascript
async function createTikTokCompilation() {
  // Use prompt for guidance
  const prompt = await getPrompt('social_media_content', {
    platform: 'TikTok',
    content_type: 'compilation'
  });
  
  // Create project
  const project = await callTool('create_project', {
    name: 'TikTok Compilation',
    location: '/Projects/TikTok'
  });
  
  // Import multiple clips
  const clips = [
    '/footage/clip1.mp4',
    '/footage/clip2.mp4',
    '/footage/clip3.mp4',
    '/footage/clip4.mp4'
  ];
  
  const importedClips = [];
  for (const clipPath of clips) {
    const clip = await callTool('import_media', {
      filePath: clipPath
    });
    importedClips.push(clip);
  }
  
  // Create sequence
  const sequence = await callTool('create_sequence', {
    name: 'TikTok Timeline'
  });
  
  // Add clips with quick cuts
  let currentTime = 0;
  for (const clip of importedClips) {
    await callTool('add_to_timeline', {
      sequenceId: sequence.id,
      projectItemId: clip.id,
      trackIndex: 0,
      time: currentTime
    });
    
    // Trim to 2-3 seconds each
    await callTool('trim_clip', {
      clipId: clip.id,
      inPoint: currentTime,
      outPoint: currentTime + 2.5
    });
    
    currentTime += 2.5;
  }
  
  // Add transitions between clips
  for (let i = 0; i < importedClips.length - 1; i++) {
    await callTool('add_transition', {
      clipId1: importedClips[i].id,
      clipId2: importedClips[i + 1].id,
      transitionName: 'Cross Dissolve',
      duration: 0.25
    });
  }
}
```

### 2. Podcast Production

#### Multi-Person Podcast Editing

```javascript
async function editPodcast() {
  console.log("Starting podcast editing workflow...");
  
  // Get workflow guidance
  const prompt = await getPrompt('podcast_editing', {
    participant_count: 3,
    episode_length: '45 minutes'
  });
  
  // Create project
  const project = await callTool('create_project', {
    name: 'Podcast Episode 045',
    location: '/Podcasts/TechTalk'
  });
  
  // Import audio tracks
  const hostAudio = await callTool('import_media', {
    filePath: '/audio/host_track.wav',
    binName: 'Host Audio'
  });
  
  const guest1Audio = await callTool('import_media', {
    filePath: '/audio/guest1_track.wav',
    binName: 'Guest Audio'
  });
  
  const guest2Audio = await callTool('import_media', {
    filePath: '/audio/guest2_track.wav',
    binName: 'Guest Audio'
  });
  
  // Create sequence
  const sequence = await callTool('create_sequence', {
    name: 'Podcast Timeline'
  });
  
  // Add tracks to timeline
  await callTool('add_to_timeline', {
    sequenceId: sequence.id,
    projectItemId: hostAudio.id,
    trackIndex: 0, // Audio track 1
    time: 0
  });
  
  await callTool('add_to_timeline', {
    sequenceId: sequence.id,
    projectItemId: guest1Audio.id,
    trackIndex: 1, // Audio track 2
    time: 0
  });
  
  await callTool('add_to_timeline', {
    sequenceId: sequence.id,
    projectItemId: guest2Audio.id,
    trackIndex: 2, // Audio track 3
    time: 0
  });
  
  // Clean up audio for each track
  const audioCleanupSettings = [
    { clipId: hostAudio.id, level: -12 },
    { clipId: guest1Audio.id, level: -14 },
    { clipId: guest2Audio.id, level: -14 }
  ];
  
  for (const setting of audioCleanupSettings) {
    // Apply noise reduction
    await callTool('apply_effect', {
      clipId: setting.clipId,
      effectName: 'DeNoise',
      parameters: { reduction: 8 }
    });
    
    // Normalize levels
    await callTool('adjust_audio_levels', {
      clipId: setting.clipId,
      level: setting.level
    });
    
    // Apply compression
    await callTool('apply_effect', {
      clipId: setting.clipId,
      effectName: 'Dynamics',
      parameters: {
        ratio: 3.0,
        threshold: -18,
        attack: 10,
        release: 100
      }
    });
  }
  
  console.log("Podcast editing completed!");
}
```

### 3. Music Video Production

#### Auto-Sync to Beat

```javascript
async function createMusicVideo() {
  // Get music video workflow guidance
  const prompt = await getPrompt('edit_music_video', {
    music_file: '/music/song.mp3',
    video_clips: ['/footage/performance/', '/footage/broll/']
  });
  
  // Create project
  const project = await callTool('create_project', {
    name: 'Music Video - Song Title',
    location: '/Projects/MusicVideos'
  });
  
  // Import music track
  const musicTrack = await callTool('import_media', {
    filePath: '/music/song.mp3',
    binName: 'Music'
  });
  
  // Import video clips
  const performanceClips = [
    '/footage/performance/wide_shot.mp4',
    '/footage/performance/close_up.mp4',
    '/footage/performance/medium_shot.mp4'
  ];
  
  const brollClips = [
    '/footage/broll/lifestyle1.mp4',
    '/footage/broll/lifestyle2.mp4',
    '/footage/broll/abstract1.mp4'
  ];
  
  // Import all clips
  const allClips = [...performanceClips, ...brollClips];
  const importedClips = [];
  
  for (const clipPath of allClips) {
    const clip = await callTool('import_media', {
      filePath: clipPath
    });
    importedClips.push(clip);
  }
  
  // Create sequence
  const sequence = await callTool('create_sequence', {
    name: 'Music Video Timeline'
  });
  
  // Add music track first
  await callTool('add_to_timeline', {
    sequenceId: sequence.id,
    projectItemId: musicTrack.id,
    trackIndex: 0, // Audio track
    time: 0
  });
  
  // Use auto-edit to music feature
  await callTool('auto_edit_to_music', {
    audioTrackId: musicTrack.id,
    videoClipIds: importedClips.map(clip => clip.id),
    editStyle: 'beat_sync'
  });
  
  // Apply color grading for cinematic look
  const prompt2 = await getPrompt('color_grade_footage', {
    footage_type: 'standard',
    target_mood: 'cinematic'
  });
  
  for (const clip of importedClips) {
    await callTool('color_correct', {
      clipId: clip.id,
      brightness: -5,
      contrast: 25,
      saturation: -10,
      highlights: -20,
      shadows: 15
    });
  }
}
```

### 4. Documentary Editing

#### Interview-Based Documentary

```javascript
async function editDocumentary() {
  // Get documentary workflow guidance
  const prompt = await getPrompt('documentary_editing', {
    interview_count: 4,
    narrative_structure: 'thematic'
  });
  
  // Create project
  const project = await callTool('create_project', {
    name: 'Documentary - Climate Change',
    location: '/Documentaries/ClimateChange'
  });
  
  // Import interview footage
  const interviews = [
    { path: '/interviews/scientist1.mp4', name: 'Dr. Smith Interview' },
    { path: '/interviews/activist1.mp4', name: 'Environmental Activist' },
    { path: '/interviews/farmer1.mp4', name: 'Local Farmer' },
    { path: '/interviews/politician1.mp4', name: 'City Council Member' }
  ];
  
  const brollFootage = [
    '/broll/factory_pollution.mp4',
    '/broll/melting_glaciers.mp4',
    '/broll/renewable_energy.mp4',
    '/broll/city_traffic.mp4'
  ];
  
  // Import all footage
  const importedInterviews = [];
  for (const interview of interviews) {
    const clip = await callTool('import_media', {
      filePath: interview.path,
      binName: 'Interviews'
    });
    importedInterviews.push({ ...clip, name: interview.name });
  }
  
  const importedBroll = [];
  for (const brollPath of brollFootage) {
    const clip = await callTool('import_media', {
      filePath: brollPath,
      binName: 'B-Roll'
    });
    importedBroll.push(clip);
  }
  
  // Create sequence
  const sequence = await callTool('create_sequence', {
    name: 'Documentary Timeline'
  });
  
  // Build story structure
  let currentTime = 0;
  
  // Opening with B-roll
  await callTool('add_to_timeline', {
    sequenceId: sequence.id,
    projectItemId: importedBroll[0].id, // Factory pollution
    trackIndex: 0,
    time: currentTime
  });
  
  await callTool('trim_clip', {
    clipId: importedBroll[0].id,
    inPoint: 0,
    outPoint: 15
  });
  currentTime += 15;
  
  // Add title overlay
  await callTool('add_text_overlay', {
    text: 'Climate Crisis: A Local Perspective',
    sequenceId: sequence.id,
    trackIndex: 1,
    startTime: 5,
    duration: 8,
    fontFamily: 'Arial Bold',
    fontSize: 64,
    color: '#FFFFFF'
  });
  
  // Interview segments with B-roll cutaways
  for (let i = 0; i < importedInterviews.length; i++) {
    const interview = importedInterviews[i];
    
    // Add interview clip
    await callTool('add_to_timeline', {
      sequenceId: sequence.id,
      projectItemId: interview.id,
      trackIndex: 0,
      time: currentTime
    });
    
    // Trim to key soundbite (this would be based on actual content)
    await callTool('trim_clip', {
      clipId: interview.id,
      inPoint: currentTime,
      outPoint: currentTime + 30
    });
    
    // Add B-roll cutaway
    if (importedBroll[i + 1]) {
      await callTool('add_to_timeline', {
        sequenceId: sequence.id,
        projectItemId: importedBroll[i + 1].id,
        trackIndex: 1, // Video track 2
        time: currentTime + 10
      });
      
      await callTool('trim_clip', {
        clipId: importedBroll[i + 1].id,
        inPoint: currentTime + 10,
        outPoint: currentTime + 20
      });
    }
    
    currentTime += 30;
  }
  
  // Color match all interviews
  for (const interview of importedInterviews) {
    await callTool('color_correct', {
      clipId: interview.id,
      brightness: 2,
      contrast: 5,
      saturation: 0 // Keep natural
    });
  }
  
  console.log("Documentary rough cut completed!");
}
```

### 5. Commercial Production

#### 30-Second Product Commercial

```javascript
async function createCommercial() {
  // Get commercial editing guidance
  const prompt = await getPrompt('commercial_editing', {
    commercial_length: '30s',
    product_type: 'tech gadget'
  });
  
  // Create project
  const project = await callTool('create_project', {
    name: 'Product Commercial - SmartWatch',
    location: '/Commercials/TechProducts'
  });
  
  // Import footage
  const productShots = [
    '/footage/product_hero.mp4',
    '/footage/product_detail1.mp4',
    '/footage/product_detail2.mp4',
    '/footage/product_lifestyle.mp4'
  ];
  
  const lifestyleShots = [
    '/footage/person_jogging.mp4',
    '/footage/person_working.mp4',
    '/footage/family_time.mp4'
  ];
  
  // Import all clips
  const allFootage = [...productShots, ...lifestyleShots];
  const importedClips = [];
  
  for (const clipPath of allFootage) {
    const clip = await callTool('import_media', {
      filePath: clipPath
    });
    importedClips.push(clip);
  }
  
  // Import music and voiceover
  const music = await callTool('import_media', {
    filePath: '/audio/commercial_music.mp3',
    binName: 'Music'
  });
  
  const voiceover = await callTool('import_media', {
    filePath: '/audio/voiceover.wav',
    binName: 'VO'
  });
  
  // Create sequence
  const sequence = await callTool('create_sequence', {
    name: 'Commercial Timeline'
  });
  
  // Add music bed
  await callTool('add_to_timeline', {
    sequenceId: sequence.id,
    projectItemId: music.id,
    trackIndex: 0, // Audio track 1
    time: 0
  });
  
  // Adjust music level
  await callTool('adjust_audio_levels', {
    clipId: music.id,
    level: -20 // Background music level
  });
  
  // Add voiceover
  await callTool('add_to_timeline', {
    sequenceId: sequence.id,
    projectItemId: voiceover.id,
    trackIndex: 1, // Audio track 2
    time: 5 // Start after 5 seconds
  });
  
  // Build video structure (30-second commercial)
  const editPlan = [
    { clip: 0, start: 0, duration: 3 },    // Hero shot
    { clip: 4, start: 3, duration: 4 },    // Lifestyle 1
    { clip: 1, start: 7, duration: 3 },    // Product detail 1
    { clip: 5, start: 10, duration: 4 },   // Lifestyle 2
    { clip: 2, start: 14, duration: 3 },   // Product detail 2
    { clip: 6, start: 17, duration: 4 },   // Lifestyle 3
    { clip: 3, start: 21, duration: 6 },   // Product lifestyle
    { clip: 0, start: 27, duration: 3 }    // Hero shot (logo reveal)
  ];
  
  for (const edit of editPlan) {
    await callTool('add_to_timeline', {
      sequenceId: sequence.id,
      projectItemId: importedClips[edit.clip].id,
      trackIndex: 0, // Video track 1
      time: edit.start
    });
    
    await callTool('trim_clip', {
      clipId: importedClips[edit.clip].id,
      inPoint: edit.start,
      outPoint: edit.start + edit.duration
    });
  }
  
  // Add product logo at the end
  await callTool('add_text_overlay', {
    text: 'SmartWatch Pro',
    sequenceId: sequence.id,
    trackIndex: 1,
    startTime: 25,
    duration: 5,
    fontFamily: 'Helvetica Bold',
    fontSize: 48,
    color: '#000000'
  });
  
  // Apply commercial-style color grading
  for (const clip of importedClips) {
    await callTool('color_correct', {
      clipId: clip.id,
      brightness: 8,
      contrast: 20,
      saturation: 12
    });
  }
  
  // Add transitions for smooth flow
  for (let i = 0; i < editPlan.length - 1; i++) {
    await callTool('add_transition', {
      clipId1: importedClips[editPlan[i].clip].id,
      clipId2: importedClips[editPlan[i + 1].clip].id,
      transitionName: 'Cross Dissolve',
      duration: 0.5
    });
  }
  
  console.log("30-second commercial completed!");
}
```

## 🎨 Creative Workflows

### Color Grading Workflows

#### Cinematic Look

```javascript
async function applyCinematicGrade() {
  const prompt = await getPrompt('color_grade_footage', {
    footage_type: 'log',
    target_mood: 'cinematic'
  });
  
  // Get current timeline clips
  const clips = await readResource('premiere://timeline/clips');
  
  for (const clip of clips.clips) {
    if (clip.trackType === 'video') {
      await callTool('color_correct', {
        clipId: clip.id,
        brightness: -5,
        contrast: 25,
        saturation: -15,
        highlights: -25,
        shadows: 20
      });
      
      // Add film grain effect
      await callTool('apply_effect', {
        clipId: clip.id,
        effectName: 'Noise',
        parameters: {
          amount: 2,
          type: 'Film Grain'
        }
      });
    }
  }
}
```

#### Social Media Vibrant Look

```javascript
async function applyVibrantGrade() {
  const clips = await readResource('premiere://timeline/clips');
  
  for (const clip of clips.clips) {
    if (clip.trackType === 'video') {
      await callTool('color_correct', {
        clipId: clip.id,
        brightness: 8,
        contrast: 15,
        saturation: 25,
        highlights: -5,
        shadows: 5
      });
    }
  }
}
```

### Audio Workflows

#### Podcast Audio Enhancement

```javascript
async function enhancePodcastAudio() {
  const clips = await readResource('premiere://timeline/clips');
  const audioClips = clips.clips.filter(clip => clip.trackType === 'audio');
  
  for (const clip of audioClips) {
    // Noise reduction
    await callTool('apply_effect', {
      clipId: clip.id,
      effectName: 'DeNoise',
      parameters: { reduction: 10 }
    });
    
    // EQ for voice clarity
    await callTool('apply_effect', {
      clipId: clip.id,
      effectName: 'Parametric EQ',
      parameters: {
        lowCut: 80,      // Remove low-end rumble
        midBoost: 2500,  // Boost presence
        midGain: 3,
        highCut: 8000    // Gentle high-end rolloff
      }
    });
    
    // Compression
    await callTool('apply_effect', {
      clipId: clip.id,
      effectName: 'Dynamics',
      parameters: {
        ratio: 3.0,
        threshold: -18,
        attack: 10,
        release: 100
      }
    });
    
    // De-esser
    await callTool('apply_effect', {
      clipId: clip.id,
      effectName: 'DeEsser',
      parameters: {
        frequency: 6000,
        reduction: 6
      }
    });
  }
}
```

## 🤖 AI-Powered Workflows

### Intelligent Scene Detection

```javascript
async function intelligentSceneDetection() {
  const project = await readResource('premiere://project/info');
  const media = await readResource('premiere://project/media');
  
  console.log("Analyzing footage for scene changes...");
  
  // This would integrate with AI services for scene detection
  // For now, we'll simulate with timeline analysis
  
  for (const item of media.mediaItems) {
    if (item.hasVideo) {
      console.log(`Analyzing ${item.name}...`);
      
      // Simulate AI-detected scene changes
      const sceneChanges = [10, 25, 45, 67, 89]; // Example timestamps
      
      // Create a multicam source or add markers
      for (const timestamp of sceneChanges) {
        // Add markers for scene changes
        // This would require extending the API to support markers
        console.log(`Scene change detected at ${timestamp}s in ${item.name}`);
      }
    }
  }
}
```

### Auto-Generate Social Media Versions

```javascript
async function autoGenerateSocialVersions() {
  const sequence = await readResource('premiere://project/sequences');
  const mainSequence = sequence.sequences[0]; // Assume first is main
  
  const socialFormats = [
    { name: 'Instagram Post', ratio: '1:1', resolution: '1080x1080' },
    { name: 'Instagram Story', ratio: '9:16', resolution: '1080x1920' },
    { name: 'TikTok', ratio: '9:16', resolution: '1080x1920' },
    { name: 'YouTube Short', ratio: '9:16', resolution: '1080x1920' },
    { name: 'Twitter Video', ratio: '16:9', resolution: '1280x720' }
  ];
  
  for (const format of socialFormats) {
    console.log(`Creating ${format.name} version...`);
    
    // Create new sequence for this format
    const newSequence = await callTool('create_sequence', {
      name: `${mainSequence.name} - ${format.name}`,
      presetPath: `Custom: ${format.resolution}`
    });
    
    // Copy main content to new sequence
    // This would require more advanced copying tools
    
    // Apply format-specific optimizations
    if (format.ratio === '9:16') {
      // Vertical format optimizations
      console.log("Applying vertical format optimizations...");
      
      // Increase text size for mobile viewing
      // Reframe shots for vertical composition
      // Adjust pacing for shorter attention spans
    }
  }
}
```

These examples demonstrate the power and flexibility of the MCP Adobe Premiere Pro integration. Each workflow can be customized and extended based on specific needs and creative requirements. 