import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import { CopyBlock } from "@/components/copy-block"
import { SiteShell } from "@/components/site-shell"
import {
  CLAUDE_CODE_PLUGIN,
  CLIENT_CONFIG,
  CODEX_PLUGIN,
  MCPB,
  NPM,
  NPM_INSTALL,
  REPO,
  VERIFY_PROMPT,
} from "@/lib/snippets"

const TOC = [
  ["#install", "Install"],
  ["#cursor", "Cursor"],
  ["#claude-desktop", "Claude Desktop"],
  ["#claude-code", "Claude Code"],
  ["#codex", "Codex"],
  ["#bridge", "Start the CEP bridge"],
  ["#verify", "First prompt"],
  ["#catalog", "Tool catalog"],
  ["#how", "How the bridge works"],
  ["#compat", "Compatibility"],
  ["#troubleshoot", "Troubleshooting"],
] as const

export function DocsPage() {
  return (
    <SiteShell page="docs">
      <main className="mx-auto grid max-w-5xl gap-10 px-4 py-16 lg:grid-cols-[220px_1fr]">
        <aside className="hidden lg:block">
          <nav className="sticky top-20 flex flex-col gap-2 text-sm text-muted-foreground">
            <p className="font-medium text-foreground">On this page</p>
            {TOC.map(([href, label]) => (
              <a key={href} className="hover:text-foreground" href={href}>
                {label}
              </a>
            ))}
          </nav>
        </aside>

        <div>
          <Badge variant="secondary">Setup, tools, compatibility</Badge>
          <h1 className="mt-4 text-4xl font-semibold tracking-tight text-balance">
            Install Premiere Pro MCP
          </h1>
          <p className="mt-4 max-w-2xl text-muted-foreground text-pretty">
            Premiere Pro MCP is the original local MCP server for Adobe Premiere
            Pro. The npm package is <code>adobe-premiere-pro-mcp</code>. The
            CLI is <code>premiere-pro-mcp</code>. This page is the install and
            compatibility guide for premiere-mcp.com — not a README paste.
          </p>

          <section id="install" className="mt-12 scroll-mt-20">
            <h2 className="text-2xl font-semibold tracking-tight">
              Install from npm
            </h2>
            <p className="mt-3 text-sm text-muted-foreground">
              Use this on the same computer as Premiere and your assistant.
              Requires Node.js 20+.
            </p>
            <div className="mt-4">
              <CopyBlock value={NPM_INSTALL} label="terminal" />
            </div>
            <p className="mt-3 text-sm text-muted-foreground">
              <code>--install-cep</code> installs the CEP bridge, enables the
              required CEP debug setting, prepares the bridge directory, and
              configures supported local clients. <code>--doctor</code> checks
              the server build, CEP install, bridge directory, debug setting,
              and client config.
            </p>
          </section>

          <section id="cursor" className="mt-12 scroll-mt-20">
            <h2 className="text-2xl font-semibold tracking-tight">Cursor</h2>
            <ol className="mt-3 list-decimal space-y-2 pl-5 text-sm text-muted-foreground">
              <li>Run the npm install above.</li>
              <li>
                In Cursor, open Settings → MCP and add a server with this
                command, or merge the JSON into your MCP config.
              </li>
              <li>Restart Cursor after saving.</li>
              <li>Start the CEP bridge, then run the first prompt.</li>
            </ol>
            <div className="mt-4">
              <CopyBlock value={CLIENT_CONFIG} label="mcp.json" />
            </div>
          </section>

          <section id="claude-desktop" className="mt-12 scroll-mt-20">
            <h2 className="text-2xl font-semibold tracking-tight">
              Claude Desktop
            </h2>
            <p className="mt-3 text-sm text-muted-foreground">
              Download <code>adobe-premiere-pro-mcp-&lt;version&gt;.mcpb</code>{" "}
              from GitHub Releases and open it in Claude Desktop. First launch
              installs the bundled CEP bridge for the current user.
            </p>
            <div className="mt-4 flex flex-wrap gap-2">
              <Button asChild>
                <a href={MCPB}>Latest .mcpb release</a>
              </Button>
              <Button variant="outline" asChild>
                <a href={NPM}>npm package</a>
              </Button>
            </div>
            <p className="mt-3 text-sm text-muted-foreground">
              The MCPB bundle is unsigned. Install it only from
              hetpatel-11/Adobe_Premiere_Pro_MCP releases. Self-signed CEP
              archives are not Adobe Marketplace trusted.
            </p>
            <p className="mt-3 text-sm text-muted-foreground">
              On macOS, a source clone plus <code>npm run setup:mac</code> also
              writes Claude Desktop config. On Windows,{" "}
              <code>npm run setup:win</code> writes Claude Desktop and GitHub
              Copilot in VS Code.
            </p>
          </section>

          <section id="claude-code" className="mt-12 scroll-mt-20">
            <h2 className="text-2xl font-semibold tracking-tight">
              Claude Code
            </h2>
            <p className="mt-3 text-sm text-muted-foreground">
              From a clone of the repository:
            </p>
            <div className="mt-4">
              <CopyBlock value={CLAUDE_CODE_PLUGIN} label="claude code" />
            </div>
            <p className="mt-3 text-sm text-muted-foreground">
              Install and start the CEP bridge before using the plugin. Set{" "}
              <code>PREMIERE_MCP_TOOLSET=full</code> if you want Claude Code
              native tool search to index every tool.
            </p>
          </section>

          <section id="codex" className="mt-12 scroll-mt-20">
            <h2 className="text-2xl font-semibold tracking-tight">Codex</h2>
            <div className="mt-4">
              <CopyBlock value={CODEX_PLUGIN} label="codex" />
            </div>
            <p className="mt-3 text-sm text-muted-foreground">
              Then install CEP, restart Premiere, start MCP Bridge (CEP), and
              ask Codex for <code>get_capabilities</code> followed by{" "}
              <code>verify_premiere_connection</code>.
            </p>
          </section>

          <section id="bridge" className="mt-12 scroll-mt-20">
            <h2 className="text-2xl font-semibold tracking-tight">
              Start the CEP bridge
            </h2>
            <ol className="mt-3 list-decimal space-y-2 pl-5 text-sm text-muted-foreground">
              <li>Restart Premiere Pro after install.</li>
              <li>
                Open <strong className="text-foreground">Window → Extensions → MCP Bridge (CEP)</strong>.
              </li>
              <li>
                Set the temp directory the installer printed (often{" "}
                <code>/tmp/premiere-mcp-bridge</code> on macOS or{" "}
                <code>%TEMP%\premiere-mcp-bridge</code> on Windows).
              </li>
              <li>Save configuration, start the bridge, then test connection.</li>
            </ol>
            <p className="mt-3 text-sm text-muted-foreground">
              If the panel is missing, enable{" "}
              <strong className="text-foreground">
                UXP Plugins → Enable developer mode
              </strong>{" "}
              in Premiere preferences, restart, and reopen the CEP panel.
            </p>
          </section>

          <section id="verify" className="mt-12 scroll-mt-20">
            <h2 className="text-2xl font-semibold tracking-tight">
              First prompt
            </h2>
            <p className="mt-3 text-sm text-muted-foreground">
              Read-only. Confirms the file bridge answered and returns Premiere
              build, open project, and active sequence. Do this before any edit.
            </p>
            <div className="mt-4">
              <CopyBlock value={VERIFY_PROMPT} label="first prompt" />
            </div>
          </section>

          <section id="catalog" className="mt-12 scroll-mt-20">
            <h2 className="text-2xl font-semibold tracking-tight">
              Tool catalog
            </h2>
            <p className="mt-3 text-sm text-muted-foreground">
              283 catalog tools: three discovery tools plus 280 Premiere
              operations. <code>tools/list</code> advertises{" "}
              <code>search_tools</code>, <code>get_tool_schema</code>,{" "}
              <code>invoke_tool</code>, <code>verify_premiere_connection</code>,
              and <code>list_sequences</code>. Call <code>search_tools</code>{" "}
              with a natural-language query or a regex pattern, then{" "}
              <code>invoke_tool</code> with the exact name.
            </p>
            <div className="mt-4 grid gap-3 sm:grid-cols-2">
              {[
                ["Inspect", "Sequences, tracks, clips, bins, metadata, offline media."],
                ["Edit", "Import, cut, trim, razor, transitions, markers."],
                ["Finish", "Effects, keyframes, color, audio, captions."],
                ["Deliver", "Export, FCP XML, Media Encoder presets."],
              ].map(([title, body]) => (
                <Card key={title} size="sm">
                  <CardHeader>
                    <CardTitle>{title}</CardTitle>
                    <CardDescription>{body}</CardDescription>
                  </CardHeader>
                </Card>
              ))}
            </div>
          </section>

          <section id="how" className="mt-12 scroll-mt-20">
            <h2 className="text-2xl font-semibold tracking-tight">
              How the bridge works
            </h2>
            <ol className="mt-3 list-decimal space-y-2 pl-5 text-sm text-muted-foreground">
              <li>The client calls an MCP tool.</li>
              <li>The Node server writes ExtendScript plus helpers into the shared temp directory.</li>
              <li>
                The CEP panel polls that directory and runs the script through{" "}
                <code>CSInterface.evalScript()</code>.
              </li>
              <li>The panel writes the result file. The server returns JSON to the client.</li>
            </ol>
          </section>

          <section id="compat" className="mt-12 scroll-mt-20">
            <h2 className="text-2xl font-semibold tracking-tight">
              Compatibility
            </h2>
            <Card className="mt-4">
              <CardContent className="space-y-3 pt-6 text-sm text-muted-foreground">
                <p>
                  CEP is the supported production route for Premiere Pro
                  2020–2026 on macOS and Windows. Actively tested on Premiere
                  Pro 26.0.
                </p>
                <p>
                  The bundled UXP plugin is an experimental preview. It is not
                  installed by the CLI and is not a Creative Cloud Marketplace
                  install.
                </p>
                <p>
                  Premiere’s scripting surface is incomplete. Premiere 26 has
                  no API to remove effects — use Effect Controls. Results
                  should be verified in the host before you rely on them.
                </p>
              </CardContent>
            </Card>
          </section>

          <section id="troubleshoot" className="mt-12 scroll-mt-20">
            <h2 className="text-2xl font-semibold tracking-tight">
              Troubleshooting
            </h2>
            <Accordion className="mt-4" type="multiple">
              <AccordionItem value="client-sees">
                <AccordionTrigger>
                  The client sees the server but tool calls fail
                </AccordionTrigger>
                <AccordionContent>
                  <p>
                    Premiere is closed, no project is open, the CEP panel is
                    not started, the temp directory does not match, or the
                    panel needs a right-click Reload after an update. Use Run
                    Diagnostics in the panel.
                  </p>
                </AccordionContent>
              </AccordionItem>
              <AccordionItem value="missing">
                <AccordionTrigger>
                  MCP Bridge (CEP) is missing from Window → Extensions
                </AccordionTrigger>
                <AccordionContent>
                  <p>
                    Re-run <code>premiere-pro-mcp --install-cep</code> and{" "}
                    <code>--doctor</code>. Enable UXP developer mode, restart
                    Premiere, and look again. The panel name is MCP Bridge
                    (CEP).
                  </p>
                </AccordionContent>
              </AccordionItem>
              <AccordionItem value="pkg">
                <AccordionTrigger>
                  I installed a package and the tools do not match this site
                </AccordionTrigger>
                <AccordionContent>
                  <p>
                    Confirm <code>npm ls -g adobe-premiere-pro-mcp</code> and
                    that the command is <code>premiere-pro-mcp</code>. This
                    project is hetpatel-11/Adobe_Premiere_Pro_MCP. Similar
                    package names are not this repo.
                  </p>
                </AccordionContent>
              </AccordionItem>
              <AccordionItem value="telemetry">
                <AccordionTrigger>How do I turn off telemetry?</AccordionTrigger>
                <AccordionContent>
                  <p>
                    Set <code>PREMIERE_MCP_TELEMETRY=0</code> on the server
                    entry, or uncheck Share anonymous usage data in the CEP
                    panel. Telemetry does not include project names, paths, or
                    tool arguments. See{" "}
                    <a href={`${REPO}/blob/main/PRIVACY.md`}>PRIVACY.md</a>.
                  </p>
                </AccordionContent>
              </AccordionItem>
            </Accordion>
            <p className="mt-6 text-sm text-muted-foreground">
              Source, issues, and the full tool list live in{" "}
              <a className="underline underline-offset-4" href={REPO}>
                the GitHub repository
              </a>
              .
            </p>
          </section>
        </div>
      </main>
    </SiteShell>
  )
}
