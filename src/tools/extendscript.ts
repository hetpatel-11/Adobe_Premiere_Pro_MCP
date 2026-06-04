const EXTENDSCRIPT_IDENTIFIER = /^[A-Za-z_$][A-Za-z0-9_$]*$/;

/**
 * Escape a string so it can be embedded inside a quoted ExtendScript string.
 * The return value is intentionally not wrapped in quotes.
 */
export function escapeForExtendScript(value: string): string {
  return String(value)
    .replace(/\\/g, '\\\\')
    .replace(/"/g, '\\"')
    .replace(/'/g, "\\'")
    .replace(/\r/g, '\\r')
    .replace(/\n/g, '\\n')
    .replace(/\t/g, '\\t')
    .replace(/\u2028/g, '\\u2028')
    .replace(/\u2029/g, '\\u2029');
}

/**
 * Serialize structured data into a safe JavaScript/ExtendScript literal.
 * Non-finite numbers are normalized to null because JSON cannot represent them.
 */
export function literalForExtendScript(value: unknown): string {
  const literal = JSON.stringify(value, (_key, nestedValue) => {
    if (typeof nestedValue === 'number' && !Number.isFinite(nestedValue)) {
      return null;
    }
    if (typeof nestedValue === 'bigint') {
      return nestedValue.toString();
    }
    if (typeof nestedValue === 'function' || typeof nestedValue === 'symbol') {
      return undefined;
    }
    return nestedValue;
  });

  if (typeof literal === 'undefined') {
    return 'undefined';
  }

  return literal
    .replace(/\u2028/g, '\\u2028')
    .replace(/\u2029/g, '\\u2029');
}

/**
 * Build a bridge-compatible ExtendScript IIFE.
 * The body should return either an object (serialized here) or an already serialized string.
 */
export function buildPremiereScript(body: string, functionName = '__premiereMcpTool'): string {
  if (!EXTENDSCRIPT_IDENTIFIER.test(functionName)) {
    throw new Error(`Invalid ExtendScript function name: ${functionName}`);
  }

  return `(function ${functionName}() {
  try {
    var __mcpToolResult = (function() {
${body}
    })();
    if (typeof __mcpToolResult === 'string') {
      return __mcpToolResult;
    }
    return JSON.stringify(__mcpToolResult);
  } catch (__mcpToolError) {
    return JSON.stringify({ success: false, error: String(__mcpToolError) });
  }
})();`;
}
