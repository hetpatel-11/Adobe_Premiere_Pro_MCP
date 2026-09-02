import { REPO } from "@/lib/snippets"
import { cn } from "@/lib/utils"

function formatCount(value: number) {
  return value.toLocaleString("en-US")
}

export function LiveStars({
  display,
  phase,
  ticked,
}: {
  display: number
  phase: "racing" | "live"
  ticked: boolean
}) {
  return (
    <a
      href={REPO}
      className="group mb-8 block w-fit no-underline"
      aria-label={`${formatCount(display)} GitHub stars`}
    >
      <p
        className={cn(
          "font-mono text-7xl leading-none font-semibold tracking-tighter tabular-nums sm:text-8xl",
          "transition-transform duration-200",
          ticked && "scale-[1.03] text-primary",
          phase === "racing" && "text-foreground",
        )}
      >
        {formatCount(display)}
      </p>
      <p className="mt-3 flex items-center gap-2 text-sm text-muted-foreground">
        <span
          className={cn(
            "size-1.5 rounded-full bg-primary",
            phase === "live" && "animate-pulse",
          )}
        />
        GitHub stars
        <span className="text-muted-foreground/70">
          {phase === "racing" ? "counting up" : "live"}
        </span>
      </p>
    </a>
  )
}
