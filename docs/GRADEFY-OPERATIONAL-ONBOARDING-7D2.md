# Gradefy — Fase 7D.2

## Fluxo e persistência

`/app/onboarding/operations` apresenta serviços, profissionais, horários e revisão.
Os cadastros são gravados nas tabelas existentes, sempre com a empresa do proprietário.
`company_onboarding.current_step` guarda a etapa; login em outro dispositivo retoma os
dados do servidor. Não depende das escolhas em localStorage.

As sugestões Corte, Barba e Corte + Barba apenas preenchem o nome do formulário.
Nenhum serviço ou profissional é inserido automaticamente. O proprietário só ocupa
vaga se optar por se cadastrar como profissional ativo. Individual permite um ativo;
Equipe não limita ativos. Profissionais sem login e inativos são permitidos.

Novos profissionais começam com os sete dias fechados. O formulário reutiliza
o motor de horários: abertura manual/automática, dias ativos, expediente, até quatro
pausas, validação de sobreposição e versão para evitar sobrescritas. A revisão exige
serviço válido, associação, profissional ativo e expediente que comporte o atendimento.

## API restrita ao onboarding

Todas as rotas exigem autenticação e membership owner ativo, além de autoria do
onboarding. A empresa vem do banco; um seletor externo diferente é recusado.

| Método     | Caminho `/api/onboarding/operations` | Finalidade                                              |
| ---------- | ------------------------------------ | ------------------------------------------------------- |
| GET        | `/`                                  | Empresa, serviços, profissionais, horários e pendências |
| PUT        | `/progress`                          | Persistir etapa                                         |
| GET/POST   | `/services`                          | Listar/criar serviço                                    |
| PUT/DELETE | `/services/:id`                      | Editar/ativar/desativar; exclusão lógica                |
| GET/POST   | `/professionals`                     | Listar/criar profissional                               |
| GET/PUT    | `/professionals/:id`                 | Consultar/editar e associar serviços                    |
| PATCH      | `/professionals/:id/status`          | Ativar/desativar                                        |
| GET/PUT    | `/professionals/:id/schedule`        | Consultar/configurar expediente                         |
| POST       | `/complete`                          | Concluir e iniciar trial conscientemente                |

Não é uma liberação do painel administrativo: os handlers existentes são montados
com empresa fixa, lista restrita de caminhos e transação que revalida owner/estado.
Os limites usam o plano selecionado em `company_onboarding` apenas durante configuração
pendente. A regra normal de assinatura válida permanece intacta.

## Trial, concorrência e publicação

O botão “Concluir configuração e iniciar 7 dias grátis” envia `{}` ao endpoint de
conclusão. O servidor revalida plano disponível, nicho/template compatíveis,
configuração, quota e ausência de assinatura anterior. Nenhum trial começa ao salvar
serviços ou horários, abrir a revisão ou recarregar.

Um lock persistente por empresa serializa gravações do onboarding e conclusão.
Idempotência reutiliza a infraestrutura anterior, com empresa, ator, operação e chave.
Criação de empresa ativa privada, assinatura e marcação de conclusão pertencem à mesma
transação. Falha desfaz tudo; repetir a conclusão não reinicia nem estende o trial.
Datas são calculadas pelo servidor em UTC, com exatamente 604800000 ms de diferença,
e apresentadas no fuso de Brasília.

Empresa ativa não significa site publicado. `companies.site_published=0` mantém os
endpoints públicos fechados após a ativação. A Igor e empresas anteriores mantêm `1`.
`/app/onboarding/complete` mostra o período e o plano. “Personalizar meu site” leva
somente a `/app/onboarding/site`, um aviso para a Fase 7E.

## Migration 010

