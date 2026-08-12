CREATE TABLE `instagram_insight_sync` (
	`id` integer PRIMARY KEY NOT NULL,
	`status` text DEFAULT 'idle' NOT NULL,
	`started_at` text,
	`completed_at` text,
	`last_error` text,
	`total_targets` integer DEFAULT 0 NOT NULL,
	`updated_targets` integer DEFAULT 0 NOT NULL,
	`updated_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL
);
