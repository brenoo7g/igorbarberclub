# Gradefy — Fase 2A: propriedade dos dados

Esta etapa adiciona propriedade empresarial no banco, sem habilitar operação multiempresa. Nenhuma consulta HTTP passa a filtrar ou resolver empresas, e a autorização existente permanece intacta. A restrição `gradefy_single_company` continua ativa.

## Migration e identidade

Criada `003-gradefy-data-ownership.sql`. As migrations 001 e 002 não foram editadas. SHA-256 bruto preservado:

- 001: `99C630F469EDF147B048F5A1123388796324E5D68F5505C55473779FB854FADC`
- 002: `C7EFA4EE40834280CFF2CD8DC2A6102D95B9F0E4B241C642A66217B9EEB70263`

O backfill usa `IGOR_COMPANY_ID` de `server/company-bootstrap.js`, cujo valor canônico é `igor-barber-club`. O executor exige exatamente uma correspondência entre ID e slug canônicos. Nome comercial editado não muda essa identidade. Empresa ausente, slug divergente, ambiguidade ou relações inconsistentes abortam a transação. Não há escolha da primeira empresa nem criação de empresa dentro da 003.

Em instalação sem histórico Gradefy, o executor aplica 001 e 002 e executa o bootstrap da Fase 1 antes de iniciar a 003. Em bancos que já têm histórico Gradefy, não executa esse bootstrap antecipado: uma empresa ausente não é reparada silenciosamente. A importação de fotos agora ocorre depois das migrations, informando a empresa explicitamente.

## Tabelas e contagem dos fixtures

Todas as tabelas abaixo receberam `company_id TEXT NOT NULL`, sem DEFAULT, e FK para `companies(id)`. As contagens são dos fixtures sintéticos de upgrade usados nos dois bancos, não de produção.

| Tabela                  | Registros migrados no fixture |
| ----------------------- | ----------------------------: |
| `barbers`               |                             2 |
| `services`              |                             2 |
| `portfolio`             |                             1 |
| `barber_settings`       |                             1 |
| `barber_working_hours`  |                             1 |
| `barber_working_breaks` |                             1 |
| `released_weeks`        |                             1 |
| `appointments`          |                             2 |
| `appointment_services`  |                             2 |
| `guest_sessions`        |                             1 |
| `guest_appointments`    |                             1 |
| `blocks`                |                             1 |
| `notifications`         |                             1 |
| **Total operacional**   |                        **17** |

Todos esses registros recebem exclusivamente o ID canônico da Igor. A comparação antes/depois cobre todas as colunas anteriores: IDs, valores, durações, status, datas, hashes, tokens, versões e relações. O fixture também preserva dois usuários, os dados de recuperação de senha, limites e marcador de conteúdo.

`users`, `password_recovery`, `password_recovery_limits` e `schema_migrations` não recebem `company_id`. `content_migrations` continua sendo o registro global da importação histórica existente, separado do journal de schema e sem adaptação empresarial nesta fase.

## Backfill e transações

No PostgreSQL, a 003 adiciona a coluna inicialmente nullable, preenche com parâmetro ligado à constante canônica, aplica NOT NULL, FKs e índices. O próprio NOT NULL valida a ausência de lacunas. Antes do commit, o executor compara contagens e confirma que todos os valores são da Igor. Os dados anteriores não são copiados/recriados no PostgreSQL.

SQLite exige reconstrução transacional para acrescentar essas constraints. As tabelas auxiliares contêm todas as colunas anteriores e `company_id` obrigatório. A migração copia os valores por nome, com a empresa como parâmetro, e só depois substitui as tabelas antigas. Não reinvoca seed para recriar profissionais, serviços, reservas, fotos ou usuários. IDs, conteúdo e defaults anteriores são preservados. As chaves textuais operacionais recebem NOT NULL explícito; uma chave nula preexistente faz a migração falhar, sem normalização ou descarte.

Índices e triggers existentes do SQLite são capturados e recriados após a substituição. Colunas inesperadas causam recusa para evitar perda de extensões locais. FKs são verificadas antes e depois, inclusive quando o inicializador legado desativa temporariamente sua aplicação. Os testes também executam a migração isolada com FKs ativadas.

A 003 e o registro no journal compartilham a transação e o lock já usados nas fases anteriores. Uma falha após o backfill PostgreSQL ou durante a substituição SQLite reverte DDL, dados e journal. Uma nova execução após sucesso não reaplica a migration.

Não execute o SQL isoladamente: os parâmetros de backfill e validações fazem parte do executor versionado. Use a inicialização normal ou `npm run db:migrate` em ambiente autorizado.

## Constraints e FKs

Além das 13 FKs simples de `company_id` para `companies`, foram acrescentadas **11 FKs compostas**, mantendo as relações legadas:

