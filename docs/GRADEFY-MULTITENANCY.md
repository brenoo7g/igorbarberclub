# Gradefy — Fase 3: resolução e autorização empresarial

Entrega de backend e segurança, sem interface nova. As empresas podem coexistir no banco após a migration 004. Nenhuma empresa adicional é criada pelo seed normal. As empresas B usadas na validação existem exclusivamente em bancos descartáveis.

## Identidade e autorização

JWT identifica o usuário global e sua versão de sessão. Os claims, segredo, issuer/audience, prazo e cookie `session` permanecem inalterados. Claims como `companyId`, `companyRole` e `isOwner` não concedem autoridade, mesmo em um token válido. Toda requisição administrativa consulta o banco.

`company_members` mantém a chave composta `(company_id,user_id)`, referências obrigatórias a `companies` e `users`, `created_at` e status `active/inactive`. Seus papéis finais são:

| Papel          | Permissão nesta fase                                                                                            |
| -------------- | --------------------------------------------------------------------------------------------------------------- |
| `owner`        | Todas as operações administrativas já existentes                                                                |
| `manager`      | As mesmas operações administrativas existentes; nenhuma transferência de propriedade ou assinatura implementada |
| `professional` | Membro listado em suas empresas, sem acesso administrativo completo e sem vínculo inventado com `barbers`       |

`users.role=admin` sozinho não autoriza operação empresarial e não representa Super Admin. Um `users.role=client` com membership `manager` tem acesso à API administrativa da empresa correspondente. As verificações visuais antigas do painel não foram redesenhadas: o cliente Gradefy futuro deverá usar memberships, não o papel global exibido no usuário.

Reservas, cadastro de cliente, login e sessão visitante não criam memberships. Clientes continuam acessando suas próprias reservas por `user_id/visitor_id + company_id`.

## Migration 004 e preservação

`server/migrations/004-gradefy-multitenant-access.sql` remove somente a constraint temporária `gradefy_single_company`, converte `company_members.role='admin'` em `manager` e aplica a lista de papéis finais. `owner` e `professional`, status inativo, IDs, timestamps e associações existentes são preservados. Não há escolha automática de proprietário.

- PostgreSQL: ALTER TABLE remove a restrição de empresa única, substitui a CHECK de papéis e converte os registros dentro da transação.
- SQLite: reconstrói apenas `companies` e `company_members` com as mesmas colunas e NOT NULL explícitos. A cópia mantém todas as empresas e converte os papéis. As referências são diferidas durante a substituição e verificadas com `foreign_key_check` antes de encerrar a etapa.
- `server/multitenant-migration.js` rejeita colunas inesperadas, verifica FKs e preserva índices/triggers personalizados das tabelas reconstruídas. Falhas revertem a transação e não registram a versão 004.
- O índice existente `company_members_user` permanece e `company_members_active_user(user_id,status,company_id)` apoia as consultas de membership ativa.
- As migrations 001–003 não foram editadas. O journal/checksum torna a segunda execução um no-op. Não se deve apagar o journal nem executar uma versão antiga da aplicação após aplicar a 004.

Empresas continuam com status `active/suspended`; `inactive` não é um valor aceito pela CHECK atual de empresas. Membership usa `inactive` para desativação; remoção também pode excluir a linha. `removed` não foi adicionado como terceiro status. A resolução aceita apenas valores `active`, sem regras de assinatura ou cobrança.

O bootstrap histórico ainda pode criar memberships `admin` **antes** da 004 durante a adoção de uma base antiga. Depois da 004, `bootstrapIgorCompany` não deduz acessos a partir de `users.role` nem recria memberships removidas. O seed de uma instalação nova cria o primeiro administrador legado e sua membership `manager` em uma única transação. Não concede acesso a administradores globais preexistentes sem vínculo. Nenhum usuário é promovido automaticamente a `owner` ou Super Admin.

## Seleção autenticada

`server/company-access.js` centraliza:

