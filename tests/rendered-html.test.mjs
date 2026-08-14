import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import {
  extractInstagramEmbedVideoUrl,
  instagramEmbedUrl,
} from "../worker/instagram-embed.ts";

test("extracts the public Instagram embed video URL", () => {
  const contextJSON = JSON.stringify({
    gql_data: {
      shortcode_media: {
        video_url: "https://cdn.example/reel.mp4?token=abc",
      },
    },
  });
  const html = `<script>requireLazy([],function(){return ["init",[],[${JSON.stringify({ contextJSON })}]],42]})</script>`;

  assert.equal(
    instagramEmbedUrl("https://www.instagram.com/reel/DbpGkQnhHKz/?igsh=abc"),
    "https://www.instagram.com/p/DbpGkQnhHKz/embed/captioned/",
  );
  assert.equal(extractInstagramEmbedVideoUrl(html), "https://cdn.example/reel.mp4?token=abc");
  assert.equal(instagramEmbedUrl("https://example.com/reel/DbpGkQnhHKz/"), null);
});

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
  assert.doesNotMatch(html, /YouTube|Shorts/);
  assert.match(html, /Produção recente/);
  assert.match(html, /<h2>Publicação<\/h2>/);
  assert.match(html, /Usar legenda/);
  assert.match(html, /Fila automática/);
  assert.match(html, /Sem capa personalizada/);
  assert.match(html, /reelvolt-icon-192\.png/);
  assert.doesNotMatch(html, /Baixe\. Aprove\.|Um fluxo único|Reel Inbox<\/span>/i);
  assert.doesNotMatch(html, /Notion/);
  assert.doesNotMatch(html, /Telegram|codex-preview|Building your site/i);
});

test("server-renders the analytics dashboard tab", async () => {
  const response = await render({}, "/?view=dashboard");
  assert.equal(response.status, 200);
  const html = await response.text();
  assert.match(html, /<h1>Métricas<\/h1>/);
  assert.match(html, /Desempenho dos Reels|Carregando desempenho/);
  assert.doesNotMatch(html, /YouTube|Shorts/);
  assert.match(html, /Visão operacional/);
  assert.match(html, /Como buscar mais views/);
  assert.match(html, /Desempenho por Reel/);
  assert.doesNotMatch(html, /Dados que viram/);
});

