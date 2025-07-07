/**
 * Bridge module for communicating with Adobe Premiere Pro
 *
 * This module handles the communication between the MCP server and Adobe Premiere Pro
 * using various methods including UXP, ExtendScript, and file-based communication.
 */
export interface PremiereProProject {
    id: string;
    name: string;
    path: string;
    isOpen: boolean;
    sequences: PremiereProSequence[];
    projectItems: PremiereProProjectItem[];
}
export interface PremiereProSequence {
    id: string;
    name: string;
    duration: number;
    frameRate: number;
    videoTracks: PremiereProTrack[];
    audioTracks: PremiereProTrack[];
}
export interface PremiereProTrack {
    id: string;
    name: string;
    type: 'video' | 'audio';
    clips: PremiereProClip[];
}
export interface PremiereProClip {
    id: string;
    name: string;
    inPoint: number;
    outPoint: number;
    duration: number;
    mediaPath?: string;
}
export interface PremiereProProjectItem {
    id: string;
    name: string;
    type: 'footage' | 'sequence' | 'bin';
    mediaPath?: string;
    duration?: number;
    frameRate?: number;
}
export interface PremiereProEffect {
    id: string;
    name: string;
    category: string;
    parameters: Record<string, any>;
}
export declare class PremiereProBridge {
    private logger;
    private communicationMethod;
    private tempDir;
    private uxpProcess?;
    private isInitialized;
    constructor();
    initialize(): Promise<void>;
    private setupTempDirectory;
    private detectPremiereProInstallation;
    private initializeCommunication;
    executeScript(script: string): Promise<any>;
    private waitForResponse;
    createProject(name: string, location: string): Promise<PremiereProProject>;
    openProject(path: string): Promise<PremiereProProject>;
    saveProject(): Promise<void>;
    importMedia(filePath: string): Promise<PremiereProProjectItem>;
    createSequence(name: string, presetPath?: string): Promise<PremiereProSequence>;
    addToTimeline(sequenceId: string, projectItemId: string, trackIndex: number, time: number): Promise<PremiereProClip>;
    renderSequence(sequenceId: string, outputPath: string, presetPath: string): Promise<void>;
    listProjectItems(): Promise<PremiereProProjectItem[]>;
    cleanup(): Promise<void>;
}
//# sourceMappingURL=index.d.ts.map