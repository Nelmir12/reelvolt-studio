"use client";

import { useCallback, useEffect, useMemo, useState } from "react";

type Operations = {
  total: number;
  ready: number;
  awaiting_approval: number;
  publishing: number;
  published: number;
  failed: number;
  stored_bytes: number;
  last_seven_days: number;
};

type InsightReel = {
  id: number;
  rank: number;
  source_account: string | null;
  instagram_permalink: string | null;
  published_at: string | null;
  created_at: string;
  cover_url: string;
  views: number;
  reach: number;
  likes: number;
  comments: number;
  saved: number;
  shares: number;
  total_interactions: number;
  average_watch_time_ms: number;
  total_watch_time_ms: number;
  engagement_rate: number;
  share_rate: number;
  save_rate: number;
  updated_at: string | null;
};

type Analytics = {
  summary: {
    published_reels: number;
    total_views: number;
    average_views: number;
    total_reach: number;
    total_interactions: number;
    engagement_rate: number;
    share_rate: number;
    save_rate: number;
    total_watch_time_ms: number;
  };
  reels: InsightReel[];
  history: Array<{
    captured_date: string;
    views: number;
    reach: number;
    total_interactions: number;
    shares: number;
    saved: number;
  }>;
  recommendations: Array<{
    title: string;
    body: string;
    tone: string;
  }>;
  sync: {
    status: "connected" | "permission_required" | "waiting" | "empty";
    last_synced_at: string | null;
    last_attempt_at: string | null;
    refresh_due: boolean;
    refreshing: boolean;
    permission_required: boolean;
    message: string | null;
  };
};

type AnalyticsDashboardProps = {
  account: string;
  operations: Operations;
};

const number = new Intl.NumberFormat("pt-BR");
const compactNumber = new Intl.NumberFormat("pt-BR", {
  notation: "compact",
  maximumFractionDigits: 1,
});
const REELS_PER_PAGE = 6;

function formatBytes(value: number) {
  if (!value) return "0 MB";
  if (value >= 1024 * 1024 * 1024) return `${(value / 1024 / 1024 / 1024).toFixed(1).replace(".", ",")} GB`;
  return `${(value / 1024 / 1024).toFixed(1).replace(".", ",")} MB`;
}

