/**
 * The Premiere Pro tool server.
 *
 * This module owns the pipeline every tool call passes through — NUL
 * rejection, catalog lookup, argument canonicalization, Zod validation, and
 * bridge-failure translation — and nothing else. The tools themselves live in
 * ./domains, one module per thing they operate on, each pairing a tool's
 * declaration with the handler that implements it.
 */
import { z } from 'zod';
import type { PremiereProTransport } from '../bridge/types.js';
import { bridgeUnavailableResult, isBridgeUnavailableMessage } from '../bridge/errors.js';
import { Logger } from '../utils/logger.js';
import { executeExpandedTool, getExpandedTools, isExpandedTool } from './expanded.js';
import { canonicalizeMcpArgs } from '../utils/mcp-args.js';
import type { ToolContext, ToolModule } from './context.js';
import type { MCPTool } from './types.js';
import { domainTools } from './domains/index.js';
import { metaToolDefinitions } from './meta.js';
import {
  advertisedToolNames,
  categorizeTool,
  resolveToolset,
  schemaTextFromShape,
  searchPremiereTools,
  type SearchDetail,
  type SearchableTool,
} from './search.js';

export type { MCPTool } from './types.js';
export { evaluateTextInjectionResult } from './domains/graphics.js';

/**
 * The catalog this server implements directly. Meta tools come first because
 * they are what an agent reaches for before it knows any other tool name.
 */
const LOCAL_TOOLS: MCPTool[] = [...metaToolDefinitions, ...domainTools];

/**
 * Dispatch table for the Premiere tools. The meta tools are deliberately
 * absent: their handlers read the catalog and re-enter executeTool, so they
 * stay methods on the class rather than entries here.
 */
const TOOL_HANDLERS = new Map<string, ToolModule>(domainTools.map((tool) => [tool.name, tool]));

export function findNulByteArgument(value: any, path = ''): string | null {
  if (typeof value === 'string') {
    return value.indexOf('\u0000') === -1 ? null : (path || 'argument');
  }

  if (Array.isArray(value)) {
    for (let i = 0; i < value.length; i++) {
      const found = findNulByteArgument(value[i], `${path}[${i}]`);
      if (found) return found;
    }
    return null;
  }

  if (value && typeof value === 'object') {
    for (const key of Object.keys(value)) {
      const found = findNulByteArgument(value[key], path ? `${path}.${key}` : key);
      if (found) return found;
    }
  }

  return null;
}

export class PremiereProTools {
  private logger: Logger;
  private context: ToolContext;

  constructor(bridge: PremiereProTransport) {
    this.logger = new Logger('PremiereProTools');
    this.context = {
      bridge,
      logger: this.logger,
      listTools: () => this.getAvailableTools(),
      listAdvertisedTools: () => this.getAdvertisedTools(),
    };
  }

  private getLocalTools(): MCPTool[] {
    return LOCAL_TOOLS;
  }

  getAvailableTools(): MCPTool[] {
    const localTools = this.getLocalTools();
    return [
      ...localTools,
      ...getExpandedTools(new Set(localTools.map((tool) => tool.name)))
    ];
  }

  getAdvertisedTools(): MCPTool[] {
    const catalog = this.getAvailableTools();
    const advertised = advertisedToolNames();
    if (!advertised) return catalog;
    const byName = new Map(catalog.map((tool) => [tool.name, tool]));
    return advertised.flatMap((name) => {
      const tool = byName.get(name);
      return tool ? [tool] : [];
    });
  }

