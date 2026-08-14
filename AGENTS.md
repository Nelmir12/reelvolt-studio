# Regras do projeto ReelVolt Studio

## Leitura rápida para uma nova sessão

Antes de planejar ou editar:

1. Execute `git status --short --branch`, confirme o branch e rode
   `git log --oneline --decorate -8`.
2. Leia este arquivo, `README.md`, `CONTINUAR-NO-CODEX.md` e
   `.openai/hosting.json`.
3. Compare o código atual, `origin/master` e a versão realmente publicada no
   Sites quando a tarefa depender de produção. Um deles pode estar à frente dos
   demais.
4. Preserve arquivos modificados ou não rastreados que já estavam no diretório.
5. Para trabalho complexo, apresente um plano curto antes de editar.

O repositório exige Node.js `>=22.13.0`. Os comandos de verificação oficiais
são `npm run lint`, `npm test` e `git diff --check`. Não existe atualmente um
script separado de formatação ou de verificação de tipos; não afirme que um
deles foi executado.

## Escopo e autoridade

Este arquivo se aplica a todo o repositório. Leia-o antes de investigar, planejar
ou alterar o projeto.

- A solicitação atual e explícita do usuário tem prioridade sobre este arquivo.
- Trate este documento como uma fonte viva de regras, não como um retrato rígido
  de uma versão antiga.
- Fatos técnicos, comandos e referências de arquitetura podem ser atualizados
  quando o projeto evoluir.
- Travas de segurança, exigências de aprovação e limites de atuação só podem ser
  reduzidos ou removidos com autorização explícita do usuário.
- Não transforme decisões temporárias, números de versão ou experimentos em
  regras permanentes sem necessidade.

## Objetivo e arquitetura oficial

O ReelVolt Studio é uma PWA privada para receber links de Reels autorizados,
baixar os vídeos em MP4, gerenciar publicação manual ou automática no Instagram e
consultar Insights da conta `@btsupply_`.

O fluxo operacional atual é:

1. O usuário envia um link pelo ReelVolt no iPhone/PWA, pelo Atalho privado do
   iPhone ou compartilha um Reel de `@nelmirjr` para o Direct de `@btsupply_`.
2. O serviço valida o usuário, a URL e a origem autenticada. No Direct, valida
   também a assinatura do webhook e aceita somente o Instagram-scoped ID
   vinculado ao username `@nelmirjr`.
3. O vídeo é obtido diretamente quando possível; uma instância privada ou
   licenciada do Cobalt pode ser usada como fallback. Se o IP do provedor
   principal for recusado, um workflow autenticado e isolado do GitHub Actions
   pode executar a mesma resolução e devolver o MP4 ao registro original.
   Quando o Instagram não fornecer o MP4 por nenhum caminho automático, o
   mesmo registro aceita um upload manual sem alterar métricas ou aprovações.
4. O MP4 é armazenado no R2, enquanto estados, preferências, identificadores e
   métricas ficam no D1.
5. Com a fila desligada, um único clique no item pronto autoriza sua publicação.
   Com a fila ligada, salvar a configuração autoriza todos os MP4 elegíveis já
   prontos e os próximos preparados, que são agendados em sequência no intervalo
   escolhido. No fluxo do Direct, o botão abre o item exato no ReelVolt.
6. O Instagram usa exclusivamente a API oficial da Meta para publicar.
7. Insights oficiais do Instagram alimentam o dashboard e o histórico.

O experimento de publicação no YouTube foi retirado. Preserve suas tabelas,
credenciais e registros históricos, mas não exponha opções, rotas operacionais,
executores ou métricas do YouTube sem uma nova solicitação explícita do usuário.

Notion e Telegram não fazem parte do fluxo operacional atual. O Direct do
Instagram foi reativado exclusivamente como entrada autenticada para
`@nelmirjr`; ele não altera o modo manual ou automático escolhido no ReelVolt.

Em 10 de agosto de 2026, o usuário concedeu autorização permanente para
baixar, editar e preparar todo conteúdo enviado por ele pelos canais privados
autenticados do ReelVolt. Em 14 de agosto de 2026, também autorizou a remoção
das confirmações repetidas de publicação: o clique manual autoriza um item e a
ativação da fila autoriza todos os itens elegíveis enquanto estiver ativa. O
Direct ainda depende da publicação do aplicativo e da liberação do webhook
pela Meta; até isso ocorrer, use o Atalho privado do iPhone.

## Fontes de verdade

Antes de alterar o projeto, confronte:

- este `AGENTS.md`;
- `README.md`;
- `CONTINUAR-NO-CODEX.md`;
- `.openai/hosting.json`;
- o código e as migrações atuais;
- o estado do Git e a versão realmente publicada no Sites.

Quando essas fontes divergirem, investigue o estado efetivo e atualize a
documentação junto com a mudança. Não assuma que `master`, o README ou um
documento histórico representam automaticamente a produção.

