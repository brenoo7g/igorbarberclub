# Gradefy — Fase 7F.4A.4: bloqueios, cancelamentos e avisos

## Política de produto

Um bloqueio criado pela nova interface exige uma prévia e confirmação explícita. A prévia mostra profissional, período inclusivo, fuso da empresa, quantidade e relação dos atendimentos confirmados afetados. Desistir ou fechar a prévia não grava bloqueios, cancelamentos ou notificações.

O usuário seleciona um dos motivos públicos: imprevisto pessoal, profissional indisponível, emergência no estabelecimento, motivo operacional ou outro com descrição. O motivo público aparece no histórico da reserva e no e-mail. Observações internas são gravadas separadamente na auditoria e não são incluídas em mensagens ou respostas de cliente. O campo livre é explicitamente identificado como público, com aviso para não inserir dados médicos, pessoais ou sensíveis; não há classificação automática do conteúdo escrito pelo operador.

É possível bloquear algumas horas, um dia inteiro, vários dias ou uma semana. Cada operação aceita até 31 dias, de hoje até dois anos à frente, conforme a data local da empresa. Em intervalos parciais com várias datas, o mesmo horário se aplica a cada dia; dia inteiro representa 00:00–24:00. Datas de folga também podem receber bloqueios, sem abrir disponibilidade.

## Consistência e autorização

Após confirmar, uma única transação grava o bloqueio diário, cancela os atendimentos confirmados afetados, registra motivo/responsável e insere os eventos persistentes de e-mail. A interseção é estrita: `início da reserva < fim do bloqueio` e `fim da reserva > início do bloqueio`. Limites que apenas encostam não cancelam o atendimento. Reservas concluídas, ausentes, já canceladas, de outra empresa ou de outro profissional não são alteradas.

A operação reutiliza `idempotent` e as travas existentes. A chave é obrigatória nos novos endpoints de confirmação e usa empresa, ator, operação e payload. Repetir após perda de resposta retorna a operação original, com contadores atuais da fila. Payload diferente com a mesma chave recebe 409. Uma falha SQL desfaz bloqueios, cancelamentos, auditoria, outbox e chave, permitindo nova tentativa.

O hash da prévia vincula empresa, ator, período, profissional e atendimentos afetados. A confirmação revalida a autorização e o impacto dentro da transação, após a trava do profissional. Se o impacto mudou, retorna `BLOCK_IMPACT_CHANGED`/409 e exige nova revisão. Uma nova reserva e um bloqueio não podem confirmar sobreposição sem que o operador tenha revisado esse atendimento.

PostgreSQL usa os advisory locks já usados pelas reservas; SQLite usa a transação `BEGIN IMMEDIATE` já existente. O bloqueio não adquire trava de atendimento depois da trava de profissional, evitando inverter a ordem do reagendamento. O reagendamento agora relê o estado após adquirir as travas: se um bloqueio cancelou a reserva enquanto aguardava, não altera sua data histórica nem gera um aviso de remarcação.

O profissional só opera no cadastro associado à sua conta naquela empresa. A gestão pode selecionar um profissional da empresa. Contatos, valores recebidos, responsável e observações internas são apresentados apenas à gestão autorizada. O prefixo público do Mini Site continua sem acesso às rotas administrativas/profissionais.

## Rotas e telas

| Rotas autenticadas                        | Uso                                                 |
| ----------------------------------------- | --------------------------------------------------- |
| `POST /api/professional/blocks/preview`   | Prévia da própria agenda                            |
| `POST /api/professional/blocks/confirm`   | Confirmação com `Idempotency-Key`                   |
| `GET /api/professional/blocks/operations` | Operações e estados minimizados da própria agenda   |
| `POST /api/admin/agenda/blocks/preview`   | Prévia da gestão, com `professionalId`              |
| `POST /api/admin/agenda/blocks/confirm`   | Confirmação da gestão com `Idempotency-Key`         |
| `GET /api/admin/agenda/blocks/operations` | Acompanhamento, contato manual e análise financeira |

Todas exigem a sessão empresarial existente e `X-Gradefy-Company-Id`. A confirmação exige `confirmed: true`, período e hash da prévia, código do motivo e, quando personalizado, descrição pública. Não aceita IDs de reservas enviados pelo frontend para decidir o que cancelar.