  async executeTool(name: string, args: Record<string, any>): Promise<any> {
    // Premiere truncates a string at the first NUL when it is assigned — a
    // marker named "p\0q" is created as "p" — and reports success for the
    // truncated result. JSON.stringify escapes the NUL on the way into the
    // generated script, so nothing downstream ever sees a raw byte to reject.
    // This is the only layer that still holds the caller's actual value, so
    // refuse it here rather than silently storing a different string.
    const nulPath = findNulByteArgument(args);
    if (nulPath) {
      return {
        success: false,
        status: 'validation',
        retry: false,
        errorCode: 'nul_argument',
        error: `Argument '${nulPath}' contains a NUL character. Premiere silently truncates strings at the first NUL rather than rejecting them, so this would have stored a shortened value and reported success. Remove the NUL and retry.`,
      };
    }

    const tool = this.getAvailableTools().find(t => t.name === name);
    if (!tool) {
      return {
        success: false,
        retry: false,
        errorCode: 'tool_not_found',
        agentAction: 'search_tools',
        error: `Tool '${name}' not found. Call search_tools with a query or pattern, then invoke_tool with the exact name.`,
      };
    }

    // Agents send snake_case keys and stringify numbers. Canonicalize those
    // before Zod so the call reaches Premiere instead of dying as validation.
    args = canonicalizeMcpArgs(args);

    // Validate input arguments, and use what validation produced.
    //
    // The parsed value used to be discarded and the raw args passed on, which
    // made every .transform(), .default() and z.coerce() in every schema in this
    // file silently inert — a schema could validate correctly and then have no
    // effect at all. No schema relies on that today, so this changes no current
    // behaviour; it stops the next one that does from failing silently.
    //
    // Parsed values are merged OVER the raw args rather than replacing them.
    // Zod object schemas strip unknown keys by default, and several handlers
    // read alternate spellings (args.itemId || args.item_id), so replacing
    // outright would drop arguments callers are sending today.
    try {
      const validated = tool.inputSchema.parse(args);
      if (validated && typeof validated === 'object' && !Array.isArray(validated)) {
        args = { ...args, ...(validated as Record<string, unknown>) };
      }
    } catch (error) {
      const issues =
        error && typeof error === 'object' && Array.isArray((error as { issues?: unknown }).issues)
          ? (error as { issues: Array<{ path?: unknown; code?: unknown }> }).issues
          : [];
      const errorFields = issues
        .map((issue) =>
          Array.isArray(issue.path)
            ? issue.path.filter((part) => typeof part === 'string' || typeof part === 'number').join('.')
            : '',
        )
        .filter((field) => /^[A-Za-z0-9_.]+$/.test(field))
        .slice(0, 8)
        .join(',');
      const firstCode = typeof issues[0]?.code === 'string' ? issues[0].code : undefined;
      return {
        success: false,
        status: 'validation',
        retry: false,
        errorCode: firstCode && /^[a-z_]+$/.test(firstCode) ? `zod.${firstCode}` : 'zod.invalid',
        errorFields: errorFields || undefined,
        error: `Invalid arguments for tool '${name}': ${error}`,
        expectedSchema: tool.inputSchema.description
      };
    }

    this.logger.info(`Executing tool: ${name} with args:`, args);

    const localToolNames = new Set(this.getLocalTools().map((localTool) => localTool.name));
    if (!localToolNames.has(name) && isExpandedTool(name)) {
      return await executeExpandedTool(this.context.bridge, name, args);
    }
    
    try {
      const handler = TOOL_HANDLERS.get(name);
      if (handler) {
        return await handler.run(this.context, args);
      }

      switch (name) {
        case 'search_tools':
          return this.searchToolsCatalog(args);
        case 'get_tool_schema':
          return this.getToolSchema(String(args.name || ''));
        case 'invoke_tool':
          return this.invokeCatalogTool(args);

        default:
          return {
            success: false,
            retry: false,
            errorCode: 'tool_not_implemented',
            agentAction: 'search_tools',
            error: `Tool '${name}' not implemented. Call search_tools, then invoke_tool with a catalog name.`,
          };
      }
    } catch (error) {
      this.logger.error(`Error executing tool ${name}:`, error);
      const message = error instanceof Error ? error.message : String(error);
      if (isBridgeUnavailableMessage(message)) {
        return bridgeUnavailableResult(name, message);
      }
      return {
        success: false,
        error: `Tool execution failed: ${message}`,
        tool: name,
        args: args
      };
    }
  }

  // Tools that read this server's own catalog rather than talking to Premiere.
  private searchToolsCatalog(args: Record<string, unknown>): ReturnType<typeof searchPremiereTools> {
    const detail: SearchDetail =
      args.detail === 'names' || args.detail === 'schema' ? args.detail : 'descriptions';
    const catalog = this.getAvailableTools().map((tool) => {
      const entry: SearchableTool = {
        name: tool.name,
        description: tool.description,
        schemaText: schemaTextFromShape(tool.inputSchema as { shape?: Record<string, { description?: string }> }),
      };
      if (detail === 'schema') {
        entry.inputSchema = z.toJSONSchema(tool.inputSchema as z.ZodTypeAny, { unrepresentable: 'any' });
      }
      return entry;
    });
    const query = typeof args.query === 'string' ? args.query : undefined;
    const pattern = typeof args.pattern === 'string' ? args.pattern : undefined;
    const limit = typeof args.limit === 'number' ? args.limit : undefined;
    return searchPremiereTools(catalog, {
      ...(query !== undefined ? { query } : {}),
      ...(pattern !== undefined ? { pattern } : {}),
      ...(limit !== undefined ? { limit } : {}),
      detail,
      advertised: this.getAdvertisedTools().map((tool) => tool.name),
      toolset: resolveToolset(),
    });
  }

  private getToolSchema(name: string): Record<string, unknown> {
    const tool = this.getAvailableTools().find((candidate) => candidate.name === name);
    if (!tool) {
      return {
        success: false,
        retry: false,
        errorCode: 'tool_not_found',
        agentAction: 'search_tools',
        error: `Tool '${name}' not found. Call search_tools, then get_tool_schema with an exact catalog name.`,
      };
    }
    return {
      success: true,
      name: tool.name,
      description: tool.description,
      category: categorizeTool(tool.name),
      inputSchema: z.toJSONSchema(tool.inputSchema as z.ZodTypeAny, { unrepresentable: 'any' }),
      nextStep:
        resolveToolset() === 'full'
          ? `Call ${tool.name} directly, or invoke_tool with this name and arguments.`
          : `Call invoke_tool with name ${tool.name} and its arguments.`,
    };
  }

  private async invokeCatalogTool(args: Record<string, unknown>): Promise<unknown> {
    const innerName = typeof args.name === 'string' ? args.name.trim() : '';
    if (!innerName) {
      return {
        success: false,
        status: 'validation',
        retry: false,
        errorCode: 'invoke_missing_name',
        error: 'invoke_tool requires name (the exact catalog tool name from search_tools).',
      };
    }
    if (innerName === 'invoke_tool') {
      return {
        success: false,
        status: 'validation',
        retry: false,
        errorCode: 'invoke_nested',
        error: 'invoke_tool cannot invoke itself.',
      };
    }
    const rawArgs = args.arguments ?? args.args;
    const innerArgs =
      rawArgs && typeof rawArgs === 'object' && !Array.isArray(rawArgs)
        ? (rawArgs as Record<string, unknown>)
        : {};
    return this.executeTool(innerName, innerArgs);
  }
}
