# Continuar o ReelVolt em outra máquina

Este guia permite retomar o projeto sem copiar credenciais, vídeos ou arquivos
manualmente.

## 1. Preparar a máquina

Instale Git, GitHub CLI, Node.js 22.13 ou superior e o aplicativo Codex. Depois:

```powershell
gh auth login
gh repo clone Nelmir12/reelvolt-studio
cd reelvolt-studio
npm install
```

Não copie arquivos `.env` ou tokens. As credenciais de produção ficam
armazenadas no Sites.

## 2. Retomar no Codex

Abra a pasta do repositório e solicite:

> Continue o ReelVolt Studio. Leia AGENTS.md, README.md,
> CONTINUAR-NO-CODEX.md e .openai/hosting.json. Preserve o projeto Sites, o D1,
> o R2 e as credenciais. O fluxo operacional é exclusivamente Instagram; não
> reative o YouTube sem uma nova solicitação explícita.

Antes de alterar qualquer arquivo, peça ao Codex para executar:

```powershell
git status --short --branch
git remote -v
git log --oneline --decorate -8
```

O `master`, o checkout local e a versão publicada no Sites podem divergir. A
sessão deve confirmar a baseline efetiva e preservar qualquer modificação ou
arquivo não rastreado que já esteja na pasta.

## 3. Desenvolvimento e validação

```powershell
Copy-Item .env.example .env
npm run dev
npm run lint
npm test
git diff --check
git status
```

O ambiente local não recebe automaticamente os segredos hospedados. Recursos
da Meta e do resolvedor podem aparecer desconectados localmente.

Comandos adicionais confirmados: `npm run build`, `npm run start` e
`npm run db:generate`. Não existem scripts dedicados `format` ou `typecheck`.
Não edite artefatos locais (`node_modules/`, `dist/`, `.vinext/`, `.wrangler/`)
nem snapshots `drizzle/meta/*.json` manualmente.
Se o PowerShell bloquear `npm.ps1`, use o executável `npm.cmd` nos mesmos
comandos sem alterar a política de execução do Windows.

## 4. Fluxo de entrega

1. Implemente e valide em um branch `codex/*`.
2. Preserve mudanças locais e arquivos não rastreados do usuário.
3. Faça push do estado exato validado.
4. Prepare uma versão candidata no projeto Sites existente.
5. Solicite autorização explícita antes de implantar em produção.
6. Não clique em publicação nem ative a fila em nome do usuário. O clique manual
   autoriza um Reel; salvar a fila ativa autoriza todos os MP4 elegíveis enquanto
   ela permanecer ativa.

Uma entrega está pronta quando o diff contém apenas os arquivos esperados, as
verificações aplicáveis passaram (ou o bloqueador e o risco foram registrados),
a documentação acompanha mudanças de arquitetura/configuração e qualquer
versão candidata aponta para o mesmo commit enviado ao GitHub.

## 5. Arquitetura atual

- O fluxo operacional publica somente no Instagram pela API oficial da Meta.
- A autorização permanente de direitos vale para entradas privadas do painel,
  do Atalho do iPhone e do Direct autenticado de `@nelmirjr`. Com a fila
  desligada, a publicação é autorizada por um único clique no item; com a fila
  ligada, todos os MP4 prontos e futuros entram automaticamente na programação.
- O Direct depende de o aplicativo e o webhook serem liberados pela Meta. Até
  isso ocorrer, o Atalho privado do iPhone é a entrada automática recomendada.
- O D1 guarda estados, preferências e Insights.
- O R2 guarda vídeos e capas.
- Itens cujo download automático falhar aceitam um MP4 de até 90 MB no próprio
  registro, sem duplicar o Reel nem alterar métricas existentes.
- Quando o IP fixo do resolvedor principal é recusado pelo Instagram, o
  workflow privado `reel-downloader.yml` executa o mesmo Cobalt em um runner
  isolado e devolve o MP4 ao callback autenticado do ReelVolt. Recusas
  recuperáveis são informadas ao ReelVolt sem marcar o workflow como falho;
  erros reais de infraestrutura continuam falhando e gerando alerta.
- O histórico do experimento do YouTube permanece preservado, mas suas rotas,
  interface e executor estão desativados.
- Notion e Telegram não fazem parte do fluxo.

## Pendências conhecidas

- A fila automática apresentou em 14 de agosto de 2026 horários duplicados,
  intervalo diferente do configurado e inversão entre Reels antigos e novos.
  Trate a correção como uma tarefa funcional separada, com testes de concorrência,
  FIFO, inclusão e exclusão; não publique conteúdo real para testar.
- Não há um comando explícito no repositório para aplicar migrações manualmente.
  O build empacota `drizzle/` e o worker aplica compatibilidade em
  `ensureDatabase`; confirme o procedimento do Sites antes de mudar o schema.
- O workflow do GitHub é um executor alternativo de download, não uma pipeline
  geral de lint e testes.

## 6. Segurança

- Nunca envie senhas, códigos ou tokens pelo chat.
- Nunca adicione `.env` ao Git.
- Não altere o `project_id` em `.openai/hosting.json`.
- Não apague tabelas do D1, objetos R2 ou credenciais hospedadas.
- Não reative integrações retiradas sem autorização explícita.

## Endereços importantes

- Site: <https://reelvolt-studio.ahndias.chatgpt.site>
- Instagram: <https://www.instagram.com/btsupply_/>
- Meta Developers: <https://developers.facebook.com/apps/1531654185099586/>
- GitHub: <https://github.com/Nelmir12/reelvolt-studio>
