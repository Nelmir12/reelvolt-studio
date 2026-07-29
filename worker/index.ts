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
  NOTION_TOKEN?: string;
  NOTION_DATABASE_ID?: string;
  REEL_RESOLVER_URL?: string;
  REEL_RESOLVER_TOKEN?: string;
}

interface ExecutionContext {
  waitUntil(promise: Promise<unknown>): void;
  passThroughOnException(): void;
}

type ReelInput = {
  messageId: string;
  senderId: string;
  sourceUrl: string;
  rules?: string;
  sourceAccount?: string;
  rightsConfirmed: boolean;
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
  notion_page_id: string | null;
};

type ReelListRow = {
  id: number;
  source_url: string;
  rules: string | null;
  source_account: string | null;
  rights_confirmed: number;
  public_token: string | null;
  filename: string | null;
  content_type: string | null;
  size_bytes: number | null;
  status: string;
  error: string | null;
  created_at: string;
  completed_at: string | null;
};

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
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  completed_at TEXT
)`;
const CREATE_REELS_INDEX = "CREATE INDEX IF NOT EXISTS reels_created_at_idx ON reels (created_at DESC)";
const CREATE_REELS_SOURCE_INDEX = "CREATE INDEX IF NOT EXISTS reels_source_url_idx ON reels (source_url)";
const CREATE_REELS_PUBLIC_TOKEN_INDEX = "CREATE UNIQUE INDEX IF NOT EXISTS reels_public_token_idx ON reels (public_token)";
const CREATE_AUTHORIZED_SENDERS = `CREATE TABLE IF NOT EXISTS authorized_senders (
  sender_id TEXT PRIMARY KEY,
  paired_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
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

function notionText(content: string) {
  return [{ type: "text", text: { content: content.slice(0, 1900) } }];
}

function notionHeaders(env: Env) {
  return {
    authorization: `Bearer ${env.NOTION_TOKEN}`,
    "content-type": "application/json",
    "notion-version": "2022-06-28",
  };
}

function notionStatus(status: string) {
  const labels: Record<string, string> = {
    queued: "Na fila",
    downloading: "Baixando",
    ready: "Pronto",
    failed: "Falhou",
  };
  return labels[status] ?? status;
}

async function createNotionRecord(record: ReelRecord, env: Env, baseUrl: string) {
  if (!env.NOTION_TOKEN || !env.NOTION_DATABASE_ID) return null;
  const response = await fetch("https://api.notion.com/v1/pages", {
    method: "POST",
    headers: notionHeaders(env),
    body: JSON.stringify({
      parent: { database_id: env.NOTION_DATABASE_ID },
      properties: {
        Nome: { title: notionText(`Reel #${record.id}`) },
        URL: { url: record.source_url },
        Status: { select: { name: "Na fila" } },
        Regras: { rich_text: notionText(record.rules || "Sem regras adicionais") },
        Origem: { select: { name: "Web" } },
        ID: { number: record.id },
        MP4: { url: publicDownloadUrl(baseUrl, record.public_token || "") },
        Erro: { rich_text: [] },
        "Conta de origem": { rich_text: record.source_account ? notionText(record.source_account) : [] },
        "Direitos confirmados": { checkbox: Boolean(record.rights_confirmed) },
      },
    }),
  });
  const result = await response.json() as { id?: string; message?: string };
  if (!response.ok || !result.id) throw new Error(result.message || "Falha ao criar o item no Notion.");
  await env.DB.prepare("UPDATE reels SET notion_page_id = ? WHERE id = ?").bind(result.id, record.id).run();
  return result.id;
}

async function updateNotionRecord(
  pageId: string | null,
  status: string,
  error: string | null,
  env: Env,
) {
  if (!pageId || !env.NOTION_TOKEN) return;
  const response = await fetch(`https://api.notion.com/v1/pages/${pageId}`, {
    method: "PATCH",
    headers: notionHeaders(env),
    body: JSON.stringify({
      properties: {
        Status: { select: { name: notionStatus(status) } },
        Erro: { rich_text: error ? notionText(error) : [] },
      },
    }),
  });
  if (!response.ok) {
    const result = await response.json() as { message?: string };
    throw new Error(result.message || "Falha ao atualizar o item no Notion.");
  }
}

async function resolveVideo(sourceUrl: string, env: Env) {
  const direct = await fetch(sourceUrl, {
    headers: {
      "user-agent": "Mozilla/5.0 (compatible; BTSupplyReelInbox/3.0)",
      accept: "text/html,application/xhtml+xml,video/*;q=0.9,*/*;q=0.8",
    },
    redirect: "follow",
  });
  const directType = direct.headers.get("content-type") ?? "";
  if (direct.ok && directType.startsWith("video/") && direct.body) {
    return { response: direct };
  }

  if (direct.ok && directType.includes("text/html")) {
    const html = await direct.text();
    const encoded = html.match(/<meta[^>]+property=["']og:video(?::secure_url)?["'][^>]+content=["']([^"']+)["']/i)?.[1]
      ?? html.match(/<meta[^>]+content=["']([^"']+)["'][^>]+property=["']og:video(?::secure_url)?["']/i)?.[1];
    if (encoded) {
      const videoUrl = encoded.replaceAll("&amp;", "&");
      const response = await fetch(videoUrl, {
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
        "content-type": "application/json",
        ...(env.REEL_RESOLVER_TOKEN ? { authorization: `Bearer ${env.REEL_RESOLVER_TOKEN}` } : {}),
      },
      body: JSON.stringify({ url: sourceUrl }),
    });
    if (resolver.ok) {
      const result = await resolver.json() as {
        videoUrl?: string;
        url?: string;
        download_url?: string;
      };
      const videoUrl = result.videoUrl ?? result.url ?? result.download_url;
      if (typeof videoUrl === "string") {
        const response = await fetch(videoUrl, { redirect: "follow" });
        if (response.ok && response.body) return { response };
      }
    }
  }
  throw new Error("O Instagram não disponibilizou um arquivo público para este Reel.");
}

async function processReel(record: ReelRecord, env: Env, baseUrl: string) {
  let notionPageId = record.notion_page_id;
  try {
    try {
      notionPageId = await createNotionRecord(record, env, baseUrl) ?? notionPageId;
    } catch (error) {
      console.error("Falha ao registrar no Notion:", error);
    }

    await env.DB.prepare("UPDATE reels SET status = 'downloading', error = NULL WHERE id = ?")
      .bind(record.id).run();
    try {
      await updateNotionRecord(notionPageId, "downloading", null, env);
    } catch (error) {
      console.error("Falha ao atualizar o Notion:", error);
    }

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
    await env.DB.prepare(`UPDATE reels
      SET status = 'ready', storage_key = ?, filename = ?, content_type = ?, size_bytes = ?,
        completed_at = CURRENT_TIMESTAMP, error = NULL
      WHERE id = ?`)
      .bind(storageKey, `reel-${record.id}.mp4`, "video/mp4", stored?.size ?? null, record.id)
      .run();
    try {
      await updateNotionRecord(notionPageId, "ready", null, env);
    } catch (error) {
      console.error("Falha ao atualizar o Notion:", error);
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : "Falha desconhecida";
    await env.DB.prepare("UPDATE reels SET status = 'failed', error = ? WHERE id = ?")
      .bind(message.slice(0, 500), record.id).run();
    try {
      await updateNotionRecord(notionPageId, "failed", message, env);
    } catch (notionError) {
      console.error("Falha ao atualizar o Notion:", notionError);
    }
  }
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
  const result = await env.DB.prepare(
    `INSERT OR IGNORE INTO reels
      (message_id, sender_id, source_url, rules, source_account, rights_confirmed, public_token, status)
      VALUES (?, ?, ?, ?, ?, ?, ?, 'queued')`,
  ).bind(
    input.messageId,
    input.senderId,
    input.sourceUrl,
    input.rules || null,
    input.sourceAccount || null,
    input.rightsConfirmed ? 1 : 0,
    publicToken,
  ).run();
  if (!result.meta.changes) return { accepted: false, reason: "duplicate" };

  const record = await env.DB.prepare(
    `SELECT id, source_url, rules, source_account, rights_confirmed, public_token, notion_page_id
      FROM reels WHERE message_id = ?`,
  ).bind(input.messageId).first<ReelRecord>();
  if (!record) return { accepted: false, reason: "database_error" };
  ctx.waitUntil(processReel(record, env, baseUrl));
  return { accepted: true, id: record.id };
}

async function serveVideo(
  row: { storage_key: string; filename: string; content_type: string } | null,
  env: Env,
) {
  if (!row?.storage_key) return json({ error: "Vídeo não encontrado." }, { status: 404 });
  const object = await env.VIDEOS.get(row.storage_key);
  if (!object?.body) return json({ error: "Arquivo não encontrado." }, { status: 404 });
  return new Response(object.body, {
    headers: {
      "content-type": row.content_type || "video/mp4",
      "content-disposition": `attachment; filename="${row.filename || "reel.mp4"}"`,
      "content-length": String(object.size),
      "cache-control": "private, no-store",
      "x-content-type-options": "nosniff",
    },
  });
}

async function listReels(env: Env, baseUrl: string) {
  const { results } = await env.DB.prepare(`SELECT id, source_url, rules, source_account,
    rights_confirmed, public_token, filename, content_type, size_bytes, status, error,
    created_at, completed_at
    FROM reels ORDER BY id DESC LIMIT 50`).all<ReelListRow>();
  return results.map((row) => ({
    ...row,
    download_url: row.status === "ready" && row.public_token
      ? publicDownloadUrl(baseUrl, row.public_token)
      : null,
    public_token: undefined,
  }));
}

async function api(request: Request, env: Env, ctx: ExecutionContext): Promise<Response | null> {
  const url = new URL(request.url);
  const isPublicDownload = /^\/download\/[0-9a-f-]{36}$/i.test(url.pathname);
  if (!url.pathname.startsWith("/api/") && !isPublicDownload) return null;

  await ensureDatabase(env);
  const baseUrl = publicBaseUrl(request.url, env);

  if (url.pathname === "/api/reels" && request.method === "GET") {
    if (!validInboxUser(request, env) && !validAdmin(request, env)) {
      return json({ error: "Não autorizado." }, { status: 401 });
    }
    return json({ reels: await listReels(env, baseUrl) });
  }

  if (url.pathname === "/api/reels/intake" && request.method === "POST") {
    if (!validInboxUser(request, env)) return json({ error: "Não autorizado." }, { status: 401 });
    if (!validWriteOrigin(request)) return json({ error: "Origem inválida." }, { status: 403 });

    const data = await request.json() as {
      url?: string;
      rules?: string;
      sourceAccount?: string;
      rightsConfirmed?: boolean;
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
      rules: sanitizeText(data.rules, 1000),
      sourceAccount: sanitizeText(data.sourceAccount, 80),
      rightsConfirmed: true,
    }, env, ctx, baseUrl);

    return json(result, {
      status: result.accepted ? 202 : result.reason === "duplicate" ? 200 : 400,
    });
  }

  if (url.pathname === "/api/inbox/status" && request.method === "GET") {
    if (!validInboxUser(request, env)) return json({ error: "Não autorizado." }, { status: 401 });
    return json({
      user: authenticatedEmail(request),
      notion: Boolean(env.NOTION_TOKEN && env.NOTION_DATABASE_ID),
      resolver: Boolean(env.REEL_RESOLVER_URL),
      storage: true,
    });
  }

  if (url.pathname === "/api/integrations/status" && request.method === "GET") {
    if (!validAdmin(request, env)) return json({ error: "Não autorizado." }, { status: 401 });
    return json({
      inbox: {
        allowedEmails: configuredInboxEmails(env).length,
      },
      notion: {
        token: Boolean(env.NOTION_TOKEN),
        database: Boolean(env.NOTION_DATABASE_ID),
      },
      resolver: Boolean(env.REEL_RESOLVER_URL),
      storage: true,
    });
  }

  if (url.pathname === "/api/reels/manual" && request.method === "POST") {
    if (!validAdmin(request, env)) return json({ error: "Não autorizado." }, { status: 401 });
    const data = await request.json() as { url?: string; rules?: string; sourceAccount?: string };
    const sourceUrl = findInstagramUrl(data?.url);
    if (!sourceUrl) return json({ error: "Informe uma URL válida de Reel público." }, { status: 400 });
    const result = await queueReel({
      messageId: `manual-${crypto.randomUUID()}`,
      senderId: "manual",
      sourceUrl,
      rules: sanitizeText(data.rules, 1000),
      sourceAccount: sanitizeText(data.sourceAccount, 80),
      rightsConfirmed: true,
    }, env, ctx, baseUrl);
    return json(result, { status: result.accepted ? 202 : result.reason === "duplicate" ? 200 : 400 });
  }

  const adminDownloadMatch = url.pathname.match(/^\/api\/reels\/(\d+)\/download$/);
  if (adminDownloadMatch && request.method === "GET") {
    if (!validAdmin(request, env)) return json({ error: "Não autorizado." }, { status: 401 });
    const row = await env.DB.prepare(
      "SELECT storage_key, filename, content_type FROM reels WHERE id = ? AND status = 'ready'",
    ).bind(Number(adminDownloadMatch[1])).first<{
      storage_key: string;
      filename: string;
      content_type: string;
    }>();
    return serveVideo(row, env);
  }

  const publicDownloadMatch = url.pathname.match(/^\/download\/([0-9a-f-]{36})$/i);
  if (publicDownloadMatch && request.method === "GET") {
    const row = await env.DB.prepare(
      "SELECT storage_key, filename, content_type FROM reels WHERE public_token = ? AND status = 'ready'",
    ).bind(publicDownloadMatch[1]).first<{
      storage_key: string;
      filename: string;
      content_type: string;
    }>();
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
