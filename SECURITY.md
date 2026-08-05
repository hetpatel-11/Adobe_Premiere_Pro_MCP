# Security

This MCP runs locally and can change Premiere Pro projects. Treat an MCP client with access to this server as capable of editing the currently open project.

- Use the supported CEP bridge only from trusted local MCP clients.
- Run `verify_premiere_connection` before an editing workflow and inspect the active project and sequence it reports.
- Keep Premiere Pro, the CEP bridge, and the MCP client on the same trusted machine.
- Do not install unsigned CEP archives from untrusted sources.

To report a vulnerability privately, open a GitHub security advisory for this repository rather than publishing exploit details in an issue.
