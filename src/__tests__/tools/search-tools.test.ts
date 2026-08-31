import { PremiereProTools } from '../../tools/index.js';
import {
  CORE_ADVERTISED_TOOL_NAMES,
  resolveToolset,
  searchPremiereTools,
} from '../../tools/search.js';

jest.mock('../../bridge/index.js');

function stubToolset(value: string | undefined): () => void {
  const previous = process.env.PREMIERE_MCP_TOOLSET;
  if (value === undefined) delete process.env.PREMIERE_MCP_TOOLSET;
  else process.env.PREMIERE_MCP_TOOLSET = value;
  return () => {
    if (previous === undefined) delete process.env.PREMIERE_MCP_TOOLSET;
    else process.env.PREMIERE_MCP_TOOLSET = previous;
  };
}

describe('tool search', () => {
  const tools = new PremiereProTools({ executeScript: async () => ({ success: true }) } as never);

  afterEach(() => {
    delete process.env.PREMIERE_MCP_TOOLSET;
  });

  it('defaults to the Anthropic-style always-on set', () => {
    const restore = stubToolset(undefined);
    try {
      expect(resolveToolset()).toBe('search');
      expect(tools.getAdvertisedTools().map((tool) => tool.name)).toEqual([...CORE_ADVERTISED_TOOL_NAMES]);
      expect(tools.getAvailableTools().length).toBe(283);
      expect(tools.getAdvertisedTools()).toHaveLength(5);
    } finally {
      restore();
    }
  });

  it('lists the full catalog when PREMIERE_MCP_TOOLSET=full', () => {
    const restore = stubToolset('full');
    try {
      expect(resolveToolset()).toBe('full');
      expect(tools.getAdvertisedTools()).toHaveLength(283);
    } finally {
      restore();
    }
  });

  it('ranks trim_clip for a natural-language duration query', async () => {
    const result = await tools.executeTool('search_tools', { query: 'trim clip duration' });
    expect(result.success).toBe(true);
    expect(result.mode).toBe('bm25');
    expect(result.matches[0].name).toBe('trim_clip');
    expect(result.matches).toHaveLength(5);
    expect(result.nextStep).toMatch(/invoke_tool/);
  });

  it('finds export tools with BM25', async () => {
    const result = await tools.executeTool('search_tools', { query: 'export sequence media encoder' });
    expect(result.success).toBe(true);
    const names: string[] = result.matches.map((match: { name: string }) => match.name);
    expect(names.some((name) => name.startsWith('export_'))).toBe(true);
  });

  it('matches regex patterns like Anthropic tool_search_tool_regex', async () => {
    const result = await tools.executeTool('search_tools', { pattern: '^list_', limit: 8 });
    expect(result.success).toBe(true);
    expect(result.mode).toBe('regex');
    expect(result.matches.length).toBeGreaterThan(3);
    expect(result.matches.every((match: { name: string }) => match.name.startsWith('list_'))).toBe(true);
  });

  it('rejects an invalid regex instead of throwing', async () => {
    const result = await tools.executeTool('search_tools', { pattern: '(' });
    expect(result.success).toBe(false);
    expect(result.errorCode).toBe('search_invalid_regex');
    expect(result.retry).toBe(false);
  });

  it('lists categories when query and pattern are omitted', async () => {
    const result = await tools.executeTool('search_tools', {});
    expect(result.success).toBe(true);
    expect(result.mode).toBe('categories');
    expect(result.matches).toEqual([]);
    expect(result.categories.some((entry: { category: string }) => entry.category === 'timeline')).toBe(true);
  });

  it('returns a JSON schema from get_tool_schema', async () => {
    const result = await tools.executeTool('get_tool_schema', { name: 'trim_clip' });
    expect(result.success).toBe(true);
    expect(result.inputSchema.type).toBe('object');
    expect(result.inputSchema.properties).toBeDefined();
    expect(result.nextStep).toMatch(/invoke_tool/);
  });

  it('includes inputSchema when detail=schema', async () => {
    const result = await tools.executeTool('search_tools', { pattern: '^trim_clip$', detail: 'schema' });
    expect(result.success).toBe(true);
    expect(result.matches[0].name).toBe('trim_clip');
    expect(result.matches[0].inputSchema.type).toBe('object');
  });

  it('runs a catalog tool through invoke_tool', async () => {
    const result = await tools.executeTool('invoke_tool', {
      name: 'get_capabilities',
      arguments: {},
    });
    expect(result.success).toBe(true);
    expect(result.catalog.tools).toBe(283);
  });

  it('refuses nested invoke_tool', async () => {
    const result = await tools.executeTool('invoke_tool', { name: 'invoke_tool', arguments: {} });
    expect(result.success).toBe(false);
    expect(result.errorCode).toBe('invoke_nested');
  });

  it('does not dump the catalog on an unknown tool name', async () => {
    const result = await tools.executeTool('not_a_real_premiere_tool', {});
    expect(result.success).toBe(false);
    expect(result.agentAction).toBe('search_tools');
    expect(result.availableTools).toBeUndefined();
  });

  it('scores BM25 over a tiny catalog the way Anthropic search does', () => {
    const result = searchPremiereTools(
      [
        { name: 'get_weather', description: 'Get the weather at a specific location' },
        { name: 'search_files', description: 'Search through files in the workspace' },
        { name: 'trim_clip', description: 'Change a clip in or out point or duration' },
      ],
      { query: 'weather in san francisco', limit: 5 },
    );
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.matches[0]?.name).toBe('get_weather');
    }
  });
});
