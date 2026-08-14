# BT Supply ReelVolt Studio

Painel privado e instalável para receber links de Reels autorizados, baixar o
MP4, publicar com um clique ou pela fila automática e acompanhar os Insights oficiais do Instagram da
conta `@btsupply_`. D1 armazena estados, preferências e métricas; R2 armazena os
vídeos e as capas.

## Fluxo

1. O usuário compartilha um Reel pelo PWA, pelo Atalho privado do iPhone ou
   envia o Reel de `@nelmirjr` para o Direct de `@btsupply_`.
2. O site valida o usuário, a URL e a origem autenticada. A autorização
   permanente concedida pelo proprietário se aplica somente a esses canais
   privados; no Direct, a assinatura da Meta e o ID vinculado a `@nelmirjr`
   continuam obrigatórios.
3. O MP4 é obtido diretamente, pelo embed público compatível ou por um
   resolvedor privado/licenciado. Se o IP do provedor principal for bloqueado,
   o ReelVolt aciona um executor isolado no GitHub Actions e recebe o MP4 pelo
   mesmo registro. Se todos os caminhos automáticos forem recusados pelo
   Instagram, o item ainda aceita o envio manual de um MP4 e fica armazenado
   uma única vez no R2.
4. O usuário pode somente baixar o arquivo ou prepará-lo para publicação. Com a
   fila desligada, um único botão publica o Reel; com a fila ligada, salvar a
   configuração autoriza e agenda todos os MP4 prontos e os próximos que forem
   preparados, em sequência e no intervalo escolhido.
5. O Reel é publicado exclusivamente pela API oficial da Meta. Ativar a fila é
   a autorização explícita para os itens elegíveis enquanto ela permanecer ativa.
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
- `GITHUB_ACTIONS_TOKEN`, `GITHUB_REPOSITORY`,
  `REEL_DOWNLOAD_WORKFLOW_ID` e `REEL_DOWNLOAD_WORKFLOW_REF`: executor
  alternativo para bloqueios de IP do resolvedor principal.
- `REEL_DOWNLOAD_WORKER_SECRET`: autentica o retorno do MP4; durante a
  migração, o segredo histórico `YOUTUBE_WORKER_SECRET` é aceito somente como
  credencial interna compatível, sem reativar nenhuma função do YouTube.
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
- `POST /api/reels/:id/retry`: recupera um download que falhou, sem duplicar o
  registro nem alterar publicações e métricas existentes.
- `POST /api/reels/:id/media`: recebe um MP4 de até 90 MB para recuperar um
  item cujo download automático falhou, preservando o mesmo registro.
- `POST /api/internal/reels/:id/resolver-result`: callback autenticado do
  executor alternativo; recebe o MP4 ou uma falha recuperável.
- `POST|DELETE /api/shortcut/access`: gera ou revoga o acesso privado do Atalho.
- `POST /api/shortcut/intake`: recebe a URL do iPhone com um token Bearer cujo
  valor é mostrado uma única vez e armazenado somente como hash no D1.
- `GET /api/reels`: lista todos os registros ativos, sem corte fixo por quantidade.
- `DELETE /api/reels/:id`: remove o MP4 do R2 e arquiva o item; quando o Reel já
  foi publicado, preserva a publicação e todo o histórico de Insights.
- `GET /api/dashboard`: retorna métricas e estado do Instagram.
- `PUT /api/studio-settings`: salva legenda, capa e intervalo da fila.
- `POST /api/studio-settings/cover`: envia uma capa fixa ao R2.
- `GET /api/analytics`: retorna métricas e recomendações do Instagram.
- `POST /api/analytics/refresh`: solicita uma leitura exclusiva dos Insights;
  sincronizações sobrepostas são bloqueadas e os Reels são processados com
  concorrência limitada para permanecer dentro do tempo do worker.
- `POST /api/reels/:id/publish`: inicia, retoma ou repete uma publicação manual.
- `POST /api/publication-queue/process`: processa um item vencido.
- `GET /download/:token`: entrega o MP4 ao usuário.
- `GET /publish-media/:id.mp4`: URL temporária do MP4 para a Meta.
- `GET /publish-cover/:id.jpg`: URL temporária da capa para a Meta.
- `GET /api/integrations/status`: diagnóstico administrativo.

As antigas rotas `/api/youtube/*`, `/api/internal/youtube/*`,
`/api/reels/:id/youtube/*` e `/worker-media/*` respondem como recurso retirado e
não executam publicação.

