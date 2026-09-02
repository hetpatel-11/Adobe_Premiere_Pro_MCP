/**
 * Tools that operate on this server's own catalog rather than on Premiere.
 *
 * They live apart from the domain modules because their handlers need the
 * catalog and the executeTool pipeline itself, which would otherwise make the
 * domain modules depend on the class that imports them.
 */
import { z } from 'zod';
import type { MCPTool } from './types.js';

export const metaToolDefinitions: MCPTool[] = [
  {
    name: 'search_tools',
    description: 'Search the Premiere tool catalog with a BM25 natural-language query or a regex pattern, then call invoke_tool. Use this instead of expecting 280 editing tools in the MCP tool list. Empty query lists categories. Default 5 matches.',
    inputSchema: z.object({
      query: z.string().optional().describe('Natural language BM25 query, e.g. "trim clip duration" or "export sequence"'),
      pattern: z.string().optional().describe('Case-insensitive regex over tool name, description, category, and argument names. e.g. "^list_" or "mogrt"'),
      limit: z.number().optional().describe('Max matches, 1-25. Defaults to 5.'),
      detail: z.enum(['names', 'descriptions', 'schema']).optional().describe('How much of each match to return. schema includes the JSON input schema. Defaults to descriptions.')
    })
  },
  {
    name: 'get_tool_schema',
    description: 'Return the full JSON input schema for one Premiere tool name from search_tools. After reading it, call invoke_tool.',
    inputSchema: z.object({
      name: z.string().min(1).describe('Exact tool name, e.g. trim_clip')
    })
  },
  {
    name: 'invoke_tool',
    description: 'Run a Premiere tool by exact name. Use after search_tools. Hosts that only advertise the small always-on set cannot call trim_clip etc. as top-level MCP tools.',
    inputSchema: z.object({
      name: z.string().min(1).describe('Exact tool name returned by search_tools'),
      arguments: z.record(z.string(), z.any()).optional().describe('Arguments for that tool')
    })
  },
];
