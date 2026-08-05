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
  captionEnabled: integer("caption_enabled").notNull().default(1),
  coverMode: text("cover_mode").notNull().default("fixed"),
  coverKey: text("cover_key"),
  approvedAt: text("approved_at"),
  scheduledFor: text("scheduled_for"),
  publishStatus: text("publish_status").notNull().default("not_requested"),
  publishError: text("publish_error"),
  instagramContainerId: text("instagram_container_id"),
  instagramMediaId: text("instagram_media_id"),
  instagramPermalink: text("instagram_permalink"),
  publishRequestedAt: text("publish_requested_at"),
  publishedAt: text("published_at"),
  createdAt: text("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
  completedAt: text("completed_at"),
}, (table) => [
  index("reels_publish_status_idx").on(table.publishStatus),
  index("reels_schedule_idx").on(table.publishStatus, table.scheduledFor),
]);

export const studioSettings = sqliteTable("studio_settings", {
  id: integer("id").primaryKey(),
  captionEnabled: integer("caption_enabled").notNull().default(1),
  defaultCaption: text("default_caption").notNull().default(""),
  coverMode: text("cover_mode").notNull().default("fixed"),
  fixedCoverKey: text("fixed_cover_key"),
  fixedCoverContentType: text("fixed_cover_content_type"),
  autoPublishEnabled: integer("auto_publish_enabled").notNull().default(0),
  publishIntervalMinutes: integer("publish_interval_minutes").notNull().default(60),
  updatedAt: text("updated_at").notNull().default(sql`CURRENT_TIMESTAMP`),
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
  follows: integer("follows").notNull().default(0),
  replays: integer("replays").notNull().default(0),
  skipRateBps: integer("skip_rate_bps").notNull().default(0),
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
  follows: integer("follows").notNull().default(0),
  replays: integer("replays").notNull().default(0),
  averageWatchTimeMs: integer("average_watch_time_ms").notNull().default(0),
  skipRateBps: integer("skip_rate_bps").notNull().default(0),
  milestone: text("milestone"),
  capturedMinutes: integer("captured_minutes"),
  capturedAt: text("captured_at").notNull().default(sql`CURRENT_TIMESTAMP`),
}, (table) => [
  uniqueIndex("reel_insight_snapshots_day_idx").on(table.reelId, table.capturedDate),
  uniqueIndex("reel_insight_snapshots_milestone_idx").on(table.reelId, table.milestone),
  index("reel_insight_snapshots_reel_idx").on(table.reelId, table.capturedAt),
]);

export const instagramInsightSync = sqliteTable("instagram_insight_sync", {
  id: integer("id").primaryKey(),
  status: text("status").notNull().default("idle"),
  startedAt: text("started_at"),
  completedAt: text("completed_at"),
  lastError: text("last_error"),
  totalTargets: integer("total_targets").notNull().default(0),
  updatedTargets: integer("updated_targets").notNull().default(0),
  updatedAt: text("updated_at").notNull().default(sql`CURRENT_TIMESTAMP`),
});

export const youtubeAuth = sqliteTable("youtube_auth", {
  id: integer("id").primaryKey(),
  refreshTokenCipher: text("refresh_token_cipher").notNull(),
  channelId: text("channel_id").notNull(),
  channelTitle: text("channel_title").notNull(),
  scopes: text("scopes").notNull(),
  connectedBy: text("connected_by").notNull(),
  updatedAt: text("updated_at").notNull().default(sql`CURRENT_TIMESTAMP`),
});

