"use client";

import { FormEvent, useCallback, useEffect, useMemo, useState } from "react";

type Reel = {
  id: number;
  source_url: string;
  rules: string | null;
  source_account: string | null;
  rights_confirmed: number;
  filename: string | null;
  size_bytes: number | null;
  status: "queued" | "downloading" | "ready" | "failed";
  error: string | null;
  created_at: string;
  completed_at: string | null;
  download_url: string | null;
};

type InboxClientProps = {
  userEmail: string;
  signOutUrl: string;
  sharedText: string;
};

const INSTAGRAM_URL = /https?:\/\/(?:www\.)?instagram\.com\/(?:reel|reels|p)\/[A-Za-z0-9_-]+[^\s<"]*/i;

const STATUS_LABELS: Record<Reel["status"], string> = {
  queued: "Na fila",
  downloading: "Baixando",
  ready: "Pronto",
  failed: "Falhou",
};

function extractSharedUrl(value: string) {
  return value.match(INSTAGRAM_URL)?.[0]?.replace(/[),.;]+$/, "") ?? "";
}

function formatBytes(value: number | null) {
  if (!value) return "";
  return `${(value / 1024 / 1024).toFixed(1).replace(".", ",")} MB`;
}

function formatDate(value: string) {
  const normalized = value.includes("T") ? value : `${value.replace(" ", "T")}Z`;
  return new Intl.DateTimeFormat("pt-BR", {
    day: "2-digit",
    month: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(normalized));
}

export default function InboxClient({ userEmail, signOutUrl, sharedText }: InboxClientProps) {
  const initialUrl = useMemo(() => extractSharedUrl(sharedText), [sharedText]);
  const [url, setUrl] = useState(initialUrl);
  const [sourceAccount, setSourceAccount] = useState("");
  const [rules, setRules] = useState("");
  const [rightsConfirmed, setRightsConfirmed] = useState(false);
  const [reels, setReels] = useState<Reel[]>([]);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [notice, setNotice] = useState<{ tone: "success" | "error" | "info"; text: string } | null>(null);

  const loadReels = useCallback(async (quiet = false) => {
    if (!quiet) setLoading(true);
    try {
      const response = await fetch("/api/reels", {
        credentials: "same-origin",
        headers: { accept: "application/json" },
      });
      if (!response.ok) throw new Error("Não foi possível carregar a fila.");
      const data = await response.json() as { reels?: Reel[] };
      setReels(data.reels ?? []);
    } catch (error) {
      if (!quiet) {
        setNotice({
          tone: "error",
          text: error instanceof Error ? error.message : "Não foi possível carregar a fila.",
        });
      }
    } finally {
      if (!quiet) setLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadReels();
    if ("serviceWorker" in navigator) {
      void navigator.serviceWorker.register("/sw.js");
    }
  }, [loadReels]);

  useEffect(() => {
    const hasActiveWork = reels.some((reel) => reel.status === "queued" || reel.status === "downloading");
    if (!hasActiveWork) return;
    const timer = window.setInterval(() => void loadReels(true), 5000);
    return () => window.clearInterval(timer);
  }, [loadReels, reels]);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setNotice(null);
    setSubmitting(true);
    try {
      const response = await fetch("/api/reels/intake", {
        method: "POST",
        credentials: "same-origin",
        headers: { "content-type": "application/json", accept: "application/json" },
        body: JSON.stringify({ url, sourceAccount, rules, rightsConfirmed }),
      });
      const data = await response.json() as {
        accepted?: boolean;
        id?: number;
        reason?: string;
        error?: string;
      };
      if (!response.ok) throw new Error(data.error || "Não foi possível adicionar o Reel.");

      if (data.accepted) {
        setNotice({ tone: "success", text: `Reel #${data.id} recebido. O download começou.` });
        setUrl("");
        setSourceAccount("");
        setRules("");
        setRightsConfirmed(false);
      } else if (data.reason === "duplicate") {
        setNotice({ tone: "info", text: `Esse Reel já está registrado como #${data.id}.` });
      }
      await loadReels(true);
    } catch (error) {
      setNotice({
        tone: "error",
        text: error instanceof Error ? error.message : "Não foi possível adicionar o Reel.",
      });
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <main className="inbox-shell">
      <header className="topbar">
        <div className="brand"><span>BT</span><strong>SUPPLY</strong></div>
        <div className="account">
          <span>{userEmail}</span>
          <a href={signOutUrl}>Sair</a>
        </div>
      </header>

      <section className="hero">
        <div>
          <span className="eyebrow">REEL INBOX · PRIVADO</span>
          <h1>Compartilhe.<br />Baixe. Organize.</h1>
        </div>
        <p>
          Envie um Reel público e autorizado. O MP4 será guardado e o andamento
          aparecerá aqui e no Notion. A publicação continua manual.
        </p>
      </section>

      <section className="workspace">
        <form className="intake-card" onSubmit={submit}>
          <div className="card-heading">
            <span>01</span>
            <div>
              <h2>Novo Reel</h2>
              <p>Ao compartilhar pelo Instagram, o link aparece aqui automaticamente.</p>
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
            Regras ou observações <small>opcional</small>
            <textarea
              placeholder="Ex.: humor cotidiano, manter crédito, sem publicação automática."
              value={rules}
              onChange={(event) => setRules(event.target.value)}
              maxLength={1000}
              rows={4}
            />
          </label>

          <label className="rights-check">
            <input
              type="checkbox"
              checked={rightsConfirmed}
              onChange={(event) => setRightsConfirmed(event.target.checked)}
              required
            />
            <span>Confirmo que tenho autorização para baixar e utilizar este conteúdo.</span>
          </label>

          {notice ? <div className={`notice ${notice.tone}`} role="status">{notice.text}</div> : null}

          <button className="primary-button" type="submit" disabled={submitting}>
            {submitting ? "Enviando…" : "Baixar e registrar"}
          </button>
        </form>

        <section className="queue-card">
          <div className="card-heading queue-heading">
            <span>02</span>
            <div>
              <h2>Fila recente</h2>
              <p>O status é atualizado enquanto o arquivo é processado.</p>
            </div>
            <button type="button" className="refresh-button" onClick={() => void loadReels()} disabled={loading}>
              Atualizar
            </button>
          </div>

          {loading ? (
            <div className="empty-state">Carregando a fila…</div>
          ) : reels.length === 0 ? (
            <div className="empty-state">Nenhum Reel recebido ainda.</div>
          ) : (
            <div className="reel-list">
              {reels.map((reel) => (
                <article className="reel-row" key={reel.id}>
                  <div className="reel-id">#{reel.id}</div>
                  <div className="reel-main">
                    <div className="reel-topline">
                      <strong>{reel.source_account || "Origem não informada"}</strong>
                      <span>{formatDate(reel.created_at)}</span>
                    </div>
                    <a className="source-link" href={reel.source_url} target="_blank" rel="noreferrer">
                      {reel.source_url}
                    </a>
                    {reel.error ? <p className="reel-error">{reel.error}</p> : null}
                  </div>
                  <div className={`status-badge ${reel.status}`}>
                    <i />
                    {STATUS_LABELS[reel.status] ?? reel.status}
                  </div>
                  <div className="reel-action">
                    {reel.download_url ? (
                      <a href={reel.download_url}>Baixar MP4 {formatBytes(reel.size_bytes)}</a>
                    ) : (
                      <span>{reel.status === "failed" ? "Verifique o erro" : "Processando"}</span>
                    )}
                  </div>
                </article>
              ))}
            </div>
          )}
        </section>
      </section>

      <footer>
        <span>Instagram</span><i>→</i><span>BT Supply Inbox</span><i>→</i><span>MP4</span><i>→</i><span>Notion</span>
      </footer>
    </main>
  );
}
