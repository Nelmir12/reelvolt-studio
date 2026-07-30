CREATE TABLE `content_reviews` (
	`reel_id` integer PRIMARY KEY NOT NULL,
	`instagram_enabled` integer DEFAULT 1 NOT NULL,
	`youtube_enabled` integer DEFAULT 0 NOT NULL,
	`rights_basis` text DEFAULT 'owned' NOT NULL,
	`context` text,
	`made_for_kids` integer DEFAULT 0 NOT NULL,
	`contains_synthetic_media` integer DEFAULT 0 NOT NULL,
	`paid_product_placement` integer DEFAULT 0 NOT NULL,
	`source_caption` text,
	`transcript` text,
	`content_fingerprint` text,
	`moderation_status` text DEFAULT 'pending' NOT NULL,
	`moderation_reasons` text,
	`updated_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	FOREIGN KEY (`reel_id`) REFERENCES `reels`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `oauth_states` (
	`state` text PRIMARY KEY NOT NULL,
	`provider` text NOT NULL,
	`code_verifier` text NOT NULL,
	`user_email` text NOT NULL,
	`expires_at` integer NOT NULL,
	`used_at` text,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL
);
--> statement-breakpoint
CREATE INDEX `oauth_states_expiry_idx` ON `oauth_states` (`provider`,`expires_at`);--> statement-breakpoint
CREATE TABLE `youtube_auth` (
	`id` integer PRIMARY KEY NOT NULL,
	`refresh_token_cipher` text NOT NULL,
	`channel_id` text NOT NULL,
	`channel_title` text NOT NULL,
	`scopes` text NOT NULL,
	`connected_by` text NOT NULL,
	`updated_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL
);
--> statement-breakpoint
CREATE TABLE `youtube_insight_snapshots` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`reel_id` integer NOT NULL,
	`captured_date` text NOT NULL,
	`milestone` text,
	`captured_minutes` integer,
	`views` integer DEFAULT 0 NOT NULL,
	`engaged_views` integer DEFAULT 0 NOT NULL,
	`likes` integer DEFAULT 0 NOT NULL,
	`comments` integer DEFAULT 0 NOT NULL,
	`shares` integer DEFAULT 0 NOT NULL,
	`subscribers_gained` integer DEFAULT 0 NOT NULL,
	`average_view_duration_ms` integer DEFAULT 0 NOT NULL,
	`average_view_percentage_bps` integer DEFAULT 0 NOT NULL,
	`captured_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	FOREIGN KEY (`reel_id`) REFERENCES `reels`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `youtube_insight_snapshots_day_idx` ON `youtube_insight_snapshots` (`reel_id`,`captured_date`);--> statement-breakpoint
CREATE UNIQUE INDEX `youtube_insight_snapshots_milestone_idx` ON `youtube_insight_snapshots` (`reel_id`,`milestone`);--> statement-breakpoint
CREATE INDEX `youtube_insight_snapshots_reel_idx` ON `youtube_insight_snapshots` (`reel_id`,`captured_at`);--> statement-breakpoint
CREATE TABLE `youtube_insights` (
	`reel_id` integer PRIMARY KEY NOT NULL,
	`views` integer DEFAULT 0 NOT NULL,
	`engaged_views` integer DEFAULT 0 NOT NULL,
	`likes` integer DEFAULT 0 NOT NULL,
	`comments` integer DEFAULT 0 NOT NULL,
	`shares` integer DEFAULT 0 NOT NULL,
	`subscribers_gained` integer DEFAULT 0 NOT NULL,
	`average_view_duration_ms` integer DEFAULT 0 NOT NULL,
	`average_view_percentage_bps` integer DEFAULT 0 NOT NULL,
	`estimated_minutes_watched` integer DEFAULT 0 NOT NULL,
	`last_error` text,
	`updated_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	FOREIGN KEY (`reel_id`) REFERENCES `reels`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `youtube_publications` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`reel_id` integer NOT NULL,
	`status` text DEFAULT 'awaiting_approval' NOT NULL,
	`error` text,
	`title` text,
	`description` text,
	`tags_json` text,
	`video_id` text,
	`video_url` text,
	`studio_url` text,
	`privacy_status` text DEFAULT 'private' NOT NULL,
	`upload_session_url` text,
	`bytes_uploaded` integer DEFAULT 0 NOT NULL,
	`attempt_count` integer DEFAULT 0 NOT NULL,
	`next_attempt_at` text,
	`lease_token` text,
	`lease_expires_at` text,
	`worker_heartbeat_at` text,
	`duration_ms` integer,
	`width_pixels` integer,
	`height_pixels` integer,
	`codec` text,
	`has_audio` integer,
	`warning_long_claim` integer DEFAULT 0 NOT NULL,
	`technical_eligible` integer DEFAULT 0 NOT NULL,
	`checks_confirmed_at` text,
	`requested_at` text,
	`uploaded_at` text,
	`published_at` text,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`updated_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	FOREIGN KEY (`reel_id`) REFERENCES `reels`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `youtube_publications_reel_idx` ON `youtube_publications` (`reel_id`);--> statement-breakpoint
CREATE UNIQUE INDEX `youtube_publications_video_idx` ON `youtube_publications` (`video_id`);--> statement-breakpoint
CREATE INDEX `youtube_publications_queue_idx` ON `youtube_publications` (`status`,`next_attempt_at`,`lease_expires_at`);--> statement-breakpoint
ALTER TABLE `reel_insight_snapshots` ADD `follows` integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE `reel_insight_snapshots` ADD `replays` integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE `reel_insight_snapshots` ADD `average_watch_time_ms` integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE `reel_insight_snapshots` ADD `skip_rate_bps` integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE `reel_insight_snapshots` ADD `milestone` text;--> statement-breakpoint
ALTER TABLE `reel_insight_snapshots` ADD `captured_minutes` integer;--> statement-breakpoint
CREATE UNIQUE INDEX `reel_insight_snapshots_milestone_idx` ON `reel_insight_snapshots` (`reel_id`,`milestone`);--> statement-breakpoint
ALTER TABLE `reel_insights` ADD `follows` integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE `reel_insights` ADD `replays` integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE `reel_insights` ADD `skip_rate_bps` integer DEFAULT 0 NOT NULL;