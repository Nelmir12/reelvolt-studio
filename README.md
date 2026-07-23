# Reel Inbox

Automação para receber links de Reels enviados por Direct a uma conta profissional
do Instagram, baixar o MP4 em segundo plano e armazená-lo no R2 com histórico no D1.

## Como funciona

1. Uma pessoa compartilha um Reel por DM com a conta conectada.
2. A API oficial da Meta envia o evento `messages` para `/instagram/webhook`.
3. O serviço valida a assinatura e a lista permitida de remetentes.
4. Somente remetentes previamente pareados ou explicitamente autorizados são aceitos.
5. O arquivo direto da mensagem é priorizado. Para um link público, a página é
   consultada em busca do vídeo exposto publicamente.
6. O MP4 é guardado no R2 e só pode ser recuperado com o token administrativo.

O processamento aceita somente conteúdo público. Use apenas vídeos próprios,
licenciados ou com autorização do titular.

## Configuração local

```bash
copy .env.example .env
npm install
npm run dev
```

Preencha:

- `META_VERIFY_TOKEN`: token escolhido por você para validar o webhook.
- `META_APP_SECRET`: segredo do aplicativo, usado para validar `X-Hub-Signature-256`.
- `ADMIN_TOKEN`: protege histórico, teste manual e downloads.
- `PAIRING_CODE`: primeira mensagem secreta que autoriza a conta remetente.
- `ALLOWED_IG_SENDER_IDS`: IDs autorizados, separados por vírgula. Não deixe vazio
  em produção.
- `REEL_RESOLVER_URL` e `REEL_RESOLVER_TOKEN`: fallback opcional para um provedor
  com API licenciada. O endpoint recebe `{"url":"..."}` e deve retornar
  `{"videoUrl":"..."}`.

## Meta for Developers

1. Use uma conta Instagram Business ou Creator.
2. Crie um app e configure **Instagram API with Instagram Login**.
3. Solicite `instagram_business_manage_messages` e as permissões básicas exigidas.
4. Cadastre `https://SEU-DOMINIO/instagram/webhook` como Callback URL.
5. Use o mesmo valor de `META_VERIFY_TOKEN` no painel da Meta.
6. Assine o campo de webhook `messages`.

Em modo de desenvolvimento, somente contas com função no app conseguem testar.
Para receber mensagens de usuários reais, o app e a permissão precisam passar
pela revisão da Meta.

## Rotas

- `GET/POST /instagram/webhook`: verificação e eventos da Meta.
- `GET /api/reels`: histórico recente, exige `Authorization: Bearer ADMIN_TOKEN`.
- `POST /api/reels/manual`: teste protegido com um link público.
- `GET /api/reels/:id/download`: entrega protegida do arquivo armazenado.

## Pareamento do remetente

Depois que o webhook estiver ativo, envie o valor exato de `PAIRING_CODE` por
Direct para a conta profissional. O identificador daquele remetente passa a ser
aceito; todos os demais são ignorados. O código não inicia nenhum download.

## Por que não usar DownReels automaticamente?

Os termos do DownReels descrevem o serviço como manual e proíbem bots, scripts,
scrapers e download automatizado/em massa. Integrá-lo por automação violaria essas
condições e seria operacionalmente frágil. Por isso ele não é usado pelo projeto.
