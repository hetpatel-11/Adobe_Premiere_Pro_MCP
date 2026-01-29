/**
 * Unit tests for Logger utility
 */

import { Logger, LogLevel } from '../../utils/logger.js';

describe('Logger', () => {
  let consoleErrorSpy: jest.SpyInstance;

  beforeEach(() => {
    // Spy on console.error since logger uses stderr
    consoleErrorSpy = jest.spyOn(console, 'error').mockImplementation();
  });

  afterEach(() => {
    consoleErrorSpy.mockRestore();
  });

  describe('constructor', () => {
    it('should create logger with default INFO level', () => {
      const logger = new Logger('test-logger');
      logger.info('test message');

      expect(consoleErrorSpy).toHaveBeenCalled();
      const output = consoleErrorSpy.mock.calls[0][0];
      expect(output).toContain('[INFO]');
      expect(output).toContain('[test-logger]');
      expect(output).toContain('test message');
    });

    it('should create logger with custom log level', () => {
      const logger = new Logger('test-logger', LogLevel.DEBUG);
      logger.debug('debug message');

      expect(consoleErrorSpy).toHaveBeenCalled();
      const output = consoleErrorSpy.mock.calls[0][0];
      expect(output).toContain('[DEBUG]');
    });
  });

  describe('log level filtering', () => {
    it('should only log messages at or below current level - ERROR level', () => {
      const logger = new Logger('test', LogLevel.ERROR);

      logger.error('error msg');
      logger.warn('warn msg');
      logger.info('info msg');
      logger.debug('debug msg');

      expect(consoleErrorSpy).toHaveBeenCalledTimes(1);
      expect(consoleErrorSpy.mock.calls[0][0]).toContain('[ERROR]');
    });

    it('should only log messages at or below current level - WARN level', () => {
      const logger = new Logger('test', LogLevel.WARN);

      logger.error('error msg');
      logger.warn('warn msg');
      logger.info('info msg');
      logger.debug('debug msg');

      expect(consoleErrorSpy).toHaveBeenCalledTimes(2);
      expect(consoleErrorSpy.mock.calls[0][0]).toContain('[ERROR]');
      expect(consoleErrorSpy.mock.calls[1][0]).toContain('[WARN]');
    });

    it('should only log messages at or below current level - INFO level', () => {
      const logger = new Logger('test', LogLevel.INFO);

      logger.error('error msg');
      logger.warn('warn msg');
      logger.info('info msg');
      logger.debug('debug msg');

      expect(consoleErrorSpy).toHaveBeenCalledTimes(3);
      expect(consoleErrorSpy.mock.calls[0][0]).toContain('[ERROR]');
      expect(consoleErrorSpy.mock.calls[1][0]).toContain('[WARN]');
      expect(consoleErrorSpy.mock.calls[2][0]).toContain('[INFO]');
    });

    it('should only log messages at or below current level - DEBUG level', () => {
      const logger = new Logger('test', LogLevel.DEBUG);

      logger.error('error msg');
      logger.warn('warn msg');
      logger.info('info msg');
      logger.debug('debug msg');

      expect(consoleErrorSpy).toHaveBeenCalledTimes(4);
      expect(consoleErrorSpy.mock.calls[0][0]).toContain('[ERROR]');
      expect(consoleErrorSpy.mock.calls[1][0]).toContain('[WARN]');
      expect(consoleErrorSpy.mock.calls[2][0]).toContain('[INFO]');
      expect(consoleErrorSpy.mock.calls[3][0]).toContain('[DEBUG]');
    });
  });

  describe('error()', () => {
    it('should log error messages', () => {
      const logger = new Logger('test', LogLevel.ERROR);
      logger.error('error message');

      expect(consoleErrorSpy).toHaveBeenCalledTimes(1);
      const output = consoleErrorSpy.mock.calls[0][0];
      expect(output).toContain('[ERROR]');
      expect(output).toContain('error message');
    });

    it('should log error with additional arguments', () => {
      const logger = new Logger('test', LogLevel.ERROR);
      const errorObj = new Error('test error');
      logger.error('error occurred', errorObj);

      expect(consoleErrorSpy).toHaveBeenCalledWith(
        expect.stringContaining('[ERROR]'),
        errorObj
      );
    });
  });

  describe('warn()', () => {
    it('should log warning messages', () => {
      const logger = new Logger('test', LogLevel.WARN);
      logger.warn('warning message');

      const output = consoleErrorSpy.mock.calls[0][0];
      expect(output).toContain('[WARN]');
      expect(output).toContain('warning message');
    });
  });

  describe('info()', () => {
    it('should log info messages', () => {
      const logger = new Logger('test', LogLevel.INFO);
      logger.info('info message');

      const output = consoleErrorSpy.mock.calls[0][0];
      expect(output).toContain('[INFO]');
      expect(output).toContain('info message');
    });
  });

  describe('debug()', () => {
    it('should log debug messages', () => {
      const logger = new Logger('test', LogLevel.DEBUG);
      logger.debug('debug message');

      const output = consoleErrorSpy.mock.calls[0][0];
      expect(output).toContain('[DEBUG]');
      expect(output).toContain('debug message');
    });
  });

  describe('setLevel()', () => {
    it('should change log level dynamically', () => {
      const logger = new Logger('test', LogLevel.ERROR);

      logger.info('should not log');
      expect(consoleErrorSpy).toHaveBeenCalledTimes(0);

      logger.setLevel(LogLevel.INFO);
      logger.info('should log');
      expect(consoleErrorSpy).toHaveBeenCalledTimes(1);
    });
  });

  describe('timestamp formatting', () => {
    it('should include ISO timestamp in log output', () => {
      const logger = new Logger('test', LogLevel.INFO);
      logger.info('test');

      const output = consoleErrorSpy.mock.calls[0][0];
      // Check for ISO 8601 timestamp format
      expect(output).toMatch(/\[\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z\]/);
    });
  });

  describe('logger name', () => {
    it('should include logger name in output', () => {
      const logger = new Logger('my-component', LogLevel.INFO);
      logger.info('test message');

      const output = consoleErrorSpy.mock.calls[0][0];
      expect(output).toContain('[my-component]');
    });
  });

  describe('multiple arguments', () => {
    it('should pass multiple arguments to console.error', () => {
      const logger = new Logger('test', LogLevel.INFO);
      const obj = { key: 'value' };
      const arr = [1, 2, 3];

      logger.info('message with objects', obj, arr);

      expect(consoleErrorSpy).toHaveBeenCalledWith(
        expect.stringContaining('message with objects'),
        obj,
        arr
      );
    });
  });

  describe('LogLevel enum', () => {
    it('should have correct numeric values', () => {
      expect(LogLevel.ERROR).toBe(0);
      expect(LogLevel.WARN).toBe(1);
      expect(LogLevel.INFO).toBe(2);
      expect(LogLevel.DEBUG).toBe(3);
    });
  });
});
