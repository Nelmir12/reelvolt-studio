# BT Supply ReelVolt Studio

Painel privado e instalável para receber links de Reels autorizados, baixar um
único MP4 e distribuí-lo no Instagram Reels e no YouTube Shorts pelas APIs
oficiais. D1 armazena estados, credenciais criptografadas e métricas; R2 armazena
os vídeos. O Notion não faz parte do fluxo operacional.

## Fluxo

1. No iPhone, o usuário copia o link de um Reel e abre o Reel Inbox pela Tela de
   Início. Em plataformas compatíveis, o PWA também aceita compartilhamento.
2. O site exige autenticação com ChatGPT e permite somente e-mails autorizados.
3. O usuário confirma os direitos e escolhe uma ação:
   - **Preparar e aguardar aprovação** (padrão);
   - **Somente baixar o MP4**.
4. O serviço identifica links repetidos e usa a instância privada do Cobalt
   como fallback quando o Instagram exige login.
5. O MP4 inalterado é armazenado uma vez no R2. O usuário escolhe Instagram,
   YouTube ou ambos; clientes antigos sem `destinations` permanecem
   Instagram-only.
6. Após a aprovação, um GitHub Action acionado sob demanda valida formato com
   FFprobe e envia o MP4 inalterado. Não existe polling ocioso nem serviço Render.
   Sem uma chave paga de IA, o Short recebe metadados provisórios neutros e exige
   revisão humana explícita no painel.
7. A fila automática é opcional. Todo Reel precisa ser aprovado previamente e
   recebe um horário conforme o intervalo configurado; alterar os padrões não
   muda itens já aprovados.
8. O Instagram segue `media_publish` pela Meta. O YouTube usa upload retomável
   e sempre cria o vídeo como privado.
9. Depois do processamento, o painel exige a revisão do vídeo e dos metadados e
   abre o vídeo exato no YouTube Studio. O Short somente fica público após essas
   duas confirmações e o backend revalidar os gates e a auditoria do projeto da
   API.
10. O Dashboard mantém métricas e rankings separados por plataforma, com
    snapshots diários e nos marcos de 1h, 24h, 72h e 7 dias.

Use somente vídeos próprios, licenciados ou autorizados pelo titular.

## Configuração

As variáveis estão documentadas em `.env.example`:

- `ADMIN_TOKEN`: protege diagnósticos e testes administrativos.
- `PUBLIC_BASE_URL`: endereço público do serviço.
- `INBOX_ALLOWED_EMAILS`: e-mails do ChatGPT autorizados, separados por vírgula.
- `REEL_RESOLVER_URL`, `REEL_RESOLVER_TOKEN` e
  `REEL_RESOLVER_AUTH_SCHEME`: fallback privado quando o Instagram exige login,
  compatível com uma instância privada do Cobalt.
- `INSTAGRAM_GRAPH_HOST`: `graph.instagram.com` para Instagram Login ou
  `graph.facebook.com` para Facebook Login.
- `INSTAGRAM_API_VERSION`: versão ativa configurada no aplicativo da Meta.
- `INSTAGRAM_USER_ID`: ID profissional da conta que receberá os Reels.
- `INSTAGRAM_ACCESS_TOKEN`: token com permissão de publicação.
- `PUBLISH_URL_SECRET`: segredo aleatório usado para assinar links de mídia com
  validade de duas horas.
- `YOUTUBE_CLIENT_ID` e `YOUTUBE_CLIENT_SECRET`: credenciais OAuth do tipo
  aplicação Web.
- `YOUTUBE_TOKEN_SECRET`: chave exclusiva usada para criptografar o refresh
  token no D1.
- `YOUTUBE_WORKER_SECRET`: autentica o claim e os callbacks do executor.
- `YOUTUBE_EXECUTOR_MODE=github`, `GITHUB_REPOSITORY`, `GITHUB_WORKFLOW_ID` e
  `GITHUB_WORKFLOW_REF`: selecionam o executor gratuito sob demanda.
