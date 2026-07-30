# BT Supply ReelVolt Studio

Painel privado e instalável para receber links de Reels autorizados, baixar o
MP4 e, opcionalmente, publicar o vídeo na conta `@btsupply_` pela API oficial da
Meta. D1 armazena os estados e métricas; R2 armazena os vídeos. O Notion não faz
parte do fluxo operacional.

## Fluxo

1. No iPhone, o usuário copia o link de um Reel e abre o Reel Inbox pela Tela de
   Início. Em plataformas compatíveis, o PWA também aceita compartilhamento.
2. O site exige autenticação com ChatGPT e permite somente e-mails autorizados.
3. O usuário confirma os direitos e escolhe uma ação:
   - **Preparar e aguardar aprovação** (padrão);
   - **Somente baixar o MP4**.
4. O serviço identifica links repetidos e usa a instância privada do Cobalt
   como fallback quando o Instagram exige login.
5. O MP4 é armazenado no R2 e os estados, métricas e IDs da Meta ficam no D1.
6. O painel permite salvar uma legenda padrão editável, desativar a legenda,
   enviar uma capa fixa ao R2 ou publicar sem capa personalizada.
7. A fila automática é opcional. Todo Reel precisa ser aprovado previamente e
   recebe um horário conforme o intervalo configurado; alterar os padrões não
   muda itens já aprovados.
8. Para publicar, o worker cria um contêiner de Reel, acompanha o processamento
   e chama `media_publish` na API oficial da Meta.
9. A aba Dashboard consulta Insights oficiais, soma visualizações e interações,
   cria um ranking por Reel e registra uma amostra diária no D1.

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
