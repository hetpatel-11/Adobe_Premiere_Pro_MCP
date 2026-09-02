import {
  NOT_FOUND_MD,
  PAGES,
  SITE,
  markdownToHtml,
  wrapPage,
} from "./content.ts"
import { availableTypes, negotiate, type Media } from "./negotiate.ts"
import {
  MCP_CLIENT_CONFIG,
  MCP_MANIFEST,
  MCP_SERVER_CARD,
  OPENAPI,
  STATUS,
  toYaml,
} from "./openapi.ts"

export interface AssetFetcher {
  fetch(input: Request | URL | string, init?: RequestInit): Promise<Response>
}

const VARY = "Accept, Accept-Encoding"
const JSON_HEADERS = {
  "content-type": "application/json; charset=utf-8",
  "x-content-type-options": "nosniff",
  "access-control-allow-origin": "*",
  "cache-control": "public, max-age=3600",
  vary: VARY,
}

const MD_HEADERS = {
  "content-type": "text/markdown; charset=utf-8",
  "x-content-type-options": "nosniff",
  "access-control-allow-origin": "*",
  vary: VARY,
}

const HTML_HEADERS = {
  "content-type": "text/html; charset=utf-8",
  "x-content-type-options": "nosniff",
  vary: VARY,
}

const MACHINE = new Map<string, () => Response>([
  ["/openapi.json", () => json(OPENAPI)],
  ["/api/openapi.json", () => json(OPENAPI)],
  ["/api/openapi.yaml", () => yaml(toYaml(OPENAPI) + "\n")],
  ["/api/status", () => json(STATUS)],
  ["/mcp.json", () => json(MCP_CLIENT_CONFIG)],
  ["/.well-known/mcp.json", () => json(MCP_SERVER_CARD)],
  ["/.well-known/mcp/server-card.json", () => json(MCP_SERVER_CARD)],
  ["/.well-known/mcp", () => json(MCP_MANIFEST)],
])

export function jsonError(
  status: number,
  code: string,
  message: string,
  hint: string,
): Response {
  return new Response(
    JSON.stringify({ error: { code, message, hint } }, null, 2) + "\n",
    {
      status,
      headers: {
        ...JSON_HEADERS,
        "cache-control": "no-store",
      },
    },
  )
}

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body, null, 2) + "\n", {
    status,
    headers: JSON_HEADERS,
  })
}

function yaml(body: string): Response {
  return new Response(body, {
    status: 200,
    headers: {
      "content-type": "application/yaml; charset=utf-8",
      "x-content-type-options": "nosniff",
      "access-control-allow-origin": "*",
      "cache-control": "public, max-age=3600",
      vary: VARY,
    },
  })
}

function markdown(body: string, status = 200): Response {
  return new Response(body.endsWith("\n") ? body : `${body}\n`, {
    status,
    headers: MD_HEADERS,
  })
}

function html(body: string, status = 200): Response {
  return new Response(body, { status, headers: HTML_HEADERS })
}

function notAcceptable(available: string[]): Response {
  const body = `# Not acceptable\n\nThis URL can be served as: ${available.join(", ")}.\nSend Accept: text/markdown or Accept: text/html.\n`
  return new Response(body, {
    status: 406,
    headers: {
      ...MD_HEADERS,
      "cache-control": "no-store",
    },
  })
}

function normalizePath(pathname: string): string {
  if (pathname === "") return "/"
  return pathname
}

function pagePath(pathname: string): string | null {
  if (pathname === "/") return "/"
  if (PAGES[pathname]) return pathname
  if (!pathname.endsWith("/") && PAGES[`${pathname}/`]) return `${pathname}/`
  return null
}

function withVary(response: Response): Response {
  const headers = new Headers(response.headers)
  const existing = headers.get("vary")
  if (!existing) headers.set("vary", VARY)
  else if (!/\baccept\b/i.test(existing)) {
    headers.set("vary", `${existing}, ${VARY}`)
  }
  return new Response(response.body, { status: response.status, headers })
}

function pageHtml(path: string): string {
  const page = PAGES[path]
  return wrapPage({
    title: page.title,
    description: page.description,
    canonical: path === "/" ? `${SITE}/` : `${SITE}${path}`,
    body: markdownToHtml(page.markdown),
  })
}

export async function handleRequest(
  request: Request,
  assets: AssetFetcher,
): Promise<Response> {
  const url = new URL(request.url)
  const path = normalizePath(url.pathname)
  const accept = request.headers.get("Accept")

  if (request.method === "OPTIONS") {
    return new Response(null, {
      status: 204,
      headers: {
        "access-control-allow-origin": "*",
        "access-control-allow-methods": "GET, HEAD, OPTIONS",
        "access-control-allow-headers": "Accept",
        vary: VARY,
      },
    })
  }

  if (request.method !== "GET" && request.method !== "HEAD") {
    if (path.startsWith("/api/") || MACHINE.has(path)) {
      return maybeHead(
        request,
        jsonError(
          405,
          "method_not_allowed",
          `${request.method} is not allowed on ${path}.`,
          "Use GET.",
        ),
      )
    }
  }

  const machine = MACHINE.get(path)
  if (machine) return maybeHead(request, machine())

  if (path.startsWith("/api/")) {
    return maybeHead(
      request,
      jsonError(
        404,
        "not_found",
        `No API route ${path}.`,
        "GET /api/status or read https://premiere-mcp.com/openapi.json.",
      ),
    )
  }

  const resolved = pagePath(path)
  if (resolved && path !== resolved) {
    url.pathname = resolved
    return new Response(null, {
      status: 308,
      headers: { location: url.pathname + url.search, vary: VARY },
    })
  }

  if (resolved) {
    const available: Media[] = ["html", "markdown"]
    const choice = negotiate(accept, available)
    if (choice === "not_acceptable") {
      return maybeHead(request, notAcceptable(availableTypes(available)))
    }
    if (choice === "markdown") {
      return maybeHead(request, markdown(PAGES[resolved].markdown))
    }

    const asset = await assets.fetch(request)
    if (asset.status < 400 && asset.headers.get("content-type")?.includes("html")) {
      return maybeHead(request, withVary(asset))
    }
    return maybeHead(request, html(pageHtml(resolved)))
  }

  const asset = await assets.fetch(request)
  if (asset.status !== 404) return maybeHead(request, asset)

  const available: Media[] = ["markdown", "html"]
  const choice = negotiate(accept, available)
  if (choice === "not_acceptable") {
    return maybeHead(request, notAcceptable(availableTypes(available)))
  }
  if (choice === "html") {
    return maybeHead(
      request,
      html(
        wrapPage({
          title: "Not found — Premiere Pro MCP",
          description: "That path is not on premiere-mcp.com.",
          canonical: `${SITE}${path}`,
          body: markdownToHtml(NOT_FOUND_MD),
        }),
        404,
      ),
    )
  }
  return maybeHead(request, markdown(NOT_FOUND_MD, 404))
}

function maybeHead(request: Request, response: Response): Response {
  if (request.method !== "HEAD") return response
  return new Response(null, { status: response.status, headers: response.headers })
}

export default {
  async fetch(request: Request, env: { ASSETS: AssetFetcher }): Promise<Response> {
    return handleRequest(request, env.ASSETS)
  },
}
