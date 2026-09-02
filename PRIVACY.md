# Privacy Policy

Last updated: August 27, 2026

Adobe Premiere Pro MCP Bridge is local software. It does not operate a hosted editing service and does not send Premiere project data, media, MCP request arguments, or tool results to us.

## Local data

To operate, the MCP server and CEP bridge exchange command and response files in the local bridge directory selected by the user. These files can contain Premiere project names, sequence names, media paths, and tool arguments/results. The CEP panel can also create a local diagnostics file when the user explicitly runs diagnostics.

This data remains on the user's computer unless the user chooses to share it, for example by attaching diagnostics to a support issue.

## Anonymous usage telemetry

The MCP server sends anonymous usage telemetry by default so we can see how many people use the project, which tools they use, and which tools fail. This is separate from Premiere project data.

Each event includes only:

- an anonymous install id stored in `~/.premiere-mcp-bridge/install-id`
- a per-process session id
- the event type (`server_started`, or `tool_called`)
- the tool name and whether it succeeded. Every failure is stored. A successful call is stored at most once per tool per install per day
- on failures: duration in milliseconds, and a coarse error class such as `timeout` or `not_found`
- on failures: a short error code (`zod.invalid_type`, `bridge.panel_absent`), the Zod field names that failed (`duration,position`), whether the tool said not to retry, a status token, and a path-stripped copy of the error template (`/Users/...` becomes `<path>`)
- package version, operating system, CPU architecture, and Node.js version

It does **not** include project names, sequence names, media paths, file contents, tool arguments, tool results, or usernames. Error text is stored only after filesystem paths and filenames are stripped; if a path still remains, that field is dropped. Cloudflare sees the connecting IP the way it does for any HTTPS request; we do not store IP addresses in the telemetry database.

Events are sent to a Cloudflare Worker operated for this project and stored in Cloudflare D1.

### Opt out

Telemetry is on unless you turn it off in any of these ways:

1. Uncheck **Share anonymous usage data** in `Window > Extensions > MCP Bridge (CEP)` and save, or
2. Set `telemetry` to `false` in `~/.premiere-mcp-bridge/config.json`, or
3. Set `PREMIERE_MCP_TELEMETRY=0` in the MCP server environment, or
4. Set `DO_NOT_TRACK=1`

`PREMIERE_MCP_TELEMETRY=1` turns telemetry back on even if `DO_NOT_TRACK` is set.

## Update checks

The MCP server and CEP panel may request the latest published version from the public npm registry (`registry.npmjs.org/adobe-premiere-pro-mcp/latest`) so they can show an **Update now** / **Later** prompt. That request includes a package User-Agent and does not include the install id, project data, or tool arguments.

Turn this off with `PREMIERE_MCP_UPDATE_CHECK=0`, or set `"updateCheck": false` in `~/.premiere-mcp-bridge/config.json`. **Later** snoozes the prompt for 7 days.

## Third parties

Installing this project through npm, downloading releases from GitHub, using Adobe Premiere Pro, connecting an MCP client such as Claude Desktop, Claude Code, Codex, or VS Code, or sending opted-in telemetry through Cloudflare is governed by the respective provider's privacy policy. Premiere project data is not included in telemetry.

## Contact

For privacy questions, open a GitHub issue at https://github.com/hetpatel-11/Adobe_Premiere_Pro_MCP/issues.
