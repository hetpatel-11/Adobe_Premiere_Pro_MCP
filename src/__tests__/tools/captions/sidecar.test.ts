import {
  formatCaptionEntries,
  formatCaptionText,
  parseSrt,
  parseVtt,
  qcCaptions,
  searchCaptions,
  serializeCsv,
  serializeJson,
  serializeSrt,
  serializeVtt,
  type CaptionEntry,
} from '../../../tools/captions/sidecar.js';

describe('caption sidecar utilities', () => {
  it('parses SRT numeric indexes, multiline text, and comma milliseconds', () => {
    const entries = parseSrt(`
1
00:00:01,000 --> 00:00:03,250
Hello world
second line

2
00:00:04,500 --> 00:00:06,000
Another caption
`);

    expect(entries).toHaveLength(2);
    expect(entries[0]).toMatchObject({
      index: 1,
      start: 1,
      end: 3.25,
      text: 'Hello world\nsecond line',
    });
    expect(entries[1]).toMatchObject({
      index: 2,
      start: 4.5,
      end: 6,
      text: 'Another caption',
    });
  });

  it('parses WebVTT headers, cue IDs, multiline text, and dot milliseconds', () => {
    const entries = parseVtt(`WEBVTT
Kind: captions

intro-cue
00:00:01.500 --> 00:00:02.750 align:start
First VTT line
second VTT line

00:00:03.000 --> 00:00:04.000
No id cue
`);

    expect(entries).toHaveLength(2);
    expect(entries[0]).toMatchObject({
      id: 'intro-cue',
      start: 1.5,
      end: 2.75,
      text: 'First VTT line\nsecond VTT line',
    });
    expect(entries[1]).toMatchObject({
      start: 3,
      end: 4,
      text: 'No id cue',
    });
    expect(entries[1]?.id).toBeUndefined();
  });

  it('serializes captions to SRT, VTT, CSV, and JSON', () => {
    const entries: CaptionEntry[] = [
      { id: 'alpha', start: 1, end: 2.5, text: 'Hello, "world"\nNext line' },
      { start: 3661.234, end: 3662, text: 'Later caption' },
    ];

    expect(serializeSrt(entries)).toBe(
      '1\n00:00:01,000 --> 00:00:02,500\nHello, "world"\nNext line\n\n' +
      '2\n01:01:01,234 --> 01:01:02,000\nLater caption\n',
    );
    expect(serializeVtt(entries)).toBe(
      'WEBVTT\n\n' +
      'alpha\n00:00:01.000 --> 00:00:02.500\nHello, "world"\nNext line\n\n' +
      '01:01:01.234 --> 01:01:02.000\nLater caption\n',
    );
    expect(serializeCsv(entries)).toBe(
      'index,start,end,duration,text,id\n' +
      '1,00:00:01.000,00:00:02.500,1.500,"Hello, ""world""\nNext line",alpha\n' +
      '2,01:01:01.234,01:01:02.000,0.766,Later caption,',
    );
    expect(JSON.parse(serializeJson(entries))).toEqual(entries);
  });

  it('normalizes whitespace and wraps caption text to line and line-count limits', () => {
    expect(formatCaptionText('  Alpha   beta\n gamma   delta  ', {
      maxCharsPerLine: 16,
      maxLines: 2,
    })).toBe('Alpha beta gamma\ndelta');

    const formatted = formatCaptionEntries([
      { start: 0, end: 1, text: ' One    two three four ' },
    ], { maxCharsPerLine: 13, maxLines: 2 });

    expect(formatted).toEqual([
      { start: 0, end: 1, text: 'One two three\nfour' },
    ]);
  });

  it('returns QC findings for timing, readability, bounds, and banned-term problems', () => {
    const findings = qcCaptions([
      { start: -0.25, end: 0.2, text: '' },
      { start: 1, end: 1.5, text: 'This is a very very very long line that is much too fast and says forbidden' },
      { start: 1.4, end: 8.5, text: 'Line 1\nLine 2\nLine 3' },
      { start: 9.5, end: 11, text: 'Normal' },
    ], {
      minDuration: 0.75,
      maxDuration: 6,
      maxCps: 12,
      maxCharsPerLine: 20,
      maxLines: 2,
      timelineStart: 0,
      timelineEnd: 10,
      bannedTerms: ['forbidden'],
    });

    const codes = findings.map((finding) => finding.code);
    expect(codes).toEqual(expect.arrayContaining([
      'overlap',
      'emptyText',
      'durationTooShort',
      'durationTooLong',
      'cpsTooFast',
      'lineTooLong',
      'tooManyLines',
      'outOfBounds',
      'bannedTerm',
    ]));
  });

  it('reports overlaps against long earlier captions, not only the previous sorted cue', () => {
    const findings = qcCaptions([
      { start: 0, end: 10, text: 'Long earlier caption' },
      { start: 1, end: 2, text: 'Short overlap one' },
      { start: 3, end: 4, text: 'Short overlap two' },
    ]);

    const overlapFindings = findings.filter((finding) => finding.code === 'overlap');
    expect(overlapFindings).toHaveLength(2);
    expect(overlapFindings).toEqual(expect.arrayContaining([
      expect.objectContaining({ entryIndex: 1, relatedEntryIndex: 0 }),
      expect.objectContaining({ entryIndex: 2, relatedEntryIndex: 0 }),
    ]));
  });

  it('searches captions literally or by regex with case sensitivity and context windows', () => {
    const entries: CaptionEntry[] = [
      { start: 0, end: 1, text: 'Opening context' },
      { start: 1, end: 2, text: 'Premiere captions are searchable' },
      { start: 2, end: 3, text: 'middle context' },
      { start: 3, end: 4, text: 'premiere clip 42' },
    ];

    const literal = searchCaptions(entries, 'PREMIERE', { before: 1, after: 1 });
    expect(literal).toHaveLength(2);
    expect(literal[0]).toMatchObject({ entryIndex: 1, matchText: 'Premiere' });
    expect(literal[0]?.before).toEqual([entries[0]]);
    expect(literal[0]?.after).toEqual([entries[2]]);

    expect(searchCaptions(entries, 'PREMIERE', { caseSensitive: true })).toHaveLength(0);

    const regex = searchCaptions(entries, 'clip\\s+\\d+', { regex: true, caseSensitive: true });
    expect(regex).toHaveLength(1);
    expect(regex[0]).toMatchObject({ entryIndex: 3, matchText: 'clip 42' });
  });
});
