# Adobe Premiere Pro MCP Server

Control Adobe Premiere Pro with natural language through Claude using the Model Context Protocol (MCP).

> ⚠️ **Transparency Notice:** This project was developed with AI assistance (Claude Sonnet 4.5) as an experimental proof-of-concept. 

<a href="https://glama.ai/mcp/servers/@hetpatel-11/Adobe_Premiere_Pro_MCP">
  <img width="380" height="200" src="https://glama.ai/mcp/servers/@hetpatel-11/Adobe_Premiere_Pro_MCP/badge" alt="Adobe Premiere Pro MCP server" />
</a>

## What This Does

This MCP server lets you control Premiere Pro by talking to Claude:
- "Import my video file and add it to the timeline"
- "Create a new sequence called 'Final Edit'"
- "Export my current sequence"
- "What items are in my project?"

## Demo

![Adobe Premiere Pro MCP in Action](images/Screenshot%202026-02-01%20at%207.05.17%20PM.png)

*MCP Bridge (CEP) panel in Premiere Pro showing **Connected** and **Premiere Pro: Ready**, with Claude successfully retrieving project info (e.g. Test_1.prproj) via natural language.*

## Quick Start

### Prerequisites

- **macOS** (Windows support coming soon)
- **Adobe Premiere Pro** 2020 or later
- **Claude Desktop** app
- **Node.js** 18+

### Installation (5 minutes)

**1. Clone and build the project:**

```bash
cd /Users/hetpatel/Desktop/Adobe_Premiere_Pro_MCP/Adobe_Premiere_Pro_MCP
npm install
npm run build
```

**2. Enable CEP extensions:**

```bash
defaults write com.adobe.CSXS.12 PlayerDebugMode 1
defaults write com.adobe.CSXS.11 PlayerDebugMode 1
defaults write com.adobe.CSXS.10 PlayerDebugMode 1
```

**3. Install the CEP plugin:**

```bash
mkdir -p ~/Library/Application\ Support/Adobe/CEP/extensions
cp -r cep-plugin ~/Library/Application\ Support/Adobe/CEP/extensions/MCPBridgeCEP
```

**4. Add MCP server to Claude Desktop config:**

Edit `~/Library/Application Support/Claude/claude_desktop_config.json`:

```json
{
  "mcpServers": {
    "premiere-pro": {
      "command": "node",
      "args": ["/Users/YOUR_USERNAME/Desktop/Adobe_Premiere_Pro_MCP/Adobe_Premiere_Pro_MCP/dist/index.js"],
      "env": {
        "PREMIERE_TEMP_DIR": "/tmp/premiere-mcp-bridge"
      }
    }
  }
}
```

⚠️ **Replace `/Users/YOUR_USERNAME/` with your actual home directory path!**

**5. Restart everything:**

```bash
# Quit Claude Desktop completely (Cmd+Q) and reopen
# Quit Premiere Pro completely (Cmd+Q) and reopen
```

**6. Configure the bridge in Premiere Pro:**

1. Open Premiere Pro
2. Go to: **Window → Extensions → MCP Bridge (CEP)**
3. In the panel:
   - Set **Temp Directory** to: `/tmp/premiere-mcp-bridge`
   - Click **"Save Configuration"**
   - Click **"Start Bridge"**
   - Click **"Test Connection"**
4. You should see green status: "✅ Premiere Pro connection OK"

**7. Test with Claude:**

In Claude Desktop, ask:
```
"What's my current Premiere Pro project info?"
```

If Claude responds with your project details, **it's working!** 🎉

## How It Works

```
┌─────────────┐         ┌──────────────┐         ┌──────────────┐
│   Claude    │  MCP    │  Node.js     │  Files  │  CEP Plugin  │
│  Desktop    │◄───────►│  MCP Server  │◄───────►│  (Premiere)  │
└─────────────┘         └──────────────┘         └──────────────┘
                                                          │
                                                          ▼
                                                  ┌──────────────┐
                                                  │  Premiere    │
                                                  │  ExtendScript│
                                                  └──────────────┘
```

1. You ask Claude to do something in Premiere Pro
2. Claude calls the MCP server tool
3. MCP server writes a command file to `/tmp/premiere-mcp-bridge/`
4. CEP plugin watches the folder, sees the command
5. CEP plugin executes ExtendScript in Premiere Pro
6. Result is written back to a response file
7. MCP server reads the result and returns to Claude
8. Claude shows you the result

