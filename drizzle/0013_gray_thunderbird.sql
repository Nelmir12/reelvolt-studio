CREATE TABLE `shortcut_access` (
	`id` integer PRIMARY KEY NOT NULL,
	`token_hash` text NOT NULL,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`last_used_at` text,
	`revoked_at` text
);
