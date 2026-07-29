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

Não copie arquivos `.env`, tokens da Meta ou chaves secretas. As credenciais de
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
que dependem da Meta ou do resolvedor podem aparecer desconectados localmente;
isso não remove nem altera a configuração hospedada.

Antes de enviar mudanças:

```powershell
npm run build
node --test tests/rendered-html.test.mjs
git status
```

## 5. Fluxo recomendado de mudanças

1. Explique ao Codex a alteração desejada.
2. Peça para implementar e validar localmente.
3. Revise o resumo da mudança.
4. Autorize explicitamente a publicação de uma nova versão.
5. Para uma publicação real no Instagram, confirme também o Reel específico.

## 6. Segurança

- Nunca envie senhas, códigos de verificação ou tokens pelo chat.
- Nunca adicione `.env` ao Git.
- Não altere `project_id` em `.openai/hosting.json`.
- Não remova as tabelas do D1 nem os objetos do R2.
- Mantenha o GitHub privado enquanto o projeto contiver regras operacionais
  internas.

## Endereços importantes

- Site: <https://reelvolt-studio.ahndias.chatgpt.site>
- Instagram: <https://www.instagram.com/btsupply_/>
- Meta Developers: <https://developers.facebook.com/apps/1531654185099586/>
- GitHub: <https://github.com/Nelmir12/reelvolt-studio>
