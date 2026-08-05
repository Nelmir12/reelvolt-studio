import { handleImageOptimization, DEFAULT_DEVICE_SIZES, DEFAULT_IMAGE_SIZES } from "vinext/server/image-optimization";
import handler from "vinext/server/app-router-entry";
import {
  YOUTUBE_SCHEMA_STATEMENTS,
  createContentTargets,
  dispatchYouTubeExecutor,
  handleYouTubeRequest,
  publicationDestinations,
  queueYouTubePublication,
  youtubeConnection,
  youtubeSummaries,
  type ContentTargetInput,
  type YouTubeEnv,
} from "./youtube";

interface Env extends YouTubeEnv {
  ASSETS: Fetcher;
  IMAGES: {
    input(stream: ReadableStream): {
      transform(options: Record<string, unknown>): {
        output(options: { format: string; quality: number }): Promise<{ response(): Response }>;
      };
    };
  };
  ADMIN_TOKEN?: string;
  INBOX_ALLOWED_EMAILS?: string;
  PUBLIC_BASE_URL?: string;
  REEL_RESOLVER_URL?: string;
  REEL_RESOLVER_TOKEN?: string;
  REEL_RESOLVER_AUTH_SCHEME?: string;
  INSTAGRAM_ACCESS_TOKEN?: string;
  INSTAGRAM_ACCESS_TOKEN_EXPIRES_AT?: string;
  INSTAGRAM_USER_ID?: string;
  INSTAGRAM_API_VERSION?: string;
  INSTAGRAM_GRAPH_HOST?: string;
  INSTAGRAM_DIRECT_ALLOWED_USERNAME?: string;
  META_APP_SECRET?: string;
  META_VERIFY_TOKEN?: string;
  PUBLISH_URL_SECRET?: string;
}

interface ExecutionContext {
  waitUntil(promise: Promise<unknown>): void;
  passThroughOnException(): void;
}

type PublicationMode = "download_only" | "approval" | "auto";

type ReelInput = {
  messageId: string;
  senderId: string;
  sourceUrl: string;
  rules?: string;
  sourceAccount?: string;
  rightsConfirmed: boolean;
  publicationMode: PublicationMode;
  shareToFeed: boolean;
  targets: ContentTargetInput;
};

type QueueResult = {
  accepted: boolean;
  id?: number;
  reason?: "duplicate" | "database_error";
};

type ReelRecord = {
  id: number;
  sender_id: string;
  source_url: string;
  rules: string | null;
  source_account: string | null;
  rights_confirmed: number;
  public_token: string | null;
  storage_key: string | null;
  filename: string | null;
  content_type: string | null;
  status: string;
  publication_mode: PublicationMode;
  share_to_feed: number;
  caption: string | null;
  caption_enabled: number;
  cover_mode: CoverMode;
  cover_key: string | null;
  approved_at: string | null;
  scheduled_for: string | null;
  publish_status: string;
  instagram_container_id: string | null;
  publish_requested_at: string | null;
  created_at: string;
};

type CoverMode = "fixed" | "video" | "none";

type StudioSettings = {
  id: number;
  caption_enabled: number;
  default_caption: string;
  cover_mode: CoverMode;
  fixed_cover_key: string | null;
  fixed_cover_content_type: string | null;
  auto_publish_enabled: number;
  publish_interval_minutes: number;
  updated_at: string;
};

type ReelListRow = ReelRecord & {
  size_bytes: number | null;
  error: string | null;
  publish_error: string | null;
  instagram_media_id: string | null;
  instagram_permalink: string | null;
  publish_requested_at: string | null;
  published_at: string | null;
  created_at: string;
  completed_at: string | null;
  instagram_selected: number;
  youtube_selected: number;
  rights_basis: "owned" | "licensed" | null;
  content_context: string | null;
  made_for_kids: number;
  contains_synthetic_media: number;
  paid_product_placement: number;
};

type InstagramCredentials = {
  accessToken: string;
  userId: string;
  expiresAt: number;
};

type InstagramPublishedMedia = {
  id: string;
  caption?: string;
  permalink?: string;
  timestamp?: string;
  media_type?: string;
  media_product_type?: string;
};

type InstagramInsightResult = {
  name: string;
  values?: Array<{ value?: number }>;
  total_value?: { value?: number };
};

type InstagramWebhookMessage = {
  sender?: { id?: string };
  recipient?: { id?: string };
  message?: {
    mid?: string;
    text?: string;
    is_echo?: boolean;
    is_self?: boolean;
    quick_reply?: { payload?: string };
    attachments?: Array<{
      type?: string;
      payload?: Record<string, unknown>;
    }>;
  };
};

type InstagramWebhookPayload = {
  object?: string;
  entry?: Array<{
    id?: string;
    messaging?: InstagramWebhookMessage[];
  }>;
};

type PublishedReelInsightTarget = {
  id: number;
  instagram_media_id: string;
  published_at: string | null;
};

const FIXED_CAPTION = "V arrived at #VogueWorld: Hollywood in unmistakable style, enjoying the live performances while showcasing the effortless elegance he's become known for. Another runway-worthy moment. #Taehyung";
const COVER_PATH = "/reel-cover.jpg";
const PUBLICATION_MODES = new Set<PublicationMode>(["download_only", "approval", "auto"]);
const COVER_MODES = new Set<CoverMode>(["fixed", "video", "none"]);
const DEFAULT_INTERVAL_MINUTES = 60;
const MIN_INTERVAL_MINUTES = 15;
const MAX_INTERVAL_MINUTES = 7 * 24 * 60;
const DIRECT_RIGHTS_PAYLOAD = /^reelvolt:rights:(owned|licensed):(\d+)$/;

const CREATE_REELS = `CREATE TABLE IF NOT EXISTS reels (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  message_id TEXT NOT NULL UNIQUE,
  sender_id TEXT NOT NULL,
  source_url TEXT NOT NULL,
  rules TEXT,
  source_account TEXT,
  rights_confirmed INTEGER NOT NULL DEFAULT 0,
  telegram_chat_id TEXT,
  notion_page_id TEXT,
  public_token TEXT UNIQUE,
  storage_key TEXT,
  filename TEXT,
  content_type TEXT,
  size_bytes INTEGER,
  status TEXT NOT NULL DEFAULT 'queued',
  error TEXT,
  publication_mode TEXT NOT NULL DEFAULT 'approval',
  share_to_feed INTEGER NOT NULL DEFAULT 1,
  caption TEXT,
  caption_enabled INTEGER NOT NULL DEFAULT 1,
  cover_mode TEXT NOT NULL DEFAULT 'fixed',
  cover_key TEXT,
  approved_at TEXT,
  scheduled_for TEXT,
  publish_status TEXT NOT NULL DEFAULT 'not_requested',
  publish_error TEXT,
  instagram_container_id TEXT,
  instagram_media_id TEXT,
  instagram_permalink TEXT,
  publish_requested_at TEXT,
  published_at TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  completed_at TEXT
)`;

const ADDITIONAL_COLUMNS: Record<string, string> = {
  publication_mode: "ALTER TABLE reels ADD COLUMN publication_mode TEXT NOT NULL DEFAULT 'approval'",
  share_to_feed: "ALTER TABLE reels ADD COLUMN share_to_feed INTEGER NOT NULL DEFAULT 1",
  caption: "ALTER TABLE reels ADD COLUMN caption TEXT",
  caption_enabled: "ALTER TABLE reels ADD COLUMN caption_enabled INTEGER NOT NULL DEFAULT 1",
  cover_mode: "ALTER TABLE reels ADD COLUMN cover_mode TEXT NOT NULL DEFAULT 'fixed'",
  cover_key: "ALTER TABLE reels ADD COLUMN cover_key TEXT",
  approved_at: "ALTER TABLE reels ADD COLUMN approved_at TEXT",
  scheduled_for: "ALTER TABLE reels ADD COLUMN scheduled_for TEXT",
  publish_status: "ALTER TABLE reels ADD COLUMN publish_status TEXT NOT NULL DEFAULT 'not_requested'",
  publish_error: "ALTER TABLE reels ADD COLUMN publish_error TEXT",
  instagram_container_id: "ALTER TABLE reels ADD COLUMN instagram_container_id TEXT",
  instagram_media_id: "ALTER TABLE reels ADD COLUMN instagram_media_id TEXT",
  instagram_permalink: "ALTER TABLE reels ADD COLUMN instagram_permalink TEXT",
  publish_requested_at: "ALTER TABLE reels ADD COLUMN publish_requested_at TEXT",
  published_at: "ALTER TABLE reels ADD COLUMN published_at TEXT",
};

const CREATE_REELS_INDEX = "CREATE INDEX IF NOT EXISTS reels_created_at_idx ON reels (created_at DESC)";
const CREATE_REELS_SOURCE_INDEX = "CREATE INDEX IF NOT EXISTS reels_source_url_idx ON reels (source_url)";
const CREATE_REELS_PUBLIC_TOKEN_INDEX = "CREATE UNIQUE INDEX IF NOT EXISTS reels_public_token_idx ON reels (public_token)";
const CREATE_REELS_PUBLISH_INDEX = "CREATE INDEX IF NOT EXISTS reels_publish_status_idx ON reels (publish_status)";
const CREATE_REELS_SCHEDULE_INDEX = "CREATE INDEX IF NOT EXISTS reels_schedule_idx ON reels (publish_status, scheduled_for)";
const CREATE_STUDIO_SETTINGS = `CREATE TABLE IF NOT EXISTS studio_settings (
  id INTEGER PRIMARY KEY CHECK (id = 1),
  caption_enabled INTEGER NOT NULL DEFAULT 1,
  default_caption TEXT NOT NULL DEFAULT '',
  cover_mode TEXT NOT NULL DEFAULT 'fixed',
  fixed_cover_key TEXT,
  fixed_cover_content_type TEXT,
  auto_publish_enabled INTEGER NOT NULL DEFAULT 0,
  publish_interval_minutes INTEGER NOT NULL DEFAULT 60,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
)`;
const CREATE_AUTHORIZED_SENDERS = `CREATE TABLE IF NOT EXISTS authorized_senders (
  sender_id TEXT PRIMARY KEY,
  paired_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
)`;
const CREATE_INSTAGRAM_AUTH = `CREATE TABLE IF NOT EXISTS instagram_auth (
  id INTEGER PRIMARY KEY CHECK (id = 1),
  token_cipher TEXT NOT NULL,
  user_id TEXT NOT NULL,
  expires_at INTEGER NOT NULL,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
)`;
const CREATE_REEL_INSIGHTS = `CREATE TABLE IF NOT EXISTS reel_insights (
  reel_id INTEGER PRIMARY KEY,
  views INTEGER NOT NULL DEFAULT 0,
  reach INTEGER NOT NULL DEFAULT 0,
  likes INTEGER NOT NULL DEFAULT 0,
  comments INTEGER NOT NULL DEFAULT 0,
  saved INTEGER NOT NULL DEFAULT 0,
  shares INTEGER NOT NULL DEFAULT 0,
  total_interactions INTEGER NOT NULL DEFAULT 0,
  average_watch_time_ms INTEGER NOT NULL DEFAULT 0,
  total_watch_time_ms INTEGER NOT NULL DEFAULT 0,
  last_error TEXT,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (reel_id) REFERENCES reels(id) ON DELETE CASCADE
)`;
const CREATE_REEL_INSIGHT_SNAPSHOTS = `CREATE TABLE IF NOT EXISTS reel_insight_snapshots (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  reel_id INTEGER NOT NULL,
  captured_date TEXT NOT NULL,
  views INTEGER NOT NULL DEFAULT 0,
  reach INTEGER NOT NULL DEFAULT 0,
  total_interactions INTEGER NOT NULL DEFAULT 0,
  shares INTEGER NOT NULL DEFAULT 0,
  saved INTEGER NOT NULL DEFAULT 0,
  captured_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (reel_id) REFERENCES reels(id) ON DELETE CASCADE
)`;
const CREATE_REEL_INSIGHTS_DAY_INDEX = "CREATE UNIQUE INDEX IF NOT EXISTS reel_insight_snapshots_day_idx ON reel_insight_snapshots (reel_id, captured_date)";
const CREATE_REEL_INSIGHTS_REEL_INDEX = "CREATE INDEX IF NOT EXISTS reel_insight_snapshots_reel_idx ON reel_insight_snapshots (reel_id, captured_at)";
const REEL_INSIGHT_COLUMNS: Record<string, string> = {
  follows: "ALTER TABLE reel_insights ADD COLUMN follows INTEGER NOT NULL DEFAULT 0",
  replays: "ALTER TABLE reel_insights ADD COLUMN replays INTEGER NOT NULL DEFAULT 0",
  skip_rate_bps: "ALTER TABLE reel_insights ADD COLUMN skip_rate_bps INTEGER NOT NULL DEFAULT 0",
};
const REEL_INSIGHT_SNAPSHOT_COLUMNS: Record<string, string> = {
  follows: "ALTER TABLE reel_insight_snapshots ADD COLUMN follows INTEGER NOT NULL DEFAULT 0",
  replays: "ALTER TABLE reel_insight_snapshots ADD COLUMN replays INTEGER NOT NULL DEFAULT 0",
  average_watch_time_ms: "ALTER TABLE reel_insight_snapshots ADD COLUMN average_watch_time_ms INTEGER NOT NULL DEFAULT 0",
  skip_rate_bps: "ALTER TABLE reel_insight_snapshots ADD COLUMN skip_rate_bps INTEGER NOT NULL DEFAULT 0",
  milestone: "ALTER TABLE reel_insight_snapshots ADD COLUMN milestone TEXT",
  captured_minutes: "ALTER TABLE reel_insight_snapshots ADD COLUMN captured_minutes INTEGER",
};
const CREATE_REEL_INSIGHTS_MILESTONE_INDEX =
  "CREATE UNIQUE INDEX IF NOT EXISTS reel_insight_snapshots_milestone_idx ON reel_insight_snapshots (reel_id, milestone)";
