---
name: edit-premiere-project
description: Install, verify, inspect, edit, and export local Adobe Premiere Pro projects through the Premiere MCP Bridge. Use for project discovery, timeline edits, media ingest, effects, captions, audio, and delivery exports.
---

# Edit Premiere Project

Operate Premiere through the `premiere-pro` MCP tools. Preserve the user's project state, make only requested changes, and verify each mutation with a follow-up read.

## Establish A Live Session

1. Call `get_capabilities` first. It reports local installation state without contacting Premiere.
2. Call `verify_premiere_connection` before editing. If it fails, stop and ask the user to start `Window > Extensions > MCP Bridge (CEP)` in Premiere.
3. Inspect the active project, sequence, tracks, and media before making an edit.

## Editing Rules

- Prefer read-only discovery before changing the project.
- Use real imported media and concrete project item and sequence IDs.
- Ask before deleting clips, tracks, sequences, media, overwriting exports, or saving over an important project.
- For generated edits, create a clearly named sequence instead of modifying the active sequence when practical.
- Treat any `success: false` result as a stop condition. Run diagnostics or re-inspect state before retrying.
- Verify an edit with the narrowest relevant read tool before reporting it complete.

## Setup And Recovery

Install the companion bridge on the same computer as Premiere and Codex:

```bash
npm install -g adobe-premiere-pro-mcp
premiere-pro-mcp --install-cep
premiere-pro-mcp --doctor
```

Restart Premiere Pro, open `Window > Extensions > MCP Bridge (CEP)`, start the bridge, then run `verify_premiere_connection`.
