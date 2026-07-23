PRAGMA foreign_keys=OFF;--> statement-breakpoint
CREATE TABLE `__new_reels` (
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
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`completed_at` text
);
--> statement-breakpoint
INSERT INTO `__new_reels`("id", "message_id", "sender_id", "source_url", "storage_key", "filename", "content_type", "size_bytes", "status", "error", "created_at", "completed_at") SELECT "id", "message_id", "sender_id", "source_url", "storage_key", "filename", "content_type", "size_bytes", "status", "error", "created_at", "completed_at" FROM `reels`;--> statement-breakpoint
DROP TABLE `reels`;--> statement-breakpoint
ALTER TABLE `__new_reels` RENAME TO `reels`;--> statement-breakpoint
PRAGMA foreign_keys=ON;--> statement-breakpoint
CREATE UNIQUE INDEX `reels_message_id_unique` ON `reels` (`message_id`);