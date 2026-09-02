import { describe, expect, it } from "vitest"

import { negotiate } from "./negotiate.ts"

describe("negotiate", () => {
  it("defaults to the first available type when Accept is missing", () => {
    expect(negotiate(null, ["html", "markdown"])).toBe("html")
    expect(negotiate("", ["markdown", "html"])).toBe("markdown")
  })

  it("honors q-values", () => {
    expect(
      negotiate("text/markdown;q=0.1, text/html;q=0.9", ["html", "markdown"]),
    ).toBe("html")
    expect(
      negotiate("text/html;q=0.2, text/markdown", ["html", "markdown"]),
    ).toBe("markdown")
  })

  it("matches text/markdown for agents", () => {
    expect(negotiate("text/markdown", ["html", "markdown"])).toBe("markdown")
    expect(negotiate("text/x-markdown", ["html", "markdown"])).toBe("markdown")
  })

  it("matches browser Accept as HTML", () => {
    expect(
      negotiate(
        "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
        ["html", "markdown"],
      ),
    ).toBe("html")
  })

  it("returns not_acceptable when nothing matches", () => {
    expect(negotiate("application/xml", ["html", "markdown"])).toBe(
      "not_acceptable",
    )
  })

  it("treats */* as the first available type", () => {
    expect(negotiate("*/*", ["html", "markdown"])).toBe("html")
  })
})
