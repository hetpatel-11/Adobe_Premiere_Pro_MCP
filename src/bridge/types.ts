import type {
  PremiereProClip,
  PremiereProProject,
  PremiereProProjectItem,
  PremiereProSequence,
} from './index.js';

export interface PremiereProTransport {
  executeScript(script: string, timeoutMs?: number, callerAuthored?: boolean): Promise<any>;
  createProject(name: string, location: string): Promise<PremiereProProject>;
  openProject(path: string): Promise<PremiereProProject>;
  saveProject(): Promise<void>;
  importMedia(filePath: string): Promise<PremiereProProjectItem>;
  createSequence(name: string, presetPath: string): Promise<PremiereProSequence>;
  addToTimeline(sequenceId: string, projectItemId: string, trackIndex: number, time: number, linkAudio?: boolean, sourceInPoint?: number, sourceOutPoint?: number, insertMode?: string): Promise<PremiereProClip>;
  addToTimelineBatch(sequenceId: string, clips: Array<{ projectItemId: string; trackIndex: number; time: number; linkAudio?: boolean; sourceInPoint?: number; sourceOutPoint?: number }>): Promise<any>;
  renderSequence(sequenceId: string, outputPath: string, presetPath: string, options?: {
    sourceRange?: 'entire' | 'in_out' | 'work_area';
    removeOnCompletion?: boolean;
  }): Promise<{
    success: boolean;
    status?: string;
    queued?: boolean;
    queueStarted?: boolean;
    jobID?: string;
    outputPath?: string;
    presetPath?: string;
    sourceRange?: string;
    resolvedRange?: unknown;
    encoderRangeConstant?: string;
    warnings?: Array<{ code: string; message: string }>;
    error?: string;
  }>;
}
