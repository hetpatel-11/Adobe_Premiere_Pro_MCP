import { ArticlePage } from "@/components/article-page"
import { CopyBlock } from "@/components/copy-block"
import { CLIENT_CONFIG, NPM, NPM_INSTALL } from "@/lib/snippets"

export function CliPage() {
  return (
    <ArticlePage
      page="cli"
      kicker="CLI"
      title="Premiere Pro MCP CLI"
    >
      <p>
        The official CLI is <code>premiere-pro-mcp</code>, published on npm as{" "}
        <a className="text-foreground underline underline-offset-4" href={NPM}>
          adobe-premiere-pro-mcp
        </a>
        . It starts the local MCP server that Cursor, Claude, Codex, and other
        clients spawn.
      </p>
      <CopyBlock value={NPM_INSTALL} label="terminal" />
      <p>
        <code>--install-cep</code> copies the production CEP bridge into
        Premiere. <code>--doctor</code> checks Node, the CLI on PATH, and the
        CEP install.
      </p>
      <CopyBlock value={CLIENT_CONFIG} label="mcp.json" />
      <p>
        This is not a remote HTTP API. Install the CLI on the same machine as
        Premiere, then run <code>verify_premiere_connection</code>. See{" "}
        <a className="text-foreground underline underline-offset-4" href="/docs/">
          install docs
        </a>{" "}
        and{" "}
        <a
          className="text-foreground underline underline-offset-4"
          href="/openapi.json"
        >
          OpenAPI
        </a>
        .
      </p>
    </ArticlePage>
  )
}
