# Gradefy 7F.3A.1 — Entrada por perfil e código individual

A escolha de perfil está em `/app/comecar`, acessível pelo botão **Criar minha conta** da abertura e do login. O cadastro direto continua funcionando e oferece um link para escolher perfil. O login convencional não exige essa escolha. A conta autenticada também oferece **Entrar em uma equipe**.

## Fluxos e rotas

- **Sou proprietário** encaminha ao cadastro/onboarding já existente. Planos, criação empresarial, trial e editor permanecem nos fluxos anteriores.
- **Sou colaborador** abre `/app/entrar-equipe`. O formulário aceita código colado/digitado, minúsculas e espaços/hífens; agrupa o código ao sair do campo.
- **Continuar** valida o código no backend e abre o aceite original em `/app/convite#token=...`. A confirmação mostra o estabelecimento real e o papel do convite.
- Login e cadastro reutilizam `/app/login`, `/app/cadastro` e seus endpoints atuais. O convite permanece no fragmento durante autenticação e refresh. Ele não vai para query strings, localStorage ou sessionStorage.
- O link **Já tenho uma conta** antes de informar um código usa `?equipe=1`, apenas um indicador de navegação. Depois de entrar, retorna ao formulário de convite. Esse indicador não concede permissões e também sobrevive ao refresh.
- Links antigos em `/app/convite#token=...` continuam entrando diretamente no aceite, sem seleção de perfil ou código obrigatórios.

## Compartilhamento e segurança

Em `/app/equipe`, criar ou renovar um convite mostra empresa, e-mail, papel, status e expiração. O modal permite **Copiar link de convite** e **Copiar código de convite**, com seleção manual caso o clipboard não esteja disponível.

O código é a representação Base32 Crockford do mesmo segredo criptográfico de 256 bits que já compõe o link. Possui 52 caracteres em 13 grupos de quatro; não usa caracteres ambíguos I/L/O/U. A decodificação exige tamanho, alfabeto e padding canônico. Não há códigos curtos ou permanentes por empresa.

Os endpoints existentes `POST /api/team/invitations/inspect` e `POST /api/team/invitations/accept` aceitam **ou** `{token}` **ou** `{code}`. O backend normaliza o código para o token antes de usar a validação, o rate limiter persistente e a mesma transação de aceite. Payloads com campos adicionais ou ambas as credenciais são recusados.

O banco continua armazenando somente o hash SHA-256. Código e link compartilham validade de sete dias, uso único, cancelamento e renovação. Aceitar um invalida ambos; renovar gera um novo segredo e invalida ambos os anteriores. A criação da membership, o consumo do segredo e a auditoria são atômicos. Falhas fazem rollback; concorrência não duplica memberships. Não é possível recuperar o código pelo catálogo de convites; ele aparece somente na resposta de criação/renovação.

O e-mail transacional existente passa a incluir as duas opções de entrada. O Resend foi validado através do adaptador simulado; nenhum e-mail real foi enviado. O compartilhamento manual continua funcionando sem configuração de e-mail.

O código não autoriza sozinho. O aceite requer a sessão atual e o mesmo e-mail destinatário. Empresa e papel vêm do registro do convite, nunca do frontend. Convites indisponíveis recebem resposta genérica; tentativas usam o orçamento persistente existente, compartilhado entre instâncias, inclusive códigos inválidos. Nenhum código/token é introduzido em logs ou ferramentas de analytics.

## Papéis e múltiplas empresas

Escolher perfil não altera papel ou privilégios. O papel **Gestor** mantém a matriz existente, inclusive operação, financeiro e relatórios. **Profissional** mantém o vínculo sem ganhar painel de gestão ou acesso financeiro. A conta explica essa limitação e permite entrar em outra equipe. Permissões granulares para atendimento continuam pendentes de fase específica.

O aceite cria somente a membership do convite e preserva vínculos anteriores, seleção de empresa e conta global. A pessoa pode decidir acessar explicitamente a empresa recém-adicionada. As regras de seleção, revogação, isolamento e proteção de proprietários permanecem as anteriores. Aceitar convite não cria empresa, profissional, assinatura, plano ou trial; não concede acesso à Igor.

## Banco e arquivos

Nenhuma migration foi criada ou alterada; a 015 e seus checksums foram preservados. A implementação anterior da 7F.3A, ainda sem commit, foi mantida.

Arquivos modificados nesta etapa:

