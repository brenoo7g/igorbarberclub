# Gradefy — Fase 4: confiabilidade da agenda

Esta fase modifica somente o backend e seus testes. Preserva autenticação, cookies, JWT, rotas legadas, interfaces web/mobile, preços e regras comerciais. Nenhum plano, cobrança, onboarding, RLS ou branding dinâmico foi implementado. PostgreSQL é a referência de concorrência; SQLite continua suportado com escrita serializada.

## Migração e implantação

`005-gradefy-scheduling-reliability.sql` é aditiva e transacional. Não modifica 001–004 nem seus checksums, não recria tabelas legadas e não altera registros existentes.

- `idempotency_keys`: `company_id`, `actor_hash`, `operation`, `key_hash`, `request_hash`, `response`, `created_at`, `expires_at`. PK composta pelos quatro primeiros campos; FK empresarial; campos obrigatórios explicitamente `NOT NULL`; validações de tamanho, operação e expiração.
- `notifications`: adiciona `claim_token`, `claimed_at`, `lease_expires_at`, `first_attempt_at` e `delivery_payload`, inicialmente `NULL`.
- Índices `idempotency_expiration` e `notification_recovery`.
- A tabela de idempotência contém somente resultados confirmados. Não precisa de status `processing`: resultado e dados de negócio são gravados na mesma transação, sem registros intermediários visíveis.

O inicializador e `npm run db:migrate` aplicam a 005 uma única vez e validam todo o histórico antes de novas versões. Falha de DDL reverte também o journal. Uma instalação atual registra 1–5. Retornar ao código da Fase 3 após migrar não é suportado: ele rejeita a versão desconhecida.

**Corte de implantação:** drene requisições e workers da versão anterior antes de liberar os novos. Instâncias antigas usam o lock global de agenda e não conhecem leases; elas não participam do novo protocolo. Não faça uma implantação com as duas gerações processando reservas ou a mesma fila simultaneamente. Faça backup/restauração e ensaio em homologação antes de uma implantação futura. Nenhum banco de produção foi acessado nesta validação.

## Locks e transações

`server/scheduling-locks.js` deriva uma chave de advisory lock PostgreSQL de 64 bits de `namespace + companyId + tipo + recurso`, via SHA-256. É estável entre instâncias. Uma eventual colisão reduz paralelismo, mas não retira proteção. Locks são transacionais: PostgreSQL os libera no commit, rollback ou queda da conexão.

| Recurso      | Escopo                     | Operações                                                                                  |
| ------------ | -------------------------- | ------------------------------------------------------------------------------------------ |
| Catálogo     | Empresa                    | Reserva/remarcação: compartilhado; alteração/exclusão de serviço: exclusivo                |
| Agendamento  | Empresa + appointment ID   | Remarcação, cancelamento e mudança administrativa de status                                |
| Agenda       | Empresa + profissional     | Confirmação, remarcação, cancelamento, status, bloqueios, expediente e liberação de semana |
| Visitante    | Empresa + credencial opaca | Criações concorrentes no mesmo navegador reutilizam uma identidade                         |
| Idempotência | Empresa + ator             | Protege resultado e limite de chaves do mesmo ator                                         |

A ordem é: idempotência, visitante (na criação), catálogo, agendamento existente, profissionais **ordenados por ID**, depois linhas de visitante. Uma operação pode omitir recursos de que não precisa, mas não inverte essa ordem. Remarcações travam tanto o profissional de origem quanto o de destino. Cancelamentos/status travam o agendamento antes de descobrir seu profissional atual. Isso evita usar um profissional desatualizado ou travar recursos em sentidos opostos.

Não há lock global de agenda nem de claim de notificações. O lock global de inicialização/migrations é mantido porque o schema é compartilhado. Identidade/recuperação de senha global não foi transformada em entidade empresarial nesta fase. Operações não relacionadas à agenda conservam suas próprias regras. O pool de conexões e recursos físicos continuam compartilhados: independência de locks não promete capacidade infinita.

Reservas comuns de profissionais diferentes compartilham o lock de catálogo, sem se serializar. A edição de serviços espera confirmações em andamento da **mesma empresa**, garantindo que preço e duração oficiais não mudem no meio da reserva. O mesmo ator com chave idempotente ou a mesma sessão visitante pode precisar de serialização por compartilhar identidade/quota.

`GET /availability` e leituras de configuração usam transação `REPEATABLE READ READ ONLY` no PostgreSQL, sem advisory lock exclusivo. Exibem um snapshot consistente; disponibilidade não é reserva. A confirmação revalida tudo sob lock. SQLite usa `BEGIN` para essas leituras; a conexão continua enfileirada.

## Criação, remarcação e bloqueios