| Origem                                                | Chave de destino                                     |
| ----------------------------------------------------- | ---------------------------------------------------- |
| `barber_settings(company_id,barber_id)`               | `barbers(company_id,id)`                             |
| `barber_working_hours(company_id,barber_id)`          | `barbers(company_id,id)`                             |
| `barber_working_breaks(company_id,barber_id,weekday)` | `barber_working_hours(company_id,barber_id,weekday)` |
| `released_weeks(company_id,barber_id)`                | `barbers(company_id,id)`                             |
| `appointments(company_id,barber_id)`                  | `barbers(company_id,id)`                             |
| `appointment_services(company_id,appointment_id)`     | `appointments(company_id,id)`                        |
| `appointment_services(company_id,service_id)`         | `services(company_id,id)`                            |
| `guest_appointments(company_id,appointment_id)`       | `appointments(company_id,id)`                        |
| `guest_appointments(company_id,visitor_id)`           | `guest_sessions(company_id,id)`                      |
| `blocks(company_id,barber_id)`                        | `barbers(company_id,id)`                             |
| `notifications(company_id,appointment_id)`            | `appointments(company_id,id)`                        |

Cinco chaves UNIQUE dão suporte aos destinos: `(company_id,id)` em profissionais, serviços, reservas e sessões de visitantes, e `(company_id,barber_id,weekday)` na grade de funcionamento. IDs continuam globalmente únicos como antes; não são substituídos por IDs compostos.

`appointments.user_id` continua uma FK global e opcional para `users`. Não foi inventada empresa para usuários ou recuperação de senha.

## Índices e justificativa

Foram adicionados **19 índices lógicos: cinco UNIQUE de integridade e 14 de consulta**. Os índices anteriores foram preservados. Não há um índice simples redundante em `company_id` quando o prefixo de outro índice já o atende.

| Índice PostgreSQL / equivalente lógico SQLite | Colunas após `company_id` | Motivo                                           |
| --------------------------------------------- | ------------------------- | ------------------------------------------------ |
| `barbers_company_key` UNIQUE                  | `id`                      | Destino das FKs empresariais.                    |
| `services_company_key` UNIQUE                 | `id`                      | Integridade dos serviços históricos.             |
| `appointments_company_key` UNIQUE             | `id`                      | Integridade de itens, visitantes e notificações. |
| `guest_sessions_company_key` UNIQUE           | `id`                      | Integridade do vínculo de visitante.             |
| `barber_working_hours_company_key` UNIQUE     | `barber_id,weekday`       | Integridade dos intervalos.                      |
| `barbers_company_active`                      | `active`                  | Listagem pública de profissionais ativos.        |
| `services_company_active`                     | `active`                  | Catálogo público ativo.                          |
| `portfolio_company_created`                   | `created_at`              | Ordenação das fotos.                             |
| `barber_settings_company_barber`              | `barber_id`               | Configuração por profissional.                   |
| `barber_working_breaks_company_day`           | `barber_id,weekday`       | Grade diária e intervalos.                       |
| `released_weeks_company_start`                | `barber_id,week_start`    | Semanas abertas por profissional.                |
| `appointments_company_date`                   | `date,status`             | Agenda por data e métricas.                      |
| `appointment_services_company_appointment`    | `appointment_id`          | Composição e histórico da reserva.               |
| `appointment_services_company_service`        | `service_id`              | FK de serviço e consultas de vendas.             |
| `guest_appointments_company_appointment`      | `appointment_id`          | FK da reserva e consulta de visitante.           |
| `guest_appointments_company_visitor`          | `visitor_id`              | Histórico do visitante.                          |
| `blocks_company_date`                         | `barber_id,date`          | Consulta de intervalos ocupados.                 |
| `notifications_company_queue`                 | `status,next_attempt_at`  | Fila de envio/retry.                             |
| `notifications_company_appointment`           | `appointment_id`          | FK e histórico de notificações da reserva.       |

No SQLite, as cinco chaves UNIQUE são constraints de tabela com índices automáticos; não foram criadas cópias redundantes com nomes PostgreSQL. Os outros 14 índices têm os mesmos nomes nos dois bancos.

## Inserções atuais e segurança

Seeds, importação, criação de reserva, serviço, foto, bloqueio, agenda, sessão de visitante e notificação informam a constante da Igor. Nenhum identificador empresarial é obtido de body, header, hostname ou cookie. Não existe DEFAULT no banco para mascarar uma inserção esquecida.

As modificações nos módulos HTTP limitam-se às inserções necessárias para satisfazer NOT NULL. Consultas, regras funcionais, credenciais, tokens, cookies, permissões e filtros permanecem os legados. Não há middleware de tenant ou autorização por `company_members`.

**Ainda não é seguro liberar a segunda empresa.** Consultas, workers, acesso por ID e autorização continuam globais. As FKs compostas impedem relações cruzadas, mas não substituem isolamento de leitura/escrita na API. Resolução empresarial, isolamento de consultas e autorização contextual ficam para as fases posteriores.

## Validação em 30/09/2026

