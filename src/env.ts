import { defineEnvVars } from '@sveltejs/kit/env';

export const variables = defineEnvVars({
	DB_FILE_NAME: { description: 'Path to the SQLite database file.' },
	MQTT_BROKER_URL: { description: 'WebSocket URL of the MQTT broker.' },
	MQTT_TOPIC: { description: 'MQTT topic the ESP32 publishes sensor data to.' },
	TELEGRAM_BOT_TOKEN: { description: 'Telegram Bot API token for alert notifications.' },
	TELEGRAM_CHAT_ID: { description: 'Telegram chat/group ID to send alerts to.' }
});
