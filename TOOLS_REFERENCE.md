# Adobe Premiere Pro MCP Tools Reference

## Overview
This document provides a comprehensive reference for all available tools in the AI-powered Adobe Premiere Pro workflow. All tools are designed with robust error handling, clear JSON responses, and comprehensive functionality.

## Tool Categories

### 🔍 Discovery Tools (NEW)
These tools help Claude understand the current project state and available resources.

#### `list_project_items`
**Purpose:** Lists all media items, bins, and assets in the current project.
**Input:**
- `includeBins` (optional): Whether to include bin information
- `includeMetadata` (optional): Whether to include detailed metadata
**Returns:** Complete inventory of project items with IDs, names, types, and paths.

#### `list_sequences`
**Purpose:** Lists all sequences in the project with their properties.
**Input:** None
**Returns:** All sequences with IDs, names, duration, dimensions, frame rates, and track counts.

#### `list_sequence_tracks`
**Purpose:** Lists all video and audio tracks in a specific sequence.
**Input:**
- `sequenceId`: The ID of the sequence to analyze
**Returns:** Detailed track information including clips, enabled/disabled status, and lock status.

#### `get_project_info`
**Purpose:** Gets comprehensive project information.
**Input:** None
**Returns:** Project name, path, active sequence, item counts, and dirty status.

### 📁 Project Management

#### `create_project`
**Purpose:** Creates a new Premiere Pro project.
**Input:**
- `name`: Project name
- `location`: Directory path for the project file
**Returns:** Success status and project path.

#### `open_project`
**Purpose:** Opens an existing project file.
**Input:**
- `path`: Absolute path to .prproj file
**Returns:** Success status and project details.

#### `save_project`
**Purpose:** Saves the current project.
**Input:** None
**Returns:** Success status and timestamp.

#### `save_project_as`
**Purpose:** Saves project with a new name and location.
**Input:**
- `name`: New project name
- `location`: New directory path
**Returns:** Success status and new project path.

### 📂 Media Management

#### `import_media`
**Purpose:** Imports a single media file into the project.
**Input:**
- `filePath`: Absolute path to media file
- `binName` (optional): Target bin name
**Returns:** Success status and imported item details.

#### `import_folder`
**Purpose:** Imports all media files from a folder.
**Input:**
- `folderPath`: Path to folder containing media
- `binName` (optional): Target bin name
- `recursive` (optional): Import from subfolders
**Returns:** List of imported items and any errors.

#### `create_bin`
**Purpose:** Creates a new bin (folder) in the project panel.
**Input:**
- `name`: Bin name
- `parentBinName` (optional): Parent bin name
**Returns:** Success status and new bin ID.

### 🎬 Sequence Management

#### `create_sequence`
**Purpose:** Creates a new sequence in the project.
**Input:**
- `name`: Sequence name
- `presetPath` (optional): Path to sequence preset
- `width` (optional): Sequence width in pixels
- `height` (optional): Sequence height in pixels
- `frameRate` (optional): Frame rate
- `sampleRate` (optional): Audio sample rate
**Returns:** Success status and sequence details.

#### `duplicate_sequence`
**Purpose:** Creates a copy of an existing sequence.
**Input:**
- `sequenceId`: ID of sequence to duplicate
- `newName`: Name for the new sequence
**Returns:** Success status and new sequence ID.

#### `delete_sequence`
**Purpose:** Deletes a sequence from the project.
**Input:**
- `sequenceId`: ID of sequence to delete
**Returns:** Success status and deletion confirmation.

### ⏱️ Timeline Operations

#### `add_to_timeline`
**Purpose:** Adds a media clip to a sequence timeline.
**Input:**
- `sequenceId`: Target sequence ID
- `projectItemId`: Project item ID to add
- `trackIndex`: Target track index (0-based)
- `time`: Time position in seconds
- `insertMode` (optional): 'overwrite' or 'insert'
**Returns:** Success status and clip details.

#### `remove_from_timeline`
**Purpose:** Removes a clip from the timeline.
**Input:**
- `clipId`: ID of clip to remove
- `deleteMode` (optional): 'ripple' or 'lift'
**Returns:** Success status and removal confirmation.

#### `move_clip`
**Purpose:** Moves a clip to a different position.
**Input:**
- `clipId`: ID of clip to move
- `newTime`: New time position
- `newTrackIndex` (optional): New track index
**Returns:** Success status and movement details.

#### `trim_clip`
**Purpose:** Adjusts clip in/out points.
**Input:**
- `clipId`: ID of clip to trim
- `inPoint` (optional): New in point in seconds
- `outPoint` (optional): New out point in seconds
- `duration` (optional): Desired duration in seconds
**Returns:** Success status and trim details.

