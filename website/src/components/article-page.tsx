import type { ReactNode } from "react"

import { SiteShell, type SitePage } from "@/components/site-shell"
import { Badge } from "@/components/ui/badge"

export function ArticlePage({
  page,
  kicker,
  title,
  children,
}: {
  page: SitePage
  kicker: string
  title: string
  children: ReactNode
}) {
  return (
    <SiteShell page={page}>
      <main className="mx-auto max-w-5xl px-4 py-16">
        <Badge variant="secondary">{kicker}</Badge>
        <h1 className="mt-4 max-w-3xl text-4xl font-semibold tracking-tight text-balance">
          {title}
        </h1>
        <div className="mt-8 max-w-2xl space-y-6 text-muted-foreground text-pretty">
          {children}
        </div>
      </main>
    </SiteShell>
  )
}