## Tool Status

### ✅ Working Tools (Verified)
- `get_project_info` - Get project information
- `list_project_items` - List all items in project
- `get_sequence_settings` - Get sequence settings

### ⚠️ Known Issues
Some tools have bugs and are currently not working. See [KNOWN_ISSUES.md](KNOWN_ISSUES.md) for:
- Detailed issue descriptions
- Root cause analysis
- Workarounds for users
- Fix instructions for developers

Common issues:
- `list_sequences` - Missing return statement in ExtendScript
- `create_bin` - Variable scope issue
- `import_media` - Path validation too strict
- `list_sequence_tracks` - ExtendScript execution error

**Workaround:** For media import, manually drag files into Premiere Pro or use File > Import.

## Example Usage

Once set up, you can ask Claude:

**Import and edit:**
```
"Import /Users/me/Desktop/video.mp4 and add it to a new sequence called 'My Edit'"
```

**Apply effects:**
```
"Apply a gaussian blur effect to the first clip in the timeline"
```

**Export:**
```
"Export the current sequence to ~/Desktop/output.mp4 in H.264 format"
```

**Query project:**
```
"What sequences do I have in my project?"
"List all video clips in my project"
```

## Troubleshooting

### CEP Plugin doesn't appear in Premiere Pro

**Check 1:** Verify PlayerDebugMode is enabled
```bash
defaults read com.adobe.CSXS.12 PlayerDebugMode
# Should return: 1
```

**Check 2:** Verify plugin is installed
```bash
ls -la ~/Library/Application\ Support/Adobe/CEP/extensions/MCPBridgeCEP/
# Should show: index.html, bridge-cep.js, CSInterface.js, CSXS/manifest.xml
```

**Check 3:** Restart Premiere Pro completely (Cmd+Q, then reopen)

### "EvalScript error" in CEP plugin

**Solution:** The plugin has been updated with ExtendScript compatibility fixes. Reload the panel:
- Right-click in the panel → "Reload" (if available)
- Or close/reopen: Window → Extensions → MCP Bridge (CEP)
- Or restart Premiere Pro

### Claude can't see Premiere Pro tools

**Check 1:** Restart Claude Desktop completely (Cmd+Q, then reopen)

**Check 2:** Verify config path is correct
```bash
cat ~/Library/Application\ Support/Claude/claude_desktop_config.json
```
Make sure the path to `dist/index.js` matches your actual project location.

### Commands timeout / no response

**Check 1:** Bridge is started in Premiere Pro
- CEP panel should show: "✅ Connected"
- Click "Test Connection" to verify

**Check 2:** Temp directory paths match exactly
- In CEP panel: `/tmp/premiere-mcp-bridge`
- In Claude config: `"PREMIERE_TEMP_DIR": "/tmp/premiere-mcp-bridge"`

**Check 3:** Check for command files
```bash
ls -la /tmp/premiere-mcp-bridge/
# Should show config.json and occasionally command-*.json files
```

### Still having issues?

1. Check the **Activity Log** in the CEP plugin panel for errors
2. Make sure you have a **project open** in Premiere Pro
3. Verify all paths are absolute (not relative)
4. Check that `/tmp/premiere-mcp-bridge/` exists and is writable

## Technical Details

### Why CEP instead of UXP?

- **CEP has full ExtendScript support** in Premiere Pro
- UXP support in Premiere Pro is limited (no ExtendScript execution)
- CEP works on all Premiere Pro versions 2020-2025
- UXP is better for Photoshop/Illustrator, but not ready for Premiere Pro

### ExtendScript Compatibility

ExtendScript is based on JavaScript 1.5 (ES3 from 2000), so the plugin avoids:
- Modern array methods: `forEach`, `map`, `filter`
- Arrow functions: `() => {}`
- Template literals: `` `string ${var}` ``
- `const`, `let` (uses `var` instead)
- `toISOString()` (uses manual date formatting)

### Security

- All scripts are validated before execution
- Dangerous patterns blocked: `eval`, `require`, `import`, etc.
- 500KB script size limit
- Temp directory has restricted permissions (700)

## License

MIT License - See LICENSE.md

## Contributing

Contributions welcome! Please:
1. Fork the repository
2. Create a feature branch
3. Test with Premiere Pro
4. Submit a pull request

---

**Built with the Model Context Protocol** • [Claude Desktop](https://claude.ai/download) • [MCP Documentation](https://modelcontextprotocol.io)
