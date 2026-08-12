ALTER TABLE `reels` ADD `archived_at` text;--> statement-breakpoint
ALTER TABLE `reels` ADD `media_deleted_at` text;--> statement-breakpoint
CREATE INDEX `reels_active_id_idx` ON `reels` (`archived_at`,`id`);