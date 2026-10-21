import { drizzle } from 'drizzle-orm/bun-sqlite';
import { Database } from 'bun:sqlite';
// import * as schema from './schema';
import { DB_FILE_NAME } from '$app/env/private';

if (!DB_FILE_NAME) throw new Error('DATABASE_URL is not set');

const client = new Database(DB_FILE_NAME);

export const db = drizzle({ client });