const CREATE_INSTAGRAM_INSIGHT_SYNC = `CREATE TABLE IF NOT EXISTS instagram_insight_sync (
  id INTEGER PRIMARY KEY CHECK (id = 1),
  status TEXT NOT NULL DEFAULT 'idle',
  started_at TEXT,
  completed_at TEXT,
  last_error TEXT,
  total_targets INTEGER NOT NULL DEFAULT 0,
  updated_targets INTEGER NOT NULL DEFAULT 0,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
)`;

function json(data: unknown, init: ResponseInit = {}) {
  const headers = new Headers(init.headers);
  headers.set("content-type", "application/json; charset=utf-8");
  headers.set("cache-control", "no-store");
  headers.set("x-content-type-options", "nosniff");
  return new Response(JSON.stringify(data), { ...init, headers });
}

async function ensureDatabase(env: Env) {
  await env.DB.batch([
    env.DB.prepare(CREATE_REELS),
    env.DB.prepare(CREATE_REELS_INDEX),
    env.DB.prepare(CREATE_REELS_SOURCE_INDEX),
    env.DB.prepare(CREATE_REELS_PUBLIC_TOKEN_INDEX),
    env.DB.prepare(CREATE_STUDIO_SETTINGS),
    env.DB.prepare(CREATE_AUTHORIZED_SENDERS),
    env.DB.prepare(CREATE_INSTAGRAM_AUTH),
    env.DB.prepare(CREATE_REEL_INSIGHTS),
    env.DB.prepare(CREATE_REEL_INSIGHT_SNAPSHOTS),
    env.DB.prepare(CREATE_REEL_INSIGHTS_DAY_INDEX),
    env.DB.prepare(CREATE_REEL_INSIGHTS_REEL_INDEX),
    env.DB.prepare(CREATE_INSTAGRAM_INSIGHT_SYNC),
    ...YOUTUBE_SCHEMA_STATEMENTS.map((statement) => env.DB.prepare(statement)),
  ]);

  const { results } = await env.DB.prepare("PRAGMA table_info(reels)").all<{ name: string }>();
  const existing = new Set(results.map((column) => column.name));
  for (const [name, statement] of Object.entries(ADDITIONAL_COLUMNS)) {
    if (!existing.has(name)) await env.DB.prepare(statement).run();
  }
  const insightInfo = await env.DB.prepare("PRAGMA table_info(reel_insights)").all<{ name: string }>();
  const insightColumns = new Set(insightInfo.results.map((column) => column.name));
  for (const [name, statement] of Object.entries(REEL_INSIGHT_COLUMNS)) {
    if (!insightColumns.has(name)) await env.DB.prepare(statement).run();
  }
  const snapshotInfo = await env.DB.prepare("PRAGMA table_info(reel_insight_snapshots)").all<{ name: string }>();
  const snapshotColumns = new Set(snapshotInfo.results.map((column) => column.name));
  for (const [name, statement] of Object.entries(REEL_INSIGHT_SNAPSHOT_COLUMNS)) {
    if (!snapshotColumns.has(name)) await env.DB.prepare(statement).run();
  }
  await env.DB.batch([
    env.DB.prepare(CREATE_REELS_PUBLISH_INDEX),
    env.DB.prepare(CREATE_REELS_SCHEDULE_INDEX),
    env.DB.prepare(`INSERT OR IGNORE INTO studio_settings
      (id, caption_enabled, default_caption, cover_mode, auto_publish_enabled, publish_interval_minutes)
      VALUES (1, 1, ?, 'fixed', 0, ?)`)
      .bind(FIXED_CAPTION, DEFAULT_INTERVAL_MINUTES),
    env.DB.prepare(`UPDATE reels SET publish_status = 'awaiting_approval'
      WHERE status = 'ready' AND publish_status = 'queued' AND approved_at IS NULL`),
    env.DB.prepare(CREATE_REEL_INSIGHTS_MILESTONE_INDEX),
    env.DB.prepare(`INSERT OR IGNORE INTO instagram_insight_sync
      (id, status, total_targets, updated_targets) VALUES (1, 'idle', 0, 0)`),
  ]);
}

function configuredInboxEmails(env: Env) {
  return env.INBOX_ALLOWED_EMAILS?.split(",")
    .map((email) => email.trim().toLowerCase())
    .filter(Boolean) ?? [];
}

function authenticatedEmail(request: Request) {
  return request.headers.get("oai-authenticated-user-email")?.trim().toLowerCase() ?? "";
}

function validInboxUser(request: Request, env: Env) {
  const email = authenticatedEmail(request);
  if (!email) return false;
  const allowed = configuredInboxEmails(env);
  return allowed.length === 0 || allowed.includes(email);
}

function validAdmin(request: Request, env: Env) {
  if (!env.ADMIN_TOKEN) return false;
  return request.headers.get("authorization") === `Bearer ${env.ADMIN_TOKEN}`;
}

function validWriteOrigin(request: Request) {
  const origin = request.headers.get("origin");
  if (!origin) return true;
  return origin === new URL(request.url).origin;
}

function publicBaseUrl(requestUrl: string, env: Env) {
  return (env.PUBLIC_BASE_URL || new URL(requestUrl).origin).replace(/\/+$/, "");
}

function publicDownloadUrl(baseUrl: string, publicToken: string) {
  return `${baseUrl}/download/${encodeURIComponent(publicToken)}`;
}

function normalizeInstagramUrl(rawUrl: string) {
  try {
    const url = new URL(rawUrl);
    const host = url.hostname.toLowerCase();
    if (host !== "instagram.com" && host !== "www.instagram.com") return rawUrl;
    return `https://www.instagram.com${url.pathname.replace(/\/+$/, "")}/`;
  } catch {
    return rawUrl;
  }
}