Dentro de uma única transação: valida empresa ativa e profissional da empresa, lê serviços oficiais, calcula duração/total, confere expectativas do cliente, expediente, intervalos, abertura manual/automática, bloqueios e reservas; grava appointment, snapshots, vínculo visitante quando necessário, outbox, resposta idempotente; então faz commit. A resposta da reserva também é capturada dentro da transação. Falha em qualquer etapa não deixa reserva parcial ou notificação órfã.

`expectedTotal`/`expectedDuration` são expectativas, nunca valores cobrados. Divergência retorna 412. `appointment_services` mantém o snapshot histórico; editar catálogo não reescreve reservas. A API continua aceitando exatamente um serviço por nova reserva; históricos antigos com múltiplos itens são preservados.

Ocupam agenda: **`confirmed` e `completed`**. Liberam horário: **`cancelled` e `no-show`**. Os limites são intervalos semiabertos `[início,fim)`: um atendimento pode começar quando outro termina. Folgas, almoço, duração, fuso brasileiro e abertura de semanas mantêm o algoritmo existente.

Precedência é a ordem de aquisição do lock, não a ordem de chegada HTTP:

- Duas criações incompatíveis: uma confirma, outra recebe 409; só a primeira gera outbox.
- Duas remarcações do mesmo appointment: são serializadas e revalidadas; ambas podem ter sucesso e a última válida prevalece. Cada sucesso gera seu evento. Não foi criado contrato novo de versão de appointment.
- Remarcação concorrendo com cancelamento: se cancelamento vence, a remarcação é recusada; se remarcação vence, cancelamento avalia o estado atualizado. Cancelamento concluído nunca é revertido pela remarcação.
- Status administrativo segue a mesma proteção e restrições de horário já existentes.
- Reserva versus bloqueio: disputam a mesma agenda, consultam conflitos depois do lock; apenas um estado compatível é confirmado.
- Exclusão de bloqueio trava seu profissional. IDs e empresa permanecem nos filtros.
- Expediente e abertura semanal usam o mesmo lock do profissional; versões e proteção de atendimentos já confirmados foram mantidas.

### Por que não adicionar EXCLUDE nesta fase

Uma exclusion constraint PostgreSQL poderia combinar empresa, profissional, data e `int4range`, filtrando os status ocupantes. Porém, os dados legados/fixtures contêm sobreposições históricas e os bloqueios vivem em outra tabela. Isso exigiria auditar/reconciliar legado, decidir extensão `btree_gist` e manter mecanismo distinto no SQLite, sem resolver sozinho reserva versus bloqueio. Nesta fase, a garantia vem das transações/advisory locks, comprovadas por testes PostgreSQL. Escritas SQL externas podem contorná-la: integrações e futuras rotas devem respeitar o mesmo protocolo.

## Contrato de idempotência

Header opcional `Idempotency-Key` nas criações:

- `POST /api/appointments` e alias público por slug;
- `POST /api/appointments/guest` e alias público por slug;
- `POST /api/admin/blocks` com contexto administrativo autorizado.

Formato: 8–128 caracteres ASCII em `[A-Za-z0-9._:-]`; UUID é uma boa opção. Escopo: **empresa + hash do ator + operação + hash da chave**. O ator é o usuário autenticado ou a credencial opaca de visitante, nunca e-mail/telefone. A operação separa reserva autenticada, reserva visitante e bloqueio. Não modifica autorização nem concede acesso a outra empresa.

Mesmo escopo e payload normalizado: retorna o corpo original e 201, inclusive se o recurso depois for remarcado. Mesmo escopo e payload diferente: 409. Formato inválido: 400. Falhas de validação/transação não consomem a chave. Sem header, comportamento anterior é mantido, mas não há promessa de replay HTTP idempotente.

Visitantes que usam o header precisam primeiro obter e conservar o cookie opaco por `GET /api/auth/me` (ou alias da empresa). Falta/expiração desse contexto: 428. Se uma credencial precisar ser rotacionada durante a reserva, a operação keyed é revertida; limpe a sessão via logout e obtenha novo contexto antes de tentar novamente. Não se associa identidade apenas por conhecer nome/e-mail. O cliente móvel futuro deve conservar seu cookie e sua chave durante retries. Nenhuma interface/mobile foi alterada para enviar o header nesta fase.

O fingerprint usa JSON com chaves de objetos ordenadas, depois da validação do corpo. Guarda-se somente a resposta necessária para replay fiel, incluindo contatos já retornados pela API; não se armazenam cookies, senhas, JWT ou chaves de provedor. Isso acrescenta uma cópia temporária de dados pessoais, sujeita à retenção abaixo.