#### `split_clip`
**Purpose:** Splits a clip at a specific time point.
**Input:**
- `clipId`: ID of clip to split
- `splitTime`: Time point to split at
**Returns:** Success status and new clip IDs.

### 🎨 Effects and Transitions

#### `apply_effect`
**Purpose:** Applies a visual or audio effect to a clip.
**Input:**
- `clipId`: ID of target clip
- `effectName`: Name of effect to apply
- `parameters` (optional): Effect parameters
**Returns:** Success status and effect details.

#### `remove_effect`
**Purpose:** Removes an effect from a clip.
**Input:**
- `clipId`: ID of clip
- `effectName`: Name of effect to remove
**Returns:** Success status and removal confirmation.

#### `add_transition`
**Purpose:** Adds a transition between two clips.
**Input:**
- `clipId1`: ID of first clip
- `clipId2`: ID of second clip
- `transitionName`: Name of transition
- `duration`: Transition duration in seconds
**Returns:** Success status and transition details.

#### `add_transition_to_clip`
**Purpose:** Adds a transition to the start or end of a clip.
**Input:**
- `clipId`: ID of clip
- `transitionName`: Name of transition
- `position`: 'start' or 'end'
- `duration`: Transition duration
**Returns:** Success status and transition details.

### 🔊 Audio Operations

#### `adjust_audio_levels`
**Purpose:** Adjusts the volume of an audio clip.
**Input:**
- `clipId`: ID of audio clip
- `level`: New audio level in dB
**Returns:** Success status and level change details.

#### `add_audio_keyframes`
**Purpose:** Adds keyframes to audio levels for dynamic changes.
**Input:**
- `clipId`: ID of audio clip
- `keyframes`: Array of {time, level} objects
**Returns:** Success status and keyframe details.

#### `mute_track`
**Purpose:** Mutes or unmutes an entire audio track.
**Input:**
- `sequenceId`: ID of sequence
- `trackIndex`: Audio track index
- `muted`: Boolean mute status
**Returns:** Success status and mute change details.

### 📝 Text and Graphics

#### `add_text_overlay`
**Purpose:** Adds a text layer over video.
**Input:**
- `text`: Text content
- `sequenceId`: Target sequence ID
- `trackIndex`: Video track index
- `startTime`: Appearance time in seconds
- `duration`: Display duration in seconds
- `fontFamily` (optional): Font family
- `fontSize` (optional): Font size
- `color` (optional): Text color (hex)
- `position` (optional): {x, y} position (0-100)
- `alignment` (optional): 'left', 'center', 'right'
**Returns:** Success status and text clip details.

#### `add_shape`
**Purpose:** Adds a shape (rectangle, circle, triangle) to the timeline.
**Input:**
- `shapeType`: 'rectangle', 'circle', or 'triangle'
- `sequenceId`: Target sequence ID
- `trackIndex`: Video track index
- `startTime`: Appearance time in seconds
- `duration`: Display duration in seconds
- `color` (optional): Shape color (hex)
- `size` (optional): {width, height} in pixels
- `position` (optional): {x, y} position (0-100)
**Returns:** Success status and shape clip details.

### 🎨 Color Correction

#### `color_correct`
**Purpose:** Applies basic color correction adjustments.
**Input:**
- `clipId`: ID of clip to correct
- `brightness` (optional): -100 to 100
- `contrast` (optional): -100 to 100
- `saturation` (optional): -100 to 100
- `hue` (optional): -180 to 180 degrees
- `highlights` (optional): -100 to 100
- `shadows` (optional): -100 to 100
- `temperature` (optional): -100 to 100
- `tint` (optional): -100 to 100
**Returns:** Success status and adjustment details.

#### `apply_lut`
**Purpose:** Applies a Look-Up Table for color grading.
**Input:**
- `clipId`: ID of clip
- `lutPath`: Path to .cube or .3dl LUT file
- `intensity` (optional): LUT intensity (0-100)
**Returns:** Success status and LUT application details.

### 📤 Export and Rendering

#### `export_sequence`
**Purpose:** Renders and exports a sequence to video file.
**Input:**
- `sequenceId`: ID of sequence to export
- `outputPath`: Output file path
- `presetPath` (optional): Export preset path
- `format` (optional): 'mp4', 'mov', 'avi', 'h264', 'prores'
- `quality` (optional): 'low', 'medium', 'high', 'maximum'
- `resolution` (optional): Export resolution (e.g., "1920x1080")
**Returns:** Success status and export details.

#### `export_frame`
**Purpose:** Exports a single frame as an image.
**Input:**
- `sequenceId`: ID of sequence
- `time`: Time point in seconds
- `outputPath`: Output image path
- `format` (optional): 'png', 'jpg', 'tiff'
**Returns:** Success status and frame export details.

