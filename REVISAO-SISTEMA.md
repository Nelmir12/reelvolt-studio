# Revisão do ReelVolt Studio — 9 de setembro de 2026

## Escopo e estado observado

Revisão da automação exclusiva de Instagram Reels, das rotas do worker,
persistência, autenticação, publicação manual, cron, recuperação, configurações,
Insights, PWA e renderização. Nenhum Reel real foi publicado e a fila não foi ativada.

- Baseline local: 853e3e6217431fe7d4d3c9e9cb56419ccfe2ed3c.
- O Sites informou ReelVolt 1.32 como última versão salva, com esse mesmo commit.
  A consulta não identifica, por si só, qual versão está atendendo cada requisição.
- O endereço de produção respondeu HTTP 307 para o login do ChatGPT.
- Consulta somente leitura ao D1 encontrou a fila desligada, com intervalo de 240 minutos.
- Foram consultados 71 registros: 56 publicados, oito bloqueados, um somente
  download, um aguardando aprovação e cinco em estados antigos de processamento
  ou publicação (IDs 60, 67, 68, 70 e 71). Nenhum desses estados foi alterado.
- A última sincronização registrada de Insights estava concluída, sem erro,
  em 20/08/2026, com 56 de 56 alvos atualizados. Isso não comprova a validade atual do token.
- Não houve eventos de erro retornados na janela de 60 minutos consultada.
  Ausência de eventos não comprova execução recente do cron.
- Pastas preexistentes .agents, .codex e plugins foram preservadas e excluídas
  das validações de código da aplicação.

## Manter

Painel e PWA; entradas pelo painel, Atalho e Direct autenticado; resolvedor e
callback autenticado do GitHub; R2; D1; recuperação com MP4; publicação oficial
na Meta; modos manual e automático; legenda, capa, intervalo; histórico e Insights.
As tabelas, migrações anteriores e credenciais históricas do YouTube permanecem.

## Remover

Executores, OAuth e consultas externas antigos do YouTube. O arquivo de 1.795
linhas foi substituído por um módulo de compatibilidade com schema e registros
de autorização. Rotas retiradas continuam respondendo 410. Removidos também os
exemplos D1 do starter e três SVGs sem referências: file, globe e window.
Imagens de marca e fontes de capa foram preservadas.

## Correções

1. Clique manual em Reel recebido pelo Direct agora publica no modo manual,
   sem colocá-lo numa fila desligada.
2. A reserva de um item automático usa creating, eliminando a espera indevida
   de 15 minutos que ocorria ao confundir a reserva com uma publicação enviada.
3. Uma trava global no D1 serializa as execuções. Estados antigos sobrepostos
   são retomados pelo primeiro preparado, sem impedir a recuperação. As reservas manuais são
   condicionais; cliques simultâneos não criam contêineres duplicados.
4. A retomada relê o registro e preserva o contêiner quando a resposta da
   publicação fica incerta. Falhas anteriores ao envio não são reconciliadas
   com publicações recentes apenas pela legenda. A reconciliação exige que
   o contêiner esteja confirmado como PUBLISHED pela Meta.
5. Chamadas da publicação e renovação do token têm timeout de 20 segundos.
6. JSON malformado recebe HTTP 400 sem detalhes internos.
7. Ajustados os tipos da configuração TypeScript e da URL capturada pelo cron.

## Validação

A suíte usa o worker compilado, SQLite temporário com as migrações reais, R2 em
memória e respostas simuladas dos provedores. Ela cobre renderização de Produção
e Métricas, FIFO e intervalo, autorização, origem, assinatura e expiração de
mídia, webhook, Atalho e revogação, intake e duplicatas, callback e upload,
exclusão com preservação de métricas, mudanças de configuração, fila desligada,
publicação manual e automática, concorrência, falha e resposta incerta da Meta.
Inclui atualização de Insights e preservação dos valores após erro de permissão.

Resultados: npm test passou com build e 31 testes (7 de renderização/contratos
e 24 de integração). npm run lint passou sem erros, com quatro avisos
preexistentes sobre uso de img. A checagem TypeScript sem emissão passou.
git diff --check passou. Nenhuma chamada de publicação real foi executada.

## Migração e recuperação

A migração 0014_marvelous_pride cria apenas instagram_publication_lock. O schema
Drizzle, snapshot e criação compatível do worker estão sincronizados. DB e
VIDEOS e o project_id permanecem iguais. Não há migração destrutiva.

Se uma execução for interrompida, a trava expira em até dez minutos. O cron pode
retomar depois quando a fila estiver ativa; no modo manual, a retomada depende
de outro clique explícito. Um rollback pode usar a versão anterior sem remover
a tabela nova. Não apagar a trava ou dados de produção como tentativa de recuperação.

## Limites e pendências de produção

Não foram realizados: implantação, teste real de publicação, ativação da fila,
acionamento real de download, renovação real de token, inscrição do webhook,
teste físico no iPhone ou navegação interativa autenticada. Os testes de R2, Meta
e GitHub são simulados; não certificam disponibilidade e permissões atuais dos
serviços externos. A liberação do Direct pela Meta não foi comprovada nesta revisão.
A reconciliação histórica por legenda e horário permanece uma heurística; em
respostas incertas, conferir o resultado no Instagram antes de intervenções manuais.

## Diagnóstico dos Reels 71–73 — 10 de setembro de 2026

- O Reel 71 permaneceu em `publishing` com um contêiner da Meta, mas a rota de
  retomada devolvia HTTP 409 porque os Reels 67, 68 e 70 ainda conservavam estados
  ativos antigos. A trava global já serializa a execução real; a retomada manual
  agora atua exatamente no Reel selecionado, sem reenviar um contêiner confirmado.
- Os Reels 72 e 73 receberam HTTP 200 com conteúdo HTML no lugar de vídeo. A
  validação ocorria depois do bloco que aciona o GitHub Actions e, por isso, ambos
  terminavam em `failed` sem chamar o executor alternativo.
- O resolvedor agora rejeita respostas que não sejam vídeo em cada etapa e deixa
  esse erro cair no executor autenticado. Os nomes históricos
  `GITHUB_WORKFLOW_ID` e `GITHUB_WORKFLOW_REF`, ainda presentes no Sites, seguem
  aceitos durante a migração.
- A inspeção do GitHub mostrou que não houve execução do workflow em 10/09/2026,
  confirmando que os Reels 72 e 73 falharam antes do despacho. O último acionamento
  registrado foi concluído com sucesso em 24/08/2026; o segredo histórico de
  callback continua configurado no repositório.
- Nenhum Reel real foi publicado, nenhum registro do D1 foi alterado e nenhum
  objeto do R2 foi removido durante o diagnóstico.

A versão candidata deve ser salva a partir do commit validado e enviado. A
implantação e qualquer publicação real continuam dependendo de autorização.

Referência do estado PUBLISHED: [coleção oficial da Meta](https://www.postman.com/meta/instagram/documentation/6yqw8pt/instagram-api?entity=request-23987686-ab559ffb-8e2c-4b0a-b43a-5737b6d2f672).
