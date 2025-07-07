/**
 * MCP Tools for Adobe Premiere Pro
 *
 * This module provides tools that can be called by AI agents to perform
 * various video editing operations in Adobe Premiere Pro.
 */
import { z } from 'zod';
import { PremiereProBridge } from '../bridge/index.js';
export interface MCPTool {
    name: string;
    description: string;
    inputSchema: z.ZodSchema<any>;
}
export declare class PremiereProTools {
    private bridge;
    private logger;
    constructor(bridge: PremiereProBridge);
    getAvailableTools(): MCPTool[];
    executeTool(name: string, args: Record<string, any>): Promise<any>;
    private listProjectItems;
    private listSequences;
    private listSequenceTracks;
    private getProjectInfo;
    private createProject;
    private openProject;
    private saveProject;
    private saveProjectAs;
    private importMedia;
    private importFolder;
    private createBin;
    private createSequence;
    private duplicateSequence;
    private deleteSequence;
    private addToTimeline;
    private removeFromTimeline;
    private moveClip;
    private trimClip;
    private splitClip;
    private applyEffect;
    private removeEffect;
    private addTransition;
    private addTransitionToClip;
    private adjustAudioLevels;
    private addAudioKeyframes;
    private muteTrack;
    private addTextOverlay;
    private addShape;
    private colorCorrect;
    private applyLut;
    private exportSequence;
    private exportFrame;
    private createMulticamSequence;
    private createProxyMedia;
    private autoEditToMusic;
    private stabilizeClip;
    private speedChange;
}
//# sourceMappingURL=index.d.ts.map