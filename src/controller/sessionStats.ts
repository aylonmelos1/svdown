import type { Request, Response } from 'express';
import log from '../log';
import { getSessionStatsSummary } from '../services/sessionStore';

const USER_ID_COOKIE = 'svdown_uid';

export function sessionStatsHandler(req: Request, res: Response) {
    try {
        const userId = extractUserId(req);
        const stats = getSessionStatsSummary(userId);
        res.json({
            userId: userId ?? null,
            stats,
        });
    } catch (error) {
        log.error('Failed to load session stats', error);
        res.status(500).json({ error: 'Failed to load stats' });
    }
}

function extractUserId(req: Request): string | null {
    const queryValue = typeof req.query?.uid === 'string' ? req.query.uid : null;
    const cookieValue = typeof req.cookies?.[USER_ID_COOKIE] === 'string' ? req.cookies[USER_ID_COOKIE] : null;
    return queryValue || cookieValue || null;
}
