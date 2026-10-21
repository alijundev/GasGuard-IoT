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
type ClearListener = () => void;

const listeners = new Set<Listener>();
const clearListeners = new Set<ClearListener>();

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

/** Subscribe to database clear events. Returns an unsubscribe function. */
export function subscribeClear(listener: ClearListener): () => void {
	clearListeners.add(listener);
	return () => clearListeners.delete(listener);
}

/** Broadcast database clear event to all connected SSE clients. */
export function broadcastClear(): void {
	for (const listener of clearListeners) {
		listener();
	}
}
