import { z } from 'zod';

/**
 * A tool as advertised to an MCP client.
 *
 * `inputSchema` is the same schema that executeTool parses arguments with, so
 * what a client is told to send and what the server accepts cannot drift.
 */
export interface MCPTool {
  name: string;
  description: string;
  inputSchema: z.ZodSchema<any>;
}