- `listUserCompanies(db,userId)`: empresas ativas com membership ativa, sem credenciais/configurações privadas.
- `resolveCompanyContext(db,user,selector)`: valida identidade, existência, status e vínculo; somente então produz o contexto.
- `requireCompanyRole`: permite gestão somente a `owner/manager` no contexto verificado daquela identidade.
- `canManageCompany`: verificação equivalente para a exceção de disponibilidade usada na remarcação; usa o mesmo adaptador transacional da consulta.
- `resolvePublicCompany`: resolve slug ativo ou o alias canônico legado.

O seletor administrativo é `X-Gradefy-Company-Id`. Body, query string e outros headers não selecionam empresa. O header só tem efeito nas rotas `/api/admin/*`; não altera o contexto de um site público.

| Situação administrativa                         | Resposta                                               |
| ----------------------------------------------- | ------------------------------------------------------ |
| Sem identidade válida                           | 401 `AUTH_REQUIRED`                                    |
| Sem membership ativa em empresa ativa           | 403 `COMPANY_ACCESS_DENIED`                            |
| Uma empresa ativa e nenhum seletor              | Seleção automática daquela empresa                     |
| Várias empresas ativas e nenhum seletor         | 409 `COMPANY_CONTEXT_REQUIRED`                         |
| Seletor sem vínculo, desconhecido ou suspenso   | 403 `COMPANY_ACCESS_DENIED`, sem distinguir os motivos |
| Seletor vazio, composto por vírgula ou inválido | 400 `INVALID_COMPANY_SELECTOR`                         |
| Papel `professional`                            | 403 `COMPANY_ROLE_DENIED`                              |
| Recurso de outra empresa no contexto autorizado | 404/indisponível, sem revelar sua empresa              |

Não existe fallback para Igor nem escolha da primeira empresa quando há múltiplos vínculos. A lista é ordenada somente para apresentação; o resolvedor verifica sua cardinalidade. A desativação, remoção ou mudança de papel tem efeito na próxima requisição com o mesmo JWT.

GET `/api/companies` é autenticado e retorna apenas `id,name,slug,status,niche,template,role` das memberships e empresas ativas. Não há endpoint de criação de empresas, membros ou onboarding nesta fase.

## Contexto público e compatibilidade Igor

O prefixo novo é `/api/public/:companySlug`. Slug é único no banco, resolvido com parâmetro SQL e exige empresa ativa. Slug inexistente ou suspenso responde 404 `COMPANY_NOT_FOUND`. Não há resolução por hostname nesta entrega.

Rotas disponíveis no prefixo:

| Método     | Sufixo                                                                      |
| ---------- | --------------------------------------------------------------------------- |
| GET        | `/services`, `/barbers`, `/barbers/:id/schedule`, `/availability`           |
| GET        | `/portfolio`, `/portfolio/:id/image`                                        |
| GET / POST | `/appointments` (próprio histórico / reserva autenticada)                   |
| POST       | `/appointments/guest`                                                       |
| PATCH      | `/appointments/:id/reschedule`, `/appointments/:id/cancel`                  |
| GET / POST | `/auth/me`, `/auth/logout` (identidade global e visitante naquele contexto) |

O acesso de demonstração já existente, quando explicitamente habilitado em banco efêmero, permanece sujeito ao contexto e às proteções anteriores. Nenhum acesso sem verificação foi ativado em produção.

Rotas administrativas são recusadas dentro do prefixo público. Login, cadastro, perfil, recuperação de senha, health e config permanecem endpoints globais `/api/...`, fora da resolução do estabelecimento. Assim, suspender Igor não impede a autenticação de um membro de outra empresa.

As URLs legadas de serviços, profissionais, reservas, agenda e portfólio apontam explicitamente para o ID canônico Igor. Usam os mesmos handlers das rotas por slug. O painel administrativo legado funciona sem header quando há apenas uma membership ativa, inclusive após `admin → manager`.

`createCompanyRouter(companyId)` conserva SQL e funções com contexto explícito. Um cache limitado a 64 routers guarda apenas handlers vinculados ao ID; status, slug e memberships são lidos novamente por requisição. Não armazena autorização. O rate limiter de reservas permanece fora do cache para que a expulsão de um router não reinicie o limite. Alterar o slug não mantém links antigos no portfólio: URLs de imagens são formadas com o contexto validado da requisição atual.

