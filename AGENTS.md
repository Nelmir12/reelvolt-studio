# Regras do projeto ReelVolt Studio

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
baixar os vídeos em MP4, gerenciar aprovação e distribuição multicanal e
consultar Insights da conta `@btsupply_` e do canal YouTube conectado.

O fluxo operacional atual é:

1. O usuário envia um link pelo ReelVolt no iPhone, pelo PWA ou pelo mecanismo
   de compartilhamento compatível.
2. O serviço valida o usuário, a URL e a confirmação dos direitos de uso.
3. O vídeo é obtido diretamente quando possível; uma instância privada ou
   licenciada do Cobalt pode ser usada como fallback.
4. O MP4 é armazenado no R2, enquanto estados, preferências, identificadores e
   métricas ficam no D1.
5. Reels destinados à publicação aguardam aprovação humana.
6. Após a aprovação, Instagram e YouTube mantêm estados independentes. O
   Instagram usa exclusivamente a API oficial da Meta.
7. Um GitHub Action autenticado e acionado somente quando há trabalho valida o
   mesmo MP4 e realiza upload retomável no YouTube sempre como privado.
8. Sem análise paga, conteúdo e metadados exigem revisão humana explícita. O
   Short somente pode ficar público após processamento, gates internos,
   auditoria da API e confirmação separada dos checks no YouTube Studio.
9. Insights oficiais de cada plataforma alimentam dashboards separados; alcance
   do Instagram nunca é somado às views do YouTube.

Notion, Telegram e Direct do Instagram não fazem parte do fluxo operacional
atual. Referências remanescentes a essas integrações devem ser tratadas como
legado, salvo se o usuário solicitar expressamente sua reativação.

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

## Segurança, direitos e uso aceitável

- Aceite somente vídeos próprios, licenciados ou autorizados pelo titular.
- Preserve a confirmação explícita de direitos no fluxo de entrada.
- Não contorne contas privadas, autenticação, bloqueios de acesso ou medidas de
  proteção do Instagram.
- Não automatize sites ou APIs cujos termos proíbam bots, scraping ou downloads
  automatizados. DownReels e ferramentas semelhantes não devem ser usados como
  backend sem uma autorização e uma licença compatíveis.
- Use as APIs oficiais da Meta e do YouTube para publicar e consultar Insights.
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
- clicar em aprovação, chamar uma rota de publicação ou publicar um Reel real;
- aprovar em nome do usuário um item que entrará na fila automática;
- contratar um serviço, ativar plano pago ou realizar ação que possa gerar
  cobrança;
- apagar, substituir ou recriar dados, tabelas, objetos R2, bindings, tokens,
  credenciais ou o projeto Sites de produção;
- executar migração destrutiva ou irreversível em produção;
- tornar público um recurso atualmente privado;
- reduzir ou remover qualquer trava desta seção.

A fila automática pode publicar no Instagram sem uma nova intervenção somente quando o Reel
já tiver sido aprovado explicitamente pelo usuário. A aprovação feita no painel
é autorização para aquele Reel; ela não autoriza outros itens. Uma autorização
para implantar o site também não autoriza publicar conteúdo no Instagram, e
vice-versa. A aprovação multicanal autoriza somente o upload privado no YouTube;
a mudança para público exige a confirmação separada dos checks daquele Short.

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

### Estado conhecido em 30 de julho de 2026

Na criação deste arquivo, a produção correspondia ao branch remoto
`origin/agent/metricas-paginacao`, enquanto o checkout local estava em `master`.
Também existia trabalho local não commitado de métricas por marcos em
`db/schema.ts` e em arquivos de migração Drizzle.

Esse registro é um alerta de continuidade, não uma verdade permanente.
Revalide-o antes de agir. Preserve e reconcilie esse trabalho; não o descarte e
não parta de `master` para mudanças de produção sem verificar qual baseline é a
mais recente.

## Padrões de implementação

- A aplicação usa TypeScript, React, Next/Vinext e runtime Cloudflare.
- D1 é a fonte persistente de estados e métricas; R2 armazena vídeos e capas.
- Mantenha os contratos entre interface, rotas, worker e banco consistentes.
- Preserve respostas JSON sem cache e com cabeçalhos de segurança nas APIs.
- Operações demoradas devem continuar compatíveis com `waitUntil` ou execução
  agendada; não bloqueie desnecessariamente a resposta HTTP.
- Falhas externas devem gerar estados recuperáveis e mensagens úteis, sem
  revelar segredos ou respostas sensíveis do provedor.
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
- O modo padrão é preparar o MP4 e aguardar aprovação; “somente baixar” deve
  continuar disponível.
- Não reintroduza publicação imediata sem aprovação humana.
- Preferências de legenda, capa e intervalo pertencem ao produto e não devem ser
  congeladas neste arquivo.
- Mudanças globais de preferências não devem alterar silenciosamente Reels já
  aprovados.
- Preserve informações claras de status, erro, agendamento e resultado da
  publicação.
- Exiba separadamente datas de recebimento/download e de publicação por
  plataforma. Resumos de hoje, ontem, 7 dias e 30 dias devem derivar de
  snapshots reais e indicar quando ainda não houver histórico suficiente.

## Validação e qualidade

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
contra as fontes de verdade são suficientes.

Se uma validação não puder ser executada, informe com precisão qual comando
faltou, por quê e qual risco permanece. Não declare que algo foi testado ou
publicado sem evidência.

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
