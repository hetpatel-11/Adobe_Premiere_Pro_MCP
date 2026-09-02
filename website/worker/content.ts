export const SITE = "https://premiere-mcp.com"
export const VERSION = "1.2.8"
export const PACKAGE = "adobe-premiere-pro-mcp"
export const CLI = "premiere-pro-mcp"
export const REPO = "https://github.com/hetpatel-11/Adobe_Premiere_Pro_MCP"
export const NPM = "https://www.npmjs.com/package/adobe-premiere-pro-mcp"
export const ISSUES = `${REPO}/issues`

export const HOME_MD = `# Premiere Pro MCP

Premiere Pro MCP is the original open-source local MCP server for Adobe Premiere Pro. The product site is [premiere-mcp.com](https://premiere-mcp.com/). The npm package is \`${PACKAGE}\`. The official CLI is \`${CLI}\`.

283 tools talk to Premiere through a CEP file bridge on the same machine as Cursor, Claude, Codex, or Claude Code. Footage and project files stay on disk.

## When to use this

Use Premiere Pro MCP when an agent needs to edit a local Premiere Pro timeline: insert or overwrite clips, trim, razor, move, ripple, roll, apply effects, inspect sequences, import media, or queue an export. Do not use it for remote/cloud Premiere, After Effects, or hosted media APIs.

## Install

\`\`\`
npm install -g ${PACKAGE}
${CLI} --install-cep
${CLI} --doctor
\`\`\`

Register an MCP server named \`premiere-pro\` with command \`${CLI}\`. Then open Premiere: Window → Extensions → MCP Bridge (CEP), Start Bridge, and run \`verify_premiere_connection\` with no edits.

## For agents

- [Install docs](${SITE}/docs/)
- [OpenAPI](${SITE}/openapi.json)
- [llms.txt](${SITE}/llms.txt)
- [MCP client config](${SITE}/mcp.json)
- [CLI](${SITE}/cli/)
- [About](${SITE}/about/)
- [Contact](${SITE}/contact/)
- [Privacy](${SITE}/privacy/)
- [GitHub](${REPO})
- [npm](${NPM})

Unofficial. Not affiliated with Adobe.
`

export const DOCS_MD = `# Install Premiere Pro MCP

This is the install and compatibility guide for Premiere Pro MCP on premiere-mcp.com.

Package: \`${PACKAGE}\`. CLI: \`${CLI}\`. Requires Node.js 20+ and Adobe Premiere Pro 2020+ on the same computer as the MCP client.

## Install from npm

\`\`\`
npm install -g ${PACKAGE}
${CLI} --install-cep
${CLI} --doctor
\`\`\`

Add this to the client's MCP config:

\`\`\`
{
  "mcpServers": {
    "premiere-pro": {
      "command": "${CLI}"
    }
  }
}
\`\`\`

## Start the CEP bridge

Restart Premiere. Open Window → Extensions → MCP Bridge (CEP). Set the temp directory the installer printed. Start Bridge and wait until the panel is green.

## First prompt

\`Run verify_premiere_connection. Make no changes.\`

Then use \`search_tools\` and \`invoke_tool\`. Do not invent tool names. Hosts see five always-on tools unless \`PREMIERE_MCP_TOOLSET=full\`.

## Next

- [Homepage](${SITE}/)
- [CLI](${SITE}/cli/)
- [OpenAPI](${SITE}/openapi.json)
- [llms.txt](${SITE}/llms.txt)
- [GitHub](${REPO})
`

export const ABOUT_MD = `# About Premiere Pro MCP

Premiere Pro MCP is independent open-source software that lets AI agents edit Adobe Premiere Pro on the same computer. The canonical site is [premiere-mcp.com](https://premiere-mcp.com/). The repository is [hetpatel-11/Adobe_Premiere_Pro_MCP](${REPO}). The published package is [\`${PACKAGE}\`](${NPM}).

The server is local. An MCP client (Cursor, Claude Desktop, Claude Code, Codex, or any client that can spawn a local command) talks to the \`${CLI}\` process. That process writes ExtendScript into a private temp directory. The MCP Bridge CEP panel inside Premiere evaluates the script and writes JSON back. Green on the panel means both sides are ready.

The catalog is 283 tools covering timeline edits, effects and color, media and bins, audio and captions, export, and discovery. CEP is the production bridge. UXP is an experimental preview and is not installed by the CLI.

The project is MIT licensed. It is unofficial and is not affiliated with, endorsed by, or sponsored by Adobe. Adobe, Premiere, and Premiere Pro are trademarks of Adobe.

Support is through [GitHub issues](${ISSUES}), not a hosted editing service. Privacy details live on [ /privacy](${SITE}/privacy/).
`

