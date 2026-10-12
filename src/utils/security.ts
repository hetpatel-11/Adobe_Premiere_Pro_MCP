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

import { readFileSync } from 'fs';
import { homedir } from 'os';
import { normalize, isAbsolute, join, resolve } from 'path';

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
 * Resolves the directory shared with the CEP panel, mirroring the panel's own
 * lookup in cep-plugin/bridge-cep.js: PREMIERE_TEMP_DIR, then the directory the
 * panel saved to ~/.premiere-mcp-bridge/config.json, then its platform default.
 *
 * This used to fall back to a per-session premiere-bridge-<uuid> directory, which
 * the panel never polls, so any client that did not set PREMIERE_TEMP_DIR (the
 * Claude Code plugin among them) reported bridge_unavailable with the panel open.
 */
export function resolveBridgeTempDir(
  env: NodeJS.ProcessEnv = process.env,
  homedirPath: string = homedir(),
): string {
  if (env.PREMIERE_TEMP_DIR) return env.PREMIERE_TEMP_DIR.replace(/[\\/]+$/, '');

  try {
    const config = JSON.parse(readFileSync(join(homedirPath, '.premiere-mcp-bridge', 'config.json'), 'utf8'));
    if (typeof config?.tempDirectory === 'string' && config.tempDirectory.trim()) {
      return config.tempDirectory.trim().replace(/[\\/]+$/, '');
    }
  } catch {
    // No saved panel config yet; use the panel's default below.
  }

  const tempBase = process.platform === 'win32'
    ? env.TEMP || env.TMP || 'C:\\Temp'
    : '/tmp';
  return join(tempBase, 'premiere-mcp-bridge');
}
