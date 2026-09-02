import { useEffect, type ReactNode } from "react"
import { ArrowUpRight } from "lucide-react"

import { ShaderBackdrop } from "@/components/shader-backdrop"
import { Button } from "@/components/ui/button"
import { NPM, REPO } from "@/lib/snippets"

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
  page: "home" | "docs"
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
            <a className="hover:text-foreground" href={REPO}>
              Source
            </a>
            <a className="hover:text-foreground" href="/docs/">
              Docs
            </a>
            <a
              className="hover:text-foreground"
              href={`${REPO}/blob/main/LICENSE.md`}
            >
              MIT
            </a>
            <a
              className="hover:text-foreground"
              href={`${REPO}/blob/main/PRIVACY.md`}
            >
              Privacy
            </a>
            <a
              className="hover:text-foreground"
              href={`${REPO}/blob/main/TERMS.md`}
            >
              Terms
            </a>
          </p>
        </div>
      </footer>
    </div>
  )
}