- `npm.cmd test`: **62 testes passaram**, incluindo unitários, integração, SQLite e oito casos/subcasos específicos da 2A.
- `node tests/postgres/run-local.mjs --bin <PostgreSQL bin>`: **17 testes passaram**, incluindo backfill da 2A, rollback após backfill, inicialização recusada sem Igor, concorrência, checksum e preservação do legado.
- `npm.cmd run test:e2e`: **16 E2E web passaram**, incluindo perfil, login, agenda, reservas com/sem conta, remarcação, cancelamento, galeria e navegação responsiva.
- `npm.cmd run build`: TypeScript, verificação de tipos da agenda e build Vite passaram.
- Em `app-mobile`, `npm.cmd test`: **5 passaram**; `npm.cmd run typecheck`: passou.
- Formatação dos arquivos JS/Markdown alterados e `git diff --check`: sem erros.

A regressão financeira usa duas reservas concluídas, uma de conta e uma de visitante: receita de **12.321 centavos**, dois atendimentos, dois clientes distintos e ticket médio arredondado de **6.161 centavos**. A comparação verifica o objeto completo das métricas, incluindo serviços mais vendidos, antes e depois da migração.

As tentativas negativas cobrem omissão/NULL de `company_id` nas 13 tabelas, empresa inexistente, referências inválidas, ausência da Igor, slug inconsistente, referência legada órfã e chave legada nula. A preservação compara todas as colunas anteriores das 17 tabelas legadas, inclusive dados globais excluídos da propriedade empresarial.

Os testes de relações cruzadas removem o CHECK de empresa única **somente em cópias descartáveis com uma migration 004 artificial**. Com ambas as empresas e pais existentes, tentam as 11 relações cruzadas e recebem erro de FK em SQLite e PostgreSQL. Assim, a prova não depende de a segunda empresa estar ausente. Nenhuma 004 foi adicionada à aplicação.

PostgreSQL **17.11**, Windows x64, foi provisionado pelo runner portátil em cluster novo, escuta exclusiva em localhost, senha aleatória e bases sintéticas. O runner ignora o `.env` e URLs do projeto, encerra o servidor e remove o cluster. **Nenhum Supabase ou banco de produção foi acessado.** Os relatórios ficam em `test-results/postgres-validation/`; Playwright usa `test-results/web-e2e/` para não apagar os relatórios PostgreSQL.

## Diferenças e riscos restantes

- PostgreSQL permite adicionar coluna/constraints por ALTER; SQLite exige cópia transacional. Tabelas SQLite grandes precisam de espaço temporário e tempo de lock; dados inválidos abortam, sem tentativa automática de conserto.
- PKs textuais operacionais precisam de NOT NULL explícito no SQLite. A 003 recusa chaves antigas nulas e preserva IDs válidos.
- `COUNT(*)` retorna string por `pg` e número no SQLite; validações convertem a contagem explicitamente.
- Erros PostgreSQL abortam a transação; o executor faz rollback completo. Não se captura erro SQL para continuar uma migration parcialmente falha.
- Tipagem flexível e datas TEXT do legado não foram normalizadas. As proteções de inteiro da fundação implementadas na 002 permanecem intactas.
- Extensões locais de schema não previstas devem ter migration própria. A 003 não descarta colunas extras. Índices/triggers SQLite existentes são preservados; alterações externas complexas, views e permissões específicas exigem validação no ambiente correspondente.
- O teste local não cobre TLS/pooler/permissões do Supabase nem carga de produção. Não foi feito deploy ou executada migration em banco real do estabelecimento.
- Voltar para código que desconhece a versão 003 causa recusa pelo controle de migrations; não apague o journal nem edite checksums para contornar isso.
- Os avisos de terminal `NO_COLOR`/`FORCE_COLOR` e de conversão Git LF/CRLF não indicaram falhas funcionais.

## Arquivos

Criados:

- `server/migrations/003-gradefy-data-ownership.sql`
- `server/data-ownership.js`
- `tests/data-ownership.test.js`
- `tests/helpers/data-ownership.js`
- `docs/GRADEFY-DATA-OWNERSHIP.md`

Modificados:

- `server/migrations.js`, `server/database.js`
- `server/seed.js`, `server/portfolio-seed.js`
- `server/app.js`, `server/schedule.js`, `server/guest-session.js`, `server/notifications.js`, `server/portfolio.js`
- `tests/company-bootstrap.test.js`, `tests/company-integrity.test.js`, `tests/company-migration.test.js`
- `tests/browser-server.js`, `tests/portfolio.test.js`, `tests/schedule.test.js`, `tests/postgres/foundation.test.js`
- `playwright.config.js`
- `docs/GRADEFY-MIGRATION.md`, `docs/POSTGRES-VALIDATION.md`

As fixtures pré-Gradefy continuam sem `company_id` para testar o backfill real; as inserções em testes executados após a migração informam a empresa. Nenhum arquivo do frontend ou do mobile foi alterado. Nenhum commit foi feito.
