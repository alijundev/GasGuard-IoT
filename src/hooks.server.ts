import type { Handle } from '@sveltejs/kit/hooks';

// Boot the MQTT subscriber on server startup.
// This connects to the broker, subscribes to the topic, and starts
// logging readings + sending Telegram alerts automatically.
import './lib/server/mqtt';

export const handle: Handle = async ({ event, resolve }) => {
	return resolve(event);
};
