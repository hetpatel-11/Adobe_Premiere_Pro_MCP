import { readFileSync } from "node:fs"
import { dirname, resolve } from "node:path"
import { fileURLToPath } from "node:url"

import { describe, expect, it } from "vitest"

import { HOME_MD, NOT_FOUND_MD, PAGES } from "./content.ts"
import { handleRequest, jsonError } from "./index.ts"
import { OPENAPI, STATUS } from "./openapi.ts"

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..")

function assets(htmlByPath: Record<string, string> = {}) {
  return {
    async fetch(input: Request | URL | string) {
      const url =
        typeof input === "string"
          ? new URL(input, "https://premiere-mcp.com")
          : input instanceof Request
            ? new URL(input.url)
            : new URL(String(input))
      const body = htmlByPath[url.pathname]
      if (body) {
        return new Response(body, {
          headers: { "content-type": "text/html; charset=utf-8" },
        })
      }
      return new Response("missing", { status: 404 })
    },
  }
}

function req(path: string, headers?: HeadersInit, method = "GET") {
  return new Request(`https://premiere-mcp.com${path}`, { method, headers })
}

async function call(path: string, headers?: HeadersInit, method = "GET") {
  return handleRequest(
    req(path, headers, method),
    assets({ "/": "<html><body>react home</body></html>" }),
  )
}

describe("handleRequest", () => {
  it("serves homepage HTML from assets and adds Vary: Accept", async () => {
    const response = await call("/")
    expect(response.status).toBe(200)
    expect(await response.text()).toContain("react home")
    expect(response.headers.get("vary")).toMatch(/Accept/i)
  })

  it("serves markdown for Accept: text/markdown", async () => {
    const response = await call("/", { Accept: "text/markdown" })
    expect(response.status).toBe(200)
    expect(response.headers.get("content-type")).toMatch(/text\/markdown/)
    expect(response.headers.get("vary")).toMatch(/Accept/)
    const body = await response.text()
    expect(body).toContain("# Premiere Pro MCP")
    expect(body).toContain("When to use this")
  })

  it("returns 406 when Accept matches nothing", async () => {
    const response = await call("/", { Accept: "application/xml" })
    expect(response.status).toBe(406)
    expect(response.headers.get("vary")).toMatch(/Accept/)
  })

  it("returns HTTP 404 with a markdown recovery body", async () => {
    const response = await call("/some-path-that-does-not-exist", {
      Accept: "text/markdown",
    })
    expect(response.status).toBe(404)
    const body = await response.text()
    expect(response.headers.get("content-type")).toMatch(/text\/markdown/)
    expect(body).toContain("llms.txt")
    expect(body).toContain("sitemap.xml")
    expect(body).toContain("/docs/")
  })

  it("returns 404 for curl */* as markdown so agents can recover", async () => {
    const response = await call("/missing")
    expect(response.status).toBe(404)
    expect(await response.text()).toContain(NOT_FOUND_MD.split("\n")[0])
  })

  it("publishes OpenAPI with operationIds and descriptions", async () => {
    const response = await call("/openapi.json")
    expect(response.status).toBe(200)
    const spec = (await response.json()) as typeof OPENAPI
    expect(spec.openapi).toBe("3.1.0")
    expect(spec.info.title).toContain("Premiere Pro MCP")
    for (const path of Object.values(spec.paths)) {
      const op = path.get
      expect(op.operationId).toMatch(/^[a-zA-Z]+$/)
      expect(op.description.length).toBeGreaterThan(20)
      expect(op.responses["200"]).toBeTruthy()
    }
  })

  it("serves YAML OpenAPI", async () => {
    const response = await call("/api/openapi.yaml")
    expect(response.status).toBe(200)
    expect(response.headers.get("content-type")).toMatch(/yaml/)
    expect(await response.text()).toContain("openapi: 3.1.0")
  })

  it("returns JSON errors for unknown API routes", async () => {
    const response = await call("/api/nope")
    expect(response.status).toBe(404)
    const body = (await response.json()) as {
      error: { code: string; message: string; hint: string }
    }
    expect(body.error.code).toBe("not_found")
    expect(body.error.hint).toContain("openapi.json")
    expect(response.headers.get("content-type")).toMatch(/application\/json/)
  })

  it("returns JSON 405 for POST /api/status", async () => {
    const response = await call("/api/status", undefined, "POST")
    expect(response.status).toBe(405)
    const body = (await response.json()) as { error: { code: string } }
    expect(body.error.code).toBe("method_not_allowed")
  })

  it("returns package status", async () => {
    const response = await call("/api/status")
    const body = (await response.json()) as typeof STATUS
    expect(body.cli).toBe("premiere-pro-mcp")
    expect(body.package).toBe("adobe-premiere-pro-mcp")
    expect(body.tools).toBe(283)
  })

  it("publishes MCP manifests", async () => {
    const card = await (await call("/.well-known/mcp/server-card.json")).json()
    const manifest = await (await call("/.well-known/mcp")).json()
    const config = await (await call("/mcp.json")).json()
    expect(card.transport.type).toBe("stdio")
    expect(manifest.endpoints[0].command).toBe("premiere-pro-mcp")
    expect(config.mcpServers["premiere-pro"].command).toBe("premiere-pro-mcp")
  })

  it("generates HTML for trust pages without assets", async () => {
    for (const path of ["/about/", "/contact/", "/privacy/", "/cli/"]) {
      const response = await call(path)
      expect(response.status).toBe(200)
      const body = await response.text()
      const text = body.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ")
      expect(text.length).toBeGreaterThan(500)
      expect(body).toMatch(/<h1>/)
    }
  })

  it("redirects /about to /about/", async () => {
    const response = await call("/about")
    expect(response.status).toBe(308)
    expect(response.headers.get("location")).toBe("/about/")
  })
})

