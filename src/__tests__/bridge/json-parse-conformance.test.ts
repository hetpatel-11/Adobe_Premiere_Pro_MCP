/**
 * Both copies of the parser, against the platform and against each other.
 *
 * The prelude lives inside a TypeScript template literal and the panel keeps a
 * hand-maintained copy of the same code as quoted strings. The two escape
 * differently, so one can be right while the other is wrong, and only the emitted
 * text tells you which. That happened: `(\.[0-9]+)?` written in the template
 * literal reached the host as `(.[0-9]+)?`, a dot matching any character, so the
 * server parser accepted `012`, `000` and `0123` as numbers while the panel copy
 * rejected them correctly. The server prelude is appended after the panel's, so
 * the broken one was the effective parser on both transports.
 *
 * Nothing caught it because the only leading-zero case anywhere was `01` — the
 * one value the bug cannot reach, since it needs the dot-substitute plus a
 * further digit.
 *
 * So: a shared corpus, both parsers, and the platform as oracle. Agreement
 * between the two copies is asserted separately from agreement with the platform,
 * because drift between them is its own failure and points at the escaping.
 */

import { PremiereProBridge } from '../../bridge/index.js';
import { promises as fs } from 'fs';
import path from 'path';
import vm from 'vm';

jest.mock('fs', () => ({
  promises: {
    mkdir: jest.fn(), access: jest.fn(), readdir: jest.fn(), writeFile: jest.fn(),
    readFile: jest.fn(), unlink: jest.fn(), rename: jest.fn(), rm: jest.fn(),
  }
}));

jest.mock('node:crypto', () => ({ randomUUID: jest.fn(() => 'test-uuid-1234') }));

const realFs = jest.requireActual<typeof import('fs')>('fs');
const PANEL = path.join(__dirname, '..', '..', '..', 'cep-plugin', 'bridge-cep.js');

type Parser = (text: string) => unknown;

