import type {
  PremiereProClip,
  PremiereProProject,
  PremiereProProjectItem,
  PremiereProSequence,
} from './index.js';

export interface PremiereProTransport {
  executeScript(script: string): Promise<any>;
  createProject(name: string, location: string): Promise<PremiereProProject>;
  openProject(path: string): Promise<PremiereProProject>;
  saveProject(): Promise<void>;
  importMedia(filePath: string): Promise<PremiereProProjectItem>;
  createSequence(name: string, presetPath?: string): Promise<PremiereProSequence>;
  addToTimeline(sequenceId: string, projectItemId: string, trackIndex: number, time: number): Promise<PremiereProClip>;
  renderSequence(sequenceId: string, outputPath: string, presetPath: string): Promise<void>;
}
