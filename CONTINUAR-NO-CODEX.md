# Continuar o ReelVolt em outra máquina

Este guia permite retomar o mesmo projeto em outro computador sem copiar
credenciais, vídeos ou arquivos manualmente.

## 1. Preparar a nova máquina

Instale:

- Git;
- GitHub CLI (`gh`);
- Node.js 22.13 ou superior;
- aplicativo Codex.

Entre no Codex com a mesma conta usada neste projeto e autentique o GitHub:

```powershell
gh auth login
gh auth status
```

## 2. Baixar o projeto

No terminal da nova máquina:

```powershell
gh repo clone Nelmir12/reelvolt-studio
cd reelvolt-studio
npm install
```

Não copie arquivos `.env`, tokens da Meta, Google, OpenAI ou chaves secretas. As credenciais de
produção ficam armazenadas no Sites e não são publicadas no GitHub.

## 3. Abrir no Codex

1. Abra o aplicativo Codex.
2. Selecione **Open folder** e escolha a pasta `reelvolt-studio`.
3. Se esta tarefa aparecer na barra lateral, abra-a e continue nela.
4. Se a tarefa não aparecer, inicie uma nova tarefa e envie:

> Continue o projeto ReelVolt Studio deste repositório. Leia README.md,
> CONTINUAR-NO-CODEX.md e .openai/hosting.json antes de alterar arquivos.
> Preserve o projeto Sites existente, o D1, o R2 e as credenciais hospedadas.
> Não recrie o site e não publique um Reel sem minha confirmação explícita.

O arquivo `.openai/hosting.json` contém o identificador do projeto Sites e faz
com que novas publicações continuem usando o mesmo endereço e os mesmos
recursos de armazenamento.

## 4. Trabalhar localmente

Para iniciar o ambiente de desenvolvimento:

```powershell
copy .env.example .env
npm run dev
```

O ambiente local não recebe automaticamente os segredos de produção. Recursos
que dependem da Meta, Google, GitHub Actions ou do resolvedor podem aparecer
desconectados localmente; isso não remove nem altera a configuração hospedada.

Antes de enviar mudanças:

```powershell
npm run lint
npm test
npm --prefix youtube-uploader run check
git diff --check
git status
```

## 5. Fluxo recomendado de mudanças

1. Explique ao Codex a alteração desejada.
2. Peça para implementar e validar localmente.
3. Revise o resumo da mudança.
4. Autorize explicitamente a publicação de uma nova versão.
5. Para uma publicação real no Instagram, confirme também o Reel específico.
6. Para o YouTube, autorize separadamente o Short privado de teste e, depois dos
   checks no Studio, a eventual liberação pública.

## 6. Integrações externas do YouTube

- Crie/prepare um projeto Google e um OAuth Client do tipo aplicação Web.
- Cadastre `/api/youtube/oauth/callback` no domínio do ReelVolt como redirect URI.
- Conclua a tela de consentimento e a auditoria da YouTube Data API fora do código.
- Configure no Sites as variáveis `YOUTUBE_*`, `GITHUB_*` e
  `OWNED_SOURCE_ACCOUNTS` descritas em `.env.example`.
- Cadastre o mesmo `YOUTUBE_WORKER_SECRET` nos segredos do GitHub Actions. Use
  um token fino, restrito a este repositório, para o Sites acionar o workflow.
- Confirme que o GitHub interromperá o uso ao esgotar a franquia gratuita. O
  workflow não possui agenda e só roda quando existe um Short na fila.
- Publique o workflow no branch padrão antes da versão do Sites. O canary deve ser um vídeo
  próprio, enviado e mantido privado durante toda a validação.

## 7. Segurança

- Nunca envie senhas, códigos de verificação ou tokens pelo chat.
- Nunca adicione `.env` ao Git.
- Não altere `project_id` em `.openai/hosting.json`.
- Não remova as tabelas do D1 nem os objetos do R2.
- Nunca copie o refresh token do YouTube para o GitHub.
- Mantenha o GitHub privado enquanto o projeto contiver regras operacionais
  internas.

## Endereços importantes

- Site: <https://reelvolt-studio.ahndias.chatgpt.site>
- Instagram: <https://www.instagram.com/btsupply_/>
- Meta Developers: <https://developers.facebook.com/apps/1531654185099586/>
- GitHub: <https://github.com/Nelmir12/reelvolt-studio>
