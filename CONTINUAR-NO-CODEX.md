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

## 3. Desenvolvimento e validação

```powershell
copy .env.example .env
npm run dev
npm run lint
npm test
git diff --check
git status
```

O ambiente local não recebe automaticamente os segredos hospedados. Recursos
da Meta e do resolvedor podem aparecer desconectados localmente.

## 4. Fluxo de entrega

1. Implemente e valide em um branch `codex/*`.
2. Preserve mudanças locais e arquivos não rastreados do usuário.
3. Faça push do estado exato validado.
4. Prepare uma versão candidata no projeto Sites existente.
5. Solicite autorização explícita antes de implantar em produção.
6. Solicite autorização separada antes de publicar cada Reel real.

## 5. Arquitetura atual

- O fluxo operacional publica somente no Instagram pela API oficial da Meta.
- O Direct do Instagram é uma entrada ativa: somente `@nelmirjr` pode enviar
  Reels para `@btsupply_`; a confirmação de direitos ocorre no Direct e a
  autorização final de publicação ocorre no ReelVolt.
- O D1 guarda estados, preferências e Insights.
- O R2 guarda vídeos e capas.
- O histórico do experimento do YouTube permanece preservado, mas suas rotas,
  interface e executor estão desativados.
- Notion e Telegram não fazem parte do fluxo.

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
