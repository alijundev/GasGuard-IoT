import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { db } from '#lib/server/db';
import { gasLogs } from '#lib/server/db/schema';
import { broadcastClear } from '#lib/server/events';
import { ADMIN_PASSWORD } from '$app/env/private';

export const POST: RequestHandler = async ({ request }) => {
	try {
		const body = (await request.json().catch(() => ({}))) as { password?: string };
		const password = body?.password;

		const expectedPassword = ADMIN_PASSWORD || 'admin123';

		if (!password || password !== expectedPassword) {
			return json(
				{
					success: false,
					error: 'Password salah! Akses pembersihan database ditolak.'
				},
				{ status: 401 }
			);
		}

		// Delete all records from gas_logs
		db.delete(gasLogs).run();

		// Notify all connected clients via SSE
		broadcastClear();

		return json({
			success: true,
			message: 'Semua log sensor di database berhasil dibersihkan.'
		});
	} catch (err) {
		console.error('[API] Error clearing database logs:', err);
		return json(
			{
				success: false,
				error: 'Terjadi kesalahan sistem saat membersihkan database.'
			},
			{ status: 500 }
		);
	}
};
