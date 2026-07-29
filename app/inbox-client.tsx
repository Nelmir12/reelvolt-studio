"use client";

import { FormEvent, useCallback, useEffect, useMemo, useState } from "react";
import AnalyticsDashboard from "./analytics-dashboard";

type Reel = {
  id: number;
  source_url: string;
  rules: string | null;
  source_account: string | null;
  filename: string | null;
  size_bytes: number | null;
  status: string;
  error: string | null;
  publication_mode: "download_only" | "approval" | "auto";
  share_to_feed: number;
  caption: string | null;
  publish_status: string;
  publish_error: string | null;
  instagram_permalink: string | null;
  download_url: string | null;
  created_at: string;
  completed_at: string | null;
  published_at: string | null;
};

type Dashboard = {
  metrics: {
    total: number;
    ready: number;
    awaiting_approval: number;
    publishing: number;
    published: number;
    failed: number;
    stored_bytes: number;
    last_seven_days: number;
  };
  settings: {
    meta_connected: boolean;
    resolver_connected: boolean;
    cover_url: string;
    caption: string;
    account: string;
  };
};

type InboxClientProps = {
  userEmail: string;
  signOutUrl: string;
  sharedText: string;
  initialView: "inbox" | "dashboard";
};

const INSTAGRAM_URL = /https?:\/\/(?:www\.)?instagram\.com\/(?:reel|reels|p)\/[A-Za-z0-9_-]+[^\s<"]*/i;

const DOWNLOAD_LABELS: Record<string, string> = {
  queued: "Na fila",
  downloading: "Baixando",
  ready: "MP4 pronto",
  failed: "Falhou",
};

const PUBLISH_LABELS: Record<string, string> = {
  not_requested: "Publicação disponível",
  awaiting_download: "Aguardando MP4",
  awaiting_approval: "Aguardando aprovação",
  awaiting_setup: "Aguardando conexão",
  queued: "Publicação na fila",
  creating: "Criando publicação",
  processing: "Meta processando",
  publishing: "Publicando",
  published: "Publicado",
  failed: "Falha ao publicar",
  blocked: "Bloqueado pelo download",
};

const EMPTY_DASHBOARD: Dashboard = {
  metrics: {
    total: 0,
    ready: 0,
    awaiting_approval: 0,
    publishing: 0,
    published: 0,
    failed: 0,
    stored_bytes: 0,
    last_seven_days: 0,
  },
  settings: {
    meta_connected: false,
    resolver_connected: false,
    cover_url: "/reel-cover.jpg",
    caption: "V arrived at #VogueWorld: Hollywood in unmistakable style, enjoying the live performances while showcasing the effortless elegance he's become known for. Another runway-worthy moment. #Taehyung",
    account: "@btsupply_",
  },
};

function extractSharedUrl(value: string) {
  return value.match(INSTAGRAM_URL)?.[0]?.replace(/[),.;]+$/, "") ?? "";
}

function formatBytes(value: number | null) {
  if (!value) return "0 MB";
  if (value >= 1024 * 1024 * 1024) return `${(value / 1024 / 1024 / 1024).toFixed(1).replace(".", ",")} GB`;
  return `${(value / 1024 / 1024).toFixed(1).replace(".", ",")} MB`;
}

