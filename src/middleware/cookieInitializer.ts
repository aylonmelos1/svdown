import type { Request, Response, NextFunction } from 'express';

const API_KEY_NAME = 'svdown_key';
const API_KEY_VALUE = process.env.SVDOWN_API_KEY || 'dev-key';

export function ensureApiCookie(req: Request, res: Response, next: NextFunction) {
    const hasCookie = req.cookies?.[API_KEY_NAME] === API_KEY_VALUE;
    if (!hasCookie) {
        res.cookie(API_KEY_NAME, API_KEY_VALUE, {
            httpOnly: true,
            sameSite: 'strict',
            secure: process.env.NODE_ENV === 'production',
            maxAge: 1000 * 60 * 60 * 24 * 30,
        });
    }
    next();
}
