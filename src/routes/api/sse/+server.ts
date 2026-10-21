import type { RequestHandler } from './$types';
import { subscribe, type GasReading } from '#lib/server/events';

export const GET: RequestHandler = ({ request }) => {
	let unsubscribe: (() => void) | null = null;
	let keepAliveTimer: ReturnType<typeof setInterval> | null = null;

	const encoder = new TextEncoder();

	const stream = new ReadableStream<Uint8Array>({
		start(controller) {
			// Send initial connected event
			controller.enqueue(encoder.encode(': connected\n\n'));

			// Subscribe to real-time readings from MQTT subscriber
			unsubscribe = subscribe((reading: GasReading) => {
				try {
					const data = JSON.stringify({
						adc: reading.adcValue,
						adcValue: reading.adcValue,
						status: reading.status,
						createdAt: reading.createdAt
					});
					controller.enqueue(encoder.encode(`data: ${data}\n\n`));
				} catch (err) {
					console.error('[SSE] Failed to enqueue event:', err);
				}
			});

			// Keep-alive heartbeat every 15 seconds to prevent proxy / browser timeout
			keepAliveTimer = setInterval(() => {
				try {
					controller.enqueue(encoder.encode(': ping\n\n'));
				} catch {
					// Controller might be closed
					if (keepAliveTimer) clearInterval(keepAliveTimer);
				}
			}, 15_000);
		},
		cancel() {
			if (keepAliveTimer) {
				clearInterval(keepAliveTimer);
				keepAliveTimer = null;
			}
			if (unsubscribe) {
				unsubscribe();
				unsubscribe = null;
			}
		}
	});

	// Cleanup on client disconnect
	request.signal.addEventListener('abort', () => {
		if (keepAliveTimer) {
			clearInterval(keepAliveTimer);
			keepAliveTimer = null;
		}
		if (unsubscribe) {
			unsubscribe();
			unsubscribe = null;
		}
	});

	return new Response(stream, {
		headers: {
			'Content-Type': 'text/event-stream',
			'Cache-Control': 'no-cache, no-transform',
			Connection: 'keep-alive',
			'X-Accel-Buffering': 'no'
		}
	});
};