## Desenvolvimento local

Requisitos: Git e Node.js `>=22.13.0`. O repositório usa `package-lock.json` e
não depende de uma instalação global do Vinext, Vite, Wrangler ou Drizzle.

```powershell
Copy-Item .env.example .env
npm install
npm run dev
```

Os bindings locais do D1 e do R2 são simulados pelo plugin do Cloudflare. Os
segredos hospedados não são copiados para `.env`; por isso, Meta, Direct e o
resolvedor podem aparecer desconectados durante o desenvolvimento.

### Comandos disponíveis

| Comando | Uso |
| --- | --- |
| `npm run dev` | Inicia o ambiente local Vinext/Vite. |
| `npm run build` | Compila o site e o worker em `dist/`. |
| `npm run start` | Serve o build com `vinext start`. |
| `npm run lint` | Executa o ESLint. |
| `npm test` | Executa o build e os testes Node em `tests/rendered-html.test.mjs`. |
| `npm run db:generate` | Gera migrações e metadados Drizzle a partir de `db/schema.ts`. |
| `git diff --check` | Verifica whitespace inválido e marcadores de conflito. |

Não há comandos dedicados de formatação ou typecheck no `package.json`. O
TypeScript está em modo `strict`/`noEmit`, e o build faz parte de `npm test`.
Se o PowerShell bloquear `npm.ps1`, use `npm.cmd` no mesmo comando, como
`npm.cmd run lint`; não é necessário alterar a política de execução do Windows.

Antes de enviar mudanças de código:

```powershell
npm run lint
npm test
git diff --check
```

Para uma mudança somente documental, `git diff --check` e a revisão do diff são
o mínimo. Rode lint e testes quando a documentação alterar comandos ou contratos
verificados pela suíte.

### Arquivos e diretórios

- Edite `app/`, `worker/`, `db/schema.ts`, os assets em `public/` e a
  documentação conforme o escopo da tarefa.
- Não edite `node_modules/`, `dist/`, `.vinext/` ou `.wrangler/`; são artefatos
  locais ignorados.
- Não edite `drizzle/meta/*.json` manualmente. Use `npm run db:generate`, revise
  o SQL e crie sempre uma nova migração em vez de mudar uma já aplicada.
- `.env*` é local e ignorado. Nunca versione segredos.
- O workflow `.github/workflows/reel-downloader.yml` é acionado apenas por
  `workflow_dispatch`; ele não é uma suíte geral de CI do repositório.

Para continuar o projeto em outra máquina, consulte
[`CONTINUAR-NO-CODEX.md`](CONTINUAR-NO-CODEX.md).

## Segurança

- Nunca envie senhas, códigos de verificação ou tokens pelo chat.
- Não adicione `.env` ao Git.
- Não altere o `project_id` em `.openai/hosting.json`.
- Não remova tabelas do D1 nem objetos do R2 como efeito colateral.
- Nunca publique um Reel fora de uma autorização do usuário: o clique no botão
  autoriza o item manual, e ativar a fila autoriza os MP4 elegíveis enquanto ela
  permanecer ativa.
- Falhas de download ficam fora da produção principal, mas aparecem em uma
  área compacta com o erro e uma nova tentativa segura.
- Nunca aceite um evento do Direct sem assinatura HMAC válida; o primeiro
  evento autorizado confere o username e fixa o Instagram-scoped ID de
  `@nelmirjr` no D1.

## Entrada pelo Direct e alternativa gratuita

O webhook aceita os tipos de compartilhamento que a Meta pode enviar para um
post ou Reel (`share`, `media`, `video`, `ig_reel` e `reel`). Para `@nelmirjr`,
a autorização permanente já registrada prepara o MP4 sem outra resposta e o
Direct devolve um botão que abre o item exato no ReelVolt.

Para uso restrito às próprias contas, mantenha `@nelmirjr` e `@btsupply_` como
contas de teste/funções do aplicativo e conceda
`instagram_business_manage_messages`; isso evita depender de acesso avançado
destinado a usuários externos. Enquanto o aplicativo não estiver publicado e o
callback não estiver liberado pela Meta, o Direct não entrega eventos reais. A
alternativa gratuita é o Atalho privado do iPhone: ele envia a URL diretamente
ao ReelVolt e prepara o MP4. Com a fila desligada, cada item exige um clique;
com a fila ligada, os itens preparados entram automaticamente na programação.
