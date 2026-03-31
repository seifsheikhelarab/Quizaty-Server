import type { Request, Response, NextFunction } from 'express';
import crypto from 'crypto';

export function csrfCookieMiddleware(req: Request, res: Response, next: NextFunction) {
    if (['GET', 'HEAD', 'OPTIONS'].includes(req.method)) {
        return next();
    }

    const clientToken = req.headers['x-csrf-token'] as string | undefined;
    const serverToken = req.cookies['csrf_token'];

    if (!serverToken || clientToken !== serverToken) {
        return res.status(403).json({ error: 'Invalid CSRF token' });
    }

    next();
}

export function generateCsrfToken(res: Response): string {
    const token = crypto.randomBytes(32).toString('hex');
    res.cookie('csrf_token', token, {
        httpOnly: false,
        sameSite: 'strict',
        secure: process.env.NODE_ENV === 'production',
        maxAge: 3600000
    });
    return token;
}