Serviços/profissionais estrangeiros são rejeitados antes da gravação, além das FKs compostas. Toda alteração mantém lookup e WHERE por empresa. DELETE de foto/bloqueio preserva seu contrato idempotente antigo (200 sem efeito para recurso ausente); isso não confirma existência de um recurso estrangeiro.

## Visitantes e background

O nome do cookie visitante da Igor permanece inalterado. Outras empresas usam o mesmo prefixo com um sufixo determinístico derivado do ID empresarial. Cookies continuam HttpOnly e com os atributos de segurança anteriores. Token e sessão são sempre buscados com empresa; copiar um token de B para o nome de cookie de A não recupera B. Os dois contextos podem manter visitantes simultaneamente no navegador.

Eventos carregam `company_id` na outbox. `createCompanyNotificationDispatcher` descobre IDs empresariais a partir de eventos pendentes, ligados a empresas ativas, e chama o worker com cada ID explicitamente. Essa consulta de despacho é intencionalmente global e retorna apenas IDs; nenhum usuário ou JWT seleciona a empresa do job. O worker mantém claims, destinatário, atualizações e retries no escopo empresarial. Empresas suspensas não são selecionadas pelo dispatcher.

Branding, APP_URL, remetentes e provedores continuam com a configuração legada. Links de divulgação de agenda e páginas do frontend continuam destinados ao site Igor: **esta fase não disponibiliza sites/interfaces para B**. Antes de divulgar ou operar novos estabelecimentos com clientes reais, é necessário implementar seus templates/URLs de atendimento e configuração de comunicação. Os testes de envio simulam os provedores; não enviam mensagens reais.

## Testes

`tests/helpers/multitenant-access.js` amplia o contrato de `tests/helpers/application-context.js`, executado em SQLite e PostgreSQL. Tenta acessos A→B e B→A, alterações de serviços, portfólio, reservas/status, bloqueios e agenda; reserva com serviço/profissional estrangeiro; vazamento de histórico; token visitante trocado; notificações com referência cruzada; seletor sem membership; claims empresariais no JWT; global admin sem vínculo; manager com papel global client; professional; owner; 0/1/múltiplas memberships; revogação com JWT obtido por login real; suspensão e mudança de slug com router já em cache.

A suíte também verifica que bootstrap/seed não recriam acessos revogados, que reserva não gera membership, que links de imagens de B são utilizáveis e que a consulta transacional de disponibilidade na remarcação não fica bloqueada na fila SQLite.

`tests/helpers/access-migration.js` cria uma instalação com checksums reais até 003, injeta falha após a substituição de schema/roles da 004 e comprova rollback, preservação das tabelas e journal, permanência da restrição anterior no rollback, nova aplicação bem-sucedida, repetição sem alterações, preservação de papéis/status/índice personalizado e coexistência de empresas com FKs. `tests/multitenant-migration.test.js` executa em SQLite; a suíte PostgreSQL executa o mesmo contrato.

Os testes antigos que exigiam bloqueio permanente de segunda empresa foram atualizados para o estado após 004. A restrição pré-004 continua testada no cenário de upgrade/rollback. Os testes de checksum, constraints, concorrência, preservação e idempotência permanecem.

Comandos de validação: `npm.cmd test`, `npm.cmd run build`, `npm.cmd run test:e2e`, `npm.cmd run format:check`, `git diff --check`; em `app-mobile`, `npm.cmd test` e `npm.cmd run typecheck`. PostgreSQL: `node tests/postgres/run-local.mjs --bin <bin-PostgreSQL-17.11>`.

O runner PostgreSQL portátil cria cluster novo em `127.0.0.1`, porta aleatória, autenticação SCRAM e marcador de validação. Não usa URLs do ambiente nem Supabase. Para testes SQLite, usa-se memória ou diretórios temporários. O relatório PostgreSQL local fica em `test-results/postgres-validation/`; o cluster é parado e removido ao terminar.

