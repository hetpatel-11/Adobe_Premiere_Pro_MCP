export interface CaptionEntry {
  index?: number;
  id?: string;
  start: number;
  end: number;
  text: string;
}

export interface CaptionTextFormatOptions {
  maxCharsPerLine?: number;
  maxLines?: number;
  normalizeWhitespace?: boolean;
  ellipsis?: string;
}

export type CaptionQcCode =
  | 'overlap'
  | 'emptyText'
  | 'durationTooShort'
  | 'durationTooLong'
  | 'cpsTooFast'
  | 'lineTooLong'
  | 'tooManyLines'
  | 'outOfBounds'
  | 'bannedTerm';

export interface CaptionQcOptions {
  minDuration?: number;
  maxDuration?: number;
  maxCps?: number;
  maxCharsPerLine?: number;
  maxLines?: number;
  timelineStart?: number;
  timelineEnd?: number;
  bannedTerms?: Array<string | RegExp>;
  caseSensitiveBannedTerms?: boolean;
}

export interface CaptionQcFinding {
  code: CaptionQcCode;
  severity: 'warning' | 'error';
  entryIndex: number;
  message: string;
  entry: CaptionEntry;
  value?: number | string;
  limit?: number;
  relatedEntryIndex?: number;
  term?: string;
}

export interface CaptionSearchOptions {
  regex?: boolean;
  caseSensitive?: boolean;
  before?: number;
  after?: number;
}

export interface CaptionSearchResult {
  entryIndex: number;
  entry: CaptionEntry;
  matchText: string;
  matchStart: number;
  matchEnd: number;
  before: CaptionEntry[];
  after: CaptionEntry[];
}

type TimestampKind = 'srt' | 'vtt';

interface CueTiming {
  start: number;
  end: number;
}

function normalizeLineEndings(source: string): string {
  return source.replace(/^\uFEFF/, '').replace(/\r\n?/g, '\n');
}

function parseTimestamp(token: string, kind: TimestampKind): number {
  const trimmed = token.trim();
  const separator = kind === 'srt' ? ',' : '.';
  const pieces = trimmed.split(separator);
  if (pieces.length !== 2) {
    throw new Error(`Invalid ${kind.toUpperCase()} timestamp: ${token}`);
  }

  const timePart = pieces[0];
  const millisecondPart = pieces[1];
  if (timePart === undefined || millisecondPart === undefined || !/^\d{1,3}$/.test(millisecondPart)) {
    throw new Error(`Invalid ${kind.toUpperCase()} timestamp: ${token}`);
  }

  const fields = timePart.split(':');
  if ((kind === 'srt' && fields.length !== 3) || (kind === 'vtt' && fields.length !== 2 && fields.length !== 3)) {
    throw new Error(`Invalid ${kind.toUpperCase()} timestamp: ${token}`);
  }

  const numericFields = fields.map((field) => {
    if (!/^\d+$/.test(field)) {
      throw new Error(`Invalid ${kind.toUpperCase()} timestamp: ${token}`);
    }
    return Number(field);
  });

  const [hours, minutes, seconds] = numericFields.length === 3
    ? numericFields
    : [0, numericFields[0], numericFields[1]];

  if (hours === undefined || minutes === undefined || seconds === undefined || minutes > 59 || seconds > 59) {
    throw new Error(`Invalid ${kind.toUpperCase()} timestamp: ${token}`);
  }

  const milliseconds = Number(millisecondPart.padEnd(3, '0'));
  return hours * 3600 + minutes * 60 + seconds + milliseconds / 1000;
}

function parseTimingLine(line: string, kind: TimestampKind): CueTiming {
  const parts = line.split(/\s+-->\s+/);
  if (parts.length !== 2) {
    throw new Error(`Invalid caption timing line: ${line}`);
  }

  const startToken = parts[0];
  const endToken = parts[1]?.trim().split(/\s+/)[0];
  if (startToken === undefined || endToken === undefined || endToken.length === 0) {
    throw new Error(`Invalid caption timing line: ${line}`);
  }

  return {
    start: parseTimestamp(startToken, kind),
    end: parseTimestamp(endToken, kind),
  };
}

