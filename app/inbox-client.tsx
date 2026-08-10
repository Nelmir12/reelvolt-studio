"use client";

import { FormEvent, useCallback, useEffect, useMemo, useRef, useState } from "react";
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
  caption_enabled: number;
  cover_mode: "fixed" | "video" | "none";
  approved_at: string | null;
  scheduled_for: string | null;
  publish_status: string;
  publish_error: string | null;
  instagram_permalink: string | null;
  download_url: string | null;
  created_at: string;
  completed_at: string | null;
  published_at: string | null;
  instagram_selected: boolean;
  rights_confirmed: boolean;
  intake_source: "instagram_direct" | "web";
  rights_basis: "owned" | "licensed" | null;
  content_context: string | null;
  made_for_kids: boolean;
  contains_synthetic_media: boolean;
  paid_product_placement: boolean;
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
    direct_configured: boolean;
    direct_allowed_username: string | null;
    resolver_connected: boolean;
    cover_url: string;
    caption: string;
    caption_enabled: boolean;
    cover_mode: "fixed" | "video" | "none";
    has_custom_cover: boolean;
    auto_publish_enabled: boolean;
    publish_interval_minutes: number;
    updated_at: string;
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
const REELS_PER_PAGE = 6;

const DOWNLOAD_LABELS: Record<string, string> = {
  awaiting_rights: "Aguardando direitos",
  queued: "Na fila",
  downloading: "Baixando",
  ready: "MP4 pronto",
  failed: "Falhou",
};

type ApprovalDraft = {
  reel: Reel;
  instagram: boolean;
  rightsBasis: "owned" | "licensed";
  context: string;
  madeForKids: boolean;
  containsSyntheticMedia: boolean;
  paidProductPlacement: boolean;
  rightsConfirmed: boolean;
};

type PlatformProgress = {
  title: string;
  detail: string;
  tone: "waiting" | "active" | "success" | "danger";
};

