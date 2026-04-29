// Runtime-selected DB client. DATABASE_URL prefix decides the dialect:
//   postgres://… → drizzle-orm/postgres-js
//   file:…       → drizzle-orm/better-sqlite3
//
// In Next.js routes, import { getDb } from '@open-design/db/client'.
// Schema is namespaced per dialect; consumers should pick `pg` (cloud) or `sqlite` (self-host).
import * as pgSchema from './schema.js';
import * as sqliteSchema from './schema-sqlite.js';

export type DbDialect = 'postgres' | 'sqlite';

export interface DbHandle {
  dialect: DbDialect;
  db: unknown;
  schema: typeof pgSchema | typeof sqliteSchema;
}

let cached: DbHandle | null = null;

export async function getDb(): Promise<DbHandle> {
  if (cached) return cached;
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error('DATABASE_URL is required');
  if (url.startsWith('postgres://') || url.startsWith('postgresql://')) {
    const { drizzle } = await import('drizzle-orm/postgres-js');
    const postgres = (await import('postgres')).default;
    const sql = postgres(url, { max: 10, idle_timeout: 20 });
    cached = {
      dialect: 'postgres',
      db: drizzle(sql, { schema: pgSchema }),
      schema: pgSchema,
    };
    return cached;
  }
  if (url.startsWith('file:') || url.startsWith('sqlite:')) {
    const { drizzle } = await import('drizzle-orm/better-sqlite3');
    const Database = (await import('better-sqlite3')).default;
    const path = url.replace(/^(file:|sqlite:)/, '');
    const sqlite = new Database(path);
    sqlite.pragma('journal_mode = WAL');
    sqlite.pragma('foreign_keys = ON');
    cached = {
      dialect: 'sqlite',
      db: drizzle(sqlite, { schema: sqliteSchema }),
      schema: sqliteSchema,
    };
    return cached;
  }
  throw new Error(`Unsupported DATABASE_URL: ${url}`);
}