function splitCueBlocks(source: string): string[] {
  return normalizeLineEndings(source)
    .split(/\n[ \t]*\n/)
    .map((block) => block.trim())
    .filter((block) => block.length > 0);
}

export function parseSrt(source: string): CaptionEntry[] {
  return splitCueBlocks(source).map((block) => {
    const lines = block.split('\n');
    let lineIndex = 0;
    let index: number | undefined;

    const firstLine = lines[0]?.trim();
    if (firstLine !== undefined && /^\d+$/.test(firstLine)) {
      index = Number(firstLine);
      lineIndex = 1;
    }

    const timingLine = lines[lineIndex];
    if (timingLine === undefined) {
      throw new Error(`Missing SRT timing line in block: ${block}`);
    }

    const timing = parseTimingLine(timingLine.trim(), 'srt');
    const text = lines.slice(lineIndex + 1).join('\n').trim();
    return index === undefined
      ? { start: timing.start, end: timing.end, text }
      : { index, start: timing.start, end: timing.end, text };
  });
}

export function parseVtt(source: string): CaptionEntry[] {
  const normalized = normalizeLineEndings(source).trim();
  const lines = normalized.split('\n');
  const header = lines[0]?.trim();
  if (header === undefined || !header.startsWith('WEBVTT')) {
    throw new Error('WebVTT source must start with a WEBVTT header');
  }

  let bodyStart = 1;
  while (bodyStart < lines.length) {
    const currentLine = lines[bodyStart]?.trim() ?? '';
    const nextLine = lines[bodyStart + 1]?.trim() ?? '';
    if (currentLine === '') {
      bodyStart += 1;
      break;
    }
    if (currentLine.includes('-->') || nextLine.includes('-->') || /^(NOTE|STYLE|REGION)(\s|$)/.test(currentLine)) {
      break;
    }
    bodyStart += 1;
  }

  return splitCueBlocks(lines.slice(bodyStart).join('\n'))
    .filter((block) => !/^(NOTE|STYLE|REGION)(\s|$)/.test(block))
    .map((block, cueIndex) => {
      const cueLines = block.split('\n');
      const firstLine = cueLines[0]?.trim();
      if (firstLine === undefined) {
        throw new Error(`Empty WebVTT cue at index ${cueIndex}`);
      }

      const hasCueId = !firstLine.includes('-->');
      const timingLine = hasCueId ? cueLines[1] : cueLines[0];
      if (timingLine === undefined) {
        throw new Error(`Missing WebVTT timing line in cue: ${block}`);
      }

      const timing = parseTimingLine(timingLine.trim(), 'vtt');
      const textStart = hasCueId ? 2 : 1;
      const text = cueLines.slice(textStart).join('\n').trim();
      return hasCueId
        ? { id: firstLine, start: timing.start, end: timing.end, text }
        : { start: timing.start, end: timing.end, text };
    });
}

function assertSerializableTimestamp(seconds: number): void {
  if (!Number.isFinite(seconds) || seconds < 0) {
    throw new Error('Caption timestamps must be non-negative finite numbers');
  }
}

function formatTimestamp(seconds: number, separator: ',' | '.'): string {
  assertSerializableTimestamp(seconds);
  const totalMilliseconds = Math.round(seconds * 1000);
  const milliseconds = totalMilliseconds % 1000;
  const totalSeconds = Math.floor(totalMilliseconds / 1000);
  const secondsPart = totalSeconds % 60;
  const totalMinutes = Math.floor(totalSeconds / 60);
  const minutes = totalMinutes % 60;
  const hours = Math.floor(totalMinutes / 60);
  const pad2 = (value: number): string => value.toString().padStart(2, '0');
  const pad3 = (value: number): string => value.toString().padStart(3, '0');
  return `${pad2(hours)}:${pad2(minutes)}:${pad2(secondsPart)}${separator}${pad3(milliseconds)}`;
}

function captionTextForSidecar(text: string): string {
  return normalizeLineEndings(text).trim();
}

