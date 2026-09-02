export type Media = "markdown" | "html" | "json"

const TYPES: Record<Media, string[]> = {
  markdown: ["text/markdown", "text/x-markdown"],
  html: ["text/html", "application/xhtml+xml"],
  json: ["application/json"],
}

interface Range {
  type: string
  q: number
}

function parseAccept(header: string): Range[] {
  return header
    .split(",")
    .map((part) => {
      const [rawType, ...params] = part.trim().split(";")
      let q = 1
      for (const param of params) {
        const [key, value] = param.trim().split("=")
        if (key === "q") q = Number(value)
      }
      return { type: rawType.trim().toLowerCase(), q }
    })
    .filter((range) => range.type.length > 0 && range.q > 0)
}

function matches(range: string, candidate: string): boolean {
  if (range === "*/*") return true
  const [rangeType, rangeSub = "*"] = range.split("/")
  const [candType, candSub] = candidate.split("/")
  if (rangeType === candType && (rangeSub === "*" || rangeSub === candSub)) {
    return true
  }
  return range === candidate
}

export function negotiate(
  accept: string | null,
  available: Media[],
): Media | "not_acceptable" {
  const offered = available.flatMap((media) =>
    TYPES[media].map((type) => ({ media, type })),
  )
  if (!accept || accept.trim() === "") return available[0] ?? "not_acceptable"

  const ranges = parseAccept(accept).sort((a, b) => b.q - a.q)
  for (const range of ranges) {
    for (const offer of offered) {
      if (matches(range.type, offer.type)) return offer.media
    }
  }
  return "not_acceptable"
}

export function availableTypes(available: Media[]): string[] {
  return available.flatMap((media) => TYPES[media])
}
