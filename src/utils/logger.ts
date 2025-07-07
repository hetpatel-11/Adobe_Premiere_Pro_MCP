/**
 * Simple logger utility for MCP Adobe Premiere Pro Server
 */

export enum LogLevel {
  ERROR = 0,
  WARN = 1,
  INFO = 2,
  DEBUG = 3
}

export class Logger {
  private name: string;
  private level: LogLevel;

  constructor(name: string, level: LogLevel = LogLevel.INFO) {
    this.name = name;
    this.level = level;
  }

  private log(level: LogLevel, message: string, ...args: any[]): void {
    if (level <= this.level) {
      const timestamp = new Date().toISOString();
      const levelStr = LogLevel[level];
      // Use stderr for logging to avoid interfering with JSON-RPC on stdout
      console.error(`[${timestamp}] [${levelStr}] [${this.name}] ${message}`, ...args);
    }
  }

  error(message: string, ...args: any[]): void {
    this.log(LogLevel.ERROR, message, ...args);
  }

  warn(message: string, ...args: any[]): void {
    this.log(LogLevel.WARN, message, ...args);
  }

  info(message: string, ...args: any[]): void {
    this.log(LogLevel.INFO, message, ...args);
  }

  debug(message: string, ...args: any[]): void {
    this.log(LogLevel.DEBUG, message, ...args);
  }

  setLevel(level: LogLevel): void {
    this.level = level;
  }
} 