export const CONTACT_MD = `# Contact Premiere Pro MCP

Premiere Pro MCP is an open-source project. There is no sales phone line and no hosted support desk. Product questions, bugs, and install failures go to GitHub issues for [hetpatel-11/Adobe_Premiere_Pro_MCP](${ISSUES}).

## How to get help

1. Read [install docs](${SITE}/docs/) and run \`${CLI} --doctor\`.
2. Confirm Premiere is open, a project is loaded, and Window → Extensions → MCP Bridge (CEP) is green.
3. Open an issue with the OS, Premiere version, Node version, client name, and the diagnostics file from the CEP panel if you have one.

Do not attach Premiere project files or footage unless you intend to make them public.

## Machine-readable contact

- Site: ${SITE}/
- Issues: ${ISSUES}
- Source: ${REPO}
- npm: ${NPM}
- OpenAPI: ${SITE}/openapi.json
- Privacy: ${SITE}/privacy/

This page is the public contact record for Premiere Pro MCP on premiere-mcp.com.
`

export const PRIVACY_MD = `# Privacy — Premiere Pro MCP

Last updated: August 27, 2026

Premiere Pro MCP is local software. It does not operate a hosted editing service and does not send Premiere project data, media, MCP request arguments, or tool results to the project maintainers.

## Local data

The MCP server and CEP bridge exchange command and response files in a local bridge directory you choose. Those files can contain project names, sequence names, media paths, and tool arguments or results. That data stays on your computer unless you share it, for example by attaching diagnostics to a GitHub issue.

## Anonymous usage telemetry

The MCP server sends anonymous usage telemetry by default. It records server starts (to count installs), failed tool calls, and at most one successful call per tool per install per day (so we can see that it works and which tools are used). Events include an anonymous install id, session id, tool name, success, duration, a coarse error class, package version, OS, CPU architecture, and Node.js version. They do not include project names, media paths, file contents, tool arguments, tool results, or usernames.

Opt out by unchecking Share anonymous usage data in the CEP panel, setting \`"telemetry": false\` in \`~/.premiere-mcp-bridge/config.json\`, or setting \`PREMIERE_MCP_TELEMETRY=0\`.

## Update checks

The server may request the latest version from the public npm registry. That request does not include the install id or project data. Disable with \`PREMIERE_MCP_UPDATE_CHECK=0\`.

## Contact

Privacy questions: ${ISSUES}
`

export const CLI_MD = `# Premiere Pro MCP CLI

The official CLI for Premiere Pro MCP is \`${CLI}\`, published on npm as [\`${PACKAGE}\`](${NPM}).

\`\`\`
npm install -g ${PACKAGE}
${CLI} --install-cep
${CLI} --doctor
${CLI} --help
\`\`\`

\`${CLI}\` starts the local MCP server (stdio) that Cursor, Claude, Codex, and other MCP clients spawn. \`--install-cep\` copies the production CEP bridge into Premiere's extensions folder for the current user. \`--doctor\` checks Node, the CLI on PATH, and the CEP install.

This is not a remote HTTP API. Agents should install the CLI on the same machine as Premiere, register \`premiere-pro\` with command \`${CLI}\`, then call \`verify_premiere_connection\`.

See [docs](${SITE}/docs/), [OpenAPI](${SITE}/openapi.json), and [mcp.json](${SITE}/mcp.json).
`

export const NOT_FOUND_MD = `# Not found

That path is not on premiere-mcp.com.

Try:

- [Homepage](${SITE}/)
- [Docs](${SITE}/docs/)
- [llms.txt](${SITE}/llms.txt)
- [Sitemap](${SITE}/sitemap.xml)
- [OpenAPI](${SITE}/openapi.json)
- [About](${SITE}/about/)
`

export const PAGES: Record<
  string,
  { title: string; description: string; markdown: string }
> = {
  "/": {
    title: "Premiere Pro MCP — local MCP server for Adobe Premiere Pro",
    description:
      "Premiere Pro MCP is the original open-source local MCP server for Adobe Premiere Pro. 283 tools, CEP file bridge, npm package adobe-premiere-pro-mcp.",
    markdown: HOME_MD,
  },
  "/docs/": {
    title: "Install Premiere Pro MCP — Cursor, Claude, Codex",
    description:
      "Install adobe-premiere-pro-mcp for Cursor, Claude Desktop, Claude Code, and Codex. CEP bridge setup, first prompt, and troubleshooting.",
    markdown: DOCS_MD,
  },
  "/about/": {
    title: "About Premiere Pro MCP",
    description:
      "Premiere Pro MCP is independent open-source software that lets AI agents edit Adobe Premiere Pro locally via MCP.",
    markdown: ABOUT_MD,
  },
  "/contact/": {
    title: "Contact Premiere Pro MCP",
    description:
      "Contact Premiere Pro MCP through GitHub issues. No phone support. Canonical site: premiere-mcp.com.",
    markdown: CONTACT_MD,
  },
  "/privacy/": {
    title: "Privacy — Premiere Pro MCP",
    description:
      "Premiere Pro MCP privacy policy. Editing is local. Optional anonymous telemetry can be turned off.",
    markdown: PRIVACY_MD,
  },
  "/cli/": {
    title: "Premiere Pro MCP CLI — premiere-pro-mcp",
    description:
      "Official CLI premiere-pro-mcp on npm as adobe-premiere-pro-mcp. Install the CEP bridge and start the local MCP server.",
    markdown: CLI_MD,
  },
}

