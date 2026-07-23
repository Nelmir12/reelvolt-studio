CREATE TABLE `reels` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`message_id` text NOT NULL,
	`sender_id` text NOT NULL,
	`source_url` text NOT NULL,
	`storage_key` text,
	`filename` text,
	`content_type` text,
	`size_bytes` integer,
	`status` text DEFAULT 'queued' NOT NULL,
	`error` text,
	`created_at` text DEFAULT 'CURRENT_TIMESTAMP' NOT NULL,
	`completed_at` text
);
--> statement-breakpoint
CREATE UNIQUE INDEX `reels_message_id_unique` ON `reels` (`message_id`);