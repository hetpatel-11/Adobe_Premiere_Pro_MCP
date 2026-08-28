#!/usr/bin/env node

import { serveStdio, type StdioServerHandle } from '@modelcontextprotocol/server/stdio';
import { Server, ProtocolError, ProtocolErrorCode, type CallToolResult } from '@modelcontextprotocol/server';
import { z, type ZodTypeAny } from 'zod';
import { PremiereProTools } from './tools/index.js';
import { PremiereProResources } from './resources/index.js';
import { PremiereProPrompts } from './prompts/index.js';
import { PremiereProBridge } from './bridge/index.js';
import { Logger } from './utils/logger.js';
import { PACKAGE_VERSION } from './version.js';
import { checkForUpdate } from './utils/update-check.js';
import {
  getTelemetry,
  summarizeToolFailure,
  type Telemetry,
  type TrackToolCallInput,
} from './utils/telemetry.js';

type ObjectJsonSchema = Record<string, unknown> & { type: 'object' };

class MCPPremiereProServer {
  private stdioHandle?: StdioServerHandle;
  private tools: PremiereProTools;
  private resources: PremiereProResources;
  private prompts: PremiereProPrompts;
  private bridge: PremiereProBridge;
  private logger: Logger;
  private telemetry: Telemetry;

  constructor() {
    this.logger = new Logger('MCPPremiereProServer');
    this.telemetry = getTelemetry();

    this.bridge = new PremiereProBridge();
    this.tools = new PremiereProTools(this.bridge);
    this.resources = new PremiereProResources(this.bridge);
    this.prompts = new PremiereProPrompts();
  }

  private buildServer(): Server {
    const server = new Server(
      {
        name: 'adobe-premiere-pro-mcp',
        version: PACKAGE_VERSION,
        description: 'Model Context Protocol tools for Adobe Premiere Pro - AI-powered video editing'
      },
      {
        capabilities: {
          tools: {},
          resources: {},
          prompts: {}
        }
      }
    );

    this.setupHandlers(server);
    return server;
  }

  private inputSchemaToJsonSchema(inputSchema: ZodTypeAny): ObjectJsonSchema {
    const jsonSchema = z.toJSONSchema(inputSchema, { unrepresentable: 'any' }) as Record<string, unknown>;
    if (jsonSchema.type !== 'object') {
      return { type: 'object', additionalProperties: true };
    }
    return jsonSchema as ObjectJsonSchema;
  }

