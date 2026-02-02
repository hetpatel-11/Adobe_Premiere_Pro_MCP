# Quick Start Guide

Get Adobe Premiere Pro working with Claude in 5 minutes.

## Step 1: Enable CEP Extensions (30 seconds)

Open Terminal and run:

```bash
defaults write com.adobe.CSXS.12 PlayerDebugMode 1
defaults write com.adobe.CSXS.11 PlayerDebugMode 1
defaults write com.adobe.CSXS.10 PlayerDebugMode 1
```

## Step 2: Install the CEP Plugin (1 minute)

```bash
# Navigate to the project
cd /Users/YOUR_USERNAME/Desktop/Adobe_Premiere_Pro_MCP/Adobe_Premiere_Pro_MCP

# Install the plugin
mkdir -p ~/Library/Application\ Support/Adobe/CEP/extensions
cp -r cep-plugin ~/Library/Application\ Support/Adobe/CEP/extensions/MCPBridgeCEP
```

Replace `YOUR_USERNAME` with your actual username!

## Step 3: Build the MCP Server (1 minute)

```bash
# Install dependencies and build
npm install
npm run build
```

## Step 4: Configure Claude Desktop (1 minute)

Edit this file:
```
~/Library/Application Support/Claude/claude_desktop_config.json
```

Add this configuration:

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

⚠️ **Important:** Replace `/Users/YOUR_USERNAME/` with your actual path!

## Step 5: Restart Everything (1 minute)

1. **Quit Claude Desktop** completely (Cmd+Q)
2. **Quit Premiere Pro** completely (Cmd+Q)
3. **Reopen both applications**

## Step 6: Start the Bridge (1 minute)

In Premiere Pro:

1. Go to: **Window → Extensions → MCP Bridge (CEP)**
2. In the panel:
   - Temp Directory: `/tmp/premiere-mcp-bridge`
   - Click **"Save Configuration"**
   - Click **"Start Bridge"**
   - Click **"Test Connection"**

You should see: ✅ **Premiere Pro connection OK**

## Step 7: Test It! (30 seconds)

In Claude Desktop, ask:

```
"What's my current Premiere Pro project info?"
```

If Claude responds with your project details, **you're done!** 🎉

## Common Issues

### Plugin doesn't appear in Premiere Pro?
- Restart Premiere Pro completely
- Check if plugin is installed: `ls ~/Library/Application\ Support/Adobe/CEP/extensions/MCPBridgeCEP/`

### Claude doesn't see the tools?
- Restart Claude Desktop completely
- Check the config file path is correct
- Make sure you replaced `YOUR_USERNAME` with your actual username

### Connection test fails?
- Make sure Premiere Pro has a project open
- Make sure temp directory is exactly `/tmp/premiere-mcp-bridge`
- Reload the CEP panel: right-click → Reload

### Still stuck?
See the full README.md for detailed troubleshooting.

---

**Next:** See README.md for example usage and all available features!
