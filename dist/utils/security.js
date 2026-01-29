/**
 * Security utilities for input validation and sanitization
 */
import { normalize, isAbsolute, resolve } from 'path';
/**
 * Sanitizes string input to prevent injection attacks
 */
export function sanitizeInput(input) {
    if (typeof input !== 'string') {
        throw new Error('Input must be a string');
    }
    return input
        // Remove control characters
        .replace(/[\x00-\x1F\x7F]/g, '')
        // Escape special characters for ExtendScript
        .replace(/['"\\]/g, '\\$&')
        // Limit length to prevent DoS
        .slice(0, 10000);
}
/**
 * Validates file paths to prevent path traversal attacks
 */
export function validateFilePath(filePath, allowedDirs) {
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
    }
    catch (error) {
        return { valid: false, error: `Path validation error: ${error instanceof Error ? error.message : String(error)}` };
    }
}
/**
 * Validates project name to prevent injection
 */
export function validateProjectName(name) {
    if (!name || typeof name !== 'string') {
        return { valid: false, error: 'Project name must be a non-empty string' };
    }
    const trimmed = name.trim();
    // Length check
    if (trimmed.length === 0) {
        return { valid: false, error: 'Project name cannot be empty' };
    }
    if (trimmed.length > 255) {
        return { valid: false, error: 'Project name too long (max 255 characters)' };
    }
    // Check for invalid characters in filenames
    const invalidChars = /[<>:"|?*\x00-\x1F]/;
    if (invalidChars.test(trimmed)) {
        return { valid: false, error: 'Project name contains invalid characters' };
    }
    const sanitized = sanitizeInput(trimmed);
    return { valid: true, sanitized };
}
/**
 * Validates numeric input (e.g., time, track index)
 */
export function validateNumber(value, min, max) {
    const num = Number(value);
    if (isNaN(num)) {
        return { valid: false, error: 'Value must be a number' };
    }
    if (!isFinite(num)) {
        return { valid: false, error: 'Value must be finite' };
    }
    if (min !== undefined && num < min) {
        return { valid: false, error: `Value must be >= ${min}` };
    }
    if (max !== undefined && num > max) {
        return { valid: false, error: `Value must be <= ${max}` };
    }
    return { valid: true, value: num };
}
/**
 * Validates array input
 */
export function validateArray(value, maxLength) {
    if (!Array.isArray(value)) {
        return { valid: false, error: 'Value must be an array' };
    }
    if (maxLength !== undefined && value.length > maxLength) {
        return { valid: false, error: `Array too long (max ${maxLength} items)` };
    }
    return { valid: true };
}
/**
 * Creates a safe temp directory with proper permissions
 */
export function createSecureTempDir(sessionId) {
    const tempBase = process.platform === 'win32'
        ? process.env.TEMP || 'C:\\Temp'
        : '/tmp';
    // Use session-specific directory
    const secureDir = normalize(`${tempBase}/premiere-bridge-${sessionId}`);
    return secureDir;
}
/**
 * Validates color value
 */
export function validateColor(color) {
    if (typeof color !== 'string') {
        return { valid: false, error: 'Color must be a string' };
    }
    // Allow common color formats: hex, rgb, rgba, color names
    const validColorPatterns = [
        /^#[0-9A-Fa-f]{6}$/, // hex
        /^#[0-9A-Fa-f]{3}$/, // short hex
        /^rgb\(\s*\d+\s*,\s*\d+\s*,\s*\d+\s*\)$/, // rgb
        /^rgba\(\s*\d+\s*,\s*\d+\s*,\s*\d+\s*,\s*[\d.]+\s*\)$/, // rgba
        /^(red|green|blue|yellow|white|black|gray|grey|orange|purple|pink)$/i, // color names
    ];
    const isValid = validColorPatterns.some(pattern => pattern.test(color));
    if (!isValid) {
        return { valid: false, error: 'Invalid color format' };
    }
    return { valid: true };
}
/**
 * Rate limiter to prevent abuse
 */
export class RateLimiter {
    requests = new Map();
    limit;
    windowMs;
    constructor(limit = 100, windowMs = 60000) {
        this.limit = limit;
        this.windowMs = windowMs;
    }
    check(identifier) {
        const now = Date.now();
        const windowStart = now - this.windowMs;
        // Get existing requests for this identifier
        const requests = this.requests.get(identifier) || [];
        // Filter out old requests outside the window
        const recentRequests = requests.filter(timestamp => timestamp > windowStart);
        // Check if limit exceeded
        if (recentRequests.length >= this.limit) {
            return false; // Rate limit exceeded
        }
        // Add current request
        recentRequests.push(now);
        this.requests.set(identifier, recentRequests);
        // Cleanup old entries periodically
        if (Math.random() < 0.01) { // 1% chance
            this.cleanup();
        }
        return true; // Request allowed
    }
    cleanup() {
        const now = Date.now();
        const windowStart = now - this.windowMs;
        for (const [identifier, requests] of this.requests.entries()) {
            const recentRequests = requests.filter(timestamp => timestamp > windowStart);
            if (recentRequests.length === 0) {
                this.requests.delete(identifier);
            }
            else {
                this.requests.set(identifier, recentRequests);
            }
        }
    }
    reset(identifier) {
        this.requests.delete(identifier);
    }
}
/**
 * Audit logger for security events
 */
export class AuditLogger {
    logs = [];
    maxLogs;
    constructor(maxLogs = 1000) {
        this.maxLogs = maxLogs;
    }
    log(event, details = {}) {
        this.logs.push({
            timestamp: new Date(),
            event,
            details
        });
        // Keep only recent logs
        if (this.logs.length > this.maxLogs) {
            this.logs = this.logs.slice(-this.maxLogs);
        }
        // In production, you might want to write these to a file or send to a logging service
        console.error(`[AUDIT] ${event}`, details);
    }
    getLogs(count) {
        return count ? this.logs.slice(-count) : [...this.logs];
    }
    clear() {
        this.logs = [];
    }
}
//# sourceMappingURL=security.js.map