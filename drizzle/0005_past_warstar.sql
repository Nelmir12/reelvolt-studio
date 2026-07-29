ALTER TABLE `reels` ADD `publication_mode` text DEFAULT 'approval' NOT NULL;--> statement-breakpoint
ALTER TABLE `reels` ADD `share_to_feed` integer DEFAULT 1 NOT NULL;--> statement-breakpoint
ALTER TABLE `reels` ADD `caption` text;--> statement-breakpoint
ALTER TABLE `reels` ADD `publish_status` text DEFAULT 'not_requested' NOT NULL;--> statement-breakpoint
ALTER TABLE `reels` ADD `publish_error` text;--> statement-breakpoint
ALTER TABLE `reels` ADD `instagram_container_id` text;--> statement-breakpoint
ALTER TABLE `reels` ADD `instagram_media_id` text;--> statement-breakpoint
ALTER TABLE `reels` ADD `instagram_permalink` text;--> statement-breakpoint
ALTER TABLE `reels` ADD `publish_requested_at` text;--> statement-breakpoint
ALTER TABLE `reels` ADD `published_at` text;