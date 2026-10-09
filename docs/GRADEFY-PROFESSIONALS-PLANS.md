# Gradefy — Fase 5: profissionais, equipe e planos

Entrega de domínio/API e validação, sem novas telas, cobrança, onboarding ou transformação do site da Igor em template. O código da Fase 4 permanece como base. PostgreSQL é a referência de concorrência; SQLite continua suportado.

## Diagnóstico anterior e decisões

Antes da 006 não existia relação profissional–serviço: `/barbers` listava todos os ativos, `getServices` consultava serviços ativos da empresa, e disponibilidade/reserva/remarcação combinavam ambos independentemente. `readSchedule` usava defaults de expediente para profissionais sem configuração. Os históricos já tinham FK de profissional e snapshots de serviços, que foram mantidos.

`plans.id` já é o código estável (`individual`/`team`); `plans.name` já é o nome exibido. `max_professionals` e `active` também existiam. Não foram criados campos duplicados `code`/`display_name`. `subscriptions` já possuía `plan_id`, `status`, `source`, `starts_at`/`ends_at` e timestamps. Os períodos existentes continuam representando a vigência da assinatura; os novos campos de trial conservam o período inicial mesmo após eventual conversão de status em uma fase futura.

`barbers` continua sendo a tabela física. **Professional** é o conceito de domínio e das novas rotas. Não houve renomeação de tabela, IDs, `barber_id`, rotas legadas ou snapshots.

## Member não é Professional

`company_members` representa acesso e autorização. `barbers` representa quem atende. A contagem usa exclusivamente:

```sql
SELECT COUNT(*) FROM barbers WHERE company_id = ? AND active = 1;
```

Dono e gerente sem registro profissional usam zero vagas. Um profissional ativo usa uma vaga, com ou sem login e independentemente do papel do membro vinculado. Registros inativos não usam vaga e podem manter histórico.

O vínculo opcional é uma linha em `professional_users`, evitando reconstruir `barbers` apenas para acrescentar uma FK composta:

- PK `(company_id, barber_id)`;
- UNIQUE `(company_id, user_id)`;
- FK `(company_id, barber_id)` → `barbers(company_id, id)`;
- FK `(company_id, user_id)` → `company_members(company_id, user_id)`;
- `created_at` obrigatório.

Sem vínculo, não existe linha e a API retorna `user_id: null`. Ao vincular, o usuário deve ser membro **ativo** da empresa, com papel `owner`, `manager` ou `professional`. Um gerente que também atende só consome vaga por possuir um profissional ativo, não por ser gerente. Membro inativo/externo é rejeitado. Um vínculo não concede permissões, não cria usuários/memberships e não altera tokens. A revogação posterior do membro remove seu acesso pelas regras da Fase 3, preservando o profissional/histórico; o vínculo não torna esse acesso válido novamente.

## Migration 006

Arquivo: `006-gradefy-professionals-plans.sql`. As migrations 001–005 não foram modificadas. Histórico atual: versões 1–6.

| Estrutura                               | Mudança                                                                                                  |
| --------------------------------------- | -------------------------------------------------------------------------------------------------------- |
| `plans`                                 | Acrescenta `price_cents`, `currency`, `billing_interval`, `trial_days`; completa os dois planos iniciais |
| `subscriptions`                         | Acrescenta `trial_started_at`/`trial_ends_at`; permite status `trialing`; valida par/período de trial    |
| `subscriptions_one_current_per_company` | Impede mais de uma assinatura `pending`, `active` ou `trialing` por empresa                              |
| `subscriptions_one_trial_per_company`   | Impede mais de um registro com histórico de trial por empresa                                            |
| `barber_services`                       | Associação empresarial explícita, PK tripla, FKs compostas e índice para seleção por serviço             |
| `professional_users`                    | Vínculo opcional do profissional com membro da mesma empresa                                             |

Identificadores obrigatórios são explicitamente `NOT NULL`, inclusive PKs compostas. Valores em centavos/dias rejeitam frações também no SQLite. Os códigos iniciais recebem seus metadados comerciais uma vez na migration; não se cria assinatura para nenhuma empresa. Catálogos personalizados preexistentes conservam seus registros e recebem defaults de moeda/periodicidade/trial, com preço não definido até configuração explícita. `startTrial` não aceita plano sem preço configurado.

PostgreSQL estende a constraint de status via ALTER. SQLite reconstrói apenas `subscriptions`, copiando todas as linhas e preservando índices/triggers personalizados. Colunas inesperadas, referências inválidas ou FKs externas apontando para `subscriptions` abortam com rollback para evitar perda silenciosa, inclusive por `ON DELETE CASCADE`. Não há reconstrução de agendamentos, profissionais, serviços ou usuários.