### 🎥 Advanced Features

#### `create_multicam_sequence`
**Purpose:** Creates a multicamera sequence from multiple video clips.
**Input:**
- `name`: Sequence name
- `cameraFiles`: Array of camera file paths
- `syncMethod`: 'timecode', 'audio', or 'markers'
**Returns:** Success status and multicam sequence details.

#### `create_proxy_media`
**Purpose:** Generates low-resolution proxy versions of media.
**Input:**
- `projectItemIds`: Array of project item IDs
- `proxyPreset`: Proxy preset name
- `replaceOriginals` (optional): Replace original media
**Returns:** Success status and proxy creation details.

#### `auto_edit_to_music`
**Purpose:** Automatically edits video to music beats.
**Input:**
- `audioTrackId`: ID of music audio track
- `videoClipIds`: Array of video clip IDs
- `editStyle`: 'cuts_only', 'cuts_and_transitions', 'beat_sync'
- `sensitivity` (optional): Beat detection sensitivity (0-100)
**Returns:** Success status and edit analysis details.

#### `stabilize_clip`
**Purpose:** Applies video stabilization to reduce camera shake.
**Input:**
- `clipId`: ID of clip to stabilize
- `method` (optional): 'warp' or 'subspace'
- `smoothness` (optional): Stabilization smoothness (0-100)
**Returns:** Success status and stabilization details.

#### `speed_change`
**Purpose:** Changes the playback speed of a clip.
**Input:**
- `clipId`: ID of clip
- `speed`: Speed multiplier (0.1 = 10%, 2.0 = 200%)
- `maintainAudio` (optional): Maintain audio pitch
**Returns:** Success status and speed change details.

## Error Handling

All tools implement comprehensive error handling:

1. **Input Validation:** All inputs are validated using Zod schemas
2. **Structured Responses:** All tools return `{success: true/false, ...}` format
3. **Detailed Error Messages:** Clear, actionable error messages
4. **Graceful Degradation:** Tools handle missing elements gracefully
5. **No Timeouts:** Tools never hang or timeout

## Usage Examples

### Basic Workflow
```javascript
// 1. Discover project state
const projectInfo = await executeTool('get_project_info', {});
const sequences = await executeTool('list_sequences', {});
const media = await executeTool('list_project_items', {includeMetadata: true});

// 2. Import media
const importResult = await executeTool('import_media', {
  filePath: '/path/to/video.mp4',
  binName: 'My Videos'
});

// 3. Create sequence
const sequenceResult = await executeTool('create_sequence', {
  name: 'My Edit',
  width: 1920,
  height: 1080,
  frameRate: 24
});

// 4. Add to timeline
const timelineResult = await executeTool('add_to_timeline', {
  sequenceId: sequenceResult.sequenceId,
  projectItemId: importResult.projectItemId,
  trackIndex: 0,
  time: 0
});

// 5. Add effects
const effectResult = await executeTool('apply_effect', {
  clipId: timelineResult.clipId,
  effectName: 'Lumetri Color',
  parameters: {brightness: 10, contrast: 5}
});

// 6. Export
const exportResult = await executeTool('export_sequence', {
  sequenceId: sequenceResult.sequenceId,
  outputPath: '/path/to/output.mp4',
  format: 'mp4',
  quality: 'high'
});
```

### Advanced Workflow
```javascript
// 1. Get full project context
const tracks = await executeTool('list_sequence_tracks', {
  sequenceId: 'sequence_123'
});

// 2. Complex text overlay
const textResult = await executeTool('add_text_overlay', {
  text: 'Welcome to My Video',
  sequenceId: 'sequence_123',
  trackIndex: 1,
  startTime: 5,
  duration: 3,
  fontFamily: 'Arial',
  fontSize: 48,
  color: '#FFFFFF',
  position: {x: 50, y: 20},
  alignment: 'center'
});

// 3. Audio keyframes
const audioResult = await executeTool('add_audio_keyframes', {
  clipId: 'clip_456',
  keyframes: [
    {time: 0, level: -6},
    {time: 2, level: 0},
    {time: 4, level: -6}
  ]
});
```

## Best Practices

1. **Always use discovery tools first** to understand the current project state
2. **Check tool responses** for success status before proceeding
3. **Use meaningful names** for sequences, bins, and clips
4. **Handle errors gracefully** by checking the success field
5. **Use the most specific tool** for your needs (e.g., `add_transition_to_clip` vs `add_transition`)
6. **Validate file paths** before importing media
7. **Use appropriate track indices** (0-based) for timeline operations

## Tool Availability

All tools are available immediately and require no additional setup. The tools work with any open Premiere Pro project and provide comprehensive coverage of video editing workflows from basic operations to advanced features. 