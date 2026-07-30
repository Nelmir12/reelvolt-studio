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
  assert.match(html, /Instagram Reels/);
  assert.match(html, /YouTube Shorts/);
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
  assert.match(html, /Desempenho dos Reels|Carregando desempenho/);
  assert.match(html, /Desempenho dos Shorts/);
  assert.match(html, /Visão operacional/);
  assert.match(html, /Como buscar mais views/);
  assert.match(html, /Desempenho por Reel/);
  assert.doesNotMatch(html, /Dados que viram/);
});

test("declares the protected intake, dashboard and official multichannel publishing flow", async () => {
  const [worker, youtube, readme, manifest, inbox, analytics] = await Promise.all([
    readFile(new URL("../worker/index.ts", import.meta.url), "utf8"),
    readFile(new URL("../worker/youtube.ts", import.meta.url), "utf8"),
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
  assert.match(worker, /publication_history: publicationHistory/);
  assert.match(worker, /\"views\", \"reach\", \"likes\", \"comments\", \"saved\", \"shares\"/);
  assert.match(worker, /media_publish/);
  assert.match(worker, /reconcilePublishedReel/);
  assert.match(worker, /WHERE r\.status <> 'failed'/);
  assert.match(worker, /cover_url/);
  assert.match(worker, /publish-media/);
  assert.match(worker, /studio_settings/);
  assert.match(worker, /scheduled_for/);
  assert.match(worker, /processPublicationQueue/);
  assert.match(worker, /publish-cover/);
  assert.match(worker, /PUBLISH_URL_SECRET/);
  assert.match(worker, /queueYouTubePublication/);
  assert.match(worker, /destinations/);
  assert.match(youtube, /youtube\.upload/);
  assert.match(youtube, /yt-analytics\.readonly/);
  assert.match(youtube, /code_challenge_method/);
  assert.match(youtube, /privacyStatus: "public"/);
  assert.match(youtube, /YOUTUBE_API_AUDITED/);
  assert.match(youtube, /awaiting_studio_check/);
  assert.match(youtube, /status: range \? 206 : 200/);
  assert.doesNotMatch(worker, /TELEGRAM_BOT_TOKEN|telegram\/webhook/i);
  assert.match(manifest, /"share_target"/);
  assert.match(manifest, /"display": "standalone"/);
  assert.match(inbox, /const REELS_PER_PAGE = 6/);
  assert.match(inbox, /visibleReels\.map/);
  assert.match(inbox, /Aprovar para a fila/);
  assert.match(inbox, /APROVAÇÃO POR DESTINO/);
  assert.match(inbox, /Publicar também no YouTube/);
  assert.match(inbox, /MP4 pronto/);
  assert.match(inbox, /Publicado no Instagram/);
  assert.match(inbox, /Envio ainda não iniciado/);
  assert.match(inbox, /Iniciar envio ao YouTube/);
  assert.match(inbox, /Publicar Short no YouTube/);
  assert.match(inbox, /Como acompanhar/);
  assert.doesNotMatch(inbox, /<option value="auto">/);
  assert.match(analytics, /const REELS_PER_PAGE = 6/);
  assert.match(analytics, /Visualizações por dia de publicação/);
  assert.match(analytics, /row\.published_date/);
  assert.match(analytics, /visibleInsightReels\.map/);
  assert.match(analytics, /Últimos 7 dias/);
  assert.match(analytics, /Últimos 30 dias/);
  assert.match(readme, /fallback privado quando o Instagram exige login/);
  assert.match(readme, /instância privada[\s\S]*Cobalt/);
  assert.match(readme, /O Notion não faz\s+parte do fluxo operacional/);
  assert.match(readme, /sempre cria o vídeo como privado/);
});
