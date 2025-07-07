# MCP Premiere Pro Tools — Working Methods Only

## Overview
This document lists **only the tools that are confirmed to work** with the MCP (Model Context Protocol) server and a CEP (Common Extensibility Platform) extension in Adobe Premiere Pro. This ensures users and AI agents (like Claude) only see features that are reliable in your environment.

---

## ✅ **Supported Tools**

### Project Management
- **create_project** — Create a new Premiere Pro project
- **open_project** — Open an existing project file
- **save_project** — Save the current project

### Media Management
- **import_media** — Import a media file (video, audio, image)
- **import_folder** — Import all media files from a folder
- **create_bin** — Create a new bin (folder) in the project panel

### Sequence Management
- **create_sequence** — Create a new sequence (timeline)
- **duplicate_sequence** — Duplicate an existing sequence
- **delete_sequence** — Delete a sequence

### Timeline Operations
- **add_to_timeline** — Add a media clip to a sequence timeline
- **remove_from_timeline** — Remove a clip from the timeline
- **move_clip** — Move a clip to a different position
- **trim_clip** — Adjust the in/out points of a clip
- **split_clip** — Split a clip at a specific time point

### Effects and Transitions
- **apply_effect** — Apply a visual or audio effect to a clip
- **remove_effect** — Remove an effect from a clip
- **add_transition** — Add a transition between two clips
- **add_transition_to_clip** — Add a transition to the start or end of a clip

### Audio Operations
- **adjust_audio_levels** — Adjust the volume of an audio clip
- **add_audio_keyframes** — Add keyframes to audio levels
- **mute_track** — Mute or unmute an entire audio track

### Color Correction
- **color_correct** — Apply basic color correction adjustments
- **apply_lut** — Apply a Look-Up Table (LUT) to a clip

### Export and Rendering
- **export_sequence** — Render and export a sequence to a video file
- **export_frame** — Export a single frame as an image

### Advanced Features
- **create_multicam_sequence** — Create a multicamera sequence from multiple video clips
- **create_proxy_media** — Generate proxy versions of media
- **auto_edit_to_music** — Automatically edit video to music beats
- **stabilize_clip** — Apply video stabilization
- **speed_change** — Change the playback speed of a clip

### Project/Media/Sequence Discovery
- **list_project_items** — List all media items, bins, and assets in the project
- **list_sequences** — List all sequences in the project
- **list_sequence_tracks** — List all tracks in a sequence
- **get_project_info** — Get comprehensive project information

---

## ❌ **Unavailable/Unsupported Features**

### Text Overlays (Legacy Titles)
- **add_text_overlay** — *Not available*: The legacy title/text scripting API is deprecated or broken in modern Premiere Pro versions. Scripting calls to create text overlays will fail or do nothing.

### Shape/Graphics Overlays
- **add_shape** — *Not available*: Premiere Pro scripting does **not** support drawing arbitrary shapes (rectangles, circles, etc.) on the timeline. Only text (via legacy titles) was ever possible, and that is now deprecated.

### Essential Graphics (MOGRTs)
- *Not available*: Scripting cannot create or edit Essential Graphics templates. Only manual editing is possible.

### Direct Pixel Manipulation
- *Not available*: Scripting cannot draw, paint, or manipulate video frames directly.

---

## Why Are Some Features Missing?
- **Adobe has deprecated or removed the legacy title engine** in recent Premiere Pro versions.
- **No scripting API exists for Essential Graphics or custom shapes** in Premiere Pro.
- **If you need advanced graphics/text:**
  - Use After Effects for graphics, then import the comp into Premiere.
  - Or, create transparent PNGs with text/shapes in Photoshop and import as media.

---

## How This Was Determined
- All tools were tested in a real CEP/ExtendScript environment.
- Only tools that work reliably are included here.
- If Adobe updates Premiere Pro to re-enable scripting for text/graphics, these features can be added back.

---

## References
- [Adobe Premiere Pro Scripting Guide](https://ppro-scripting.docsforadobe.dev/)
- [Adobe CEP Resources](https://github.com/Adobe-CEP)

---

## Sharing
Feel free to share this document online (GitHub, Gist, etc.) to help other users and teams understand what’s possible with MCP + CEP in Premiere Pro. 