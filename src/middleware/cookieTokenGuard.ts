import type { Request, Response, NextFunction } from 'express';

const TOKEN_ENV_NAME = 'TOKEN_COOKIES';

export function cookieTokenGuard(req: Request, res: Response, next: NextFunction) {
    const expectedToken = process.env[TOKEN_ENV_NAME];

    if (!expectedToken) {
        return res.status(503).json({
            error: 'TOKEN_COOKIES não configurado no servidor.',
        });
    }

    const headerValue = req.get('authorization') ?? '';
    const headerToken = headerValue.startsWith('Bearer ') ? headerValue.slice(7) : headerValue;
    const fallbackToken = typeof req.query.token === 'string' ? req.query.token : undefined;
    const providedToken = headerToken || fallbackToken;

    if (!providedToken || providedToken !== expectedToken) {
        return res.status(401).json({ error: 'Token inválido para atualização de cookies.' });
    }

    return next();
}
