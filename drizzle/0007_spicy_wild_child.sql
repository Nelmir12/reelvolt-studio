CREATE TABLE `reel_insight_snapshots` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`reel_id` integer NOT NULL,
	`captured_date` text NOT NULL,
	`views` integer DEFAULT 0 NOT NULL,
	`reach` integer DEFAULT 0 NOT NULL,
	`total_interactions` integer DEFAULT 0 NOT NULL,
	`shares` integer DEFAULT 0 NOT NULL,
	`saved` integer DEFAULT 0 NOT NULL,
	`captured_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	FOREIGN KEY (`reel_id`) REFERENCES `reels`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `reel_insight_snapshots_day_idx` ON `reel_insight_snapshots` (`reel_id`,`captured_date`);--> statement-breakpoint
CREATE INDEX `reel_insight_snapshots_reel_idx` ON `reel_insight_snapshots` (`reel_id`,`captured_at`);--> statement-breakpoint
CREATE TABLE `reel_insights` (
	`reel_id` integer PRIMARY KEY NOT NULL,
	`views` integer DEFAULT 0 NOT NULL,
	`reach` integer DEFAULT 0 NOT NULL,
	`likes` integer DEFAULT 0 NOT NULL,
	`comments` integer DEFAULT 0 NOT NULL,
	`saved` integer DEFAULT 0 NOT NULL,
	`shares` integer DEFAULT 0 NOT NULL,
	`total_interactions` integer DEFAULT 0 NOT NULL,
	`average_watch_time_ms` integer DEFAULT 0 NOT NULL,
	`total_watch_time_ms` integer DEFAULT 0 NOT NULL,
	`last_error` text,
	`updated_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	FOREIGN KEY (`reel_id`) REFERENCES `reels`(`id`) ON UPDATE no action ON DELETE cascade
);
