import { ArticlePage } from "@/components/article-page"
import { Button } from "@/components/ui/button"
import { ISSUES, NPM, REPO } from "@/lib/snippets"

export function ContactPage() {
  return (
    <ArticlePage
      page="contact"
      kicker="Support"
      title="Contact Premiere Pro MCP"
    >
      <p>
        Premiere Pro MCP is an open-source project. There is no sales phone
        line and no hosted support desk. Product questions, bugs, and install
        failures go to GitHub issues.
      </p>
      <Button asChild>
        <a href={ISSUES}>Open a GitHub issue</a>
      </Button>
      <h2 className="text-xl font-semibold tracking-tight text-foreground">
        How to get help
      </h2>
      <ol className="list-decimal space-y-2 pl-5">
        <li>
          Read the{" "}
          <a className="text-foreground underline underline-offset-4" href="/docs/">
            install docs
          </a>{" "}
          and run <code>premiere-pro-mcp --doctor</code>.
        </li>
        <li>
          Confirm Premiere is open, a project is loaded, and Window →
          Extensions → MCP Bridge (CEP) is green.
        </li>
        <li>
          Include OS, Premiere version, Node version, client name, and the CEP
          diagnostics file if you have one.
        </li>
      </ol>
      <p>
        Do not attach Premiere project files or footage unless you intend to
        make them public.
      </p>
      <p>
        Source:{" "}
        <a className="text-foreground underline underline-offset-4" href={REPO}>
          GitHub
        </a>
        . Package:{" "}
        <a className="text-foreground underline underline-offset-4" href={NPM}>
          npm
        </a>
        .
      </p>
    </ArticlePage>
  )
}
