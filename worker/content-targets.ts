// Historical schema only. No OAuth, upload, executor or analytics runs for YouTube.
export interface ContentEnv {
  DB: D1Database;
  VIDEOS: R2Bucket;
  PUBLIC_BASE_URL?: string;
  GITHUB_ACTIONS_TOKEN?: string;
  GITHUB_REPOSITORY?: string;
  // Compatibility for the authenticated Reel downloader callback.
  YOUTUBE_WORKER_SECRET?: string;
}

export type ContentTargetInput = {
  instagramEnabled: boolean;
  youtubeEnabled: boolean;
  rightsBasis: "owned" | "licensed";
  context: string;
  madeForKids: boolean;
  containsSyntheticMedia: boolean;
  paidProductPlacement: boolean;
};

const CREATE_YOUTUBE_AUTH = `CREATE TABLE IF NOT EXISTS youtube_auth (
  id INTEGER PRIMARY KEY CHECK (id = 1),
  refresh_token_cipher TEXT NOT NULL,
  channel_id TEXT NOT NULL,
  channel_title TEXT NOT NULL,
  scopes TEXT NOT NULL,
  connected_by TEXT NOT NULL,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
)`;
const CREATE_OAUTH_STATES = `CREATE TABLE IF NOT EXISTS oauth_states (
  state TEXT PRIMARY KEY,
  provider TEXT NOT NULL,
  code_verifier TEXT NOT NULL,
  user_email TEXT NOT NULL,
  expires_at INTEGER NOT NULL,
  used_at TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
)`;
const CREATE_OAUTH_STATES_INDEX =
  "CREATE INDEX IF NOT EXISTS oauth_states_expiry_idx ON oauth_states (provider, expires_at)";
const CREATE_CONTENT_REVIEWS = `CREATE TABLE IF NOT EXISTS content_reviews (
  reel_id INTEGER PRIMARY KEY,
  instagram_enabled INTEGER NOT NULL DEFAULT 1,
  youtube_enabled INTEGER NOT NULL DEFAULT 0,
  rights_basis TEXT NOT NULL DEFAULT 'owned',
  context TEXT,
  made_for_kids INTEGER NOT NULL DEFAULT 0,
  contains_synthetic_media INTEGER NOT NULL DEFAULT 0,
  paid_product_placement INTEGER NOT NULL DEFAULT 0,
  source_caption TEXT,
  transcript TEXT,
  content_fingerprint TEXT,
  moderation_status TEXT NOT NULL DEFAULT 'pending',
  moderation_reasons TEXT,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (reel_id) REFERENCES reels(id) ON DELETE CASCADE
)`;
const CREATE_YOUTUBE_PUBLICATIONS = `CREATE TABLE IF NOT EXISTS youtube_publications (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  reel_id INTEGER NOT NULL UNIQUE,
  status TEXT NOT NULL DEFAULT 'awaiting_approval',
  error TEXT,
  title TEXT,
  description TEXT,
  tags_json TEXT,
  video_id TEXT UNIQUE,
  video_url TEXT,
  studio_url TEXT,
  privacy_status TEXT NOT NULL DEFAULT 'private',
  upload_session_url TEXT,
  bytes_uploaded INTEGER NOT NULL DEFAULT 0,
  attempt_count INTEGER NOT NULL DEFAULT 0,
  next_attempt_at TEXT,
  lease_token TEXT,
  lease_expires_at TEXT,
  worker_heartbeat_at TEXT,
  duration_ms INTEGER,
  width_pixels INTEGER,
  height_pixels INTEGER,
  codec TEXT,
  has_audio INTEGER,
  warning_long_claim INTEGER NOT NULL DEFAULT 0,
  technical_eligible INTEGER NOT NULL DEFAULT 0,
  checks_confirmed_at TEXT,
  requested_at TEXT,
  uploaded_at TEXT,
  published_at TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (reel_id) REFERENCES reels(id) ON DELETE CASCADE
)`;
const CREATE_YOUTUBE_PUBLICATIONS_QUEUE_INDEX =
  "CREATE INDEX IF NOT EXISTS youtube_publications_queue_idx ON youtube_publications (status, next_attempt_at, lease_expires_at)";
