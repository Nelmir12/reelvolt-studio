CREATE TABLE `authorized_senders` (
	`sender_id` text PRIMARY KEY NOT NULL,
	`paired_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL
);