describe('both copies of JSON.parse', () => {
  const mockFs = fs as jest.Mocked<typeof fs>;

  /** The server's parser, taken from the script the bridge actually writes. */
  const serverParser = async (): Promise<Parser> => {
    mockFs.mkdir.mockResolvedValue(undefined);
    mockFs.access.mockRejectedValue(new Error('Not found'));
    mockFs.writeFile.mockResolvedValue(undefined);
    mockFs.rename.mockResolvedValue(undefined);
    mockFs.unlink.mockResolvedValue(undefined);
    mockFs.readFile.mockResolvedValue(JSON.stringify({ ok: true }));

    const bridge = new PremiereProBridge();
    await bridge.initialize();
    await bridge.executeScript('return 1;');

    const call = mockFs.writeFile.mock.calls.find(
      ([, payload]) => typeof payload === 'string' && payload.includes('"script"'),
    );
    if (!call) throw new Error('no command file was written');
    const prelude = JSON.parse(call[1] as string).script as string;

    const sandbox: Record<string, unknown> = {};
    vm.createContext(sandbox);
    vm.runInContext(prelude.slice(0, prelude.indexOf('function __findSequence')), sandbox);
    return (sandbox as { __mcpParse: Parser }).__mcpParse;
  };

  /** The panel's parser, evaluated out of its own source. */
  const panelParser = (): Parser => {
    const source = realFs.readFileSync(PANEL, 'utf8');
    const start = source.indexOf('var EXTENDSCRIPT_COMPAT_HELPERS = [');
    const open = source.indexOf('[', start);
    const close = source.indexOf("].join('\\n');", open);
    const prelude = (vm.runInNewContext(source.slice(open, close + 1)) as string[]).join('\n');

    const sandbox: Record<string, unknown> = {};
    vm.createContext(sandbox);
    vm.runInContext(prelude, sandbox);
    return (sandbox as { __mcpParse: Parser }).__mcpParse;
  };

  /**
   * Inputs chosen where a hand-written parser and the specification part company.
   * Leading zeros are first because that is what shipped broken.
   */
  const CORPUS: string[] = [
    // numbers, valid and not
    '012', '000', '0123', '-012', '01', '-01', '0', '-0', '12', '1.5', '0.5',
    '1e3', '1E+2', '1e-2', '-2.25e10', '1.', '.5', '+1', '1e', '1e+', '--1', '0x10',
    // string escapes: every two-character form, and hex that decimal would misread
    '"\\b"', '"\\f"', '"\\n"', '"\\r"', '"\\t"', '"\\/"', '"\\\\"', '"\\""',
    '"\\u0001"', '"\\u00e9"', '"\\u4e2d"', '"\\uFFFF"', '"\\uD834\\uDD1E"', '"\\uabcd"',
    '"\\u00E9"', '"\\uZZZZ"', '"\\u00"', '"\\x41"', '"unterminated',
    // structure
    '{}', '[]', '{"a":1}', '{"a":1,"a":2}', '{"":0}', '[[[[1]]]]', '{"a":[1,{"b":null}]}',
    '[1,]', '{"a":1,}', '{a:1}', "{'a':1}", '[1,,2]', '{,}', '{"a"}', '[1] [2]',
    // literals and whitespace
    'true', 'false', 'null', 'tru', 'nul', 'NaN', 'Infinity', '-Infinity', 'undefined',
    ' \t\r\n{"a":\t1}\n ', '', ' ', '1', '[1]',
  ];

  /** Deterministic pseudo-random JSON; no Math.random, so failures reproduce. */
  function fuzzCorpus(count: number): string[] {
    let seed = 20260816;
    const next = (): number => (seed = (seed * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff;
    const pick = <T>(items: T[]): T => items[Math.floor(next() * items.length)];

    const build = (depth: number): unknown => {
      const kinds = depth > 3
        ? ['number', 'string', 'bool', 'null']
        : ['number', 'string', 'bool', 'null', 'array', 'object'];
      switch (pick(kinds)) {
        case 'number': return (next() - 0.5) * Math.pow(10, Math.floor(next() * 10));
        case 'string':
          return Array.from({ length: Math.floor(next() * 10) },
            () => String.fromCharCode(Math.floor(next() * 2200))).join('');
        case 'bool': return next() > 0.5;
        case 'null': return null;
        case 'array': return Array.from({ length: Math.floor(next() * 4) }, () => build(depth + 1));
        default: {
          const out: Record<string, unknown> = {};
          for (let i = 0; i < Math.floor(next() * 4); i++) out[`k${Math.floor(next() * 500)}`] = build(depth + 1);
          return out;
        }
      }
    };

    const out: string[] = [];
    for (let i = 0; i < count; i++) {
      const encoded = JSON.stringify(build(0));
      if (typeof encoded === 'string') out.push(encoded);
    }
    return out;
  }

  /** Accept-or-reject plus the parsed value, in a form that compares cleanly. */
  const outcome = (parse: Parser, text: string): string => {
    try {
      return `ok:${JSON.stringify(parse(text)) ?? 'undefined'}`;
    } catch {
      return 'rejected';
    }
  };

  const platform = (text: string): string => {
    try {
      return `ok:${JSON.stringify(JSON.parse(text)) ?? 'undefined'}`;
    } catch {
      return 'rejected';
    }
  };

  it('agree with the platform on a corpus built from where parsers go wrong', async () => {
    const server = await serverParser();
    const panel = panelParser();

    const serverDisagreements: string[] = [];
    const panelDisagreements: string[] = [];

    for (const text of CORPUS) {
      const expected = platform(text);
      if (outcome(server, text) !== expected) {
        serverDisagreements.push(`${JSON.stringify(text)} server=${outcome(server, text)} platform=${expected}`);
      }
      if (outcome(panel, text) !== expected) {
        panelDisagreements.push(`${JSON.stringify(text)} panel=${outcome(panel, text)} platform=${expected}`);
      }
    }

    expect(serverDisagreements).toEqual([]);
    expect(panelDisagreements).toEqual([]);
  }, 120_000);

  it('agree with each other, so escaping cannot make one copy differ', async () => {
    // Asserted separately: when the two disagree, the fault is in how one of them
    // is escaped for its host file rather than in the grammar.
    const server = await serverParser();
    const panel = panelParser();

    const drift = CORPUS
      .filter((text) => outcome(server, text) !== outcome(panel, text))
      .map((text) => `${JSON.stringify(text)} server=${outcome(server, text)} panel=${outcome(panel, text)}`);

    expect(drift).toEqual([]);
  }, 120_000);

  it('agree with the platform across generated structures', async () => {
    const server = await serverParser();
    const panel = panelParser();
    const corpus = fuzzCorpus(2000);

    expect(corpus.length).toBeGreaterThan(1500);

    const disagreements: string[] = [];
    for (const text of corpus) {
      const expected = platform(text);
      if (outcome(server, text) !== expected) disagreements.push(`server ${text.slice(0, 60)}`);
      if (outcome(panel, text) !== expected) disagreements.push(`panel ${text.slice(0, 60)}`);
    }

    expect(disagreements.slice(0, 5)).toEqual([]);
  }, 300_000);
});