function formatDate(value: string | null) {
  if (!value) return "";
  const normalized = value.includes("T") ? value : `${value.replace(" ", "T")}Z`;
  return new Intl.DateTimeFormat("pt-BR", {
    day: "2-digit",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(normalized));
}

function publicationModeLabel(mode: Reel["publication_mode"]) {
  if (mode === "auto") return "Automático";
  if (mode === "download_only") return "Somente download";
  return "Com aprovação";
}

export default function InboxClient({ userEmail, signOutUrl, sharedText, initialView }: InboxClientProps) {
  const initialUrl = useMemo(() => extractSharedUrl(sharedText), [sharedText]);
  const [url, setUrl] = useState(initialUrl);
  const [sourceAccount, setSourceAccount] = useState("");
  const [publicationMode, setPublicationMode] = useState<Reel["publication_mode"]>("approval");
  const [shareToFeed, setShareToFeed] = useState(true);
  const [rightsConfirmed, setRightsConfirmed] = useState(false);
  const [reels, setReels] = useState<Reel[]>([]);
  const [dashboard, setDashboard] = useState<Dashboard>(EMPTY_DASHBOARD);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [publishingId, setPublishingId] = useState<number | null>(null);
  const [notice, setNotice] = useState<{ tone: "success" | "error" | "info"; text: string } | null>(null);
  const [activeView, setActiveView] = useState<"inbox" | "dashboard">(initialView);

  const loadData = useCallback(async (quiet = false) => {
    if (!quiet) setLoading(true);
    try {
      const [reelsResponse, dashboardResponse] = await Promise.all([
        fetch("/api/reels", { credentials: "same-origin", headers: { accept: "application/json" } }),
        fetch("/api/dashboard", { credentials: "same-origin", headers: { accept: "application/json" } }),
      ]);
      if (!reelsResponse.ok || !dashboardResponse.ok) throw new Error("Não foi possível carregar o painel.");
      const reelsData = await reelsResponse.json() as { reels?: Reel[] };
      const dashboardData = await dashboardResponse.json() as Dashboard;
      setReels(reelsData.reels ?? []);
      setDashboard(dashboardData);
    } catch (error) {
      if (!quiet) {
        setNotice({
          tone: "error",
          text: error instanceof Error ? error.message : "Não foi possível carregar o painel.",
        });
      }
    } finally {
      if (!quiet) setLoading(false);
    }
  }, []);

  useEffect(() => {
    const initialLoad = window.setTimeout(() => void loadData(), 0);
    if ("serviceWorker" in navigator) void navigator.serviceWorker.register("/sw.js");
    return () => window.clearTimeout(initialLoad);
  }, [loadData]);

  useEffect(() => {
    const activeStatuses = new Set(["queued", "downloading", "creating", "processing", "publishing"]);
    const hasActiveWork = reels.some((reel) =>
      activeStatuses.has(reel.status) || activeStatuses.has(reel.publish_status));
    if (!hasActiveWork) return;
    const timer = window.setInterval(() => void loadData(true), 4500);
    return () => window.clearInterval(timer);
  }, [loadData, reels]);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setNotice(null);
    setSubmitting(true);
    try {
      const response = await fetch("/api/reels/intake", {
        method: "POST",
        credentials: "same-origin",
        headers: { "content-type": "application/json", accept: "application/json" },
        body: JSON.stringify({
          url,
          sourceAccount,
          rules: "fixed_cover_caption",
          publicationMode,
          shareToFeed,
          rightsConfirmed,
        }),
      });
      const data = await response.json() as {
        accepted?: boolean;
        id?: number;
        reason?: string;
        error?: string;
      };
      if (!response.ok) throw new Error(data.error || "Não foi possível adicionar o Reel.");
      if (data.accepted) {
        const action = publicationMode === "auto"
          ? "O download e a publicação começaram."
          : publicationMode === "approval"
            ? "O download começou; depois você poderá aprovar a publicação."
            : "O download começou.";
        setNotice({ tone: "success", text: `Reel #${data.id} recebido. ${action}` });
        setUrl("");
        setSourceAccount("");
        setRightsConfirmed(false);
      } else if (data.reason === "duplicate") {
        setNotice({ tone: "info", text: `Esse Reel já está registrado como #${data.id}.` });
      }
      await loadData(true);
    } catch (error) {
      setNotice({
        tone: "error",
        text: error instanceof Error ? error.message : "Não foi possível adicionar o Reel.",
      });
    } finally {
      setSubmitting(false);
    }
  }

  async function publish(reel: Reel) {
    setNotice(null);
    setPublishingId(reel.id);
    try {
      const response = await fetch(`/api/reels/${reel.id}/publish`, {
        method: "POST",
        credentials: "same-origin",
        headers: { accept: "application/json" },
      });
      const data = await response.json() as { error?: string };
      if (!response.ok) throw new Error(data.error || "Não foi possível iniciar a publicação.");
      setNotice({ tone: "success", text: `Publicação do Reel #${reel.id} iniciada.` });
      await loadData(true);
    } catch (error) {
      setNotice({
        tone: "error",
        text: error instanceof Error ? error.message : "Não foi possível iniciar a publicação.",
      });
    } finally {
      setPublishingId(null);
    }
  }

  function switchView(view: "inbox" | "dashboard") {
    setActiveView(view);
    const nextUrl = new URL(window.location.href);
    if (view === "dashboard") nextUrl.searchParams.set("view", "dashboard");
    else nextUrl.searchParams.delete("view");
    window.history.replaceState({}, "", `${nextUrl.pathname}${nextUrl.search}${nextUrl.hash}`);
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  return (
    <main className="studio-shell">
      <header className="topbar">
        <div className="brand">
          <span className="brand-mark">BT</span>
          <span><strong>REELVOLT</strong><small>BT SUPPLY STUDIO</small></span>
        </div>
        <div className="topbar-actions">
          <nav className="view-tabs" aria-label="Áreas do ReelVolt">
            <button
              type="button"
              className={activeView === "inbox" ? "active" : ""}
              aria-current={activeView === "inbox" ? "page" : undefined}
              onClick={() => switchView("inbox")}
            >
              Produção
            </button>
            <button
              type="button"
              className={activeView === "dashboard" ? "active" : ""}
              aria-current={activeView === "dashboard" ? "page" : undefined}
              onClick={() => switchView("dashboard")}
            >
              Dashboard
            </button>
          </nav>
          <div className="account">
            <span>{userEmail}</span>
            <a href={signOutUrl}>Sair</a>
          </div>
        </div>
      </header>

      {activeView === "dashboard" ? (
        <AnalyticsDashboard
          account={dashboard.settings.account}
          operations={dashboard.metrics}
        />
      ) : (
        <>
      <section className="hero">
        <div className="hero-copy">
          <span className="eyebrow">REEL INBOX · PAINEL PRIVADO</span>
          <h1>Baixe. Aprove.<br /><em>Publique.</em></h1>
          <p>
            Um fluxo único para transformar links autorizados em MP4 e Reels prontos
            para a conta {dashboard.settings.account}.
          </p>
        </div>
        <div className="connection-card">
          <span className={`connection-dot ${dashboard.settings.meta_connected ? "online" : ""}`} />
          <div>
            <strong>{dashboard.settings.meta_connected ? "Instagram conectado" : "Instagram aguardando conexão"}</strong>
            <small>
              {dashboard.settings.meta_connected
                ? "Publicação oficial pela API da Meta"
                : "Downloads funcionam; publicação fica bloqueada até a autorização"}
            </small>
          </div>
        </div>
      </section>

      {notice ? <div className={`global-notice ${notice.tone}`} role="status">{notice.text}</div> : null}

      <section className="studio-grid">
        <form className="intake-panel" onSubmit={submit}>
          <div className="section-heading">
            <span>01</span>
            <div>
              <h2>Novo Reel</h2>
              <p>Cole o link ou compartilhe pelo menu do iPhone.</p>
            </div>
          </div>

          <label>
            Link do Reel
            <input
              type="url"
              inputMode="url"
              placeholder="https://www.instagram.com/reel/..."
              value={url}
              onChange={(event) => setUrl(event.target.value)}
              required
            />
          </label>

          <label>
            Conta de origem <small>opcional</small>
            <input
              type="text"
              placeholder="@criador"
              value={sourceAccount}
              onChange={(event) => setSourceAccount(event.target.value)}
              maxLength={80}
            />
          </label>

          <label>
            Ação após o download
            <select
              value={publicationMode}
              onChange={(event) => setPublicationMode(event.target.value as Reel["publication_mode"])}
            >
              <option value="approval">Preparar e aguardar aprovação</option>
              <option value="auto">Publicar automaticamente</option>
              <option value="download_only">Somente baixar o MP4</option>
            </select>
            <small className="field-help">
              {publicationMode === "approval" && "Recomendado: você confere o vídeo antes de publicar."}
              {publicationMode === "auto" && "O Reel será publicado assim que o MP4 estiver pronto."}
              {publicationMode === "download_only" && "O arquivo fica salvo, sem criar publicação."}
            </small>
          </label>

          <label>
            Distribuição no Instagram
            <select
              value={shareToFeed ? "feed" : "reels"}
              onChange={(event) => setShareToFeed(event.target.value === "feed")}
              disabled={publicationMode === "download_only"}
            >
              <option value="feed">Feed + aba Reels</option>
              <option value="reels">Somente aba Reels</option>
            </select>
          </label>

          <label className="rights-check">
            <input
              type="checkbox"
              checked={rightsConfirmed}
              onChange={(event) => setRightsConfirmed(event.target.checked)}
              required
            />
            <span>Confirmo que tenho autorização para baixar, editar e publicar este conteúdo.</span>
          </label>

          <button className="primary-button" type="submit" disabled={submitting}>
            {submitting ? "Adicionando…" : publicationMode === "download_only" ? "Baixar MP4" : "Preparar Reel"}
          </button>
        </form>

        <aside className="package-panel">
          <div className="section-heading">
            <span>02</span>
            <div>
              <h2>Pacote padrão</h2>
              <p>Aplicado automaticamente a todas as publicações.</p>
            </div>
          </div>
          <div className="cover-frame">
            {/* A capa é um asset fornecido pelo proprietário da conta. */}
            <img src={dashboard.settings.cover_url} alt="Capa padrão dos Reels da BT Supply" />
            <span>CAPA FIXA</span>
          </div>
          <div className="caption-block">
            <span>LEGENDA FIXA</span>
            <p>{dashboard.settings.caption}</p>
          </div>
        </aside>
      </section>

      <section className="queue-panel">
        <div className="queue-header">
          <div className="section-heading">
            <span>03</span>
            <div>
              <h2>Produção recente</h2>
              <p>Download e publicação acompanhados no próprio site.</p>
            </div>
          </div>
          <button type="button" className="ghost-button" onClick={() => void loadData()} disabled={loading}>
            Atualizar
          </button>
        </div>

        {loading ? (
          <div className="empty-state">Carregando o estúdio…</div>
        ) : reels.length === 0 ? (
          <div className="empty-state">Seu primeiro Reel aparecerá aqui.</div>
        ) : (
          <div className="reel-list">
            {reels.map((reel) => {
              const canPublish = reel.status === "ready"
                && reel.publish_status !== "published"
                && reel.publish_status !== "creating";
              return (
                <article className="reel-row" key={reel.id}>
                  <img className="reel-cover" src={dashboard.settings.cover_url} alt="" />
                  <div className="reel-main">
                    <div className="reel-topline">
                      <strong>#{reel.id} · {reel.source_account || "Origem não informada"}</strong>
                      <span>{formatDate(reel.created_at)}</span>
                    </div>
                    <a className="source-link" href={reel.source_url} target="_blank" rel="noreferrer">
                      {reel.source_url}
                    </a>
                    <div className="status-line">
                      <span className={`status-badge ${reel.status}`}>{DOWNLOAD_LABELS[reel.status] ?? reel.status}</span>
                      <span className={`publish-badge ${reel.publish_status}`}>{PUBLISH_LABELS[reel.publish_status] ?? reel.publish_status}</span>
                      <span className="mode-badge">{publicationModeLabel(reel.publication_mode)}</span>
                    </div>
                    {reel.error ? <p className="reel-error">{reel.error}</p> : null}
                    {reel.publish_error ? <p className="reel-error">{reel.publish_error}</p> : null}
                  </div>
                  <div className="reel-actions">
                    {reel.instagram_permalink ? (
                      <a className="action-primary" href={reel.instagram_permalink} target="_blank" rel="noreferrer">
                        Ver no Instagram
                      </a>
                    ) : canPublish ? (
                      <button
                        className="action-primary"
                        type="button"
                        onClick={() => void publish(reel)}
                        disabled={!dashboard.settings.meta_connected || publishingId === reel.id}
                        title={!dashboard.settings.meta_connected ? "Conecte a conta à Meta primeiro" : undefined}
                      >
                        {publishingId === reel.id
                          ? "Iniciando…"
                          : reel.publish_status === "publishing"
                            ? "Atualizar publicação"
                          : reel.publish_status === "processing"
                            ? "Continuar publicação"
                            : "Aprovar e publicar"}
                      </button>
                    ) : null}
                    {reel.download_url ? (
                      <a className="action-secondary" href={reel.download_url}>
                        Baixar MP4 · {formatBytes(reel.size_bytes)}
                      </a>
                    ) : (
                      <span className="processing-label">{reel.status === "failed" ? "Verifique o erro" : "Processando arquivo"}</span>
                    )}
                  </div>
                </article>
              );
            })}
          </div>
        )}
      </section>
        </>
      )}

      <footer>
        <span>Instagram</span><i>→</i><span>Reel Inbox</span><i>→</i><span>MP4</span><i>→</i><span>Aprovação</span><i>→</i><span>@btsupply_</span>
      </footer>
    </main>
  );
}
