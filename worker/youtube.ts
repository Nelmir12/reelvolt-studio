export interface YouTubeEnv {
  DB: D1Database;
  VIDEOS: R2Bucket;
  PUBLIC_BASE_URL?: string;
  YOUTUBE_CLIENT_ID?: string;
  YOUTUBE_CLIENT_SECRET?: string;
  YOUTUBE_TOKEN_SECRET?: string;
  YOUTUBE_WORKER_SECRET?: string;
  YOUTUBE_API_AUDITED?: string;
  YOUTUBE_EXECUTOR_MODE?: string;
  GITHUB_ACTIONS_TOKEN?: string;
  GITHUB_REPOSITORY?: string;
  GITHUB_WORKFLOW_ID?: string;
  GITHUB_WORKFLOW_REF?: string;
  OWNED_SOURCE_ACCOUNTS?: string;
  OPENAI_API_KEY?: string;
  OPENAI_METADATA_MODEL?: string;
  OPENAI_TRANSCRIPTION_MODEL?: string;
  OPENAI_MODERATION_MODEL?: string;
}

export type YouTubeRequestAuth = {
  userEmail: string;
  validUser: boolean;
  validOrigin: boolean;
};

export type ContentTargetInput = {
  instagramEnabled: boolean;
  youtubeEnabled: boolean;
  rightsBasis: "owned" | "licensed";
  context: string;
  madeForKids: boolean;
  containsSyntheticMedia: boolean;
  paidProductPlacement: boolean;
};

type YouTubePublicationRow = {
  id: number;
  reel_id: number;
  status: string;
  error: string | null;
  title: string | null;
  description: string | null;
  tags_json: string | null;
  video_id: string | null;
  video_url: string | null;
  studio_url: string | null;
  privacy_status: string;
  attempt_count: number;
  duration_ms: number | null;
  width_pixels: number | null;
  height_pixels: number | null;
  codec: string | null;
  has_audio: number | null;
  warning_long_claim: number;
  technical_eligible: number;
  checks_confirmed_at: string | null;
  requested_at: string | null;
  uploaded_at: string | null;
  published_at: string | null;
  worker_heartbeat_at: string | null;
  updated_at: string;
};

type GoogleTokenResponse = {
  access_token?: string;
  refresh_token?: string;
  expires_in?: number;
  scope?: string;
  error?: string;
  error_description?: string;
};

const YOUTUBE_SCOPES = [
  "https://www.googleapis.com/auth/youtube.upload",
  "https://www.googleapis.com/auth/youtube.readonly",
  "https://www.googleapis.com/auth/yt-analytics.readonly",
];

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

function json(data: unknown, init: ResponseInit = {}) {
  const headers = new Headers(init.headers);
  headers.set("content-type", "application/json; charset=utf-8");
  headers.set("cache-control", "no-store");
  headers.set("x-content-type-options", "nosniff");
  return new Response(JSON.stringify(data), { ...init, headers });
}

function cleanText(value: unknown, maxLength: number) {
  return typeof value === "string" ? value.trim().slice(0, maxLength) : "";
}

function boolEnv(value: string | undefined) {
  return /^(1|true|yes)$/i.test(value || "");
}

function base64Url(bytes: ArrayBuffer | Uint8Array) {
  const values = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);
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

async function encryptionKey(secret: string) {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(secret));
  return crypto.subtle.importKey("raw", digest, "AES-GCM", false, ["encrypt", "decrypt"]);
}

async function encrypt(value: string, secret: string) {
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const encrypted = new Uint8Array(await crypto.subtle.encrypt(
    { name: "AES-GCM", iv },
    await encryptionKey(secret),
    new TextEncoder().encode(value),
  ));
  const packed = new Uint8Array(iv.length + encrypted.length);
  packed.set(iv);
  packed.set(encrypted, iv.length);
  return base64Url(packed);
}

async function decrypt(value: string, secret: string) {
  const packed = fromBase64Url(value);
  if (packed.length <= 12) throw new Error("Credencial criptografada inválida.");
  const decrypted = await crypto.subtle.decrypt(
    { name: "AES-GCM", iv: packed.slice(0, 12) },
    await encryptionKey(secret),
    packed.slice(12),
  );
  return new TextDecoder().decode(decrypted);
}

async function sha256(value: string) {
  return base64Url(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value)));
}

async function hmac(value: string, secret: string) {
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  return base64Url(await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(value)));
}

function ownedSourceAccount(sourceAccount: string | null, env: YouTubeEnv) {
  const allowed = (env.OWNED_SOURCE_ACCOUNTS || "@btsupply_")
    .split(",")
    .map((account) => account.trim().toLowerCase().replace(/^@?/, "@"))
    .filter(Boolean);
  const normalized = (sourceAccount || "").trim().toLowerCase().replace(/^@?/, "@");
  return Boolean(normalized && allowed.includes(normalized));
}

export function youtubeConfigured(env: YouTubeEnv) {
  const executorMode = (env.YOUTUBE_EXECUTOR_MODE || "external").toLowerCase();
  const executorConfigured = executorMode !== "github"
    || Boolean(env.GITHUB_ACTIONS_TOKEN && env.GITHUB_REPOSITORY && env.GITHUB_WORKFLOW_ID);
  return Boolean(
    env.YOUTUBE_CLIENT_ID
    && env.YOUTUBE_CLIENT_SECRET
    && env.YOUTUBE_TOKEN_SECRET
    && env.YOUTUBE_WORKER_SECRET
    && executorConfigured,
  );
}

export async function dispatchYouTubeExecutor(env: YouTubeEnv) {
  if ((env.YOUTUBE_EXECUTOR_MODE || "").toLowerCase() !== "github") {
    return { dispatched: false, reason: "executor_not_github" };
  }
  if (!env.GITHUB_ACTIONS_TOKEN || !env.GITHUB_REPOSITORY || !env.GITHUB_WORKFLOW_ID) {
    return { dispatched: false, reason: "github_not_configured" };
  }
  const candidate = await env.DB.prepare(`SELECT id, status FROM youtube_publications
    WHERE (
      status IN ('queued', 'retrying')
      AND (next_attempt_at IS NULL OR datetime(next_attempt_at) <= CURRENT_TIMESTAMP)
    ) OR (
      status = 'dispatched'
      AND datetime(next_attempt_at) <= CURRENT_TIMESTAMP
    )
    ORDER BY COALESCE(next_attempt_at, requested_at, created_at), id
    LIMIT 1`).first<{ id: number; status: string }>();
  if (!candidate) return { dispatched: false, reason: "empty_queue" };
  const reserved = await env.DB.prepare(`UPDATE youtube_publications
    SET status = 'dispatched', next_attempt_at = datetime('now', '+10 minutes'),
      error = NULL, updated_at = CURRENT_TIMESTAMP
    WHERE id = ? AND status = ?`).bind(candidate.id, candidate.status).run();
  if (!reserved.meta.changes) return { dispatched: false, reason: "already_dispatched" };
  const workflow = encodeURIComponent(env.GITHUB_WORKFLOW_ID);
  const response = await fetch(
    `https://api.github.com/repos/${env.GITHUB_REPOSITORY}/actions/workflows/${workflow}/dispatches`,
    {
      method: "POST",
      headers: {
        accept: "application/vnd.github+json",
        authorization: `Bearer ${env.GITHUB_ACTIONS_TOKEN}`,
        "content-type": "application/json",
        "user-agent": "ReelVolt-Studio",
        "x-github-api-version": "2022-11-28",
      },
      body: JSON.stringify({ ref: env.GITHUB_WORKFLOW_REF || "master" }),
    },
  );
  if (!response.ok) {
    const message = cleanText(await response.text(), 500);
    await env.DB.prepare(`UPDATE youtube_publications SET status = ?,
      next_attempt_at = CURRENT_TIMESTAMP, error = ?, updated_at = CURRENT_TIMESTAMP
      WHERE id = ? AND status = 'dispatched'`).bind(
        candidate.status === "retrying" ? "retrying" : "queued",
        `O executor gratuito não pôde ser acionado (HTTP ${response.status}). ${message}`,
        candidate.id,
      ).run();
    throw new Error(`GitHub Actions recusou o acionamento (HTTP ${response.status}).`);
  }
  return { dispatched: true, jobId: candidate.id };
}

export async function youtubeConnection(env: YouTubeEnv) {
  const row = await env.DB.prepare(
    "SELECT channel_id, channel_title, scopes, updated_at FROM youtube_auth WHERE id = 1",
  ).first<{ channel_id: string; channel_title: string; scopes: string; updated_at: string }>();
  return {
    configured: youtubeConfigured(env),
    connected: Boolean(row),
    audited: boolEnv(env.YOUTUBE_API_AUDITED),
    channel_id: row?.channel_id || null,
    channel_title: row?.channel_title || null,
    scopes: row?.scopes?.split(" ").filter(Boolean) || [],
    connected_at: row?.updated_at || null,
  };
}

export async function createContentTargets(
  reelId: number,
  input: ContentTargetInput,
  env: YouTubeEnv,
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
      input.youtubeEnabled ? 1 : 0,
      input.rightsBasis,
      input.context || null,
      input.madeForKids ? 1 : 0,
      input.containsSyntheticMedia ? 1 : 0,
      input.paidProductPlacement ? 1 : 0,
    )
    .run();
  if (input.youtubeEnabled) {
    await env.DB.prepare(`INSERT OR IGNORE INTO youtube_publications
      (reel_id, status, privacy_status) VALUES (?, 'awaiting_approval', 'private')`)
      .bind(reelId)
      .run();
  }
}