O arquivo `.openai/hosting.json` identifica o projeto Sites existente. Reutilize
sempre esse projeto e os bindings `DB` e `VIDEOS`; não crie outro site, outro D1
ou outro bucket R2 por conveniência.

### Mapa do repositório

| Caminho | Responsabilidade |
| --- | --- |
| `app/` | Interface React/Next, autenticação e dashboard. |
| `worker/index.ts` | APIs, webhook, D1/R2, fila, publicação e Insights. |
| `worker/instagram-embed.ts` | Extração limitada de mídia pública do embed. |
| `worker/youtube.ts` | Compatibilidade histórica com o experimento retirado; não reative. |
| `db/schema.ts` | Schema Drizzle de referência. |
| `drizzle/` | Migrações SQL e metadados versionados. |
| `tests/rendered-html.test.mjs` | Build e testes de renderização/contratos estáticos. |
| `.github/workflows/reel-downloader.yml` | Fallback isolado de download acionado por `workflow_dispatch`. |
| `build/sites-vite-plugin.ts` | Empacota a configuração Sites e as migrações no build. |
| `.openai/hosting.json` | Identidade do projeto Sites e bindings persistentes. |
| `.env.example` | Catálogo sem segredos das variáveis esperadas. |
| `public/` | Manifesto, service worker, ícones, capas e outros assets estáticos. |

### Arquivos gerados, locais e sensíveis

- Não edite `node_modules/`, `dist/`, `.vinext/` ou `.wrangler/`; são artefatos
  locais ignorados pelo Git.
- `drizzle/meta/*.json` e novas migrações em `drizzle/*.sql` são gerados por
  `npm run db:generate`. Não ajuste snapshots manualmente e nunca reescreva uma
  migração já aplicada.
- `.env*` é ignorado e pode conter segredos. Use `.env.example` apenas como
  referência e nunca copie valores hospedados para documentação, logs ou Git.
- Diretórios locais não rastreados como `.agents/`, `.codex/`, `plugins/` e
  `.codex-doc-review/` podem pertencer ao usuário ou ao ambiente. Não os inclua,
  remova ou reorganize sem uma solicitação explícita.
- `public/reel-cover.jpg` e os demais arquivos de marca são assets do produto,
  não artefatos descartáveis de build.

### Convenção de versões

- Comunique versões do produto no padrão `1.N`, em que `N` é o número sequencial
  atribuído pelo Sites: a versão interna `15` corresponde a **ReelVolt 1.15** e
  a versão interna `16` corresponde a **ReelVolt 1.16**.
- Preserve os números e identificadores internos do Sites, pois eles não são
  rótulos editáveis e são necessários para implantação e rollback.
- Em autorizações, relatórios e documentação, informe o nome público e, quando
  houver risco de ambiguidade operacional, também o número interno do Sites.

## Segurança, direitos e uso aceitável

- Aceite somente vídeos próprios, licenciados ou autorizados pelo titular.
- Preserve o registro da autorização permanente nos canais privados e o modo
  de autorização escolhido: clique manual no item ou fila automática ativa.
- Não contorne contas privadas, autenticação, bloqueios de acesso ou medidas de
  proteção do Instagram.
- Não automatize sites ou APIs cujos termos proíbam bots, scraping ou downloads
  automatizados. DownReels e ferramentas semelhantes não devem ser usados como
  backend sem uma autorização e uma licença compatíveis.
- Use a API oficial da Meta para publicar e consultar Insights.
- Solicite apenas as permissões mínimas necessárias da Meta.
- Nunca coloque senhas, tokens, códigos de verificação, chaves ou valores de
  `.env` em código, logs, commits, capturas ou mensagens.
- Nunca peça ao usuário para enviar credenciais pelo chat. Logins, senhas,
  códigos e confirmações de identidade devem ser concluídos pelo próprio usuário
  na interface do provedor.
- Links temporariamente públicos para a Meta devem continuar assinados, ter
  validade limitada e expor somente o objeto necessário.
- Não enfraqueça autenticação, validação de origem, autorização administrativa,
  criptografia de token ou proteção de downloads para acelerar uma entrega.

## Autonomia e aprovações obrigatórias

O agente pode, sem confirmação adicional:

- inspecionar código, Git, produção e documentação;
- implementar e refatorar dentro do escopo solicitado;
- executar builds, testes, lint e validações;
- gerar migrações progressivas;
- criar branches e commits focados;
- enviar branches ao GitHub depois das validações;
- preparar e salvar uma versão candidata sem ativá-la em produção;
- atualizar fatos técnicos e comandos deste arquivo.

É obrigatória uma autorização explícita do usuário antes de:

