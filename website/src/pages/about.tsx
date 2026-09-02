import { ArticlePage } from "@/components/article-page"
import { ISSUES, NPM, REPO } from "@/lib/snippets"

export function AboutPage() {
  return (
    <ArticlePage
      page="about"
      kicker="The project"
      title="About Premiere Pro MCP"
    >
      <p>
        Premiere Pro MCP is independent open-source software that lets AI
        agents edit Adobe Premiere Pro on the same computer. The canonical
        site is premiere-mcp.com. The repository is{" "}
        <a className="text-foreground underline underline-offset-4" href={REPO}>
          hetpatel-11/Adobe_Premiere_Pro_MCP
        </a>
        . The published package is{" "}
        <a className="text-foreground underline underline-offset-4" href={NPM}>
          adobe-premiere-pro-mcp
        </a>
        .
      </p>
      <h2 className="text-xl font-semibold tracking-tight text-foreground">
        How it runs
      </h2>
      <p>
        An MCP client talks to the <code>premiere-pro-mcp</code> process. That
        process writes ExtendScript into a private temp directory. The MCP
        Bridge CEP panel inside Premiere evaluates the script and writes JSON
        back. Green on the panel means both sides are ready. Footage stays on
        disk.
      </p>
      <h2 className="text-xl font-semibold tracking-tight text-foreground">
        What it covers
      </h2>
      <p>
        The catalog is 283 tools: timeline edits, effects and color, media and
        bins, audio and captions, export, and discovery. CEP is the production
        bridge. UXP is an experimental preview and is not installed by the CLI.
      </p>
      <p>
        MIT licensed. Unofficial. Not affiliated with Adobe. Support is{" "}
        <a className="text-foreground underline underline-offset-4" href={ISSUES}>
          GitHub issues
        </a>
        .
      </p>
    </ArticlePage>
  )
}