export async function publicationDestinations(reelId: number, env: YouTubeEnv) {
  const row = await env.DB.prepare(
    "SELECT instagram_enabled, youtube_enabled FROM content_reviews WHERE reel_id = ?",
  ).bind(reelId).first<{ instagram_enabled: number; youtube_enabled: number }>();
  return {
    instagram: row ? Boolean(row.instagram_enabled) : true,
    youtube: row ? Boolean(row.youtube_enabled) : false,
  };
}

export async function queueYouTubePublication(
  reelId: number,
  sourceAccount: string | null,
  rightsConfirmed: boolean,
  env: YouTubeEnv,
) {
  const review = await env.DB.prepare(`SELECT youtube_enabled, rights_basis, moderation_status
    FROM content_reviews WHERE reel_id = ?`).bind(reelId).first<{
      youtube_enabled: number;
      rights_basis: string;
      moderation_status: string;
    }>();
  if (!review?.youtube_enabled) return { requested: false, status: "not_requested" };
  if (!rightsConfirmed || !["owned", "licensed"].includes(review.rights_basis)) {
    await env.DB.prepare(`UPDATE youtube_publications SET status = 'blocked',
      error = 'Confirme os direitos de imagem, edição e áudio antes do envio.',
      updated_at = CURRENT_TIMESTAMP WHERE reel_id = ?`).bind(reelId).run();
    return { requested: true, status: "blocked" };
  }
  if (review.rights_basis === "owned" && !ownedSourceAccount(sourceAccount, env)) {
    await env.DB.prepare(`UPDATE youtube_publications SET status = 'blocked',
      error = 'A conta de origem não está na lista de contas próprias.',
      updated_at = CURRENT_TIMESTAMP WHERE reel_id = ?`).bind(reelId).run();
    return { requested: true, status: "blocked" };
  }
  const nextStatus = youtubeConfigured(env) ? "queued" : "awaiting_setup";
  await env.DB.prepare(`UPDATE youtube_publications SET status = ?, error = ?,
    requested_at = COALESCE(requested_at, CURRENT_TIMESTAMP), next_attempt_at = CURRENT_TIMESTAMP,
    lease_token = NULL, lease_expires_at = NULL, updated_at = CURRENT_TIMESTAMP
    WHERE reel_id = ? AND status <> 'published'`)
    .bind(
      nextStatus,
      nextStatus === "awaiting_setup" ? "Conecte e configure o YouTube para iniciar o upload privado." : null,
      reelId,
    )
    .run();
  return { requested: true, status: nextStatus };
}

function parseTags(value: string | null) {
  if (!value) return [];
  try {
    const parsed = JSON.parse(value);
    return Array.isArray(parsed) ? parsed.filter((tag) => typeof tag === "string").slice(0, 3) : [];
  } catch {
    return [];
  }
}

function publicationPayload(row: YouTubePublicationRow | null) {
  if (!row) return null;
  return {
    id: row.id,
    status: row.status,
    error: row.error,
    title: row.title,
    description: row.description,
    tags: parseTags(row.tags_json),
    video_id: row.video_id,
    video_url: row.video_url,
    studio_url: row.studio_url,
    privacy_status: row.privacy_status,
    attempt_count: row.attempt_count,
    duration_ms: row.duration_ms,
    width_pixels: row.width_pixels,
    height_pixels: row.height_pixels,
    codec: row.codec,
    has_audio: row.has_audio == null ? null : Boolean(row.has_audio),
    warning_long_claim: Boolean(row.warning_long_claim),
    technical_eligible: Boolean(row.technical_eligible),
    checks_confirmed_at: row.checks_confirmed_at,
    requested_at: row.requested_at,
    uploaded_at: row.uploaded_at,
    published_at: row.published_at,
    worker_heartbeat_at: row.worker_heartbeat_at,
    updated_at: row.updated_at,
  };
}

export async function youtubeSummaries(reelIds: number[], env: YouTubeEnv) {
  if (!reelIds.length) return new Map<number, ReturnType<typeof publicationPayload>>();
  const placeholders = reelIds.map(() => "?").join(",");
  const { results } = await env.DB.prepare(`SELECT id, reel_id, status, error, title, description,
    tags_json, video_id, video_url, studio_url, privacy_status, attempt_count, duration_ms,
    width_pixels, height_pixels, codec, has_audio, warning_long_claim, technical_eligible,
    checks_confirmed_at, requested_at, uploaded_at, published_at, worker_heartbeat_at, updated_at
    FROM youtube_publications WHERE reel_id IN (${placeholders})`)
    .bind(...reelIds)
    .all<YouTubePublicationRow>();
  return new Map(results.map((row) => [row.reel_id, publicationPayload(row)]));
}

async function googleAccessToken(env: YouTubeEnv) {
  if (!env.YOUTUBE_CLIENT_ID || !env.YOUTUBE_CLIENT_SECRET || !env.YOUTUBE_TOKEN_SECRET) {
    throw new Error("A integração com o YouTube não está configurada.");
  }
  const auth = await env.DB.prepare(
    "SELECT refresh_token_cipher FROM youtube_auth WHERE id = 1",
  ).first<{ refresh_token_cipher: string }>();
  if (!auth) throw new Error("Conecte o canal do YouTube.");
  const refreshToken = await decrypt(auth.refresh_token_cipher, env.YOUTUBE_TOKEN_SECRET);
  const response = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: env.YOUTUBE_CLIENT_ID,
      client_secret: env.YOUTUBE_CLIENT_SECRET,
      refresh_token: refreshToken,
      grant_type: "refresh_token",
    }),
  });
  const result = await response.json() as GoogleTokenResponse;
  if (!response.ok || !result.access_token) {
    throw new Error(result.error_description || "Não foi possível renovar a conexão com o YouTube.");
  }
  return result.access_token;
}

async function googleJson(url: string, accessToken: string, init: RequestInit = {}) {
  const headers = new Headers(init.headers);
  headers.set("authorization", `Bearer ${accessToken}`);
  if (init.body && !headers.has("content-type")) headers.set("content-type", "application/json");
  const response = await fetch(url, { ...init, headers });
  const data = await response.json() as Record<string, unknown>;
  if (!response.ok) {
    const error = data.error as { message?: string } | undefined;
    throw new Error(error?.message || `O YouTube recusou a solicitação (HTTP ${response.status}).`);
  }
  return data;
}

async function startOAuth(request: Request, env: YouTubeEnv, auth: YouTubeRequestAuth) {
  if (!auth.validUser) return json({ error: "Não autorizado." }, { status: 401 });
  if (!env.YOUTUBE_CLIENT_ID || !env.YOUTUBE_CLIENT_SECRET || !env.YOUTUBE_TOKEN_SECRET) {
    return json({ error: "Configure as credenciais OAuth do YouTube no Sites." }, { status: 503 });
  }
  const state = crypto.randomUUID();
  const verifier = base64Url(crypto.getRandomValues(new Uint8Array(48)));
  const challenge = await sha256(verifier);
  const expiresAt = Math.floor(Date.now() / 1000) + 10 * 60;
  await env.DB.prepare(`INSERT INTO oauth_states
    (state, provider, code_verifier, user_email, expires_at) VALUES (?, 'youtube', ?, ?, ?)`)
    .bind(state, verifier, auth.userEmail, expiresAt)
    .run();
  const callbackUrl = `${(env.PUBLIC_BASE_URL || new URL(request.url).origin).replace(/\/+$/, "")}/api/youtube/oauth/callback`;
  const target = new URL("https://accounts.google.com/o/oauth2/v2/auth");
  target.searchParams.set("client_id", env.YOUTUBE_CLIENT_ID);
  target.searchParams.set("redirect_uri", callbackUrl);
  target.searchParams.set("response_type", "code");
  target.searchParams.set("scope", YOUTUBE_SCOPES.join(" "));
  target.searchParams.set("access_type", "offline");
  target.searchParams.set("include_granted_scopes", "true");
  target.searchParams.set("prompt", "consent");
  target.searchParams.set("state", state);
  target.searchParams.set("code_challenge", challenge);
  target.searchParams.set("code_challenge_method", "S256");
  return Response.redirect(target.toString(), 302);
}