- implantar ou promover uma versão no endereço de produção;
- clicar no botão de publicação, ativar a fila, chamar uma rota de publicação
  ou publicar um Reel real em nome do usuário;
- contratar um serviço, ativar plano pago ou realizar ação que possa gerar
  cobrança;
- apagar, substituir ou recriar dados, tabelas, objetos R2, bindings, tokens,
  credenciais ou o projeto Sites de produção;
- executar migração destrutiva ou irreversível em produção;
- tornar público um recurso atualmente privado;
- reduzir ou remover qualquer trava desta seção.

A fila automática pode publicar no Instagram sem nova intervenção porque sua
ativação pelo usuário é autorização explícita para todos os MP4 elegíveis já
prontos e os próximos preparados enquanto ela permanecer ativa. Com a fila
desligada, o clique no item autoriza somente aquele Reel. Uma autorização para
implantar o site não autoriza conteúdo nem ativa a fila, e vice-versa. Não
reative uploads multicanal enquanto o experimento do YouTube estiver retirado.

## Git e preservação do trabalho

Antes de trabalhar:

1. Execute `git status`.
2. Confirme o branch atual, os remotes e os commits relevantes.
3. Compare com o branch/commit publicado quando a mudança depender da produção.
4. Identifique arquivos alterados por outras tarefas ou pelo usuário.

Regras obrigatórias:

- Preserve toda alteração local preexistente, inclusive arquivos não
  rastreados.
- Nunca use `git reset --hard`, descarte forçado, force-push ou comandos
  equivalentes sem uma solicitação explícita e específica.
- Não restaure, mova, formate ou inclua em commits arquivos alheios ao escopo.
- Use branches `codex/*` para novos trabalhos, salvo instrução diferente do
  usuário ou necessidade comprovada de continuar um branch existente.
- Faça commits pequenos, coerentes e descritivos.
- Antes do push, revise o diff e confirme que apenas mudanças intencionais estão
  staged.
- Não misture reconciliação de branches, migrações antigas e uma funcionalidade
  nova no mesmo commit sem explicar e validar essa necessidade.

## Padrões de implementação

- A aplicação usa TypeScript, React, Next/Vinext e runtime Cloudflare.
- D1 é a fonte persistente de estados e métricas; R2 armazena vídeos e capas.
- Mantenha os contratos entre interface, rotas, worker e banco consistentes.
- Preserve respostas JSON sem cache e com cabeçalhos de segurança nas APIs.
- Operações demoradas devem continuar compatíveis com `waitUntil` ou execução
  agendada; não bloqueie desnecessariamente a resposta HTTP.
- Falhas externas devem gerar estados recuperáveis e mensagens úteis, sem
  revelar segredos ou respostas sensíveis do provedor.
- Downloads com falha não ocupam a lista principal, mas devem permanecer
  visíveis em uma área compacta de recuperação com erro e nova tentativa.
- Downloads e publicações devem ser idempotentes sempre que possível. Preserve
  a detecção de duplicatas e impeça publicações duplicadas.
- Não invente métricas indisponíveis. Mostre indisponibilidade ou erro de
  permissão quando a Meta não fornecer um dado.
- Diferencie claramente constatações oficiais da Meta de hipóteses sobre alcance
  e algoritmo.

### Banco e migrações

- Alterações de schema devem manter sincronizados `db/schema.ts`, o SQL de
  inicialização/compatibilidade do worker e as migrações Drizzle aplicáveis.
- Migrações devem ser progressivas, revisáveis e compatíveis com dados
  existentes.
- Não edite uma migração já aplicada em produção para mudar seu significado;
  crie uma nova migração.
- Antes de qualquer mudança produtiva, confirme bindings, ordem das migrações,
  compatibilidade retroativa e estratégia de recuperação.
- Nunca apague tabelas, colunas ou objetos de produção como efeito colateral de
  uma correção.

### Produto e interface

- A interface deve ser responsiva, acessível e priorizar português do Brasil.
- O uso principal no iPhone deve permanecer simples e instalável como PWA.
- O modo padrão é preparar o MP4 para publicação; “somente baixar” deve
  continuar disponível.
- Não publique sem o clique manual do usuário ou sem a fila automática ativa.
- Preferências de legenda, capa e intervalo pertencem ao produto e não devem ser
  congeladas neste arquivo.
- Alterações de legenda, capa ou intervalo não devem modificar silenciosamente
  Reels já programados ou publicados.
- Preserve informações claras de status, erro, agendamento e resultado da
  publicação.
- Exiba separadamente datas de recebimento/download e de publicação no
  Instagram. Resumos de hoje, ontem, 7 dias e 30 dias devem derivar de
  snapshots reais e indicar quando ainda não houver histórico suficiente.
- Na Produção, use linguagem de usuário final e mostre claramente o estado do
  Instagram.
- Em telas mobile, mantenha uma ação principal por próximo passo, sem exigir
  zoom ou rolagem horizontal.

