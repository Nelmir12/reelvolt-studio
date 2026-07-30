CREATE INDEX IF NOT EXISTS `reels_publish_status_idx` ON `reels` (`publish_status`);--> statement-breakpoint
CREATE INDEX IF NOT EXISTS `reels_schedule_idx` ON `reels` (`publish_status`,`scheduled_for`);
