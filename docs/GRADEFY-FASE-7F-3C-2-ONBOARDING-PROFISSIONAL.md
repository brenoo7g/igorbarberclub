# Gradefy — Fase 7F.3C.2: onboarding do profissional

## Escopo e investigação

Implementação em `gradefyapp-recuperado`, branch `feat/gradefy-foundation`, partindo do commit `1536318` e de uma árvore limpa. A cópia antiga no diretório pai não foi alterada. Nenhum commit ou push foi feito nesta fase.

A Fase 7F.3C.1 já cria ou associa o cadastro ao aceitar o convite. O painel anterior permite consultar horários e concluir atendimentos próprios, mas profissionais inativos não podiam configurar a rotina. O motor existente já combina dias pessoais, intervalos, políticas empresariais, modo automático/manual, duração dos serviços, bloqueios e reservas. Essa estrutura foi reaproveitada.

## Fluxo

1. O aceite de um convite profissional com vínculo explícito retorna `nextPath`, calculado pelo backend na transação. A interface navega diretamente para ele, removendo o segredo do convite da URL atual.
2. Com sete dias efetivamente persistidos e uma rotina válida com pelo menos um dia ativo, segue para Minha Agenda. O fallback legado de `readSchedule` não comprova configuração.
3. Sem rotina completa, segue para `/app/minha-agenda/configurar?empresa=ID`.
4. O assistente tem Dias de trabalho, Horários, Intervalos e Revisão. Mostra estabelecimento, profissional, fuso, expediente geral e pausas obrigatórias. Permite até quatro pausas pessoais por dia.
5. Salvar leva à agenda com confirmação. Profissional novo continua inativo e sem serviços; horários, serviços e autorização de ativação são estados distintos.
6. Minha Agenda oferece **Configurar meus horários** para voltar ao editor. Conta → Minha Agenda também detecta configuração pendente após novo login ou recarregamento.
7. Gestores preservam seu fluxo administrativo. Convites legados sem intenção de associação preservam o vínculo manual da fase anterior; não se inventa um profissional por nome ou e-mail.

As alterações do assistente só são persistidas ao salvar a revisão. Recarregar antes de salvar recupera a rotina persistida. Existe saída para Minha conta antes da conclusão; o profissional não precisa ativar o próprio cadastro para terminar a configuração.

## Endpoints e permissões

| Endpoint                              | Ação                                                                                         |
| ------------------------------------- | -------------------------------------------------------------------------------------------- |
| `GET /api/professional/availability`  | Rotina, políticas gerais, estado e bloqueios pessoais próprios                               |
| `PUT /api/professional/availability`  | Salvar rotina própria, versão e modo de abertura                                             |
| `POST /api/professional/blocks`       | Bloquear intervalo pessoal futuro                                                            |
| `DELETE /api/professional/blocks/:id` | Remover somente bloqueio pessoal criado pela própria conta, no cadastro atualmente vinculado |

Todos exigem sessão existente e `X-Gradefy-Company-Id`. O backend resolve novamente empresa, membership ativo, papel `professional` e vínculo exato. Não aceita identificador de outro profissional no payload ou na consulta. Conta de gestor/proprietário usa seus endpoints administrativos existentes.

O profissional não recebe preço, informações financeiras, contatos de clientes, permissões de equipe nem dados de outros profissionais nessas respostas. Não modifica serviços, empresa, plano, assinatura, ativação ou vínculos. Profissional inativo com vínculo válido e assinatura habilitada pode configurar a disponibilidade sem ocupar uma vaga ativa. A ativação continua exclusiva da gestão, com a verificação existente de capacidade do plano.

Minha Agenda e os cards administrativos de Profissionais mostram agenda pendente, agenda configurada aguardando serviços/ativação ou prontidão. Prontidão é condição de configuração, não garantia de um horário livre em uma data; a disponibilidade efetiva continua sendo calculada pelo motor de reservas.

## Recorrência e preservação

