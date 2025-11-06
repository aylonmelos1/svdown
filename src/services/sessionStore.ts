import Database from 'better-sqlite3';
import fs from 'fs';
import path from 'path';
import log from '../log';

const DEFAULT_DB_FOLDER = process.env.SVDOWN_DATA_DIR
    ? path.resolve(process.env.SVDOWN_DATA_DIR)
    : path.resolve(process.cwd(), 'data');
const DB_FILE_NAME = 'sessions.db';

type SessionRow = {
    downloads: number;
};

type SessionTotalsRow = {
    downloads: number;
    total_duration_seconds: number;
};

type ServiceStatsRow = {
    service: string;
    downloads: number;
    total_duration_seconds: number;
};

export type ServiceSummary = {
    service: string;
    downloads: number;
    totalDurationSeconds: number;
};

type SessionStatsGroup = {
    downloads: number;
    totalDurationSeconds: number;
    services: ServiceSummary[];
};

export type SessionStatsSummary = {
    user: SessionStatsGroup;
    global: SessionStatsGroup;
};

type DownloadEvent = {
    userId: string;
    service?: string | null;
    mediaType?: string | null;
    durationSeconds?: number | null;
};

let database: Database.Database | null = null;

function getDatabase(): Database.Database {
    if (database) {
        return database;
    }

    fs.mkdirSync(DEFAULT_DB_FOLDER, { recursive: true });
    const dbPath = path.join(DEFAULT_DB_FOLDER, DB_FILE_NAME);
    log.info(`Opening session store database at ${dbPath}`);
    database = new Database(dbPath);
    database.pragma('journal_mode = WAL');
    database.exec(`
        CREATE TABLE IF NOT EXISTS sessions (
            user_id TEXT PRIMARY KEY,
            downloads INTEGER NOT NULL DEFAULT 0,
            total_duration_seconds REAL NOT NULL DEFAULT 0,
            first_seen TEXT NOT NULL DEFAULT (CURRENT_TIMESTAMP),
            last_seen TEXT NOT NULL DEFAULT (CURRENT_TIMESTAMP)
        );
    `);
    database.exec(`
        CREATE TABLE IF NOT EXISTS session_service_stats (
            user_id TEXT NOT NULL,
            service TEXT NOT NULL,
            media_type TEXT NOT NULL,
            downloads INTEGER NOT NULL DEFAULT 0,
            total_duration_seconds REAL NOT NULL DEFAULT 0,
            last_updated TEXT NOT NULL DEFAULT (CURRENT_TIMESTAMP),
            PRIMARY KEY (user_id, service, media_type)
        );
    `);
    database.exec(`
        CREATE TABLE IF NOT EXISTS service_totals (
            service TEXT NOT NULL,
            media_type TEXT NOT NULL,
            downloads INTEGER NOT NULL DEFAULT 0,
            total_duration_seconds REAL NOT NULL DEFAULT 0,
            PRIMARY KEY (service, media_type)
        );
    `);
    addColumnIfMissing(database, 'sessions', 'total_duration_seconds', 'REAL NOT NULL DEFAULT 0');
    return database;
}

function addColumnIfMissing(db: Database.Database, table: string, column: string, definition: string) {
    const pragmaStmt = db.prepare(`PRAGMA table_info(${table});`);
    const rows = pragmaStmt.all() as Array<{ name: string }>;
    const hasColumn = rows.some(row => row.name === column);
    if (!hasColumn) {
        db.exec(`ALTER TABLE ${table} ADD COLUMN ${column} ${definition};`);
    }
}

function ensureSession(userId: string) {
    const db = getDatabase();
    const ensureStmt = db.prepare(`
        INSERT OR IGNORE INTO sessions (user_id, downloads, total_duration_seconds, first_seen, last_seen)
        VALUES (?, 0, 0, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP);
    `);
    ensureStmt.run(userId);
    const touchStmt = db.prepare(`
        UPDATE sessions
        SET last_seen = CURRENT_TIMESTAMP
        WHERE user_id = ?;
    `);
    touchStmt.run(userId);
}

export function recordDownloadEvent(event: DownloadEvent): number {
    const { userId } = event;
    if (!userId) {
        return 0;
    }

    ensureSession(userId);
    const db = getDatabase();
    const cleanMediaType = event.mediaType === 'audio' ? 'audio' : 'video';
    const cleanDuration = normalizeDuration(event.durationSeconds);
    const cleanService = sanitizeService(event.service);

    const transaction = db.transaction(() => {
        const totalDownloads = incrementSessionTotals(userId, cleanDuration);
        if (cleanService) {
            upsertSessionServiceStats(userId, cleanService, cleanMediaType, cleanDuration);
            upsertServiceTotals(cleanService, cleanMediaType, cleanDuration);
        }
        return totalDownloads;
    });

    return transaction();
}

export function getDownloadCount(userId: string): number {
    if (!userId) {
        return 0;
    }
    ensureSession(userId);
    const db = getDatabase();
    const selectStmt = db.prepare(`
        SELECT downloads
        FROM sessions
        WHERE user_id = ?;
    `);
    const result = selectStmt.get(userId) as SessionRow | undefined;
    return result?.downloads ?? 0;
}

export function getSessionStatsSummary(userId?: string | null): SessionStatsSummary {
    const normalizedUserId = typeof userId === 'string' && userId.trim().length > 0 ? userId : null;
    const userTotals = normalizedUserId ? fetchSessionTotals(normalizedUserId) : buildEmptyTotals();
    const userServices = normalizedUserId ? fetchUserServiceStats(normalizedUserId) : [];
    const globalTotals = fetchGlobalTotals();
    const globalServices = fetchGlobalServiceStats();

    return {
        user: { ...userTotals, services: userServices },
        global: { ...globalTotals, services: globalServices },
    };
}

