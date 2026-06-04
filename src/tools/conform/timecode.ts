import type { FrameRate, TimecodeParseResult } from './types.js';

export type FrameRateInput = number | {
  numerator: number;
  denominator?: number;
  fps?: number;
  nominalFps?: number;
  dropFrame?: boolean;
};

function gcd(a: number, b: number): number {
  let x = Math.abs(Math.trunc(a));
  let y = Math.abs(Math.trunc(b));
  while (y !== 0) {
    const next = x % y;
    x = y;
    y = next;
  }
  return x || 1;
}

export function normalizeFrameRate(input: FrameRateInput): FrameRate {
  if (typeof input === 'number') {
    if (!Number.isFinite(input) || input <= 0) {
      throw new Error('Frame rate must be a positive finite number');
    }
    const commonRates: Array<{ fps: number; numerator: number; denominator: number; nominalFps: number }> = [
      { fps: 23.976, numerator: 24000, denominator: 1001, nominalFps: 24 },
      { fps: 29.97, numerator: 30000, denominator: 1001, nominalFps: 30 },
      { fps: 47.952, numerator: 48000, denominator: 1001, nominalFps: 48 },
      { fps: 59.94, numerator: 60000, denominator: 1001, nominalFps: 60 },
    ];
    const common = commonRates.find((rate) => Math.abs(rate.fps - input) < 0.01);
    if (common) {
      return {
        numerator: common.numerator,
        denominator: common.denominator,
        fps: common.numerator / common.denominator,
        nominalFps: common.nominalFps,
        dropFrame: common.nominalFps === 30 || common.nominalFps === 60,
      };
    }
    const rounded = Math.round(input);
    return {
      numerator: rounded,
      denominator: 1,
      fps: input,
      nominalFps: rounded,
      dropFrame: false,
    };
  }

  if ((!('numerator' in input) || input.numerator === undefined) && typeof input.fps === 'number') {
    const normalized = normalizeFrameRate(input.fps);
    return {
      ...normalized,
      nominalFps: input.nominalFps ?? normalized.nominalFps,
      dropFrame: input.dropFrame ?? normalized.dropFrame ?? false,
    };
  }

  const denominator = input.denominator ?? 1;
  if (!Number.isFinite(input.numerator) || !Number.isFinite(denominator) || input.numerator <= 0 || denominator <= 0) {
    throw new Error('Frame-rate numerator and denominator must be positive finite numbers');
  }

  const divisor = gcd(input.numerator, denominator);
  const numerator = Math.trunc(input.numerator / divisor);
  const normalizedDenominator = Math.trunc(denominator / divisor);
  const fps = input.fps ?? numerator / normalizedDenominator;
  const nominalFps = input.nominalFps ?? Math.round(fps);

  return {
    numerator,
    denominator: normalizedDenominator,
    fps,
    nominalFps,
    dropFrame: input.dropFrame ?? false,
  };
}

export function framesToSeconds(frames: number, frameRate: FrameRateInput): number {
  const rate = normalizeFrameRate(frameRate);
  if (!Number.isFinite(frames)) {
    throw new Error('Frame count must be finite');
  }
  return frames * rate.denominator / rate.numerator;
}

export function secondsToFrames(seconds: number, frameRate: FrameRateInput): number {
  const rate = normalizeFrameRate(frameRate);
  if (!Number.isFinite(seconds)) {
    throw new Error('Seconds must be finite');
  }
  return Math.round(seconds * rate.numerator / rate.denominator);
}

function isNtscDropFrameRate(rate: FrameRate): boolean {
  return Math.abs(rate.fps - 29.97) < 0.02 || Math.abs(rate.fps - 59.94) < 0.02;
}

export function parseTimecodeToFrames(timecode: string, frameRate: FrameRateInput): TimecodeParseResult {
  const rate = normalizeFrameRate(frameRate);
  const warnings: string[] = [];

  if (typeof timecode !== 'string' || timecode.trim().length === 0) {
    return { success: false, dropFrame: false, warnings, error: 'Timecode must be a non-empty string' };
  }

  const trimmed = timecode.trim();
  const dropFrame = trimmed.includes(';');
  const match = /^(\d{2})([:;])(\d{2})([:;])(\d{2})([:;])(\d{2})$/.exec(trimmed);
  if (!match) {
    return { success: false, dropFrame, warnings, error: `Invalid timecode format: ${timecode}` };
  }

  const [, hh, , mm, , ss, frameSeparator, ff] = match;
  const hours = Number(hh);
  const minutes = Number(mm);
  const seconds = Number(ss);
  const frames = Number(ff);
  const nominal = rate.nominalFps;

  if (minutes > 59 || seconds > 59 || frames >= nominal) {
    return { success: false, dropFrame, warnings, error: `Timecode fields out of range for ${nominal}fps: ${timecode}` };
  }

  let totalFrames = (((hours * 60) + minutes) * 60 + seconds) * nominal + frames;

  if (dropFrame) {
    if (frameSeparator !== ';') {
      return { success: false, dropFrame, warnings, error: `Drop-frame timecode must use semicolon before frame field: ${timecode}` };
    }
    if (!isNtscDropFrameRate(rate)) {
      warnings.push('dropFrameTimecodeAtNonNtscRate');
    } else {
      warnings.push('dropFrameTimecode');
      const dropFrames = Math.round(nominal * 0.0666666667);
      if ((minutes % 10) !== 0 && seconds === 0 && frames < dropFrames) {
        return { success: false, dropFrame, warnings, error: `Invalid dropped frame label: ${timecode}` };
      }
      const totalMinutes = hours * 60 + minutes;
      totalFrames -= dropFrames * (totalMinutes - Math.floor(totalMinutes / 10));
    }
  }

  return {
    success: true,
    frames: totalFrames,
    dropFrame,
    warnings,
  };
}

export function framesToTimecode(frameCount: number, frameRate: FrameRateInput): string {
  const rate = normalizeFrameRate(frameRate);
  if (!Number.isFinite(frameCount) || frameCount < 0) {
    throw new Error('Frame count must be a non-negative finite number');
  }

  const nominal = rate.nominalFps;
  const wholeFrames = Math.round(frameCount);
  const totalSeconds = Math.floor(wholeFrames / nominal);
  const frames = wholeFrames % nominal;
  const seconds = totalSeconds % 60;
  const totalMinutes = Math.floor(totalSeconds / 60);
  const minutes = totalMinutes % 60;
  const hours = Math.floor(totalMinutes / 60);

  const pad = (value: number) => value.toString().padStart(2, '0');
  return `${pad(hours)}:${pad(minutes)}:${pad(seconds)}:${pad(frames)}`;
}

export function frameRatesCompatible(a: FrameRateInput, b: FrameRateInput, tolerance = 0.001): boolean {
  const left = normalizeFrameRate(a);
  const right = normalizeFrameRate(b);
  return Math.abs(left.fps - right.fps) <= tolerance;
}
