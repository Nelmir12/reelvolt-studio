import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

async function render(headers = {}) {
  const workerUrl = new URL("../dist/server/index.js", import.meta.url);
  workerUrl.searchParams.set("test", `${process.pid}-${Date.now()}-${Math.random()}`);
  const { default: worker } = await import(workerUrl.href);

  return worker.fetch(
    new Request("http://localhost/", {
      headers: {
        accept: "text/html",
        "oai-authenticated-user-email": "nelmirjr@gmail.com",
        ...headers,
      },
    }),
    {
      ASSETS: {
        fetch: async () => new Response("Not found", { status: 404 }),
      },
    },
    {
      waitUntil() {},
      passThroughOnException() {},
    },
  );
}

test("server-renders the authenticated Reel Inbox", async () => {
  const response = await render();
  assert.equal(response.status, 200);
  assert.match(response.headers.get("content-type") ?? "", /^text\/html\b/i);

  const html = await response.text();
  assert.match(html, /<title>BT Supply Reel Inbox<\/title>/i);
  assert.match(html, /Compartilhe/);
  assert.match(html, /Baixe/);
  assert.match(html, /Organize/);
  assert.match(html, /Novo Reel/);
  assert.match(html, /Fila recente/);
  assert.match(html, /Notion/);
  assert.doesNotMatch(html, /Telegram|Direct do Instagram|codex-preview|Building your site/i);
});

test("declares the protected web intake, PWA share target and Notion flow", async () => {
  const [worker, readme, manifest] = await Promise.all([
    readFile(new URL("../worker/index.ts", import.meta.url), "utf8"),
    readFile(new URL("../README.md", import.meta.url), "utf8"),
    readFile(new URL("../public/manifest.webmanifest", import.meta.url), "utf8"),
  ]);

  assert.match(worker, /\/api\/reels\/intake/);
  assert.match(worker, /oai-authenticated-user-email/i);
  assert.match(worker, /INBOX_ALLOWED_EMAILS/);
  assert.match(worker, /rightsConfirmed/);
  assert.match(worker, /NOTION_DATABASE_ID/);
  assert.match(worker, /public_token/);
  assert.doesNotMatch(worker, /TELEGRAM_BOT_TOKEN|telegram\/webhook/i);
  assert.match(manifest, /"share_target"/);
  assert.match(manifest, /"display": "standalone"/);
  assert.match(readme, /Instagram não disponibilizar o arquivo publicamente/);
});
