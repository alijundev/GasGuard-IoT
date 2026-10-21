import { drizzle } from 'drizzle-orm/bun-sqlite';
import { Database } from 'bun:sqlite';
import { DB_FILE_NAME } from '$app/env/private';

const dbPath = DB_FILE_NAME || 'history.sqlite';

const client = new Database(dbPath);

// Enable WAL mode for better concurrent read performance
client.exec('PRAGMA journal_mode = WAL');

export const db = drizzle({ client });
