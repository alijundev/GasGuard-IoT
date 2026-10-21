/**
 * Lightweight typed event emitter for broadcasting real-time sensor data
 * from the MQTT subscriber to SSE client connections.
 */

export type GasReading = {
	adcValue: number;
	status: 'NORMAL' | 'PERINGATAN';
	createdAt: string;
};

type Listener = (data: GasReading) => void;

const listeners = new Set<Listener>();

/** Subscribe to real-time gas readings. Returns an unsubscribe function. */
export function subscribe(listener: Listener): () => void {
	listeners.add(listener);
	return () => listeners.delete(listener);
}

/** Broadcast a new gas reading to all connected SSE clients. */
export function broadcast(data: GasReading): void {
	for (const listener of listeners) {
		listener(data);
	}
}