## Validação e qualidade

### Comandos confirmados no repositório

| Objetivo | Comando | Observação |
| --- | --- | --- |
| Instalar dependências | `npm install` | Usa o `package-lock.json` versionado. |
| Desenvolvimento local | `npm run dev` | Inicia o Vinext/Vite com bindings locais do Cloudflare. |
| Build | `npm run build` | Gera `dist/` e empacota `.openai/hosting.json` e `drizzle/`. |
| Servir o build | `npm run start` | Executa `vinext start`. |
| Lint | `npm run lint` | Ignora os artefatos configurados. |
| Testes | `npm test` | Executa o build e depois `node --test tests/rendered-html.test.mjs`. |
| Gerar migração | `npm run db:generate` | Atualiza SQL e metadados Drizzle; revise tudo antes de commitar. |
| Integridade do diff | `git diff --check` | Detecta whitespace inválido e marcadores de conflito. |

Não há scripts `format` ou `typecheck` no `package.json`. O `tsconfig.json` usa
`strict` e `noEmit`, e o build participa da validação do TypeScript, mas isso não
deve ser descrito como um typecheck isolado.

No Windows, se a política do PowerShell bloquear `npm.ps1`, execute o mesmo
comando com `npm.cmd` (por exemplo, `npm.cmd test`). Não altere a política de
execução da máquina apenas para contornar esse bloqueio.

Para mudanças de código, execute antes do push:

```powershell
npm run lint
npm test
git diff --check
```

`npm test` já inclui o build e os testes de renderização configurados no
projeto. Adicione ou atualize testes quando alterar comportamento, rotas,
autenticação, banco, fila, publicação ou métricas.

Para mudanças exclusivamente documentais, `git diff --check` e uma revisão
contra as fontes de verdade são o mínimo. Rode `npm run lint` e `npm test` se a
documentação alterar comandos, estrutura esperada ou contratos verificados nos
testes.

Se uma validação não puder ser executada, informe com precisão qual comando
faltou, por quê e qual risco permanece. Não declare que algo foi testado ou
publicado sem evidência.

### Feito quando

Uma tarefa só está concluída quando:

- o resultado pedido foi implementado sem mudanças fora do escopo;
- contratos afetados entre interface, worker, D1, R2 e provedores permanecem
  coerentes;
- testes foram adicionados ou atualizados quando o comportamento mudou;
- `npm run lint`, `npm test` e `git diff --check` passaram, ou cada verificação
  não executada foi registrada com motivo e risco;
- o diff foi revisado e contém apenas arquivos intencionais;
- documentação e `.env.example` foram atualizados quando arquitetura, comandos,
  variáveis ou integrações mudaram;
- o estado foi comunicado separando alteração local, commit, push, versão
  candidata, implantação e ações externas reais;
- para produção, a versão candidata corresponde exatamente ao commit enviado e
  só foi implantada após autorização explícita.

### Problemas e desconhecidos que exigem confirmação

- A aplicação não possui um script explícito para aplicar migrações localmente
  ou diretamente em produção. O build empacota `drizzle/` e o worker mantém SQL
  de compatibilidade em `ensureDatabase`; confirme o fluxo do Sites antes de
  qualquer mudança de schema.
- Não há formatter configurado nem comando de typecheck independente.
- Em 14 de agosto de 2026 foi relatado que a fila automática atribuiu o mesmo
  horário a vários Reels, desrespeitou o intervalo configurado e inverteu a
  ordem entre itens antigos e novos. Isso permanece uma falha funcional aberta:
  não considere a fila validada, não publique Reels como teste e investigue
  concorrência, ordenação FIFO e reagendamento em uma tarefa de código própria.

## Hospedagem e produção

- Quando `.openai/hosting.json` existir, use o fluxo do Sites e o `project_id`
  presente nele.
- Nunca chame a criação de site para este projeto existente.
- Preserve os bindings `DB` e `VIDEOS` e as variáveis hospedadas.
- Faça push do estado exato do código antes de salvar uma versão candidata.
- Salve versões a partir do commit correspondente ao código validado.
- Somente implante uma versão salva após autorização explícita do usuário.
- Após uma implantação autorizada, acompanhe o status até o estado terminal e
  valide o comportamento essencial no endereço de produção.
- Não publique um Reel como teste de implantação.

## Comunicação e evolução

- Trabalhe de forma autônoma e peça intervenção apenas quando houver login,
  aprovação sensível, risco material ou decisão que mude o produto.
- Explique decisões, limitações e riscos em linguagem direta.
- Separe claramente: alteração local, push no GitHub, versão salva, implantação
  em produção e publicação no Instagram.
- Atualize este arquivo quando arquitetura, comandos ou integrações mudarem.
- Peça autorização antes de alterar as fronteiras de autonomia e aprovação.
