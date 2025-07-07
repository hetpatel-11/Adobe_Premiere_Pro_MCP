/**
 * MCP Prompts for Adobe Premiere Pro
 *
 * This module provides templated prompts for common video editing workflows
 * that can be used by AI agents to guide users through complex operations.
 */
export interface MCPPrompt {
    name: string;
    description: string;
    arguments?: Array<{
        name: string;
        description: string;
        required?: boolean;
    }>;
}
export interface PromptMessage {
    role: 'system' | 'user' | 'assistant';
    content: {
        type: 'text';
        text: string;
    };
}
export interface GeneratedPrompt {
    description: string;
    messages: PromptMessage[];
}
export declare class PremiereProPrompts {
    private logger;
    constructor();
    getAvailablePrompts(): MCPPrompt[];
    getPrompt(name: string, args: Record<string, any>): Promise<GeneratedPrompt>;
    private createVideoProjectPrompt;
    private editMusicVideoPrompt;
    private colorGradeFootagePrompt;
    private multicamEditingPrompt;
    private podcastEditingPrompt;
    private socialMediaContentPrompt;
    private documentaryEditingPrompt;
    private commercialEditingPrompt;
    private optimizeWorkflowPrompt;
    private audioCleanupPrompt;
    private getColorGradingTips;
    private getMulticamSyncTips;
    private getSocialMediaSpecs;
    private getPlatformSpecificTips;
    private getDocumentaryStructureTips;
    private getCommercialStructureTips;
    private getCommercialLengthTips;
    private getPerformanceOptimizationTips;
    private getAudioCleanupSteps;
    private getSourceSpecificTips;
    private getAudioProblemSolutions;
}
//# sourceMappingURL=index.d.ts.map