- `GITHUB_ACTIONS_TOKEN`: token restrito a Actions neste único repositório.
- `YOUTUBE_API_AUDITED`: somente `true` após a auditoria externa do projeto;
  enquanto for `false`, a liberação pública é bloqueada.
- `OWNED_SOURCE_ACCOUNTS`: lista de contas próprias autorizadas.
- `OPENAI_API_KEY` e `OPENAI_*_MODEL`: integração opcional e paga. Sem a chave,
  o produto mantém o Short privado até a revisão humana.

Com Instagram Login, o token precisa das permissões
`instagram_business_basic`, `instagram_business_content_publish` e
`instagram_business_manage_insights`.

## Rotas principais

- `GET /`: painel autenticado.
- `POST /api/reels/intake`: recebe um Reel e as opções de fluxo.
- `GET /api/reels`: lista os registros recentes.
- `GET /api/dashboard`: retorna métricas e estado das integrações.
- `PUT /api/studio-settings`: salva legenda, capa e intervalo da fila.
- `POST /api/studio-settings/cover`: envia uma nova capa fixa ao R2.
- `GET /api/analytics`: retorna visualizações, alcance, interações, histórico e
  recomendações.
- `POST /api/analytics/refresh`: solicita uma nova leitura de Insights na Meta.
- `POST /api/reels/:id/publish`: aprova para a fila, retoma ou repete uma publicação.
- `GET /api/youtube/oauth/start` e `GET /api/youtube/oauth/callback`: conectam e
  fixam o canal exato com state e PKCE.
- `PATCH /api/reels/:id/youtube/metadata`: edita e remodera metadados.
- `POST /api/reels/:id/youtube/retry`: retoma sem duplicar vídeo.
- `POST /api/reels/:id/youtube/release`: confirma os checks e solicita a
  mudança de privado para público.
- `/api/internal/youtube/jobs/*`: lease, heartbeat, análise e conclusão,
  protegidos por `YOUTUBE_WORKER_SECRET`.
- `GET /worker-media/:id.mp4`: URL assinada e limitada ao lease, com suporte a
  `Range`.
- `POST /api/publication-queue/process`: processa manualmente um item vencido.
- `GET /download/:token`: entrega o MP4 ao usuário.
- `GET /publish-media/:id.mp4`: link temporário assinado consumido pela Meta.
- `GET /publish-cover/:id.jpg`: capa temporária assinada consumida pela Meta.
- `GET /api/integrations/status`: diagnóstico administrativo.

## Desenvolvimento local

```powershell
copy .env.example .env
npm install
npm run dev
```

O executor está em `youtube-uploader/` e o workflow em
`.github/workflows/youtube-uploader.yml`. O Sites aciona uma execução somente
quando existe um Short na fila; o refresh token do Google nunca sai do D1.
Antes de ativar, confirme no GitHub que não existe forma de pagamento ou que o
orçamento de Actions interrompe o uso ao atingir zero.

Para continuar o projeto em outra máquina usando o Codex, consulte
[`CONTINUAR-NO-CODEX.md`](CONTINUAR-NO-CODEX.md).

## Observações

O canal de entrada não altera as restrições técnicas do Instagram. O serviço
tenta primeiro o vídeo exposto publicamente e usa um resolvedor próprio ou
licenciado como fallback. Sites que proíbem bots, scripts ou acesso automatizado
não devem ser usados como resolvedores.

A publicação segue o processo oficial da Meta: o vídeo precisa ficar disponível
temporariamente por URL pública, o contêiner deve terminar com status
`FINISHED` e só então o Reel é publicado.

No YouTube não existe promessa de risco zero: Content ID, políticas de conteúdo
reutilizado e monetização são decisões do YouTube. A API pública não é usada
como detector de claims ou de adequação a anúncios.
