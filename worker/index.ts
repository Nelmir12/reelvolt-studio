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
  META_VERIFY_TOKEN?: string;
  META_APP_SECRET?: string;
  ALLOWED_IG_SENDER_IDS?: string;
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
};

const CREATE_REELS = `CREATE TABLE IF NOT EXISTS reels (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  message_id TEXT NOT NULL UNIQUE,
  sender_id TEXT NOT NULL,
  source_url TEXT NOT NULL,
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

function json(data: unknown, init: ResponseInit = {}) {
  const headers = new Headers(init.headers);
  headers.set("content-type", "application/json; charset=utf-8");
  headers.set("cache-control", "no-store");
  return new Response(JSON.stringify(data), { ...init, headers });
}

async function ensureDatabase(env: Env) {
  await env.DB.batch([
    env.DB.prepare(CREATE_REELS),
    env.DB.prepare(CREATE_REELS_INDEX),
  ]);
}

function allowedSender(env: Env, senderId: string) {
  const configured = env.ALLOWED_IG_SENDER_IDS?.split(",").map((id) => id.trim()).filter(Boolean) ?? [];
  return configured.length === 0 || configured.includes(senderId);
}

function findInstagramUrl(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const match = value.match(/https?:\/\/(?:www\.)?instagram\.com\/(?:reel|reels|p)\/[A-Za-z0-9_-]+[^\s<"]*/i);
  return match?.[0]?.replace(/[),.;]+$/, "") ?? null;
}

function extractMessages(payload: any): ReelInput[] {
  const results: ReelInput[] = [];
  for (const entry of payload?.entry ?? []) {
    for (const event of entry?.messaging ?? []) {
      const message = event?.message;
      if (!message || message.is_echo) continue;
      const senderId = String(event?.sender?.id ?? "");
      const messageId = String(message?.mid ?? `${senderId}-${event?.timestamp ?? Date.now()}`);
      const candidates = [
        message?.text,
        ...(message?.attachments ?? []).flatMap((attachment: any) => [
          attachment?.payload?.url,
          attachment?.payload?.share_url,
          attachment?.url,
        ]),
      ];
      const sourceUrl = candidates.map(findInstagramUrl).find(Boolean)
        ?? candidates.find((candidate: unknown) => typeof candidate === "string" && /^https:\/\//i.test(candidate));
      if (senderId && sourceUrl) results.push({ messageId, senderId, sourceUrl });
    }
  }
  return results;
}

async function validMetaSignature(request: Request, body: ArrayBuffer, env: Env) {
  if (!env.META_APP_SECRET) return true;
  const signature = request.headers.get("x-hub-signature-256");
  if (!signature?.startsWith("sha256=")) return false;
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(env.META_APP_SECRET),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const digest = await crypto.subtle.sign("HMAC", key, body);
  const actual = `sha256=${[...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, "0")).join("")}`;
  if (actual.length !== signature.length) return false;
  let different = 0;
  for (let index = 0; index < actual.length; index += 1) different |= actual.charCodeAt(index) ^ signature.charCodeAt(index);
  return different === 0;
}

async function resolveVideo(sourceUrl: string, env: Env) {
  const direct = await fetch(sourceUrl, {
    headers: { "user-agent": "Mozilla/5.0 (compatible; ReelInbox/1.0)" },
    redirect: "follow",
  });
  const directType = direct.headers.get("content-type") ?? "";
  if (direct.ok && directType.startsWith("video/") && direct.body) {
    return { response: direct, videoUrl: sourceUrl };
  }

  if (direct.ok && directType.includes("text/html")) {
    const html = await direct.text();
    const encoded = html.match(/<meta[^>]+property=["']og:video(?::secure_url)?["'][^>]+content=["']([^"']+)["']/i)?.[1]
      ?? html.match(/<meta[^>]+content=["']([^"']+)["'][^>]+property=["']og:video(?::secure_url)?["']/i)?.[1];
    if (encoded) {
      const videoUrl = encoded.replaceAll("&amp;", "&");
      const response = await fetch(videoUrl, { redirect: "follow" });
      if (response.ok && response.body) return { response, videoUrl };
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
      const result = await resolver.json() as any;
      const videoUrl = result.videoUrl ?? result.url ?? result.download_url;
      if (typeof videoUrl === "string") {
        const response = await fetch(videoUrl, { redirect: "follow" });
        if (response.ok && response.body) return { response, videoUrl };
      }
    }
  }
  throw new Error("O Instagram não disponibilizou um arquivo público para este Reel.");
}

async function processReel(id: number, sourceUrl: string, env: Env) {
  try {
    await env.DB.prepare("UPDATE reels SET status = 'downloading', error = NULL WHERE id = ?").bind(id).run();
    const { response } = await resolveVideo(sourceUrl, env);
    const contentType = response.headers.get("content-type")?.split(";")[0] || "video/mp4";
    if (!contentType.startsWith("video/")) throw new Error("A origem não retornou um vídeo.");
    const storageKey = `reels/${id}-${crypto.randomUUID()}.mp4`;
    await env.VIDEOS.put(storageKey, response.body, {
      httpMetadata: { contentType },
      customMetadata: { sourceUrl },
    });
    const stored = await env.VIDEOS.head(storageKey);
    await env.DB.prepare(`UPDATE reels
      SET status = 'ready', storage_key = ?, filename = ?, content_type = ?, size_bytes = ?, completed_at = CURRENT_TIMESTAMP
      WHERE id = ?`)
      .bind(storageKey, `reel-${id}.mp4`, contentType, stored?.size ?? null, id)
      .run();
  } catch (error) {
    const message = error instanceof Error ? error.message : "Falha desconhecida";
    await env.DB.prepare("UPDATE reels SET status = 'failed', error = ? WHERE id = ?").bind(message.slice(0, 500), id).run();
  }
}

async function queueReel(input: ReelInput, env: Env, ctx: ExecutionContext) {
  if (!allowedSender(env, input.senderId)) return { accepted: false, reason: "sender_not_allowed" };
  const result = await env.DB.prepare(
    "INSERT OR IGNORE INTO reels (message_id, sender_id, source_url, status) VALUES (?, ?, ?, 'queued')",
  ).bind(input.messageId, input.senderId, input.sourceUrl).run();
  if (!result.meta.changes) return { accepted: false, reason: "duplicate" };
  const row = await env.DB.prepare("SELECT id FROM reels WHERE message_id = ?").bind(input.messageId).first<{ id: number }>();
  if (!row) return { accepted: false, reason: "database_error" };
  ctx.waitUntil(processReel(row.id, input.sourceUrl, env));
  return { accepted: true, id: row.id };
}

async function api(request: Request, env: Env, ctx: ExecutionContext): Promise<Response | null> {
  const url = new URL(request.url);
  if (!url.pathname.startsWith("/api/") && url.pathname !== "/instagram/webhook") return null;
  await ensureDatabase(env);

  if (url.pathname === "/instagram/webhook" && request.method === "GET") {
    const valid = url.searchParams.get("hub.mode") === "subscribe"
      && url.searchParams.get("hub.verify_token") === env.META_VERIFY_TOKEN;
    return valid ? new Response(url.searchParams.get("hub.challenge") ?? "") : new Response("Token inválido", { status: 403 });
  }

  if (url.pathname === "/instagram/webhook" && request.method === "POST") {
    const body = await request.arrayBuffer();
    if (!(await validMetaSignature(request, body, env))) return new Response("Assinatura inválida", { status: 401 });
    const payload = JSON.parse(new TextDecoder().decode(body));
    const messages = extractMessages(payload);
    for (const message of messages) await queueReel(message, env, ctx);
    return new Response("EVENT_RECEIVED");
  }

  if (url.pathname === "/api/reels" && request.method === "GET") {
    const { results } = await env.DB.prepare(`SELECT id, sender_id, source_url, filename, content_type,
      size_bytes, status, error, created_at, completed_at FROM reels ORDER BY id DESC LIMIT 100`).all();
    return json({ reels: results, configured: Boolean(env.META_VERIFY_TOKEN), senderFilter: Boolean(env.ALLOWED_IG_SENDER_IDS) });
  }

  if (url.pathname === "/api/reels/manual" && request.method === "POST") {
    const data = await request.json() as any;
    const sourceUrl = findInstagramUrl(data?.url);
    if (!sourceUrl) return json({ error: "Informe uma URL válida de Reel público." }, { status: 400 });
    const result = await queueReel({
      messageId: `manual-${crypto.randomUUID()}`,
      senderId: "manual",
      sourceUrl,
    }, env, ctx);
    return json(result, { status: result.accepted ? 202 : 400 });
  }

  const downloadMatch = url.pathname.match(/^\/api\/reels\/(\d+)\/download$/);
  if (downloadMatch && request.method === "GET") {
    const row = await env.DB.prepare("SELECT storage_key, filename, content_type FROM reels WHERE id = ? AND status = 'ready'")
      .bind(Number(downloadMatch[1])).first<{ storage_key: string; filename: string; content_type: string }>();
    if (!row?.storage_key) return json({ error: "Vídeo não encontrado." }, { status: 404 });
    const object = await env.VIDEOS.get(row.storage_key);
    if (!object?.body) return json({ error: "Arquivo não encontrado." }, { status: 404 });
    return new Response(object.body, {
      headers: {
        "content-type": row.content_type || "video/mp4",
        "content-disposition": `attachment; filename="${row.filename || `reel-${downloadMatch[1]}.mp4`}"`,
        "content-length": String(object.size),
      },
    });
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
          const result = await env.IMAGES.input(body).transform(width > 0 ? { width } : {}).output({ format, quality });
          return result.response();
        },
      }, allowedWidths);
    }
    const apiResponse = await api(request, env, ctx);
    return apiResponse ?? handler.fetch(request, env, ctx);
  },
};

export default worker;
