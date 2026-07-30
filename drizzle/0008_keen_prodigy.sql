CREATE TABLE `studio_settings` (
	`id` integer PRIMARY KEY NOT NULL,
	`caption_enabled` integer DEFAULT 1 NOT NULL,
	`default_caption` text DEFAULT '' NOT NULL,
	`cover_mode` text DEFAULT 'fixed' NOT NULL,
	`fixed_cover_key` text,
	`fixed_cover_content_type` text,
	`auto_publish_enabled` integer DEFAULT 0 NOT NULL,
	`publish_interval_minutes` integer DEFAULT 60 NOT NULL,
	`updated_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL
);
--> statement-breakpoint
ALTER TABLE `reels` ADD `caption_enabled` integer DEFAULT 1 NOT NULL;--> statement-breakpoint
ALTER TABLE `reels` ADD `cover_mode` text DEFAULT 'fixed' NOT NULL;--> statement-breakpoint
ALTER TABLE `reels` ADD `cover_key` text;--> statement-breakpoint
ALTER TABLE `reels` ADD `approved_at` text;--> statement-breakpoint
ALTER TABLE `reels` ADD `scheduled_for` text;