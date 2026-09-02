import { useState } from "react"
import { Check, Copy } from "lucide-react"

import { Button } from "@/components/ui/button"

export function CopyBlock({
  value,
  label,
}: {
  value: string
  label: string
}) {
  const [copied, setCopied] = useState(false)

  return (
    <div className="overflow-hidden rounded-xl border border-white/10 bg-background/45 shadow-inner backdrop-blur-md">
      <div className="flex items-center justify-between border-b px-4 py-2">
        <span className="font-mono text-[11px] tracking-wide text-muted-foreground uppercase">
          {label}
        </span>
        <Button
          type="button"
          size="sm"
          variant="ghost"
          onClick={async () => {
            await navigator.clipboard.writeText(value)
            setCopied(true)
            window.setTimeout(() => setCopied(false), 1400)
          }}
        >
          {copied ? <Check /> : <Copy />}
          {copied ? "Copied" : "Copy"}
        </Button>
      </div>
      <pre className="overflow-x-auto p-4 font-mono text-[13px] leading-6 whitespace-pre-wrap text-foreground">
        {value}
      </pre>
    </div>
  )
}
