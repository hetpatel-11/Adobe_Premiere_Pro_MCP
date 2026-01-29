# 🎬 MCP Adobe Premiere Pro — AI Video Editing Automation

> **AI meets Premiere Pro.** Control your edits with natural language and automate your workflow with Claude or any AI agent, powered by the Model Context Protocol (MCP).

> ⚠️ **Transparency Notice:** This project was developed with AI assistance (Claude Sonnet 4.5) as an experimental proof-of-concept. While many features are fully functional, some tools are placeholders awaiting full implementation. See the detailed tool status below.

<a href="https://glama.ai/mcp/servers/@hetpatel-11/Adobe_Premiere_Pro_MCP">
  <img width="380" height="200" src="https://glama.ai/mcp/servers/@hetpatel-11/Adobe_Premiere_Pro_MCP/badge" alt="Adobe Premiere Pro MCP server" />
</a>

---

## ✨ What is This?
This project is an **AI-powered automation bridge for Adobe Premiere Pro**. It exposes a set of editing tools (via MCP) so you can:
- 🗣️ **Talk to your editor** (via Claude or other AI agents)
- ⚡ **Automate repetitive tasks**
- 🧠 **Build smarter, context-aware workflows**

**Current Status:**
- ✅ **50+ fully functional tools** tested and working
- ✅ **Security hardened** with comprehensive input validation
- ✅ **102 unit tests** ensuring reliability
- ⚠️ **10 placeholder tools** awaiting full implementation
- 🚀 **Production-ready core** for common editing workflows

---

## 🧩 Using with UXP DevTools (Experimental)

You can also use this project as a UXP panel in Premiere Pro (24.4+):

