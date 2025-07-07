#!/usr/bin/env node
/**
 * MCP Adobe Premiere Pro Server
 *
 * This server enables AI-powered video editing through natural language prompts
 * by providing Model Context Protocol tools for Adobe Premiere Pro.
 *
 * Features:
 * - Project management (create, open, save)
 * - Media import and management
 * - Timeline and sequence operations
 * - Video/audio editing operations
 * - Effects and transitions
 * - Rendering and export
 * - Metadata management
 */
import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { CallToolRequestSchema, ErrorCode, GetPromptRequestSchema, ReadResourceRequestSchema, ListPromptsRequestSchema, ListResourcesRequestSchema, ListToolsRequestSchema, McpError, } from '@modelcontextprotocol/sdk/types.js';
import { PremiereProTools } from './tools/index.js';
import { PremiereProResources } from './resources/index.js';
import { PremiereProPrompts } from './prompts/index.js';
import { PremiereProBridge } from './bridge/index.js';
import { Logger } from './utils/logger.js';
import { zodToJsonSchema } from 'zod-to-json-schema';
class MCPPremiereProServer {
    server;
    tools;
    resources;
    prompts;
    bridge;
    logger;
    constructor() {
        this.logger = new Logger('MCPPremiereProServer');
        this.server = new Server({
            name: 'mcp-adobe-premiere-pro',
            version: '1.0.0',
            description: 'Model Context Protocol tools for Adobe Premiere Pro - AI-powered video editing'
        }, {
            capabilities: {
                tools: {},
                resources: {},
                prompts: {},
                logging: {}
            }
        });
        this.bridge = new PremiereProBridge();
        this.tools = new PremiereProTools(this.bridge);
        this.resources = new PremiereProResources(this.bridge);
        this.prompts = new PremiereProPrompts();
        this.setupHandlers();
    }
    setupHandlers() {
        // List available tools
        this.server.setRequestHandler(ListToolsRequestSchema, async () => {
            const tools = this.tools.getAvailableTools().map((tool) => ({
                name: tool.name,
                description: tool.description,
                inputSchema: zodToJsonSchema(tool.inputSchema, { $refStrategy: 'none' })
            }));
            return { tools };
        });
        // Execute tool calls
        this.server.setRequestHandler(CallToolRequestSchema, async (request) => {
            const { name, arguments: args } = request.params;
            try {
                const result = await this.tools.executeTool(name, args || {});
                return {
                    content: [
                        {
                            type: 'text',
                            text: JSON.stringify(result, null, 2)
                        }
                    ]
                };
            }
            catch (error) {
                const errorMessage = error instanceof Error ? error.message : 'Unknown error';
                this.logger.error(`Tool execution failed: ${errorMessage}`);
                throw new McpError(ErrorCode.InternalError, `Failed to execute tool '${name}': ${errorMessage}`);
            }
        });
        // List available resources
        this.server.setRequestHandler(ListResourcesRequestSchema, async () => {
            return {
                resources: this.resources.getAvailableResources()
            };
        });
        // Read resource content
        this.server.setRequestHandler(ReadResourceRequestSchema, async (request) => {
            const { uri } = request.params;
            try {
                const content = await this.resources.readResource(uri);
                return {
                    contents: [
                        {
                            uri,
                            mimeType: 'application/json',
                            text: JSON.stringify(content, null, 2)
                        }
                    ]
                };
            }
            catch (error) {
                const errorMessage = error instanceof Error ? error.message : 'Unknown error';
                this.logger.error(`Resource read failed: ${errorMessage}`);
                throw new McpError(ErrorCode.InternalError, `Failed to read resource '${uri}': ${errorMessage}`);
            }
        });
        // List available prompts
        this.server.setRequestHandler(ListPromptsRequestSchema, async () => {
            return {
                prompts: this.prompts.getAvailablePrompts()
            };
        });
        // Get prompt content
        this.server.setRequestHandler(GetPromptRequestSchema, async (request) => {
            const { name, arguments: args } = request.params;
            try {
                const prompt = await this.prompts.getPrompt(name, args || {});
                return {
                    description: prompt.description,
                    messages: prompt.messages
                };
            }
            catch (error) {
                const errorMessage = error instanceof Error ? error.message : 'Unknown error';
                this.logger.error(`Prompt generation failed: ${errorMessage}`);
                throw new McpError(ErrorCode.InternalError, `Failed to generate prompt '${name}': ${errorMessage}`);
            }
        });
        // Error handling
        this.server.onerror = (error) => {
            this.logger.error('Server error:', error);
        };
    }
    async start() {
        try {
            await this.bridge.initialize();
            this.logger.info('Adobe Premiere Pro bridge initialized');
            const transport = new StdioServerTransport();
            await this.server.connect(transport);
            this.logger.info('MCP Adobe Premiere Pro Server started successfully');
        }
        catch (error) {
            this.logger.error('Failed to start server:', error);
            throw error;
        }
    }
    async stop() {
        try {
            await this.bridge.cleanup();
            this.logger.info('MCP Adobe Premiere Pro Server stopped');
        }
        catch (error) {
            this.logger.error('Error stopping server:', error);
            throw error;
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
//# sourceMappingURL=index.js.map