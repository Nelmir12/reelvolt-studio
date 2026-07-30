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
  assert.match(html, /<title>ReelVolt<\/title>/i);
  assert.match(html, /Área de trabalho/);
  assert.match(html, /<h1>Produção<\/h1>/);
  assert.match(html, /Novo Reel/);
  assert.match(html, /Produção recente/);
  assert.match(html, /<h2>Publicação<\/h2>/);
  assert.match(html, /Usar legenda/);
  assert.match(html, /Fila automática/);
  assert.match(html, /Sem capa personalizada/);
  assert.match(html, /reelvolt-icon-192\.png/);
  assert.doesNotMatch(html, /Baixe\. Aprove\.|Um fluxo único|Reel Inbox<\/span>/i);
  assert.doesNotMatch(html, /Notion/);
  assert.doesNotMatch(html, /Telegram|Direct do Instagram|codex-preview|Building your site/i);
});

test("server-renders the analytics dashboard tab", async () => {
  const response = await render({}, "/?view=dashboard");
  assert.equal(response.status, 200);
  const html = await response.text();
  assert.match(html, /<h1>Métricas<\/h1>/);
  assert.match(html, /Visualizações totais|Carregando desempenho/);
  assert.match(html, /Visão operacional/);
  assert.match(html, /Como buscar mais views/);
  assert.match(html, /Desempenho por Reel/);
  assert.doesNotMatch(html, /Dados que viram/);
});

test("declares the protected intake, dashboard and official Meta publishing flow", async () => {
  const [worker, readme, manifest, inbox, analytics] = await Promise.all([
    readFile(new URL("../worker/index.ts", import.meta.url), "utf8"),
    readFile(new URL("../README.md", import.meta.url), "utf8"),
    readFile(new URL("../public/manifest.webmanifest", import.meta.url), "utf8"),
    readFile(new URL("../app/inbox-client.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/analytics-dashboard.tsx", import.meta.url), "utf8"),
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
  assert.match(worker, /studio_settings/);
  assert.match(worker, /scheduled_for/);
  assert.match(worker, /processPublicationQueue/);
  assert.match(worker, /publish-cover/);
  assert.match(worker, /PUBLISH_URL_SECRET/);
  assert.doesNotMatch(worker, /TELEGRAM_BOT_TOKEN|telegram\/webhook/i);
  assert.match(manifest, /"share_target"/);
  assert.match(manifest, /"display": "standalone"/);
  assert.match(inbox, /const REELS_PER_PAGE = 6/);
  assert.match(inbox, /visibleReels\.map/);
  assert.match(inbox, /Aprovar para a fila/);
  assert.doesNotMatch(inbox, /<option value="auto">/);
  assert.match(analytics, /const REELS_PER_PAGE = 6/);
  assert.match(analytics, /visibleInsightReels\.map/);
  assert.match(readme, /fallback privado quando o Instagram exige login/);
  assert.match(readme, /instância privada[\s\S]*Cobalt/);
  assert.match(readme, /O Notion não faz\s+parte do fluxo operacional/);
});
