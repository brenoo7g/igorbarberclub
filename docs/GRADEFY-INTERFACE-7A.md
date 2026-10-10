# Gradefy — interface 7A

Interface de gestão em `/app`, separada do Barber Classic e do futuro Super Admin. Não cria empresa, membership, plano, trial ou cobrança. Migrations 001–008 permanecem intactas.

## Telas e execução local

Execute `npm run dev:test-access` e abra `http://localhost:5173/app`. Esse comando usa SQLite em memória e desativa os provedores de envio; os cadastros de teste desaparecem ao encerrar o servidor. A recuperação exibe indisponibilidade nesse modo; a entrega e o consumo do token são testados com provedor simulado.

| URL                            | Tela                                              |
| ------------------------------ | ------------------------------------------------- |
| `/app`                         | Boas-vindas                                       |
| `/app/login`                   | Login                                             |
| `/app/cadastro`                | Cadastro global                                   |
| `/app/conta`                   | Conta autenticada, com ou sem vínculos existentes |
| `/app/esqueci-senha`           | Solicitação de recuperação                        |
| `/app/redefinir-senha#token=…` | Nova senha, usando o token existente              |
| `/app/*` desconhecida          | Página não encontrada com retorno ao início       |

`/`, `/agendar`, `/minha-conta`, `/admin`, slugs e `/preview/barber-classic` continuam usando o Barber Classic. `/app` é namespace reservado da gestão: o cadastro de empresas na fase seguinte deverá impedir esse slug, além dos demais caminhos reservados existentes.

## Reutilização e identidade

- `src/gradefy/tokens.ts`: cores oficiais, tipografia, raios e espaçamento, sem dependência de DOM ou React Native.
- `src/gradefy/forms.ts`: validações independentes de componentes, incluindo confirmação e limite UTF-8 de 72 bytes.
- `components.tsx`: Button, ButtonLink, Input com senha visível/oculta, Card, Feedback, Loading e GradefyLogo. Rótulos, descrição de erros, foco, contraste, regiões de feedback e redução de movimento.
- `styles.css`: estilos restritos a `.gf-app`; fontes locais Sora e Inter. Não substitui tokens do Barber Classic.
- Símbolo e wordmark são extraídos da referência oficial `docs/brand/gradefy-brand-guide.png.png`, sem desenhar uma marca nova. As referências de dashboard e landing foram usadas como direção visual, sem implementar esses produtos.
- Fontes variáveis obtidas do repositório oficial `google/fonts`, com licenças OFL incluídas. Nenhuma nova dependência npm.

O `app-mobile` atual é Expo/React Native e continua sendo o aplicativo independente da Igor. Não foi modificado. A interface web mobile-first fornece a primeira experiência de gestão; tokens, regras, endpoints e assets podem ser compartilhados com futuros adaptadores nativos. Os componentes DOM não são apresentados como componentes nativos: a camada de apresentação Android/iOS será adaptada separadamente, reutilizando contratos e regras.

## Autenticação existente

- `POST /api/auth/login`: sem alteração. Mesmos bcrypt, JWT HS256, issuer, audience, versão de sessão, cookie `session`, duração, HttpOnly, SameSite, Secure em produção e proteções de origem/rate limit.
- `POST /api/auth/register`: opção explícita `scope: 'gradefy'`, com nome, e-mail, senha e confirmação. Payload estrito impede injeção de role/company. Cria apenas `users`, com role global `client` compatível com o legado. O telefone não coletado fica `''` na coluna legada NOT NULL; não é inventado. Sem `scope`, mantém telefone e sobrenome obrigatórios.
- `GET /api/auth/me?scope=gradefy`: lê a mesma sessão global, sem exigir que Igor esteja ativa e sem consultar visitantes.
- `POST /api/auth/logout?scope=gradefy`: limpa o mesmo cookie global. Sessões anônimas de agendamento são independentes e não representam acesso à gestão.
- `GET /api/companies`: endpoint existente, limitado aos vínculos ativos do usuário. Ausência de vínculos é estado válido; jamais assume Igor.
- `AppProvider` é reutilizado com API própria e sem buscar configuração da barbearia. Mantém BroadcastChannel, proteção contra respostas antigas, foco, expiração e logout.
- Recuperação reutiliza `forgot-password`/`reset-password`, fila, throttling, HMAC, token de uso único e revogação de sessões. `scope: 'gradefy'` é opção fechada de apresentação: o ID do job recebe prefixo `gradefy-` para persistir a marca e o caminho fixo `/app/redefinir-senha`. Não aceita URL de retorno e não muda schema, formato do token ou IDs antigos. Avisos de alteração preservam esse prefixo. Pedidos legados conservam textos e URLs da Igor.