O backfill cria associações para cada par **profissional ativo + serviço ativo da mesma empresa** já existente, incluindo Igor e eventuais empresas da Fase 3. Não associa registros entre empresas nem modifica `appointments`, `appointment_services`, duração ou preços de serviços. O timestamp fixo do backfill identifica a migração, não pretende recuperar uma data histórica desconhecida.

Reaplicação reconhece o journal e não duplica associações. Na instalação vazia, o seed associa somente dados recém-inicializados; chamadas posteriores não restauram associações removidas. O bootstrap não atribui plano nem trial, e não sobrescreve edições posteriores do nome comercial dos planos.

## Planos e entitlement

| Código estável (`id`) | Nome (`name`) | `price_cents` | Moeda | Periodicidade |  Trial | `max_professionals` |
| --------------------- | ------------- | ------------: | ----- | ------------- | -----: | ------------------: |
| `individual`          | Individual    |          2299 | BRL   | month         | 7 dias |                   1 |
| `team`                | Equipe        |          3299 | BRL   | month         | 7 dias |     NULL (sem teto) |

São metadados, não cobranças: não há checkout, gateway, impostos, promoção, renovação automática, cartão, PIX, App Store/Play Store ou webhook financeiro. A lógica usa `max_professionals`, não o texto “Equipe”. Mudar o nome não muda o código ou a regra.

`server/entitlements.js` centraliza:

- `getCompanyEntitlements(db, companyId)`: `planCode`, `subscriptionStatus`, `trialEndsAt`, `maxProfessionals`, `valid`, `reason`;
- `activeProfessionalCount(db, companyId)`;
- `requireProfessionalCapacity(tx, companyId, additionalActive)`;
- `startTrial(db, companyId, planCode)`;
- `changeCompanyPlan(db, companyId, planCode)`.

Todas exigem contexto empresarial. As duas últimas são funções de domínio para uso confiável no backend futuro, sem endpoint público ou nova tela nesta fase. Qualquer futura rota que as exponha terá de autorizar o chamador.

Entitlement válido exige empresa ativa, plano ativo e uma assinatura vigente:

- `trialing`: instante atual dentro de `[trial_started_at, trial_ends_at)`;
- `active`: vigência `starts_at`/`ends_at` respeitada; nulos preservam concessões manuais existentes sem limite temporal;
- `pending`, ausência de assinatura vigente, assinatura cancelada/expirada ou plano desativado não concedem criação/reativação.

Ausência de assinatura retorna `409 PLAN_REQUIRED`. Trial expirado retorna `409 TRIAL_EXPIRED`; vigência ativa encerrada/futura retorna `409 SUBSCRIPTION_EXPIRED`. Não há fallback “sem plano = ilimitado”. O limite é contado no backend sob lock e gera `409 PROFESSIONAL_LIMIT_REACHED`.

Criar um registro inativo também exige entitlement válido, mas não consome vaga ativa. Editar ou desativar registros existentes não exige assinatura vigente. Um PATCH que apenas repete `active: true` em quem já estava ativo não cria vaga. Expiração não desativa profissionais, cancela horários ou bloqueia o restante da aplicação: essa política pertence à Fase 8.

## Trial, upgrade e downgrade

Trial inicial dura **7 × 24 horas**, em timestamps ISO UTC. No PostgreSQL, o relógio é consultado no banco; no SQLite usa o relógio local do processo. Agenda continua usando as regras de horário de Brasília anteriores.

`startTrial` valida empresa, plano, capacidade atual e ausência de qualquer histórico de assinatura. Registra `trialing`, `source='manual'`, período de vigência e período inicial de trial. Uma empresa com histórico anterior, inclusive cancelado/expirado, recebe `TRIAL_UNAVAILABLE`. O índice único de trial reforça essa proteção no banco. Chamadas simultâneas não criam dois trials.

Trocar o plano atual nunca muda início/fim do trial ou da vigência. Não converte trial em assinatura paga. Upgrade Individual→Equipe mantém o ciclo e remove o teto numérico. Downgrade Equipe→Individual exige no máximo um ativo, senão retorna `PLAN_DOWNGRADE_REQUIRES_ACTION` e mantém a assinatura e todos os profissionais intactos. Também não se pode iniciar trial Individual já possuindo mais de um ativo. Não existe downgrade agendado nesta fase.

O histórico de subscriptions é parte do controle de trial; não deve ser apagado por manutenção comum. Escritas SQL privilegiadas podem contornar regras de aplicação e precisam seguir o protocolo de domínio.

## API administrativa

As rotas abaixo usam o middleware existente de empresa e exigem **owner ou manager**. Papel `professional` não recebe acesso administrativo; não há painel “Minha agenda”.