Retenção: **24 horas desde o commit**. Limite: **1.000 chaves ativas por ator/empresa**, somadas as operações; excesso retorna 429. Limpeza de expiradas ocorre nas novas requisições keyed e no dispatcher, inclusive para empresas suspensas ou sem mensagens pendentes. É possível invocar `cleanIdempotency(db, companyId)` em manutenção autorizada. Não há cron novo. Com aplicação completamente parada, linhas expiradas ficam até a próxima execução, sem crescimento enquanto não há tráfego. Depois da expiração, uma chave pode representar nova operação: não a reutilize deliberadamente para outro comando enquanto válida.

## Outbox, claim e recuperação

Eventos são inseridos na transação de negócio com `company_id` e FK composta do appointment. O dispatcher descobre empresas pelo banco, processa até quatro filas empresariais em paralelo e ignora empresas suspensas. Nenhum worker recebe cookies ou depende de contexto HTTP. Credenciais de provedor e URL ainda são configurações compartilhadas do deployment; não há configuração dinâmica de provedor por empresa nesta fase. As funções recebem contexto explícito e todas as consultas usam empresa + ID.

Claim PostgreSQL: `SELECT ... FOR UPDATE OF n SKIP LOCKED`, uma mensagem imediatamente antes do envio. A mesma transação registra token exclusivo, incremento de tentativas, horários, lease e envelope. SQLite usa sua transação de escrita serializada. O flag local `busy` apenas evita sobreposição do timer local; a segurança entre instâncias vem do banco.

- Lease: **60 segundos**; timeout HTTP: **15 segundos**.
- PostgreSQL fornece o relógio do claim/lease, evitando roubo por diferença de relógio entre instâncias.
- Nome/e-mail/telefone atuais são consultados na **primeira tentativa**; detalhes do evento ficam históricos. O envelope completo é então congelado, incluindo remetente, para todas as repetições.
- O ack/erro exige `company_id + id + status sending + claim_token`. Worker antigo não sobrescreve uma tentativa mais nova.
- E-mail `sending` com lease expirado volta a ser elegível dentro da janela segura; incrementa tentativas sem zerar o contador.
- Máximo de **5 tentativas**, backoff **1, 2, 4, 8 minutos** entre tentativas; após a quinta falha conhecida, `failed`. Não há retry infinito.
- Canal sem configuração fica pendente e não impede claim do canal configurado.
- Payload inválido vira `failed`; empresa suspensa mantém fila sem envio.

### Limites dos provedores e estado review

