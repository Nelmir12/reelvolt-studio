"use client";

import { FormEvent, useCallback, useEffect, useState } from "react";

type Reel = {
  id: number;
  sender_id: string;
  source_url: string;
  size_bytes: number | null;
  status: "queued" | "downloading" | "ready" | "failed";
  error: string | null;
  created_at: string;
};

const statusLabel = {
  queued: "Na fila",
  downloading: "Baixando",
  ready: "Pronto",
  failed: "Falhou",
};

function formatDate(value: string) {
  return new Intl.DateTimeFormat("pt-BR", { dateStyle: "short", timeStyle: "short" })
    .format(new Date(`${value.replace(" ", "T")}Z`));
}

function formatSize(value: number | null) {
  if (!value) return "—";
  return `${(value / 1024 / 1024).toFixed(1).replace(".", ",")} MB`;
}

export default function Home() {
  const [reels, setReels] = useState<Reel[]>([]);
  const [configured, setConfigured] = useState(false);
  const [senderFilter, setSenderFilter] = useState(false);
  const [url, setUrl] = useState("");
  const [notice, setNotice] = useState("");
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    const response = await fetch("/api/reels", { cache: "no-store" });
    if (!response.ok) return;
    const data = await response.json();
    setReels(data.reels);
    setConfigured(data.configured);
    setSenderFilter(data.senderFilter);
    setLoading(false);
  }, []);

  useEffect(() => {
    load();
    const timer = window.setInterval(load, 5000);
    return () => window.clearInterval(timer);
  }, [load]);

  async function addManually(event: FormEvent) {
    event.preventDefault();
    setNotice("Adicionando à fila…");
    const response = await fetch("/api/reels/manual", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ url }),
    });
    const data = await response.json();
    if (!response.ok) {
      setNotice(data.error ?? "Não foi possível adicionar o Reel.");
      return;
    }
    setUrl("");
    setNotice("Reel recebido. O download continua em segundo plano.");
    await load();
  }

  const ready = reels.filter((reel) => reel.status === "ready").length;
  const processing = reels.filter((reel) => reel.status === "queued" || reel.status === "downloading").length;
  const failed = reels.filter((reel) => reel.status === "failed").length;

  return (
    <main className="shell">
      <header className="hero">
        <div className="brand"><span>RV</span> REEL INBOX</div>
        <div className="hero-copy">
          <span className="eyebrow">AUTOMAÇÃO DE CAPTURA</span>
          <h1>Mandou no Direct.<br /><em>Salvou sozinho.</em></h1>
          <p>Envie um Reel público para a conta conectada. O webhook recebe, baixa e guarda o MP4 automaticamente.</p>
        </div>
        <div className="flow" aria-label="Fluxo da automação">
          <div><b>01</b><span>Compartilhe por DM</span></div>
          <i>→</i>
          <div><b>02</b><span>Webhook identifica</span></div>
          <i>→</i>
          <div><b>03</b><span>MP4 fica pronto</span></div>
        </div>
      </header>

      <section className="content">
        <div className="status-row">
          <article><span className="signal" data-on={configured} /><div><small>WEBHOOK META</small><strong>{configured ? "Configurado" : "Aguardando token"}</strong></div></article>
          <article><span className="signal" data-on={senderFilter} /><div><small>REMETENTES</small><strong>{senderFilter ? "Lista protegida" : "Filtro não definido"}</strong></div></article>
          <article><b>{ready}</b><div><small>ARQUIVOS PRONTOS</small><strong>{formatSize(reels.reduce((sum, reel) => sum + (reel.size_bytes ?? 0), 0))}</strong></div></article>
        </div>

        <div className="grid">
          <section className="inbox">
            <div className="section-head">
              <div><span className="eyebrow">CAIXA DE ENTRADA</span><h2>Reels recebidos</h2></div>
              <button onClick={load}>Atualizar ↻</button>
            </div>

            <div className="summary">
              <span><b>{processing}</b> processando</span>
              <span><b>{ready}</b> prontos</span>
              <span><b>{failed}</b> com falha</span>
            </div>

            <div className="table">
              <div className="table-row table-label"><span>REEL</span><span>REMETENTE</span><span>TAMANHO</span><span>STATUS</span><span /></div>
              {loading && <div className="empty">Carregando caixa de entrada…</div>}
              {!loading && reels.length === 0 && <div className="empty">Nenhum Reel recebido ainda. Envie um link por DM ou teste no painel ao lado.</div>}
              {reels.map((reel) => (
                <div className="table-row" key={reel.id}>
                  <div className="reel-name"><i>▶</i><span><strong>Reel #{reel.id}</strong><small>{formatDate(reel.created_at)}</small></span></div>
                  <span className="sender">{reel.sender_id === "manual" ? "Painel" : reel.sender_id}</span>
                  <span>{formatSize(reel.size_bytes)}</span>
                  <span className={`badge ${reel.status}`} title={reel.error ?? undefined}>{statusLabel[reel.status]}</span>
                  <span className="row-action">
                    {reel.status === "ready"
                      ? <a href={`/api/reels/${reel.id}/download`}>Baixar ↓</a>
                      : <a href={reel.source_url} target="_blank" rel="noreferrer">Abrir ↗</a>}
                  </span>
                  {reel.error && <small className="error">{reel.error}</small>}
                </div>
              ))}
            </div>
          </section>

          <aside>
            <section className="test-card">
              <span className="eyebrow">TESTE RÁPIDO</span>
              <h2>Cole um Reel público</h2>
              <p>Use este campo para validar o download antes de concluir a configuração da Meta.</p>
              <form onSubmit={addManually}>
                <label htmlFor="reel-url">URL do Reel</label>
                <input id="reel-url" type="url" required value={url} onChange={(event) => setUrl(event.target.value)} placeholder="https://instagram.com/reel/..." />
                <button>Adicionar à fila <span>→</span></button>
              </form>
              {notice && <div className="notice" role="status">{notice}</div>}
              <small className="rights">Use somente conteúdo próprio ou com autorização do titular.</small>
            </section>

            <section className="setup-card">
              <span className="eyebrow">CONFIGURAÇÃO META</span>
              <ol>
                <li><b>Conta profissional</b><span>Use uma conta Business ou Creator.</span></li>
                <li><b>Webhook</b><code>/instagram/webhook</code></li>
                <li><b>Evento</b><code>messages</code></li>
                <li><b>Permissão</b><code>instagram_business_manage_messages</code></li>
              </ol>
            </section>
          </aside>
        </div>
      </section>
    </main>
  );
}
