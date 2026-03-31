type LogLevel = 'info' | 'warn' | 'error';

interface LogEntry {
    timestamp: string;
    level: LogLevel;
    event: string;
    details?: Record<string, unknown>;
    ip?: string;
    userId?: string;
}

function formatLogEntry(entry: LogEntry): string {
    return JSON.stringify(entry);
}

function log(level: LogLevel, event: string, details?: Record<string, unknown>, userId?: string) {
    const entry: LogEntry = {
        timestamp: new Date().toISOString(),
        level,
        event,
        details,
        userId,
    };

    if (level === 'error') {
        console.error(formatLogEntry(entry));
    } else if (level === 'warn') {
        console.warn(formatLogEntry(entry));
    } else {
        console.log(formatLogEntry(entry));
    }
}

export const securityLog = {
    failedLogin: (email: string, reason: string, _ip?: string) => {
        log('warn', 'FAILED_LOGIN', { email, reason }, undefined);
    },

    successfulLogin: (userId: string, role: string, _ip?: string) => {
        log('info', 'SUCCESSFUL_LOGIN', { role }, userId);
    },

    logout: (userId: string) => {
        log('info', 'LOGOUT', {}, userId);
    },

    unauthorizedAccess: (endpoint: string, method: string, _ip?: string) => {
        log('warn', 'UNAUTHORIZED_ACCESS', { endpoint, method });
    },

    forbiddenAccess: (userId: string, resource: string, _ip?: string) => {
        log('warn', 'FORBIDDEN_ACCESS', { resource }, userId);
    },

    rateLimitExceeded: (identifier: string, endpoint: string) => {
        log('warn', 'RATE_LIMIT_EXCEEDED', { identifier, endpoint });
    },

    invalidToken: (reason: string, _ip?: string) => {
        log('warn', 'INVALID_TOKEN', { reason });
    },

    passwordChanged: (userId: string) => {
        log('info', 'PASSWORD_CHANGED', {}, userId);
    },

    accountCreated: (userId: string, role: string) => {
        log('info', 'ACCOUNT_CREATED', { role }, userId);
    },
};
