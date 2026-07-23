export default function Home() {
  return (
    <main className="service-shell">
      <section className="service-card">
        <div className="brand"><span>BT</span> SUPPLY</div>
        <span className="eyebrow">SERVIÇO DE AUTOMAÇÃO</span>
        <h1>Reel Inbox está ativo.</h1>
        <p>
          Este endereço recebe eventos autenticados da Meta para a conta
          <strong> @btsupply_</strong>. O histórico e os arquivos não são públicos.
        </p>
        <div className="service-flow" aria-label="Fluxo do serviço">
          <span>Direct</span><i>→</i><span>Validação</span><i>→</i><span>MP4 protegido</span>
        </div>
        <small>Somente conteúdo público e autorizado é processado.</small>
      </section>
    </main>
  );
}
