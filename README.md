# 🎬 MCP Adobe Premiere Pro — AI Video Editing Automation

> **AI meets Premiere Pro.** Control your edits with natural language and automate your workflow with Claude or any AI agent, powered by the Model Context Protocol (MCP).

<a href="https://glama.ai/mcp/servers/@hetpatel-11/Adobe_Premiere_Pro_MCP">
  <img width="380" height="200" src="https://glama.ai/mcp/servers/@hetpatel-11/Adobe_Premiere_Pro_MCP/badge" alt="Adobe Premiere Pro MCP server" />
</a>

---

## ✨ What is This?
This project is an **AI-powered automation bridge for Adobe Premiere Pro**. It exposes a set of editing tools (via MCP) so you can:
- 🗣️ **Talk to your editor** (via Claude or other AI agents)
- ⚡ **Automate repetitive tasks**
- 🧠 **Build smarter, context-aware workflows**

---

## 🧩 Using with UXP DevTools (Experimental)

You can also use this project as a UXP panel in Premiere Pro (24.4+):

1. Open [Adobe UXP DevTools](https://developer.adobe.com/photoshop/uxp/2022/guides/devtool/).
2. Click “Add Plugin” and select the `uxp-plugin/` folder.
3. Start the panel in DevTools and open it in Premiere Pro via `Window > Plugins > MCP Bridge (UXP)`.

**⚠️ Note:**
- UXP scripting in Premiere Pro is **experimental and limited**. Some features (like timeline and sequence editing) may not be available yet.
- For full automation, use the CEP (legacy) panel.

---

## 🛠️ Supported Tools

### 📁 Project Management
- **create_project** — Create a new Premiere Pro project
- **open_project** — Open an existing project file
- **save_project** — Save the current project
- **save_project_as** — Save the project with a new name/location

### 📂 Media Management
- **import_media** — Import a media file (video, audio, image)
- **import_folder** — Import all media files from a folder
- **create_bin** — Create a new bin (folder) in the project panel

### 🎬 Sequence Management
- **create_sequence** — Create a new sequence (timeline)
- **duplicate_sequence** — Duplicate an existing sequence
- **delete_sequence** — Delete a sequence

### ⏱️ Timeline Operations
- **add_to_timeline** — Add a media clip to a sequence timeline
- **remove_from_timeline** — Remove a clip from the timeline
- **move_clip** — Move a clip to a different position
- **trim_clip** — Adjust the in/out points of a clip
- **split_clip** — Split a clip at a specific time point

### 🎨 Effects & Transitions
- **apply_effect** — Apply a visual or audio effect to a clip
- **remove_effect** — Remove an effect from a clip
- **add_transition** — Add a transition between two clips
- **add_transition_to_clip** — Add a transition to the start or end of a clip

### 🔊 Audio Operations
- **adjust_audio_levels** — Adjust the volume of an audio clip
- **add_audio_keyframes** — Add keyframes to audio levels
- **mute_track** — Mute or unmute an entire audio track

### 🎛️ Color Correction
- **color_correct** — Apply basic color correction adjustments
- **apply_lut** — Apply a Look-Up Table (LUT) to a clip

### 📤 Export & Rendering
- **export_sequence** — Render and export a sequence to a video file
- **export_frame** — Export a single frame as an image

### 🎥 Advanced Features
- **create_multicam_sequence** — Create a multicamera sequence from multiple video clips
- **create_proxy_media** — Generate proxy versions of media
- **auto_edit_to_music** — Automatically edit video to music beats
- **stabilize_clip** — Apply video stabilization
- **speed_change** — Change the playback speed of a clip

### 🔍 Project/Media/Sequence Discovery
- **list_project_items** — List all media items, bins, and assets in the project
- **list_sequences** — List all sequences in the project
- **list_sequence_tracks** — List all tracks in a sequence
- **get_project_info** — Get comprehensive project information

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
cd MCP_Adobe_Premiere_Pro
npm install
```

### 2. Build & Start the MCP Server
```sh
npm run build
npm start
```

### 3. Install the CEP Extension in Premiere Pro
1. **Copy the `PremiereRemote` extension folder** to your Adobe CEP extensions directory:
   - **macOS:** `~/Library/Application Support/Adobe/CEP/extensions/`
   - **Windows:** `%APPDATA%/Adobe/CEP/extensions/`
2. **Enable loading unsigned extensions:**
   - macOS: Edit `~/Library/Preferences/com.adobe.CSXS.9.plist` and set `PlayerDebugMode` to `1`.
   - Windows: Use `regedit` to set `PlayerDebugMode` to `1` under `HKEY_CURRENT_USER/Software/Adobe/CSXS.9`.
   - [CEP Debugging Guide](https://github.com/Adobe-CEP/Getting-Started-guides/blob/master/Setting-up-Your-Environment.md)
3. **Restart Premiere Pro.**
4. **Open the extension:**
   - Go to `Window > Extensions (Legacy) > PremiereRemote`.
   - The panel should show "Ready!" if the bridge is running.

### 4. Connect Claude (or another AI agent)
- Configure Claude to use the MCP server as a tool endpoint.
- Ask Claude to perform editing tasks (see supported features above).

---

## 🐞 Known Issues & Limitations
- **Text/graphics overlays do not work** (see above)
- **Some scripting APIs are buggy or version-dependent**
- **CEP extensions are deprecated** in the latest Adobe apps (but still work for now)
- **UXP scripting is experimental and limited** in Premiere Pro (see above)
- **Error handling is robust, but some failures may be silent** due to Premiere scripting quirks
- **This is a proof-of-concept / starting point** — not a polished commercial product

---

## 💡 Why This Project Exists
I wanted to see how far AI-powered video editing automation could go in Premiere Pro. There are real limitations, but this project is a great starting point for:
- Automating repetitive editing tasks
- Building smarter AI workflows
- Exploring the boundaries of what’s possible with Adobe scripting

If you want to go further (e.g., advanced graphics/text), you’ll need After Effects scripting, Photoshop, or third-party plugins.

---

## 📚 References
- [Adobe Premiere Pro Scripting Guide](https://ppro-scripting.docsforadobe.dev/)
- [Adobe CEP Resources](https://github.com/Adobe-CEP)
---

## 🙏 Thanks & Contributions
If you find this useful or want to contribute, feel free to open issues or PRs. Honest feedback and improvements are welcome! 