export function serializeSrt(entries: CaptionEntry[]): string {
  if (entries.length === 0) {
    return '';
  }

  const blocks = entries.map((entry, entryIndex) => [
    `${entryIndex + 1}`,
    `${formatTimestamp(entry.start, ',')} --> ${formatTimestamp(entry.end, ',')}`,
    captionTextForSidecar(entry.text),
  ].join('\n'));

  return `${blocks.join('\n\n')}\n`;
}

export function serializeVtt(entries: CaptionEntry[]): string {
  if (entries.length === 0) {
    return 'WEBVTT\n';
  }

  const blocks = entries.map((entry) => {
    const lines: string[] = [];
    if (entry.id !== undefined && entry.id.trim().length > 0) {
      lines.push(entry.id.trim());
    }
    lines.push(`${formatTimestamp(entry.start, '.')} --> ${formatTimestamp(entry.end, '.')}`);
    lines.push(captionTextForSidecar(entry.text));
    return lines.join('\n');
  });

  return `WEBVTT\n\n${blocks.join('\n\n')}\n`;
}

function escapeCsvField(value: string | number): string {
  const text = String(value);
  if (/[",\n\r]/.test(text)) {
    return `"${text.replace(/"/g, '""')}"`;
  }
  return text;
}

export function serializeCsv(entries: CaptionEntry[]): string {
  const rows = entries.map((entry, entryIndex) => [
    entryIndex + 1,
    formatTimestamp(entry.start, '.'),
    formatTimestamp(entry.end, '.'),
    (entry.end - entry.start).toFixed(3),
    captionTextForSidecar(entry.text),
    entry.id ?? '',
  ].map(escapeCsvField).join(','));

  return ['index,start,end,duration,text,id', ...rows].join('\n');
}

export function serializeJson(entries: CaptionEntry[], space = 2): string {
  return JSON.stringify(entries, null, space);
}

function splitLongWord(word: string, maxCharsPerLine: number): string[] {
  const chunks: string[] = [];
  for (let index = 0; index < word.length; index += maxCharsPerLine) {
    chunks.push(word.slice(index, index + maxCharsPerLine));
  }
  return chunks;
}

function wrapNormalizedText(text: string, maxCharsPerLine: number): string[] {
  if (text.length === 0) {
    return [''];
  }

  const lines: string[] = [];
  let current = '';
  const words = text.split(' ');

  for (const word of words) {
    if (word.length > maxCharsPerLine) {
      if (current.length > 0) {
        lines.push(current);
        current = '';
      }
      const chunks = splitLongWord(word, maxCharsPerLine);
      lines.push(...chunks.slice(0, -1));
      current = chunks[chunks.length - 1] ?? '';
      continue;
    }

    const candidate = current.length === 0 ? word : `${current} ${word}`;
    if (candidate.length <= maxCharsPerLine) {
      current = candidate;
    } else {
      lines.push(current);
      current = word;
    }
  }

  if (current.length > 0) {
    lines.push(current);
  }

  return lines;
}

function truncateWithEllipsis(text: string, maxCharsPerLine: number, ellipsis: string): string {
  if (text.length <= maxCharsPerLine) {
    return text;
  }
  if (maxCharsPerLine <= ellipsis.length) {
    return ellipsis.slice(0, maxCharsPerLine);
  }
  return `${text.slice(0, maxCharsPerLine - ellipsis.length).trimEnd()}${ellipsis}`;
}

export function formatCaptionText(text: string, options: CaptionTextFormatOptions = {}): string {
  const normalizeWhitespace = options.normalizeWhitespace ?? true;
  const normalized = normalizeWhitespace
    ? normalizeLineEndings(text).replace(/\s+/g, ' ').trim()
    : normalizeLineEndings(text).trim();

  const maxCharsPerLine = options.maxCharsPerLine;
  const initialLines = maxCharsPerLine === undefined
    ? normalized.split('\n')
    : maxCharsPerLine <= 0
      ? ['']
      : wrapNormalizedText(normalized, maxCharsPerLine);

  const maxLines = options.maxLines;
  if (maxLines === undefined || initialLines.length <= maxLines) {
    return initialLines.join('\n');
  }

  if (maxLines <= 0) {
    return '';
  }

  const ellipsis = options.ellipsis ?? '…';
  const keptLines = initialLines.slice(0, maxLines);
  const overflow = initialLines.slice(maxLines).join(' ');
  const lastLineIndex = keptLines.length - 1;
  const lastLine = keptLines[lastLineIndex] ?? '';
  const combinedLastLine = overflow.length > 0 ? `${lastLine} ${overflow}` : lastLine;
  keptLines[lastLineIndex] = maxCharsPerLine === undefined
    ? combinedLastLine
    : truncateWithEllipsis(combinedLastLine, maxCharsPerLine, ellipsis);
  return keptLines.join('\n');
}

export function formatCaptionEntries(entries: CaptionEntry[], options: CaptionTextFormatOptions = {}): CaptionEntry[] {
  return entries.map((entry) => ({
    ...entry,
    text: formatCaptionText(entry.text, options),
  }));
}

function textCharactersPerSecond(entry: CaptionEntry): number {
  const duration = entry.end - entry.start;
  if (duration <= 0) {
    return Number.POSITIVE_INFINITY;
  }
  const characterCount = entry.text.replace(/\s+/g, '').length;
  return characterCount / duration;
}

function bannedTermRegex(term: string | RegExp, caseSensitive: boolean): RegExp {
  if (typeof term === 'string') {
    return new RegExp(escapeRegex(term), caseSensitive ? '' : 'i');
  }

  const withoutCaseFlag = term.flags.replace(/i/g, '').replace(/g/g, '');
  const flags = caseSensitive ? withoutCaseFlag : `${withoutCaseFlag}i`;
  return new RegExp(term.source, flags);
}

export function qcCaptions(entries: CaptionEntry[], options: CaptionQcOptions = {}): CaptionQcFinding[] {
  const findings: CaptionQcFinding[] = [];

  entries.forEach((entry, entryIndex) => {
    const duration = entry.end - entry.start;
    const lines = normalizeLineEndings(entry.text).split('\n');

    if (entry.text.trim().length === 0) {
      findings.push({
        code: 'emptyText',
        severity: 'error',
        entryIndex,
        entry,
        message: 'Caption text is empty.',
      });
    }

    if (typeof options.minDuration === 'number' && duration < options.minDuration) {
      findings.push({
        code: 'durationTooShort',
        severity: 'warning',
        entryIndex,
        entry,
        value: duration,
        limit: options.minDuration,
        message: `Caption duration ${duration.toFixed(3)}s is shorter than ${options.minDuration.toFixed(3)}s.`,
      });
    }

    if (typeof options.maxDuration === 'number' && duration > options.maxDuration) {
      findings.push({
        code: 'durationTooLong',
        severity: 'warning',
        entryIndex,
        entry,
        value: duration,
        limit: options.maxDuration,
        message: `Caption duration ${duration.toFixed(3)}s is longer than ${options.maxDuration.toFixed(3)}s.`,
      });
    }

    if (typeof options.maxCps === 'number') {
      const cps = textCharactersPerSecond(entry);
      if (cps > options.maxCps) {
        findings.push({
          code: 'cpsTooFast',
          severity: 'warning',
          entryIndex,
          entry,
          value: cps,
          limit: options.maxCps,
          message: `Caption reads at ${cps.toFixed(1)} characters per second, above ${options.maxCps.toFixed(1)} CPS.`,
        });
      }
    }

    if (typeof options.maxCharsPerLine === 'number') {
      const longestLineLength = lines.reduce((longest, line) => Math.max(longest, line.length), 0);
      if (longestLineLength > options.maxCharsPerLine) {
        findings.push({
          code: 'lineTooLong',
          severity: 'warning',
          entryIndex,
          entry,
          value: longestLineLength,
          limit: options.maxCharsPerLine,
          message: `Caption line length ${longestLineLength} exceeds ${options.maxCharsPerLine} characters.`,
        });
      }
    }

    if (typeof options.maxLines === 'number' && lines.length > options.maxLines) {
      findings.push({
        code: 'tooManyLines',
        severity: 'warning',
        entryIndex,
        entry,
        value: lines.length,
        limit: options.maxLines,
        message: `Caption has ${lines.length} lines, above the limit of ${options.maxLines}.`,
      });
    }

    const beforeTimelineStart = typeof options.timelineStart === 'number' && entry.start < options.timelineStart;
    const afterTimelineEnd = typeof options.timelineEnd === 'number' && entry.end > options.timelineEnd;
    if (beforeTimelineStart || afterTimelineEnd) {
      findings.push({
        code: 'outOfBounds',
        severity: 'error',
        entryIndex,
        entry,
        value: `${entry.start}-${entry.end}`,
        message: 'Caption is outside the allowed timeline bounds.',
      });
    }

    const bannedTerms = options.bannedTerms ?? [];
    for (const term of bannedTerms) {
      const pattern = bannedTermRegex(term, options.caseSensitiveBannedTerms ?? false);
      const match = pattern.exec(entry.text);
      if (match !== null) {
        findings.push({
          code: 'bannedTerm',
          severity: 'warning',
          entryIndex,
          entry,
          value: match[0],
          term: term.toString(),
          message: `Caption contains banned term: ${match[0]}.`,
        });
      }
    }
  });

  const orderedEntries = entries
    .map((entry, entryIndex) => ({ entry, entryIndex }))
    .sort((left, right) => left.entry.start - right.entry.start || left.entry.end - right.entry.end);

  for (let currentIndex = 1; currentIndex < orderedEntries.length; currentIndex += 1) {
    const current = orderedEntries[currentIndex];
    if (current === undefined) {
      continue;
    }

    for (let previousIndex = 0; previousIndex < currentIndex; previousIndex += 1) {
      const previous = orderedEntries[previousIndex];
      if (previous === undefined) {
        continue;
      }
      if (current.entry.start < previous.entry.end && current.entry.end > previous.entry.start) {
        findings.push({
          code: 'overlap',
          severity: 'error',
          entryIndex: current.entryIndex,
          relatedEntryIndex: previous.entryIndex,
          entry: current.entry,
          value: current.entry.start,
          message: `Caption overlaps caption at index ${previous.entryIndex}.`,
        });
      }
    }
  }

  return findings;
}

function escapeRegex(text: string): string {
  return text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function searchPattern(query: string | RegExp, options: CaptionSearchOptions): RegExp {
  const caseSensitive = options.caseSensitive ?? false;
  if (query instanceof RegExp) {
    const baseFlags = query.flags.replace(/g/g, '').replace(/i/g, '');
    const flags = `${baseFlags}${caseSensitive ? '' : 'i'}g`;
    return new RegExp(query.source, flags);
  }

  const source = options.regex === true ? query : escapeRegex(query);
  return new RegExp(source, caseSensitive ? 'g' : 'gi');
}

export function searchCaptions(
  entries: CaptionEntry[],
  query: string | RegExp,
  options: CaptionSearchOptions = {},
): CaptionSearchResult[] {
  const beforeCount = Math.max(0, Math.trunc(options.before ?? 0));
  const afterCount = Math.max(0, Math.trunc(options.after ?? 0));
  const results: CaptionSearchResult[] = [];

  entries.forEach((entry, entryIndex) => {
    const pattern = searchPattern(query, options);
    for (const match of entry.text.matchAll(pattern)) {
      const matchText = match[0];
      if (matchText.length === 0) {
        continue;
      }
      const matchStart = match.index ?? 0;
      results.push({
        entryIndex,
        entry,
        matchText,
        matchStart,
        matchEnd: matchStart + matchText.length,
        before: entries.slice(Math.max(0, entryIndex - beforeCount), entryIndex),
        after: entries.slice(entryIndex + 1, Math.min(entries.length, entryIndex + 1 + afterCount)),
      });
    }
  });

  return results;
}