test("declares the protected Instagram flow and retires YouTube publishing", async () => {
  const [worker, youtube, readme, manifest, inbox, analytics, reelDownloader] = await Promise.all([
    readFile(new URL("../worker/index.ts", import.meta.url), "utf8"),
    readFile(new URL("../worker/youtube.ts", import.meta.url), "utf8"),
    readFile(new URL("../README.md", import.meta.url), "utf8"),
    readFile(new URL("../public/manifest.webmanifest", import.meta.url), "utf8"),
    readFile(new URL("../app/inbox-client.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/analytics-dashboard.tsx", import.meta.url), "utf8"),
    readFile(new URL("../.github/workflows/reel-downloader.yml", import.meta.url), "utf8"),
  ]);

  assert.match(worker, /\/api\/reels\/intake/);
  assert.match(worker, /retryReelMatch/);
  assert.match(worker, /listRecentFailedReels/);
  assert.match(worker, /retryFailedReel/);
  assert.match(worker, /uploadFailedReelMedia/);
  assert.match(worker, /uploadReelMediaMatch/);
  assert.match(worker, /Falha ao preparar o Reel/);
  assert.match(worker, /\/api\/shortcut\/intake/);
  assert.match(worker, /\/api\/shortcut\/access/);
  assert.match(worker, /shortcutTokenHash/);
  assert.match(worker, /token_hash/);
  assert.doesNotMatch(worker, /INSERT INTO shortcut_access \(id, token,/);
  assert.match(worker, /oai-authenticated-user-email/i);
  assert.match(worker, /INBOX_ALLOWED_EMAILS/);
  assert.match(worker, /rightsConfirmed/);
  assert.doesNotMatch(worker, /NOTION_DATABASE_ID|api\.notion\.com/);
  assert.match(worker, /REEL_RESOLVER_AUTH_SCHEME/);
  assert.match(worker, /dispatchExternalResolver/);
  assert.match(worker, /receiveResolvedReelMedia/);
  assert.match(worker, /REEL_DOWNLOAD_WORKER_SECRET/);
  assert.match(worker, /resolverResultMatch/);
  assert.match(worker, /resolver-result/);
  assert.match(worker, /result\.picker/);
  assert.match(worker, /downloadMode: "auto"/);
  assert.match(worker, /public_token/);
  assert.match(worker, /\/api\/dashboard/);
  assert.match(worker, /\/api\/analytics/);
  assert.match(worker, /instagram_business_manage_insights/);
  assert.match(worker, /reel_insight_snapshots/);
  assert.match(worker, /publication_history: publicationHistory/);
  assert.match(worker, /\[\"views\", \"reach\"\]/);
  assert.match(worker, /\[\"likes\", \"comments\", \"saved\", \"shares\", \"total_interactions\"\]/);
  assert.match(worker, /instagram_insight_sync/);
  assert.match(worker, /Math\.min\(6, results\.length\)/);
  assert.match(worker, /already_running/);
  assert.match(worker, /result\.total > 0 && result\.updated === 0/);
  assert.match(worker, /A Meta não retornou métricas para os Reels publicados/);
  assert.match(worker, /VALUES \(\?, \?, \?, \?, \?, \?, \?, \?, \?, \?, CURRENT_TIMESTAMP\)/);
  assert.doesNotMatch(worker, /VALUES \(\?, \?, \?, \?, \?, \?, \?, \?, \?, \?, \?, CURRENT_TIMESTAMP\)/);
  const analyticsRoute = worker.slice(
    worker.indexOf('url.pathname === \"\/api\/analytics\"'),
    worker.indexOf('url.pathname === \"\/api\/shortcut\/access\"'),
  );
  assert.doesNotMatch(analyticsRoute, /youtube|refreshAllInsights/i);
  const scheduledHandler = worker.slice(worker.indexOf("async scheduled("));
  assert.doesNotMatch(scheduledHandler, /YouTube|refreshAllInsights/);
  assert.match(worker, /media_publish/);
  assert.match(worker, /reconcilePublishedReel/);
  assert.match(worker, /WHERE r\.archived_at IS NULL AND r\.status <> 'failed'/);
  assert.match(worker, /cover_url/);
  assert.match(worker, /publish-media/);
  assert.match(worker, /studio_settings/);
  assert.match(worker, /scheduled_for/);
  assert.match(worker, /processPublicationQueue/);
  assert.match(worker, /authorizeAutomaticPublicationQueue/);
  assert.match(worker, /automatic_queued/);
  assert.match(worker, /publish_status IN \('awaiting_approval', 'awaiting_setup'\)/);
  assert.match(worker, /publish-cover/);
  assert.match(worker, /PUBLISH_URL_SECRET/);
  assert.match(worker, /\/webhooks\/instagram/);
  assert.match(worker, /x-hub-signature-256/i);
  assert.match(worker, /DIRECT_RIGHTS_PAYLOAD/);
  assert.match(worker, /INSTAGRAM_DIRECT_ALLOWED_USERNAME/);
  assert.match(worker, /sendDirectApprovalButton/);
  assert.match(worker, /autorização permanente/i);
  assert.match(worker, /instagram_business_manage_messages|subscribed_fields/);
  assert.match(worker, /messaging_type: "RESPONSE"/);
  assert.match(worker, /record\.sender_id\.startsWith\("instagram:"\)/);
  assert.match(worker, /"share", "media", "video", "ig_reel", "reel"/);
  assert.match(worker, /request\.method === "DELETE"/);
  assert.match(worker, /env\.VIDEOS\.delete\(record\.storage_key\)/);
  assert.match(worker, /media_deleted_at/);
  assert.match(worker, /WHERE r\.archived_at IS NULL AND r\.status <> 'failed' ORDER BY r\.id DESC/);
  assert.doesNotMatch(worker, /ORDER BY r\.id DESC LIMIT 80/);
  assert.match(worker, /instagram_media_id, instagram_permalink FROM reels/);
  assert.match(worker, /destinations/);
  assert.match(youtube, /YOUTUBE_PUBLISHING_ENABLED = false/);
  assert.match(youtube, /youtube_publishing_retired/);
  assert.match(youtube, /A publicação no YouTube foi desativada no ReelVolt/);
  assert.doesNotMatch(worker, /queueYouTubePublication|dispatchYouTubeExecutor|youtubeConnection/);
  assert.match(worker, /A publicação no YouTube foi retirada do ReelVolt/);
  assert.doesNotMatch(worker, /TELEGRAM_BOT_TOKEN|telegram\/webhook/i);
  assert.match(manifest, /"share_target"/);
  assert.match(manifest, /"display": "standalone"/);
  assert.match(inbox, /const REELS_PER_PAGE = 6/);
  assert.match(inbox, /visibleReels\.map/);
  assert.match(inbox, /Publicar no Instagram/);
  assert.match(inbox, /todos os MP4 prontos e os próximos serão publicados em sequência/);
  assert.match(inbox, /Recebido pelo Direct/);
  assert.match(inbox, /Atalho do iPhone/);
  assert.match(inbox, /Autorização permanente ativa/);
  assert.doesNotMatch(inbox, /APROVAÇÃO DO INSTAGRAM|approvalDraft|approval-overlay/);
  assert.doesNotMatch(inbox, /Base dos direitos|Conteúdo infantil|Mídia sintética realista|Promoção paga/);
  assert.match(inbox, /MP4 pronto/);
  assert.match(inbox, /Publicado no Instagram/);
  assert.match(inbox, /Excluir arquivo/);
  assert.match(inbox, /Falhas recentes de preparação/);
  assert.match(inbox, /Tentar novamente/);
  assert.match(inbox, /Enviar MP4/);
  assert.match(inbox, /accept="video\/mp4,\.mp4"/);
  assert.match(inbox, /métricas foram preservadas/);
  assert.doesNotMatch(inbox, /YouTube|Shorts/);
  assert.match(inbox, /Como acompanhar/);
  assert.doesNotMatch(inbox, /<option value="auto">/);
  assert.match(analytics, /const REELS_PER_PAGE = 6/);
  assert.match(analytics, /Visualizações por dia de publicação/);
  assert.match(analytics, /row\.published_date/);
  assert.match(analytics, /visibleInsightReels\.map/);
  assert.match(analytics, /Últimos 7 dias/);
  assert.match(analytics, /Últimos 30 dias/);
  assert.match(readme, /resolvedor privado\/licenciado/);
  assert.match(readme, /experimento de publicação no YouTube foi retirado/);
  assert.match(readme, /instagram_business_manage_messages/);
  assert.match(readme, /X-Hub-Signature-256/);
  assert.match(readme, /Atalho privado do iPhone/);
  assert.match(readme, /executor isolado/i);
  assert.match(reelDownloader, /workflow_dispatch/);
  assert.match(reelDownloader, /ghcr\.io\/nelmir12\/cobalt:latest/);
  assert.match(reelDownloader, /Content-Type: video\/mp4/);
  assert.match(reelDownloader, /REEL_DOWNLOAD_WORKER_SECRET/);
  assert.match(reelDownloader, /YOUTUBE_WORKER_SECRET/);
  assert.match(reelDownloader, /continue-on-error: true/);
  assert.match(reelDownloader, /steps\.resolve\.outcome == 'success'/);
  assert.match(reelDownloader, /steps\.resolve\.outcome == 'failure'/);
  assert.doesNotMatch(reelDownloader, /if: failure\(\)/);
});
