/**
 * Simple logger utility for MCP Adobe Premiere Pro Server
 */
export var LogLevel;
(function (LogLevel) {
    LogLevel[LogLevel["ERROR"] = 0] = "ERROR";
    LogLevel[LogLevel["WARN"] = 1] = "WARN";
    LogLevel[LogLevel["INFO"] = 2] = "INFO";
    LogLevel[LogLevel["DEBUG"] = 3] = "DEBUG";
})(LogLevel || (LogLevel = {}));
export class Logger {
    name;
    level;
    constructor(name, level = LogLevel.INFO) {
        this.name = name;
        this.level = level;
    }
    log(level, message, ...args) {
        if (level <= this.level) {
            const timestamp = new Date().toISOString();
            const levelStr = LogLevel[level];
            // Use stderr for logging to avoid interfering with JSON-RPC on stdout
            console.error(`[${timestamp}] [${levelStr}] [${this.name}] ${message}`, ...args);
        }
    }
    error(message, ...args) {
        this.log(LogLevel.ERROR, message, ...args);
    }
    warn(message, ...args) {
        this.log(LogLevel.WARN, message, ...args);
    }
    info(message, ...args) {
        this.log(LogLevel.INFO, message, ...args);
    }
    debug(message, ...args) {
        this.log(LogLevel.DEBUG, message, ...args);
    }
    setLevel(level) {
        this.level = level;
    }
}
//# sourceMappingURL=logger.js.map