import {
  buildPremiereScript,
  escapeForExtendScript,
  literalForExtendScript,
} from '../../tools/extendscript.js';

describe('ExtendScript helper utilities', () => {
  describe('escapeForExtendScript()', () => {
    it('escapes quotes, backslashes, control characters, and line separators without wrapping the value', () => {
      const escaped = escapeForExtendScript('Quote " apostrophe \' slash \\ newline\ncarriage\rtab\tline\u2028para\u2029');

      expect(escaped).toBe('Quote \\" apostrophe \\\' slash \\\\ newline\\ncarriage\\rtab\\tline\\u2028para\\u2029');
    });
  });

  describe('literalForExtendScript()', () => {
    it('serializes structured values as safe JavaScript literals', () => {
      const literal = literalForExtendScript({
        text: 'A "quoted" path \\server\nnext',
        unicode: 'snowman ☃',
        array: [1, true, null],
      });

      expect(literal).toBe('{"text":"A \\"quoted\\" path \\\\server\\nnext","unicode":"snowman ☃","array":[1,true,null]}');
    });

    it('converts non-finite numbers to null instead of emitting invalid JSON literals', () => {
      expect(literalForExtendScript({ ok: 1, bad: Number.POSITIVE_INFINITY, nan: Number.NaN })).toBe('{"ok":1,"bad":null,"nan":null}');
    });
  });

  describe('buildPremiereScript()', () => {
    it('wraps a body in a named IIFE with bridge-compatible JSON result handling', () => {
      const script = buildPremiereScript('    return { success: true, value: clipName };', '__testTool');

      expect(script).toContain('(function __testTool()');
      expect(script).toContain('try {');
      expect(script).toContain('return JSON.stringify(__mcpToolResult);');
      expect(script).toContain('return JSON.stringify({ success: false, error: String(__mcpToolError) });');
      expect(script).toContain('return { success: true, value: clipName };');
      expect(script.trim().endsWith('})();')).toBe(true);
    });

    it('rejects invalid function names before producing a script', () => {
      expect(() => buildPremiereScript('return { success: true };', 'bad-name')).toThrow('Invalid ExtendScript function name');
    });
  });
});
