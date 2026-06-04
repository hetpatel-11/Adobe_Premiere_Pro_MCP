import type {
  PremiereProClip,
  PremiereProProject,
  PremiereProProjectItem,
  PremiereProSequence,
} from './index.js';

export interface PremiereProBridgeDiagnostics {
  tempDir: string;
  communicationMethod: 'uxp' | 'extendscript' | 'file';
  usesExternalTempDir: boolean;
  isInitialized: boolean;
  sessionId: string;
  premierePath: string | null;
}

export interface PremiereProTransport {
  executeScript(script: string): Promise<any>;
  getDiagnostics?(): PremiereProBridgeDiagnostics;
  createProject(name: string, location: string): Promise<PremiereProProject>;
  openProject(path: string): Promise<PremiereProProject>;
  saveProject(): Promise<void>;
  importMedia(filePath: string): Promise<PremiereProProjectItem>;
  createSequence(name: string, sequenceId?: string): Promise<PremiereProSequence>;
  addToTimeline(sequenceId: string, projectItemId: string, trackIndex: number, time: number, linkAudio?: boolean): Promise<PremiereProClip>;
  renderSequence(sequenceId: string, outputPath: string, presetPath: string): Promise<{
    success: boolean;
    queued?: boolean;
    jobID?: string;
    outputPath?: string;
    presetPath?: string;
    error?: string;
  }>;
}