| Método | Rota                                  | Comportamento                                                              |
| ------ | ------------------------------------- | -------------------------------------------------------------------------- |
| GET    | `/api/admin/professionals`            | Lista ativos/inativos da empresa com serviços e vínculo opcional           |
| POST   | `/api/admin/professionals`            | Cria registro, associações e agenda fechada na mesma transação             |
| GET    | `/api/admin/professionals/:id`        | Detalhe empresarial; ID externo retorna 404                                |
| PUT    | `/api/admin/professionals/:id`        | Atualiza nome, especialidade, serviços e vínculo opcional; não muda status |
| PATCH  | `/api/admin/professionals/:id/status` | `{ "active": true/false }`; reativação revalida entitlement/limite         |

POST recebe `{name, specialty?, services: [serviceId], active?, userId?}`. Nome e serviços são obrigatórios; lista vazia é permitida, sem horários para nenhum serviço. `active` tem default true; `userId` é opcional/null. PUT recebe os mesmos detalhes sem `active`: omitir `userId` preserva o vínculo; null remove. Campos desconhecidos, serviços repetidos, referências inválidas e tentativa de editar status via PUT são rejeitados.

Não há DELETE físico. Desativar remove da lista pública e impede novas reservas/remarcações para esse profissional, preservando eventos, métricas e reservas futuras já existentes. O proprietário deve administrar essas reservas explicitamente; não existe cancelamento silencioso. Remover associação de serviço tem a mesma regra: só afeta seleção/confirmação futura e não apaga snapshots.

Novo profissional recebe sete dias inativos e configuração manual sem semanas liberadas. Assim não herda acidentalmente 09h–19h do fallback legado. A gestão deve configurar expediente e modo de abertura pelas rotas existentes antes de receber reservas. Conta no limite quando ativo, mesmo ainda não configurado.

## Seleção e compatibilidade pública

- `/api/barbers` permanece disponível, agora com `service_ids`; nunca expõe vínculo `user_id` ao público.
- `/api/barbers?services=<id>` filtra profissionais ativos associados ao serviço ativo da empresa. Os aliases por slug têm o mesmo contrato.
- `/availability` retorna slots vazios com motivo `professional-service-unavailable` para combinação não associada.
- Confirmação e remarcação revalidam profissional ativo e associação **após adquirir o lock do profissional**; combinação forçada é rejeitada com 409. Serviço inválido/inativo preserva a validação anterior (400).
- O componente `Booking.tsx` filtra as opções usando `service_ids` e limpa uma seleção que deixa de ser compatível ao trocar serviço. É uma mudança funcional sem CSS, layout, textos, novas telas ou identidade visual.

`POST /admin/services` aceita `professionalIds` opcional para escrever associações na criação, dentro da mesma transação. Para o contrato legado da **Igor**, omitir o campo associa o serviço aos profissionais atualmente ativos, preservando o cadastro de serviços da interface atual. Em outras empresas, a omissão cria serviço sem profissionais; também é possível passar `[]` explicitamente na Igor. A atribuição posterior ocorre pelo CRUD profissional. IDs externos são rejeitados. A exclusão lógica de serviço continua válida; associação não torna um serviço inativo agendável.

Igor não recebe assinatura/trial por seed. Seus profissionais/horários atuais permanecem disponíveis com as associações de backfill. Novo CRUD de criação/reativação exige associação explícita de plano; o admin legado, histórico, serviços e reservas não passam a exigir assinatura nesta fase.

## Concorrência

Capacidade, criação, reativação, alteração de vínculo e troca/início de plano usam advisory lock transacional PostgreSQL **por empresa** (`entitlements/professionals`). Contagem e gravação ficam na mesma transação; não há mutex de processo como proteção principal. Empresa B não espera o lock de A. As duas criações concorrentes de ativos no Individual resultam em exatamente um sucesso; reativações seguem a mesma regra.

Ordem de recursos nesta fase: entitlement → catálogo compartilhado → profissional → membership quando necessário. Status precisa de entitlement → profissional. Reserva da Fase 4 não precisa do lock de entitlement; continua independente da assinatura e de outros profissionais. Seus locks de catálogo/agendamento/profissional foram preservados.

Alterar serviços do profissional usa seu lock e o catálogo compartilhado, competindo com confirmação e edição de duração/preço. Desativação usa o mesmo lock de agenda: uma reserva que vence é preservada; uma que perde revalida `active` e é recusada. Não há deadlock por inverter catálogo/profissional. Trial/troca de plano e CRUD usam o mesmo lock de capacidade, evitando que um downgrade concorra com criação e ultrapasse o limite.

SQLite usa o escritor serializado já existente; isso verifica regras e rollback, mas não prova paralelismo distribuído. A autoridade é a suíte PostgreSQL real com duas instâncias/pools.

## Implantação e limites

