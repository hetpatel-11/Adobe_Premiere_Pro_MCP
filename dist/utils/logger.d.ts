/**
 * Simple logger utility for MCP Adobe Premiere Pro Server
 */
export declare enum LogLevel {
    ERROR = 0,
    WARN = 1,
    INFO = 2,
    DEBUG = 3
}
export declare class Logger {
    private name;
    private level;
    constructor(name: string, level?: LogLevel);
    private log;
    error(message: string, ...args: any[]): void;
    warn(message: string, ...args: any[]): void;
    info(message: string, ...args: any[]): void;
    debug(message: string, ...args: any[]): void;
    setLevel(level: LogLevel): void;
}
//# sourceMappingURL=logger.d.ts.map