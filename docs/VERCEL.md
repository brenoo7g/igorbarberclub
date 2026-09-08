# Configuração na Vercel

A aplicação tem duas partes: a SPA React em `dist/` e a API Express. Publicar somente o build do Vite deixa `/api/*` sem servidor. Além disso, uma SPA precisa direcionar acessos diretos como `/agendar` para `index.html`.

`vercel.json` configura os dois casos: `/api/*` vai para `api/index.js`; páginas da interface vão para `index.html`. Imagens e JavaScript continuam no CDN. O esquema SQL é incluído explicitamente na função.

## Ativar o backend

1. Abra o projeto **igorbarberclub** na Vercel.
2. Em **Storage / Marketplace**, conecte um PostgreSQL gerenciado, por exemplo Neon, ou use um banco PostgreSQL que você já possui. Prefira a URL com pool indicada pelo provedor para funções serverless.
3. Em **Settings → Environment Variables**, configure para **Production**:

| Variável         | Valor                                                                      |
| ---------------- | -------------------------------------------------------------------------- |
| `DATABASE_URL`   | URL PostgreSQL fornecida pelo banco. `POSTGRES_URL` também é aceito.       |
| `JWT_SECRET`     | Segredo aleatório com pelo menos 32 caracteres.                            |
| `APP_URL`        | `https://igorbarberclub.vercel.app`                                        |
| `ADMIN_EMAIL`    | E-mail que você usará para administrar a barbearia.                        |
| `ADMIN_PASSWORD` | Senha própria com pelo menos 12 caracteres; cria o primeiro administrador. |
| `DEMO_MODE`      | `false`                                                                    |

Gere o segredo JWT localmente:

```sh
node -e "console.log(require('crypto').randomBytes(48).toString('hex'))"
```

Cole o resultado somente na variável privada da Vercel. Nunca use prefixo `VITE_` para URL do banco, senhas ou segredo JWT. `.env.example` é apenas um modelo; não configura sozinho o ambiente publicado.

4. Use Node.js **24.x**, preset **Vite**, build `npm run build` e saída `dist`.
5. Em **Deployments**, faça **Redeploy** depois de salvar as variáveis. Um novo push também dispara a publicação quando a integração com GitHub estiver ativa.

`APP_URL` também pode ser inferida de `VERCEL_PROJECT_PRODUCTION_URL` ou `VERCEL_URL`. Previews precisam das mesmas configurações em **Preview**, preferencialmente com outro banco. A origem exata do preview atual é aceita nas requisições da SPA.

## Verificar

- `/api/health` deve retornar JSON com `ok: true` e `database: "postgres"`.
- `/api/services` deve retornar a lista de serviços em JSON.
- Acesse `/agendar` diretamente e recarregue a página.
- Acesse `/admin` com a conta configurada. Contas e clientes demo não são criados na Vercel.

Se `/api/health` responder **503** e `code: "SERVER_NOT_CONFIGURED"`, o campo `missing` lista os nomes das variáveis ausentes ou inválidas, sem revelar valores. `SERVER_UNAVAILABLE` indica erro de inicialização/conexão; consulte os logs da função. A interface mostra uma mensagem simples e permite tentar novamente.

Tabelas e catálogo inicial são criados na primeira chamada válida. Transações e locks PostgreSQL protegem a inicialização concorrente. O administrador é criado somente se ainda não existir; alterar `ADMIN_PASSWORD` depois não redefine senhas existentes.

## Persistência e notificações

O SQLite em `data/barber.db` continua disponível para execução local. Ele não é enviado ao GitHub e não é usado pela função Vercel. `/tmp` não é um local persistente para contas e reservas; essa configuração é rejeitada.

O servidor local processa notificações a cada 15 segundos. Na Vercel, respostas bem-sucedidas da API podem processar lotes de até dois eventos com `waitUntil`, dentro da duração da função. Sem tráfego, novas tentativas aguardam a próxima chamada. Para garantir novas tentativas mesmo sem acessos, use um worker ou agendador externo monitorado. Credenciais Resend/Twilio são opcionais e não são necessárias para a reserva funcionar.

Referências oficiais: [Vite](https://vercel.com/docs/frameworks/frontend/vite), [rewrites](https://vercel.com/docs/routing/rewrites), [SQLite](https://vercel.com/kb/guide/is-sqlite-supported-in-vercel), [waitUntil e pool](https://vercel.com/docs/functions/functions-api-reference/vercel-functions-package).
