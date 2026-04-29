import { defineConfig } from 'drizzle-kit';

const url = process.env.DATABASE_URL ?? 'postgres://localhost/open_design_dev';
const dialect = url.startsWith('file:') || url.startsWith('sqlite:') ? 'sqlite' : 'postgresql';

export default defineConfig({
  out: dialect === 'sqlite' ? './drizzle/sqlite' : './drizzle/pg',
  schema: dialect === 'sqlite' ? './src/schema-sqlite.ts' : './src/schema.ts',
  dialect,
  dbCredentials: { url },
  strict: true,
});
