import { useEffect, type ReactNode } from "react"
import { ArrowUpRight } from "lucide-react"

import { ShaderBackdrop } from "@/components/shader-backdrop"
import { Button } from "@/components/ui/button"
import { NPM, REPO } from "@/lib/snippets"

export type SitePage =
  | "home"
  | "docs"
  | "about"
  | "contact"
  | "privacy"
  | "cli"

function isTypingTarget(target: EventTarget | null) {
  if (!(target instanceof HTMLElement)) return false
  if (target.isContentEditable) return true
  const tag = target.tagName
  return tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT"
}

export function SiteShell({
  page,
  children,
}: {
  page: SitePage
  children: ReactNode
}) {
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.defaultPrevented || event.repeat) return
      if (event.metaKey || event.ctrlKey || event.altKey) return
      if (isTypingTarget(event.target)) return
      if (event.key !== "g" && event.key !== "G") return
      window.location.assign(REPO)
    }

    window.addEventListener("keydown", onKey)
    return () => window.removeEventListener("keydown", onKey)
  }, [])

  return (
    <div className="relative min-h-svh overflow-x-clip text-foreground">
      <ShaderBackdrop />

      <header className="sticky top-0 z-20 border-b border-white/8 bg-background/35 backdrop-blur-xl">
        <div className="mx-auto flex h-14 max-w-5xl items-center justify-between px-4">
          <a
            href="/"
            className="flex items-center gap-2 font-mono text-sm tracking-tight"
          >
            <img
              src="/favicon.svg"
              alt=""
              width={18}
              height={18}
              className="size-[18px] rounded-[4px]"
            />
            premiere-mcp.com
          </a>
          <nav className="flex items-center gap-2">
            <Button
              variant={page === "docs" ? "secondary" : "ghost"}
              size="sm"
              asChild
            >
              <a href="/docs/">Docs</a>
            </Button>
            <Button variant="outline" size="sm" asChild>
              <a href={NPM}>npm</a>
            </Button>
            <Button size="sm" asChild>
              <a href={REPO} title="Press G">
                GitHub
                <kbd className="rounded border border-primary-foreground/25 bg-primary-foreground/10 px-1 font-mono text-[10px] leading-4">
                  G
                </kbd>
                <ArrowUpRight />
              </a>
            </Button>
          </nav>
        </div>
      </header>

      {children}

      <footer className="border-t border-white/8 bg-background/40 backdrop-blur-xl">
        <div className="mx-auto max-w-5xl px-4 py-8 text-xs text-muted-foreground">
          <p>
            Premiere Pro MCP is independent software for use with Adobe
            Premiere Pro. Adobe, Premiere, and Premiere Pro are trademarks of
            Adobe. This site is not affiliated with Adobe.
          </p>
          <p className="mt-3 flex flex-wrap gap-3">
            <a
              className={page === "docs" ? "text-foreground" : "hover:text-foreground"}
              href="/docs/"
            >
              Docs
            </a>
            <a
              className={page === "cli" ? "text-foreground" : "hover:text-foreground"}
              href="/cli/"
            >
              CLI
            </a>
            <a
              className={page === "about" ? "text-foreground" : "hover:text-foreground"}
              href="/about/"
            >
              About
            </a>
            <a
              className={page === "contact" ? "text-foreground" : "hover:text-foreground"}
              href="/contact/"
            >
              Contact
            </a>
            <a
              className={page === "privacy" ? "text-foreground" : "hover:text-foreground"}
              href="/privacy/"
            >
              Privacy
            </a>
            <a className="hover:text-foreground" href="/openapi.json">
              OpenAPI
            </a>
            <a className="hover:text-foreground" href="/llms.txt">
              llms.txt
            </a>
            <a className="hover:text-foreground" href={REPO}>
              GitHub
            </a>
          </p>
        </div>
      </footer>
    </div>
  )
}