export const oauthStates = sqliteTable("oauth_states", {
  state: text("state").primaryKey(),
  provider: text("provider").notNull(),
  codeVerifier: text("code_verifier").notNull(),
  userEmail: text("user_email").notNull(),
  expiresAt: integer("expires_at").notNull(),
  usedAt: text("used_at"),
  createdAt: text("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
}, (table) => [
  index("oauth_states_expiry_idx").on(table.provider, table.expiresAt),
]);

export const contentReviews = sqliteTable("content_reviews", {
  reelId: integer("reel_id").primaryKey().references(() => reels.id, { onDelete: "cascade" }),
  instagramEnabled: integer("instagram_enabled").notNull().default(1),
  youtubeEnabled: integer("youtube_enabled").notNull().default(0),
  rightsBasis: text("rights_basis").notNull().default("owned"),
  context: text("context"),
  madeForKids: integer("made_for_kids").notNull().default(0),
  containsSyntheticMedia: integer("contains_synthetic_media").notNull().default(0),
  paidProductPlacement: integer("paid_product_placement").notNull().default(0),
  sourceCaption: text("source_caption"),
  transcript: text("transcript"),
  contentFingerprint: text("content_fingerprint"),
  moderationStatus: text("moderation_status").notNull().default("pending"),
  moderationReasons: text("moderation_reasons"),
  updatedAt: text("updated_at").notNull().default(sql`CURRENT_TIMESTAMP`),
});

export const youtubePublications = sqliteTable("youtube_publications", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  reelId: integer("reel_id").notNull().references(() => reels.id, { onDelete: "cascade" }),
  status: text("status").notNull().default("awaiting_approval"),
  error: text("error"),
  title: text("title"),
  description: text("description"),
  tagsJson: text("tags_json"),
  videoId: text("video_id"),
  videoUrl: text("video_url"),
  studioUrl: text("studio_url"),
  privacyStatus: text("privacy_status").notNull().default("private"),
  uploadSessionUrl: text("upload_session_url"),
  bytesUploaded: integer("bytes_uploaded").notNull().default(0),
  attemptCount: integer("attempt_count").notNull().default(0),
  nextAttemptAt: text("next_attempt_at"),
  leaseToken: text("lease_token"),
  leaseExpiresAt: text("lease_expires_at"),
  workerHeartbeatAt: text("worker_heartbeat_at"),
  durationMs: integer("duration_ms"),
  widthPixels: integer("width_pixels"),
  heightPixels: integer("height_pixels"),
  codec: text("codec"),
  hasAudio: integer("has_audio"),
  warningLongClaim: integer("warning_long_claim").notNull().default(0),
  technicalEligible: integer("technical_eligible").notNull().default(0),
  checksConfirmedAt: text("checks_confirmed_at"),
  requestedAt: text("requested_at"),
  uploadedAt: text("uploaded_at"),
  publishedAt: text("published_at"),
  createdAt: text("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
  updatedAt: text("updated_at").notNull().default(sql`CURRENT_TIMESTAMP`),
}, (table) => [
  uniqueIndex("youtube_publications_reel_idx").on(table.reelId),
  uniqueIndex("youtube_publications_video_idx").on(table.videoId),
  index("youtube_publications_queue_idx").on(table.status, table.nextAttemptAt, table.leaseExpiresAt),
]);

export const youtubeInsights = sqliteTable("youtube_insights", {
  reelId: integer("reel_id").primaryKey().references(() => reels.id, { onDelete: "cascade" }),
  views: integer("views").notNull().default(0),
  engagedViews: integer("engaged_views").notNull().default(0),
  likes: integer("likes").notNull().default(0),
  comments: integer("comments").notNull().default(0),
  shares: integer("shares").notNull().default(0),
  subscribersGained: integer("subscribers_gained").notNull().default(0),
  averageViewDurationMs: integer("average_view_duration_ms").notNull().default(0),
  averageViewPercentageBps: integer("average_view_percentage_bps").notNull().default(0),
  estimatedMinutesWatched: integer("estimated_minutes_watched").notNull().default(0),
  lastError: text("last_error"),
  updatedAt: text("updated_at").notNull().default(sql`CURRENT_TIMESTAMP`),
});

export const youtubeInsightSnapshots = sqliteTable("youtube_insight_snapshots", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  reelId: integer("reel_id").notNull().references(() => reels.id, { onDelete: "cascade" }),
  capturedDate: text("captured_date").notNull(),
  milestone: text("milestone"),
  capturedMinutes: integer("captured_minutes"),
  views: integer("views").notNull().default(0),
  engagedViews: integer("engaged_views").notNull().default(0),
  likes: integer("likes").notNull().default(0),
  comments: integer("comments").notNull().default(0),
  shares: integer("shares").notNull().default(0),
  subscribersGained: integer("subscribers_gained").notNull().default(0),
  averageViewDurationMs: integer("average_view_duration_ms").notNull().default(0),
  averageViewPercentageBps: integer("average_view_percentage_bps").notNull().default(0),
  capturedAt: text("captured_at").notNull().default(sql`CURRENT_TIMESTAMP`),
}, (table) => [
  uniqueIndex("youtube_insight_snapshots_day_idx").on(table.reelId, table.capturedDate),
  uniqueIndex("youtube_insight_snapshots_milestone_idx").on(table.reelId, table.milestone),
  index("youtube_insight_snapshots_reel_idx").on(table.reelId, table.capturedAt),
]);
