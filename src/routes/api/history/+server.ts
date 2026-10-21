import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { db } from '#lib/server/db';
import { gasLogs } from '#lib/server/db/schema';
import { gte, desc } from 'drizzle-orm';

export const GET: RequestHandler = ({ url }) => {
	const range = url.searchParams.get('range') || '10m';

	let cutoffTime: number | null;
	const now = Date.now();

	switch (range) {
		case '5m':
			cutoffTime = now - 5 * 60 * 1000;
			break;
		case '10m':
			cutoffTime = now - 10 * 60 * 1000;
			break;
		case '1h':
			cutoffTime = now - 60 * 60 * 1000;
			break;
		case '24h':
			cutoffTime = now - 24 * 60 * 60 * 1000;
			break;
		case '7d':
			cutoffTime = now - 7 * 24 * 60 * 60 * 1000;
			break;
		case 'all':
			cutoffTime = null;
			break;
		default:
			cutoffTime = now - 10 * 60 * 1000;
			break;
	}

	let rawLogs: (typeof gasLogs.$inferSelect)[];

	// Safety cap of 2000 most recent records to prevent OOM on e2-micro (1GB RAM)
	const MAX_RECORDS = 2000;

	if (cutoffTime !== null) {
		const cutoffIso = new Date(cutoffTime).toISOString();
		rawLogs = db
			.select()
			.from(gasLogs)
			.where(gte(gasLogs.createdAt, cutoffIso))
			.orderBy(desc(gasLogs.id))
			.limit(MAX_RECORDS)
			.all()
			.reverse();
	} else {
		rawLogs = db
			.select()
			.from(gasLogs)
			.orderBy(desc(gasLogs.id))
			.limit(MAX_RECORDS)
			.all()
			.reverse();
	}

	// Downsample to max 60 points if history is large so SVG stays lightweight
	const maxPoints = 60;
	let points = rawLogs;

	if (rawLogs.length > maxPoints) {
		const step = (rawLogs.length - 1) / (maxPoints - 1);
		points = [];
		for (let i = 0; i < maxPoints; i++) {
			const idx = Math.min(rawLogs.length - 1, Math.round(i * step));
			points.push(rawLogs[idx]);
		}
	}

	return json(
		{
			range,
			totalCount: rawLogs.length,
			points: points.map((p) => ({
				adc: p.adcValue,
				status: p.status,
				createdAt: p.createdAt
			}))
		},
		{
			headers: {
				'Cache-Control': 'no-cache, no-store, must-revalidate, max-age=0',
				Pragma: 'no-cache'
			}
		}
	);
};