## Validação

Testes específicos: cadastro válido/inválido, normalização, duplicação, injeção de privilégios, preservação do contrato JWT/cookie, seed posterior sem atribuir vínculo ou trial, acesso negado à gestão Igor, sessão expirada, logout/origem, Igor suspensa sem bloquear a sessão global e recuperação com marca/link confiáveis e token de uso único.

E2E: telas em 320/390/768/1440 px, navegação, login incorreto/correto, senha visível, validações, cadastro com sucesso, usuário sem empresa, e-mail duplicado, sessão existente, reload, logout, expiração, página desconhecida, recuperação indisponível/link inválido/sucesso e regressão da Igor. O caso visual de sucesso da recuperação simula a resposta; consumo real do token e revogação são cobertos nos testes de API.

Resultados da rodada final:

- Específicos de API/autenticação/recuperação: 10 passaram.
- Backend/SQLite (`npm test`): 110 passaram.
- PostgreSQL 17.11 local descartável (`tests/postgres/run-local.mjs`): 63 passaram; cluster encerrado e removido, `productionAccess: false`.
- E2E específicos Gradefy: 6 passaram; rodada completa Playwright: 27 passaram.
- Mobile: 5 passaram; TypeScript mobile passou, sem modificações no aplicativo.
- `npm run build` (TypeScript, verificação de agenda e Vite), `npm run format:check` e `git diff --check`: passaram.

Screenshots desktop/mobile das três telas principais foram inspecionadas em `test-results/gradefy-*-*.png` (ignoradas pelo Git). Nenhum Supabase ou banco de produção foi acessado.

## Arquivos desta etapa

Modificados:

- `server/app.js`
- `server/password-recovery.js`
- `src/context.tsx`
- `src/main.tsx`
- `tests/password-recovery.test.js`

Criados:

- `server/registration.js`
- `src/gradefy/Shell.tsx`
- `src/gradefy/pages.tsx`
- `src/gradefy/api.ts`
- `src/gradefy/components.tsx`
- `src/gradefy/forms.ts`
- `src/gradefy/styles.css`
- `src/gradefy/tokens.ts`
- `public/gradefy/logo-mark.png`
- `public/gradefy/logo-wordmark.png`
- `public/gradefy/fonts/Sora.ttf`
- `public/gradefy/fonts/Inter.ttf`
- `public/gradefy/fonts/Sora-OFL.txt`
- `public/gradefy/fonts/Inter-OFL.txt`
- `tests/gradefy-auth.test.js`
- `tests/e2e/gradefy.spec.js`
- `docs/GRADEFY-INTERFACE-7A.md`

## Próxima etapa

Fase 7B: continuar a configuração do negócio a partir da conta global, validar slugs reservados, coletar os contatos necessários e fazer vínculos explícitos usando a autorização empresarial existente. Escolha de nicho/template/plano, trial, publicação, dashboard e versões nativas permanecem fora da 7A. A recuperação real requer a configuração Resend já existente; nenhum envio real foi executado para validar esta fase. Sem commit ou push.