function formatDate(value: string | null, includeTime = false) {
  if (!value) return "Ainda não sincronizado";
  const normalized = value.includes("T") ? value : `${value.replace(" ", "T")}Z`;
  return new Intl.DateTimeFormat("pt-BR", includeTime
    ? { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" }
    : { day: "2-digit", month: "short", year: "2-digit" }).format(new Date(normalized));
}

function formatWatchTime(milliseconds: number) {
  if (!milliseconds) return "—";
  const seconds = Math.round(milliseconds / 1000);
  if (seconds < 60) return `${seconds}s`;
  const minutes = Math.floor(seconds / 60);
  return `${minutes}min ${seconds % 60}s`;
}

export default function AnalyticsDashboard({ account, operations }: AnalyticsDashboardProps) {
  const [analytics, setAnalytics] = useState<Analytics | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [rankingPage, setRankingPage] = useState(1);

  const loadAnalytics = useCallback(async (quiet = false) => {
    if (!quiet) setLoading(true);
    try {
      const response = await fetch("/api/analytics", {
        credentials: "same-origin",
        headers: { accept: "application/json" },
      });
      const data = await response.json() as Analytics & { error?: string };
      if (!response.ok) throw new Error(data.error || "Não foi possível carregar os Insights.");
      setAnalytics(data);
      setError(null);
      if (!data.sync.refreshing) setRefreshing(false);
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : "Não foi possível carregar os Insights.");
      setRefreshing(false);
    } finally {
      if (!quiet) setLoading(false);
    }
  }, []);

  useEffect(() => {
    const timer = window.setTimeout(() => void loadAnalytics(), 0);
    return () => window.clearTimeout(timer);
  }, [loadAnalytics]);

  useEffect(() => {
    if (!analytics?.sync.refreshing && !refreshing) return;
    const timer = window.setTimeout(() => void loadAnalytics(true), 4200);
    return () => window.clearTimeout(timer);
  }, [analytics?.sync.refreshing, loadAnalytics, refreshing]);

  const rankingPageCount = Math.max(1, Math.ceil((analytics?.reels.length ?? 0) / REELS_PER_PAGE));
  const visibleInsightReels = useMemo(
    () => analytics?.reels.slice((rankingPage - 1) * REELS_PER_PAGE, rankingPage * REELS_PER_PAGE) ?? [],
    [analytics?.reels, rankingPage],
  );

  useEffect(() => {
    setRankingPage((current) => Math.min(current, rankingPageCount));
  }, [rankingPageCount]);

  async function refreshInsights() {
    setRefreshing(true);
    setError(null);
    try {
      const response = await fetch("/api/analytics/refresh", {
        method: "POST",
        credentials: "same-origin",
        headers: { accept: "application/json" },
      });
      const data = await response.json() as { error?: string };
      if (!response.ok) throw new Error(data.error || "Não foi possível atualizar os Insights.");
      window.setTimeout(() => void loadAnalytics(true), 3200);
    } catch (refreshError) {
      setError(refreshError instanceof Error ? refreshError.message : "Não foi possível atualizar os Insights.");
      setRefreshing(false);
    }
  }

  const operationCards = [
    { label: "Recebidos", value: operations.total, note: `${operations.last_seven_days} nos últimos 7 dias` },
    { label: "MP4 prontos", value: operations.ready, note: formatBytes(operations.stored_bytes) },
    { label: "Para aprovar", value: operations.awaiting_approval, note: "aguardando sua decisão" },
    { label: "Publicando", value: operations.publishing, note: "processando agora" },
    { label: "Publicados", value: operations.published, note: operations.failed ? `${operations.failed} com falha` : "sem falhas" },
  ];
  const performanceCards = analytics ? [
    { label: "Visualizações totais", value: compactNumber.format(analytics.summary.total_views), note: `${analytics.summary.published_reels} Reels medidos`, accent: true },
    { label: "Média por Reel", value: compactNumber.format(analytics.summary.average_views), note: "visualizações por publicação" },
    { label: "Alcance somado", value: compactNumber.format(analytics.summary.total_reach), note: "contas alcançadas por Reel" },
    { label: "Interações", value: compactNumber.format(analytics.summary.total_interactions), note: "curtidas, comentários, salvos e envios" },
    { label: "Engajamento", value: `${analytics.summary.engagement_rate.toFixed(1).replace(".", ",")}%`, note: "interações ÷ alcance" },
  ] : [];
  const chartRows = useMemo(() => analytics?.history.slice(-14) ?? [], [analytics?.history]);
  const chartMax = Math.max(1, ...chartRows.map((row) => row.views));

  return (
    <div className="analytics-view">
      <section className="analytics-hero">
        <div>
          <span className="eyebrow">{account}</span>
          <h1>Métricas</h1>
          <p>Desempenho dos seus Reels e visão geral da operação.</p>
        </div>
        <aside className="sync-card">
          <span className={`connection-dot ${analytics?.sync.status === "connected" ? "online" : ""}`} />
          <div>
            <strong>
              {analytics?.sync.status === "connected"
                ? "Insights conectados"
                : analytics?.sync.status === "permission_required"
                  ? "Autorização de Insights necessária"
                  : "Preparando métricas"}
            </strong>
            <small>Última leitura: {formatDate(analytics?.sync.last_synced_at ?? null, true)}</small>
          </div>
          <button
            type="button"
            className="ghost-button"
            onClick={() => void refreshInsights()}
            disabled={refreshing || analytics?.sync.refreshing}
          >
            {refreshing || analytics?.sync.refreshing ? "Atualizando…" : "Atualizar métricas"}
          </button>
        </aside>
      </section>

      {error ? <div className="global-notice error" role="alert">{error}</div> : null}
      {analytics?.sync.permission_required ? (
        <div className="insights-permission" role="status">
          <div>
            <strong>Falta liberar a leitura de Insights na Meta</strong>
            <p>
              O painel está pronto. A conta precisa autorizar a permissão
              <code>instagram_business_manage_insights</code> para preencher visualizações e alcance.
            </p>
          </div>
          <span>SEM CUSTO</span>
        </div>
      ) : null}

      <section className="dashboard-section">
        <div className="dashboard-section-heading">
          <div>
            <span>01 · DESEMPENHO</span>
            <h2>O que o público está fazendo</h2>
          </div>
          <p>Visualizações são exibições; o alcance representa contas únicas em cada Reel.</p>
        </div>
        {loading ? (
          <div className="analytics-loading">Carregando desempenho…</div>
        ) : (
          <div className="performance-grid">
            {performanceCards.map((metric) => (
              <article className={`performance-card ${metric.accent ? "accent" : ""}`} key={metric.label}>
                <span>{metric.label}</span>
                <strong>{metric.value}</strong>
                <small>{metric.note}</small>
              </article>
            ))}
          </div>
        )}
      </section>

      <section className="dashboard-section">
        <div className="dashboard-section-heading">
          <div>
            <span>02 · OPERAÇÃO</span>
            <h2>Visão operacional</h2>
          </div>
          <p>Estes são os indicadores do fluxo de download, aprovação e publicação.</p>
        </div>
        <div className="metrics-grid analytics-operations">
          {operationCards.map((metric) => (
            <article className="metric-card" key={metric.label}>
              <span>{metric.label}</span>
              <strong>{metric.value}</strong>
              <small>{metric.note}</small>
            </article>
          ))}
        </div>
      </section>

      <section className="analytics-split">
        <div className="dashboard-section recommendation-panel">
          <div className="dashboard-section-heading compact">
            <div>
              <span>03 · PRÓXIMAS AÇÕES</span>
              <h2>Como buscar mais views</h2>
            </div>
          </div>
          <div className="recommendation-list">
            {(analytics?.recommendations ?? []).map((recommendation, index) => (
              <article className={`recommendation-card ${recommendation.tone}`} key={`${recommendation.title}-${index}`}>
                <span>{String(index + 1).padStart(2, "0")}</span>
                <div>
                  <strong>{recommendation.title}</strong>
                  <p>{recommendation.body}</p>
                </div>
              </article>
            ))}
          </div>
        </div>

        <div className="dashboard-section history-panel">
          <div className="dashboard-section-heading compact">
            <div>
              <span>04 · EVOLUÇÃO</span>
              <h2>Visualizações acumuladas</h2>
            </div>
          </div>
          {chartRows.length ? (
            <div className="history-chart" aria-label="Histórico de visualizações acumuladas">
              {chartRows.map((row) => (
                <div className="history-column" key={row.captured_date}>
                  <span>{compactNumber.format(row.views)}</span>
                  <i style={{ height: `${Math.max(8, (row.views / chartMax) * 100)}%` }} />
                  <small>{formatDate(`${row.captured_date}T12:00:00Z`)}</small>
                </div>
              ))}
            </div>
          ) : (
            <div className="history-empty">
              O histórico diário começará na primeira sincronização e ficará mais útil a cada publicação.
            </div>
          )}
        </div>
      </section>

      <section className="dashboard-section ranking-section">
        <div className="dashboard-section-heading">
          <div>
            <span>05 · RANKING</span>
            <h2>Desempenho por Reel</h2>
          </div>
          <p>Ordenado por visualizações totais.</p>
        </div>
        {analytics?.reels.length ? (
          <div className="insight-table">
            <div className="insight-table-head" aria-hidden="true">
              <span>Reel</span><span>Views</span><span>Alcance</span><span>Interações</span>
              <span>Envios</span><span>Engaj.</span><span>Retenção</span>
            </div>
            {visibleInsightReels.map((reel) => (
              <article className="insight-row" key={reel.id}>
                <div className="insight-reel">
                  <span className="rank-number">#{reel.rank}</span>
                  <img src={reel.cover_url} alt="" />
                  <div>
                    <strong>Reel #{reel.id}</strong>
                    <small>{formatDate(reel.published_at || reel.created_at)}</small>
                    {reel.instagram_permalink ? (
                      <a href={reel.instagram_permalink} target="_blank" rel="noreferrer">Abrir no Instagram</a>
                    ) : null}
                  </div>
                </div>
                <div data-label="Views"><strong>{number.format(reel.views)}</strong></div>
                <div data-label="Alcance"><strong>{number.format(reel.reach)}</strong></div>
                <div data-label="Interações">
                  <strong>{number.format(reel.total_interactions)}</strong>
                  <small>{reel.likes} curtidas · {reel.comments} comentários</small>
                </div>
                <div data-label="Envios">
                  <strong>{number.format(reel.shares)}</strong>
                  <small>{reel.saved} salvos</small>
                </div>
                <div data-label="Engaj."><strong>{reel.engagement_rate.toFixed(1).replace(".", ",")}%</strong></div>
                <div data-label="Retenção">
                  <strong>{reel.average_watch_time_ms ? formatWatchTime(reel.average_watch_time_ms) : "—"}</strong>
                  <small>tempo médio</small>
                </div>
              </article>
            ))}
            <nav className="pagination-bar" aria-label="Paginação do desempenho por Reel">
              <span>
                Reels {(rankingPage - 1) * REELS_PER_PAGE + 1}–{Math.min(rankingPage * REELS_PER_PAGE, analytics.reels.length)}
                {" "}de {analytics.reels.length}
              </span>
              <div>
                <button
                  type="button"
                  onClick={() => setRankingPage((current) => Math.max(1, current - 1))}
                  disabled={rankingPage === 1}
                >
                  Anterior
                </button>
                <strong>Página {rankingPage} de {rankingPageCount}</strong>
                <button
                  type="button"
                  onClick={() => setRankingPage((current) => Math.min(rankingPageCount, current + 1))}
                  disabled={rankingPage === rankingPageCount}
                >
                  Próxima
                </button>
              </div>
            </nav>
          </div>
        ) : (
          <div className="history-empty">As publicações aparecerão aqui depois da primeira leitura de Insights.</div>
        )}
      </section>

      <p className="analytics-footnote">
        Os totais somam os resultados dos Reels publicados pelo sistema. “Alcance somado” não representa
        pessoas únicas entre publicações diferentes. Use tendências e comparações, não um único número isolado.
      </p>
    </div>
  );
}