O componente reutilizável `AgendaBlockPanel` está em Minha Agenda, na configuração dos horários profissionais e na agenda da gestão. Exibe sucesso real e contadores separados de cancelamentos, mensagens aceitas pelo provedor, pendências e casos que exigem atenção. A atualização da agenda preserva o resultado visível. A consulta de notificações atualiza periodicamente e também possui botão de atualização.

Minhas reservas apresenta o status cancelado e a justificativa pública no histórico e nos detalhes do Mini Site. O histórico Classic também apresenta a justificativa quando existente. O login de cliente anterior à seleção de serviço continua obrigatório no Mini Site.

Os endpoints antigos de bloqueio continuam restritivos: não cancelam reservas silenciosamente e recusam conflitos. A nova interface usa exclusivamente prévia e confirmação. Remover um bloqueio pessoal não reativa reservas canceladas nem apaga a auditoria.

## E-mail e recuperação de falhas

A implementação reutiliza `notifications`, seu processador com lease, tentativas e envelope persistente, e o transporte Resend de `transactional-email.js`. Não cria outro sistema de fila. Os eventos só ficam visíveis ao processador após o commit.

Cada reserva afetada gera um evento individual de e-mail, com destinatário único. O assunto é **Seu agendamento foi cancelado — [estabelecimento]**. Texto simples e HTML incluem nome do cliente, estabelecimento, motivo público, serviço e profissional do snapshot, data e horário originais, pedido de desculpas e o botão **Agendar novo horário**. Conteúdo variável é escapado no HTML; observações internas não são concatenadas ao e-mail.

O botão usa a URL pública real da empresa (`/{slug}/agendar`, ou o alias legado quando aplicável). Não aponta para `/app`, não cria reserva e segue o login de cliente do Mini Site, preservando o estabelecimento.

| Estado persistente | Interpretação na interface                                                  |
| ------------------ | --------------------------------------------------------------------------- |
| `pending`          | Pendente ou aguardando nova tentativa                                       |
| `sending`          | Processamento em andamento com lease                                        |
| `sent`             | Aceita pelo provedor; não comprova entrega ou leitura                       |
| `failed`           | Limite de tentativas ou dados inválidos: intervenção                        |
| `review`           | Resultado incerto ou replay inseguro: conferir o provedor antes de reenviar |

O processador mantém o mesmo ID de idempotência e envelope nos reenvios, com até cinco tentativas e backoff. A infraestrutura existente coloca replays fora da janela segura em revisão, em vez de arriscar um envio duplicado. A aceitação registra `provider_message_id` quando retornado e `submitted_at`. Não foram criados webhooks de entrega nem um botão que force reenvio ignorando o estado de revisão.

Sem `RESEND_API_KEY` e `EMAIL_FROM`, os eventos válidos ficam persistidos, mas não são enviados. A interface informa essa ausência e os inclui nos casos que exigem atenção, sem afirmar que o cliente foi avisado. Ao configurar o transporte, o dispatcher existente poderá processar os eventos pendentes. Cliente sem e-mail válido gera um registro de falha sem tentativa, identificado para contato manual. Erros do provedor são reprocessados; falhas terminais e estados incertos ficam visíveis à gestão, com os contatos autorizados.

Em servidor Node, o dispatcher existente já inicia no processo da aplicação. Em ambiente serverless, continua sendo necessário executar o processamento de fila pelo mecanismo já utilizado pela implantação. Uma requisição de bloqueio não mantém um worker em memória nem garante entrega sem esse processamento.

## Migração e dados preservados

Foi criada **021-gradefy-block-cancellations.sql**, sem editar migrations 001–020:

- `appointments.cancellation_reason`: justificativa pública, com padrão vazio para registros antigos.
- `agenda_block_operations`: período, profissional, ator, motivo público, observações internas e timestamp.
- `agenda_block_cancellations`: relação única entre reserva, operação e evento da outbox, com chaves compostas por empresa.
- `notifications.provider_message_id` e `submitted_at`: rastreabilidade da aceitação pelo provedor.