const CREATE_YOUTUBE_INSIGHTS = `CREATE TABLE IF NOT EXISTS youtube_insights (
  reel_id INTEGER PRIMARY KEY,
  views INTEGER NOT NULL DEFAULT 0,
  engaged_views INTEGER NOT NULL DEFAULT 0,
  likes INTEGER NOT NULL DEFAULT 0,
  comments INTEGER NOT NULL DEFAULT 0,
  shares INTEGER NOT NULL DEFAULT 0,
  subscribers_gained INTEGER NOT NULL DEFAULT 0,
  average_view_duration_ms INTEGER NOT NULL DEFAULT 0,
  average_view_percentage_bps INTEGER NOT NULL DEFAULT 0,
  estimated_minutes_watched INTEGER NOT NULL DEFAULT 0,
  last_error TEXT,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (reel_id) REFERENCES reels(id) ON DELETE CASCADE
)`;
const CREATE_YOUTUBE_INSIGHT_SNAPSHOTS = `CREATE TABLE IF NOT EXISTS youtube_insight_snapshots (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  reel_id INTEGER NOT NULL,
  captured_date TEXT NOT NULL,
  milestone TEXT,
  captured_minutes INTEGER,
  views INTEGER NOT NULL DEFAULT 0,
  engaged_views INTEGER NOT NULL DEFAULT 0,
  likes INTEGER NOT NULL DEFAULT 0,
  comments INTEGER NOT NULL DEFAULT 0,
  shares INTEGER NOT NULL DEFAULT 0,
  subscribers_gained INTEGER NOT NULL DEFAULT 0,
  average_view_duration_ms INTEGER NOT NULL DEFAULT 0,
  average_view_percentage_bps INTEGER NOT NULL DEFAULT 0,
  captured_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (reel_id) REFERENCES reels(id) ON DELETE CASCADE
)`;
const CREATE_YOUTUBE_INSIGHTS_DAY_INDEX =
  "CREATE UNIQUE INDEX IF NOT EXISTS youtube_insight_snapshots_day_idx ON youtube_insight_snapshots (reel_id, captured_date)";
const CREATE_YOUTUBE_INSIGHTS_MILESTONE_INDEX =
  "CREATE UNIQUE INDEX IF NOT EXISTS youtube_insight_snapshots_milestone_idx ON youtube_insight_snapshots (reel_id, milestone)";
const CREATE_YOUTUBE_INSIGHTS_REEL_INDEX =
  "CREATE INDEX IF NOT EXISTS youtube_insight_snapshots_reel_idx ON youtube_insight_snapshots (reel_id, captured_at)";

export const YOUTUBE_SCHEMA_STATEMENTS = [
  CREATE_YOUTUBE_AUTH,
  CREATE_OAUTH_STATES,
  CREATE_OAUTH_STATES_INDEX,
  CREATE_CONTENT_REVIEWS,
  CREATE_YOUTUBE_PUBLICATIONS,
  CREATE_YOUTUBE_PUBLICATIONS_QUEUE_INDEX,
  CREATE_YOUTUBE_INSIGHTS,
  CREATE_YOUTUBE_INSIGHT_SNAPSHOTS,
  CREATE_YOUTUBE_INSIGHTS_DAY_INDEX,
  CREATE_YOUTUBE_INSIGHTS_MILESTONE_INDEX,
  CREATE_YOUTUBE_INSIGHTS_REEL_INDEX,
];

export async function createContentTargets(
  reelId: number,
  input: ContentTargetInput,
  env: ContentEnv,
) {
  await env.DB.prepare(`INSERT INTO content_reviews
    (reel_id, instagram_enabled, youtube_enabled, rights_basis, context, made_for_kids,
      contains_synthetic_media, paid_product_placement, moderation_status, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'pending', CURRENT_TIMESTAMP)
    ON CONFLICT(reel_id) DO UPDATE SET instagram_enabled = excluded.instagram_enabled,
      youtube_enabled = excluded.youtube_enabled, rights_basis = excluded.rights_basis,
      context = excluded.context, made_for_kids = excluded.made_for_kids,
      contains_synthetic_media = excluded.contains_synthetic_media,
      paid_product_placement = excluded.paid_product_placement, updated_at = CURRENT_TIMESTAMP`)
    .bind(
      reelId,
      input.instagramEnabled ? 1 : 0,
      0,
      input.rightsBasis,
      input.context || null,
      input.madeForKids ? 1 : 0,
      input.containsSyntheticMedia ? 1 : 0,
      input.paidProductPlacement ? 1 : 0,
    )
    .run();
}
export async function publicationDestinations(reelId: number, env: ContentEnv) {
  const row = await env.DB.prepare(
    "SELECT instagram_enabled, youtube_enabled FROM content_reviews WHERE reel_id = ?",
  ).bind(reelId).first<{ instagram_enabled: number; youtube_enabled: number }>();
  return {
    instagram: row ? Boolean(row.instagram_enabled) : true,
    youtube: false,
  };
}