`010-gradefy-operational-onboarding.sql` acrescenta publicação, etapa, conclusão e
referência à assinatura. Atualiza a constraint de operações da idempotência para
`service-create` e `onboarding-complete`. Usa as estratégias PostgreSQL/SQLite já
existentes, com preflight SQLite, rollback transacional e controle de checksum.
Onboardings anteriores são explicitamente mantidos privados. Migrations 001–009
permanecem intactas. Segunda execução não duplica estrutura nem conteúdo.

## Validação e arquivos

Testes específicos: `tests/operational-onboarding.test.js`, helper compartilhado
`tests/helpers/operational-onboarding.js`, caso PostgreSQL em
`tests/postgres/foundation.test.js` e `tests/e2e/gradefy-operations.spec.js`.
Cobrem isolamento, CRUD, quota concorrente, horários, retomada, idempotência,
rollback, histórico de trial, expiração, publicação fechada e preservação do Igor.
Fixtures de migrations anteriores foram atualizadas para executar também a 010
e ordenar versões numericamente ao chegar a dois dígitos.

Fixtures ajustadas: `tests/company-integrity.test.js`, `tests/company-migration.test.js`,
`tests/data-ownership.test.js`, `tests/helpers/access-migration.js`,
`tests/helpers/barber-classic-migration.js`, `tests/helpers/barber-classic.js`,
`tests/helpers/company-onboarding.js`, `tests/helpers/data-ownership.js`,
`tests/helpers/professional-idempotency.js`, `tests/helpers/professionals-migration.js`
e `tests/helpers/scheduling-reliability.js`.

Resultados em 09/10/2026:

| Verificação                                       | Resultado                                  |
| ------------------------------------------------- | ------------------------------------------ |
| Específicos SQLite 7D.2                           | 8 aprovados                                |
| Backend completo, incluindo SQLite                | 131 aprovados                              |
| PostgreSQL local 17.11                            | 80 aprovados; cluster descartável removido |
| E2E completo                                      | 36 aprovados                               |
| E2E dev:test-access / Vite                        | 1 aprovado                                 |
| Mobile                                            | 5 aprovados; TypeScript aprovado           |
| Build / TypeScript web / verificação JS de agenda | Aprovados                                  |
| Prettier e git diff --check                       | Aprovados                                  |

Os primeiros testes detectaram uma ligação incorreta dos middlewares de agenda
e ordenação lexicográfica da versão 10 nas snapshots antigas. Ambos foram corrigidos
antes da rodada final. Não restaram falhas nas suítes executadas. Avisos do Playwright
sobre NO_COLOR/FORCE_COLOR não representam falha.

Implementação: `server/operational-onboarding.js`, `server/services.js`,
`server/company-onboarding.js`, `server/professionals.js`, `server/schedule.js`,
`server/entitlements.js`, `server/company-access.js`, `server/public-site.js`,
`server/app.js`, `server/migrations.js`, `src/lib.ts`, `src/main.tsx`,
`src/gradefy/operations.tsx`, `business-types.ts`, `business-setup.tsx`, `plans.tsx`,
`pages.tsx` e `styles.css`.

Os testes usam SQLite em memória e PostgreSQL local descartável, nunca Supabase.
Para testar visualmente, use um banco local ou o modo descartável:

```powershell
$env:DOTENV_CONFIG_PATH='NUL'
$env:DATABASE_URL=''
$env:POSTGRES_URL=''
$env:DEMO_MODE='true'
$env:NODE_ENV='development'
$env:VERCEL=''
$env:PORT='3001'
$env:APP_URL='http://localhost:5173'
npm.cmd run dev:test-access
```

Abra `http://localhost:5173/app`, crie uma conta Gradefy, escolha plano/nicho/template,
crie a empresa e prossiga para configuração operacional. Esse modo perde dados quando
o backend reinicia; a retomada entre dispositivos no uso normal depende de banco persistente.

Não foram implementados editor, upload, publicação, cobrança ou dashboard completo.
A Fase 7E precisará oferecer personalização e uma operação explícita de publicação,
com suas próprias validações. Nenhum commit ou push foi feito nesta fase.