async function finishOAuth(request: Request, env: YouTubeEnv, auth: YouTubeRequestAuth) {
  if (!auth.validUser) return json({ error: "Não autorizado." }, { status: 401 });
  if (!env.YOUTUBE_CLIENT_ID || !env.YOUTUBE_CLIENT_SECRET || !env.YOUTUBE_TOKEN_SECRET) {
    return json({ error: "A integração com o YouTube não está configurada." }, { status: 503 });
  }
  const url = new URL(request.url);
  const code = url.searchParams.get("code") || "";
  const state = url.searchParams.get("state") || "";
  const stored = await env.DB.prepare(`SELECT code_verifier, user_email, expires_at, used_at
    FROM oauth_states WHERE state = ? AND provider = 'youtube'`).bind(state).first<{
      code_verifier: string;
      user_email: string;
      expires_at: number;
      used_at: string | null;
    }>();
  if (!code || !stored || stored.used_at || stored.expires_at < Math.floor(Date.now() / 1000)
    || stored.user_email !== auth.userEmail) {
    return json({ error: "A autorização do YouTube expirou ou é inválida." }, { status: 400 });
  }
  await env.DB.prepare("UPDATE oauth_states SET used_at = CURRENT_TIMESTAMP WHERE state = ?")
    .bind(state).run();
  const callbackUrl = `${(env.PUBLIC_BASE_URL || url.origin).replace(/\/+$/, "")}/api/youtube/oauth/callback`;
  const tokenResponse = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      code,
      client_id: env.YOUTUBE_CLIENT_ID,
      client_secret: env.YOUTUBE_CLIENT_SECRET,
      redirect_uri: callbackUrl,
      grant_type: "authorization_code",
      code_verifier: stored.code_verifier,
    }),
  });
  const tokens = await tokenResponse.json() as GoogleTokenResponse;
  if (!tokenResponse.ok || !tokens.access_token) {
    return json({ error: tokens.error_description || "O Google recusou a autorização." }, { status: 400 });
  }
  let refreshToken = tokens.refresh_token || "";
  if (!refreshToken) {
    const existing = await env.DB.prepare(
      "SELECT refresh_token_cipher FROM youtube_auth WHERE id = 1",
    ).first<{ refresh_token_cipher: string }>();
    if (existing) refreshToken = await decrypt(existing.refresh_token_cipher, env.YOUTUBE_TOKEN_SECRET);
  }
  if (!refreshToken) return json({ error: "O Google não forneceu acesso offline. Reconecte o canal." }, { status: 400 });
  const channels = await googleJson(
    "https://www.googleapis.com/youtube/v3/channels?part=id,snippet&mine=true",
    tokens.access_token,
  ) as { items?: Array<{ id?: string; snippet?: { title?: string } }> };
  const channel = channels.items?.[0];
  if (!channel?.id) return json({ error: "A conta autorizada não administra um canal do YouTube." }, { status: 400 });
  const connectedChannel = await env.DB.prepare(
    "SELECT channel_id, channel_title FROM youtube_auth WHERE id = 1",
  ).first<{ channel_id: string; channel_title: string }>();
  if (connectedChannel && connectedChannel.channel_id !== channel.id) {
    return json({
      error: `O ReelVolt já está vinculado ao canal ${connectedChannel.channel_title}. Reconecte esse mesmo canal para evitar misturar publicações.`,
    }, { status: 409 });
  }
  const cipher = await encrypt(refreshToken, env.YOUTUBE_TOKEN_SECRET);
  await env.DB.prepare(`INSERT INTO youtube_auth
    (id, refresh_token_cipher, channel_id, channel_title, scopes, connected_by, updated_at)
    VALUES (1, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
    ON CONFLICT(id) DO UPDATE SET refresh_token_cipher = excluded.refresh_token_cipher,
      channel_id = excluded.channel_id, channel_title = excluded.channel_title,
      scopes = excluded.scopes, connected_by = excluded.connected_by, updated_at = CURRENT_TIMESTAMP`)
    .bind(cipher, channel.id, channel.snippet?.title || "Canal do YouTube",
      tokens.scope || YOUTUBE_SCOPES.join(" "), auth.userEmail)
    .run();
  await env.DB.prepare(`UPDATE youtube_publications SET status = 'queued', error = NULL,
    next_attempt_at = CURRENT_TIMESTAMP, updated_at = CURRENT_TIMESTAMP
    WHERE status = 'awaiting_setup' AND requested_at IS NOT NULL`).run();
  return Response.redirect(`${(env.PUBLIC_BASE_URL || url.origin).replace(/\/+$/, "")}/?youtube=connected`, 302);
}

function validWorker(request: Request, env: YouTubeEnv) {
  return Boolean(
    env.YOUTUBE_WORKER_SECRET
    && request.headers.get("authorization") === `Bearer ${env.YOUTUBE_WORKER_SECRET}`,
  );
}

async function workerMediaUrl(
  reelId: number,
  leaseToken: string,
  requestUrl: string,
  env: YouTubeEnv,
) {
  if (!env.YOUTUBE_WORKER_SECRET) throw new Error("Segredo do executor ausente.");
  const expires = Math.floor(Date.now() / 1000) + 2 * 60 * 60;
  const signature = await hmac(`${reelId}.${leaseToken}.${expires}`, env.YOUTUBE_WORKER_SECRET);
  const baseUrl = (env.PUBLIC_BASE_URL || new URL(requestUrl).origin).replace(/\/+$/, "");
  return `${baseUrl}/worker-media/${reelId}.mp4?lease=${encodeURIComponent(leaseToken)}&expires=${expires}&signature=${encodeURIComponent(signature)}`;
}

async function serveWorkerMedia(request: Request, reelId: number, env: YouTubeEnv) {
  if (!env.YOUTUBE_WORKER_SECRET) return json({ error: "Executor não configurado." }, { status: 503 });
  const url = new URL(request.url);
  const lease = url.searchParams.get("lease") || "";
  const expires = Number(url.searchParams.get("expires"));
  const signature = url.searchParams.get("signature") || "";
  if (!lease || !Number.isInteger(expires) || expires < Math.floor(Date.now() / 1000)) {
    return json({ error: "Link expirado." }, { status: 403 });
  }
  const expected = await hmac(`${reelId}.${lease}.${expires}`, env.YOUTUBE_WORKER_SECRET);
  if (signature !== expected) return json({ error: "Assinatura inválida." }, { status: 403 });
  const publication = await env.DB.prepare(`SELECT lease_token, lease_expires_at FROM youtube_publications
    WHERE reel_id = ? AND datetime(lease_expires_at) > CURRENT_TIMESTAMP`)
    .bind(reelId).first<{ lease_token: string | null; lease_expires_at: string | null }>();
  if (!publication || publication.lease_token !== lease) {
    return json({ error: "Lease inválido." }, { status: 403 });
  }
  const reel = await env.DB.prepare(`SELECT storage_key, filename, content_type, size_bytes
    FROM reels WHERE id = ? AND status = 'ready'`).bind(reelId).first<{
      storage_key: string;
      filename: string;
      content_type: string;
      size_bytes: number;
    }>();
  if (!reel?.storage_key) return json({ error: "Vídeo não encontrado." }, { status: 404 });
  const rangeHeader = request.headers.get("range");
  let range: { offset: number; length: number } | undefined;
  if (rangeHeader) {
    const match = rangeHeader.match(/^bytes=(\d+)-(\d*)$/);
    if (!match) return new Response(null, { status: 416 });
    const offset = Number(match[1]);
    const end = match[2] ? Number(match[2]) : reel.size_bytes - 1;
    if (offset >= reel.size_bytes || end < offset) return new Response(null, { status: 416 });
    range = { offset, length: Math.min(end, reel.size_bytes - 1) - offset + 1 };
  }
  const object = await env.VIDEOS.get(reel.storage_key, range ? { range } : undefined);
  if (!object?.body) return json({ error: "Arquivo não encontrado." }, { status: 404 });
  const headers = new Headers({
    "content-type": reel.content_type || "video/mp4",
    "content-length": String(range?.length ?? reel.size_bytes),
    "accept-ranges": "bytes",
    "cache-control": "private, no-store",
    "x-content-type-options": "nosniff",
    "content-disposition": `inline; filename="${reel.filename || `reel-${reelId}.mp4`}"`,
  });
  if (range) headers.set("content-range", `bytes ${range.offset}-${range.offset + range.length - 1}/${reel.size_bytes}`);
  return new Response(request.method === "HEAD" ? null : object.body, {
    status: range ? 206 : 200,
    headers,
  });
}

async function claimJob(request: Request, env: YouTubeEnv) {
  if (!validWorker(request, env)) return json({ error: "Não autorizado." }, { status: 401 });
  const lease = crypto.randomUUID();
  const row = await env.DB.prepare(`UPDATE youtube_publications SET status = 'preflight',
    lease_token = ?, lease_expires_at = datetime('now', '+20 minutes'),
    worker_heartbeat_at = CURRENT_TIMESTAMP, attempt_count = attempt_count + 1,
    error = NULL, updated_at = CURRENT_TIMESTAMP
    WHERE id = (
      SELECT yp.id FROM youtube_publications yp
      JOIN reels r ON r.id = yp.reel_id
      WHERE r.status = 'ready'
        AND yp.status IN ('queued', 'retrying', 'dispatched')
        AND (
          yp.status = 'dispatched'
          OR yp.next_attempt_at IS NULL
          OR datetime(yp.next_attempt_at) <= CURRENT_TIMESTAMP
        )
        AND (yp.lease_expires_at IS NULL OR datetime(yp.lease_expires_at) <= CURRENT_TIMESTAMP)
      ORDER BY COALESCE(yp.next_attempt_at, yp.requested_at, yp.created_at), yp.id
      LIMIT 1
    )
    RETURNING id, reel_id, attempt_count`).bind(lease).first<{
      id: number;
      reel_id: number;
      attempt_count: number;
    }>();
  if (!row) return new Response(null, { status: 204 });
  try {
    const reel = await env.DB.prepare(`SELECT source_url, source_account, filename, content_type,
      size_bytes FROM reels WHERE id = ?`).bind(row.reel_id).first<{
        source_url: string;
        source_account: string | null;
        filename: string | null;
        content_type: string | null;
        size_bytes: number | null;
      }>();
    const review = await env.DB.prepare(`SELECT rights_basis, context, made_for_kids,
      contains_synthetic_media, paid_product_placement FROM content_reviews WHERE reel_id = ?`)
      .bind(row.reel_id).first<{
        rights_basis: string;
        context: string | null;
        made_for_kids: number;
        contains_synthetic_media: number;
        paid_product_placement: number;
      }>();
    let accessToken: string | null = null;
    try {
      accessToken = await googleAccessToken(env);
    } catch {
      // A análise preventiva ainda pode liberar o ramo Instagram.
    }
    return json({
      job: {
        id: row.id,
        reelId: row.reel_id,
        lease,
        attempt: row.attempt_count,
        mediaUrl: await workerMediaUrl(row.reel_id, lease, request.url, env),
        filename: reel?.filename || `reel-${row.reel_id}.mp4`,
        contentType: reel?.content_type || "video/mp4",
        sizeBytes: Number(reel?.size_bytes || 0),
        sourceUrl: reel?.source_url || "",
        sourceAccount: reel?.source_account || "",
        rightsBasis: review?.rights_basis || "owned",
        context: review?.context || "",
        madeForKids: Boolean(review?.made_for_kids),
        containsSyntheticMedia: Boolean(review?.contains_synthetic_media),
        paidProductPlacement: Boolean(review?.paid_product_placement),
        accessToken,
      },
    });
  } catch (error) {
    await env.DB.prepare(`UPDATE youtube_publications SET status = 'awaiting_setup',
      error = ?, lease_token = NULL, lease_expires_at = NULL, updated_at = CURRENT_TIMESTAMP
      WHERE id = ? AND lease_token = ?`)
      .bind(error instanceof Error ? error.message.slice(0, 700) : "Integração indisponível.", row.id, lease)
      .run();
    return json({ error: "A integração com o YouTube ainda não está pronta." }, { status: 503 });
  }
}