1. Open [Adobe UXP DevTools](https://developer.adobe.com/photoshop/uxp/2022/guides/devtool/).
2. Click “Add Plugin” and select the `uxp-plugin/` folder.
3. Start the panel in DevTools and open it in Premiere Pro via `Window > Plugins > MCP Bridge (UXP)`.

**⚠️ Note:**
- UXP scripting in Premiere Pro is **experimental and limited**. Some features (like timeline and sequence editing) may not be available yet.

---

## 🛠️ Tool Status (65 Total Tools)

### ✅ Fully Working Tools (50+ tools)

#### 📁 Project Management
- **create_project** — Create a new Premiere Pro project
- **open_project** — Open an existing project file
- **save_project** — Save the current project
- **save_project_as** — Save the project with a new name/location

#### 📂 Media Management
- **import_media** — Import a media file (video, audio, image)
- **import_folder** — Import all media files from a folder
- **create_bin** — Create a new bin (folder) in the project panel

#### 🎬 Sequence Management
- **create_sequence** — Create a new sequence (timeline)
- **duplicate_sequence** — Duplicate an existing sequence
- **delete_sequence** — Delete a sequence

#### ⏱️ Timeline Operations
- **add_to_timeline** — Add a media clip to a sequence timeline
- **remove_from_timeline** — Remove a clip from the timeline
- **move_clip** — Move a clip to a different position
- **trim_clip** — Adjust the in/out points of a clip
- **split_clip** — Split a clip at a specific time point
- **duplicate_clip** ✨ — Duplicate a clip on the timeline
- **enable_disable_clip** ✨ — Enable or disable a clip
- **reverse_clip** ✨ — Reverse playback direction of a clip

#### 🎨 Effects & Transitions
- **apply_effect** — Apply a visual or audio effect to a clip
- **remove_effect** — Remove an effect from a clip
- **add_transition** — Add a transition between two clips
- **add_transition_to_clip** — Add a transition to the start or end of a clip

#### 🔊 Audio Operations
- **adjust_audio_levels** — Adjust the volume of an audio clip
- **add_audio_keyframes** — Add keyframes to audio levels
- **mute_track** — Mute or unmute an entire audio track
- **link_audio_video** ✨ — Link/unlink audio and video components
- **apply_audio_effect** ✨ — Apply audio effects to clips

#### 🎛️ Color Correction
- **color_correct** — Apply basic color correction adjustments
- **apply_lut** — Apply a Look-Up Table (LUT) to a clip

#### 📤 Export & Rendering
- **export_sequence** — Render and export a sequence to a video file
- **export_frame** — Export a single frame as an image
- **add_to_render_queue** ✨ — Add sequence to render queue

#### 🎥 Advanced Features
- **create_multicam_sequence** — Create a multicamera sequence from multiple video clips
- **create_proxy_media** — Generate proxy versions of media
- **auto_edit_to_music** — Automatically edit video to music beats
- **stabilize_clip** — Apply video stabilization
- **speed_change** — Change the playback speed of a clip

#### 📍 Markers (NEW ✨)
- **add_marker** — Add timeline markers for navigation
- **delete_marker** — Remove markers from timeline
- **update_marker** — Update marker properties (name, color, comment)
- **list_markers** — List all markers in a sequence

#### 🎚️ Track Management (NEW ✨)
- **add_track** — Add new video or audio tracks
- **delete_track** — Remove tracks from sequence
- **rename_track** — Rename tracks
- **lock_track** — Lock/unlock tracks to prevent editing
- **toggle_track_visibility** — Show/hide video tracks

#### 📊 Project Information
- **list_project_items** — List all media items, bins, and assets in the project
- **list_sequences** — List all sequences in the project
- **list_sequence_tracks** — List all tracks in a sequence
- **get_project_info** — Get comprehensive project information
- **get_sequence_settings** ✨ — Get sequence resolution, framerate, etc.
- **get_clip_properties** ✨ — Get detailed clip information
- **get_render_queue_status** ✨ — Check render queue status

---

### ⚠️ Placeholder Tools (Require Further Implementation)

These tools are defined but return "not yet implemented" errors. They exist as scaffolding for future development:

#### 🔊 Advanced Audio (Placeholders)
- **normalize_audio** ❌ — Requires external audio analysis
- **audio_ducking** ❌ — Requires complex keyframe automation
- **extract_audio** ❌ — Requires export pipeline implementation

#### 🎬 Nested Sequences (Placeholders)
- **create_nested_sequence** ❌ — Requires selection API implementation
- **unnest_sequence** ❌ — Not available in Premiere Pro scripting API

#### ✂️ Advanced Editing (Placeholders)
- **replace_clip** ❌ — Requires complex clip replacement logic
- **slip_clip** ❌ — Requires precise in/out point manipulation
- **slide_clip** ❌ — Requires adjacent clip trimming logic
- **set_sequence_settings** ❌ — Cannot modify sequence settings after creation
- **set_clip_properties** ❌ — Limited by ExtendScript API

---

## ⚠️ What Doesn’t Work (and Why)

### ❌ Not Supported (Adobe Scripting Limitations)
- **add_text_overlay** — Text overlays (legacy titles) are deprecated/broken in modern Premiere Pro scripting
- **add_shape** — Shape/graphics overlays are not supported by Premiere scripting
- **Essential Graphics (MOGRTs)** — Not scriptable
- **Direct pixel manipulation** — Not possible

> **Why?** Adobe has removed or deprecated these scripting APIs. Only the features above are reliably scriptable.

---

## 🚦 Quick Start

### 1. Clone and Install
```sh
git clone https://github.com/hetpatel-11/Adobe_Premiere_Pro_MCP
cd Adobe_Premiere_Pro_MCP
npm install
```

### 2. Build & Start the MCP Server
```sh
npm run build
npm start
```

### 3. Install the UXP Plugin in Premiere Pro
1. **Open [Adobe UXP Developer Tool](https://developer.adobe.com/photoshop/uxp/2022/guides/devtool/)**
2. **Click "Add Plugin"** and select the `uxp-plugin/` folder from this repository
3. **Click "Load"** to enable the plugin
4. **Restart Premiere Pro**
5. **Open the plugin:**
   - Go to `Window > Extensions > MCP Bridge (UXP)`
   - The panel should show "Ready!" if the bridge is running

### 4. Connect Claude (or another AI agent)
- Configure Claude to use the MCP server as a tool endpoint
- Ask Claude to perform editing tasks (see supported features above)

---

## 🐞 Known Issues & Limitations

### API Limitations
- **Text/graphics overlays do not work** — Adobe deprecated legacy title APIs
- **Some scripting APIs are buggy or version-dependent** — Behavior varies between Premiere versions
- **UXP scripting is experimental** — Some features limited compared to CEP
- **10 tools are placeholders** — See "Placeholder Tools" section above

### Implementation Status
- **50+ tools fully functional** — Core editing workflows work reliably
- **Comprehensive test coverage** — 102 unit tests ensure stability
- **Security hardened** — Input validation, sanitization, and secure temp directories
- **Production-ready core** — Main features tested and validated

### Performance Notes
- **File-based communication** — Current bridge uses file polling (WebSocket upgrade planned)
- **Single-threaded execution** — Operations run sequentially
- **No caching yet** — Repeated queries re-execute (caching layer planned)

---

## 🔒 Security Features

This project includes comprehensive security hardening:

- **✅ No code injection vulnerabilities** — Removed all `eval()` usage
- **✅ Input validation** — All user inputs sanitized and validated
- **✅ Path traversal protection** — File paths validated against allowed directories
- **✅ Secure temp directories** — Session-isolated temp folders with restrictive permissions (0o700)
- **✅ Rate limiting** — Built-in rate limiter to prevent abuse
- **✅ Audit logging** — Security events logged for monitoring
- **✅ Schema validation** — Zod schemas enforce type safety on all tool inputs

## 💡 Why This Project Exists

This project explores how far AI-powered video editing automation can go in Premiere Pro. Built collaboratively with Claude Sonnet 4.5, it demonstrates:

- **Automating repetitive editing tasks** — Batch operations, consistent workflows
- **Building smarter AI workflows** — Natural language control of professional video tools
- **Exploring Adobe scripting boundaries** — Push the limits of what ExtendScript can do
- **Production-ready architecture** — Security, testing, and error handling from day one

### Limitations & Future Directions

For advanced graphics/text overlays, you'll need After Effects scripting, Photoshop automation, or third-party plugins. The roadmap includes:
- WebSocket communication (replacing file-based bridge)
- Caching layer for improved performance
- Authentication and authorization
- Completing the 10 placeholder tools

---

## 📚 References
- [Adobe Premiere Pro Scripting Guide](https://ppro-scripting.docsforadobe.dev/)
- [Adobe CEP Resources](https://github.com/Adobe-CEP)
---

## 🙏 Thanks & Contributions
If you find this useful or want to contribute, feel free to open issues or PRs. Honest feedback and improvements are welcome! 