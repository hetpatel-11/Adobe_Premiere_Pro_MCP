import { Terminal } from "lucide-react"

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
import { Separator } from "@/components/ui/separator"
import { CopyBlock } from "@/components/copy-block"
import { LiveStars } from "@/components/live-stars"
import { ShaderFrame } from "@/components/shader-frame"
import { SiteShell } from "@/components/site-shell"
import { useLiveStars } from "@/hooks/use-live-stars"
import { AGENT_PROMPT, NPM, REPO } from "@/lib/snippets"

const STATIC_STATS = [
  ["1.2.7", "npm latest"],
  ["283", "Tools"],
] as const

const CAPABILITIES = [
  [
    "Timeline",
    "Insert, overwrite, trim, razor, move, ripple, roll, slide, and slip across sequences and tracks.",
  ],
  [
    "Effects and color",
    "Apply effects, inspect properties, drive Lumetri-style looks, load LUTs, and keyframe motion.",
  ],
  [
    "Media and project",
    "Import footage, manage bins, create sequences, inspect metadata, and work with proxies.",
  ],
  [
    "Audio and captions",
    "Levels, ducking, mute, markers, and caption reads against the open sequence.",
  ],
  [
    "Export",
    "Queue sequences and project items, FCP XML, and Media Encoder presets you already have.",
  ],
  [
    "Discovery",
    "Hosts see five always-on tools. search_tools then invoke_tool reach the rest of the catalog.",
  ],
] as const

