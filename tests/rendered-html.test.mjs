import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

async function render(headers = {}, path = "/") {
  const workerUrl = new URL("../dist/server/index.js", import.meta.url);
  workerUrl.searchParams.set("test", `${process.pid}-${Date.now()}-${Math.random()}`);
  const { default: worker } = await import(workerUrl.href);

  return worker.fetch(
    new Request(`http://localhost${path}`, {
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
  assert.match(html, /Baixe/);
  assert.match(html, /Aprove/);
  assert.match(html, /Publique/);
  assert.match(html, /Novo Reel/);
  assert.match(html, /Produção recente/);
  assert.match(html, /Pacote padrão/);
  assert.doesNotMatch(html, /Notion/);
  assert.doesNotMatch(html, /Telegram|Direct do Instagram|codex-preview|Building your site/i);
});

test("server-renders the analytics dashboard tab", async () => {
  const response = await render({}, "/?view=dashboard");
  assert.equal(response.status, 200);
  const html = await response.text();
  assert.match(html, /Dados que viram/);
  assert.match(html, /Visualizações totais|Carregando desempenho/);
  assert.match(html, /Ritmo do Reel Inbox/);
  assert.match(html, /Como buscar mais views/);
  assert.match(html, /Desempenho por Reel/);
});

test("declares the protected intake, dashboard and official Meta publishing flow", async () => {
  const [worker, readme, manifest] = await Promise.all([
    readFile(new URL("../worker/index.ts", import.meta.url), "utf8"),
    readFile(new URL("../README.md", import.meta.url), "utf8"),
    readFile(new URL("../public/manifest.webmanifest", import.meta.url), "utf8"),
  ]);

  assert.match(worker, /\/api\/reels\/intake/);
  assert.match(worker, /oai-authenticated-user-email/i);
  assert.match(worker, /INBOX_ALLOWED_EMAILS/);
  assert.match(worker, /rightsConfirmed/);
  assert.doesNotMatch(worker, /NOTION_DATABASE_ID|api\.notion\.com/);
  assert.match(worker, /REEL_RESOLVER_AUTH_SCHEME/);
  assert.match(worker, /result\.picker/);
  assert.match(worker, /downloadMode: "auto"/);
  assert.match(worker, /public_token/);
  assert.match(worker, /\/api\/dashboard/);
  assert.match(worker, /\/api\/analytics/);
  assert.match(worker, /instagram_business_manage_insights/);
  assert.match(worker, /reel_insight_snapshots/);
  assert.match(worker, /\"views\", \"reach\", \"likes\", \"comments\", \"saved\", \"shares\"/);
  assert.match(worker, /media_publish/);
  assert.match(worker, /reconcilePublishedReel/);
  assert.match(worker, /WHERE status <> 'failed'/);
  assert.match(worker, /cover_url/);
  assert.match(worker, /publish-media/);
  assert.match(worker, /PUBLISH_URL_SECRET/);
  assert.doesNotMatch(worker, /TELEGRAM_BOT_TOKEN|telegram\/webhook/i);
  assert.match(manifest, /"share_target"/);
  assert.match(manifest, /"display": "standalone"/);
  assert.match(readme, /fallback privado quando o Instagram exige login/);
  assert.match(readme, /instância privada[\s\S]*Cobalt/);
  assert.match(readme, /O Notion não faz\s+parte do fluxo operacional/);
});