function incrementSessionTotals(userId: string, durationSeconds: number): number {
    const db = getDatabase();
    const stmt = db.prepare(`
        UPDATE sessions
        SET downloads = downloads + 1,
            total_duration_seconds = total_duration_seconds + @duration,
            last_seen = CURRENT_TIMESTAMP
        WHERE user_id = @userId
        RETURNING downloads;
    `);
    const result = stmt.get({ userId, duration: durationSeconds }) as SessionRow | undefined;
    return result?.downloads ?? 0;
}

function upsertSessionServiceStats(userId: string, service: string, mediaType: string, durationSeconds: number) {
    const db = getDatabase();
    const stmt = db.prepare(`
        INSERT INTO session_service_stats (user_id, service, media_type, downloads, total_duration_seconds, last_updated)
        VALUES (@userId, @service, @mediaType, 1, @duration, CURRENT_TIMESTAMP)
        ON CONFLICT(user_id, service, media_type) DO UPDATE SET
            downloads = downloads + 1,
            total_duration_seconds = total_duration_seconds + excluded.total_duration_seconds,
            last_updated = CURRENT_TIMESTAMP;
    `);
    stmt.run({ userId, service, mediaType, duration: durationSeconds });
}

function upsertServiceTotals(service: string, mediaType: string, durationSeconds: number) {
    const db = getDatabase();
    const stmt = db.prepare(`
        INSERT INTO service_totals (service, media_type, downloads, total_duration_seconds)
        VALUES (@service, @mediaType, 1, @duration)
        ON CONFLICT(service, media_type) DO UPDATE SET
            downloads = downloads + 1,
            total_duration_seconds = total_duration_seconds + excluded.total_duration_seconds;
    `);
    stmt.run({ service, mediaType, duration: durationSeconds });
}

function sanitizeService(service?: string | null): string | null {
    if (!service) return null;
    const normalized = service.toLowerCase();
    const allowed = new Set(['shopee', 'pinterest', 'tiktok', 'youtube', 'meta']);
    return allowed.has(normalized) ? normalized : null;
}

function normalizeDuration(rawValue?: number | null): number {
    if (typeof rawValue !== 'number' || !Number.isFinite(rawValue) || rawValue <= 0) {
        return 0;
    }
    return rawValue;
}

function buildEmptyTotals(): SessionStatsGroup {
    return {
        downloads: 0,
        totalDurationSeconds: 0,
        services: [],
    };
}

function fetchSessionTotals(userId: string): Omit<SessionStatsGroup, 'services'> {
    ensureSession(userId);
    const db = getDatabase();
    const stmt = db.prepare(`
        SELECT downloads, total_duration_seconds
        FROM sessions
        WHERE user_id = ?;
    `);
    const row = stmt.get(userId) as SessionTotalsRow | undefined;
    return {
        downloads: normalizeCount(row?.downloads),
        totalDurationSeconds: normalizeDuration(row?.total_duration_seconds) ?? 0,
    };
}

function fetchUserServiceStats(userId: string): ServiceSummary[] {
    const db = getDatabase();
    const stmt = db.prepare(`
        SELECT service, downloads, total_duration_seconds
        FROM session_service_stats
        WHERE user_id = ?;
    `);
    const rows = stmt.all(userId) as ServiceStatsRow[];
    return groupServiceRows(rows);
}

function fetchGlobalTotals(): Omit<SessionStatsGroup, 'services'> {
    const db = getDatabase();
    const stmt = db.prepare(`
        SELECT COALESCE(SUM(downloads), 0) as downloads,
               COALESCE(SUM(total_duration_seconds), 0) as total_duration_seconds
        FROM sessions;
    `);
    const row = stmt.get() as SessionTotalsRow | undefined;
    return {
        downloads: normalizeCount(row?.downloads),
        totalDurationSeconds: normalizeDuration(row?.total_duration_seconds) ?? 0,
    };
}

function fetchGlobalServiceStats(): ServiceSummary[] {
    const db = getDatabase();
    const stmt = db.prepare(`
        SELECT service, downloads, total_duration_seconds
        FROM service_totals;
    `);
    const rows = stmt.all() as ServiceStatsRow[];
    return groupServiceRows(rows);
}

function groupServiceRows(rows: ServiceStatsRow[]): ServiceSummary[] {
    const aggregate = new Map<string, ServiceSummary>();
    for (const row of rows) {
        if (!row?.service) {
            continue;
        }
        const key = row.service;
        const current = aggregate.get(key) ?? {
            service: key,
            downloads: 0,
            totalDurationSeconds: 0,
        };
        current.downloads += normalizeCount(row.downloads);
        current.totalDurationSeconds += normalizeDuration(row.total_duration_seconds);
        aggregate.set(key, current);
    }
    return Array.from(aggregate.values()).sort((a, b) => {
        if (b.downloads !== a.downloads) {
            return b.downloads - a.downloads;
        }
        if (b.totalDurationSeconds !== a.totalDurationSeconds) {
            return b.totalDurationSeconds - a.totalDurationSeconds;
        }
        return a.service.localeCompare(b.service);
    });
}

function normalizeCount(rawValue?: number | null): number {
    if (typeof rawValue !== 'number' || !Number.isFinite(rawValue) || rawValue < 0) {
        return 0;
    }
    return Math.floor(rawValue);
}