describe("jsonError", () => {
  it("includes code, message, and hint", async () => {
    const response = jsonError(404, "not_found", "gone", "see /openapi.json")
    const body = (await response.json()) as {
      error: { code: string; message: string; hint: string }
    }
    expect(body.error).toEqual({
      code: "not_found",
      message: "gone",
      hint: "see /openapi.json",
    })
  })
})

describe("raw HTML pages", () => {
  it("homepage HTML has an H1 and 500+ characters without scripts", () => {
    const html = readFileSync(resolve(root, "index.html"), "utf8")
    expect(html).toMatch(/<h1[^>]*>[\s\S]*Premiere Pro MCP/)
    const text = html
      .replace(/<script[\s\S]*?<\/script>/gi, " ")
      .replace(/<style[\s\S]*?<\/style>/gi, " ")
      .replace(/<[^>]+>/g, " ")
      .replace(/\s+/g, " ")
      .trim()
    expect(text.length).toBeGreaterThanOrEqual(500)
    expect(html).toMatch(/<h2>/)
    expect(html).toMatch(/href="\/docs\/"/)
    expect(html).toContain("SoftwareApplication")
    expect(html).toContain("Organization")
    expect(html).toContain('"description"')
    expect(html).not.toMatch(/#root\s*\{/)
    expect(html).not.toMatch(/#root\s+a/)
    expect(html).toMatch(/class="agent-content" hidden/)
    expect(html).toMatch(/display:\s*none/)
  })

  it("inner pages ship with headings and no #root style leak", () => {
    for (const file of [
      "about/index.html",
      "contact/index.html",
      "privacy/index.html",
      "cli/index.html",
    ]) {
      const html = readFileSync(resolve(root, file), "utf8")
      expect(html).toMatch(/<h1>/)
      expect(html).toMatch(/class="agent-content" hidden/)
      expect(html).not.toMatch(/#root\s*\{/)
      const text = html
        .replace(/<script[\s\S]*?<\/script>/gi, " ")
        .replace(/<[^>]+>/g, " ")
        .replace(/\s+/g, " ")
        .trim()
      expect(text.length).toBeGreaterThanOrEqual(500)
    }
  })

  it("docs HTML has an H1 and install copy", () => {
    const html = readFileSync(resolve(root, "docs/index.html"), "utf8")
    expect(html).toMatch(/<h1[^>]*>[\s\S]*Premiere Pro MCP/)
    const text = html
      .replace(/<script[\s\S]*?<\/script>/gi, " ")
      .replace(/<[^>]+>/g, " ")
      .replace(/\s+/g, " ")
      .trim()
    expect(text.length).toBeGreaterThanOrEqual(500)
  })

  it("llms.txt names when to use Premiere Pro MCP", () => {
    const text = readFileSync(resolve(root, "public/llms.txt"), "utf8")
    expect(text).toMatch(/When to use/i)
    expect(text).toContain("premiere-mcp.com")
    expect(text).toContain("/openapi.json")
    expect(text).toContain("premiere-pro-mcp")
  })

  it("homepage markdown is the same product story", () => {
    expect(HOME_MD.length).toBeGreaterThan(500)
    expect(PAGES["/"].markdown).toBe(HOME_MD)
  })
})