- Novo assistente oferece modo automático na revisão. Rotina já configurada mantém seu modo atual; nenhuma leitura converte uma agenda manual.
- Modo automático usa `barber_settings.agenda_mode='auto'`, sem inserir semanas, slots ou bloqueios recorrentes adicionais.
- O horizonte pessoal existente não pode ser aumentado pelo endpoint próprio. O limite empresarial `maximum_booking_days`, quando definido, continua aplicado em dias corridos pelo motor original.
- Folgas, pausas empresariais, pausas pessoais, duração do serviço, buffers, antecedência, reservas e bloqueios continuam filtrando a disponibilidade real.
- Horários pessoais ativos devem ficar dentro do expediente empresarial quando este existe. Os intervalos da empresa continuam obrigatórios mesmo sem serem copiados para a rotina pessoal.
- Empresas legadas sem expediente geral (`working_days_json=NULL`) mantêm a rotina pessoal como referência. A interface informa essa condição; não inventa um expediente empresarial ou muda o legado.
- As escritas reutilizam o lock do barbeiro e a rotina extraída `saveSchedule`. Reservas confirmadas futuras ou em andamento que deixariam de caber no expediente efetivo impedem a alteração com HTTP 409 e data/horário do conflito. Não se cancelam nem remarcam reservas automaticamente.
- Todos os bloqueios existentes são preservados ao editar a rotina. Só bloqueios com origem pessoal comprovada podem ser removidos no painel profissional; bloqueios administrativos continuam protegidos.
- Datas e horários permanecem locais à empresa, usando `currentTime`, `dateInTimezone`, `isFuture` e o fuso já cadastrado. Não há conversão de data ISO por meia-noite UTC no assistente.

## Concorrência e erros

As escritas mantêm a ordem de locks: acesso à equipe compartilhado, entitlements, políticas operacionais compartilhadas, idempotência do ator e barbeiro. SQLite serializa a transação de escrita; PostgreSQL usa os advisory locks existentes. Revogação e troca de vínculo não autorizam uma escrita que estava aguardando o lock.

O salvamento exige a versão pessoal e a versão das políticas gerais. A transação valida tudo novamente depois dos locks. O profissional pode recarregar a configuração quando a gestão altera o expediente ou outra aba salva primeiro.

PUT e POST reutilizam a idempotência persistente existente. A chave pertence à empresa, ator, operação e payload, incluindo o vínculo profissional resolvido. Repetir a mesma chave/payload devolve o resultado original; payload diferente retorna 409. Rollback remove simultaneamente alterações e registro da chave. A interface reutiliza a chave após perda da resposta, sem reenviar escritas automaticamente.

Falha de leitura oferece **Tentar novamente** e saída para a conta. Um erro isolado 401 continua usando a verificação canônica de sessão da fase anterior. O editor não recarrega automaticamente memberships diante de 403, evitando um ciclo de remontagem/requisição; o erro permanece recuperável. Cookies, JWT e autenticação não foram alterados.

## Migration 019

Arquivo: `server/migrations/019-gradefy-professional-availability.sql`.

Necessária porque a constraint da idempotência aceita uma lista explícita de operações. Amplia a lista com `own-availability-save` e `own-block-create`, reutilizando a infraestrutura existente. Em PostgreSQL, altera a constraint. Em SQLite, usa o padrão transacional das migrations anteriores: copia integralmente os registros para a estrutura equivalente, substitui somente essa tabela de metadados e recria o índice. Não descarta chaves existentes.

Adiciona índice único `(company_id,id)` em `blocks` e a tabela de origem `professional_personal_blocks`, com IDs explicitamente obrigatórios, FK composta para bloqueio da mesma empresa e FK composta para o membro. A exclusão de bloqueio remove sua origem por cascade, inclusive pelos endpoints administrativos já existentes. Bloqueios antigos não recebem dono presumido. O motor de reservas continua lendo `blocks` normalmente.

Migrations 001–018 intactas. Testes verificam execução repetida, rollback injetado durante 019, preservação de bloqueios/chaves, checksums anteriores, IDs NULL e referências inválidas. Reconstruções de schemas anteriores existem apenas em helpers de testes descartáveis.

## Validação

Os resultados finais e comandos executados estão registrados abaixo após a conclusão das suítes. Todos os testes usam bancos em memória ou um cluster PostgreSQL local descartável, sem `.env`, Supabase ou banco existente.

