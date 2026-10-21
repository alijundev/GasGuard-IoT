/**
 * MQTT Subscriber Service
 *
 * Connects to broker.hivemq.com:1883, subscribes to iot/gas_kelompok2/data,
 * inserts every reading into SQLite via Drizzle ORM, and triggers a Telegram
 * alert on PERINGATAN status (ADC >= 2000) with a 30-second cooldown.
 */

import mqtt from 'mqtt';
import { db } from './db';
import { gasLogs } from './db/schema';
import { broadcast, type GasReading } from './events';
import {
	MQTT_BROKER_URL,
	MQTT_TOPIC,
	TELEGRAM_BOT_TOKEN,
	TELEGRAM_CHAT_ID
} from '$app/env/private';

// ── Telegram cooldown ────────────────────────────────────────────
const TELEGRAM_COOLDOWN_MS = 30_000; // 30 seconds
let lastTelegramSentAt = 0;

/**
 * Format timestamp into a clean, human-readable Indonesian format (WITA, UTC+8).
 * Example: "Kamis, 22 Okt 2026, 00:03:20 WITA"
 */
function formatTelegramTime(isoOrDate: string | Date): string {
	try {
		const d = typeof isoOrDate === 'string' ? new Date(isoOrDate) : isoOrDate;
		if (isNaN(d.getTime())) return String(isoOrDate);

		return (
			new Intl.DateTimeFormat('id-ID', {
				timeZone: 'Asia/Makassar', // WITA for Kendari/UHO
				weekday: 'long',
				day: 'numeric',
				month: 'short',
				year: 'numeric',
				hour: '2-digit',
				minute: '2-digit',
				second: '2-digit',
				hour12: false
			}).format(d) + ' WITA'
		);
	} catch {
		return String(isoOrDate);
	}
}

/**
 * Send a Telegram alert message using HTML parse mode.
 * Respects a 30-second cooldown.
 * Silently skips if bot token or chat ID is not configured.
 */
async function sendTelegramAlert(adcValue: number, timestamp: string): Promise<void> {
	if (!TELEGRAM_BOT_TOKEN || !TELEGRAM_CHAT_ID) {
		console.warn('[Telegram] BOT_TOKEN or CHAT_ID not configured — skipping notification.');
		return;
	}

	const now = Date.now();
	if (now - lastTelegramSentAt < TELEGRAM_COOLDOWN_MS) {
		console.log('[Telegram] Cooldown active — skipping notification.');
		return;
	}

	const readableTime = formatTelegramTime(timestamp);
	const percentage = ((adcValue / 4041) * 100).toFixed(1);

	const html = [
		'<b>🚨 GAS LEAKAGE DETECTED!</b>',
		'',
		`📊 <b>ADC Level:</b> <code>${adcValue} / 4041</code> (${percentage}% FS)`,
		`⚠️ <b>Status:</b> <b>PERINGATAN (BAHAYA)</b>`,
		`🕐 <b>Waktu:</b> <code>${readableTime}</code>`,
		`📍 <b>Sistem:</b> GasGuard IoT`
	].join('\n');

	try {
		const url = `https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/sendMessage`;
		const res = await fetch(url, {
			method: 'POST',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify({
				chat_id: TELEGRAM_CHAT_ID,
				text: html,
				parse_mode: 'HTML'
			})
		});

		if (res.ok) {
			lastTelegramSentAt = now;
			console.log('[Telegram] Alert sent successfully.');
		} else {
			const body = await res.text();
			console.error(`[Telegram] API error ${res.status}: ${body}`);
		}
	} catch (err) {
		console.error('[Telegram] Failed to send alert:', err);
	}
}

// ── MQTT connection ──────────────────────────────────────────────

function getBrokerUrl(): string {
	const raw = (MQTT_BROKER_URL || 'broker.hivemq.com').trim();
	if (raw.startsWith('mqtt://') || raw.startsWith('ws://') || raw.startsWith('wss://')) {
		return raw;
	}
	if (raw.includes(':')) {
		return `mqtt://${raw}`;
	}
	return `mqtt://${raw}:1883`;
}

const brokerUrl = getBrokerUrl();
const topic = MQTT_TOPIC || 'iot/gas_kelompok2/data';

// Global singleton to prevent duplicate connections during Vite HMR / SSR reloads
type GlobalWithMqtt = typeof globalThis & {
	__gasguardMqtt?: mqtt.MqttClient;
};

const g = globalThis as GlobalWithMqtt;

if (g.__gasguardMqtt) {
	console.log('[MQTT] Closing previous HMR connection...');
	try {
		g.__gasguardMqtt.end(true);
	} catch (e) {
		console.error('[MQTT] Error closing previous connection:', e);
	}
}

// Generate unique client ID to prevent broker collisions
const clientId = `gasguard_srv_${Math.random().toString(36).substring(2, 9)}`;

console.log(`[MQTT] Connecting to ${brokerUrl} (client: ${clientId}) ...`);

const client = mqtt.connect(brokerUrl, {
	clientId,
	clean: true,
	keepalive: 60,
	reconnectPeriod: 5000,
	connectTimeout: 15_000
});

g.__gasguardMqtt = client;

client.on('connect', () => {
	console.log(`[MQTT] Connected to broker: ${brokerUrl}`);
	client.subscribe(topic, { qos: 0 }, (err) => {
		if (err) {
			console.error(`[MQTT] Subscribe error:`, err);
		} else {
			console.log(`[MQTT] Subscribed to topic: ${topic}`);
		}
	});
});

client.on('message', async (_topic, payload) => {
	try {
		const raw = payload.toString();
		const data = JSON.parse(raw) as { adc: number; status: string };

		// Validate payload
		if (typeof data.adc !== 'number' || !['NORMAL', 'PERINGATAN'].includes(data.status)) {
			console.warn(`[MQTT] Invalid payload — skipping:`, raw);
			return;
		}

		const status = data.status as 'NORMAL' | 'PERINGATAN';
		const now = new Date().toISOString();

		// Insert into SQLite via Drizzle ORM
		db.insert(gasLogs).values({ adcValue: data.adc, status, createdAt: now }).run();

		console.log(`[MQTT] Logged: adc=${data.adc} status=${status}`);

		// Broadcast to SSE clients
		const reading: GasReading = { adcValue: data.adc, status, createdAt: now };
		broadcast(reading);

		// Trigger Telegram alert on PERINGATAN (ADC >= 2000)
		if (status === 'PERINGATAN' || data.adc >= 2000) {
			await sendTelegramAlert(data.adc, now);
		}
	} catch (err) {
		console.error('[MQTT] Error processing message:', err);
	}
});

client.on('error', (err) => {
	console.error('[MQTT] Connection error:', err.message);
});

client.on('reconnect', () => {
	console.log('[MQTT] Reconnecting...');
});

client.on('close', () => {
	console.log('[MQTT] Connection closed.');
});

export { client };