async function analyzeJob(request: Request, jobId: number, env: YouTubeEnv) {
  if (!validWorker(request, env)) return json({ error: "Não autorizado." }, { status: 401 });
  const form = await request.formData();
  const lease = cleanText(form.get("lease"), 100);
  const fingerprint = cleanText(form.get("contentFingerprint"), 128);
  const job = await env.DB.prepare(`SELECT yp.reel_id, r.source_account, cr.context, cr.rights_basis
    FROM youtube_publications yp JOIN reels r ON r.id = yp.reel_id
    LEFT JOIN content_reviews cr ON cr.reel_id = yp.reel_id
    WHERE yp.id = ? AND yp.lease_token = ?`).bind(jobId, lease).first<{
      reel_id: number;
      source_account: string | null;
      context: string | null;
      rights_basis: string | null;
    }>();
  if (!job) return json({ error: "Lease inválido." }, { status: 409 });
  if (!/^[a-f0-9]{64}$/i.test(fingerprint)) {
    return json({ error: "Fingerprint do conteúdo ausente ou inválido." }, { status: 400 });
  }
  const duplicate = await env.DB.prepare(`SELECT reel_id FROM content_reviews
    WHERE content_fingerprint = ? AND reel_id <> ? LIMIT 1`)
    .bind(fingerprint, job.reel_id).first<{ reel_id: number }>();
  if (duplicate) {
    await env.DB.batch([
      env.DB.prepare(`UPDATE content_reviews SET content_fingerprint = ?,
        moderation_status = 'blocked', moderation_reasons = ?, updated_at = CURRENT_TIMESTAMP
        WHERE reel_id = ?`).bind(
        fingerprint,
        JSON.stringify([`duplicate_of:${duplicate.reel_id}`]),
        job.reel_id,
      ),
      env.DB.prepare(`UPDATE youtube_publications SET status = 'blocked',
        error = ?, lease_token = NULL, lease_expires_at = NULL, updated_at = CURRENT_TIMESTAMP
        WHERE id = ? AND lease_token = ?`).bind(
        `O mesmo MP4 já foi registrado no Reel #${duplicate.reel_id}.`,
        jobId,
        lease,
      ),
      env.DB.prepare(`UPDATE reels SET publish_status = 'blocked', publish_error = ?
        WHERE id = ? AND publish_status = 'awaiting_metadata'`).bind(
        `O mesmo MP4 já foi registrado no Reel #${duplicate.reel_id}.`,
        job.reel_id,
      ),
    ]);
    return json({ blocked: true, reasons: ["duplicate"] });
  }
  if (!env.OPENAI_API_KEY) {
    const source = cleanText(job.source_account, 40) || "the connected creator";
    const title = cleanText(`Short #${job.reel_id} from ${source}`, 100);
    const rightsLabel = job.rights_basis === "licensed" ? "Licensed" : "Creator-owned";
    const description = cleanText(
      `${rightsLabel} private review copy from ${source}. Review the video, title, description and hashtags in ReelVolt before making it public.`,
      1200,
    );
    const tags = ["Shorts"];
    await env.DB.batch([
      env.DB.prepare(`UPDATE content_reviews SET content_fingerprint = ?,
        moderation_status = 'manual_review', moderation_reasons = ?,
        updated_at = CURRENT_TIMESTAMP WHERE reel_id = ?`).bind(
          fingerprint,
          JSON.stringify(["zero_cost_manual_review_required"]),
          job.reel_id,
        ),
      env.DB.prepare(`UPDATE youtube_publications SET status = 'uploading', title = ?,
        description = ?, tags_json = ?, error = NULL, worker_heartbeat_at = CURRENT_TIMESTAMP,
        updated_at = CURRENT_TIMESTAMP WHERE id = ? AND lease_token = ?`)
        .bind(title, description, JSON.stringify(tags), jobId, lease),
    ]);
    return json({
      blocked: false,
      manualReviewRequired: true,
      metadata: {
        youtubeTitle: title,
        youtubeDescription: description,
        youtubeTags: tags,
        instagramCaption: "",
        summary: cleanText(job.context, 500),
        riskFlags: ["manual_review_required"],
      },
    });
  }
  const audio = form.get("audio");
  let transcript = "";
  if (audio instanceof File && audio.size) {
    const transcriptionForm = new FormData();
    transcriptionForm.set("file", audio, audio.name || "audio.m4a");
    transcriptionForm.set("model", env.OPENAI_TRANSCRIPTION_MODEL || "gpt-4o-mini-transcribe");
    const transcriptionResponse = await fetch("https://api.openai.com/v1/audio/transcriptions", {
      method: "POST",
      headers: { authorization: `Bearer ${env.OPENAI_API_KEY}` },
      body: transcriptionForm,
    });
    const transcription = await transcriptionResponse.json() as { text?: string; error?: { message?: string } };
    if (!transcriptionResponse.ok) {
      return json({ error: transcription.error?.message || "Não foi possível transcrever o áudio." }, { status: 502 });
    }
    transcript = cleanText(transcription.text, 16000);
  }
  const sourceCaption = cleanText(form.get("sourceCaption"), 5000);
  const frameFiles = ["frame1", "frame2", "frame3"]
    .map((key) => form.get(key))
    .filter((item): item is File => item instanceof File && item.size > 0);
  const frameUrls: string[] = [];
  for (const frame of frameFiles) {
    const bytes = new Uint8Array(await frame.arrayBuffer());
    let binary = "";
    for (const byte of bytes) binary += String.fromCharCode(byte);
    frameUrls.push(`data:${frame.type || "image/jpeg"};base64,${btoa(binary)}`);
  }
  const moderationInput: Array<Record<string, unknown>> = [{
    type: "text",
    text: [sourceCaption, transcript, job.context || ""].filter(Boolean).join("\n\n").slice(0, 20000),
  }];
  for (const frameUrl of frameUrls) {
    moderationInput.push({ type: "image_url", image_url: { url: frameUrl } });
  }
  const moderationResponse = await fetch("https://api.openai.com/v1/moderations", {
    method: "POST",
    headers: {
      authorization: `Bearer ${env.OPENAI_API_KEY}`,
      "content-type": "application/json",
    },
    body: JSON.stringify({
      model: env.OPENAI_MODERATION_MODEL || "omni-moderation-latest",
      input: moderationInput,
    }),
  });
  const moderation = await moderationResponse.json() as {
    results?: Array<{ flagged?: boolean; categories?: Record<string, boolean> }>;
    error?: { message?: string };
  };
  if (!moderationResponse.ok) {
    return json({ error: moderation.error?.message || "A moderação automática falhou." }, { status: 502 });
  }
  const flagged = moderation.results?.some((result) => result.flagged) || false;
  const reasons = [...new Set((moderation.results || []).flatMap((result) =>
    Object.entries(result.categories || {}).filter(([, active]) => active).map(([category]) => category)
  ))];
  if (flagged) {
    await env.DB.batch([
      env.DB.prepare(`UPDATE content_reviews SET transcript = ?, source_caption = ?,
        content_fingerprint = ?, moderation_status = 'blocked', moderation_reasons = ?,
        updated_at = CURRENT_TIMESTAMP WHERE reel_id = ?`)
        .bind(transcript || null, sourceCaption || null, fingerprint, JSON.stringify(reasons), job.reel_id),
    env.DB.prepare(`UPDATE youtube_publications SET status = 'blocked',
        error = 'A análise preventiva encontrou conteúdo que exige revisão humana.',
        lease_token = NULL, lease_expires_at = NULL, updated_at = CURRENT_TIMESTAMP
        WHERE id = ? AND lease_token = ?`).bind(jobId, lease),
      env.DB.prepare(`UPDATE reels SET publish_status = 'blocked',
        publish_error = 'A análise preventiva encontrou conteúdo que exige revisão humana.'
        WHERE id = ? AND publish_status = 'awaiting_metadata'`).bind(job.reel_id),
    ]);
    return json({ blocked: true, reasons });
  }
  const content: Array<Record<string, unknown>> = [{
    type: "input_text",
    text: `Source account: ${job.source_account || "unknown"}
Source caption: ${sourceCaption || "unavailable"}
Transcript: ${transcript || "no spoken audio"}
Creator context: ${job.context || "none"}`,
  }];
  for (const frameUrl of frameUrls) content.push({ type: "input_image", image_url: frameUrl, detail: "low" });
  const metadataResponse = await fetch("https://api.openai.com/v1/responses", {
    method: "POST",
    headers: {
      authorization: `Bearer ${env.OPENAI_API_KEY}`,
      "content-type": "application/json",
    },
    body: JSON.stringify({
      model: env.OPENAI_METADATA_MODEL || "gpt-5.6-terra",
      reasoning: { effort: "low" },
      store: false,
      input: [
        {
          role: "system",
          content: [{
            type: "input_text",
            text: `Create accurate, original social metadata from the supplied evidence.
Write YouTube metadata in English and an Instagram caption in English.
Never invent names, places, events, affiliations, quotes, or claims.
Keep the YouTube title under 100 characters, description concise, and return at most three relevant tags.
Avoid clickbait, keyword stuffing, repeated templates, and unsupported copyright claims.`,
          }],
        },
        { role: "user", content },
      ],
      text: {
        format: {
          type: "json_schema",
          name: "reelvolt_metadata",
          strict: true,
          schema: {
            type: "object",
            additionalProperties: false,
            properties: {
              youtubeTitle: { type: "string", minLength: 1, maxLength: 100 },
              youtubeDescription: { type: "string", minLength: 1, maxLength: 1200 },
              youtubeTags: {
                type: "array",
                minItems: 0,
                maxItems: 3,
                items: { type: "string", minLength: 1, maxLength: 40 },
              },
              instagramCaption: { type: "string", minLength: 1, maxLength: 2200 },
              summary: { type: "string", minLength: 1, maxLength: 500 },
              riskFlags: {
                type: "array",
                maxItems: 5,
                items: { type: "string", maxLength: 120 },
              },
            },
            required: [
              "youtubeTitle",
              "youtubeDescription",
              "youtubeTags",
              "instagramCaption",
              "summary",
              "riskFlags",
            ],
          },
        },
      },
    }),
  });
  const metadataResult = await metadataResponse.json() as {
    output_text?: string;
    output?: Array<{ content?: Array<{ text?: string }> }>;
    error?: { message?: string };
  };
  if (!metadataResponse.ok) {
    return json({ error: metadataResult.error?.message || "A geração de metadados falhou." }, { status: 502 });
  }
  const outputText = metadataResult.output_text
    || metadataResult.output?.flatMap((item) => item.content || []).map((item) => item.text || "").join("")
    || "";
  let metadata: {
    youtubeTitle: string;
    youtubeDescription: string;
    youtubeTags: string[];
    instagramCaption: string;
    summary: string;
    riskFlags: string[];
  };
  try {
    metadata = JSON.parse(outputText);
  } catch {
    return json({ error: "A IA retornou metadados em formato inválido." }, { status: 502 });
  }
  const title = cleanText(metadata.youtubeTitle, 100);
  const description = cleanText(metadata.youtubeDescription, 1200);
  const tags = (metadata.youtubeTags || []).map((tag) => cleanText(tag, 40)).filter(Boolean).slice(0, 3);
  if (!title || !description) return json({ error: "Os metadados gerados estão incompletos." }, { status: 502 });
  const riskFlags = (metadata.riskFlags || []).map((risk) => cleanText(risk, 120)).filter(Boolean).slice(0, 5);
  if (riskFlags.length) {
    await env.DB.batch([
      env.DB.prepare(`UPDATE content_reviews SET transcript = ?, source_caption = ?,
        content_fingerprint = ?, moderation_status = 'blocked', moderation_reasons = ?,
        updated_at = CURRENT_TIMESTAMP WHERE reel_id = ?`)
        .bind(transcript || null, sourceCaption || null, fingerprint, JSON.stringify(riskFlags), job.reel_id),
      env.DB.prepare(`UPDATE youtube_publications SET status = 'blocked',
        error = 'Os metadados não puderam ser sustentados pelo conteúdo analisado.',
        lease_token = NULL, lease_expires_at = NULL, updated_at = CURRENT_TIMESTAMP
        WHERE id = ? AND lease_token = ?`).bind(jobId, lease),
      env.DB.prepare(`UPDATE reels SET publish_status = 'blocked',
        publish_error = 'Os metadados não puderam ser sustentados pelo conteúdo analisado.'
        WHERE id = ? AND publish_status = 'awaiting_metadata'`).bind(job.reel_id),
    ]);
    return json({ blocked: true, reasons: riskFlags });
  }
  await env.DB.batch([
    env.DB.prepare(`UPDATE content_reviews SET transcript = ?, source_caption = ?,
      content_fingerprint = ?, moderation_status = 'safe', moderation_reasons = ?,
      updated_at = CURRENT_TIMESTAMP WHERE reel_id = ?`).bind(
        transcript || null,
        sourceCaption || null,
        fingerprint,
        "[]",
        job.reel_id,
      ),
    env.DB.prepare(`UPDATE youtube_publications SET status = 'uploading', title = ?,
      description = ?, tags_json = ?, error = NULL, worker_heartbeat_at = CURRENT_TIMESTAMP,
      updated_at = CURRENT_TIMESTAMP WHERE id = ? AND lease_token = ?`)
      .bind(title, description, JSON.stringify(tags), jobId, lease),
    env.DB.prepare(`UPDATE reels SET caption = ?,
      publish_status = CASE WHEN publish_status = 'awaiting_metadata' THEN 'queued' ELSE publish_status END,
      scheduled_for = CASE WHEN publish_status = 'awaiting_metadata' THEN CURRENT_TIMESTAMP ELSE scheduled_for END
      WHERE id = ? AND approved_at IS NOT NULL`)
      .bind(cleanText(metadata.instagramCaption, 2200), job.reel_id),
  ]);
  return json({
    blocked: false,
    transcript,
    metadata: {
      youtubeTitle: title,
      youtubeDescription: description,
      youtubeTags: tags,
      instagramCaption: cleanText(metadata.instagramCaption, 2200),
      summary: cleanText(metadata.summary, 500),
      riskFlags: metadata.riskFlags || [],
    },
  });
}