## Teste manual

Em um ambiente local/de teste já configurado, use a gestão de equipe para convidar uma nova conta como Profissional, escolhendo **Criar novo cadastro**. Entre na conta convidada, aceite o convite e confira o nome da empresa na URL/tela. Marque dias, horários, pausas e revise a recorrência. Salve: deve aparecer confirmação, seguida das pendências de serviços/ativação. Confira os mesmos estados em Profissionais na gestão.

Associe um serviço e autorize a ativação pela gestão. Confirme a rotina em Minha Agenda e os horários públicos nas próximas semanas. Crie um bloqueio pessoal futuro: o horário deve deixar de aparecer. Remova-o pela própria configuração e confira que um bloqueio administrativo não pode ser removido ali.

Cadastre uma reserva futura e tente fechar esse dia ou inserir uma pausa sobre a reserva: o salvamento deve falhar sem alterar a reserva. Faça logout/login e recarregue o assistente para conferir que a rotina salva permanece. Teste uma conta que seja profissional em uma empresa e gestor em outra, sempre mantendo `?empresa=`.

Para demonstração totalmente descartável: após `npm run build`, com `DOTENV_CONFIG_PATH=NUL`, `DATABASE_URL` e `POSTGRES_URL` vazias, execute `node tests/browser-server.js`. Abra `http://127.0.0.1:4173/app/login` e use o fixture `business-browser-owner@example.com` / `ClienteDemo2026!` para emitir convites em Clube Horizonte. Esses dados pertencem somente aos testes; o processo cria SQLite em memória. Encerre o processo para descartar a demonstração.

## Pendências e limites

Ativação e associação de serviços continuam sendo ações administrativas, intencionalmente. A rotina própria não publica o site nem habilita uma assinatura expirada. Sem expediente empresarial cadastrado, permanece a compatibilidade legada descrita acima. Até 100 bloqueios pessoais futuros são exibidos no editor; a agenda e o motor consideram todos os bloqueios.

Não foram implementados Mini Site novo, redesenho geral, push, pagamentos, cobrança ou Super Admin. Não houve acesso a produção, alteração de dados existentes, commit ou push.

## Arquivos criados

- `docs/GRADEFY-FASE-7F-3C-2-ONBOARDING-PROFISSIONAL.md`
- `server/migrations/019-gradefy-professional-availability.sql`
- `server/professional-availability.js`
- `src/gradefy/professional-setup.css`
- `src/gradefy/professional-setup.tsx`
- `tests/e2e/gradefy-professional-setup.spec.js`
- `tests/helpers/professional-availability-migration.js`
- `tests/helpers/professional-availability.js`
- `tests/professional-availability.test.js`

## Arquivos modificados

- `server/migrations.js`
- `server/professional-panel.js`
- `server/professionals.js`
- `server/schedule.js`
- `server/team.js`
- `src/gradefy/Shell.tsx`
- `src/gradefy/business-management.tsx`
- `src/gradefy/business-types.ts`
- `src/gradefy/professional-agenda.tsx`
- `src/gradefy/team.tsx`
- `src/main.tsx`
- `tests/company-integrity.test.js`
- `tests/company-migration.test.js`
- `tests/data-ownership.test.js`
- `tests/e2e/gradefy-address-invitations.spec.js`
- `tests/helpers/access-migration.js`
- `tests/helpers/agenda.js`
- `tests/helpers/barber-classic.js`
- `tests/helpers/business-management.js`
- `tests/helpers/company-onboarding.js`
- `tests/helpers/data-ownership.js`
- `tests/helpers/finance.js`
- `tests/helpers/operational-onboarding.js`
- `tests/helpers/operational-settings.js`
- `tests/helpers/professional-idempotency.js`
- `tests/helpers/professional-panel.js`
- `tests/helpers/professionals-migration.js`
- `tests/helpers/scheduling-reliability.js`
- `tests/helpers/session-address-invitations.js`
- `tests/helpers/session-address-migration.js`
- `tests/helpers/site-editor.js`
- `tests/helpers/team.js`
- `tests/postgres/foundation.test.js`
