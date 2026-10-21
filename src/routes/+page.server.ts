import { db } from '#lib/server/db';
import { gasLogs } from '#lib/server/db/schema';
import { desc } from 'drizzle-orm';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = async () => {
	// Fetch last 15 logged telemetry records
	const logs = db.select().from(gasLogs).orderBy(desc(gasLogs.id)).limit(15).all();

	const latest = logs[0] ?? null;

	return {
		logs,
		latest
	};
};