async function heartbeatJob(request: Request, jobId: number, env: YouTubeEnv) {
  if (!validWorker(request, env)) return json({ error: "Não autorizado." }, { status: 401 });
  const data = await request.json() as { lease?: string; status?: string; bytesUploaded?: number; uploadSessionUrl?: string };
  const allowed = new Set(["preflight", "analyzing", "uploading", "processing"]);
  const status = allowed.has(data.status || "") ? data.status : "uploading";
  const result = await env.DB.prepare(`UPDATE youtube_publications SET status = ?,
    bytes_uploaded = MAX(bytes_uploaded, ?), upload_session_url = COALESCE(?, upload_session_url),
    worker_heartbeat_at = CURRENT_TIMESTAMP, lease_expires_at = datetime('now', '+20 minutes'),
    updated_at = CURRENT_TIMESTAMP WHERE id = ? AND lease_token = ?`)
    .bind(status, Math.max(0, Number(data.bytesUploaded || 0)), cleanText(data.uploadSessionUrl, 2000) || null,
      jobId, cleanText(data.lease, 100))
    .run();
  return result.meta.changes ? json({ ok: true }) : json({ error: "Lease inválido." }, { status: 409 });
}

async function completeJob(request: Request, jobId: number, env: YouTubeEnv) {
  if (!validWorker(request, env)) return json({ error: "Não autorizado." }, { status: 401 });
  const data = await request.json() as {
    lease?: string;
    videoId?: string;
    durationMs?: number;
    widthPixels?: number;
    heightPixels?: number;
    codec?: string;
    hasAudio?: boolean;
  };
  const duration = Math.round(Number(data.durationMs || 0));
  const width = Math.round(Number(data.widthPixels || 0));
  const height = Math.round(Number(data.heightPixels || 0));
  const videoId = cleanText(data.videoId, 64);
  const eligible = Boolean(videoId && duration > 0 && duration <= 180000 && width > 0 && height > 0 && width <= height);
  const error = eligible
    ? null
    : duration > 180000
      ? "O vídeo ultrapassa 180 segundos e não é elegível para este fluxo de Shorts."
      : width > height
        ? "O vídeo é horizontal. Use um arquivo quadrado ou vertical."
        : "O YouTube não confirmou os detalhes técnicos do arquivo.";
  const result = await env.DB.prepare(`UPDATE youtube_publications SET status = ?,
    error = ?, video_id = ?, video_url = ?, studio_url = ?, privacy_status = 'private',
    duration_ms = ?, width_pixels = ?, height_pixels = ?, codec = ?, has_audio = ?,
    warning_long_claim = ?, technical_eligible = ?, uploaded_at = CURRENT_TIMESTAMP,
    lease_token = NULL, lease_expires_at = NULL, worker_heartbeat_at = CURRENT_TIMESTAMP,
    updated_at = CURRENT_TIMESTAMP WHERE id = ? AND lease_token = ?`)
    .bind(
      eligible ? "awaiting_studio_check" : "blocked",
      error,
      videoId || null,
      videoId ? `https://www.youtube.com/watch?v=${encodeURIComponent(videoId)}` : null,
      videoId ? `https://studio.youtube.com/video/${encodeURIComponent(videoId)}/edit` : null,
      duration || null,
      width || null,
      height || null,
      cleanText(data.codec, 80) || null,
      data.hasAudio ? 1 : 0,
      duration > 60000 ? 1 : 0,
      eligible ? 1 : 0,
      jobId,
      cleanText(data.lease, 100),
    )
    .run();
  return result.meta.changes ? json({ ok: true, eligible }) : json({ error: "Lease inválido." }, { status: 409 });
}

