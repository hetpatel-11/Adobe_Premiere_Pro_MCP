/**
 * Anthropic-style tool search for the Premiere catalog.
 *
 * Hosts that dump every MCP schema into the model (Cursor, Codex without
 * native tool search) cannot afford 280 Premiere definitions. Claude Code
 * already defers MCP schemas and searches names; this module is the same
 * idea implemented as MCP tools so every client can do it:
 *
 *   1. Advertise a small always-on set (search + invoke + a few core tools).
 *   2. Search the rest with BM25 (natural language) or regex (name fragments).
 *   3. Inspect one schema, then call invoke_tool.
 *
 * Mirrors https://platform.claude.com/docs/en/agents-and-tools/tool-use/tool-search-tool
 * and the MCP client progressive-discovery layers (search → inspect → execute).
 */

export const SEARCH_QUERY_MAX_CHARS = 500;
export const SEARCH_PATTERN_MAX_CHARS = 200;
export const SEARCH_DEFAULT_LIMIT = 5;
export const SEARCH_MAX_LIMIT = 25;

export const CORE_ADVERTISED_TOOL_NAMES = [
  'search_tools',
  'get_tool_schema',
  'invoke_tool',
  'verify_premiere_connection',
  'list_sequences',
] as const;

export type ToolsetMode = 'search' | 'full';
export type SearchDetail = 'names' | 'descriptions' | 'schema';
export type ToolCategory =
  | 'connection'
  | 'discovery'
  | 'project'
  | 'media'
  | 'sequence'
  | 'timeline'
  | 'effects'
  | 'audio'
  | 'markers'
  | 'graphics'
  | 'export'
  | 'metadata'
  | 'source'
  | 'playback'
  | 'scripting'
  | 'other';

export type SearchableTool = {
  name: string;
  description: string;
  schemaText?: string;
  inputSchema?: unknown;
};

export type SearchToolsOptions = {
  query?: string;
  pattern?: string;
  limit?: number;
  detail?: SearchDetail;
  advertised?: readonly string[];
  toolset?: ToolsetMode;
};

export type ToolSearchMatch = {
  name: string;
  description: string;
  category: ToolCategory;
  score: number;
  inputSchema?: unknown;
};

export type ToolSearchResult =
  | {
      success: true;
      mode: 'bm25' | 'regex' | 'categories';
      catalogSize: number;
      advertised: string[];
      toolset: ToolsetMode;
      limit: number;
      detail: SearchDetail;
      nextStep: string;
      matches: ToolSearchMatch[];
      categories?: Array<{ category: ToolCategory; count: number; examples: string[] }>;
    }
  | {
      success: false;
      status: 'validation';
      retry: false;
      errorCode: string;
      error: string;
    };

const BM25_K1 = 1.2;
const BM25_B = 0.75;

const CATEGORY_RULES: Array<{ category: ToolCategory; pattern: RegExp }> = [
  { category: 'connection', pattern: /^(search_tools|get_tool_schema|invoke_tool|verify_|ping|get_capabilities|get_premiere_state|get_version)/ },
  { category: 'scripting', pattern: /(extendscript|evaluate_expression|inspect_dom)/ },
  { category: 'export', pattern: /(export_|encode|render|encoder_preset|transcode|consolidate)/ },
  { category: 'graphics', pattern: /(mogrt|text_overlay|caption|title|graphics|adjustment_layer)/ },
  { category: 'effects', pattern: /(effect|transition|lumetri|color_|lut|keyframe)/ },
  { category: 'audio', pattern: /(audio|ducking|volume|silence|gain)/ },
  { category: 'markers', pattern: /marker/ },
  { category: 'source', pattern: /(source_monitor|source_in|open_in_source|match_frame)/ },
  { category: 'playback', pattern: /(play_|stop_playback|playhead)/ },
  { category: 'metadata', pattern: /(metadata|xmp)/ },
  { category: 'media', pattern: /(import_|relink|offline|proxy|bin|project_item|footage|media)/ },
  { category: 'sequence', pattern: /(sequence|nest|unnest|work_area)/ },
  { category: 'timeline', pattern: /(clip|track|timeline|razor|ripple|trim|split|overwrite|insert_from|lift_|extract_)/ },
  { category: 'project', pattern: /(project|scratch_disk|workspace)/ },
  { category: 'discovery', pattern: /^(list_|get_|find_|search_|check_)/ },
];

