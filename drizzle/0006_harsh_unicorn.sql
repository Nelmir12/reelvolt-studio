CREATE TABLE `instagram_auth` (
	`id` integer PRIMARY KEY NOT NULL,
	`token_cipher` text NOT NULL,
	`user_id` text NOT NULL,
	`expires_at` integer NOT NULL,
	`updated_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL
);