async function failJob(request: Request, jobId: number, env: YouTubeEnv) {
  if (!validWorker(request, env)) return json({ error: "Não autorizado." }, { status: 401 });
  const data = await request.json() as { lease?: string; error?: string; retryable?: boolean };
  const current = await env.DB.prepare("SELECT attempt_count FROM youtube_publications WHERE id = ? AND lease_token = ?")
    .bind(jobId, cleanText(data.lease, 100)).first<{ attempt_count: number }>();
  if (!current) return json({ error: "Lease inválido." }, { status: 409 });
  const retryable = data.retryable !== false && current.attempt_count < 5;
  const delayMinutes = Math.min(60, 2 ** Math.max(0, current.attempt_count - 1));
  await env.DB.prepare(`UPDATE youtube_publications SET status = ?, error = ?,
    next_attempt_at = CASE WHEN ? = 1 THEN datetime('now', ?) ELSE NULL END,
    lease_token = NULL, lease_expires_at = NULL, updated_at = CURRENT_TIMESTAMP WHERE id = ?`)
    .bind(
      retryable ? "retrying" : "failed",
      cleanText(data.error, 700) || "O executor não concluiu o upload.",
      retryable ? 1 : 0,
      `+${delayMinutes} minutes`,
      jobId,
    ).run();
  return json({ ok: true, retrying: retryable });
}

async function releasePublication(request: Request, reelId: number, env: YouTubeEnv, auth: YouTubeRequestAuth) {
  if (!auth.validUser) return json({ error: "Não autorizado." }, { status: 401 });
  if (!auth.validOrigin) return json({ error: "Origem inválida." }, { status: 403 });
  const data = await request.json() as { checksConfirmed?: boolean };
  if (data.checksConfirmed !== true) {
    return json({ error: "Confirme que os checks do YouTube Studio estão limpos." }, { status: 400 });
  }
  if (!boolEnv(env.YOUTUBE_API_AUDITED)) {
    return json({
      error: "O projeto da YouTube Data API ainda não está marcado como auditado. Mantenha o vídeo privado.",
    }, { status: 409 });
  }
  const row = await env.DB.prepare(`SELECT yp.video_id, yp.status, yp.technical_eligible,
    cr.moderation_status, cr.made_for_kids, cr.contains_synthetic_media
    FROM youtube_publications yp JOIN content_reviews cr ON cr.reel_id = yp.reel_id
    WHERE yp.reel_id = ?`).bind(reelId).first<{
      video_id: string | null;
      status: string;
      technical_eligible: number;
      moderation_status: string;
      made_for_kids: number;
      contains_synthetic_media: number;
    }>();
  if (!row?.video_id) return json({ error: "O Short privado ainda não está pronto." }, { status: 409 });
  if (row.status === "published") return json({ error: "Este Short já está público." }, { status: 409 });
  if (row.status !== "awaiting_studio_check" || !row.technical_eligible || row.moderation_status !== "safe") {
    return json({ error: "Os gates técnicos e de conteúdo ainda não foram concluídos." }, { status: 409 });
  }
  const accessToken = await googleAccessToken(env);
  const current = await googleJson(
    `https://www.googleapis.com/youtube/v3/videos?part=status,processingDetails&id=${encodeURIComponent(row.video_id)}`,
    accessToken,
  ) as {
    items?: Array<{
      status?: {
        uploadStatus?: string;
        privacyStatus?: string;
        license?: string;
        embeddable?: boolean;
        publicStatsViewable?: boolean;
      };
      processingDetails?: { processingStatus?: string };
    }>;
  };
  const video = current.items?.[0];
  if (video?.status?.uploadStatus !== "processed" || video.processingDetails?.processingStatus !== "succeeded") {
    return json({ error: "O YouTube ainda não concluiu o processamento do Short." }, { status: 409 });
  }
  if (video.status.privacyStatus !== "private") {
    return json({ error: "O Short não está privado; a liberação foi interrompida para revisão." }, { status: 409 });
  }
  await googleJson(
    "https://www.googleapis.com/youtube/v3/videos?part=status",
    accessToken,
    {
      method: "PUT",
      body: JSON.stringify({
        id: row.video_id,
        status: {
          privacyStatus: "public",
          license: video.status.license || "youtube",
          embeddable: video.status.embeddable ?? true,
          publicStatsViewable: video.status.publicStatsViewable ?? true,
          selfDeclaredMadeForKids: Boolean(row.made_for_kids),
          containsSyntheticMedia: Boolean(row.contains_synthetic_media),
        },
      }),
    },
  );
  await env.DB.prepare(`UPDATE youtube_publications SET status = 'published',
    privacy_status = 'public', checks_confirmed_at = CURRENT_TIMESTAMP,
    published_at = CURRENT_TIMESTAMP, error = NULL, updated_at = CURRENT_TIMESTAMP
    WHERE reel_id = ?`).bind(reelId).run();
  return json({ accepted: true, videoId: row.video_id, privacyStatus: "public" });
}

async function retryPublication(request: Request, reelId: number, env: YouTubeEnv, auth: YouTubeRequestAuth) {
  if (!auth.validUser) return json({ error: "Não autorizado." }, { status: 401 });
  if (!auth.validOrigin) return json({ error: "Origem inválida." }, { status: 403 });
  const row = await env.DB.prepare(
    "SELECT status, video_id FROM youtube_publications WHERE reel_id = ?",
  ).bind(reelId).first<{ status: string; video_id: string | null }>();
  if (!row) return json({ error: "Destino YouTube não solicitado." }, { status: 404 });
  if (row.status === "published" || row.status === "awaiting_studio_check" || row.video_id) {
    return json({ error: "Este upload já criou um vídeo no YouTube e não pode ser duplicado." }, { status: 409 });
  }
  await env.DB.prepare(`UPDATE youtube_publications SET status = 'queued', error = NULL,
    next_attempt_at = CURRENT_TIMESTAMP, lease_token = NULL, lease_expires_at = NULL,
    upload_session_url = NULL, bytes_uploaded = 0, updated_at = CURRENT_TIMESTAMP
    WHERE reel_id = ?`).bind(reelId).run();
  const dispatch = await dispatchYouTubeExecutor(env);
  return json({ accepted: true, dispatch });
}