export function HomePage() {
  const stars = useLiveStars()

  return (
    <SiteShell page="home">
      <main className="mx-auto max-w-5xl px-4 pb-20">
        <section className="flex min-h-[78svh] flex-col justify-end pb-6 pt-20 sm:min-h-[86svh] sm:pt-28">
        <LiveStars
          display={stars.display}
          phase={stars.phase}
          ticked={stars.ticked}
        />
        <div className="flex flex-wrap items-center gap-2">
          <Badge variant="secondary">Original open-source project</Badge>
          <Badge variant="outline">MIT</Badge>
          <Badge variant="outline">CEP production</Badge>
          <Badge variant="outline">283 tools</Badge>
        </div>

        <h1 className="mt-6 max-w-3xl text-5xl font-semibold tracking-tight text-balance drop-shadow-[0_8px_40px_oklch(0.2_0.04_180)] sm:text-7xl">
          Premiere Pro{" "}
          <span className="bg-linear-to-r from-primary to-teal-100 bg-clip-text text-transparent">
            MCP
          </span>
        </h1>
        <p className="mt-5 max-w-2xl text-lg text-muted-foreground text-pretty">
          The original local MCP server for Adobe Premiere Pro. 283 tools talk
          to Premiere through a CEP file bridge on the same machine. Claude,
          Cursor, Codex, and Claude Code stay local. Footage never leaves disk.
        </p>

        <div className="mt-8 flex flex-wrap gap-3">
          <Button size="lg" asChild>
            <a href="#prompt">Copy the prompt</a>
          </Button>
          <Button size="lg" variant="outline" asChild>
            <a href="/docs/">Manual install</a>
          </Button>
        </div>

        <div className="mt-10 grid grid-cols-3 gap-px overflow-hidden rounded-xl border border-white/10 bg-white/5 backdrop-blur-xl">
          <div className="bg-background/25 px-5 py-4">
            <p className="font-mono text-2xl tracking-tight tabular-nums">
              {stars.forks.toLocaleString("en-US")}
            </p>
            <p className="mt-1 text-xs text-muted-foreground">Forks</p>
          </div>
          {STATIC_STATS.map(([value, label]) => (
            <div key={label} className="bg-background/25 px-5 py-4">
              <p className="font-mono text-2xl tracking-tight">{value}</p>
              <p className="mt-1 text-xs text-muted-foreground">{label}</p>
            </div>
          ))}
        </div>

        <p className="mt-6 text-xs text-muted-foreground">
          Package is <code>adobe-premiere-pro-mcp</code> — repo{" "}
          <a className="underline underline-offset-4" href={REPO}>
            hetpatel-11/Adobe_Premiere_Pro_MCP
          </a>
          . Unofficial. Not affiliated with, endorsed by, or sponsored by Adobe.
        </p>
        </section>

        <Card id="prompt" className="scroll-mt-20 shadow-2xl shadow-primary/10">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Terminal className="size-4 text-primary" />
              Paste this into your agent
            </CardTitle>
            <CardDescription>
              Cursor, Claude, Codex, Claude Code — same prompt. The agent
              installs the package, registers the MCP server, and tells you
              the one Premiere click it cannot do for you. Manual steps are
              on{" "}
              <a className="underline underline-offset-4" href="/docs/">
                /docs
              </a>
              .
            </CardDescription>
          </CardHeader>
          <CardContent className="flex flex-col gap-3">
            <CopyBlock value={AGENT_PROMPT} label="agent prompt" />
          </CardContent>
        </Card>

        <section className="mt-16">
          <h2 className="text-2xl font-semibold tracking-tight">
            How the bridge works
          </h2>
          <p className="mt-2 max-w-2xl text-sm text-muted-foreground">
            Commands stay on your machine. The server never uploads a Premiere
            project or media files.
          </p>
          <div className="mt-6 grid gap-4 md:grid-cols-3">
            {[
              [
                "01",
                "Your AI calls a tool",
                "Cursor, Claude, Codex, or another MCP client sends a structured request to the local Node server.",
              ],
              [
                "02",
                "A script hits a temp folder",
                "The server writes ExtendScript into a private shared directory such as /tmp/premiere-mcp-bridge.",
              ],
              [
                "03",
                "CEP runs it in Premiere",
                "MCP Bridge (CEP) polls that folder, evals the script, and writes JSON back. Green means both sides are ready.",
              ],
            ].map(([step, title, body]) => (
              <Card key={step}>
                <CardHeader>
                  <CardDescription className="font-mono">{step}</CardDescription>
                  <CardTitle>{title}</CardTitle>
                </CardHeader>
                <CardContent className="text-sm text-muted-foreground">
                  {body}
                </CardContent>
              </Card>
            ))}
          </div>
        </section>

        <figure className="mt-14">
          <ShaderFrame>
            <img
              src="/mcp-bridge-cep.png"
              alt="Live MCP Bridge CEP panel connected inside Adobe Premiere Pro"
              className="w-full"
            />
          </ShaderFrame>
          <figcaption className="mt-3 text-sm text-muted-foreground">
            Live CEP panel inside Premiere — a real host screenshot, not an
            illustrated walkthrough. Green means the file bridge and Premiere
            are both ready.
          </figcaption>
        </figure>

        <section className="mt-16">
          <h2 className="text-2xl font-semibold tracking-tight">
            What the 283 tools cover
          </h2>
          <div className="mt-6 grid gap-4 md:grid-cols-2">
            {CAPABILITIES.map(([title, body]) => (
              <Card key={title}>
                <CardHeader>
                  <CardTitle>{title}</CardTitle>
                </CardHeader>
                <CardContent className="text-sm text-muted-foreground">
                  {body}
                </CardContent>
              </Card>
            ))}
          </div>
        </section>

        <section className="mt-16">
          <Card>
            <CardHeader>
              <CardTitle>Compatibility</CardTitle>
            </CardHeader>
            <CardContent className="space-y-2 text-sm text-muted-foreground">
              <p>Premiere Pro 2020–2026 on macOS and Windows, including Apple Silicon.</p>
              <p>CEP is the production bridge. UXP is an experimental preview and is not installed by the CLI.</p>
              <p>Tested on Premiere Pro 26. If the extension is missing, enable UXP developer mode, restart, and reopen the CEP panel.</p>
            </CardContent>
          </Card>
        </section>

        <Separator className="my-14" />

        <h2 className="text-2xl font-semibold tracking-tight">FAQ</h2>
        <Accordion className="mt-4" type="multiple">
          <AccordionItem value="pkg">
            <AccordionTrigger>
              Which npm package should I install?
            </AccordionTrigger>
            <AccordionContent>
              <p>
                <code>adobe-premiere-pro-mcp</code> from{" "}
                <a href={NPM}>npmjs.com</a>. That is
                hetpatel-11/Adobe_Premiere_Pro_MCP, first published July 2025.
                Other similar names are not this repository.
              </p>
            </AccordionContent>
          </AccordionItem>
          <AccordionItem value="privacy">
            <AccordionTrigger>
              Does this send my project to a server?
            </AccordionTrigger>
            <AccordionContent>
              <p>
                Editing is local. Optional anonymous telemetry records server
                starts, failures, and at most one successful call per tool per
                install per day. Turn it off with{" "}
                <code>PREMIERE_MCP_TELEMETRY=0</code> or uncheck Share
                anonymous usage data in the CEP panel. See{" "}
                <a href={`${REPO}/blob/main/PRIVACY.md`}>PRIVACY.md</a>.
              </p>
            </AccordionContent>
          </AccordionItem>
          <AccordionItem value="clients">
            <AccordionTrigger>Which AI clients work?</AccordionTrigger>
            <AccordionContent>
              <p>
                Cursor, Claude Desktop, Claude Code, Codex, VS Code / Copilot,
                and any MCP client that can run a local command. Paste the
                homepage prompt into the agent. Per-client config is on{" "}
                <a className="underline underline-offset-4" href="/docs/">
                  /docs
                </a>{" "}
                if you want to do it yourself.
              </p>
            </AccordionContent>
          </AccordionItem>
          <AccordionItem value="first">
            <AccordionTrigger>What should I run first?</AccordionTrigger>
            <AccordionContent>
              <p>
                <code>verify_premiere_connection</code> with no edits. It
                confirms the CEP bridge answered and returns the Premiere
                build, open project, and active sequence. Then{" "}
                <code>search_tools</code> and <code>invoke_tool</code>.
              </p>
            </AccordionContent>
          </AccordionItem>
          <AccordionItem value="cep">
            <AccordionTrigger>CEP or UXP?</AccordionTrigger>
            <AccordionContent>
              <p>
                CEP is production. UXP is an experimental preview and is not
                installed by the CLI. It is not a Creative Cloud Marketplace
                listing.
              </p>
            </AccordionContent>
          </AccordionItem>
          <AccordionItem value="list">
            <AccordionTrigger>
              Why does tools/list only show five tools?
            </AccordionTrigger>
            <AccordionContent>
              <p>
                Hosts that dump every MCP schema would spend the context window
                on unused Premiere operations. Call <code>search_tools</code>,
                optionally <code>get_tool_schema</code>, then{" "}
                <code>invoke_tool</code>. Set{" "}
                <code>PREMIERE_MCP_TOOLSET=full</code> only when the host
                natively defers schemas, as Claude Code tool search does.
              </p>
            </AccordionContent>
          </AccordionItem>
        </Accordion>
      </main>
    </SiteShell>
  )
}
