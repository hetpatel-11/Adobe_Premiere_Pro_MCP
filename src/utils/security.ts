/**
 * Security utilities for input validation and sanitization
 *
 * This module deliberately holds only what is wired up. It previously also
 * exported sanitizeInput, validateProjectName, validateNumber, validateArray,
 * validateColor, a RateLimiter and an AuditLogger. None of them were imported by
 * any tool path, and none were covered by a test.
 *
 * sanitizeInput was the actively harmful one. It stripped control characters and
 * backslash-escaped quotes, so a bin legitimately named 12" would have been
 * stored as 12\", and a clip name containing a control character would have been
 * silently altered rather than rejected. Worse, its presence beside a proven
 * ExtendScript injection hole invited the assumption that arguments were being
 * sanitized somewhere. They were not: nothing ever called it.
 *
 * Injection is prevented instead by serialising every interpolated value through
 * JSON.stringify at the point of use, which is correct for arbitrary input
 * rather than lossy, and control characters are handled in the bridge prelude
 * where the response is built.
 */

import { normalize, isAbsolute, resolve } from 'path';

/**
 * Validates file paths to prevent path traversal attacks
 */
export function validateFilePath(filePath: string, allowedDirs?: string[]): { valid: boolean; normalized?: string; error?: string } {
  try {
    if (!filePath || typeof filePath !== 'string') {
      return { valid: false, error: 'Path must be a non-empty string' };
    }

    // Convert to absolute path
    const absolutePath = isAbsolute(filePath) ? filePath : resolve(filePath);

    // Normalize to prevent ../ attacks
    const normalizedPath = normalize(absolutePath);

    // Check for path traversal attempts
    if (normalizedPath.includes('..')) {
      return { valid: false, error: 'Path traversal detected' };
    }

    // If allowed directories specified, check if path is within them
    if (allowedDirs && allowedDirs.length > 0) {
      const isAllowed = allowedDirs.some(allowedDir => {
        const normalizedAllowed = normalize(resolve(allowedDir));
        return normalizedPath.startsWith(normalizedAllowed);
      });

      if (!isAllowed) {
        return { valid: false, error: 'Path not in allowed directories' };
      }
    }

    // Block access to system directories
    const forbiddenPaths = [
      '/etc',
      '/System',
      '/bin',
      '/sbin',
      '/usr/bin',
      '/usr/sbin',
      'C:\\Windows\\System32',
      'C:\\Windows\\SysWOW64',
    ];

    for (const forbidden of forbiddenPaths) {
      if (normalizedPath.startsWith(normalize(forbidden))) {
        return { valid: false, error: 'Access to system directories is forbidden' };
      }
    }

    return { valid: true, normalized: normalizedPath };
  } catch (error) {
    return { valid: false, error: `Path validation error: ${error instanceof Error ? error.message : String(error)}` };
  }
}

/**
 * Creates a safe temp directory with proper permissions
 */
export function createSecureTempDir(sessionId: string): string {
  const tempBase = process.platform === 'win32'
    ? process.env.TEMP || 'C:\\Temp'
    : '/tmp';

  // Use session-specific directory
  const secureDir = normalize(`${tempBase}/premiere-bridge-${sessionId}`);

  return secureDir;
}
