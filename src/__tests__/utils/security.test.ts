/**
 * Unit tests for security utilities
 */

import { escapeExtendScriptString } from '../../utils/security.js';

describe('escapeExtendScriptString', () => {
  // ExtendScript double-quoted string literals share JS escape semantics, so
  // parsing the escaped value back through a JS string literal mirrors what
  // Premiere's ExtendScript engine will see at runtime.
  const roundTrip = (value: string): string =>
    new Function(`return "${escapeExtendScriptString(value)}";`)() as string;

  it('doubles backslashes so Windows paths survive script injection', () => {
    const path = 'D:\\Videos\\Red Dead 2\\Review 2026\\frame.png';

    expect(escapeExtendScriptString(path)).toBe(
      'D:\\\\Videos\\\\Red Dead 2\\\\Review 2026\\\\frame.png'
    );
    expect(roundTrip(path)).toBe(path);
  });

  it('escapes double quotes so values cannot break out of string literals', () => {
    const value = 'My "Best" Clip';

    expect(escapeExtendScriptString(value)).toBe('My \\"Best\\" Clip');
    expect(roundTrip(value)).toBe(value);
  });

  it('escapes newlines, carriage returns and tabs', () => {
    const value = 'line1\nline2\rline3\tend';

    expect(escapeExtendScriptString(value)).toBe('line1\\nline2\\rline3\\tend');
    expect(roundTrip(value)).toBe(value);
  });

  it('neutralizes script injection attempts', () => {
    const hostile = '"; app.project.deleteSequence(seq); var x = "';

    expect(roundTrip(hostile)).toBe(hostile);
  });

  it('leaves plain values untouched', () => {
    expect(escapeExtendScriptString('sequence-42')).toBe('sequence-42');
  });
});
