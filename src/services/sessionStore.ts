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
            first_seen TEXT NOT NULL DEFAULT (CURRENT_TIMESTAMP),
            last_seen TEXT NOT NULL DEFAULT (CURRENT_TIMESTAMP)
        );
    `);
    return database;
}

function ensureSession(userId: string) {
    const db = getDatabase();
    const ensureStmt = db.prepare(`
        INSERT OR IGNORE INTO sessions (user_id, downloads, first_seen, last_seen)
        VALUES (?, 0, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP);
    `);
    ensureStmt.run(userId);
    const touchStmt = db.prepare(`
        UPDATE sessions
        SET last_seen = CURRENT_TIMESTAMP
        WHERE user_id = ?;
    `);
    touchStmt.run(userId);
}

export function incrementDownloadCount(userId: string): number {
    if (!userId) {
        return 0;
    }
    ensureSession(userId);
    const db = getDatabase();
    const incrementStmt = db.prepare(`
        UPDATE sessions
        SET downloads = downloads + 1,
            last_seen = CURRENT_TIMESTAMP
        WHERE user_id = ?
        RETURNING downloads;
    `);
    const result = incrementStmt.get(userId) as SessionRow | undefined;
    return result?.downloads ?? 0;
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