async function updateMetadata(request: Request, reelId: number, env: YouTubeEnv, auth: YouTubeRequestAuth) {
  if (!auth.validUser) return json({ error: "Não autorizado." }, { status: 401 });
  if (!auth.validOrigin) return json({ error: "Origem inválida." }, { status: 403 });
  const data = await request.json() as {
    title?: string;
    description?: string;
    tags?: string[];
    manualReviewConfirmed?: boolean;
  };
  const title = cleanText(data.title, 100);
  const description = cleanText(data.description, 5000);
  const tags = Array.isArray(data.tags)
    ? data.tags.map((tag) => cleanText(tag, 40)).filter(Boolean).slice(0, 3)
    : [];
  if (!title || !description) return json({ error: "Informe título e descrição." }, { status: 400 });
  const current = await env.DB.prepare(`SELECT yp.status, yp.video_id, cr.transcript,
    cr.source_caption, cr.context FROM youtube_publications yp
    LEFT JOIN content_reviews cr ON cr.reel_id = yp.reel_id WHERE yp.reel_id = ?`)
    .bind(reelId).first<{
      status: string;
      video_id: string | null;
      transcript: string | null;
      source_caption: string | null;
      context: string | null;
    }>();
  if (!current || current.status === "published" || current.status === "publishing") {
    return json({ error: "Metadados não podem mais ser alterados." }, { status: 409 });
  }
  const candidate = [title, description, tags.join(" ")].join("\n\n");
  if (!env.OPENAI_API_KEY) {
    if (data.manualReviewConfirmed !== true) {
      return json({
        error: "Confirme que você revisou o vídeo completo e que os metadados descrevem apenas o que aparece nele.",
      }, { status: 400 });
    }
    if (/[\u0000-\u001f\u007f]/.test(candidate)) {
      return json({ error: "Os metadados contêm caracteres de controle inválidos." }, { status: 400 });
    }
    if (current.video_id) {
      const accessToken = await googleAccessToken(env);
      await googleJson(
        "https://www.googleapis.com/youtube/v3/videos?part=snippet",
        accessToken,
        {
          method: "PUT",
          body: JSON.stringify({
            id: current.video_id,
            snippet: { title, description, tags, categoryId: "24", defaultLanguage: "en" },
          }),
        },
      );
    }
    const result = await env.DB.prepare(`UPDATE youtube_publications SET title = ?, description = ?,
      tags_json = ?, error = NULL, updated_at = CURRENT_TIMESTAMP
      WHERE reel_id = ? AND status NOT IN ('published', 'publishing')`)
      .bind(title, description, JSON.stringify(tags), reelId)
      .run();
    if (result.meta.changes) {
      await env.DB.prepare(`UPDATE content_reviews SET moderation_status = 'safe',
        moderation_reasons = ?, updated_at = CURRENT_TIMESTAMP WHERE reel_id = ?`)
        .bind(JSON.stringify([`manual_review_confirmed:${auth.userEmail}`]), reelId).run();
    }
    return result.meta.changes
      ? json({ accepted: true, manualReviewConfirmed: true })
      : json({ error: "Metadados não podem mais ser alterados." }, { status: 409 });
  }
  const moderationResponse = await fetch("https://api.openai.com/v1/moderations", {
    method: "POST",
    headers: {
      authorization: `Bearer ${env.OPENAI_API_KEY}`,
      "content-type": "application/json",
    },
    body: JSON.stringify({
      model: env.OPENAI_MODERATION_MODEL || "omni-moderation-latest",
      input: candidate,
    }),
  });
  const moderation = await moderationResponse.json() as {
    results?: Array<{ flagged?: boolean }>;
    error?: { message?: string };
  };
  if (!moderationResponse.ok) {
    return json({ error: moderation.error?.message || "A remoderação falhou." }, { status: 502 });
  }
  if (moderation.results?.some((result) => result.flagged)) {
    return json({ error: "Os metadados editados exigem revisão de segurança." }, { status: 422 });
  }
  const validationResponse = await fetch("https://api.openai.com/v1/responses", {
    method: "POST",
    headers: {
      authorization: `Bearer ${env.OPENAI_API_KEY}`,
      "content-type": "application/json",
    },
    body: JSON.stringify({
      model: env.OPENAI_METADATA_MODEL || "gpt-5.6-terra",
      reasoning: { effort: "low" },
      store: false,
      input: [{
        role: "user",
        content: [{
          type: "input_text",
          text: `Decide whether every factual claim in the candidate metadata is supported by the evidence.
Evidence:
${[current.source_caption, current.transcript, current.context].filter(Boolean).join("\n") || "No textual evidence"}

Candidate:
${candidate}`,
        }],
      }],
      text: {
        format: {
          type: "json_schema",
          name: "metadata_support",
          strict: true,
          schema: {
            type: "object",
            additionalProperties: false,
            properties: {
              supported: { type: "boolean" },
              reason: { type: "string", maxLength: 300 },
            },
            required: ["supported", "reason"],
          },
        },
      },
    }),
  });
  const validation = await validationResponse.json() as {
    output_text?: string;
    output?: Array<{ content?: Array<{ text?: string }> }>;
    error?: { message?: string };
  };
  if (!validationResponse.ok) {
    return json({ error: validation.error?.message || "A validação factual falhou." }, { status: 502 });
  }
  const validationText = validation.output_text
    || validation.output?.flatMap((item) => item.content || []).map((item) => item.text || "").join("")
    || "";
  let support: { supported?: boolean; reason?: string };
  try {
    support = JSON.parse(validationText);
  } catch {
    return json({ error: "A validação factual retornou um formato inválido." }, { status: 502 });
  }
  if (!support.supported) {
    return json({
      error: cleanText(support.reason, 300) || "Os metadados contêm afirmações sem base no conteúdo.",
    }, { status: 422 });
  }
  if (current.video_id) {
    const accessToken = await googleAccessToken(env);
    await googleJson(
      "https://www.googleapis.com/youtube/v3/videos?part=snippet",
      accessToken,
      {
        method: "PUT",
        body: JSON.stringify({
          id: current.video_id,
          snippet: { title, description, tags, categoryId: "24", defaultLanguage: "en" },
        }),
      },
    );
  }
  const result = await env.DB.prepare(`UPDATE youtube_publications SET title = ?, description = ?,
    tags_json = ?, error = NULL, updated_at = CURRENT_TIMESTAMP
    WHERE reel_id = ? AND status NOT IN ('published', 'publishing')`)
    .bind(title, description, JSON.stringify(tags), reelId)
    .run();
  if (result.meta.changes) {
    await env.DB.prepare(`UPDATE content_reviews SET moderation_status = 'safe',
      moderation_reasons = '[]', updated_at = CURRENT_TIMESTAMP WHERE reel_id = ?`)
      .bind(reelId).run();
  }
  return result.meta.changes
    ? json({ accepted: true, remoderated: true })
    : json({ error: "Metadados não podem mais ser alterados." }, { status: 409 });
}

export async function youtubeAnalyticsPayload(env: YouTubeEnv) {
  const { results } = await env.DB.prepare(`SELECT yp.reel_id AS id, yp.video_id,
    yp.video_url, yp.published_at, r.completed_at AS downloaded_at, r.source_account,
    COALESCE(yi.views, 0) AS views, COALESCE(yi.engaged_views, 0) AS engaged_views,
    COALESCE(yi.likes, 0) AS likes, COALESCE(yi.comments, 0) AS comments,
    COALESCE(yi.shares, 0) AS shares, COALESCE(yi.subscribers_gained, 0) AS subscribers_gained,
    COALESCE(yi.average_view_duration_ms, 0) AS average_view_duration_ms,
    COALESCE(yi.average_view_percentage_bps, 0) AS average_view_percentage_bps,
    yi.updated_at
    FROM youtube_publications yp JOIN reels r ON r.id = yp.reel_id
    LEFT JOIN youtube_insights yi ON yi.reel_id = yp.reel_id
    WHERE yp.status = 'published' AND yp.video_id IS NOT NULL
    ORDER BY views DESC, yp.published_at DESC`).all<Record<string, string | number | null>>();
  const { results: historyRows } = await env.DB.prepare(`SELECT captured_date,
    SUM(views) AS views
    FROM youtube_insight_snapshots
    GROUP BY captured_date ORDER BY captured_date DESC LIMIT 61`)
    .all<{ captured_date: string; views: number }>();
  const totals = results.reduce<{
    views: number;
    engagedViews: number;
    likes: number;
    comments: number;
    shares: number;
    subscribers: number;
  }>((sum, row) => ({
    views: sum.views + Number(row.views || 0),
    engagedViews: sum.engagedViews + Number(row.engaged_views || 0),
    likes: sum.likes + Number(row.likes || 0),
    comments: sum.comments + Number(row.comments || 0),
    shares: sum.shares + Number(row.shares || 0),
    subscribers: sum.subscribers + Number(row.subscribers_gained || 0),
  }), { views: 0, engagedViews: 0, likes: 0, comments: 0, shares: 0, subscribers: 0 });
  return {
    summary: {
      published_shorts: results.length,
      total_views: totals.views,
      engaged_views: totals.engagedViews,
      total_interactions: totals.likes + totals.comments + totals.shares,
      subscribers_gained: totals.subscribers,
      average_view_duration_ms: results.length
        ? Math.round(results.reduce((sum, row) => sum + Number(row.average_view_duration_ms || 0), 0) / results.length)
        : 0,
      average_view_percentage_bps: results.length
        ? Math.round(results.reduce((sum, row) => sum + Number(row.average_view_percentage_bps || 0), 0) / results.length)
        : 0,
      engagement_rate: totals.engagedViews
        ? Number((((totals.likes + totals.comments + totals.shares) / totals.engagedViews) * 100).toFixed(2))
        : 0,
    },
    periods: youtubeViewPeriods(
      totals.views,
      historyRows,
      results
        .map((row) => typeof row.published_at === "string" ? row.published_at : null)
        .filter((value): value is string => Boolean(value))
        .sort()[0] || null,
    ),
    history: historyRows.reverse(),
    shorts: results.map((row, index) => ({ ...row, rank: index + 1 })),
  };
}

