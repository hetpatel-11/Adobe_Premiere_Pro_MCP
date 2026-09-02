import { CLI, NPM, PACKAGE, REPO, SITE, VERSION } from "./content.ts"

const errorSchema = {
  type: "object",
  required: ["error"],
  properties: {
    error: {
      type: "object",
      required: ["code", "message", "hint"],
      properties: {
        code: { type: "string", examples: ["not_found"] },
        message: { type: "string" },
        hint: { type: "string" },
      },
    },
  },
} as const

export const OPENAPI = {
  openapi: "3.1.0",
  info: {
    title: "Premiere Pro MCP site API",
    summary: "Machine-readable endpoints for premiere-mcp.com",
    description:
      "Discovery API for Premiere Pro MCP. The editing surface itself is a local stdio MCP server (CLI premiere-pro-mcp, npm adobe-premiere-pro-mcp), not these HTTP routes. Use GET /api/status, /openapi.json, /mcp.json, and /llms.txt to install and call that server.",
    version: VERSION,
    license: {
      name: "MIT",
      url: `${REPO}/blob/main/LICENSE.md`,
    },
    contact: {
      name: "Premiere Pro MCP",
      url: `${REPO}/issues`,
    },
  },
  servers: [{ url: SITE, description: "Canonical premiere-mcp.com" }],
  tags: [
    { name: "discovery", description: "Install metadata and OpenAPI" },
    { name: "mcp", description: "MCP client config and server cards" },
  ],
  paths: {
    "/api/status": {
      get: {
        operationId: "getStatus",
        tags: ["discovery"],
        summary: "Package and CLI status",
        description:
          "Returns the published npm package name, CLI binary, version, tool count, and install command for Premiere Pro MCP.",
        responses: {
          "200": {
            description: "Current package metadata",
            content: {
              "application/json": {
                schema: { $ref: "#/components/schemas/Status" },
              },
            },
          },
        },
      },
    },
    "/openapi.json": {
      get: {
        operationId: "getOpenApiJson",
        tags: ["discovery"],
        summary: "OpenAPI document (JSON)",
        description:
          "The OpenAPI 3.1 document for this site. Same document as GET /api/openapi.json.",
        responses: {
          "200": {
            description: "OpenAPI 3.1 JSON",
            content: {
              "application/json": {
                schema: { type: "object", additionalProperties: true },
              },
            },
          },
        },
      },
    },
    "/api/openapi.yaml": {
      get: {
        operationId: "getOpenApiYaml",
        tags: ["discovery"],
        summary: "OpenAPI document (YAML)",
        description: "YAML serialization of the same OpenAPI 3.1 document.",
        responses: {
          "200": {
            description: "OpenAPI 3.1 YAML",
            content: {
              "application/yaml": {
                schema: { type: "string" },
              },
            },
          },
        },
      },
    },
    "/llms.txt": {
      get: {
        operationId: "getLlmsTxt",
        tags: ["discovery"],
        summary: "Agent instruction file",
        description:
          "llms.txt for Premiere Pro MCP: when to use it, install commands, and canonical links.",
        responses: {
          "200": {
            description: "Plain-text agent instructions",
            content: { "text/plain": { schema: { type: "string" } } },
          },
        },
      },
    },
    "/mcp.json": {
      get: {
        operationId: "getMcpClientConfig",
        tags: ["mcp"],
        summary: "MCP client config snippet",
        description:
          "JSON a local MCP client can merge: mcpServers.premiere-pro.command = premiere-pro-mcp.",
        responses: {
          "200": {
            description: "mcpServers config",
            content: {
              "application/json": {
                schema: { $ref: "#/components/schemas/McpClientConfig" },
              },
            },
          },
        },
      },
    },
    "/.well-known/mcp/server-card.json": {
      get: {
        operationId: "getMcpServerCard",
        tags: ["mcp"],
        summary: "MCP server card",
        description:
          "SEP-1649-style server card. Transport is local stdio via the npm CLI, not Streamable HTTP.",
        responses: {
          "200": {
            description: "Server card JSON",
            content: {
              "application/json": {
                schema: { $ref: "#/components/schemas/McpServerCard" },
              },
            },
          },
        },
      },
    },
    "/.well-known/mcp": {
      get: {
        operationId: "getMcpManifest",
        tags: ["mcp"],
        summary: "MCP discovery manifest",
        description:
          "SEP-1960-style manifest enumerating the local stdio endpoint.",
        responses: {
          "200": {
            description: "Manifest JSON",
            content: {
              "application/json": {
                schema: { $ref: "#/components/schemas/McpManifest" },
              },
            },
          },
        },
      },
    },
  },
  components: {
    schemas: {
      Status: {
        type: "object",
        required: [
          "name",
          "package",
          "cli",
          "version",
          "tools",
          "homepage",
          "install",
        ],
        properties: {
          name: { type: "string", examples: ["Premiere Pro MCP"] },
          package: { type: "string", examples: [PACKAGE] },
          cli: { type: "string", examples: [CLI] },
          version: { type: "string", examples: [VERSION] },
          tools: { type: "integer", examples: [283] },
          homepage: { type: "string", format: "uri" },
          docs: { type: "string", format: "uri" },
          openapi: { type: "string", format: "uri" },
          repository: { type: "string", format: "uri" },
          npm: { type: "string", format: "uri" },
          install: { type: "string" },
        },
      },
      McpClientConfig: {
        type: "object",
        required: ["mcpServers"],
        properties: {
          mcpServers: {
            type: "object",
            additionalProperties: {
              type: "object",
              required: ["command"],
              properties: {
                command: { type: "string" },
              },
            },
          },
        },
      },
      McpServerCard: {
        type: "object",
        required: ["version", "protocolVersion", "serverInfo", "transport"],
        properties: {
          version: { type: "string" },
          protocolVersion: { type: "string" },
          serverInfo: {
            type: "object",
            required: ["name", "title", "description"],
            properties: {
              name: { type: "string" },
              title: { type: "string" },
              description: { type: "string" },
            },
          },
          transport: {
            type: "object",
            required: ["type"],
            properties: {
              type: { type: "string", examples: ["stdio"] },
              command: { type: "string" },
            },
          },
        },
      },
      McpManifest: {
        type: "object",
        required: ["mcp_version", "endpoints"],
        properties: {
          mcp_version: { type: "string" },
          endpoints: {
            type: "array",
            items: {
              type: "object",
              required: ["name", "transport"],
              properties: {
                name: { type: "string" },
                transport: { type: "string" },
                command: { type: "string" },
                package: { type: "string" },
              },
            },
          },
        },
      },
      Error: errorSchema,
    },
  },
  externalDocs: {
    description: "Install docs for Premiere Pro MCP",
    url: `${SITE}/docs/`,
  },
} as const