  private setupHandlers(server: Server): void {
    // List available tools
    server.setRequestHandler('tools/list', async () => {
      const tools = this.tools.getAvailableTools().map((tool) => ({
        name: tool.name,
        description: tool.description,
        inputSchema: this.inputSchemaToJsonSchema(tool.inputSchema as ZodTypeAny)
      }));
      return { tools };
    });

    // Execute tool calls
    server.setRequestHandler('tools/call', async (request) => {
      const { name, arguments: args } = request.params;
      const startedAt = Date.now();

      try {
        const result = await this.tools.executeTool(name, args || {});
        this.recordToolCall(name, result, Date.now() - startedAt);
        const toolResult: CallToolResult = {
          content: [
            {
              type: 'text' as const,
              text: JSON.stringify(result, null, 2)
            }
          ],
          structuredContent: result as Record<string, unknown>,
          isError: result.success === false
        };
        return server.projectCallToolResult(toolResult, undefined);
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : 'Unknown error';
        this.recordToolCall(name, { success: false, error: errorMessage }, Date.now() - startedAt);
        this.logger.error(`Tool execution failed: ${errorMessage}`);
        
        throw new ProtocolError(
          ProtocolErrorCode.InternalError,
          `Failed to execute tool '${name}': ${errorMessage}`
        );
      }
    });

    // List available resources
    server.setRequestHandler('resources/list', async () => {
      return {
        resources: this.resources.getAvailableResources()
      };
    });

    // Read resource content
    server.setRequestHandler('resources/read', async (request) => {
      const { uri } = request.params;
      
      try {
        const resource = this.resources.getResource(uri);
        if (!resource) {
          throw new Error(`Resource '${uri}' not found`);
        }
        const content = await this.resources.readResource(uri);
        const text = typeof content === 'string' ? content : JSON.stringify(content, null, 2);
        return {
          contents: [
            {
              uri,
              mimeType: resource.mimeType,
              text
            }
          ]
        };
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : 'Unknown error';
        this.logger.error(`Resource read failed: ${errorMessage}`);
        
        throw new ProtocolError(
          ProtocolErrorCode.InternalError,
          `Failed to read resource '${uri}': ${errorMessage}`
        );
      }
    });

    // List available prompts
    server.setRequestHandler('prompts/list', async () => {
      return {
        prompts: this.prompts.getAvailablePrompts()
      };
    });

    // Get prompt content
    server.setRequestHandler('prompts/get', async (request) => {
      const { name, arguments: args } = request.params;
      
      try {
        const prompt = await this.prompts.getPrompt(name, args || {});
        return {
          description: prompt.description,
          messages: prompt.messages
        };
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : 'Unknown error';
        this.logger.error(`Prompt generation failed: ${errorMessage}`);
        
        throw new ProtocolError(
          ProtocolErrorCode.InternalError,
          `Failed to generate prompt '${name}': ${errorMessage}`
        );
      }
    });

    // Error handling
    server.onerror = (error) => {
      this.logger.error('Server error:', error);
    };
  }

  private recordToolCall(name: string, result: unknown, durationMs: number): void {
    const success =
      !result ||
      typeof result !== 'object' ||
      (result as { success?: unknown }).success !== false;
    const input: TrackToolCallInput = {
      tool: name,
      success,
      durationMs
    };
    if (!success) {
      const summary = summarizeToolFailure(result);
      input.errorKind = summary.errorKind;
      if (summary.errorCode) input.errorCode = summary.errorCode;
      if (summary.errorFields) input.errorFields = summary.errorFields;
      if (summary.errorDetail) input.errorDetail = summary.errorDetail;
      if (summary.retry !== undefined) input.retry = summary.retry;
      if (summary.status) input.status = summary.status;
    }
    this.telemetry.trackToolCall(input);
  }

  async start(): Promise<void> {
    try {
      await this.bridge.initialize();
      this.logger.info('Adobe Premiere Pro bridge initialized');
      
      this.stdioHandle = serveStdio(() => this.buildServer(), {
        onerror: (error) => {
          this.logger.error('Stdio transport error:', error);
        }
      });
      
      this.logger.info('MCP Adobe Premiere Pro Server started successfully');
      this.telemetry.trackServerStarted();
      void checkForUpdate().then((status) => {
        if (status.available && !status.snoozed && status.nextStep) {
          this.logger.warn(status.nextStep);
        }
      });
    } catch (error) {
      this.logger.error('Failed to start server:', error);
      throw error;
    }
  }

  async stop(): Promise<void> {
    try {
      await this.stdioHandle?.close();
      await this.bridge.cleanup();
      this.logger.info('MCP Adobe Premiere Pro Server stopped');
    } catch (error) {
      this.logger.error('Error stopping server:', error);
      throw error;
    } finally {
      await this.telemetry.flush();
    }
  }
}

// Start the server
const server = new MCPPremiereProServer();

// Handle graceful shutdown
process.on('SIGINT', async () => {
  console.error('\nShutting down MCP Adobe Premiere Pro Server...');
  await server.stop();
  process.exit(0);
});

process.on('SIGTERM', async () => {
  console.error('\nShutting down MCP Adobe Premiere Pro Server...');
  await server.stop();
  process.exit(0);
});

// Start the server
server.start().catch((error) => {
  console.error('Failed to start MCP Adobe Premiere Pro Server:', error);
  process.exit(1);
}); 
