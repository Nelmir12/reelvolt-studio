# BT Supply ReelVolt Studio

Painel privado e instalável para receber links de Reels autorizados, baixar o
MP4, aprovar publicações e acompanhar os Insights oficiais do Instagram da
conta `@btsupply_`. D1 armazena estados, preferências e métricas; R2 armazena os
vídeos e as capas.

## Fluxo

1. O usuário compartilha um Reel pelo PWA ou envia o Reel de `@nelmirjr` para o
   Direct de `@btsupply_`.
2. O site valida o usuário, a URL, a assinatura da Meta e a confirmação dos
   direitos de uso. No Direct, somente o identificador vinculado a `@nelmirjr`
   é aceito.
3. O MP4 é obtido diretamente ou por um resolvedor privado/licenciado e fica
   armazenado uma única vez no R2.
4. O usuário pode somente baixar o arquivo ou prepará-lo para aprovação. No
   fluxo do Direct, recebe um botão que abre exatamente o Reel preparado.
5. Após a aprovação explícita, o Reel é publicado pela API oficial da Meta,
   imediatamente ou pela fila configurada.
6. Os Insights oficiais alimentam o dashboard e o histórico de métricas.

O experimento de publicação no YouTube foi retirado. As tabelas e os registros
históricos permanecem preservados no D1, mas nenhuma nova opção, rota ou
execução do YouTube fica disponível.

Use somente vídeos próprios, licenciados ou autorizados pelo titular.

## Configuração

As variáveis estão documentadas em `.env.example`:

- `ADMIN_TOKEN`: protege diagnósticos administrativos.
- `PUBLIC_BASE_URL`: endereço público do serviço.
- `INBOX_ALLOWED_EMAILS`: e-mails autorizados, separados por vírgula.
- `REEL_RESOLVER_URL`, `REEL_RESOLVER_TOKEN` e
  `REEL_RESOLVER_AUTH_SCHEME`: fallback privado/licenciado.
- `INSTAGRAM_GRAPH_HOST`: host oficial da Graph API.
- `INSTAGRAM_API_VERSION`: versão ativa configurada no aplicativo da Meta.
- `INSTAGRAM_USER_ID`: ID profissional da conta que receberá os Reels.
- `INSTAGRAM_ACCESS_TOKEN`: token com permissão de publicação e Insights.
- `INSTAGRAM_DIRECT_ALLOWED_USERNAME`: único usuário autorizado a enviar pelo
  Direct (atualmente `nelmirjr`).
- `META_APP_SECRET`: segredo usado para validar `X-Hub-Signature-256`.
- `META_VERIFY_TOKEN`: segredo usado pela Meta ao validar o callback.
- `PUBLISH_URL_SECRET`: assina URLs temporárias consumidas pela Meta.

Com Instagram Login, o token precisa das permissões
`instagram_business_basic`, `instagram_business_content_publish`,
`instagram_business_manage_insights` e `instagram_business_manage_messages`.

## Rotas principais

- `GET /`: painel autenticado.
- `GET|POST /webhooks/instagram`: validação e eventos assinados do Direct.
- `POST /api/instagram/direct/subscribe`: ativa `messages` e
  `messaging_postbacks` para a conta profissional.
- `POST /api/reels/intake`: recebe um Reel e as opções do fluxo.
- `GET /api/reels`: lista os registros recentes.
- `GET /api/dashboard`: retorna métricas e estado do Instagram.
- `PUT /api/studio-settings`: salva legenda, capa e intervalo da fila.
- `POST /api/studio-settings/cover`: envia uma capa fixa ao R2.
- `GET /api/analytics`: retorna métricas e recomendações do Instagram.
- `POST /api/analytics/refresh`: solicita nova leitura de Insights.
- `POST /api/reels/:id/publish`: aprova, retoma ou repete uma publicação.
- `POST /api/publication-queue/process`: processa um item vencido.
- `GET /download/:token`: entrega o MP4 ao usuário.
- `GET /publish-media/:id.mp4`: URL temporária do MP4 para a Meta.
- `GET /publish-cover/:id.jpg`: URL temporária da capa para a Meta.
- `GET /api/integrations/status`: diagnóstico administrativo.

As antigas rotas `/api/youtube/*`, `/api/internal/youtube/*`,
`/api/reels/:id/youtube/*` e `/worker-media/*` respondem como recurso retirado e
não executam publicação.

## Desenvolvimento local

```powershell
copy .env.example .env
npm install
npm run dev
```

Antes de enviar mudanças:

```powershell
npm run lint
npm test
git diff --check
```

Para continuar o projeto em outra máquina, consulte
[`CONTINUAR-NO-CODEX.md`](CONTINUAR-NO-CODEX.md).

## Segurança

- Nunca envie senhas, códigos de verificação ou tokens pelo chat.
- Não adicione `.env` ao Git.
- Não altere o `project_id` em `.openai/hosting.json`.
- Não remova tabelas do D1 nem objetos do R2 como efeito colateral.
- Nunca publique um Reel sem aprovação explícita para aquele item.
- Nunca aceite um evento do Direct sem assinatura HMAC válida; o primeiro
  evento autorizado confere o username e fixa o Instagram-scoped ID de
  `@nelmirjr` no D1.