const TOOL_ALIASES: Record<string, string> = {
  trim_clip: 'shorten extend duration outpoint inpoint out point in point length',
  replace_clip: 'swap media preserve effects motion scale enabled',
  move_clip_to_track: 'relocate occupancy overwrite destination track',
  create_sequence_from_clips: 'nodeid hex ids from clips make sequence',
  apply_effect: 'lumetri exposure blur filter',
  remove_effect_by_name: 'delete effect uninstall component',
  add_text_overlay: 'title caption mogrt graphics type',
  detect_silence: 'quiet gaps ffmpeg audio silence',
  razor_timeline_at_time: 'cut split blade razor',
  add_to_timeline: 'place insert overwrite put clip on sequence',
  import_media: 'ingest bring files footage',
  export_sequence: 'render ame media encoder output',
  list_project_items: 'bins assets media inventory',
  list_sequence_tracks: 'clips on tracks video audio',
  get_active_sequence: 'current timeline open sequence',
  verify_premiere_connection: 'bridge panel connected launch premiere',
};

function tokenize(text: string): string[] {
  return text
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter((token) => token.length > 0);
}

export function resolveToolset(env: NodeJS.Dict<string | undefined> = process.env): ToolsetMode {
  const raw = String(env.PREMIERE_MCP_TOOLSET || '').trim().toLowerCase();
  if (raw === 'full' || raw === 'all' || raw === 'off' || raw === '0') return 'full';
  return 'search';
}

export function categorizeTool(name: string): ToolCategory {
  for (const rule of CATEGORY_RULES) {
    if (rule.pattern.test(name)) return rule.category;
  }
  return 'other';
}

export function advertisedToolNames(env: NodeJS.Dict<string | undefined> = process.env): readonly string[] | null {
  return resolveToolset(env) === 'full' ? null : CORE_ADVERTISED_TOOL_NAMES;
}

function documentTokens(tool: SearchableTool): string[] {
  const category = categorizeTool(tool.name);
  const aliases = TOOL_ALIASES[tool.name] ?? '';
  const schemaText = tool.schemaText ?? '';
  const haystack = [
    tool.name,
    tool.name,
    tool.name.replace(/_/g, ' '),
    tool.description,
    category,
    aliases,
    schemaText,
  ].join(' ');
  return tokenize(haystack);
}

function bm25Scores(tools: SearchableTool[], queryTokens: string[]): number[] {
  const docs = tools.map((tool) => documentTokens(tool));
  const n = docs.length || 1;
  const avgdl = docs.reduce((sum, doc) => sum + doc.length, 0) / n;
  const df = new Map<string, number>();
  for (const doc of docs) {
    const unique = new Set(doc);
    for (const token of unique) df.set(token, (df.get(token) ?? 0) + 1);
  }

  return docs.map((doc) => {
    const tf = new Map<string, number>();
    for (const token of doc) tf.set(token, (tf.get(token) ?? 0) + 1);
    const dl = doc.length || 1;
    let score = 0;
    for (const token of queryTokens) {
      const freq = tf.get(token) ?? 0;
      if (freq === 0) continue;
      const idf = Math.log(1 + (n - (df.get(token) ?? 0) + 0.5) / ((df.get(token) ?? 0) + 0.5));
      const denom = freq + BM25_K1 * (1 - BM25_B + BM25_B * (dl / (avgdl || 1)));
      score += idf * ((freq * (BM25_K1 + 1)) / denom);
    }
    return score;
  });
}

function clampLimit(limit: unknown): number {
  const n = typeof limit === 'number' && Number.isFinite(limit) ? Math.trunc(limit) : SEARCH_DEFAULT_LIMIT;
  if (n < 1) return 1;
  if (n > SEARCH_MAX_LIMIT) return SEARCH_MAX_LIMIT;
  return n;
}

function nextStep(toolset: ToolsetMode): string {
  return toolset === 'full'
    ? 'Call a matched tool by name, or invoke_tool with that name and its arguments.'
    : 'Call invoke_tool with the exact name and arguments. These matches are not top-level MCP tools unless PREMIERE_MCP_TOOLSET=full.';
}

