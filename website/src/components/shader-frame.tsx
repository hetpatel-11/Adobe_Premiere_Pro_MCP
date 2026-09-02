import type { ReactNode } from "react"

export function ShaderFrame({ children }: { children: ReactNode }) {
  return (
    <div className="rounded-2xl bg-linear-to-br from-primary/80 via-teal-100/25 to-emerald-900/40 p-px shadow-[0_0_80px_-16px_oklch(0.72_0.12_175)]">
      <div className="overflow-hidden rounded-[15px] bg-background/30 backdrop-blur-sm">
        {children}
      </div>
    </div>
  )
}
