import { ArticlePage } from "@/components/article-page"
import { ISSUES } from "@/lib/snippets"

export function PrivacyPage() {
  return (
    <ArticlePage
      page="privacy"
      kicker="Policy"
      title="Privacy — Premiere Pro MCP"
    >
      <p>Last updated August 27, 2026.</p>
      <p>
        Premiere Pro MCP is local software. It does not operate a hosted
        editing service and does not send Premiere project data, media, MCP
        request arguments, or tool results to the project maintainers.
      </p>
      <h2 className="text-xl font-semibold tracking-tight text-foreground">
        Local data
      </h2>
      <p>
        The MCP server and CEP bridge exchange command and response files in a
        local bridge directory you choose. Those files can contain project
        names, sequence names, media paths, and tool arguments or results. That
        data stays on your computer unless you share it.
      </p>
      <h2 className="text-xl font-semibold tracking-tight text-foreground">
        Anonymous usage telemetry
      </h2>
      <p>
        The MCP server sends anonymous usage telemetry by default. It records
        server starts (to count installs), failed tool calls, and at most one
        successful call per tool per install per day. Events include an
        anonymous install id, session id, tool name, success, duration, a
        coarse error class, package version, OS, CPU architecture, and Node.js
        version. They do not include project names, media paths, file
        contents, tool arguments, tool results, or usernames.
      </p>
      <p>
        Opt out by unchecking Share anonymous usage data in the CEP panel,
        setting <code>"telemetry": false</code> in{" "}
        <code>~/.premiere-mcp-bridge/config.json</code>, or setting{" "}
        <code>PREMIERE_MCP_TELEMETRY=0</code>.
      </p>
      <h2 className="text-xl font-semibold tracking-tight text-foreground">
        Update checks
      </h2>
      <p>
        The server may request the latest version from the public npm registry.
        That request does not include the install id or project data. Disable
        with <code>PREMIERE_MCP_UPDATE_CHECK=0</code>.
      </p>
      <p>
        Privacy questions:{" "}
        <a className="text-foreground underline underline-offset-4" href={ISSUES}>
          GitHub issues
        </a>
        .
      </p>
    </ArticlePage>
  )
}
