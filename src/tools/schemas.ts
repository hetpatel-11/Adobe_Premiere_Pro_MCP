/**
 * Argument schemas shared by more than one Premiere tool definition.
 *
 * These live outside the definition modules so that a marker colour or clip
 * plan is described in exactly one place; the handlers in tools/index.ts read
 * the same constants when they validate readback.
 */
import { z } from 'zod';

export const motionStyleSchema = z.enum(['push_in', 'pull_out', 'alternate', 'none']);

export const clipPlanSchema = z.object({
  assetIndex: z.number().int().min(0).optional().describe('Index in assetPaths to place for this step. Defaults to the current step index.'),
  time: z.number().optional().describe('Timeline position in seconds for this step.'),
  trackIndex: z.number().int().min(0).optional().describe('Video track index for this step. Defaults to videoTrackIndex.'),
  insertMode: z.enum(['overwrite', 'insert']).optional().describe('Placement mode for this step.'),
  transitionAfter: z.object({
    name: z.string().optional().describe('Transition to apply after this clip. Set "none" to skip this boundary.'),
    duration: z.number().optional().describe('Transition duration in seconds.')
  }).optional(),
  motion: z.object({
    style: motionStyleSchema.optional().describe('Simple motion style for this clip.'),
    from: z.number().optional().describe('Starting keyframe value.'),
    to: z.number().optional().describe('Ending keyframe value.'),
    startTime: z.number().optional().describe('Start time for keyframe animation in seconds.'),
    endTime: z.number().optional().describe('End time for keyframe animation in seconds.'),
    componentName: z.string().optional().describe('Component name for keyframing. Defaults to "Motion".'),
    paramName: z.string().optional().describe('Parameter name for keyframing. Defaults to "Scale".')
  }).optional(),
  trim: z.object({
    inPoint: z.number().optional().describe('Clip in point in seconds.'),
    outPoint: z.number().optional().describe('Clip out point in seconds.'),
    duration: z.number().optional().describe('Target clip duration in seconds.')
  }).optional(),
  effects: z.array(z.string()).optional().describe('Effect names to apply to this clip.'),
  color: z.object({
    brightness: z.number().optional(),
    contrast: z.number().optional(),
    saturation: z.number().optional(),
    hue: z.number().optional(),
    temperature: z.number().optional(),
    tint: z.number().optional(),
    highlights: z.number().optional(),
    shadows: z.number().optional()
  }).optional()
});

/**
 * Premiere's marker colours, in `setColorByIndex()` order. The write domain is
 * exactly 0-7: verified against Premiere 26.0.2, where an index of 8 or above
 * is a silent no-op (there is no ninth colour) and a non-integer is silently
 * truncated toward zero. Index 0 (Green) is the default for a marker created
 * without an explicit colour.
 */
export const MARKER_COLOR_NAMES = [
  'green', 'red', 'purple', 'orange', 'yellow', 'white', 'blue', 'cyan',
] as const;

/**
 * Accepts a colour name (case-insensitive, surrounding whitespace ignored) or
 * an index 0-7. Anything else is rejected here, at the schema layer, so the
 * caller gets a truthful error rather than a marker that silently keeps the
 * default colour.
 */
export const MarkerColorSchema = z.union([
  z.preprocess(
    (value) => (typeof value === 'string' ? value.trim().toLowerCase() : value),
    z.enum(MARKER_COLOR_NAMES),
  ),
  z.number().int().min(0).max(7),
  // Some MCP clients stringify every argument, which would otherwise drop index
  // input entirely. Accept the string form of a valid index, but nothing looser.
  // Deliberately no .transform(): executeTool() discards the parse() result and
  // passes the raw args on, so a transform here would silently never apply.
  // The string-to-number conversion lives in resolveMarkerColor instead.
  z.string().trim().regex(/^[0-7]$/),
]);

export const MARKER_COLOR_DESCRIPTION =
  `Marker colour — a name (${MARKER_COLOR_NAMES.join(', ')}) or an index 0-7. Defaults to green.`;

/**
 * MCP clients and models often stringify numbers. Accept a finite numeric
 * string here so the call reaches Premiere instead of dying as validation.
 * Non-numeric strings stay as-is and still fail the number schema.
 */
export const ClipTransitionDurationSchema = z.preprocess(
  (value) => {
    if (typeof value === 'string' && value.trim() !== '') {
      const parsed = Number(value.trim());
      return Number.isFinite(parsed) ? parsed : value;
    }
    return value;
  },
  z.number(),
);

export const CLIP_TRANSITION_POSITIONS = ['start', 'end'] as const;

export function canonicalizeClipTransitionPosition(value: unknown): unknown {
  if (typeof value !== 'string') return value;
  const normalized = value.trim().toLowerCase();
  if (['start', 'in', 'head', 'begin', 'beginning', 'incoming'].includes(normalized)) {
    return 'start';
  }
  if (['end', 'out', 'tail', 'outgoing'].includes(normalized)) {
    return 'end';
  }
  return normalized;
}

export const ClipTransitionPositionSchema = z.preprocess(
  canonicalizeClipTransitionPosition,
  z.enum(CLIP_TRANSITION_POSITIONS),
);