function projectMatch(tool: SearchableTool, score: number, detail: SearchDetail): ToolSearchMatch {
  const match: ToolSearchMatch = {
    name: tool.name,
    description: tool.description,
    category: categorizeTool(tool.name),
    score: Math.round(score * 1000) / 1000,
  };
  if (detail === 'schema' && tool.inputSchema !== undefined) {
    match.inputSchema = tool.inputSchema;
  }
  if (detail === 'names') {
    match.description = '';
  }
  return match;
}

export function searchPremiereTools(tools: SearchableTool[], options: SearchToolsOptions = {}): ToolSearchResult {
  const detail: SearchDetail = options.detail === 'names' || options.detail === 'schema' ? options.detail : 'descriptions';
  const toolset = options.toolset ?? 'search';
  const advertised = [...(options.advertised ?? CORE_ADVERTISED_TOOL_NAMES)];
  const limit = clampLimit(options.limit);
  const query = typeof options.query === 'string' ? options.query.trim() : '';
  const pattern = typeof options.pattern === 'string' ? options.pattern.trim() : '';

  if (query.length > SEARCH_QUERY_MAX_CHARS) {
    return {
      success: false,
      status: 'validation',
      retry: false,
      errorCode: 'search_query_too_long',
      error: `query must be at most ${SEARCH_QUERY_MAX_CHARS} characters.`,
    };
  }
  if (pattern.length > SEARCH_PATTERN_MAX_CHARS) {
    return {
      success: false,
      status: 'validation',
      retry: false,
      errorCode: 'search_pattern_too_long',
      error: `pattern must be at most ${SEARCH_PATTERN_MAX_CHARS} characters.`,
    };
  }

  if (!query && !pattern) {
    const grouped = new Map<ToolCategory, string[]>();
    for (const tool of tools) {
      const category = categorizeTool(tool.name);
      const list = grouped.get(category) ?? [];
      list.push(tool.name);
      grouped.set(category, list);
    }
    const categories = [...grouped.entries()]
      .sort((a, b) => a[0].localeCompare(b[0]))
      .map(([category, names]) => ({
        category,
        count: names.length,
        examples: names.slice(0, 8),
      }));
    return {
      success: true,
      mode: 'categories',
      catalogSize: tools.length,
      advertised,
      toolset,
      limit,
      detail,
      nextStep: 'Search again with query (BM25, natural language) or pattern (regex over name and description). Then invoke_tool.',
      matches: [],
      categories,
    };
  }

  if (pattern) {
    let regex: RegExp;
    try {
      regex = new RegExp(pattern, 'i');
    } catch (error) {
      return {
        success: false,
        status: 'validation',
        retry: false,
        errorCode: 'search_invalid_regex',
        error: `pattern is not a valid regular expression: ${error instanceof Error ? error.message : String(error)}`,
      };
    }
    const matches: ToolSearchMatch[] = [];
    for (const tool of tools) {
      const fields = [
        tool.name,
        tool.description,
        categorizeTool(tool.name),
        tool.schemaText ?? '',
        TOOL_ALIASES[tool.name] ?? '',
      ];
      if (!fields.some((field) => regex.test(field))) continue;
      matches.push(projectMatch(tool, 1, detail));
      if (matches.length >= limit) break;
    }
    return {
      success: true,
      mode: 'regex',
      catalogSize: tools.length,
      advertised,
      toolset,
      limit,
      detail,
      nextStep: nextStep(toolset),
      matches,
    };
  }

  const queryTokens = tokenize(query);
  const scores = bm25Scores(tools, queryTokens);
  const ranked = tools
    .map((tool, index) => ({ tool, score: scores[index] ?? 0 }))
    .filter((entry) => entry.score > 0)
    .sort((a, b) => b.score - a.score || a.tool.name.localeCompare(b.tool.name))
    .slice(0, limit)
    .map((entry) => projectMatch(entry.tool, entry.score, detail));

  return {
    success: true,
    mode: 'bm25',
    catalogSize: tools.length,
    advertised,
    toolset,
    limit,
    detail,
    nextStep: nextStep(toolset),
    matches: ranked,
  };
}

export function schemaTextFromShape(schema: { shape?: Record<string, { description?: string }> } | undefined): string {
  const shape = schema?.shape;
  if (!shape) return '';
  return Object.entries(shape)
    .map(([key, value]) => `${key} ${value?.description ?? ''}`)
    .join(' ');
}