function findInstagramUrl(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const match = value.match(/https?:\/\/(?:www\.)?instagram\.com\/(?:reel|reels|p)\/[A-Za-z0-9_-]+[^\s<"]*/i);
  if (!match?.[0]) return null;
  return normalizeInstagramUrl(match[0].replace(/[),.;]+$/, ""));
}

function sanitizeText(value: unknown, maxLength: number) {
  return typeof value === "string" ? value.trim().slice(0, maxLength) : "";
}

function sanitizePublicationMode(value: unknown): PublicationMode {
  return typeof value === "string" && PUBLICATION_MODES.has(value as PublicationMode)
    ? value as PublicationMode
    : "approval";
}

function sanitizeTargets(
  destinations: unknown,
  input: {
    rightsBasis?: unknown;
    context?: unknown;
    madeForKids?: unknown;
    containsSyntheticMedia?: unknown;
    paidProductPlacement?: unknown;
  },
  defaultDestinations: Array<"instagram" | "youtube">,
): ContentTargetInput {
  const requested = Array.isArray(destinations)
    ? destinations.filter((value): value is "instagram" => value === "instagram")
    : defaultDestinations.filter((value): value is "instagram" => value === "instagram");
  return {
    instagramEnabled: requested.includes("instagram"),
    youtubeEnabled: false,
    rightsBasis: input.rightsBasis === "licensed" ? "licensed" : "owned",
    context: sanitizeText(input.context, 800),
    madeForKids: input.madeForKids === true,
    containsSyntheticMedia: input.containsSyntheticMedia === true,
    paidProductPlacement: input.paidProductPlacement === true,
  };
}

function sanitizeCoverMode(value: unknown): CoverMode {
  return typeof value === "string" && COVER_MODES.has(value as CoverMode)
    ? value as CoverMode
    : "fixed";
}

function sanitizeInterval(value: unknown) {
  const parsed = Math.round(Number(value));
  if (!Number.isFinite(parsed)) return DEFAULT_INTERVAL_MINUTES;
  return Math.min(MAX_INTERVAL_MINUTES, Math.max(MIN_INTERVAL_MINUTES, parsed));
}

function sqliteTimestamp(value: number | Date = Date.now()) {
  const date = value instanceof Date ? value : new Date(value);
  return date.toISOString().slice(0, 19).replace("T", " ");
}

async function studioSettings(env: Env) {
  const row = await env.DB.prepare(`SELECT id, caption_enabled, default_caption, cover_mode,
    fixed_cover_key, fixed_cover_content_type, auto_publish_enabled, publish_interval_minutes,
    updated_at FROM studio_settings WHERE id = 1`).first<StudioSettings>();
  if (!row) throw new Error("As preferências do estúdio não estão disponíveis.");
  return {
    ...row,
    cover_mode: sanitizeCoverMode(row.cover_mode),
    publish_interval_minutes: sanitizeInterval(row.publish_interval_minutes),
  };
}

function settingsPayload(settings: StudioSettings, baseUrl: string) {
  return {
    caption_enabled: Boolean(settings.caption_enabled),
    caption: settings.default_caption,
    cover_mode: settings.cover_mode,
    cover_url: settings.fixed_cover_key ? `${baseUrl}/api/studio-settings/cover` : `${baseUrl}${COVER_PATH}`,
    has_custom_cover: Boolean(settings.fixed_cover_key),
    auto_publish_enabled: Boolean(settings.auto_publish_enabled),
    publish_interval_minutes: settings.publish_interval_minutes,
    updated_at: settings.updated_at,
  };
}

function metaConnected(env: Env) {
  return Boolean(
    env.INSTAGRAM_ACCESS_TOKEN
    && env.INSTAGRAM_USER_ID
    && env.INSTAGRAM_API_VERSION
    && env.PUBLISH_URL_SECRET,
  );
}

function metaBaseUrl(env: Env) {
  const host = (env.INSTAGRAM_GRAPH_HOST || "graph.instagram.com").replace(/^https?:\/\//, "").replace(/\/+$/, "");
  return `https://${host}/${env.INSTAGRAM_API_VERSION}`;
}

function sleep(milliseconds: number) {
  return new Promise((resolve) => setTimeout(resolve, milliseconds));
}

function base64Url(bytes: ArrayBuffer) {
  const values = new Uint8Array(bytes);
  let binary = "";
  for (const value of values) binary += String.fromCharCode(value);
  return btoa(binary).replaceAll("+", "-").replaceAll("/", "_").replace(/=+$/, "");
}

function fromBase64Url(value: string) {
  const normalized = value.replaceAll("-", "+").replaceAll("_", "/");
  const padded = normalized.padEnd(Math.ceil(normalized.length / 4) * 4, "=");
  const binary = atob(padded);
  return Uint8Array.from(binary, (character) => character.charCodeAt(0));
}

async function tokenEncryptionKey(secret: string) {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(secret));
  return crypto.subtle.importKey("raw", digest, "AES-GCM", false, ["encrypt", "decrypt"]);
}

async function encryptInstagramToken(token: string, secret: string) {
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const encrypted = new Uint8Array(await crypto.subtle.encrypt(
    { name: "AES-GCM", iv },
    await tokenEncryptionKey(secret),
    new TextEncoder().encode(token),
  ));
  const packed = new Uint8Array(iv.length + encrypted.length);
  packed.set(iv);
  packed.set(encrypted, iv.length);
  return base64Url(packed.buffer);
}

async function decryptInstagramToken(ciphertext: string, secret: string) {
  const packed = fromBase64Url(ciphertext);
  if (packed.length <= 12) throw new Error("Credencial criptografada inválida.");
  const decrypted = await crypto.subtle.decrypt(
    { name: "AES-GCM", iv: packed.slice(0, 12) },
    await tokenEncryptionKey(secret),
    packed.slice(12),
  );
  return new TextDecoder().decode(decrypted);
}

async function saveInstagramCredentials(credentials: InstagramCredentials, env: Env) {
  if (!env.PUBLISH_URL_SECRET) return;
  const tokenCipher = await encryptInstagramToken(credentials.accessToken, env.PUBLISH_URL_SECRET);
  await env.DB.prepare(`INSERT INTO instagram_auth (id, token_cipher, user_id, expires_at, updated_at)
    VALUES (1, ?, ?, ?, CURRENT_TIMESTAMP)
    ON CONFLICT(id) DO UPDATE SET token_cipher = excluded.token_cipher,
      user_id = excluded.user_id, expires_at = excluded.expires_at,
      updated_at = CURRENT_TIMESTAMP`)
    .bind(tokenCipher, credentials.userId, credentials.expiresAt)
    .run();
}

async function instagramCredentials(env: Env): Promise<InstagramCredentials> {
  let accessToken = env.INSTAGRAM_ACCESS_TOKEN || "";
  let userId = env.INSTAGRAM_USER_ID || "";
  let expiresAt = Number(env.INSTAGRAM_ACCESS_TOKEN_EXPIRES_AT || 0);
  let stored = false;

  if (env.PUBLISH_URL_SECRET) {
    const row = await env.DB.prepare(
      "SELECT token_cipher, user_id, expires_at FROM instagram_auth WHERE id = 1",
    ).first<{ token_cipher: string; user_id: string; expires_at: number }>();
    if (row) {
      try {
        accessToken = await decryptInstagramToken(row.token_cipher, env.PUBLISH_URL_SECRET);
        userId = row.user_id;
        expiresAt = Number(row.expires_at || 0);
        stored = true;
      } catch (error) {
        console.warn("A credencial armazenada do Instagram não pôde ser aberta; usando a configuração segura.", error);
      }
    }
  }

  if (!accessToken || !userId) {
    throw new Error("A conta do Instagram ainda não foi conectada.");
  }

  const now = Math.floor(Date.now() / 1000);
  const refreshWindow = 15 * 24 * 60 * 60;
  if (expiresAt > now && expiresAt - now <= refreshWindow) {
    const refreshUrl = new URL("https://graph.instagram.com/refresh_access_token");
    refreshUrl.searchParams.set("grant_type", "ig_refresh_token");
    refreshUrl.searchParams.set("access_token", accessToken);
    const response = await fetch(refreshUrl);
    const result = await response.json() as {
      access_token?: string;
      expires_in?: number;
      error?: { message?: string };
    };
    if (!response.ok || !result.access_token) {
      throw new Error(result.error?.message || "Não foi possível renovar a conexão com o Instagram.");
    }
    accessToken = result.access_token;
    expiresAt = now + Number(result.expires_in || 60 * 24 * 60 * 60);
    await saveInstagramCredentials({ accessToken, userId, expiresAt }, env);
  } else if (!stored && expiresAt > now) {
    await saveInstagramCredentials({ accessToken, userId, expiresAt }, env);
  }

  return { accessToken, userId, expiresAt };
}

async function mediaSignature(reelId: number, expires: number, secret: string) {
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const signature = await crypto.subtle.sign(
    "HMAC",
    key,
    new TextEncoder().encode(`${reelId}.${expires}`),
  );
  return base64Url(signature);
}

async function signedMediaUrl(reelId: number, baseUrl: string, env: Env) {
  if (!env.PUBLISH_URL_SECRET) throw new Error("A assinatura temporária de mídia não está configurada.");
  const expires = Math.floor(Date.now() / 1000) + 60 * 60 * 2;
  const signature = await mediaSignature(reelId, expires, env.PUBLISH_URL_SECRET);
  return `${baseUrl}/publish-media/${reelId}.mp4?expires=${expires}&signature=${encodeURIComponent(signature)}`;
}

async function signedCoverUrl(reelId: number, baseUrl: string, env: Env) {
  if (!env.PUBLISH_URL_SECRET) throw new Error("A assinatura temporária de mídia não está configurada.");
  const expires = Math.floor(Date.now() / 1000) + 60 * 60 * 2;
  const signature = await mediaSignature(reelId, expires, env.PUBLISH_URL_SECRET);
  return `${baseUrl}/publish-cover/${reelId}.jpg?expires=${expires}&signature=${encodeURIComponent(signature)}`;
}

async function validMediaSignature(reelId: number, url: URL, env: Env) {
  if (!env.PUBLISH_URL_SECRET) return false;
  const expires = Number(url.searchParams.get("expires"));
  const provided = url.searchParams.get("signature") || "";
  const now = Math.floor(Date.now() / 1000);
  if (!Number.isInteger(expires) || expires < now || expires > now + 60 * 60 * 3 || !provided) return false;
  const expected = await mediaSignature(reelId, expires, env.PUBLISH_URL_SECRET);
  return expected === provided;
}

async function resolveVideo(sourceUrl: string, env: Env) {
  let resolverFailure: string | null = null;
  const direct = await fetch(sourceUrl, {
    headers: {
      "user-agent": "Mozilla/5.0 (compatible; BTSupplyReelInbox/5.0)",
      accept: "text/html,application/xhtml+xml,video/*;q=0.9,*/*;q=0.8",
    },
    redirect: "follow",
  });
  const directType = direct.headers.get("content-type") ?? "";
  if (direct.ok && directType.startsWith("video/") && direct.body) return { response: direct };

  if (direct.ok && directType.includes("text/html")) {
    const html = await direct.text();
    const encoded = html.match(/<meta[^>]+property=["']og:video(?::secure_url)?["'][^>]+content=["']([^"']+)["']/i)?.[1]
      ?? html.match(/<meta[^>]+content=["']([^"']+)["'][^>]+property=["']og:video(?::secure_url)?["']/i)?.[1];
    if (encoded) {
      const response = await fetch(encoded.replaceAll("&amp;", "&"), {
        headers: { referer: "https://www.instagram.com/" },
        redirect: "follow",
      });
      if (response.ok && response.body) return { response };
    }
  }

  if (env.REEL_RESOLVER_URL) {
    const resolver = await fetch(env.REEL_RESOLVER_URL, {
      method: "POST",
      headers: {
        accept: "application/json",
        "content-type": "application/json",
        ...(env.REEL_RESOLVER_TOKEN ? {
          authorization: `${env.REEL_RESOLVER_AUTH_SCHEME?.trim() || "Bearer"} ${env.REEL_RESOLVER_TOKEN}`,
        } : {}),
      },
      body: JSON.stringify({
        url: sourceUrl,
        downloadMode: "auto",
        filenameStyle: "basic",
        videoQuality: "max",
      }),
    });
    if (resolver.ok) {
      const result = await resolver.json() as {
        status?: string;
        videoUrl?: string;
        url?: string;
        download_url?: string;
        tunnel?: string[];
        picker?: Array<{ type?: string; url?: string }>;
        error?: { code?: string };
      };
      const pickedVideo = result.picker?.find((item) => item.type === "video" && item.url)?.url;
      const videoUrl = result.videoUrl ?? result.url ?? result.download_url ?? pickedVideo ?? result.tunnel?.[0];
      if (typeof videoUrl === "string") {
        const response = await fetch(videoUrl, { redirect: "follow" });
        if (response.ok && response.body) return { response };
        resolverFailure = `arquivo retornado com HTTP ${response.status}`;
      } else {
        resolverFailure = result.error?.code || `resposta ${result.status || "sem arquivo"}`;
      }
    } else {
      resolverFailure = `HTTP ${resolver.status}`;
    }
  }
  if (resolverFailure) throw new Error(`O resolvedor não conseguiu obter este Reel (${resolverFailure}).`);
  throw new Error("O Instagram exige login ou o Reel não está publicamente acessível.");
}

async function graphRequest(
  path: string,
  env: Env,
  method: "GET" | "POST",
  parameters: Record<string, string>,
) {
  const credentials = await instagramCredentials(env);
  const values = new URLSearchParams({ ...parameters, access_token: credentials.accessToken });
  const endpoint = `${metaBaseUrl(env)}/${path.replace(/^\/+/, "")}`;
  const response = method === "POST"
    ? await fetch(endpoint, {
      method,
      headers: { "content-type": "application/x-www-form-urlencoded" },
      body: values,
    })
    : await fetch(`${endpoint}?${values.toString()}`);
  const result = await response.json() as {
    id?: string;
    status?: string;
    status_code?: string;
    permalink?: string;
    timestamp?: string;
    error?: { message?: string; code?: number; error_subcode?: number };
  };
  if (!response.ok || result.error) {
    const details = result.error?.code ? ` (Meta ${result.error.code})` : "";
    throw new Error(`${result.error?.message || "A Meta recusou a solicitação."}${details}`);
  }
  return result;
}

function directAllowedUsername(env: Env) {
  return (env.INSTAGRAM_DIRECT_ALLOWED_USERNAME || "")
    .trim()
    .replace(/^@+/, "")
    .toLowerCase();
}

function directConfigured(env: Env) {
  return Boolean(
    env.META_APP_SECRET
    && env.META_VERIFY_TOKEN
    && directAllowedUsername(env)
    && metaConnected(env),
  );
}

async function verifyMetaWebhookSignature(
  body: ArrayBuffer,
  signatureHeader: string | null,
  secret: string | undefined,
) {
  if (!secret || !signatureHeader?.startsWith("sha256=")) return false;
  const suppliedHex = signatureHeader.slice("sha256=".length).toLowerCase();
  if (!/^[0-9a-f]{64}$/.test(suppliedHex)) return false;
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const expected = new Uint8Array(await crypto.subtle.sign("HMAC", key, body));
  const supplied = Uint8Array.from(
    suppliedHex.match(/.{2}/g) || [],
    (value) => Number.parseInt(value, 16),
  );
  if (supplied.length !== expected.length) return false;
  let difference = 0;
  for (let index = 0; index < expected.length; index += 1) {
    difference |= expected[index] ^ supplied[index];
  }
  return difference === 0;
}

function instagramWebhookMessages(payload: InstagramWebhookPayload) {
  if (payload.object !== "instagram" || !Array.isArray(payload.entry)) return [];
  return payload.entry.flatMap((entry) => Array.isArray(entry.messaging) ? entry.messaging : []);
}

function directSharedReelUrl(message: InstagramWebhookMessage["message"]) {
  const textUrl = findInstagramUrl(message?.text || "");
  if (textUrl) return textUrl;
  for (const attachment of message?.attachments || []) {
    if (!new Set(["ig_reel", "reel"]).has((attachment.type || "").toLowerCase())) continue;
    const candidate = attachment.payload?.url;
    if (typeof candidate !== "string") continue;
    const reelUrl = findInstagramUrl(candidate);
    if (reelUrl) return reelUrl;
    try {
      const url = new URL(candidate);
      const host = url.hostname.toLowerCase();
      const trustedMediaHost = host === "instagram.com"
        || host.endsWith(".instagram.com")
        || host.endsWith(".cdninstagram.com")
        || host.endsWith(".fbcdn.net");
      if (url.protocol === "https:" && trustedMediaHost) return url.toString();
    } catch {
      // Ignore malformed attachment URLs even when the webhook itself is authentic.
    }
  }
  return null;
}

async function instagramDirectProfile(senderId: string, env: Env) {
  const credentials = await instagramCredentials(env);
  const params = new URLSearchParams({
    fields: "username",
    access_token: credentials.accessToken,
  });
  const response = await fetch(
    `${metaBaseUrl(env)}/${encodeURIComponent(senderId)}?${params.toString()}`,
  );
  const result = await response.json() as {
    id?: string;
    username?: string;
    error?: { message?: string };
  };
  if (!response.ok || result.error) {
    throw new Error(result.error?.message || "A Meta não confirmou o remetente do Direct.");
  }
  return {
    id: result.id || senderId,
    username: (result.username || "").replace(/^@+/, "").toLowerCase(),
  };
}

async function authorizedDirectSender(senderId: string, env: Env) {
  const senderKey = `instagram:${senderId}`;
  const paired = await env.DB.prepare(
    "SELECT sender_id FROM authorized_senders WHERE sender_id = ?",
  ).bind(senderKey).first<{ sender_id: string }>();
  if (paired) return true;
  const allowedUsername = directAllowedUsername(env);
  if (!allowedUsername) return false;
  const profile = await instagramDirectProfile(senderId, env);
  if (profile.username !== allowedUsername) return false;
  await env.DB.prepare(
    "INSERT OR IGNORE INTO authorized_senders (sender_id, paired_at) VALUES (?, CURRENT_TIMESTAMP)",
  ).bind(senderKey).run();
  return true;
}

async function sendInstagramDirectMessage(
  senderId: string,
  message: Record<string, unknown>,
  env: Env,
) {
  const credentials = await instagramCredentials(env);
  const response = await fetch(
    `${metaBaseUrl(env)}/${encodeURIComponent(credentials.userId)}/messages`,
    {
      method: "POST",
      headers: {
        authorization: `Bearer ${credentials.accessToken}`,
        "content-type": "application/json",
      },
      body: JSON.stringify({
        recipient: { id: senderId },
        messaging_type: "RESPONSE",
        message,
      }),
    },
  );
  const result = await response.json() as {
    message_id?: string;
    error?: { message?: string; code?: number };
  };
  if (!response.ok || result.error) {
    const details = result.error?.code ? ` (Meta ${result.error.code})` : "";
    throw new Error(`${result.error?.message || "A Meta não enviou a resposta no Direct."}${details}`);
  }
  return result;
}

async function subscribeInstagramDirect(env: Env) {
  const credentials = await instagramCredentials(env);
  const response = await fetch(
    `${metaBaseUrl(env)}/${encodeURIComponent(credentials.userId)}/subscribed_apps`,
    {
      method: "POST",
      headers: {
        authorization: `Bearer ${credentials.accessToken}`,
        "content-type": "application/json",
      },
      body: JSON.stringify({
        subscribed_fields: ["messages", "messaging_postbacks"],
      }),
    },
  );
  const result = await response.json() as {
    success?: boolean;
    error?: { message?: string; code?: number };
  };
  if (!response.ok || result.error || result.success !== true) {
    const details = result.error?.code ? ` (Meta ${result.error.code})` : "";
    throw new Error(`${result.error?.message || "A Meta não ativou os eventos do Direct."}${details}`);
  }
  return { subscribed: true };
}

async function requestDirectRights(senderId: string, reelId: number, env: Env) {
  return sendInstagramDirectMessage(senderId, {
    text: `Reel #${reelId} recebido. Confirme a autorização para baixar e preparar o conteúdo:`,
    quick_replies: [
      {
        content_type: "text",
        title: "Conteúdo próprio",
        payload: `reelvolt:rights:owned:${reelId}`,
      },
      {
        content_type: "text",
        title: "Licenciado",
        payload: `reelvolt:rights:licensed:${reelId}`,
      },
    ],
  }, env);
}

async function sendDirectApprovalButton(
  senderId: string,
  reelId: number,
  baseUrl: string,
  env: Env,
) {
  return sendInstagramDirectMessage(senderId, {
    attachment: {
      type: "template",
      payload: {
        template_type: "button",
        text: `O MP4 do Reel #${reelId} está pronto. Revise e autorize a publicação no ReelVolt.`,
        buttons: [{
          type: "web_url",
          url: `${baseUrl}/?approve=${reelId}`,
          title: "Abrir no ReelVolt",
        }],
      },
    },
  }, env);
}

function directSenderId(record: ReelRecord) {
  return record.sender_id.startsWith("instagram:")
    ? record.sender_id.slice("instagram:".length)
    : null;
}

function insightValue(result: InstagramInsightResult | undefined) {
  const value = result?.total_value?.value ?? result?.values?.[0]?.value ?? 0;
  return Number.isFinite(Number(value)) ? Math.max(0, Math.round(Number(value))) : 0;
}

async function mediaInsightRequest(
  mediaId: string,
  metrics: string[],
  env: Env,
) {
  const credentials = await instagramCredentials(env);
  const values = new URLSearchParams({
    metric: metrics.join(","),
    access_token: credentials.accessToken,
  });
  const response = await fetch(
    `${metaBaseUrl(env)}/${encodeURIComponent(mediaId)}/insights?${values.toString()}`,
  );
  const result = await response.json() as {
    data?: InstagramInsightResult[];
    error?: { message?: string; code?: number; error_subcode?: number };
  };
  if (!response.ok || result.error) {
    const details = result.error?.code ? ` (Meta ${result.error.code})` : "";
    throw new Error(`${result.error?.message || "A Meta não disponibilizou os Insights deste Reel."}${details}`);
  }
  return new Map((result.data || []).map((metric) => [metric.name, insightValue(metric)]));
}

async function saveInsightError(reelId: number, error: unknown, env: Env) {
  const message = error instanceof Error ? error.message : "Falha desconhecida ao consultar os Insights.";
  await env.DB.prepare(`INSERT INTO reel_insights (reel_id, last_error, updated_at)
    VALUES (?, ?, CURRENT_TIMESTAMP)
    ON CONFLICT(reel_id) DO UPDATE SET last_error = excluded.last_error,
      updated_at = CURRENT_TIMESTAMP`)
    .bind(reelId, message.slice(0, 500))
    .run();
}

function insightMilestone(publishedAt: string | null) {
  const timestamp = databaseTimestamp(publishedAt);
  if (!Number.isFinite(timestamp)) return { milestone: null, capturedMinutes: null };
  const capturedMinutes = Math.max(0, Math.round((Date.now() - timestamp) / 60_000));
  const thresholds = [
    { minutes: 7 * 24 * 60, label: "7d" },
    { minutes: 72 * 60, label: "72h" },
    { minutes: 24 * 60, label: "24h" },
    { minutes: 60, label: "1h" },
  ];
  const threshold = thresholds.find((item) =>
    capturedMinutes >= item.minutes && capturedMinutes < item.minutes + 75);
  return {
    milestone: threshold?.label || null,
    capturedMinutes: threshold ? capturedMinutes : null,
  };
}

async function refreshReelInsights(target: PublishedReelInsightTarget, env: Env) {
  try {
    const previous = await env.DB.prepare(`SELECT views, reach, likes, comments, saved, shares,
      total_interactions, average_watch_time_ms, total_watch_time_ms
      FROM reel_insights WHERE reel_id = ?`).bind(target.id).first<Record<string, number>>();
    let core: Map<string, number>;
    try {
      core = await mediaInsightRequest(target.instagram_media_id, ["views", "reach"], env);
    } catch (groupError) {
      const views = await mediaInsightRequest(target.instagram_media_id, ["views"], env);
      let reach = new Map<string, number>();
      try {
        reach = await mediaInsightRequest(target.instagram_media_id, ["reach"], env);
      } catch (error) {
        console.warn(`O alcance do Reel #${target.id} não está disponível:`, error, groupError);
      }
      core = new Map([...views, ...reach]);
    }
    const [engagementResult, watchResult] = await Promise.allSettled([
      mediaInsightRequest(
        target.instagram_media_id,
        ["likes", "comments", "saved", "shares", "total_interactions"],
        env,
      ),
      mediaInsightRequest(
        target.instagram_media_id,
        ["ig_reels_avg_watch_time", "ig_reels_video_view_total_time"],
        env,
      ),
    ]);
    const engagement = engagementResult.status === "fulfilled"
      ? engagementResult.value
      : new Map<string, number>();
    const watch = watchResult.status === "fulfilled"
      ? watchResult.value
      : new Map<string, number>();
    if (engagementResult.status === "rejected") {
      console.warn(`As métricas de engajamento do Reel #${target.id} não estão disponíveis:`, engagementResult.reason);
    }
    if (watchResult.status === "rejected") {
      console.warn(`As métricas de retenção do Reel #${target.id} não estão disponíveis:`, watchResult.reason);
    }

    const likes = engagement.get("likes") ?? Number(previous?.likes || 0);
    const comments = engagement.get("comments") ?? Number(previous?.comments || 0);
    const saved = engagement.get("saved") ?? Number(previous?.saved || 0);
    const shares = engagement.get("shares") ?? Number(previous?.shares || 0);
    const totalInteractions = engagement.get("total_interactions")
      || likes + comments + saved + shares;
    const metrics = {
      views: core.get("views") ?? Number(previous?.views || 0),
      reach: core.get("reach") ?? Number(previous?.reach || 0),
      likes,
      comments,
      saved,
      shares,
      totalInteractions,
      averageWatchTimeMs: watch.get("ig_reels_avg_watch_time")
        ?? Number(previous?.average_watch_time_ms || 0),
      totalWatchTimeMs: watch.get("ig_reels_video_view_total_time")
        ?? Number(previous?.total_watch_time_ms || 0),
    };
    const milestone = insightMilestone(target.published_at);

    await env.DB.batch([
      env.DB.prepare(`INSERT INTO reel_insights
        (reel_id, views, reach, likes, comments, saved, shares, total_interactions,
         average_watch_time_ms, total_watch_time_ms, last_error, updated_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NULL, CURRENT_TIMESTAMP)
        ON CONFLICT(reel_id) DO UPDATE SET views = excluded.views, reach = excluded.reach,
          likes = excluded.likes, comments = excluded.comments, saved = excluded.saved,
          shares = excluded.shares, total_interactions = excluded.total_interactions,
          average_watch_time_ms = excluded.average_watch_time_ms,
          total_watch_time_ms = excluded.total_watch_time_ms, last_error = NULL,
          updated_at = CURRENT_TIMESTAMP`)
        .bind(
          target.id,
          metrics.views,
          metrics.reach,
          metrics.likes,
          metrics.comments,
          metrics.saved,
          metrics.shares,
          metrics.totalInteractions,
          metrics.averageWatchTimeMs,
          metrics.totalWatchTimeMs,
        ),
      env.DB.prepare(`INSERT INTO reel_insight_snapshots
        (reel_id, captured_date, views, reach, total_interactions, shares, saved,
          average_watch_time_ms, milestone, captured_minutes, captured_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
        ON CONFLICT(reel_id, captured_date) DO UPDATE SET views = excluded.views,
          reach = excluded.reach, total_interactions = excluded.total_interactions,
          shares = excluded.shares, saved = excluded.saved,
          average_watch_time_ms = excluded.average_watch_time_ms,
          milestone = COALESCE(reel_insight_snapshots.milestone, excluded.milestone),
          captured_minutes = COALESCE(reel_insight_snapshots.captured_minutes, excluded.captured_minutes),
          captured_at = CURRENT_TIMESTAMP`)
        .bind(
          target.id,
          analyticsDateKey(),
          metrics.views,
          metrics.reach,
          metrics.totalInteractions,
          metrics.shares,
          metrics.saved,
          metrics.averageWatchTimeMs,
          milestone.milestone,
          milestone.capturedMinutes,
        ),
    ]);
    return true;
  } catch (error) {
    await saveInsightError(target.id, error, env);
    return false;
  }
}

async function refreshAllInsights(env: Env) {
  const { results } = await env.DB.prepare(`SELECT id, instagram_media_id, published_at FROM reels
    WHERE publish_status = 'published' AND instagram_media_id IS NOT NULL
    ORDER BY published_at DESC LIMIT 100`)
    .all<PublishedReelInsightTarget>();
  let cursor = 0;
  let updated = 0;
  const workers = Array.from({ length: Math.min(6, results.length) }, async () => {
    while (cursor < results.length) {
      const target = results[cursor++];
      const succeeded = await refreshReelInsights(target, env);
      if (succeeded) updated += 1;
      await env.DB.prepare(`UPDATE instagram_insight_sync
        SET updated_targets = updated_targets + ?, updated_at = CURRENT_TIMESTAMP
        WHERE id = 1`).bind(succeeded ? 1 : 0).run();
    }
  });
  await Promise.all(workers);
  return { total: results.length, updated };
}

type InstagramInsightSyncState = {
  status: string;
  started_at: string | null;
  completed_at: string | null;
  last_error: string | null;
  total_targets: number;
  updated_targets: number;
};

async function insightSyncState(env: Env) {
  const state = await env.DB.prepare(`SELECT status, started_at, completed_at, last_error,
    total_targets, updated_targets FROM instagram_insight_sync WHERE id = 1`)
    .first<InstagramInsightSyncState>();
  const startedAt = databaseTimestamp(state?.started_at || null);
  if (state?.status === "running" && Number.isFinite(startedAt)
    && Date.now() - startedAt > 2 * 60 * 1000) {
    return {
      ...state,
      status: "failed",
      last_error: "A última sincronização excedeu o tempo esperado. Tente atualizar novamente.",
    };
  }
  return state;
}

async function claimInsightRefresh(env: Env) {
  const result = await env.DB.prepare(`UPDATE instagram_insight_sync
    SET status = 'running', started_at = CURRENT_TIMESTAMP, completed_at = NULL,
      last_error = NULL, total_targets = 0, updated_targets = 0,
      updated_at = CURRENT_TIMESTAMP
    WHERE id = 1 AND (status <> 'running' OR started_at IS NULL
      OR datetime(started_at) < datetime('now', '-2 minutes'))`).run();
  return Number(result.meta.changes || 0) > 0;
}

async function executeClaimedInsightRefresh(env: Env) {
  try {
    const total = await env.DB.prepare(`SELECT COUNT(*) AS total FROM reels
      WHERE publish_status = 'published' AND instagram_media_id IS NOT NULL`)
      .first<{ total: number }>();
    await env.DB.prepare(`UPDATE instagram_insight_sync SET total_targets = ?,
      updated_at = CURRENT_TIMESTAMP WHERE id = 1`).bind(Number(total?.total || 0)).run();
    const result = await refreshAllInsights(env);
    await env.DB.prepare(`UPDATE instagram_insight_sync SET status = 'idle',
      completed_at = CURRENT_TIMESTAMP, last_error = NULL, total_targets = ?,
      updated_targets = ?, updated_at = CURRENT_TIMESTAMP WHERE id = 1`)
      .bind(result.total, result.updated).run();
  } catch (error) {
    const message = error instanceof Error ? error.message : "Falha ao atualizar os Insights.";
    await env.DB.prepare(`UPDATE instagram_insight_sync SET status = 'failed',
      completed_at = CURRENT_TIMESTAMP, last_error = ?, updated_at = CURRENT_TIMESTAMP
      WHERE id = 1`).bind(message.slice(0, 500)).run();
    console.error("Falha na sincronização dos Insights do Instagram:", error);
  }
}

async function startInsightRefresh(env: Env, ctx: ExecutionContext) {
  const claimed = await claimInsightRefresh(env);
  if (claimed) ctx.waitUntil(executeClaimedInsightRefresh(env));
  return claimed;
}

function databaseTimestamp(value: string | null) {
  if (!value) return Number.NaN;
  return Date.parse(value.includes("T") ? value : `${value.replace(" ", "T")}Z`);
}

async function reconcilePublishedReel(record: ReelRecord, env: Env) {
  const credentials = await instagramCredentials(env);
  const values = new URLSearchParams({
    fields: "id,caption,permalink,timestamp,media_type,media_product_type",
    limit: "50",
    access_token: credentials.accessToken,
  });
  const response = await fetch(
    `${metaBaseUrl(env)}/${credentials.userId}/media?${values.toString()}`,
  );
  const result = await response.json() as {
    data?: InstagramPublishedMedia[];
    error?: { message?: string; code?: number };
  };
  if (!response.ok || result.error) {
    const details = result.error?.code ? ` (Meta ${result.error.code})` : "";
    throw new Error(`${result.error?.message || "Não foi possível consultar as publicações recentes."}${details}`);
  }

  const expectedCaption = record.caption_enabled ? (record.caption || "").trim() : "";
  const requestedAt = databaseTimestamp(record.publish_requested_at || record.created_at);
  const earliestMatch = Number.isFinite(requestedAt)
    ? requestedAt - 15 * 60 * 1000
    : Date.now() - 24 * 60 * 60 * 1000;
  const latestMatch = Date.now() + 5 * 60 * 1000;
  const match = (result.data || [])
    .filter((media) => {
      const publishedAt = Date.parse(media.timestamp || "");
      const isVideo = !media.media_type || media.media_type === "VIDEO";
      return isVideo
        && (media.caption || "").trim() === expectedCaption
        && Number.isFinite(publishedAt)
        && publishedAt >= earliestMatch
        && publishedAt <= latestMatch;
    })
    .sort((left, right) => {
      const leftDistance = Math.abs(Date.parse(left.timestamp || "") - requestedAt);
      const rightDistance = Math.abs(Date.parse(right.timestamp || "") - requestedAt);
      return leftDistance - rightDistance;
    })[0];
  if (!match) return false;

  await env.DB.prepare(`UPDATE reels SET publish_status = 'published', publish_error = NULL,
    instagram_media_id = ?, instagram_permalink = ?, published_at = COALESCE(published_at, CURRENT_TIMESTAMP)
    WHERE id = ?`)
    .bind(match.id, match.permalink || null, record.id)
    .run();
  return true;
}

async function publishReel(record: ReelRecord, env: Env, baseUrl: string) {
  if (!metaConnected(env)) {
    await env.DB.prepare(
      "UPDATE reels SET publish_status = 'awaiting_setup', publish_error = ? WHERE id = ?",
    ).bind("Conecte a conta @btsupply_ à Meta para publicar.", record.id).run();
    return;
  }
  if (!record.storage_key || record.status !== "ready") {
    throw new Error("O MP4 ainda não está pronto para publicação.");
  }

  try {
    if (record.publish_status === "publishing") {
      try {
        if (await reconcilePublishedReel(record, env)) return;
      } catch (error) {
        console.warn("A publicação em andamento não pôde ser reconciliada antes da retomada:", error);
      }
    }

    await env.DB.prepare(`UPDATE reels SET publish_status = 'creating', publish_error = NULL,
      publish_requested_at = COALESCE(publish_requested_at, CURRENT_TIMESTAMP) WHERE id = ?`)
      .bind(record.id).run();

    let containerId = record.instagram_container_id;
    if (!containerId) {
      const videoUrl = await signedMediaUrl(record.id, baseUrl, env);
      const parameters: Record<string, string> = {
        media_type: "REELS",
        video_url: videoUrl,
        share_to_feed: record.share_to_feed ? "true" : "false",
      };
      if (record.caption_enabled && record.caption?.trim()) {
        parameters.caption = record.caption.trim();
      }
      if (record.cover_mode === "fixed") {
        parameters.cover_url = record.cover_key
          ? await signedCoverUrl(record.id, baseUrl, env)
          : `${baseUrl}${COVER_PATH}`;
      }
      const created = await graphRequest(
        `${env.INSTAGRAM_USER_ID}/media`,
        env,
        "POST",
        parameters,
      );
      if (!created.id) throw new Error("A Meta não retornou o identificador da publicação.");
      containerId = created.id;
      await env.DB.prepare(
        "UPDATE reels SET instagram_container_id = ?, publish_status = 'processing' WHERE id = ?",
      ).bind(containerId, record.id).run();
    }

    let finished = false;
    for (let attempt = 0; attempt < 9; attempt += 1) {
      if (attempt > 0) await sleep(2800);
      const status = await graphRequest(
        String(containerId),
        env,
        "GET",
        { fields: "status_code,status" },
      );
      if (status.status_code === "FINISHED") {
        finished = true;
        break;
      }
      if (status.status_code === "ERROR" || status.status_code === "EXPIRED") {
        throw new Error(status.status || `O contêiner da Meta terminou como ${status.status_code}.`);
      }
    }
    if (!finished) {
      await env.DB.prepare(
        "UPDATE reels SET publish_status = 'processing', publish_error = ? WHERE id = ?",
      ).bind("A Meta ainda está processando o vídeo. Use “Continuar publicação” para consultar novamente.", record.id).run();
      return;
    }

    await env.DB.prepare(
      "UPDATE reels SET publish_status = 'publishing', publish_error = NULL WHERE id = ?",
    ).bind(record.id).run();
    const published = await graphRequest(
      `${env.INSTAGRAM_USER_ID}/media_publish`,
      env,
      "POST",
      { creation_id: String(containerId) },
    );
    if (!published.id) throw new Error("A Meta não retornou o ID do Reel publicado.");

    let permalink: string | null = null;
    try {
      const media = await graphRequest(published.id, env, "GET", { fields: "permalink,timestamp" });
      permalink = media.permalink || null;
    } catch (error) {
      console.warn("Reel publicado, mas o permalink não pôde ser consultado:", error);
    }

    await env.DB.prepare(`UPDATE reels SET publish_status = 'published', publish_error = NULL,
      instagram_media_id = ?, instagram_permalink = ?, published_at = CURRENT_TIMESTAMP WHERE id = ?`)
      .bind(published.id, permalink, record.id).run();
  } catch (error) {
    try {
      if (await reconcilePublishedReel(record, env)) return;
    } catch (reconciliationError) {
      console.warn("A publicação não pôde ser reconciliada após a resposta da Meta:", reconciliationError);
    }
    const message = error instanceof Error ? error.message : "Falha desconhecida na publicação.";
    await env.DB.prepare(
      "UPDATE reels SET publish_status = 'failed', publish_error = ? WHERE id = ?",
    ).bind(message.slice(0, 700), record.id).run();
  }
}

async function processReel(record: ReelRecord, env: Env, baseUrl?: string) {
  try {
    await env.DB.prepare("UPDATE reels SET status = 'downloading', error = NULL WHERE id = ?")
      .bind(record.id).run();
    const { response } = await resolveVideo(record.source_url, env);
    const contentType = response.headers.get("content-type")?.split(";")[0] || "video/mp4";
    if (!contentType.startsWith("video/") && contentType !== "application/octet-stream") {
      throw new Error("A origem não retornou um vídeo.");
    }
    const storageKey = `reels/${record.id}-${crypto.randomUUID()}.mp4`;
    await env.VIDEOS.put(storageKey, response.body, {
      httpMetadata: { contentType: contentType === "application/octet-stream" ? "video/mp4" : contentType },
      customMetadata: {
        sourceUrl: record.source_url,
        sourceAccount: (record.source_account || "").slice(0, 128),
        rightsConfirmed: String(Boolean(record.rights_confirmed)),
        rules: (record.rules || "").slice(0, 1024),
      },
    });
    const stored = await env.VIDEOS.head(storageKey);
    const publishStatus = record.publication_mode === "download_only"
      ? "not_requested"
      : "awaiting_approval";
    await env.DB.prepare(`UPDATE reels
      SET status = 'ready', storage_key = ?, filename = ?, content_type = ?, size_bytes = ?,
        completed_at = CURRENT_TIMESTAMP, error = NULL, publish_status = ?, publish_error = NULL
      WHERE id = ?`)
      .bind(storageKey, `reel-${record.id}.mp4`, "video/mp4", stored?.size ?? null, publishStatus, record.id)
      .run();
    const senderId = directSenderId(record);
    if (senderId && baseUrl) {
      try {
        await sendDirectApprovalButton(senderId, record.id, baseUrl, env);
      } catch (notificationError) {
        console.warn(`O Reel #${record.id} ficou pronto, mas o Direct não recebeu o botão de aprovação.`, notificationError);
      }
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : "Falha desconhecida";
    await env.DB.prepare(`UPDATE reels SET status = 'failed', error = ?,
      publish_status = CASE WHEN publication_mode = 'download_only' THEN 'not_requested' ELSE 'blocked' END
      WHERE id = ?`)
      .bind(message.slice(0, 500), record.id).run();
    const senderId = directSenderId(record);
    if (senderId) {
      try {
        await sendInstagramDirectMessage(senderId, {
          text: `Não foi possível preparar o Reel #${record.id}. Abra o ReelVolt para conferir o erro.`,
        }, env);
      } catch (notificationError) {
        console.warn(`A falha do Reel #${record.id} também não pôde ser avisada no Direct.`, notificationError);
      }
    }
  }
}

async function reelById(id: number, env: Env) {
  return env.DB.prepare(`SELECT id, sender_id, source_url, rules, source_account, rights_confirmed, public_token,
    storage_key, filename, content_type, status, publication_mode, share_to_feed, caption,
    caption_enabled, cover_mode, cover_key, approved_at, scheduled_for,
    publish_status, instagram_container_id, publish_requested_at, created_at
    FROM reels WHERE id = ?`).bind(id).first<ReelRecord>();
}

async function nextPublicationTime(env: Env, intervalMinutes: number) {
  const row = await env.DB.prepare(`SELECT
    (SELECT MAX(scheduled_for) FROM reels WHERE publish_status = 'queued') AS last_scheduled,
    (SELECT MAX(published_at) FROM reels WHERE publish_status = 'published') AS last_published`)
    .first<{ last_scheduled: string | null; last_published: string | null }>();
  const intervalMs = intervalMinutes * 60 * 1000;
  const candidates = [
    databaseTimestamp(row?.last_scheduled || null),
    databaseTimestamp(row?.last_published || null),
  ].filter(Number.isFinite);
  const latest = candidates.length ? Math.max(...candidates) : Number.NaN;
  return sqliteTimestamp(Number.isFinite(latest) ? Math.max(Date.now(), latest + intervalMs) : Date.now());
}

async function reschedulePublicationQueue(env: Env, intervalMinutes: number) {
  const { results } = await env.DB.prepare(`SELECT id FROM reels
    WHERE status = 'ready' AND publish_status = 'queued' AND approved_at IS NOT NULL
    ORDER BY datetime(COALESCE(scheduled_for, approved_at, created_at)), id`).all<{ id: number }>();
  if (!results.length) return;
  const last = await env.DB.prepare(
    "SELECT MAX(published_at) AS last_published FROM reels WHERE publish_status = 'published'",
  ).first<{ last_published: string | null }>();
  const lastPublished = databaseTimestamp(last?.last_published || null);
  const intervalMs = intervalMinutes * 60 * 1000;
  let cursor = Number.isFinite(lastPublished)
    ? Math.max(Date.now(), lastPublished + intervalMs)
    : Date.now();
  await env.DB.batch(results.map((row) => {
    const statement = env.DB.prepare(
      "UPDATE reels SET scheduled_for = ? WHERE id = ? AND publish_status = 'queued'",
    ).bind(sqliteTimestamp(cursor), row.id);
    cursor += intervalMs;
    return statement;
  }));
}

async function approveReel(record: ReelRecord, env: Env, baseUrl: string, ctx: ExecutionContext) {
  const settings = await studioSettings(env);
  const caption = settings.caption_enabled ? settings.default_caption.trim() : "";
  const coverKey = settings.cover_mode === "fixed" ? settings.fixed_cover_key : null;
  const destinations = await publicationDestinations(record.id, env);
  const youtube = await queueYouTubePublication(
    record.id,
    record.source_account,
    Boolean(record.rights_confirmed),
    env,
  );
  if (youtube.status === "queued") {
    ctx.waitUntil(dispatchYouTubeExecutor(env));
  }

  if (!destinations.instagram) {
    await env.DB.prepare(`UPDATE reels SET publication_mode = 'approval', caption = ?,
      caption_enabled = ?, cover_mode = ?, cover_key = ?, approved_at = CURRENT_TIMESTAMP,
      scheduled_for = NULL, publish_status = 'not_requested', publish_error = NULL
      WHERE id = ?`)
      .bind(caption || null, settings.caption_enabled ? 1 : 0, settings.cover_mode, coverKey, record.id)
      .run();
    return { queued: false, scheduledFor: null, youtube };
  }

  if (!metaConnected(env)) {
    await env.DB.prepare(`UPDATE reels SET publication_mode = 'approval', caption = ?,
      caption_enabled = ?, cover_mode = ?, cover_key = ?, approved_at = CURRENT_TIMESTAMP,
      scheduled_for = NULL, publish_status = 'awaiting_setup',
      publish_error = 'Conecte a conta do Instagram para publicar este Reel.'
      WHERE id = ?`)
      .bind(caption || null, settings.caption_enabled ? 1 : 0, settings.cover_mode, coverKey, record.id)
      .run();
    return { queued: false, scheduledFor: null, youtube };
  }

  const usesScheduledQueue = Boolean(settings.auto_publish_enabled)
    || record.sender_id.startsWith("instagram:");
  if (usesScheduledQueue) {
    const scheduledFor = await nextPublicationTime(env, settings.publish_interval_minutes);
    await env.DB.prepare(`UPDATE reels SET publication_mode = 'approval', caption = ?,
      caption_enabled = ?, cover_mode = ?, cover_key = ?, approved_at = CURRENT_TIMESTAMP,
      scheduled_for = ?, publish_status = 'queued', publish_error = NULL,
      instagram_container_id = NULL, publish_requested_at = NULL
      WHERE id = ?`)
      .bind(caption || null, settings.caption_enabled ? 1 : 0, settings.cover_mode, coverKey, scheduledFor, record.id)
      .run();
    return { queued: true, scheduledFor, youtube };
  }

  await env.DB.prepare(`UPDATE reels SET publication_mode = 'approval', caption = ?,
    caption_enabled = ?, cover_mode = ?, cover_key = ?, approved_at = CURRENT_TIMESTAMP,
    scheduled_for = NULL, publish_status = 'queued', publish_error = NULL,
    instagram_container_id = NULL, publish_requested_at = NULL
    WHERE id = ?`)
    .bind(caption || null, settings.caption_enabled ? 1 : 0, settings.cover_mode, coverKey, record.id)
    .run();
  const approved = await reelById(record.id, env);
  if (!approved) throw new Error("O Reel aprovado não pôde ser recarregado.");
  ctx.waitUntil(publishReel(approved, env, baseUrl));
  return { queued: false, scheduledFor: null, youtube };
}

async function processPublicationQueue(env: Env, baseUrl: string) {
  if (!metaConnected(env)) return { processed: false };
  const due = await env.DB.prepare(`SELECT id FROM reels
    WHERE status = 'ready' AND publish_status = 'queued'
      AND approved_at IS NOT NULL AND scheduled_for IS NOT NULL
      AND datetime(scheduled_for) <= CURRENT_TIMESTAMP
    ORDER BY datetime(scheduled_for), id LIMIT 1`).first<{ id: number }>();
  if (!due) return { processed: false };
  const claim = await env.DB.prepare(`UPDATE reels SET publish_status = 'publishing',
    publish_requested_at = COALESCE(publish_requested_at, CURRENT_TIMESTAMP)
    WHERE id = ? AND publish_status = 'queued'`).bind(due.id).run();
  if (!claim.meta.changes) return { processed: false };
  const record = await reelById(due.id, env);
  if (!record) return { processed: false };
  await publishReel(record, env, baseUrl);
  return { processed: true, id: due.id };
}

async function queueReel(
  input: ReelInput,
  env: Env,
  ctx: ExecutionContext,
): Promise<QueueResult> {
  const existing = await env.DB.prepare(
    "SELECT id FROM reels WHERE source_url = ? AND status <> 'failed' ORDER BY id DESC LIMIT 1",
  ).bind(input.sourceUrl).first<{ id: number }>();
  if (existing) return { accepted: false, reason: "duplicate", id: existing.id };

  const publicToken = crypto.randomUUID();
  const initialPublishStatus = input.publicationMode === "download_only" ? "not_requested" : "awaiting_download";
  const result = await env.DB.prepare(
    `INSERT OR IGNORE INTO reels
      (message_id, sender_id, source_url, rules, source_account, rights_confirmed, public_token,
       status, publication_mode, share_to_feed, caption, publish_status)
      VALUES (?, ?, ?, ?, ?, ?, ?, 'queued', ?, ?, ?, ?)`,
  ).bind(
    input.messageId,
    input.senderId,
    input.sourceUrl,
    input.rules || null,
    input.sourceAccount || null,
    input.rightsConfirmed ? 1 : 0,
    publicToken,
    input.publicationMode,
    input.shareToFeed ? 1 : 0,
    FIXED_CAPTION,
    initialPublishStatus,
  ).run();
  if (!result.meta.changes) return { accepted: false, reason: "duplicate" };

  const record = await env.DB.prepare(`SELECT id, sender_id, source_url, rules, source_account, rights_confirmed,
    public_token, storage_key, filename, content_type, status, publication_mode, share_to_feed,
    caption, caption_enabled, cover_mode, cover_key, approved_at, scheduled_for,
    publish_status, instagram_container_id, publish_requested_at, created_at
    FROM reels WHERE message_id = ?`)
    .bind(input.messageId).first<ReelRecord>();
  if (!record) return { accepted: false, reason: "database_error" };
  await createContentTargets(record.id, input.targets, env);
  ctx.waitUntil(processReel(record, env));
  return { accepted: true, id: record.id };
}

async function serveVideo(
  row: { storage_key: string; filename: string; content_type: string } | null,
  env: Env,
  options: { attachment?: boolean; method?: string } = {},
) {
  if (!row?.storage_key) return json({ error: "Vídeo não encontrado." }, { status: 404 });
  const object = await env.VIDEOS.get(row.storage_key);
  if (!object?.body) return json({ error: "Arquivo não encontrado." }, { status: 404 });
  const headers = new Headers({
    "content-type": row.content_type || "video/mp4",
    "content-length": String(object.size),
    "cache-control": options.attachment === false ? "public, max-age=300" : "private, no-store",
    "x-content-type-options": "nosniff",
    "accept-ranges": "bytes",
  });
  headers.set(
    "content-disposition",
    `${options.attachment === false ? "inline" : "attachment"}; filename="${row.filename || "reel.mp4"}"`,
  );
  return new Response(options.method === "HEAD" ? null : object.body, { headers });
}

async function serveCover(
  row: { cover_key: string | null; content_type: string | null } | null,
  env: Env,
  method = "GET",
  isPublic = false,
) {
  if (!row?.cover_key) return json({ error: "Capa não encontrada." }, { status: 404 });
  const object = await env.VIDEOS.get(row.cover_key);
  if (!object?.body) return json({ error: "Arquivo da capa não encontrado." }, { status: 404 });
  return new Response(method === "HEAD" ? null : object.body, {
    headers: {
      "content-type": row.content_type || "image/jpeg",
      "content-length": String(object.size),
      "cache-control": isPublic ? "public, max-age=300" : "private, no-store",
      "x-content-type-options": "nosniff",
    },
  });
}

async function listReels(env: Env, baseUrl: string) {
  const { results } = await env.DB.prepare(`SELECT r.id, r.sender_id, r.source_url, r.rules, r.source_account,
    r.rights_confirmed, r.public_token, r.storage_key, r.filename, r.content_type, r.size_bytes,
    r.status, r.error, r.publication_mode, r.share_to_feed, r.caption, r.caption_enabled,
    r.cover_mode, r.cover_key, r.approved_at, r.scheduled_for, r.publish_status, r.publish_error,
    r.instagram_container_id, r.instagram_media_id, r.instagram_permalink, r.publish_requested_at,
    r.published_at, r.created_at, r.completed_at,
    COALESCE(cr.instagram_enabled,
      CASE WHEN r.publication_mode = 'download_only' THEN 0 ELSE 1 END) AS instagram_selected,
    COALESCE(cr.youtube_enabled, 0) AS youtube_selected,
    cr.rights_basis, cr.context AS content_context,
    COALESCE(cr.made_for_kids, 0) AS made_for_kids,
    COALESCE(cr.contains_synthetic_media, 0) AS contains_synthetic_media,
    COALESCE(cr.paid_product_placement, 0) AS paid_product_placement
    FROM reels r LEFT JOIN content_reviews cr ON cr.reel_id = r.id
    WHERE r.status <> 'failed' ORDER BY r.id DESC LIMIT 80`).all<ReelListRow>();
  const summaries = await youtubeSummaries(results.map((row) => row.id), env);
  return results.map((row) => ({
    ...row,
    download_url: row.status === "ready" && row.public_token
      ? publicDownloadUrl(baseUrl, row.public_token)
      : null,
    public_token: undefined,
    storage_key: undefined,
    sender_id: undefined,
    rights_confirmed: Boolean(row.rights_confirmed),
    intake_source: row.sender_id.startsWith("instagram:") ? "instagram_direct" : "web",
    instagram_selected: Boolean(row.instagram_selected),
    youtube_selected: Boolean(row.youtube_selected),
    made_for_kids: Boolean(row.made_for_kids),
    contains_synthetic_media: Boolean(row.contains_synthetic_media),
    paid_product_placement: Boolean(row.paid_product_placement),
    youtube: summaries.get(row.id) || null,
  }));
}

type ViewHistoryRow = {
  captured_date: string;
  views: number;
  reach?: number;
  total_interactions?: number;
  shares?: number;
  saved?: number;
};

function analyticsDateKey(date = new Date()) {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Sao_Paulo",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(date);
  const value = (type: Intl.DateTimeFormatPartTypes) =>
    parts.find((part) => part.type === type)?.value || "";
  return `${value("year")}-${value("month")}-${value("day")}`;
}

function shiftDateKey(value: string, days: number) {
  const date = new Date(`${value}T12:00:00Z`);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

function percentageChange(current: number | null, previous: number | null) {
  if (current == null || previous == null || previous <= 0) return null;
  return Number((((current - previous) / previous) * 100).toFixed(1));
}

function viewPeriodSummary(
  currentViews: number,
  history: ViewHistoryRow[],
  oldestPublishedAt: string | null,
) {
  const today = analyticsDateKey();
  const byDate = new Map(history.map((row) => [row.captured_date, Number(row.views || 0)]));
  const cumulative = (date: string) => byDate.has(date) ? byDate.get(date) as number : null;
  const delta = (end: number | null, start: number | null) =>
    end == null || start == null ? null : Math.max(0, end - start);

  const yesterdayKey = shiftDateKey(today, -1);
  const dayBeforeKey = shiftDateKey(today, -2);
  const weekStart = shiftDateKey(today, -7);
  const priorWeekStart = shiftDateKey(today, -14);
  const monthStart = shiftDateKey(today, -30);
  const priorMonthStart = shiftDateKey(today, -60);

  const yesterdayTotal = cumulative(yesterdayKey);
  const dayBeforeTotal = cumulative(dayBeforeKey);
  const oldestTimestamp = databaseTimestamp(oldestPublishedAt);
  const oldestPublishedDate = Number.isFinite(oldestTimestamp)
    ? analyticsDateKey(new Date(oldestTimestamp))
    : null;
  const weekBaseline = cumulative(weekStart)
    ?? (oldestPublishedDate && oldestPublishedDate >= weekStart ? 0 : null);
  const priorWeekBaseline = cumulative(priorWeekStart);
  const monthBaseline = cumulative(monthStart)
    ?? (oldestPublishedDate && oldestPublishedDate >= monthStart ? 0 : null);
  const priorMonthBaseline = cumulative(priorMonthStart);
  const todayViews = delta(currentViews, yesterdayTotal);
  const yesterdayViews = delta(yesterdayTotal, dayBeforeTotal);
  const weekViews = delta(currentViews, weekBaseline);
  const previousWeekViews = delta(weekBaseline, priorWeekBaseline);
  const monthViews = delta(currentViews, monthBaseline);
  const previousMonthViews = delta(monthBaseline, priorMonthBaseline);

  return {
    timezone: "America/Sao_Paulo",
    as_of: today,
    today: {
      views: todayViews,
      previous_views: yesterdayViews,
      change_percent: percentageChange(todayViews, yesterdayViews),
      available: todayViews != null,
    },
    yesterday: {
      views: yesterdayViews,
      available: yesterdayViews != null,
    },
    week: {
      views: weekViews,
      previous_views: previousWeekViews,
      change_percent: percentageChange(weekViews, previousWeekViews),
      average_per_day: weekViews == null ? null : Math.round(weekViews / 7),
      available: weekViews != null,
    },
    month: {
      views: monthViews,
      previous_views: previousMonthViews,
      change_percent: percentageChange(monthViews, previousMonthViews),
      average_per_day: monthViews == null ? null : Math.round(monthViews / 30),
      available: monthViews != null,
    },
  };
}

async function dashboard(env: Env, baseUrl: string) {
  const row = await env.DB.prepare(`SELECT
    COUNT(*) AS total,
    SUM(CASE WHEN status = 'ready' THEN 1 ELSE 0 END) AS ready,
    SUM(CASE WHEN status = 'failed' THEN 1 ELSE 0 END) AS download_failed,
    SUM(CASE WHEN publish_status = 'awaiting_approval' THEN 1 ELSE 0 END) AS awaiting_approval,
    SUM(CASE WHEN publish_status IN ('creating', 'processing', 'publishing', 'queued') THEN 1 ELSE 0 END) AS publishing,
    SUM(CASE WHEN publish_status = 'published' THEN 1 ELSE 0 END) AS published,
    SUM(CASE WHEN publish_status = 'failed' THEN 1 ELSE 0 END) AS publish_failed,
    COALESCE(SUM(size_bytes), 0) AS stored_bytes,
    SUM(CASE WHEN date(created_at) >= date('now', '-6 days') THEN 1 ELSE 0 END) AS last_seven_days
    FROM reels`).first<Record<string, number | null>>();
  const preferences = await studioSettings(env);
  return {
    metrics: {
      total: Number(row?.total || 0),
      ready: Number(row?.ready || 0),
      awaiting_approval: Number(row?.awaiting_approval || 0),
      publishing: Number(row?.publishing || 0),
      published: Number(row?.published || 0),
      failed: Number(row?.download_failed || 0) + Number(row?.publish_failed || 0),
      stored_bytes: Number(row?.stored_bytes || 0),
      last_seven_days: Number(row?.last_seven_days || 0),
    },
    settings: {
      meta_connected: metaConnected(env),
      direct_configured: directConfigured(env),
      direct_allowed_username: directAllowedUsername(env)
        ? `@${directAllowedUsername(env)}`
        : null,
      resolver_connected: Boolean(env.REEL_RESOLVER_URL),
      ...settingsPayload(preferences, baseUrl),
      account: "@btsupply_",
    },
  };
}

async function analyticsDashboard(env: Env, baseUrl: string) {
  const currentSync = await insightSyncState(env);
  const { results } = await env.DB.prepare(`SELECT
    r.id, r.source_account, r.source_url, r.instagram_media_id, r.instagram_permalink,
    r.published_at, r.created_at, r.completed_at,
    COALESCE(i.views, 0) AS views, COALESCE(i.reach, 0) AS reach,
    COALESCE(i.likes, 0) AS likes, COALESCE(i.comments, 0) AS comments,
    COALESCE(i.saved, 0) AS saved, COALESCE(i.shares, 0) AS shares,
    COALESCE(i.total_interactions, 0) AS total_interactions,
    COALESCE(i.average_watch_time_ms, 0) AS average_watch_time_ms,
    COALESCE(i.total_watch_time_ms, 0) AS total_watch_time_ms,
    i.last_error, i.updated_at
    FROM reels r LEFT JOIN reel_insights i ON i.reel_id = r.id
    WHERE r.publish_status = 'published' AND r.instagram_media_id IS NOT NULL
    ORDER BY views DESC, r.published_at DESC`).all<{
      id: number;
      source_account: string | null;
      source_url: string;
      instagram_media_id: string;
      instagram_permalink: string | null;
      published_at: string | null;
      created_at: string;
      completed_at: string | null;
      views: number;
      reach: number;
      likes: number;
      comments: number;
      saved: number;
      shares: number;
      total_interactions: number;
      average_watch_time_ms: number;
      total_watch_time_ms: number;
      last_error: string | null;
      updated_at: string | null;
    }>();
  const { results: historyRows } = await env.DB.prepare(`SELECT captured_date,
    SUM(views) AS views, SUM(reach) AS reach, SUM(total_interactions) AS total_interactions,
    SUM(shares) AS shares, SUM(saved) AS saved
    FROM reel_insight_snapshots GROUP BY captured_date
    ORDER BY captured_date DESC LIMIT 61`).all<{
      captured_date: string;
      views: number;
      reach: number;
      total_interactions: number;
      shares: number;
      saved: number;
    }>();

  const totals = results.reduce((sum, row) => ({
    views: sum.views + Number(row.views || 0),
    reach: sum.reach + Number(row.reach || 0),
    likes: sum.likes + Number(row.likes || 0),
    comments: sum.comments + Number(row.comments || 0),
    saved: sum.saved + Number(row.saved || 0),
    shares: sum.shares + Number(row.shares || 0),
    interactions: sum.interactions + Number(row.total_interactions || 0),
    watchTimeMs: sum.watchTimeMs + Number(row.total_watch_time_ms || 0),
  }), {
    views: 0,
    reach: 0,
    likes: 0,
    comments: 0,
    saved: 0,
    shares: 0,
    interactions: 0,
    watchTimeMs: 0,
  });
  const successful = results.filter((row) => row.updated_at && !row.last_error);
  const attempted = results.filter((row) => row.updated_at);
  const lastSyncedAt = successful.map((row) => row.updated_at as string).sort().at(-1) || null;
  const lastAttemptAt = attempted.map((row) => row.updated_at as string).sort().at(-1) || null;
  const latestError = currentSync?.last_error
    || results.find((row) => row.last_error)?.last_error
    || null;
  const permissionRequired = /permission|permissão|access token|OAuthException|not authorized|Meta 10\b/i
    .test(latestError || "");
  const attemptTimestamp = databaseTimestamp(lastAttemptAt);
  const refreshDue = results.length > 0 && (
    !Number.isFinite(attemptTimestamp)
    || Date.now() - attemptTimestamp > 15 * 60 * 1000
  );
  const averageViews = results.length ? Math.round(totals.views / results.length) : 0;
  const engagementRate = totals.reach ? (totals.interactions / totals.reach) * 100 : 0;
  const shareRate = totals.views ? (totals.shares / totals.views) * 100 : 0;
  const saveRate = totals.views ? (totals.saved / totals.views) * 100 : 0;
  const oldestPublishedAt = results
    .map((row) => row.published_at)
    .filter((value): value is string => Boolean(value))
    .sort()[0] || null;
  const publicationHistory = Array.from(results.reduce((days, row) => {
    const publishedTimestamp = databaseTimestamp(row.published_at);
    if (!Number.isFinite(publishedTimestamp)) return days;
    const publishedDate = analyticsDateKey(new Date(publishedTimestamp));
    const current = days.get(publishedDate) || { published_date: publishedDate, views: 0, reels: 0 };
    current.views += Number(row.views || 0);
    current.reels += 1;
    days.set(publishedDate, current);
    return days;
  }, new Map<string, { published_date: string; views: number; reels: number }>()).values())
    .sort((left, right) => left.published_date.localeCompare(right.published_date));
  const recommendations: Array<{ title: string; body: string; tone: string }> = [];

  if (!successful.length) {
    recommendations.push({
      title: "Libere os Insights",
      body: "Autorize a leitura de métricas da conta para transformar publicações em decisões baseadas em visualizações reais.",
      tone: "setup",
    });
  } else if (results.length < 5) {
    recommendations.push({
      title: "Amostra ainda pequena",
      body: "As recomendações comparativas serão liberadas após cinco publicações no mesmo padrão, com métricas suficientes nos mesmos marcos.",
      tone: "context",
    });
  } else {
    const top = results[0];
    if (top && totals.views > 0 && top.views / totals.views >= 0.4) {
      recommendations.push({
        title: `Use o Reel #${top.id} como referência`,
        body: `Ele concentra ${Math.round((top.views / totals.views) * 100)}% das visualizações. Repita o tipo de abertura, ritmo e assunto antes de alterar muitos elementos ao mesmo tempo.`,
        tone: "growth",
      });
    }
    if (shareRate < 1) {
      recommendations.push({
        title: "Aumente o potencial de compartilhamento",
        body: "A taxa de compartilhamento está abaixo de 1% das visualizações. Priorize uma situação reconhecível já nos primeiros segundos e um desfecho que dê vontade de enviar a alguém.",
        tone: "action",
      });
    } else {
      recommendations.push({
        title: "Compartilhamentos estão puxando o alcance",
        body: `A taxa atual é ${shareRate.toFixed(1).replace(".", ",")}% por visualização. Preserve o formato dos Reels mais compartilhados e teste apenas uma variável por publicação.`,
        tone: "growth",
      });
    }
    if (saveRate < 0.5) {
      recommendations.push({
        title: "Teste conteúdo que mereça ser revisto",
        body: "Inclua detalhes visuais, listas curtas ou uma virada rápida que incentive o público a salvar e assistir novamente.",
        tone: "action",
      });
    }
  }

  return {
    summary: {
      published_reels: results.length,
      total_views: totals.views,
      average_views: averageViews,
      total_reach: totals.reach,
      total_interactions: totals.interactions,
      engagement_rate: Number(engagementRate.toFixed(2)),
      share_rate: Number(shareRate.toFixed(2)),
      save_rate: Number(saveRate.toFixed(2)),
      total_watch_time_ms: totals.watchTimeMs,
    },
    periods: viewPeriodSummary(totals.views, historyRows, oldestPublishedAt),
    reels: results.map((row, index) => ({
      ...row,
      rank: index + 1,
      downloaded_at: row.completed_at,
      cover_url: `${baseUrl}${COVER_PATH}`,
      engagement_rate: row.reach
        ? Number(((row.total_interactions / row.reach) * 100).toFixed(2))
        : 0,
      share_rate: row.views ? Number(((row.shares / row.views) * 100).toFixed(2)) : 0,
      save_rate: row.views ? Number(((row.saved / row.views) * 100).toFixed(2)) : 0,
      last_error: undefined,
    })),
    history: historyRows.reverse(),
    publication_history: publicationHistory,
    recommendations,
    sync: {
      status: permissionRequired
        ? "permission_required"
        : successful.length
          ? "connected"
          : results.length
            ? "waiting"
            : "empty",
      last_synced_at: lastSyncedAt,
      last_attempt_at: currentSync?.started_at || lastAttemptAt,
      refresh_due: refreshDue,
      refreshing: currentSync?.status === "running",
      total_targets: Number(currentSync?.total_targets || 0),
      updated_targets: Number(currentSync?.updated_targets || 0),
      permission_required: permissionRequired,
      message: permissionRequired
        ? "A conta precisa autorizar instagram_business_manage_insights."
        : currentSync?.status === "failed"
          ? currentSync.last_error
          : null,
    },
  };
}

async function receiveDirectReel(
  senderId: string,
  messageId: string,
  sourceUrl: string,
  env: Env,
  baseUrl: string,
) {
  const existing = await env.DB.prepare(`SELECT id, status FROM reels
    WHERE source_url = ? AND status <> 'failed' ORDER BY id DESC LIMIT 1`)
    .bind(sourceUrl).first<{ id: number; status: string }>();
  if (existing) {
    if (existing.status === "ready") {
      await sendDirectApprovalButton(senderId, existing.id, baseUrl, env);
    } else if (existing.status === "awaiting_rights") {
      await requestDirectRights(senderId, existing.id, env);
    } else {
      await sendInstagramDirectMessage(senderId, {
        text: `Esse Reel já está registrado como #${existing.id} e continua em processamento.`,
      }, env);
    }
    return existing.id;
  }

  await env.DB.prepare(`INSERT OR IGNORE INTO reels
    (message_id, sender_id, source_url, rules, source_account, rights_confirmed, public_token,
      status, publication_mode, share_to_feed, caption, publish_status)
    VALUES (?, ?, ?, 'fixed_cover_caption', NULL, 0, ?, 'awaiting_rights',
      'approval', 1, ?, 'not_requested')`)
    .bind(
      `instagram:${messageId}`,
      `instagram:${senderId}`,
      sourceUrl,
      crypto.randomUUID(),
      FIXED_CAPTION,
    )
    .run();
  const row = await env.DB.prepare(
    "SELECT id FROM reels WHERE message_id = ?",
  ).bind(`instagram:${messageId}`).first<{ id: number }>();
  if (!row?.id) {
    throw new Error("O Reel recebido pelo Direct não pôde ser registrado.");
  }
  await requestDirectRights(senderId, row.id, env);
  return row.id;
}

async function confirmDirectRights(
  senderId: string,
  reelId: number,
  rightsBasis: "owned" | "licensed",
  env: Env,
  baseUrl: string,
) {
  const expectedSender = `instagram:${senderId}`;
  const current = await env.DB.prepare(`SELECT id, status, rights_confirmed FROM reels
    WHERE id = ? AND sender_id = ?`)
    .bind(reelId, expectedSender)
    .first<{ id: number; status: string; rights_confirmed: number }>();
  if (!current) return;

  if (current.rights_confirmed) {
    if (current.status === "ready") {
      await sendDirectApprovalButton(senderId, reelId, baseUrl, env);
    } else {
      await sendInstagramDirectMessage(senderId, {
        text: `Os direitos do Reel #${reelId} já foram confirmados. O MP4 continua sendo preparado.`,
      }, env);
    }
    return;
  }
  if (current.status !== "awaiting_rights") return;

  await createContentTargets(reelId, {
    instagramEnabled: true,
    youtubeEnabled: false,
    rightsBasis,
    context: `Recebido por Instagram Direct de @${directAllowedUsername(env)}.`,
    madeForKids: false,
    containsSyntheticMedia: false,
    paidProductPlacement: false,
  }, env);
  const claimed = await env.DB.prepare(`UPDATE reels SET rights_confirmed = 1,
    status = 'queued', publish_status = 'awaiting_download', error = NULL
    WHERE id = ? AND sender_id = ? AND status = 'awaiting_rights' AND rights_confirmed = 0`)
    .bind(reelId, expectedSender)
    .run();
  if (!claimed.meta.changes) return;
  const record = await reelById(reelId, env);
  if (!record) throw new Error("O Reel confirmado no Direct não pôde ser recarregado.");
  await sendInstagramDirectMessage(senderId, {
    text: `Autorização registrada para o Reel #${reelId}. O MP4 será baixado e preparado agora.`,
  }, env);
  await processReel(record, env, baseUrl);
}

async function handleInstagramDirectWebhook(
  payload: InstagramWebhookPayload,
  env: Env,
  baseUrl: string,
) {
  for (const event of instagramWebhookMessages(payload)) {
    try {
      const message = event.message;
      const senderId = event.sender?.id || "";
      const recipientId = event.recipient?.id || "";
      const messageId = message?.mid || "";
      if (!message || !senderId || !messageId || message.is_echo) continue;
      if (env.INSTAGRAM_USER_ID && recipientId && recipientId !== env.INSTAGRAM_USER_ID) continue;
      if (!await authorizedDirectSender(senderId, env)) continue;

      const rightsMatch = (message.quick_reply?.payload || "").match(DIRECT_RIGHTS_PAYLOAD);
      if (rightsMatch) {
        const rightsBasis = rightsMatch[1] === "licensed" ? "licensed" : "owned";
        await confirmDirectRights(senderId, Number(rightsMatch[2]), rightsBasis, env, baseUrl);
        continue;
      }

      const sourceUrl = directSharedReelUrl(message);
      if (sourceUrl) {
        await receiveDirectReel(senderId, messageId, sourceUrl, env, baseUrl);
      }
    } catch (error) {
      console.error("Falha ao processar um evento assinado do Instagram Direct.", error);
    }
  }
}

async function api(request: Request, env: Env, ctx: ExecutionContext): Promise<Response | null> {
  const url = new URL(request.url);
  const instagramWebhookRoute = url.pathname === "/webhooks/instagram";
  const isPublicDownload = /^\/download\/[0-9a-f-]{36}$/i.test(url.pathname);
  const publishMediaMatch = url.pathname.match(/^\/publish-media\/(\d+)\.mp4$/);
  const publishCoverMatch = url.pathname.match(/^\/publish-cover\/(\d+)\.jpg$/);
  const workerMediaRoute = /^\/worker-media\/\d+\.mp4$/.test(url.pathname);
  if (!url.pathname.startsWith("/api/") && !instagramWebhookRoute && !isPublicDownload
    && !publishMediaMatch && !publishCoverMatch && !workerMediaRoute) return null;

  if (instagramWebhookRoute && request.method === "GET") {
    const mode = url.searchParams.get("hub.mode");
    const token = url.searchParams.get("hub.verify_token");
    const challenge = url.searchParams.get("hub.challenge");
    if (mode === "subscribe" && challenge && env.META_VERIFY_TOKEN && token === env.META_VERIFY_TOKEN) {
      return new Response(challenge, {
        headers: {
          "content-type": "text/plain; charset=utf-8",
          "cache-control": "no-store",
          "x-content-type-options": "nosniff",
        },
      });
    }
    return json({ error: "Verificação do webhook recusada." }, { status: 403 });
  }

  if (instagramWebhookRoute && request.method === "POST") {
    const rawBody = await request.arrayBuffer();
    const validSignature = await verifyMetaWebhookSignature(
      rawBody,
      request.headers.get("x-hub-signature-256"),
      env.META_APP_SECRET,
    );
    if (!validSignature) return json({ error: "Assinatura do webhook inválida." }, { status: 401 });
    let payload: InstagramWebhookPayload;
    try {
      payload = JSON.parse(new TextDecoder().decode(rawBody)) as InstagramWebhookPayload;
    } catch {
      return json({ error: "Corpo do webhook inválido." }, { status: 400 });
    }
    await ensureDatabase(env);
    const baseUrl = publicBaseUrl(request.url, env);
    ctx.waitUntil(handleInstagramDirectWebhook(payload, env, baseUrl));
    return json({ received: true });
  }

  await ensureDatabase(env);
  const baseUrl = publicBaseUrl(request.url, env);
  const youtubeResponse = await handleYouTubeRequest(request, env, {
    userEmail: authenticatedEmail(request),
    validUser: validInboxUser(request, env),
    validOrigin: validWriteOrigin(request),
  });
  if (youtubeResponse) return youtubeResponse;

  if (publishMediaMatch && (request.method === "GET" || request.method === "HEAD")) {
    const reelId = Number(publishMediaMatch[1]);
    if (!await validMediaSignature(reelId, url, env)) {
      return json({ error: "Link de publicação inválido ou expirado." }, { status: 403 });
    }
    const row = await env.DB.prepare(
      "SELECT storage_key, filename, content_type FROM reels WHERE id = ? AND status = 'ready'",
    ).bind(reelId).first<{ storage_key: string; filename: string; content_type: string }>();
    return serveVideo(row, env, { attachment: false, method: request.method });
  }

  if (publishCoverMatch && (request.method === "GET" || request.method === "HEAD")) {
    const reelId = Number(publishCoverMatch[1]);
    if (!await validMediaSignature(reelId, url, env)) {
      return json({ error: "Link de capa inválido ou expirado." }, { status: 403 });
    }
    const row = await env.DB.prepare(
      "SELECT cover_key FROM reels WHERE id = ? AND cover_mode = 'fixed'",
    ).bind(reelId).first<{ cover_key: string | null }>();
    const contentType = row?.cover_key?.endsWith(".png")
      ? "image/png"
      : row?.cover_key?.endsWith(".webp")
        ? "image/webp"
        : "image/jpeg";
    return serveCover(row ? { ...row, content_type: contentType } : null, env, request.method, true);
  }

  if (url.pathname === "/api/reels" && request.method === "GET") {
    if (!validInboxUser(request, env) && !validAdmin(request, env)) {
      return json({ error: "Não autorizado." }, { status: 401 });
    }
    return json({ reels: await listReels(env, baseUrl) });
  }

  if (url.pathname === "/api/dashboard" && request.method === "GET") {
    if (!validInboxUser(request, env)) return json({ error: "Não autorizado." }, { status: 401 });
    if (env.PUBLIC_BASE_URL) ctx.waitUntil(processPublicationQueue(env, baseUrl));
    return json(await dashboard(env, baseUrl));
  }

  if (url.pathname === "/api/studio-settings" && request.method === "PUT") {
    if (!validInboxUser(request, env)) return json({ error: "Não autorizado." }, { status: 401 });
    if (!validWriteOrigin(request)) return json({ error: "Origem inválida." }, { status: 403 });
    const data = await request.json() as {
      captionEnabled?: boolean;
      caption?: string;
      coverMode?: string;
      autoPublishEnabled?: boolean;
      publishIntervalMinutes?: number;
    };
    const caption = typeof data.caption === "string" ? data.caption.trim().slice(0, 2200) : "";
    const coverMode = sanitizeCoverMode(data.coverMode);
    const interval = sanitizeInterval(data.publishIntervalMinutes);
    const previous = await studioSettings(env);
    const autoPublishEnabled = data.autoPublishEnabled === true;
    await env.DB.prepare(`UPDATE studio_settings SET caption_enabled = ?, default_caption = ?,
      cover_mode = ?, auto_publish_enabled = ?, publish_interval_minutes = ?,
      updated_at = CURRENT_TIMESTAMP WHERE id = 1`)
      .bind(data.captionEnabled === false ? 0 : 1, caption, coverMode,
        autoPublishEnabled ? 1 : 0, interval)
      .run();
    if (autoPublishEnabled && (
      !previous.auto_publish_enabled || previous.publish_interval_minutes !== interval
    )) {
      await reschedulePublicationQueue(env, interval);
    }
    return json({ settings: settingsPayload(await studioSettings(env), baseUrl) });
  }

  if (url.pathname === "/api/instagram/direct/subscribe" && request.method === "POST") {
    if (!validInboxUser(request, env)) return json({ error: "Não autorizado." }, { status: 401 });
    if (!validWriteOrigin(request)) return json({ error: "Origem inválida." }, { status: 403 });
    if (!directConfigured(env)) {
      return json({
        error: "Configure o segredo do aplicativo, o token de verificação e o remetente autorizado antes de ativar o Direct.",
      }, { status: 503 });
    }
    return json(await subscribeInstagramDirect(env));
  }

  if (url.pathname === "/api/studio-settings/cover" && request.method === "GET") {
    if (!validInboxUser(request, env)) return json({ error: "Não autorizado." }, { status: 401 });
    const settings = await studioSettings(env);
    return serveCover({
      cover_key: settings.fixed_cover_key,
      content_type: settings.fixed_cover_content_type,
    }, env);
  }

  if (url.pathname === "/api/studio-settings/cover" && request.method === "POST") {
    if (!validInboxUser(request, env)) return json({ error: "Não autorizado." }, { status: 401 });
    if (!validWriteOrigin(request)) return json({ error: "Origem inválida." }, { status: 403 });
    const form = await request.formData();
    const file = form.get("cover");
    if (!(file instanceof File)) return json({ error: "Selecione uma imagem para a capa." }, { status: 400 });
    const allowedTypes = new Map([
      ["image/jpeg", "jpg"],
      ["image/png", "png"],
      ["image/webp", "webp"],
    ]);
    const extension = allowedTypes.get(file.type);
    if (!extension) return json({ error: "Use uma imagem JPG, PNG ou WebP." }, { status: 415 });
    if (file.size > 8 * 1024 * 1024) return json({ error: "A capa deve ter no máximo 8 MB." }, { status: 413 });
    const key = `studio/covers/${crypto.randomUUID()}.${extension}`;
    await env.VIDEOS.put(key, await file.arrayBuffer(), {
      httpMetadata: { contentType: file.type },
      customMetadata: { uploadedBy: authenticatedEmail(request), originalName: file.name.slice(0, 160) },
    });
    await env.DB.prepare(`UPDATE studio_settings SET fixed_cover_key = ?,
      fixed_cover_content_type = ?, cover_mode = 'fixed', updated_at = CURRENT_TIMESTAMP
      WHERE id = 1`).bind(key, file.type).run();
    return json({ settings: settingsPayload(await studioSettings(env), baseUrl) }, { status: 201 });
  }

  if (url.pathname === "/api/analytics" && request.method === "GET") {
    if (!validInboxUser(request, env)) return json({ error: "Não autorizado." }, { status: 401 });
    return json(await analyticsDashboard(env, baseUrl));
  }

  if (url.pathname === "/api/analytics/refresh" && request.method === "POST") {
    if (!validInboxUser(request, env)) return json({ error: "Não autorizado." }, { status: 401 });
    if (!validWriteOrigin(request)) return json({ error: "Origem inválida." }, { status: 403 });
    if (!metaConnected(env)) {
      return json({ error: "Conecte o Instagram antes de atualizar as métricas." }, { status: 503 });
    }
    const accepted = await startInsightRefresh(env, ctx);
    return json({ accepted, already_running: !accepted }, { status: 202 });
  }

  if (url.pathname === "/api/reels/intake" && request.method === "POST") {
    if (!validInboxUser(request, env)) return json({ error: "Não autorizado." }, { status: 401 });
    if (!validWriteOrigin(request)) return json({ error: "Origem inválida." }, { status: 403 });
    const data = await request.json() as {
      url?: string;
      rules?: string;
      sourceAccount?: string;
      rightsConfirmed?: boolean;
      publicationMode?: string;
      shareToFeed?: boolean;
      destinations?: Array<"instagram" | "youtube">;
      rightsBasis?: "owned" | "licensed";
      context?: string;
      madeForKids?: boolean;
      containsSyntheticMedia?: boolean;
      paidProductPlacement?: boolean;
    };
    const sourceUrl = findInstagramUrl(data?.url);
    if (!sourceUrl) return json({ error: "Informe uma URL válida de Reel público." }, { status: 400 });
    if (data.rightsConfirmed !== true) {
      return json({ error: "Confirme que o conteúdo pode ser baixado e utilizado." }, { status: 400 });
    }
    const email = authenticatedEmail(request);
    const result = await queueReel({
      messageId: `web-${crypto.randomUUID()}`,
      senderId: `web:${email}`,
      sourceUrl,
      rules: sanitizeText(data.rules, 100),
      sourceAccount: sanitizeText(data.sourceAccount, 80),
      rightsConfirmed: true,
      publicationMode: sanitizePublicationMode(data.publicationMode),
      shareToFeed: data.shareToFeed !== false,
      targets: sanitizeTargets(data.destinations, data, ["instagram"]),
    }, env, ctx);
    return json(result, {
      status: result.accepted ? 202 : result.reason === "duplicate" ? 200 : 400,
    });
  }

  const publishMatch = url.pathname.match(/^\/api\/reels\/(\d+)\/publish$/);
  if (publishMatch && request.method === "POST") {
    if (!validInboxUser(request, env)) return json({ error: "Não autorizado." }, { status: 401 });
    if (!validWriteOrigin(request)) return json({ error: "Origem inválida." }, { status: 403 });
    const record = await reelById(Number(publishMatch[1]), env);
    if (!record) return json({ error: "Reel não encontrado." }, { status: 404 });
    if (record.status !== "ready") return json({ error: "O MP4 ainda não está pronto." }, { status: 409 });
    const data = await request.json().catch(() => ({})) as {
      rightsConfirmed?: boolean;
      destinations?: Array<"instagram" | "youtube">;
      rightsBasis?: "owned" | "licensed";
      context?: string;
      madeForKids?: boolean;
      containsSyntheticMedia?: boolean;
      paidProductPlacement?: boolean;
    };
    if (Array.isArray(data.destinations)) {
      const targets = sanitizeTargets(data.destinations, data, []);
      if (!targets.instagramEnabled && !targets.youtubeEnabled) {
        return json({ error: "Selecione Instagram, YouTube ou ambos." }, { status: 400 });
      }
      if (data.rightsConfirmed !== true) {
        return json({ error: "Confirme os direitos antes de aprovar os destinos." }, { status: 400 });
      }
      await createContentTargets(record.id, targets, env);
    }
    const destinations = await publicationDestinations(record.id, env);
    if (record.publish_status === "published") {
      if (!destinations.youtube) {
        return json({ error: "Este Reel já foi publicado no Instagram." }, { status: 409 });
      }
      const currentYouTube = await env.DB.prepare(
        "SELECT status FROM youtube_publications WHERE reel_id = ?",
      ).bind(record.id).first<{ status: string }>();
      if (currentYouTube?.status === "published") {
        return json({ error: "Este Reel já foi publicado no Instagram e no YouTube." }, { status: 409 });
      }
      const youtube = await queueYouTubePublication(
        record.id,
        record.source_account,
        Boolean(record.rights_confirmed),
        env,
      );
      if (youtube.status === "queued") {
        ctx.waitUntil(dispatchYouTubeExecutor(env));
      }
      await env.DB.prepare(
        "UPDATE reels SET approved_at = COALESCE(approved_at, CURRENT_TIMESTAMP) WHERE id = ?",
      ).bind(record.id).run();
      return json({
        accepted: true,
        id: record.id,
        queued: false,
        instagramAlreadyPublished: true,
        youtube,
      }, { status: 202 });
    }
    if (["creating", "processing", "publishing"].includes(record.publish_status)) {
      const youtube = await queueYouTubePublication(
        record.id,
        record.source_account,
        Boolean(record.rights_confirmed),
        env,
      );
      if (youtube.status === "queued") {
        ctx.waitUntil(dispatchYouTubeExecutor(env));
      }
      ctx.waitUntil(publishReel(record, env, baseUrl));
      return json({ accepted: true, id: record.id, queued: false, youtube }, { status: 202 });
    }
    const result = await approveReel(record, env, baseUrl, ctx);
    return json({ accepted: true, id: record.id, ...result }, { status: 202 });
  }

  if (url.pathname === "/api/publication-queue/process" && request.method === "POST") {
    if (!validInboxUser(request, env)) return json({ error: "Não autorizado." }, { status: 401 });
    if (!validWriteOrigin(request)) return json({ error: "Origem inválida." }, { status: 403 });
    return json(await processPublicationQueue(env, baseUrl));
  }

  if (url.pathname === "/api/inbox/status" && request.method === "GET") {
    if (!validInboxUser(request, env)) return json({ error: "Não autorizado." }, { status: 401 });
    return json({
      user: authenticatedEmail(request),
      instagram: metaConnected(env),
      youtube: await youtubeConnection(env),
      resolver: Boolean(env.REEL_RESOLVER_URL),
      storage: true,
    });
  }

  if (url.pathname === "/api/integrations/status" && request.method === "GET") {
    if (!validAdmin(request, env)) return json({ error: "Não autorizado." }, { status: 401 });
    return json({
      inbox: { allowedEmails: configuredInboxEmails(env).length },
      instagram: {
        token: Boolean(env.INSTAGRAM_ACCESS_TOKEN),
        userId: Boolean(env.INSTAGRAM_USER_ID),
        apiVersion: env.INSTAGRAM_API_VERSION || null,
      },
      youtube: await youtubeConnection(env),
      resolver: Boolean(env.REEL_RESOLVER_URL),
      storage: true,
    });
  }

  if (url.pathname === "/api/reels/manual" && request.method === "POST") {
    if (!validAdmin(request, env)) return json({ error: "Não autorizado." }, { status: 401 });
    const data = await request.json() as {
      url?: string;
      rules?: string;
      sourceAccount?: string;
      publicationMode?: string;
      shareToFeed?: boolean;
      destinations?: Array<"instagram" | "youtube">;
      rightsBasis?: "owned" | "licensed";
      context?: string;
      madeForKids?: boolean;
      containsSyntheticMedia?: boolean;
      paidProductPlacement?: boolean;
    };
    const sourceUrl = findInstagramUrl(data?.url);
    if (!sourceUrl) return json({ error: "Informe uma URL válida de Reel público." }, { status: 400 });
    const result = await queueReel({
      messageId: `manual-${crypto.randomUUID()}`,
      senderId: "manual",
      sourceUrl,
      rules: sanitizeText(data.rules, 100),
      sourceAccount: sanitizeText(data.sourceAccount, 80),
      rightsConfirmed: true,
      publicationMode: sanitizePublicationMode(data.publicationMode),
      shareToFeed: data.shareToFeed !== false,
      targets: sanitizeTargets(data.destinations, data, ["instagram"]),
    }, env, ctx);
    return json(result, { status: result.accepted ? 202 : result.reason === "duplicate" ? 200 : 400 });
  }

  const adminDownloadMatch = url.pathname.match(/^\/api\/reels\/(\d+)\/download$/);
  if (adminDownloadMatch && request.method === "GET") {
    if (!validAdmin(request, env)) return json({ error: "Não autorizado." }, { status: 401 });
    const row = await env.DB.prepare(
      "SELECT storage_key, filename, content_type FROM reels WHERE id = ? AND status = 'ready'",
    ).bind(Number(adminDownloadMatch[1])).first<{ storage_key: string; filename: string; content_type: string }>();
    return serveVideo(row, env);
  }

  const publicDownloadMatch = url.pathname.match(/^\/download\/([0-9a-f-]{36})$/i);
  if (publicDownloadMatch && request.method === "GET") {
    const row = await env.DB.prepare(
      "SELECT storage_key, filename, content_type FROM reels WHERE public_token = ? AND status = 'ready'",
    ).bind(publicDownloadMatch[1]).first<{ storage_key: string; filename: string; content_type: string }>();
    return serveVideo(row, env);
  }

  return json({ error: "Rota não encontrada." }, { status: 404 });
}

const worker = {
  async fetch(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
    const url = new URL(request.url);
    if (url.pathname === "/_vinext/image") {
      const allowedWidths = [...DEFAULT_DEVICE_SIZES, ...DEFAULT_IMAGE_SIZES];
      return handleImageOptimization(request, {
        fetchAsset: (path) => env.ASSETS.fetch(new Request(new URL(path, request.url))),
        transformImage: async (body, { width, format, quality }) => {
          const result = await env.IMAGES.input(body)
            .transform(width > 0 ? { width } : {})
            .output({ format, quality });
          return result.response();
        },
      }, allowedWidths);
    }
    const apiResponse = await api(request, env, ctx);
    return apiResponse ?? handler.fetch(request, env, ctx);
  },
  async scheduled(controller: ScheduledController, env: Env, ctx: ExecutionContext) {
    await ensureDatabase(env);
    if (!env.PUBLIC_BASE_URL) return;
    ctx.waitUntil(processPublicationQueue(env, env.PUBLIC_BASE_URL.replace(/\/+$/, "")));
    if (new Date(controller.scheduledTime).getUTCMinutes() === 5) {
      if (metaConnected(env)) await startInsightRefresh(env, ctx);
    }
  },
};

export default worker;
