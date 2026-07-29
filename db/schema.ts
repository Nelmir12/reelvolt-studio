import { index, integer, sqliteTable, text, uniqueIndex } from "drizzle-orm/sqlite-core";
import { sql } from "drizzle-orm";

export const reels = sqliteTable("reels", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  messageId: text("message_id").notNull().unique(),
  senderId: text("sender_id").notNull(),
  sourceUrl: text("source_url").notNull(),
  rules: text("rules"),
  sourceAccount: text("source_account"),
  rightsConfirmed: integer("rights_confirmed").notNull().default(0),
  telegramChatId: text("telegram_chat_id"),
  notionPageId: text("notion_page_id"),
  publicToken: text("public_token").unique(),
  storageKey: text("storage_key"),
  filename: text("filename"),
  contentType: text("content_type"),
  sizeBytes: integer("size_bytes"),
  status: text("status").notNull().default("queued"),
  error: text("error"),
  publicationMode: text("publication_mode").notNull().default("approval"),
  shareToFeed: integer("share_to_feed").notNull().default(1),
  caption: text("caption"),
  publishStatus: text("publish_status").notNull().default("not_requested"),
  publishError: text("publish_error"),
  instagramContainerId: text("instagram_container_id"),
  instagramMediaId: text("instagram_media_id"),
  instagramPermalink: text("instagram_permalink"),
  publishRequestedAt: text("publish_requested_at"),
  publishedAt: text("published_at"),
  createdAt: text("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
  completedAt: text("completed_at"),
});

export const authorizedSenders = sqliteTable("authorized_senders", {
  senderId: text("sender_id").primaryKey(),
  pairedAt: text("paired_at").notNull().default(sql`CURRENT_TIMESTAMP`),
});

export const instagramAuth = sqliteTable("instagram_auth", {
  id: integer("id").primaryKey(),
  tokenCipher: text("token_cipher").notNull(),
  userId: text("user_id").notNull(),
  expiresAt: integer("expires_at").notNull(),
  updatedAt: text("updated_at").notNull().default(sql`CURRENT_TIMESTAMP`),
});

export const reelInsights = sqliteTable("reel_insights", {
  reelId: integer("reel_id").primaryKey().references(() => reels.id, { onDelete: "cascade" }),
  views: integer("views").notNull().default(0),
  reach: integer("reach").notNull().default(0),
  likes: integer("likes").notNull().default(0),
  comments: integer("comments").notNull().default(0),
  saved: integer("saved").notNull().default(0),
  shares: integer("shares").notNull().default(0),
  totalInteractions: integer("total_interactions").notNull().default(0),
  averageWatchTimeMs: integer("average_watch_time_ms").notNull().default(0),
  totalWatchTimeMs: integer("total_watch_time_ms").notNull().default(0),
  lastError: text("last_error"),
  updatedAt: text("updated_at").notNull().default(sql`CURRENT_TIMESTAMP`),
});

export const reelInsightSnapshots = sqliteTable("reel_insight_snapshots", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  reelId: integer("reel_id").notNull().references(() => reels.id, { onDelete: "cascade" }),
  capturedDate: text("captured_date").notNull(),
  views: integer("views").notNull().default(0),
  reach: integer("reach").notNull().default(0),
  totalInteractions: integer("total_interactions").notNull().default(0),
  shares: integer("shares").notNull().default(0),
  saved: integer("saved").notNull().default(0),
  capturedAt: text("captured_at").notNull().default(sql`CURRENT_TIMESTAMP`),
}, (table) => [
  uniqueIndex("reel_insight_snapshots_day_idx").on(table.reelId, table.capturedDate),
  index("reel_insight_snapshots_reel_idx").on(table.reelId, table.capturedAt),
]);