export function markdownToHtml(markdown: string): string {
  const lines = markdown.trim().split("\n")
  const out: string[] = []
  let inCode = false
  let code: string[] = []

  const flushCode = () => {
    if (!inCode) return
    out.push(`<pre><code>${escapeHtml(code.join("\n"))}</code></pre>`)
    code = []
    inCode = false
  }

  for (const line of lines) {
    if (line.startsWith("```")) {
      if (inCode) flushCode()
      else inCode = true
      continue
    }
    if (inCode) {
      code.push(line)
      continue
    }
    if (line.startsWith("# ")) {
      out.push(`<h1>${inline(line.slice(2))}</h1>`)
      continue
    }
    if (line.startsWith("## ")) {
      out.push(`<h2>${inline(line.slice(3))}</h2>`)
      continue
    }
    if (line.startsWith("- ")) {
      out.push(`<ul><li>${inline(line.slice(2))}</li></ul>`)
      continue
    }
    if (/^\d+\. /.test(line)) {
      out.push(`<ol><li>${inline(line.replace(/^\d+\. /, ""))}</li></ol>`)
      continue
    }
    if (line.trim() === "") {
      continue
    }
    out.push(`<p>${inline(line)}</p>`)
  }
  flushCode()
  return mergeLists(out.join("\n"))
}

function mergeLists(html: string): string {
  return html
    .replace(/<\/ul>\n<ul>/g, "")
    .replace(/<\/ol>\n<ol>/g, "")
}

function inline(text: string): string {
  return escapeHtml(text)
    .replace(
      /\[([^\]]+)\]\((https?:[^)]+|\/[^)]+)\)/g,
      '<a href="$2">$1</a>',
    )
    .replace(/`([^`]+)`/g, "<code>$1</code>")
}

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
}

export function wrapPage(opts: {
  title: string
  description: string
  canonical: string
  body: string
}): string {
  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>${escapeHtml(opts.title)}</title>
  <meta name="description" content="${escapeHtml(opts.description)}" />
  <link rel="canonical" href="${escapeHtml(opts.canonical)}" />
  <link rel="icon" href="/favicon.svg" type="image/svg+xml" />
  <link rel="alternate" type="text/markdown" href="${escapeHtml(opts.canonical)}" />
  <meta name="theme-color" content="#0a1c1b" />
  <style>
    :root { color-scheme: dark; }
    body { margin: 0; background: #0a1413; color: #e8f5f2; font: 16px/1.55 ui-sans-serif, system-ui, sans-serif; }
    a { color: #85e7cd; }
    header, footer, main { max-width: 44rem; margin: 0 auto; padding: 1.25rem 1rem; }
    header, footer { display: flex; flex-wrap: wrap; gap: 0.75rem 1rem; align-items: center; }
    header { justify-content: space-between; border-bottom: 1px solid #1d3330; }
    footer { border-top: 1px solid #1d3330; color: #9bb8b2; font-size: 0.85rem; }
    nav { display: flex; flex-wrap: wrap; gap: 0.85rem; }
    h1 { font-size: 2rem; line-height: 1.2; }
    h2 { font-size: 1.25rem; margin-top: 2rem; }
    code, pre { font-family: ui-monospace, SFMono-Regular, Menlo, monospace; }
    pre { overflow: auto; padding: 1rem; background: #10201d; border-radius: 0.75rem; }
    ul, ol { padding-left: 1.2rem; }
  </style>
</head>
<body>
  <header>
    <a href="/">premiere-mcp.com</a>
    <nav>
      <a href="/docs/">Docs</a>
      <a href="/cli/">CLI</a>
      <a href="/about/">About</a>
      <a href="/contact/">Contact</a>
      <a href="/openapi.json">OpenAPI</a>
    </nav>
  </header>
  <main>
${opts.body}
  </main>
  <footer>
    <a href="/privacy/">Privacy</a>
    <a href="/llms.txt">llms.txt</a>
    <a href="${REPO}">GitHub</a>
    <a href="${NPM}">npm</a>
  </footer>
</body>
</html>
`
}