export const STATUS = {
  name: "Premiere Pro MCP",
  package: PACKAGE,
  cli: CLI,
  version: VERSION,
  tools: 283,
  homepage: `${SITE}/`,
  docs: `${SITE}/docs/`,
  openapi: `${SITE}/openapi.json`,
  repository: REPO,
  npm: NPM,
  install: `npm install -g ${PACKAGE}`,
}

export const MCP_CLIENT_CONFIG = {
  mcpServers: {
    "premiere-pro": {
      command: CLI,
    },
  },
}

export const MCP_SERVER_CARD = {
  version: VERSION,
  protocolVersion: "2025-06-18",
  serverInfo: {
    name: "premiere-pro-mcp",
    title: "Premiere Pro MCP",
    description:
      "Local MCP server for Adobe Premiere Pro. 283 tools through a CEP file bridge. Install adobe-premiere-pro-mcp and run premiere-pro-mcp on the same machine as Premiere. Not a remote Streamable HTTP MCP.",
  },
  transport: {
    type: "stdio",
    command: CLI,
  },
  packages: [
    {
      registryType: "npm",
      identifier: PACKAGE,
      transport: { type: "stdio" },
    },
  ],
  homepage: `${SITE}/`,
  repository: REPO,
}

export const MCP_MANIFEST = {
  mcp_version: "2025-06-18",
  endpoints: [
    {
      name: "premiere-pro",
      transport: "stdio",
      command: CLI,
      package: PACKAGE,
    },
  ],
}

export function toYaml(value: unknown, indent = 0): string {
  const pad = "  ".repeat(indent)
  if (value === null) return "null"
  if (typeof value === "boolean" || typeof value === "number") return String(value)
  if (typeof value === "string") {
    if (value === "" || /[:#\n&*?|[\]{}>,'"]/.test(value) || value !== value.trim()) {
      return JSON.stringify(value)
    }
    return value
  }
  if (Array.isArray(value)) {
    if (value.length === 0) return "[]"
    return value
      .map((item) => {
        if (item !== null && typeof item === "object") {
          const nested = toYaml(item, indent + 1)
          const [first, ...rest] = nested.split("\n")
          return `${pad}- ${first}\n${rest.map((line) => `${pad}  ${line}`).join("\n")}`.replace(/\n+$/, "")
        }
        return `${pad}- ${toYaml(item, indent + 1)}`
      })
      .join("\n")
  }
  if (typeof value === "object") {
    const entries = Object.entries(value)
    if (entries.length === 0) return "{}"
    return entries
      .map(([key, child]) => {
        if (child !== null && typeof child === "object") {
          const nested = toYaml(child, indent + 1)
          if (nested === "{}" || nested === "[]") return `${pad}${key}: ${nested}`
          return `${pad}${key}:\n${nested}`
        }
        return `${pad}${key}: ${toYaml(child, indent + 1)}`
      })
      .join("\n")
  }
  return JSON.stringify(value)
}
