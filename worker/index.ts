import { handleImageOptimization, DEFAULT_DEVICE_SIZES, DEFAULT_IMAGE_SIZES } from "vinext/server/image-optimization";
import handler from "vinext/server/app-router-entry";

interface Env {
  ASSETS: Fetcher;
  DB: D1Database;
  VIDEOS: R2Bucket;
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
};

type QueueResult = {
  accepted: boolean;
  id?: number;
  reason?: "duplicate" | "database_error";
};

type ReelRecord = {
  id: number;
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
  publish_status: string;
  instagram_container_id: string | null;
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
};

type InstagramCredentials = {
  accessToken: string;
  userId: string;
  expiresAt: number;
};

const FIXED_CAPTION = "V arrived at #VogueWorld: Hollywood in unmistakable style, enjoying the live performances while showcasing the effortless elegance he's become known for. Another runway-worthy moment. #Taehyung";
const COVER_PATH = "/reel-cover.jpg";
const PUBLICATION_MODES = new Set<PublicationMode>(["download_only", "approval", "auto"]);

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
    env.DB.prepare(CREATE_AUTHORIZED_SENDERS),
    env.DB.prepare(CREATE_INSTAGRAM_AUTH),
  ]);

  const { results } = await env.DB.prepare("PRAGMA table_info(reels)").all<{ name: string }>();
  const existing = new Set(results.map((column) => column.name));
  for (const [name, statement] of Object.entries(ADDITIONAL_COLUMNS)) {
    if (!existing.has(name)) await env.DB.prepare(statement).run();
  }
  await env.DB.prepare(CREATE_REELS_PUBLISH_INDEX).run();
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
    await env.DB.prepare(`UPDATE reels SET publish_status = 'creating', publish_error = NULL,
      publish_requested_at = COALESCE(publish_requested_at, CURRENT_TIMESTAMP) WHERE id = ?`)
      .bind(record.id).run();

    let containerId = record.instagram_container_id;
    if (!containerId) {
      const videoUrl = await signedMediaUrl(record.id, baseUrl, env);
      const created = await graphRequest(
        `${env.INSTAGRAM_USER_ID}/media`,
        env,
        "POST",
        {
          media_type: "REELS",
          video_url: videoUrl,
          cover_url: `${baseUrl}${COVER_PATH}`,
          caption: record.caption || FIXED_CAPTION,
          share_to_feed: record.share_to_feed ? "true" : "false",
        },
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
    const message = error instanceof Error ? error.message : "Falha desconhecida na publicação.";
    await env.DB.prepare(
      "UPDATE reels SET publish_status = 'failed', publish_error = ? WHERE id = ?",
    ).bind(message.slice(0, 700), record.id).run();
  }
}

async function processReel(record: ReelRecord, env: Env, baseUrl: string) {
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
      : record.publication_mode === "auto"
        ? "queued"
        : "awaiting_approval";
    await env.DB.prepare(`UPDATE reels
      SET status = 'ready', storage_key = ?, filename = ?, content_type = ?, size_bytes = ?,
        completed_at = CURRENT_TIMESTAMP, error = NULL, publish_status = ?, publish_error = NULL
      WHERE id = ?`)
      .bind(storageKey, `reel-${record.id}.mp4`, "video/mp4", stored?.size ?? null, publishStatus, record.id)
      .run();

    if (record.publication_mode === "auto") {
      await publishReel({ ...record, storage_key: storageKey, filename: `reel-${record.id}.mp4`, content_type: "video/mp4", status: "ready" }, env, baseUrl);
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : "Falha desconhecida";
    await env.DB.prepare(`UPDATE reels SET status = 'failed', error = ?,
      publish_status = CASE WHEN publication_mode = 'download_only' THEN 'not_requested' ELSE 'blocked' END
      WHERE id = ?`)
      .bind(message.slice(0, 500), record.id).run();
  }
}

async function reelById(id: number, env: Env) {
  return env.DB.prepare(`SELECT id, source_url, rules, source_account, rights_confirmed, public_token,
    storage_key, filename, content_type, status, publication_mode, share_to_feed, caption,
    publish_status, instagram_container_id
    FROM reels WHERE id = ?`).bind(id).first<ReelRecord>();
}