- `server/team.js`
- `src/gradefy/pages.tsx`
- `src/gradefy/team.tsx`
- `src/gradefy/team.css`
- `src/main.tsx`
- `tests/postgres/foundation.test.js`

Arquivos criados nesta etapa:

- `server/invitation-code.js`
- `server/invitation-code.d.ts`
- `src/gradefy/team-entry.tsx`
- `tests/helpers/team-code.js`
- `tests/team-code.test.js`
- `tests/e2e/gradefy-team-code.spec.js`
- `docs/GRADEFY-TEAM-7F3A1.md`

## Verificação local

Os testes usam SQLite em memória e PostgreSQL 17.11 portátil com cluster descartável em loopback. `DOTENV_CONFIG_PATH=NUL`, `DATABASE_URL` e `POSTGRES_URL` vazios impedem leitura da configuração real nos comandos locais. O runner PostgreSQL cria e remove seu próprio cluster e não usa URLs existentes. Não houve acesso a produção, Supabase ou envio real de mensagens.

Comandos:

```powershell
$env:DOTENV_CONFIG_PATH='NUL'
$env:DATABASE_URL=''
$env:POSTGRES_URL=''
node --test tests/team-code.test.js tests/team.test.js
npm.cmd test
node tests/postgres/run-local.mjs --bin 'C:\Users\Breno\AppData\Local\Gradefy\postgresql-17.11\pgsql\bin'
npm.cmd run build
npx.cmd playwright test
npm.cmd run format:check
git diff --check
```

O build inclui TypeScript e a checagem tipada da agenda. Os testes dirigidos cobrem representação/normalização/padding, persistência hash-only, expiração, cancelamento, renovação, código inválido/utilizado, identidade e payload forjado, rollback, uso único cruzado entre link/código, concorrência entre conexões, limites persistentes, permissões e preservação de planos/assinaturas/Igor. A suíte anterior cobre IDOR, múltiplas empresas, revogação, proteção dos owners, falhas de envio e compatibilidade legada.

O Chromium cobre escolha por teclado, proprietário, colaborador novo/existente, autenticação e refresh, cópia real no clipboard, compartilhamento manual e isolamento de profissional. Telas de escolha, código, confirmação e compartilhamento foram capturadas em 320, 390, 768 e 1440 px com verificação de ausência de rolagem horizontal. As capturas ficam em `test-results/team-code-*.png`, ignoradas pelo Git.

Resultados finais, em 13/10/2026:

| Verificação                                    | Resultado                                    |
| ---------------------------------------------- | -------------------------------------------- |
| Backend/SQLite dirigido (`team-code` e `team`) | 28 passaram                                  |
| Backend/SQLite completo                        | 227 passaram                                 |
| PostgreSQL 17.11 local completo                | 172 passaram                                 |
| E2E Chromium completo                          | 65 passaram, incluindo os 7 de equipe/código |
| Build + TypeScript + checagem tipada da agenda | Passou                                       |
| Prettier completo                              | Passou                                       |
| `git diff --check`                             | Passou                                       |
| Visual: 320, 390, 768 e 1440 px                | Conferido; sem overflow horizontal           |

Logs ignorados pelo Git: `test-results/team-code-directed.log`, `team-code-backend-full.log`, `team-code-postgres.log`, `team-code-e2e-full.log`, `team-code-build.log` e `team-code-format.log`. O relatório `test-results/postgres-validation/report.json` registra PostgreSQL 17.11, `productionAccess: false`, `clusterStopped: true` e `clusterRemoved: true`.

A primeira execução dirigida encontrou dois ajustes nas fixtures (timestamps de expiração precisavam respeitar a constraint e objetos SQLite possuem prototype nulo), corrigidos antes da rodada final. No E2E inicial havia dois headings com o mesmo nome de empresa; o heading redundante foi removido. Nenhuma falha permaneceu nas verificações finais. O Git continua na branch `feat/gradefy-foundation`, HEAD `2feeace`, com as alterações anteriores preservadas e sem commit/push.

Para demonstração isolada, após o build: `node tests/browser-server.js`. Abra `http://127.0.0.1:4173/app/comecar` ou `/app/entrar-equipe`. O fixture usa banco em memória e não entrega e-mail real. O proprietário de exemplo é `business-browser-owner@example.com`, senha `ClienteDemo2026!`; a equipe fica em `/app/equipe?empresa=business-browser-team`. Não use essas credenciais fora do fixture.

Sem commit, push, publicação ou início da 7F.3B. Pendência funcional: painel e permissões granulares para o papel Profissional; esta etapa preserva a matriz atual.