IDs e referências obrigatórios são explicitamente `NOT NULL`. A migração é transacional e controlada pelo runner/checksum existente; reexecuções não duplicam estruturas ou registros. Os helpers de reconstrução de schemas e expectativas de testes anteriores foram atualizados para 021, sem alterar migrações antigas ou reduzir suas verificações de preservação.

Reservas, snapshots de serviços, históricos, pagamentos, sinais, estornos anteriores e demais lançamentos permanecem no banco. Não há estorno financeiro automático. A gestão vê valores recebidos líquidos dos estornos já registrados e a indicação para analisar reembolso/ajuste. O cancelamento não cancela nem cria outro lançamento financeiro.

## Validação

| Execução                                                              | Resultado                           |
| --------------------------------------------------------------------- | ----------------------------------- |
| SQLite/backend completo, antes do último cenário adicional de corrida | 330 aprovados                       |
| Teste direcionado final, incluindo corrida com remarcação             | 11 aprovados                        |
| SQLite/backend completo final                                         | 331 aprovados                       |
| PostgreSQL local 17.11 completo                                       | 259 aprovados                       |
| E2E direcionados, mobile/desktop e configuração profissional          | 8 aprovados                         |
| E2E completo final                                                    | 119 aprovados, sem falhas (7,4 min) |
| Build/TypeScript e `check:schedule`                                   | Aprovados                           |
| Prettier e `git diff --check` finais                                  | Aprovados com `--end-of-line auto`  |

Os cenários cobrem prévia sem escrita/desistência, confirmação obrigatória, bloqueio vazio, uma ou várias reservas, interseção parcial, limites, dia inteiro, vários dias, semana, propriedade e empresa, dados inválidos, e-mail ausente/inválido, snapshots, mensagem/link/escaping, observações privadas, pagamento preservado, rollback, replay, requisições simultâneas, reserva concorrente e remarcação concorrente. O mesmo helper executa em SQLite e em duas conexões PostgreSQL reais.

Os E2E exercitam confirmação, desistência, perda de resposta com a mesma chave, cancelamento real, consulta do cliente, acompanhamento da gestão e prévia de semana. Incluem 320, 360, 390, 428, 768 e 1440 px, sem overflow; capturas ficam em `test-results/block-{confirm,management}-{390,1440}.png`.

O cluster PostgreSQL foi criado pelo runner descartável, em loopback na porta 57574. O relatório registra `productionAccess=false`, `testExitCode=0`, `clusterStopped=true` e `clusterRemoved=true`. Não foi usado Docker ou Supabase; foram usados os binários portáteis locais 17.11. SQLite e navegador usam bancos em memória/temporários. `.env` e URLs de banco externas foram desabilitados nas execuções.

O transporte foi simulado nos testes: nenhum e-mail real foi enviado. A primeira rodada de regressão exigiu ajustes nas expectativas dos novos campos/tabelas de 021; os cenários direcionados também detectaram e corrigiram a perda da mensagem de sucesso durante atualização da agenda e um seletor de teste ambíguo entre dois avisos de status. Não foram removidas verificações de autorização.

Logs: `test-results/block-cancellations-{backend-final,directed-final,postgres-final,e2e-focused-final,e2e-final,build-final}.log` e `test-results/postgres-validation/report.json`. A formatação respeita os finais de linha Windows com `--end-of-line auto`.

## Conferência local e limites

Em `gradefyapp-recuperado`, com banco local de desenvolvimento, abrir `/app/minha-agenda?empresa={companyId}` como profissional ou `/app/agenda?empresa={companyId}` como gestor. Revisar o bloqueio, conferir atendimentos, escolher o motivo e confirmar. Atualizar o histórico do cliente em `/{slug}/minha-conta` e abrir o acompanhamento da operação na gestão.

A migração 021 será aplicada pelo inicializador existente no próximo início da aplicação no ambiente escolhido. Esta tarefa não executou migrações em produção, não alterou credenciais/provedores, não fez commit nem push. A entrega real de e-mail e o comportamento em aparelhos Android/iOS físicos ainda precisam de homologação. A atualização automática de uma tela já aberta continua seguindo o refresh/foco existente; recarregar consulta o estado persistido imediatamente.