async function queueReel(
  input: ReelInput,
  env: Env,
  ctx: ExecutionContext,
  baseUrl: string,
): Promise<QueueResult> {
  const existing = await env.DB.prepare(
    "SELECT id FROM reels WHERE source_url = ? AND status IN ('queued', 'downloading', 'ready') ORDER BY id DESC LIMIT 1",
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

  const record = await env.DB.prepare(`SELECT id, source_url, rules, source_account, rights_confirmed,
    public_token, storage_key, filename, content_type, status, publication_mode, share_to_feed,
    caption, publish_status, instagram_container_id FROM reels WHERE message_id = ?`)
    .bind(input.messageId).first<ReelRecord>();
  if (!record) return { accepted: false, reason: "database_error" };
  ctx.waitUntil(processReel(record, env, baseUrl));
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

async function listReels(env: Env, baseUrl: string) {
  const { results } = await env.DB.prepare(`SELECT id, source_url, rules, source_account,
    rights_confirmed, public_token, storage_key, filename, content_type, size_bytes, status, error,
    publication_mode, share_to_feed, caption, publish_status, publish_error,
    instagram_container_id, instagram_media_id, instagram_permalink, publish_requested_at,
    published_at, created_at, completed_at
    FROM reels ORDER BY id DESC LIMIT 80`).all<ReelListRow>();
  return results.map((row) => ({
    ...row,
    download_url: row.status === "ready" && row.public_token
      ? publicDownloadUrl(baseUrl, row.public_token)
      : null,
    public_token: undefined,
    storage_key: undefined,
  }));
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
      resolver_connected: Boolean(env.REEL_RESOLVER_URL),
      cover_url: `${baseUrl}${COVER_PATH}`,
      caption: FIXED_CAPTION,
      account: "@btsupply_",
    },
  };
}

async function api(request: Request, env: Env, ctx: ExecutionContext): Promise<Response | null> {
  const url = new URL(request.url);
  const isPublicDownload = /^\/download\/[0-9a-f-]{36}$/i.test(url.pathname);
  const publishMediaMatch = url.pathname.match(/^\/publish-media\/(\d+)\.mp4$/);
  if (!url.pathname.startsWith("/api/") && !isPublicDownload && !publishMediaMatch) return null;

  await ensureDatabase(env);
  const baseUrl = publicBaseUrl(request.url, env);

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

  if (url.pathname === "/api/reels" && request.method === "GET") {
    if (!validInboxUser(request, env) && !validAdmin(request, env)) {
      return json({ error: "Não autorizado." }, { status: 401 });
    }
    return json({ reels: await listReels(env, baseUrl) });
  }

  if (url.pathname === "/api/dashboard" && request.method === "GET") {
    if (!validInboxUser(request, env)) return json({ error: "Não autorizado." }, { status: 401 });
    return json(await dashboard(env, baseUrl));
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
    }, env, ctx, baseUrl);
    return json(result, {
      status: result.accepted ? 202 : result.reason === "duplicate" ? 200 : 400,
    });
  }

  const publishMatch = url.pathname.match(/^\/api\/reels\/(\d+)\/publish$/);
  if (publishMatch && request.method === "POST") {
    if (!validInboxUser(request, env)) return json({ error: "Não autorizado." }, { status: 401 });
    if (!validWriteOrigin(request)) return json({ error: "Origem inválida." }, { status: 403 });
    if (!metaConnected(env)) {
      return json({ error: "A conta @btsupply_ ainda precisa ser conectada à Meta." }, { status: 503 });
    }
    const record = await reelById(Number(publishMatch[1]), env);
    if (!record) return json({ error: "Reel não encontrado." }, { status: 404 });
    if (record.status !== "ready") return json({ error: "O MP4 ainda não está pronto." }, { status: 409 });
    if (record.publish_status === "published") return json({ error: "Este Reel já foi publicado." }, { status: 409 });
    ctx.waitUntil(publishReel(record, env, baseUrl));
    return json({ accepted: true, id: record.id }, { status: 202 });
  }

  if (url.pathname === "/api/inbox/status" && request.method === "GET") {
    if (!validInboxUser(request, env)) return json({ error: "Não autorizado." }, { status: 401 });
    return json({
      user: authenticatedEmail(request),
      instagram: metaConnected(env),
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
    }, env, ctx, baseUrl);
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
};

export default worker;
