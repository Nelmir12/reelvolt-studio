"use client";

import { ChangeEvent, useMemo, useState } from "react";

type QueueItem = {
  id: number;
  title: string;
  time: string;
  status: "Pronto" | "Agendado" | "Rascunho";
  color: string;
};

const initialQueue: QueueItem[] = [
  { id: 1, title: "Eu tentando ser produtivo", time: "Hoje, 19:30", status: "Agendado", color: "#f6c344" },
  { id: 2, title: "Quando o café finalmente bate", time: "Amanhã, 12:15", status: "Pronto", color: "#d5ff54" },
  { id: 3, title: "POV: abriu o app por 5 minutos", time: "Sem horário", status: "Rascunho", color: "#ff7454" },
];

export default function Home() {
  const [active, setActive] = useState("Criar Reel");
  const [sourceMode, setSourceMode] = useState<"upload" | "link">("upload");
  const [fileName, setFileName] = useState("");
  const [sourceUrl, setSourceUrl] = useState("");
  const [rights, setRights] = useState(false);
  const [headline, setHeadline] = useState("EU DISSE QUE IA DORMIR CEDO");
  const [subline, setSubline] = useState("eu às 3:47 vendo vídeos aleatórios");
  const [caption, setCaption] = useState("Quem nunca? 😂 Envia pra aquela pessoa que faz igual.");
  const [accent, setAccent] = useState("#d5ff54");
  const [queue, setQueue] = useState(initialQueue);
  const [notice, setNotice] = useState("");
  const [connected, setConnected] = useState(false);
  const [showConnect, setShowConnect] = useState(false);
  const [scheduled, setScheduled] = useState("Hoje, 19:30");

  const ready = rights && (Boolean(fileName) || Boolean(sourceUrl.trim()));
  const sourceLabel = useMemo(
    () => fileName || (sourceUrl ? "Vídeo autorizado por link" : "Seu vídeo aparece aqui"),
    [fileName, sourceUrl],
  );

  function selectFile(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (!file) return;
    setFileName(file.name);
    setNotice("Vídeo carregado. Ajuste os textos e confira a prévia.");
  }

  function addToQueue() {
    if (!ready) {
      setNotice("Adicione um vídeo e confirme a autorização de uso antes de continuar.");
      return;
    }
    setQueue((items) => [
      { id: Date.now(), title: headline || "Novo Reel", time: scheduled, status: "Agendado", color: accent },
      ...items,
    ]);
    setNotice("Reel adicionado à fila. A renderização final será feita antes da publicação.");
  }

  function publishNow() {
    if (!connected) {
      setShowConnect(true);
      return;
    }
    if (!ready) {
      setNotice("Adicione um vídeo autorizado antes de publicar.");
      return;
    }
    setNotice("Reel enviado para processamento e publicação pela Meta.");
  }

  return (
    <main className="app-shell">
      <aside className="sidebar">
        <div className="brand">
          <span className="brand-mark">RV</span>
          <span>REELVOLT</span>
        </div>

        <nav aria-label="Navegação principal">
          {[
            ["Visão geral", "⌁"],
            ["Criar Reel", "＋"],
            ["Biblioteca", "▦"],
            ["Fila de posts", "◷"],
            ["Desempenho", "↗"],
          ].map(([label, icon]) => (
            <button key={label} className={active === label ? "nav-item active" : "nav-item"} onClick={() => setActive(label)}>
              <span>{icon}</span>{label}
              {label === "Fila de posts" && <b>{queue.length}</b>}
            </button>
          ))}
        </nav>

        <div className="sidebar-bottom">
          <div className="plan-card">
            <span className="eyebrow">PLANO STARTER</span>
            <strong>8 de 30 Reels</strong>
            <div className="meter"><i /></div>
            <small>Renova em 8 dias</small>
          </div>
          <button className="nav-item"><span>⚙</span>Configurações</button>
          <div className="profile">
            <span className="avatar">NJ</span>
            <div><strong>Minha página</strong><small>{connected ? "@conta_conectada" : "Conta não conectada"}</small></div>
            <button aria-label="Abrir menu">•••</button>
          </div>
        </div>
      </aside>

      <section className="workspace">
        <header className="topbar">
          <div>
            <span className="breadcrumb">ESTÚDIO / NOVO REEL</span>
            <h1>Crie seu próximo viral<span>.</span></h1>
            <p>Transforme um vídeo autorizado em um Reel pronto para performar.</p>
          </div>
          <button className={connected ? "account connected" : "account"} onClick={() => setShowConnect(true)}>
            <span className="ig-dot">◎</span>
            <span><small>INSTAGRAM</small>{connected ? "@conta_conectada" : "Conectar conta"}</span>
            <i>{connected ? "●" : "→"}</i>
          </button>
        </header>

        <div className="studio-grid">
          <section className="editor-panel">
            <div className="step-heading"><span>01</span><div><h2>Escolha o vídeo</h2><p>Envie um arquivo seu ou informe uma fonte autorizada.</p></div></div>
            <div className="source-tabs">
              <button className={sourceMode === "upload" ? "selected" : ""} onClick={() => setSourceMode("upload")}>↑ Enviar arquivo</button>
              <button className={sourceMode === "link" ? "selected" : ""} onClick={() => setSourceMode("link")}>↗ Link autorizado</button>
            </div>

            {sourceMode === "upload" ? (
              <label className={fileName ? "dropzone has-file" : "dropzone"}>
                <input type="file" accept="video/mp4,video/quicktime,video/webm" onChange={selectFile} />
                <span className="upload-icon">{fileName ? "✓" : "↑"}</span>
                <strong>{fileName || "Arraste seu vídeo aqui"}</strong>
                <small>{fileName ? "Pronto para editar" : "ou clique para procurar · MP4, MOV ou WEBM"}</small>
              </label>
            ) : (
              <div className="link-box">
                <label htmlFor="source">URL do vídeo</label>
                <div><span>↗</span><input id="source" value={sourceUrl} onChange={(e) => setSourceUrl(e.target.value)} placeholder="https://..." /></div>
                <small>Use somente links de conteúdo próprio, licenciado ou com permissão do autor.</small>
              </div>
            )}

            <label className="rights-check">
              <input type="checkbox" checked={rights} onChange={(e) => setRights(e.target.checked)} />
              <span>Confirmo que possuo os direitos ou autorização para reutilizar este vídeo.</span>
            </label>

            <div className="divider" />
            <div className="step-heading"><span>02</span><div><h2>Texto que prende</h2><p>Curto, grande e legível nos primeiros segundos.</p></div></div>

            <div className="field">
              <div><label htmlFor="headline">Texto principal</label><small>{headline.length}/54</small></div>
              <textarea id="headline" maxLength={54} value={headline} onChange={(e) => setHeadline(e.target.value.toUpperCase())} />
            </div>
            <div className="field">
              <div><label htmlFor="subline">Complemento</label><small>{subline.length}/72</small></div>
              <input id="subline" maxLength={72} value={subline} onChange={(e) => setSubline(e.target.value)} />
            </div>

            <div className="style-row">
              <div><label>Cor de destaque</label><div className="swatches">
                {["#d5ff54", "#f6c344", "#ff7454", "#72e6ff", "#ffffff"].map((color) => (
                  <button key={color} aria-label={`Usar cor ${color}`} className={accent === color ? "chosen" : ""} style={{ background: color }} onClick={() => setAccent(color)} />
                ))}
              </div></div>
              <div><label>Posição</label><div className="segment"><button className="on">Topo</button><button>Centro</button></div></div>
            </div>

            <div className="field">
              <div><label htmlFor="caption">Legenda do post</label><small>{caption.length}/2.200</small></div>
              <textarea id="caption" className="caption" value={caption} onChange={(e) => setCaption(e.target.value)} />
            </div>

            <div className="actions">
              <div className="schedule">
                <label htmlFor="schedule">Publicar</label>
                <select id="schedule" value={scheduled} onChange={(e) => setScheduled(e.target.value)}>
                  <option>Hoje, 19:30</option><option>Amanhã, 12:15</option><option>Amanhã, 18:45</option>
                </select>
              </div>
              <button className="secondary" onClick={addToQueue}>Adicionar à fila</button>
              <button className="primary" onClick={publishNow}>Publicar agora ↗</button>
            </div>
            {notice && <div className="notice" role="status">{notice}</div>}
          </section>

          <aside className="preview-panel">
            <div className="preview-title"><div><span>PRÉVIA AO VIVO</span><small>Formato 9:16 · Reels</small></div><button title="Reiniciar prévia">↻</button></div>
            <div className="phone">
              <div className="phone-top"><span>9:41</span><i>● ◒ ▮</i></div>
              <div className="video-stage" style={{ "--accent": accent } as React.CSSProperties}>
                <div className="grain" />
                <div className="preview-copy">
                  <strong>{headline || "SEU TEXTO AQUI"}</strong>
                  <span>{subline}</span>
                </div>
                <div className="play">▶</div>
                <div className="reel-ui">
                  <div className="reel-caption"><span className="mini-avatar">RV</span><b>seuperfil</b><small>Seguir</small><p>{caption}</p></div>
                  <div className="reel-actions"><span>♡<small>12,8 mil</small></span><span>◯<small>348</small></span><span>⌁<small>Enviar</small></span><span>•••</span></div>
                </div>
                <div className="source-pill">{sourceLabel}</div>
              </div>
            </div>

            <div className="safe-card">
              <span>✓</span><div><strong>Área segura ativa</strong><p>Os textos ficam fora dos controles do Instagram.</p></div>
            </div>

            <div className="queue-mini">
              <div><h3>Próximos na fila</h3><button onClick={() => setActive("Fila de posts")}>Ver todos</button></div>
              {queue.slice(0, 2).map((item) => (
                <article key={item.id}>
                  <i style={{ background: item.color }}>{item.title.slice(0, 2)}</i>
                  <div><strong>{item.title}</strong><small>{item.time}</small></div>
                  <span className={`status ${item.status.toLowerCase()}`}>{item.status}</span>
                </article>
              ))}
            </div>
          </aside>
        </div>
      </section>

      {showConnect && (
        <div className="modal-backdrop" role="presentation" onMouseDown={() => setShowConnect(false)}>
          <section className="modal" role="dialog" aria-modal="true" aria-labelledby="connect-title" onMouseDown={(e) => e.stopPropagation()}>
            <button className="modal-close" onClick={() => setShowConnect(false)} aria-label="Fechar">×</button>
            <span className="modal-icon">◎</span>
            <span className="eyebrow">PUBLICAÇÃO OFICIAL</span>
            <h2 id="connect-title">Conecte seu Instagram</h2>
            <p>A publicação automática usa a API oficial da Meta e requer uma conta profissional vinculada a uma Página do Facebook.</p>
            <ul><li>Você mantém o controle da conta</li><li>Nenhuma senha é armazenada</li><li>Permissão pode ser revogada a qualquer momento</li></ul>
            <button className="primary full" onClick={() => { setConnected(true); setShowConnect(false); setNotice("Conta de demonstração conectada. Configure as credenciais da Meta para publicar de verdade."); }}>Continuar com a Meta →</button>
            <small className="demo-note">Nesta versão local, a conexão é demonstrativa.</small>
          </section>
        </div>
      )}
    </main>
  );
}
