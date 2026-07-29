# BT Supply Reel Inbox

Caixa de entrada privada e instalável para receber links de Reels, baixar o MP4,
armazenar o arquivo e registrar o andamento no Notion. A publicação permanece
manual.

## Fluxo

1. No Android, o usuário instala o site como aplicativo e compartilha um Reel
   diretamente para **Reel Inbox**. Em outros aparelhos, copia e cola o link.
2. O site exige autenticação com ChatGPT e permite somente e-mails autorizados.
3. O usuário informa a conta de origem, observações e confirma os direitos de uso.
4. Links repetidos são identificados antes do download.
5. O serviço tenta localizar o MP4 público do Reel.
6. O arquivo é armazenado no R2 e os metadados ficam no D1.
7. O registro correspondente é criado e atualizado no Notion.

Use somente vídeos próprios, licenciados ou autorizados pelo titular.

## Configuração

As variáveis estão documentadas em `.env.example`:

- `ADMIN_TOKEN`: protege diagnósticos e testes administrativos.
- `PUBLIC_BASE_URL`: endereço público do serviço.
- `INBOX_ALLOWED_EMAILS`: e-mails do ChatGPT autorizados, separados por vírgula.
- `NOTION_TOKEN`: token da integração interna do Notion.
- `NOTION_DATABASE_ID`: ID do banco **BT Supply — Reel Inbox**.
- `REEL_RESOLVER_URL` e `REEL_RESOLVER_TOKEN`: fallback opcional e licenciado
  quando o Instagram não disponibilizar o arquivo publicamente.

## Banco do Notion

| Propriedade | Tipo |
| --- | --- |
| Nome | Título |
| URL | URL |
| Status | Seleção |
| Regras | Texto |
| Origem | Seleção |
| ID | Número |
| MP4 | URL |
| Erro | Texto |
| Conta de origem | Texto |
| Direitos confirmados | Checkbox |

`Origem` usa o valor `Web`. Os status são `Na fila`, `Baixando`, `Pronto` e
`Falhou`.

## Rotas

- `GET /`: caixa de entrada autenticada.
- `POST /api/reels/intake`: recebe um Reel pela interface.
- `GET /api/reels`: lista os últimos registros.
- `GET /api/inbox/status`: mostra o estado das integrações para o usuário.
- `GET /download/:token`: entrega o MP4 por um link secreto registrado no Notion.
- `GET /api/integrations/status`: diagnóstico administrativo.
- `POST /api/reels/manual`: teste administrativo.
- `GET /api/reels/:id/download`: download administrativo.

## Desenvolvimento local

```bash
copy .env.example .env
npm install
npm run dev
```

## Limitação do download

O canal de entrada não altera as restrições técnicas do Instagram. O serviço
tenta primeiro o vídeo exposto publicamente e aceita um resolvedor externo
próprio ou licenciado como fallback. Sites que proíbem bots, scripts ou acesso
automatizado não devem ser usados como resolvedores.