function youtubeAnalyticsDateKey(date = new Date()) {
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

function shiftAnalyticsDate(value: string, days: number) {
  const date = new Date(`${value}T12:00:00Z`);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

function youtubeViewPeriods(
  currentViews: number,
  history: Array<{ captured_date: string; views: number }>,
  oldestPublishedAt: string | null,
) {
  const today = youtubeAnalyticsDateKey();
  const byDate = new Map(history.map((row) => [row.captured_date, Number(row.views || 0)]));
  const cumulative = (date: string) => byDate.has(date) ? byDate.get(date) as number : null;
  const delta = (end: number | null, start: number | null) =>
    end == null || start == null ? null : Math.max(0, end - start);
  const change = (current: number | null, previous: number | null) =>
    current == null || previous == null || previous <= 0
      ? null
      : Number((((current - previous) / previous) * 100).toFixed(1));
  const yesterday = shiftAnalyticsDate(today, -1);
  const dayBefore = shiftAnalyticsDate(today, -2);
  const weekStart = shiftAnalyticsDate(today, -7);
  const priorWeekStart = shiftAnalyticsDate(today, -14);
  const monthStart = shiftAnalyticsDate(today, -30);
  const priorMonthStart = shiftAnalyticsDate(today, -60);
  const yesterdayViews = delta(cumulative(yesterday), cumulative(dayBefore));
  const todayViews = delta(currentViews, cumulative(yesterday));
  const oldestPublishedDate = oldestPublishedAt
    ? youtubeAnalyticsDateKey(new Date(
      oldestPublishedAt.includes("T")
        ? oldestPublishedAt
        : `${oldestPublishedAt.replace(" ", "T")}Z`,
    ))
    : null;
  const weekBaseline = cumulative(weekStart)
    ?? (oldestPublishedDate && oldestPublishedDate >= weekStart ? 0 : null);
  const monthBaseline = cumulative(monthStart)
    ?? (oldestPublishedDate && oldestPublishedDate >= monthStart ? 0 : null);
  const weekViews = delta(currentViews, weekBaseline);
  const previousWeekViews = delta(cumulative(weekStart), cumulative(priorWeekStart));
  const monthViews = delta(currentViews, monthBaseline);
  const previousMonthViews = delta(cumulative(monthStart), cumulative(priorMonthStart));
  return {
    timezone: "America/Sao_Paulo",
    as_of: today,
    today: {
      views: todayViews,
      previous_views: yesterdayViews,
      change_percent: change(todayViews, yesterdayViews),
      available: todayViews != null,
    },
    yesterday: { views: yesterdayViews, available: yesterdayViews != null },
    week: {
      views: weekViews,
      previous_views: previousWeekViews,
      change_percent: change(weekViews, previousWeekViews),
      average_per_day: weekViews == null ? null : Math.round(weekViews / 7),
      available: weekViews != null,
    },
    month: {
      views: monthViews,
      previous_views: previousMonthViews,
      change_percent: change(monthViews, previousMonthViews),
      average_per_day: monthViews == null ? null : Math.round(monthViews / 30),
      available: monthViews != null,
    },
  };
}

export async function refreshYouTubeInsights(env: YouTubeEnv) {
  const accessToken = await googleAccessToken(env);
  const { results } = await env.DB.prepare(`SELECT reel_id, video_id, published_at
    FROM youtube_publications WHERE status = 'published' AND video_id IS NOT NULL
    ORDER BY published_at DESC LIMIT 100`).all<{
      reel_id: number;
      video_id: string;
      published_at: string;
    }>();
  const today = youtubeAnalyticsDateKey();
  let updated = 0;
  for (const row of results) {
    const startDate = (row.published_at || today).slice(0, 10);
    const query = new URLSearchParams({
      ids: "channel==MINE",
      startDate,
      endDate: today,
      metrics: "views,engagedViews,likes,comments,shares,subscribersGained,averageViewDuration,averageViewPercentage,estimatedMinutesWatched",
      filters: `video==${row.video_id}`,
    });
    try {
      const response = await googleJson(
        `https://youtubeanalytics.googleapis.com/v2/reports?${query.toString()}`,
        accessToken,
      ) as { rows?: Array<Array<number>> };
      const values = response.rows?.[0] || [];
      const publishedAt = Date.parse(
        row.published_at.includes("T") ? row.published_at : `${row.published_at.replace(" ", "T")}Z`,
      );
      const capturedMinutes = Number.isFinite(publishedAt)
        ? Math.max(0, Math.round((Date.now() - publishedAt) / 60_000))
        : null;
      const threshold = [
        { minutes: 7 * 24 * 60, label: "7d" },
        { minutes: 72 * 60, label: "72h" },
        { minutes: 24 * 60, label: "24h" },
        { minutes: 60, label: "1h" },
      ].find((item) =>
        capturedMinutes != null
        && capturedMinutes >= item.minutes
        && capturedMinutes < item.minutes + 75);
      await env.DB.prepare(`INSERT INTO youtube_insights
        (reel_id, views, engaged_views, likes, comments, shares, subscribers_gained,
          average_view_duration_ms, average_view_percentage_bps, estimated_minutes_watched,
          last_error, updated_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NULL, CURRENT_TIMESTAMP)
        ON CONFLICT(reel_id) DO UPDATE SET views = excluded.views,
          engaged_views = excluded.engaged_views, likes = excluded.likes,
          comments = excluded.comments, shares = excluded.shares,
          subscribers_gained = excluded.subscribers_gained,
          average_view_duration_ms = excluded.average_view_duration_ms,
          average_view_percentage_bps = excluded.average_view_percentage_bps,
          estimated_minutes_watched = excluded.estimated_minutes_watched,
          last_error = NULL, updated_at = CURRENT_TIMESTAMP`)
        .bind(
          row.reel_id,
          Number(values[0] || 0),
          Number(values[1] || 0),
          Number(values[2] || 0),
          Number(values[3] || 0),
          Number(values[4] || 0),
          Number(values[5] || 0),
          Math.round(Number(values[6] || 0) * 1000),
          Math.round(Number(values[7] || 0) * 100),
          Number(values[8] || 0),
        ).run();
      await env.DB.prepare(`INSERT INTO youtube_insight_snapshots
        (reel_id, captured_date, milestone, captured_minutes, views, engaged_views,
          likes, comments, shares, subscribers_gained, average_view_duration_ms,
          average_view_percentage_bps)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        ON CONFLICT(reel_id, captured_date) DO UPDATE SET views = excluded.views,
          engaged_views = excluded.engaged_views, likes = excluded.likes,
          comments = excluded.comments, shares = excluded.shares,
          subscribers_gained = excluded.subscribers_gained,
          average_view_duration_ms = excluded.average_view_duration_ms,
          average_view_percentage_bps = excluded.average_view_percentage_bps,
          milestone = COALESCE(youtube_insight_snapshots.milestone, excluded.milestone),
          captured_minutes = COALESCE(youtube_insight_snapshots.captured_minutes, excluded.captured_minutes),
          captured_at = CURRENT_TIMESTAMP`)
        .bind(
          row.reel_id,
          today,
          threshold?.label || null,
          threshold ? capturedMinutes : null,
          Number(values[0] || 0),
          Number(values[1] || 0),
          Number(values[2] || 0),
          Number(values[3] || 0),
          Number(values[4] || 0),
          Number(values[5] || 0),
          Math.round(Number(values[6] || 0) * 1000),
          Math.round(Number(values[7] || 0) * 100),
        ).run();
      updated += 1;
    } catch (error) {
      await env.DB.prepare(`INSERT INTO youtube_insights (reel_id, last_error, updated_at)
        VALUES (?, ?, CURRENT_TIMESTAMP)
        ON CONFLICT(reel_id) DO UPDATE SET last_error = excluded.last_error,
          updated_at = CURRENT_TIMESTAMP`).bind(
        row.reel_id,
        error instanceof Error ? error.message.slice(0, 700) : "Falha ao ler YouTube Analytics.",
      ).run();
    }
  }
  return { total: results.length, updated };
}

export async function handleYouTubeRequest(
  request: Request,
  env: YouTubeEnv,
  auth: YouTubeRequestAuth,
): Promise<Response | null> {
  const url = new URL(request.url);
  const workerMediaMatch = url.pathname.match(/^\/worker-media\/(\d+)\.mp4$/);
  if (workerMediaMatch && (request.method === "GET" || request.method === "HEAD")) {
    return serveWorkerMedia(request, Number(workerMediaMatch[1]), env);
  }
  if (url.pathname === "/api/youtube/oauth/start" && request.method === "GET") {
    return startOAuth(request, env, auth);
  }
  if (url.pathname === "/api/youtube/oauth/callback" && request.method === "GET") {
    return finishOAuth(request, env, auth);
  }
  if (url.pathname === "/api/youtube/status" && request.method === "GET") {
    if (!auth.validUser) return json({ error: "Não autorizado." }, { status: 401 });
    return json(await youtubeConnection(env));
  }
  if (url.pathname === "/api/youtube/analytics" && request.method === "GET") {
    if (!auth.validUser) return json({ error: "Não autorizado." }, { status: 401 });
    return json(await youtubeAnalyticsPayload(env));
  }
  if (url.pathname === "/api/youtube/analytics/refresh" && request.method === "POST") {
    if (!auth.validUser) return json({ error: "Não autorizado." }, { status: 401 });
    if (!auth.validOrigin) return json({ error: "Origem inválida." }, { status: 403 });
    return json(await refreshYouTubeInsights(env));
  }
  if (url.pathname === "/api/internal/youtube/jobs/claim" && request.method === "POST") {
    return claimJob(request, env);
  }
  const analyzeMatch = url.pathname.match(/^\/api\/internal\/youtube\/jobs\/(\d+)\/analyze$/);
  if (analyzeMatch && request.method === "POST") return analyzeJob(request, Number(analyzeMatch[1]), env);
  const heartbeatMatch = url.pathname.match(/^\/api\/internal\/youtube\/jobs\/(\d+)\/heartbeat$/);
  if (heartbeatMatch && request.method === "POST") return heartbeatJob(request, Number(heartbeatMatch[1]), env);
  const completeMatch = url.pathname.match(/^\/api\/internal\/youtube\/jobs\/(\d+)\/complete$/);
  if (completeMatch && request.method === "POST") return completeJob(request, Number(completeMatch[1]), env);
  const failMatch = url.pathname.match(/^\/api\/internal\/youtube\/jobs\/(\d+)\/fail$/);
  if (failMatch && request.method === "POST") return failJob(request, Number(failMatch[1]), env);
  const releaseMatch = url.pathname.match(/^\/api\/reels\/(\d+)\/youtube\/release$/);
  if (releaseMatch && request.method === "POST") {
    return releasePublication(request, Number(releaseMatch[1]), env, auth);
  }
  const retryMatch = url.pathname.match(/^\/api\/reels\/(\d+)\/youtube\/retry$/);
  if (retryMatch && request.method === "POST") {
    return retryPublication(request, Number(retryMatch[1]), env, auth);
  }
  const metadataMatch = url.pathname.match(/^\/api\/reels\/(\d+)\/youtube\/metadata$/);
  if (metadataMatch && request.method === "PATCH") {
    return updateMetadata(request, Number(metadataMatch[1]), env, auth);
  }
  return null;
}
