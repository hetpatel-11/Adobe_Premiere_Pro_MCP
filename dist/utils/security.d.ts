/**
 * Security utilities for input validation and sanitization
 */
/**
 * Sanitizes string input to prevent injection attacks
 */
export declare function sanitizeInput(input: string): string;
/**
 * Validates file paths to prevent path traversal attacks
 */
export declare function validateFilePath(filePath: string, allowedDirs?: string[]): {
    valid: boolean;
    normalized?: string;
    error?: string;
};
/**
 * Validates project name to prevent injection
 */
export declare function validateProjectName(name: string): {
    valid: boolean;
    sanitized?: string;
    error?: string;
};
/**
 * Validates numeric input (e.g., time, track index)
 */
export declare function validateNumber(value: any, min?: number, max?: number): {
    valid: boolean;
    value?: number;
    error?: string;
};
/**
 * Validates array input
 */
export declare function validateArray(value: any, maxLength?: number): {
    valid: boolean;
    error?: string;
};
/**
 * Creates a safe temp directory with proper permissions
 */
export declare function createSecureTempDir(sessionId: string): string;
/**
 * Validates color value
 */
export declare function validateColor(color: string): {
    valid: boolean;
    error?: string;
};
/**
 * Rate limiter to prevent abuse
 */
export declare class RateLimiter {
    private requests;
    private limit;
    private windowMs;
    constructor(limit?: number, windowMs?: number);
    check(identifier: string): boolean;
    private cleanup;
    reset(identifier: string): void;
}
/**
 * Audit logger for security events
 */
export declare class AuditLogger {
    private logs;
    private maxLogs;
    constructor(maxLogs?: number);
    log(event: string, details?: any): void;
    getLogs(count?: number): Array<{
        timestamp: Date;
        event: string;
        details: any;
    }>;
    clear(): void;
}
//# sourceMappingURL=security.d.ts.map