Resend utiliza `notification.id` como `Idempotency-Key`, preservando exatamente o corpo. A documentação informa validade de 24h e exige payload igual. O worker usa limite conservador de **23h desde o primeiro claim**, evitando reenvio automático quando a proteção pode ter expirado. [Resend: engenharia de idempotência](https://resend.com/blog/engineering-idempotency-keys).

A API Messages da Twilio usada aqui não oferece, no contrato adotado, a mesma chave persistente de criação. Não se presume exactly-once. Timeout/erro de rede, HTTP 5xx ou lease abandonado de WhatsApp levam a `review`, sem retry cego. Erros HTTP conhecidos não ambíguos podem seguir o backoff limitado. [Twilio: recurso Messages](https://www.twilio.com/docs/messaging/api/message-resource).

Eventos anteriores à 005 com tentativas já feitas, sem envelope/horário inicial confiável, também vão para `review` quando elegíveis. A migration preserva seus registros; não inventa que uma tentativa anterior não aconteceu. Pendentes antigos nunca tentados continuam normalmente. E-mail fora da janela segura e tentativa abandonada no limite igualmente exigem revisão.

`review` é terminal para automação nesta fase. O operador deve reconciliar o ID da notificação com logs do provedor antes de decidir um reenvio; não zere tentativas ou volte indiscriminadamente a `pending`. Não foi criada interface de revisão. `sent` significa que o provedor aceitou a chamada, não que a mensagem entrou na caixa principal.

Se o provedor aceitou e o processo caiu antes do ack, não existe transação distribuída entre banco e provedor. Resend reduz duplicação dentro de sua janela; Twilio é encaminhado para revisão. Pausas do processo superiores à lease e falhas externas não permitem prometer exactly-once absoluto. Eventos diferentes de um mesmo appointment também podem ser entregues fora de ordem por workers/provedores; esta fase não implementa ordenação externa de mensagens.

O texto e os links visuais da Igor são compatibilidade legada. Branding e destino público dinâmicos por empresa, credenciais empresariais de provedor, revisão assistida de entrega e eventual constraint de exclusão ficam para fases futuras.

## Testes e reprodução

Suíte compartilhada: `tests/helpers/scheduling-reliability.js`. SQLite: `tests/scheduling-reliability.test.js`; PostgreSQL: `tests/postgres/scheduling.js`, invocado apenas pelo harness protegido de `foundation.test.js`.

- Migration em banco vazio e upgrade 004→005, reaplicação, checksum, rollback após DDL e preservação de dados/IDs anteriores.
- Cenários A–L: dupla reserva, empresas/profissionais independentes, reserva contra bloqueio, remarcações, cancelamento, replay/mismatch/escopo de chave, workers concorrentes, abandono de lease e limite de tentativas.
- PostgreSQL: **10 repetições por cenário A–L em cada execução da suíte**; SQLite: 5, com ressalva explícita de escrita serializada.
- Dois servidores Express e dois pools PostgreSQL independentes. Barreira mantém agenda A travada enquanto B, outro profissional de A e disponibilidade respondem. Outra barreira testa alteração de catálogo antes da confirmação; movimentos opostos entre profissionais exercitam ordenação de locks.
- Snapshot de resposta, visitante sem login, falha de outbox com rollback integral, bloqueio idempotente, quota/expiração, envelope imutável e ack tardio de worker antigo.
- Suítes anteriores: autorização A↔B, histórico, snapshots financeiros, intervalo/folga/abertura manual, identidade e interfaces permanecem cobertos.

Com PostgreSQL portátil local disponível:

```powershell
node tests/postgres/run-local.mjs --bin '<pasta local do PostgreSQL 17.11>\bin'
```

O runner cria cluster SCRAM descartável, porta aleatória exclusivamente `127.0.0.1`, valida marcador/data_directory, não lê `.env`, limpa URLs herdadas e encerra/remove seu próprio cluster. Relatórios ficam em `test-results/postgres-validation/`. Não usa Supabase nem serviços Windows existentes.

```powershell
$env:DOTENV_CONFIG_PATH='NUL'
$env:DATABASE_URL=''
$env:POSTGRES_URL=''
npm.cmd test
npm.cmd run test:e2e
npm.cmd run build
npm.cmd run format:check
npm.cmd --prefix app-mobile test
npm.cmd --prefix app-mobile run typecheck
git diff --check
```

SQLite não possui advisory locks nem `SKIP LOCKED`, tem um escritor por banco e usa fila por conexão neste adaptador. Seus testes não provam paralelismo de produção. PostgreSQL usa MVCC, locks distribuídos e relógio do banco; ambos preservam DDL transacional, FKs e obrigatoriedade explícita dos campos novos. Produção requer PostgreSQL, todas as instâncias no mesmo banco/protocolo, workers sendo efetivamente executados e monitoramento de `review`/`failed`.

## Resultado da validação — 01/10/2026

| Verificação                                         | Resultado                                            |
| --------------------------------------------------- | ---------------------------------------------------- |
| Unitários/integração/SQLite                         | 88 aprovados, nenhuma falha                          |
| PostgreSQL 17.11, incluindo fundação e concorrência | 45 aprovados, nenhuma falha                          |
| Repetições da suíte de concorrência                 | 10 por cenário A–L na rodada PostgreSQL; 5 na SQLite |
| E2E web Chromium, desktop/mobile responsivo         | 16 aprovados, exit code 0                            |
| Build web, TypeScript e check JS da agenda          | Aprovados                                            |
| Testes de lógica mobile                             | 5 aprovados                                          |
| Typecheck mobile                                    | Aprovado                                             |
| Prettier e `git diff --check`                       | Aprovados                                            |

O PostgreSQL foi provisionado pelo runner portátil local em cluster novo, sem Docker, e foi encerrado/removido após a suíte. O relatório registra `productionAccess: false`. Envios reais não foram realizados: testes substituem o transporte HTTP dos provedores. A exceção `injected outbox failure` nos logs é proposital e comprova rollback, não uma falha da suíte. A primeira rodada também identificou expectativas antigas de schema nos testes; foram atualizadas para verificar a nova tabela e exigir `NULL` nas colunas adicionadas, preservando os registros antigos.

Arquivos criados:

- `server/migrations/005-gradefy-scheduling-reliability.sql`
- `server/scheduling-locks.js`
- `server/idempotency.js`
- `tests/helpers/notification-migration.js`
- `tests/helpers/scheduling-reliability.js`
- `tests/postgres/scheduling.js`
- `tests/scheduling-reliability.test.js`
- `docs/GRADEFY-SCHEDULING-RELIABILITY.md`

Arquivos modificados:

- `server/app.js`
- `server/database.js`
- `server/migrations.js`
- `server/notifications.js`
- `server/schedule.js`
- `tests/company-integrity.test.js`
- `tests/company-migration.test.js`
- `tests/data-ownership.test.js`
- `tests/guest.test.js`
- `tests/helpers/access-migration.js`
- `tests/helpers/data-ownership.js`
- `tests/notifications.test.js`
- `tests/postgres/foundation.test.js`
- `docs/GRADEFY-MIGRATION.md`
- `docs/ARCHITECTURE.md`

Nenhum arquivo de `src/`, `app-mobile/`, autenticação ou migrations 001–004 foi alterado. Nenhum preço/plano foi aplicado; nenhum Supabase/produção foi acessado; sem commit ou push.
