import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { PremiereProTools } from '../../tools/index.js';
import { domainTools } from '../../tools/domains/index.js';
import { metaToolDefinitions } from '../../tools/meta.js';

jest.mock('../../bridge/index.js');

/**
 * Each domain module pairs a tool's declaration with its handler, so the two
 * cannot drift the way they did when declarations sat in one array and handlers
 * in a switch several thousand lines away. What can still drift is the wiring:
 * a domain module missing from the barrel disappears from the catalog silently,
 * and a name declared twice leaves one copy unreachable. These tests are that
 * wiring.
 */
const DOMAINS_DIR = join(__dirname, '../../tools/domains');
const domainModules = readdirSync(DOMAINS_DIR)
  .filter((file) => file.endsWith('.ts') && file !== 'index.ts')
  .map((file) => file.replace(/\.ts$/, ''));

describe('tool catalog structure', () => {
  const tools = new PremiereProTools({ executeScript: async () => ({ success: true }) } as never);

  it('declares every tool exactly once', () => {
    const names = [...metaToolDefinitions, ...domainTools].map((tool) => tool.name);
    const duplicates = names.filter((name, index) => names.indexOf(name) !== index);
    expect(duplicates).toEqual([]);
  });

  it('gives every domain tool a callable handler', () => {
    const unrunnable = domainTools.filter((tool) => typeof tool.run !== 'function');
    expect(unrunnable.map((tool) => tool.name)).toEqual([]);
    expect(domainTools.length).toBe(112);
  });

  it('exposes every domain module through the barrel', () => {
    expect(domainModules.length).toBeGreaterThan(1);
    const barrel = readFileSync(join(DOMAINS_DIR, 'index.ts'), 'utf8');
    for (const name of domainModules) {
      if (name === 'shared') continue; // helpers only; contributes no tools
      expect(barrel).toContain(`from './${name}.js'`);
      expect(barrel).toContain(`...${name}Tools,`);
    }
  });

  it('routes the meta tools through the class rather than the registry', () => {
    // They read the catalog and re-enter executeTool, so they cannot be plain
    // domain entries. Losing that wiring would make them report as unknown.
    expect(metaToolDefinitions.map((tool) => tool.name)).toEqual([
      'search_tools',
      'get_tool_schema',
      'invoke_tool',
    ]);
    for (const tool of metaToolDefinitions) {
      expect(domainTools.some((entry) => entry.name === tool.name)).toBe(false);
    }
  });

  it('reaches a handler for every tool it advertises', async () => {
    const notImplemented: string[] = [];
    for (const tool of tools.getAvailableTools()) {
      const result = await tools.executeTool(tool.name, {});
      if (result?.errorCode === 'tool_not_implemented') notImplemented.push(tool.name);
    }
    expect(notImplemented).toEqual([]);
  }, 120000);

  it('gives every tool a name, description, and schema', () => {
    for (const tool of tools.getAvailableTools()) {
      expect(tool.name).toMatch(/^[a-z][a-z0-9_]*$/);
      expect(tool.description.length).toBeGreaterThan(10);
      expect(typeof tool.inputSchema?.parse).toBe('function');
    }
  });
});