Não implante versões antigas e novas processando simultaneamente a mesma base: código antigo não conhece associações ou limites. Drene requisições/workers, aplique a versão 006 em homologação e depois use somente servidores que conheçam o novo manifesto. Faça backup e valide restauração. Nunca remova registros do journal para forçar downgrade de código.

Não há cobrança real nem API de concessão financeira. Fase 5.1: POST /admin/professionals agora reutiliza a idempotência persistente da Fase 4 via Idempotency-Key, com retenção de 24 horas. Veja GRADEFY-STABILIZATION.md.

Não foram criadas telas de profissionais/planos, cadastro de empresa, acesso profissional próprio, limites de outros recursos, tarefas de cobrança, RLS ou templates dinâmicos. A Fase 6 poderá transformar o site Igor em Barber Classic; identidade visual, fotos, marca e endereço continuam preservados nesta entrega.

## Validação e arquivos

`tests/helpers/professionals-migration.js` valida upgrade com dados reais de 005, preservação integral do legado, metadados intencionais de planos, rollback, reaplicação, checksum e índices personalizados. SQLite também testa dependência externa com cascade e coluna personalizada, garantindo aborto sem perda.

`tests/helpers/professionals-plans.js` cobre cenários A–Q, vínculo opcional, autorização/cross-company, slots, serviço incompatível, criação sem login, contagem de membros, trial expirado, trial concorrente, upgrade/downgrade, histórico e seed que não restaura associações removidas. Há **10 repetições de criação e reativação concorrentes no Individual no PostgreSQL**, além da barreira entre empresas; SQLite repete cinco vezes com a ressalva de serialização.

`tests/e2e/professional-services.spec.js` verifica troca de serviço e remoção de profissional incompatível, inclusive viewport mobile. As suítes anteriores de identidade, agenda, notificações, concorrência e integridade permanecem ativas. O PostgreSQL 17.11 é provisionado pelo runner portátil em cluster novo, limitado a localhost/porta aleatória, sem `.env` ou Supabase; encerrado e removido ao final. Envios de provedores são simulados.

Arquivos novos nesta fase:

- `server/migrations/006-gradefy-professionals-plans.sql`
- `server/professionals-migration.js`
- `server/professionals.js`
- `server/entitlements.js`
- `tests/helpers/professionals-migration.js`
- `tests/helpers/professionals-plans.js`
- `tests/professionals-plans.test.js`
- `tests/postgres/professionals.js`
- `tests/e2e/professional-services.spec.js`
- `docs/GRADEFY-PROFESSIONALS-PLANS.md`

Arquivos ajustados nesta fase (alguns já continham alterações não commitadas da Fase 4):

- `server/app.js`, `server/migrations.js`, `server/company-bootstrap.js`, `server/seed.js`
- `src/pages/Booking.tsx`, `src/types.ts`
- `tests/browser-server.js`, `tests/schedule.test.js`
- `tests/company-integrity.test.js`, `tests/company-migration.test.js`, `tests/data-ownership.test.js`
- `tests/helpers/access-migration.js`, `tests/helpers/data-ownership.js`, `tests/helpers/application-context.js`, `tests/helpers/scheduling-reliability.js`
- `tests/postgres/foundation.test.js`
- `docs/GRADEFY-MIGRATION.md`, `docs/ARCHITECTURE.md`

Sem commit ou push; sem acesso a qualquer banco de produção. O app mobile não foi modificado.

### Resultado da validação final (2026-10-01)

| Verificação                          | Resultado                                                                                        |
| ------------------------------------ | ------------------------------------------------------------------------------------------------ |
| Testes unitários/integrados e SQLite | 94 aprovados, 0 falhas                                                                           |
| PostgreSQL descartável real          | PostgreSQL 17.11; 52 aprovados, 0 falhas; cluster removido pelo runner                           |
| Concorrência PostgreSQL              | 10 repetições cada para criação/reativação, mais disputa de trial e independência entre empresas |
| E2E Playwright                       | 17 aprovados, 0 falhas                                                                           |
| Build e typecheck web                | `npm run build` aprovado (`tsc -b`, `check:schedule`, Vite)                                      |
| App mobile                           | 5 testes aprovados e `tsc --noEmit` aprovado; código mobile inalterado                           |
| Formatação e diff                    | `npm run format:check` e `git diff --check` aprovados                                            |

O banco PostgreSQL usado foi provisionado localmente em cluster descartável, vinculado a `127.0.0.1` numa porta aleatória. O relatório automatizado registra `productionAccess: false`, `clusterStopped: true` e `clusterRemoved: true`. Nenhum banco Supabase ou outro banco de produção foi acessado. Os logs detalhados ficam em `test-results/phase5-unit.txt`, `test-results/phase5-pg-run.txt`, `test-results/phase5-web-e2e-status.json`, `test-results/phase5-build.txt`, `test-results/phase5-mobile.txt` e `test-results/phase5-mobile-typecheck.txt`.