## Resultados e arquivos

Validação final em 30/09/2026:

| Verificação                                     | Resultado                                  |
| ----------------------------------------------- | ------------------------------------------ |
| Unitários, integração e SQLite (`npm.cmd test`) | 80 aprovados, zero falhas                  |
| PostgreSQL 17.11, cluster local descartável     | 35 testes/subtestes aprovados, zero falhas |
| E2E web Chromium, com cenários desktop/mobile   | 16 aprovados                               |
| Build web, TypeScript e checkJs da agenda       | Aprovados                                  |
| Testes mobile                                   | 5 aprovados                                |
| Typecheck mobile                                | Aprovado                                   |
| Prettier e `git diff --check`                   | Aprovados                                  |

As comparações financeiras do contrato anterior permanecem iguais nos dois bancos: R$ 95,00 anuais na fixture Igor, três atendimentos e ticket médio R$ 31,67; R$ 9.999,99 diários de B não entram em A. As diferenças já conhecidas de COUNT (string em pg, número em SQLite) permanecem sem mudança de contrato. Nenhuma divergência funcional nova ficou pendente.

Criados: `server/company-access.js`, `server/multitenant-migration.js`, `server/migrations/004-gradefy-multitenant-access.sql`, `tests/helpers/access-migration.js`, `tests/helpers/multitenant-access.js`, `tests/multitenant-migration.test.js`, `docs/GRADEFY-MULTITENANCY.md`.

Modificados no servidor: `server/app.js`, `server/company-bootstrap.js`, `server/company-context.js`, `server/guest-session.js`, `server/index.js`, `server/migrations.js`, `server/notifications.js`, `server/portfolio.js`, `server/schedule.js`, `server/seed.js`, `server/serverless.js`.

Modificados em testes: `tests/application-context.test.js`, `tests/company-bootstrap.test.js`, `tests/company-integrity.test.js`, `tests/company-migration.test.js`, `tests/data-ownership.test.js`, `tests/helpers/application-context.js`, `tests/helpers/data-ownership.js`, `tests/helpers/foundation-integrity.js`, `tests/postgres/foundation.test.js`.

Documentação existente atualizada: `docs/GRADEFY-MIGRATION.md` e `docs/ARCHITECTURE.md`.

O diff de `src/`, `app-mobile/` e migrations 001–003 está vazio. As suítes anteriores foram adaptadas somente onde o contrato esperado mudou com a 004 (papel manager, quarta versão e coexistência), mantendo as verificações de integridade e preservação.

## RLS futura e limites

A autorização atual funciona na aplicação e as FKs compostas reforçam a integridade, sem RLS. Futuramente, uma conexão de aplicação sem BYPASSRLS poderá receber empresa/identidade validadas via configuração **local à transação**, com políticas USING/WITH CHECK nas tabelas operacionais. O pool não deverá carregar contexto entre requisições. Migrações, bootstrap e dispatcher precisarão de papéis/processos separados e testes próprios, inclusive com FORCE ROW LEVEL SECURITY se aplicável. Esse desenho exige revisão antes da ativação; nenhuma política ou alteração de permissões de banco foi aplicada aqui.

Limites deliberados: não há selector visual, gestão de memberships, vínculo profissional↔usuário, onboarding, Super Admin, preços, cobrança, trial, limites de planos, domínios próprios ou templates novos. Os locks globais, concorrência e evolução do processamento da fila ficam para a Fase 4. Membership revogada bloqueia requisições seguintes; esta entrega não tenta interromper uma requisição que já passou pela autorização e está em execução.

O frontend legado ainda apresenta o papel global e não implementa seleção entre empresas. Um usuário com múltiplos vínculos deverá enviar o header por um cliente de API até a futura interface. Não remover essa exigência criando fallback automático.

Nenhuma interface, identidade visual, funcionalidade mobile ou migration 001–003 foi alterada. Nenhum banco de produção foi acessado. Nenhum commit ou push foi feito.
