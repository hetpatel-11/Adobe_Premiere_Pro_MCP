import type { TimelineCleanupAction } from './types.js';

export interface TimelineCleanupExecutionPlanArgs {
  sourceSequenceId: string;
  cleanSequenceName: string;
  duplicateSequence?: boolean;
  allowMutatingSourceSequence?: boolean;
  analysisId?: string;
  actions: TimelineCleanupAction[];
}

export type TimelineCleanupExecutionOperation =
  | { type: 'duplicateSequence'; sourceSequenceId: string; cleanSequenceName: string }
  | TimelineCleanupAction;

export interface TimelineCleanupExecutionPlanValidation {
  safe: boolean;
  errors: string[];
  warnings: string[];
  operations: TimelineCleanupExecutionOperation[];
}

const EXECUTABLE_CLASSIFICATIONS = new Set(['safe_remove', 'safe_reorganize']);

function validateAction(action: TimelineCleanupAction, index: number, errors: string[]): void {
  if (!EXECUTABLE_CLASSIFICATIONS.has(action.classification)) {
    errors.push(`actions[${index}] classification ${action.classification} is not executable`);
  }
  if ((action.type === 'removeClip' || action.type === 'removeTrack') && action.classification !== 'safe_remove') {
    errors.push(`actions[${index}] ${action.type} requires safe_remove classification`);
  }
  if (action.type === 'reorganizeClip' && action.classification !== 'safe_reorganize') {
    errors.push(`actions[${index}] reorganizeClip requires safe_reorganize classification`);
  }
}

function operationForAction(action: TimelineCleanupAction): TimelineCleanupExecutionOperation {
  return { ...action };
}

function sortedActions(actions: TimelineCleanupAction[]): TimelineCleanupAction[] {
  return [...actions].sort((a, b) => {
    const priority = (action: TimelineCleanupAction): number => {
      if (action.type === 'reorganizeClip') return 0;
      if (action.type === 'removeClip') return 1;
      return 2;
    };
    const priorityDiff = priority(a) - priority(b);
    if (priorityDiff !== 0) return priorityDiff;
    if (a.type === 'removeTrack' && b.type === 'removeTrack') {
      if (a.trackType !== b.trackType) return a.trackType.localeCompare(b.trackType);
      return b.trackIndex - a.trackIndex;
    }
    return a.trackIndex - b.trackIndex;
  });
}

export function validateTimelineCleanupExecutionPlan(args: TimelineCleanupExecutionPlanArgs): TimelineCleanupExecutionPlanValidation {
  const errors: string[] = [];
  const warnings: string[] = [];

  if (!args.sourceSequenceId || args.sourceSequenceId.trim().length === 0) errors.push('sourceSequenceId is required');
  if (!args.cleanSequenceName || args.cleanSequenceName.trim().length === 0) errors.push('cleanSequenceName is required');
  if (!args.analysisId || args.analysisId.trim().length === 0) errors.push('analysisId is required for timeline cleanup execution provenance');
  if (args.duplicateSequence !== true) errors.push('duplicateSequence must be true for non-destructive timeline cleanup');
  if (args.allowMutatingSourceSequence) errors.push('allowMutatingSourceSequence is not supported for timeline cleanup');
  if (!Array.isArray(args.actions)) errors.push('actions must be an array');

  const actions = Array.isArray(args.actions) ? args.actions : [];
  actions.forEach((action, index) => validateAction(action, index, errors));
  if (actions.length === 0) warnings.push('cleanup plan has no executable actions');

  if (errors.length > 0) {
    return { safe: false, errors, warnings, operations: [] };
  }

  return {
    safe: true,
    errors,
    warnings,
    operations: [
      { type: 'duplicateSequence', sourceSequenceId: args.sourceSequenceId, cleanSequenceName: args.cleanSequenceName },
      ...sortedActions(actions).map(operationForAction),
    ],
  };
}
