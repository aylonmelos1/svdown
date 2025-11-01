import type { Request, Response, NextFunction } from 'express';

export const SHARED_KEY_NAME = 'svdown_sid';

export function ensureSession(req: Request, res: Response, next: NextFunction) {
    if (req.path.startsWith('/api/')) {
        return next();
    }

    const secret = process.env.SVDOWN_SHARED_KEY || 'local-dev-key';
    if (!secret) {
        return res.status(500).send('Missing server secret');
    }

    const current = req.cookies?.[SHARED_KEY_NAME];
    if (current !== secret) {
        res.cookie(SHARED_KEY_NAME, secret, {
            httpOnly: true,
            sameSite: 'strict',
            secure: process.env.NODE_ENV === 'production',
            maxAge: 1000 * 60 * 60 * 24 * 30,
        });
    }

    next();
}
