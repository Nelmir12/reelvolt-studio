ALTER TABLE `reels` ADD `rules` text;--> statement-breakpoint
ALTER TABLE `reels` ADD `telegram_chat_id` text;--> statement-breakpoint
ALTER TABLE `reels` ADD `notion_page_id` text;--> statement-breakpoint
ALTER TABLE `reels` ADD `public_token` text;--> statement-breakpoint
CREATE UNIQUE INDEX `reels_public_token_unique` ON `reels` (`public_token`);