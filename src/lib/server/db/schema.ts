import { index, integer, sqliteTable, text } from 'drizzle-orm/sqlite-core';

/**
 * Logs every gas sensor reading received from the ESP32 via MQTT.
 *
 * ESP32 payload: { "adc": number, "status": "NORMAL" | "PERINGATAN" }
 */
export const gasLogs = sqliteTable(
	'gas_logs',
	{
		id: integer('id').primaryKey({ autoIncrement: true }),

		/** Raw ADC value from the MQ-2 sensor (0–4095 for ESP32 12-bit ADC). */
		adcValue: integer('adc_value').notNull(),

		/** Status string from the ESP32: "NORMAL" or "PERINGATAN". */
		status: text('status', { enum: ['NORMAL', 'PERINGATAN'] }).notNull(),

		/** ISO 8601 timestamp of when the server received this reading. */
		createdAt: text('created_at')
			.notNull()
			.$defaultFn(() => new Date().toISOString())
	},
	(table) => [index('gas_logs_created_at_idx').on(table.createdAt)]
);