function instagramProgress(reel: Reel): PlatformProgress {
  if (reel.publish_status === "published" || reel.instagram_permalink) {
    return {
      title: "Publicado no Instagram",
      detail: reel.published_at
        ? `Publicado em ${formatDate(reel.published_at)}.`
        : "A publicação já está disponível no Instagram.",
      tone: "success",
    };
  }
  if (reel.publish_status === "awaiting_metadata") {
    return {
      title: "Ainda não foi publicado",
      detail: "A aprovação foi salva, mas o envio não começou. Use “Continuar publicação”.",
      tone: "waiting",
    };
  }
  if (reel.publish_status === "queued") {
    return {
      title: reel.scheduled_for ? "Publicação agendada" : "Na fila do Instagram",
      detail: reel.scheduled_for
        ? `Programado para ${formatDate(reel.scheduled_for)}.`
        : "O envio será iniciado em seguida.",
      tone: "active",
    };
  }
  if (["creating", "processing", "publishing"].includes(reel.publish_status)) {
    return {
      title: "Publicando no Instagram",
      detail: "A Meta está recebendo e processando o Reel.",
      tone: "active",
    };
  }
  if (["failed", "blocked"].includes(reel.publish_status)) {
    return {
      title: "Instagram precisa de atenção",
      detail: reel.publish_error || "Confira o erro e tente continuar a publicação.",
      tone: "danger",
    };
  }
  if (reel.publish_status === "awaiting_setup") {
    return {
      title: "Aguardando conexão do Instagram",
      detail: "Conecte a conta antes de publicar.",
      tone: "waiting",
    };
  }
  return {
    title: "Aguardando sua aprovação",
    detail: "Escolha os destinos e confirme os direitos para publicar.",
    tone: "waiting",
  };
}

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
    direct_configured: false,
    direct_allowed_username: null,
    resolver_connected: false,
    cover_url: "/reel-cover.jpg",
    caption: "V arrived at #VogueWorld: Hollywood in unmistakable style, enjoying the live performances while showcasing the effortless elegance he's become known for. Another runway-worthy moment. #Taehyung",
    caption_enabled: true,
    cover_mode: "fixed",
    has_custom_cover: false,
    auto_publish_enabled: false,
    publish_interval_minutes: 60,
    updated_at: "",
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
  const instagramDestination = true;
  const [rightsBasis, setRightsBasis] = useState<"owned" | "licensed">("owned");
  const [contentContext, setContentContext] = useState("");
  const [madeForKids, setMadeForKids] = useState(false);
  const [containsSyntheticMedia, setContainsSyntheticMedia] = useState(false);
  const [paidProductPlacement, setPaidProductPlacement] = useState(false);
  const [reels, setReels] = useState<Reel[]>([]);
  const [dashboard, setDashboard] = useState<Dashboard>(EMPTY_DASHBOARD);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [publishingId, setPublishingId] = useState<number | null>(null);
  const [deletingId, setDeletingId] = useState<number | null>(null);
  const [approvalDraft, setApprovalDraft] = useState<ApprovalDraft | null>(null);
  const [captionEnabled, setCaptionEnabled] = useState(true);
  const [caption, setCaption] = useState(EMPTY_DASHBOARD.settings.caption);
  const [coverMode, setCoverMode] = useState<Dashboard["settings"]["cover_mode"]>("fixed");
  const [coverFile, setCoverFile] = useState<File | null>(null);
  const [autoPublishEnabled, setAutoPublishEnabled] = useState(false);
  const [publishIntervalMinutes, setPublishIntervalMinutes] = useState(60);
  const [savingSettings, setSavingSettings] = useState(false);
  const [activatingDirect, setActivatingDirect] = useState(false);
  const [directActivated, setDirectActivated] = useState(false);
  const [notice, setNotice] = useState<{ tone: "success" | "error" | "info"; text: string } | null>(null);
  const [activeView, setActiveView] = useState<"inbox" | "dashboard">(initialView);
  const [reelPage, setReelPage] = useState(1);
  const settingsInitialized = useRef(false);
  const approvalLinkHandled = useRef(false);
  const reelPageCount = Math.max(1, Math.ceil(reels.length / REELS_PER_PAGE));
  const currentReelPage = Math.min(reelPage, reelPageCount);
  const visibleReels = useMemo(
    () => reels.slice((currentReelPage - 1) * REELS_PER_PAGE, currentReelPage * REELS_PER_PAGE),
    [currentReelPage, reels],
  );

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
      if (!settingsInitialized.current) {
        settingsInitialized.current = true;
        setCaptionEnabled(dashboardData.settings.caption_enabled);
        setCaption(dashboardData.settings.caption);
        setCoverMode(dashboardData.settings.cover_mode);
        setAutoPublishEnabled(dashboardData.settings.auto_publish_enabled);
        setPublishIntervalMinutes(dashboardData.settings.publish_interval_minutes);
      }
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
    if (approvalLinkHandled.current || !reels.length) return;
    const reelId = Number(new URLSearchParams(window.location.search).get("approve"));
    if (!Number.isInteger(reelId) || reelId <= 0) return;
    const reel = reels.find((candidate) => candidate.id === reelId && candidate.status === "ready");
    if (!reel) return;
    approvalLinkHandled.current = true;
    const nextUrl = new URL(window.location.href);
    nextUrl.searchParams.delete("approve");
    window.history.replaceState({}, "", `${nextUrl.pathname}${nextUrl.search}${nextUrl.hash}`);
    const openDialog = window.setTimeout(() => {
      setActiveView("inbox");
      setReelPage(Math.max(1, Math.ceil((reels.indexOf(reel) + 1) / REELS_PER_PAGE)));
      setApprovalDraft({
        reel,
        instagram: reel.publish_status !== "published" && reel.instagram_selected,
        rightsBasis: reel.rights_basis || "licensed",
        context: reel.content_context || "",
        madeForKids: reel.made_for_kids,
        containsSyntheticMedia: reel.contains_synthetic_media,
        paidProductPlacement: reel.paid_product_placement,
        rightsConfirmed: reel.intake_source === "instagram_direct" && reel.rights_confirmed,
      });
    }, 0);
    return () => window.clearTimeout(openDialog);
  }, [reels]);

  useEffect(() => {
    const activeStatuses = new Set([
      "awaiting_rights", "queued", "downloading", "creating", "processing", "publishing", "preflight",
      "analyzing", "uploading", "retrying", "awaiting_metadata",
    ]);
    const hasActiveWork = reels.some((reel) =>
      activeStatuses.has(reel.status) || activeStatuses.has(reel.publish_status));
    if (!hasActiveWork) return;
    const timer = window.setInterval(() => void loadData(true), 4500);
    return () => window.clearInterval(timer);
  }, [loadData, reels]);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (publicationMode !== "download_only" && !instagramDestination) {
      setNotice({ tone: "error", text: "Selecione o Instagram para publicar." });
      return;
    }
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
          destinations: publicationMode === "download_only"
            ? []
            : ["instagram"],
          rightsBasis,
          context: contentContext,
          madeForKids,
          containsSyntheticMedia,
          paidProductPlacement,
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
        setContentContext("");
        setRightsConfirmed(false);
        setReelPage(1);
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

  function openApproval(reel: Reel) {
    const instagramAlreadyPublished = reel.publish_status === "published";
    setApprovalDraft({
      reel,
      instagram: instagramAlreadyPublished ? false : reel.instagram_selected,
      rightsBasis: reel.rights_basis || "licensed",
      context: reel.content_context || "",
      madeForKids: reel.made_for_kids,
      containsSyntheticMedia: reel.contains_synthetic_media,
      paidProductPlacement: reel.paid_product_placement,
      rightsConfirmed: reel.intake_source === "instagram_direct" && reel.rights_confirmed,
    });
  }

  async function activateDirect() {
    setActivatingDirect(true);
    setNotice(null);
    try {
      const response = await fetch("/api/instagram/direct/subscribe", {
        method: "POST",
        credentials: "same-origin",
        headers: { accept: "application/json" },
      });
      const data = await response.json() as { subscribed?: boolean; error?: string };
      if (!response.ok || !data.subscribed) {
        throw new Error(data.error || "Não foi possível ativar os eventos do Direct.");
      }
      setDirectActivated(true);
      setNotice({
        tone: "success",
        text: `Direct ativado. Somente ${dashboard.settings.direct_allowed_username} poderá enviar Reels.`,
      });
    } catch (error) {
      setNotice({
        tone: "error",
        text: error instanceof Error ? error.message : "Não foi possível ativar o Direct.",
      });
    } finally {
      setActivatingDirect(false);
    }
  }

  async function publish(draft: ApprovalDraft) {
    const reel = draft.reel;
    if (!draft.instagram) {
      setNotice({ tone: "error", text: "Selecione o Instagram para publicar." });
      return;
    }
    if (!draft.rightsConfirmed) {
      setNotice({ tone: "error", text: "Confirme os direitos antes de aprovar." });
      return;
    }
    setNotice(null);
    setPublishingId(reel.id);
    try {
      const response = await fetch(`/api/reels/${reel.id}/publish`, {
        method: "POST",
        credentials: "same-origin",
        headers: { accept: "application/json", "content-type": "application/json" },
        body: JSON.stringify({
          rightsConfirmed: true,
          destinations: ["instagram"],
          rightsBasis: draft.rightsBasis,
          context: draft.context,
          madeForKids: draft.madeForKids,
          containsSyntheticMedia: draft.containsSyntheticMedia,
          paidProductPlacement: draft.paidProductPlacement,
        }),
      });
      const data = await response.json() as {
        error?: string;
        queued?: boolean;
        scheduledFor?: string | null;
      };
      if (!response.ok) throw new Error(data.error || "Não foi possível iniciar a publicação.");
      setNotice({
        tone: "success",
        text: data.queued
          ? `Reel #${reel.id} aprovado e programado para ${formatDate(data.scheduledFor || null)}.`
          : `Publicação do Reel #${reel.id} iniciada no Instagram.`,
      });
      setApprovalDraft(null);
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

  async function deleteReel(reel: Reel) {
    const published = reel.publish_status === "published" || Boolean(reel.instagram_permalink);
    const confirmed = window.confirm(
      published
        ? `Excluir o MP4 do Reel #${reel.id}? A publicação e todas as métricas do Instagram serão preservadas.`
        : `Excluir o MP4 do Reel #${reel.id}? Ele sairá da produção e o arquivo armazenado será removido.`,
    );
    if (!confirmed) return;
    setDeletingId(reel.id);
    setNotice(null);
    try {
      const response = await fetch(`/api/reels/${reel.id}`, {
        method: "DELETE",
        credentials: "same-origin",
        headers: { accept: "application/json" },
      });
      const data = await response.json() as {
        deleted?: boolean;
        metrics_preserved?: boolean;
        error?: string;
      };
      if (!response.ok || !data.deleted) {
        throw new Error(data.error || "Não foi possível excluir o arquivo.");
      }
      setNotice({
        tone: "success",
        text: data.metrics_preserved
          ? `MP4 do Reel #${reel.id} excluído. A publicação e as métricas foram preservadas.`
          : `Reel #${reel.id} e seu MP4 foram removidos da produção.`,
      });
      await loadData(true);
    } catch (error) {
      setNotice({
        tone: "error",
        text: error instanceof Error ? error.message : "Não foi possível excluir o arquivo.",
      });
    } finally {
      setDeletingId(null);
    }
  }

  async function saveSettings(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setNotice(null);
    setSavingSettings(true);
    try {
      const response = await fetch("/api/studio-settings", {
        method: "PUT",
        credentials: "same-origin",
        headers: { accept: "application/json", "content-type": "application/json" },
        body: JSON.stringify({
          captionEnabled,
          caption,
          coverMode,
          autoPublishEnabled,
          publishIntervalMinutes,
        }),
      });
      const data = await response.json() as { error?: string };
      if (!response.ok) throw new Error(data.error || "Não foi possível salvar as preferências.");

      if (coverMode === "fixed" && coverFile) {
        const formData = new FormData();
        formData.set("cover", coverFile);
        const upload = await fetch("/api/studio-settings/cover", {
          method: "POST",
          credentials: "same-origin",
          headers: { accept: "application/json" },
          body: formData,
        });
        const uploadData = await upload.json() as { error?: string };
        if (!upload.ok) throw new Error(uploadData.error || "Não foi possível enviar a capa.");
      }

      setCoverFile(null);
      setNotice({
        tone: "success",
        text: autoPublishEnabled
          ? "Preferências salvas. Novos Reels aprovados entrarão na fila automática."
          : "Preferências salvas. As publicações continuarão manuais após a aprovação.",
      });
      await loadData(true);
    } catch (error) {
      setNotice({
        tone: "error",
        text: error instanceof Error ? error.message : "Não foi possível salvar as preferências.",
      });
    } finally {
      setSavingSettings(false);
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
          <img className="brand-mark" src="/reelvolt-icon-192.png" alt="" />
          <span><strong>ReelVolt</strong><small>Studio</small></span>
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
              Métricas
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
          <span className="eyebrow">Área de trabalho</span>
          <h1>Produção</h1>
          <p>Acompanhe seus downloads, aprovações e publicações.</p>
        </div>
        <div className="channel-connections">
          <div className="connection-card">
            <span className={`connection-dot ${dashboard.settings.meta_connected ? "online" : ""}`} />
            <div>
              <strong>{dashboard.settings.meta_connected ? "Instagram conectado" : "Instagram aguardando conexão"}</strong>
              <small>{dashboard.settings.meta_connected ? "API oficial da Meta" : "Publicação fica aguardando autorização"}</small>
            </div>
          </div>
          <div className="connection-card direct-connection-card">
            <span className={`connection-dot ${directActivated ? "online" : ""}`} />
            <div>
              <strong>{directActivated ? "Direct ativado" : "Entrada pelo Direct"}</strong>
              <small>
                {dashboard.settings.direct_configured
                  ? `Restrita a ${dashboard.settings.direct_allowed_username}`
                  : "Aguardando configuração segura na Meta"}
              </small>
            </div>
            {dashboard.settings.direct_configured && !directActivated ? (
              <button type="button" onClick={() => void activateDirect()} disabled={activatingDirect}>
                {activatingDirect ? "Ativando…" : "Ativar eventos"}
              </button>
            ) : null}
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

          <div className="instagram-destination-note">
            <strong>Publicação no Instagram Reels</strong>
            <small>Legenda própria e capa configurada.</small>
          </div>

          <label>
            Ação após o download
            <select
              value={publicationMode}
              onChange={(event) => setPublicationMode(event.target.value as Reel["publication_mode"])}
            >
              <option value="approval">Preparar e aguardar aprovação</option>
              <option value="download_only">Somente baixar o MP4</option>
            </select>
            <small className="field-help">
              {publicationMode === "approval" && "Você confere e aprova o vídeo antes de ele entrar na fila."}
              {publicationMode === "download_only" && "O arquivo fica salvo, sem criar publicação."}
            </small>
          </label>

          <label>
            Contexto do vídeo <small>opcional</small>
            <textarea
              value={contentContext}
              onChange={(event) => setContentContext(event.target.value)}
              maxLength={800}
              rows={3}
              placeholder="Quem aparece, local, evento e fatos que a IA pode usar sem inventar."
            />
          </label>

          <label>
            Base dos direitos
            <select
              value={rightsBasis}
              onChange={(event) => setRightsBasis(event.target.value as "owned" | "licensed")}
            >
              <option value="owned">Conteúdo próprio</option>
              <option value="licensed">Conteúdo licenciado</option>
            </select>
          </label>

          <div className="content-flags">
            <label><input type="checkbox" checked={madeForKids} onChange={(event) => setMadeForKids(event.target.checked)} /> Conteúdo infantil</label>
            <label><input type="checkbox" checked={containsSyntheticMedia} onChange={(event) => setContainsSyntheticMedia(event.target.checked)} /> Mídia sintética realista</label>
            <label><input type="checkbox" checked={paidProductPlacement} onChange={(event) => setPaidProductPlacement(event.target.checked)} /> Promoção paga</label>
          </div>

          <label>
            Distribuição no Instagram
            <select
              value={shareToFeed ? "feed" : "reels"}
              onChange={(event) => setShareToFeed(event.target.value === "feed")}
              disabled={publicationMode === "download_only" || !instagramDestination}
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

        <form className="package-panel" onSubmit={saveSettings}>
          <div className="section-heading">
            <span>02</span>
            <div>
              <h2>Publicação</h2>
              <p>Preferências usadas quando você aprovar um Reel.</p>
            </div>
          </div>

          <div className="cover-settings">
            <div className={`cover-frame ${coverMode !== "fixed" ? "cover-placeholder" : ""}`}>
              {coverMode === "fixed" ? (
                <img src={dashboard.settings.cover_url} alt="Prévia da capa padrão" />
              ) : (
                <div>
                  <strong>{coverMode === "video" ? "Quadro do vídeo" : "Sem capa personalizada"}</strong>
                  <small>O Instagram selecionará a miniatura.</small>
                </div>
              )}
              <span>{coverMode === "fixed" ? "CAPA FIXA" : "CAPA DO VÍDEO"}</span>
            </div>
            <label className="file-button">
              Trocar imagem
              <input
                type="file"
                accept="image/jpeg,image/png,image/webp"
                onChange={(event) => {
                  setCoverFile(event.target.files?.[0] || null);
                  if (event.target.files?.[0]) setCoverMode("fixed");
                }}
              />
            </label>
            {coverFile ? <small className="selected-file">{coverFile.name}</small> : null}
          </div>

          <div className="publication-settings">
            <fieldset>
              <legend>Capa</legend>
              <label><input type="radio" checked={coverMode === "fixed"} onChange={() => setCoverMode("fixed")} /> Imagem fixa</label>
              <label><input type="radio" checked={coverMode === "video"} onChange={() => setCoverMode("video")} /> Quadro do vídeo</label>
              <label><input type="radio" checked={coverMode === "none"} onChange={() => setCoverMode("none")} /> Sem capa personalizada</label>
            </fieldset>

            <label className="settings-toggle">
              <input type="checkbox" checked={captionEnabled} onChange={(event) => setCaptionEnabled(event.target.checked)} />
              <span><strong>Usar legenda</strong><small>Fica salva como padrão editável.</small></span>
            </label>
            <textarea
              aria-label="Legenda padrão"
              value={caption}
              onChange={(event) => setCaption(event.target.value)}
              disabled={!captionEnabled}
              maxLength={2200}
              rows={5}
              placeholder="Escreva a legenda padrão…"
            />
            <small className="character-count">{caption.length}/2200</small>

            <label className="settings-toggle">
              <input
                type="checkbox"
                checked={autoPublishEnabled}
                onChange={(event) => setAutoPublishEnabled(event.target.checked)}
              />
              <span><strong>Fila automática</strong><small>Somente Reels aprovados entram na programação.</small></span>
            </label>
            <label className="interval-field">
              Intervalo entre publicações
              <select
                value={publishIntervalMinutes}
                onChange={(event) => setPublishIntervalMinutes(Number(event.target.value))}
                disabled={!autoPublishEnabled}
              >
                <option value={15}>15 minutos</option>
                <option value={30}>30 minutos</option>
                <option value={60}>1 hora</option>
                <option value={120}>2 horas</option>
                <option value={240}>4 horas</option>
                <option value={480}>8 horas</option>
                <option value={720}>12 horas</option>
                <option value={1440}>24 horas</option>
              </select>
            </label>
            <button className="primary-button settings-save" type="submit" disabled={savingSettings}>
              {savingSettings ? "Salvando…" : "Salvar preferências"}
            </button>
          </div>
        </form>
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
        <div className="publishing-guide" aria-label="Como acompanhar cada publicação">
          <strong>Como acompanhar</strong>
          <span><b>1.</b> Confira o vídeo e os direitos.</span>
          <span><b>2.</b> Aprove a publicação no Instagram.</span>
          <span><b>3.</b> Acompanhe o processamento até o Reel ficar publicado.</span>
        </div>

        {loading ? (
          <div className="empty-state">Carregando o estúdio…</div>
        ) : reels.length === 0 ? (
          <div className="empty-state">Seu primeiro Reel aparecerá aqui.</div>
        ) : (
          <>
          <div className="reel-list">
            {visibleReels.map((reel) => {
              const instagramAlreadyPublished = reel.publish_status === "published";
              const canPublish = reel.status === "ready"
                && !instagramAlreadyPublished
                && ["not_requested", "awaiting_approval", "awaiting_setup", "awaiting_metadata", "failed", "processing", "publishing"].includes(reel.publish_status);
              const canApproveAnyDestination = dashboard.settings.meta_connected;
              const instagramState = instagramProgress(reel);
              return (
                <article className="reel-row" key={reel.id}>
                  {reel.cover_mode === "fixed" ? (
                    <img className="reel-cover" src={dashboard.settings.cover_url} alt="" />
                  ) : (
                    <div className="reel-cover reel-cover-placeholder">VÍDEO</div>
                  )}
                  <div className="reel-main">
                    <div className="reel-topline">
                      <strong>#{reel.id} · {reel.source_account || "Origem não informada"}</strong>
                      {reel.intake_source === "instagram_direct" ? <small>Recebido pelo Direct</small> : null}
                      <span>Recebido {formatDate(reel.created_at)}</span>
                    </div>
                    <div className="reel-timeline" aria-label={`Datas do Reel ${reel.id}`}>
                      <span>MP4 pronto <strong>{formatDate(reel.completed_at)}</strong></span>
                      {reel.published_at ? (
                        <span>Instagram <strong>{formatDate(reel.published_at)}</strong></span>
                      ) : null}
                    </div>
                    <a className="source-link" href={reel.source_url} target="_blank" rel="noreferrer">
                      {reel.source_url}
                    </a>
                    <div className="status-line">
                      <span className={`status-badge ${reel.status}`}>{DOWNLOAD_LABELS[reel.status] ?? reel.status}</span>
                      <span className="mode-badge">{publicationModeLabel(reel.publication_mode)}</span>
                    </div>
                    <div className="platform-progress-grid" aria-label={`Situação de publicação do Reel ${reel.id}`}>
                      {reel.instagram_selected ? (
                        <div className={`platform-progress instagram ${instagramState.tone}`}>
                          <span>Instagram</span>
                          <strong>{instagramState.title}</strong>
                          <small>{instagramState.detail}</small>
                        </div>
                      ) : null}
                    </div>
                    {reel.scheduled_for ? (
                      <p className="schedule-line">Programado para {formatDate(reel.scheduled_for)}</p>
                    ) : null}
                    {reel.error ? <p className="reel-error">{reel.error}</p> : null}
                    {reel.publish_error ? <p className="reel-error">{reel.publish_error}</p> : null}
                  </div>
                  <div className="reel-actions">
                    {reel.instagram_permalink ? (
                      <a className="action-primary" href={reel.instagram_permalink} target="_blank" rel="noreferrer">
                        Ver no Instagram
                      </a>
                    ) : null}
                    {canPublish ? (
                      <button
                        className="action-primary"
                        type="button"
                        onClick={() => openApproval(reel)}
                        disabled={!canApproveAnyDestination || publishingId === reel.id}
                        title={!canApproveAnyDestination ? "Conecte ao menos uma plataforma primeiro" : undefined}
                      >
                        {publishingId === reel.id
                          ? "Iniciando…"
                          : reel.publish_status === "publishing"
                            ? "Atualizar publicação"
                          : reel.publish_status === "awaiting_metadata"
                            ? "Continuar publicação"
                          : reel.publish_status === "processing"
                            ? "Continuar publicação"
                            : dashboard.settings.auto_publish_enabled
                              ? "Aprovar para a fila"
                              : "Escolher destinos e aprovar"}
                      </button>
                    ) : null}
                    {reel.download_url ? (
                      <a className="action-secondary" href={reel.download_url}>
                        Baixar MP4 · {formatBytes(reel.size_bytes)}
                      </a>
                    ) : (
                      <span className="processing-label">{reel.status === "failed" ? "Verifique o erro" : "Processando arquivo"}</span>
                    )}
                    {reel.download_url ? (
                      <button
                        className="action-danger"
                        type="button"
                        onClick={() => void deleteReel(reel)}
                        disabled={deletingId === reel.id || ["queued", "creating", "processing", "publishing"].includes(reel.publish_status)}
                      >
                        {deletingId === reel.id ? "Excluindo…" : "Excluir arquivo"}
                      </button>
                    ) : null}
                  </div>
                </article>
              );
            })}
          </div>
          <nav className="pagination-bar" aria-label="Paginação da produção recente">
            <span>
              Vídeos {(currentReelPage - 1) * REELS_PER_PAGE + 1}–{Math.min(currentReelPage * REELS_PER_PAGE, reels.length)}
              {" "}de {reels.length}
            </span>
            <div>
              <button
                type="button"
                onClick={() => setReelPage((current) => Math.max(1, current - 1))}
                disabled={currentReelPage === 1}
              >
                Anterior
              </button>
              <strong>Página {currentReelPage} de {reelPageCount}</strong>
              <button
                type="button"
                onClick={() => setReelPage((current) => Math.min(reelPageCount, current + 1))}
                disabled={currentReelPage === reelPageCount}
              >
                Próxima
              </button>
            </div>
          </nav>
          </>
        )}
      </section>

      {approvalDraft ? (
        <div className="approval-overlay" role="presentation">
          <form
            className="approval-dialog"
            role="dialog"
            aria-modal="true"
            aria-labelledby="approval-title"
            onSubmit={(event) => {
              event.preventDefault();
              void publish(approvalDraft);
            }}
          >
            <div className="approval-dialog-heading">
              <div>
                <span>APROVAÇÃO DO INSTAGRAM</span>
                <h2 id="approval-title">Reel #{approvalDraft.reel.id}</h2>
                <p>Confira os dados e autorize a publicação deste MP4 no Instagram.</p>
              </div>
              <button type="button" onClick={() => setApprovalDraft(null)} aria-label="Fechar">
                ×
              </button>
            </div>

            <fieldset className="destination-picker">
              <legend>Destino</legend>
              <label>
                <input
                  type="checkbox"
                  checked={approvalDraft.instagram}
                  disabled={approvalDraft.reel.publish_status === "published"}
                  onChange={(event) => setApprovalDraft((current) =>
                    current ? { ...current, instagram: event.target.checked } : current)}
                />
                <span>
                  <strong>Instagram Reels</strong>
                  <small>
                    {approvalDraft.reel.publish_status === "published"
                      ? "Já publicado; não será enviado novamente"
                      : "Usa legenda e capa configuradas"}
                  </small>
                </span>
              </label>
            </fieldset>

            <label>
              Base dos direitos
              <select
                value={approvalDraft.rightsBasis}
                onChange={(event) => setApprovalDraft((current) => current
                  ? { ...current, rightsBasis: event.target.value as "owned" | "licensed" }
                  : current)}
              >
                <option value="owned">Conteúdo próprio</option>
                <option value="licensed">Conteúdo licenciado/autorizado</option>
              </select>
            </label>

            <label>
              Contexto para revisão <small>opcional</small>
              <textarea
                rows={3}
                maxLength={800}
                value={approvalDraft.context}
                onChange={(event) => setApprovalDraft((current) =>
                  current ? { ...current, context: event.target.value } : current)}
                placeholder="Quem aparece, evento e fatos confirmados."
              />
            </label>

            <div className="content-flags">
              <label>
                <input
                  type="checkbox"
                  checked={approvalDraft.madeForKids}
                  onChange={(event) => setApprovalDraft((current) =>
                    current ? { ...current, madeForKids: event.target.checked } : current)}
                />
                Conteúdo infantil
              </label>
              <label>
                <input
                  type="checkbox"
                  checked={approvalDraft.containsSyntheticMedia}
                  onChange={(event) => setApprovalDraft((current) =>
                    current ? { ...current, containsSyntheticMedia: event.target.checked } : current)}
                />
                Mídia sintética realista
              </label>
              <label>
                <input
                  type="checkbox"
                  checked={approvalDraft.paidProductPlacement}
                  onChange={(event) => setApprovalDraft((current) =>
                    current ? { ...current, paidProductPlacement: event.target.checked } : current)}
                />
                Promoção paga
              </label>
            </div>

            {approvalDraft.reel.intake_source === "instagram_direct" && approvalDraft.reel.rights_confirmed ? (
              <div className="rights-check direct-rights-confirmed">
                <span>
                  Direitos confirmados no Direct por {dashboard.settings.direct_allowed_username}. O botão abaixo é
                  a autorização final para publicar este Reel no Instagram.
                </span>
              </div>
            ) : (
              <label className="rights-check">
                <input
                  type="checkbox"
                  checked={approvalDraft.rightsConfirmed}
                  onChange={(event) => setApprovalDraft((current) =>
                    current ? { ...current, rightsConfirmed: event.target.checked } : current)}
                  required
                />
                <span>Confirmo os direitos e aprovo a publicação do Reel #{approvalDraft.reel.id} no Instagram.</span>
              </label>
            )}

            <div className="approval-actions">
              <button type="button" className="action-secondary" onClick={() => setApprovalDraft(null)}>
                Cancelar
              </button>
              <button type="submit" className="action-primary" disabled={publishingId === approvalDraft.reel.id}>
                {publishingId === approvalDraft.reel.id ? "Aprovando…" : "Autorizar publicação"}
              </button>
            </div>
          </form>
        </div>
      ) : null}
        </>
      )}
    </main>
  );
}
