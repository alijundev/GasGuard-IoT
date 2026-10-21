import { defineConfig } from 'drizzle-kit';

export default defineConfig({
	schema: './src/lib/server/db/schema.ts',
	dialect: 'sqlite',
	dbCredentials: { url: process.env.DB_FILE_NAME || "history.sqlite" },
	verbose: true,
	strict: true
});
