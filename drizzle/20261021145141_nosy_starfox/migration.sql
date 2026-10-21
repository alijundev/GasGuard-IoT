CREATE TABLE `gas_logs` (
	`id` integer PRIMARY KEY AUTOINCREMENT,
	`adc_value` integer NOT NULL,
	`status` text NOT NULL,
	`created_at` text NOT NULL
);
