# Gradefy — Fase 7F.4A.5 — E-mails transacionais Resend

## Escopo e estado da homologação

Implementação na branch `feat/gradefy-foundation`, iniciada com Git limpo após `0dc6c22`.
Mantidos os outboxes de reservas e recuperação, autenticação, disponibilidade, assinaturas e templates públicos.
Nenhum envio real, alteração DNS, acesso à produção, commit ou push nesta etapa.
O endereço controlado informado pelo proprietário será preenchido apenas no ambiente privado da rodada autorizada; não fica no código.

**Ainda não foi comprovado o recebimento real.** Domínio verificado, transporte real, caixa postal e webhook público dependem do ambiente Alpha e da autorização explícita da rodada A–G abaixo.

## Provedor, domínio e DNS

1. Usar o cadastro existente de `gradefyapp.com.br`, informado pelo proprietário como **Verified** durante esta etapa. A verificação foi informada pelo usuário, não consultada remotamente pelo agente. Não é necessário criar o subdomínio inicialmente proposto.
2. Como o domínio já está verificado, preservar seus registros existentes. Se o Resend solicitar regularização, copiar somente os registros de envio apresentados: tipo, nome/host, valor, prioridade e TTL. Este documento não fornece valores DNS fictícios.
3. Quando necessária, a inclusão deve conferir o nome completo resultante e os registros já existentes, evitando duplicação. Alguns painéis acrescentam o domínio automaticamente.
4. **Não substituir o MX do domínio raiz `gradefyapp.com.br`**, que já possui e-mail externo. Não habilitar recebimento Resend nesta fase. Caso algum registro conflite com algo existente, revisar antes de alterar.
5. Aguardar o estado **Verified** de todos os requisitos de envio. Guardar evidência sem expor chave ou segredo.
6. Criar chave de envio restrita ao domínio. Remetente: `Gradefy <notificacoes@gradefyapp.com.br>`.
7. Reputação, SPF/DKIM e recebimento em spam exigem conferência na caixa controlada. Não há promessa de chegada na caixa principal.

Referências oficiais: [domínios](https://resend.com/docs/dashboard/domains/introduction), [chaves de API](https://resend.com/docs/dashboard/api-keys/introduction).

## Variáveis privadas do backend

```dotenv
EMAIL_DELIVERY_MODE=disabled
EMAIL_DELIVERY_SCOPE=
EMAIL_TEST_DATABASE=
EMAIL_TEST_ALLOWLIST=
RESEND_API_KEY=
EMAIL_FROM=
RESEND_WEBHOOK_SECRET=
APP_URL=https://SEU-AMBIENTE-ALPHA
```

- `disabled` é o padrão, mesmo com chave e remetente preenchidos. Nenhum caminho de e-mail faz chamada Resend nesse modo.
- `test`: exige `EMAIL_TEST_DATABASE=isolated-fixtures`, lista explícita de endereços separados por vírgula, remetente válido, chave com formato `re_…`, origem HTTPS e `EMAIL_DELIVERY_SCOPE` aleatório de 16–100 caracteres alfanuméricos/`_`/`-`.
- `live`: habilitação deliberada por operador; mesmas validações de chave/remetente/origem/rodada. Fora de `NODE_ENV=production`, continua exigindo banco de fixtures e allowlist. Não usar live para a homologação Alpha.
- A allowlist compara o endereço completo, sem diferenciação de caixa; sem curingas, redirecionamento de destinatários, CC ou BCC. Uma mensagem tem um destinatário.
- `EMAIL_TEST_DATABASE` é uma declaração operacional obrigatória, **não uma inspeção automática de que o banco contém dados fictícios**. Use o provisionador abaixo e não importe dados reais. Nem um endereço autorizado permite enviar dados de terceiros.
- `APP_URL` é a origem do aplicativo que atende os estabelecimentos, não a landing. Não pode conter credenciais, path, query ou fragment. URLs localhost/loopback não habilitam transporte. A renderização unitária local pode produzir links de demonstração, mas não são links públicos para outros dispositivos.
- Não usar `VITE_` para essas variáveis. `.env*` fica ignorado, exceto `.env.example`. Nunca enviar chaves no chat ou nos logs.

`node scripts/email-preflight.mjs` inspeciona somente as variáveis já exportadas no processo. Não carrega `.env`, abre banco, envia mensagens ou consulta DNS. Mostra modo, validade da configuração e quantidade de destinatários, sem valores privados.

Para desabilitar imediatamente: definir `EMAIL_DELIVERY_MODE=disabled` e reiniciar/reimplantar o backend autorizado. A mudança impede novas requisições; uma requisição que já foi aceita pelo provedor não pode ser recolhida.

## Banco isolado e rodada de envio

```powershell
node scripts/create-email-homologation.mjs
```

O provisionador cria **um novo diretório aleatório no temporário do sistema** e um arquivo SQLite exclusivo. Ignora `.env` e todas as URLs de bancos, força modo disabled e aplica migrations. Não inicia servidor, worker ou seed de usuários. Confirma contagem zero de usuários, reservas e filas. A empresa Igor estrutural criada pelo bootstrap é preservada; não contém clientes importados. Não apaga diretórios existentes.

Para iniciar esse banco local, em um terminal separado, antes de habilitar qualquer envio:

```powershell
$env:DOTENV_CONFIG_PATH='NUL'
$env:DATABASE_URL=''
$env:POSTGRES_URL=''
$env:SQLITE_PATH='CAMINHO-EXATO-RETORNADO-PELO-PROVISIONADOR'
$env:DEMO_MODE='false'
$env:EMAIL_DELIVERY_MODE='disabled'
# Definir um JWT_SECRET novo, privado, com pelo menos 32 caracteres.
# APP_URL deve apontar ao ambiente HTTPS isolado para uma rodada real.
npm run dev
```

Não copiar `.env` de produção. Não reutilizar usuários, filas, dumps ou chaves JWT de produção. Criar conta de teste pelo fluxo Gradefy e empresa fictícia pelo onboarding existente. O cliente de teste deve usar exclusivamente a caixa controlada autorizada. Não inventar um atalho de autenticação nem reutilizar a sessão empresarial no Mini Site.

Gerar um `EMAIL_DELIVERY_SCOPE` novo por rodada, por exemplo com `node --input-type=module -e "import{randomUUID}from'node:crypto';console.log(randomUUID())"`. **Só após aprovação explícita da rodada**, preencher as variáveis privadas e mudar para test. Criar os eventos fictícios depois dessa habilitação.

### Proteção contra histórico

Notifications e password_recovery recebem a coluna `email_delivery_scope`, com default vazio na migration 022. O identificador da ativação é registrado somente na criação de eventos quando a configuração está habilitada e completa. Um worker exige correspondência exata com a ativação atual antes da chamada HTTP.

Preencher credenciais não autoriza histórico. Eventos anteriores/sem rodada ficam em revisão (reservas) ou falha (recuperação), com registro de bloqueio e nenhum envio. **Nunca atualizar essas colunas por SQL para liberar fila antiga.** Uma nova rodada exige novos eventos fictícios. Desabilitar preserva a fila; reabilitar com a mesma rodada só deve acontecer deliberadamente. Alterar a rodada impede o processamento das mensagens da rodada anterior.

## Modelos implementados

Layout compartilhado HTML/tabelas/estilos inline, navy `#090D18`, cards `#121827`, roxo `#6C5CE7`, ciano `#00D4FF`, marca oficial `/gradefy/logo-mark.png` e texto Gradefy legível com imagens bloqueadas. Sem fontes remotas obrigatórias, scripts ou capturas de tela. Todo modelo possui texto simples e HTML com variáveis escapadas.

| Evento                                | Assunto                                                           |
| ------------------------------------- | ----------------------------------------------------------------- |
| Confirmação                           | Seu horário está confirmado! — Estabelecimento                    |
| Remarcação                            | Seu agendamento foi atualizado — Estabelecimento                  |
| Cancelamento pelo cliente             | Seu agendamento foi cancelado — Estabelecimento                   |
| Cancelamento empresarial/profissional | Aviso importante: seu agendamento foi cancelado — Estabelecimento |
| Convite                               | Você recebeu um convite — Estabelecimento                         |
| Recuperação                           | Redefina sua senha — Gradefy                                      |
| Senha alterada                        | Sua senha foi alterada — Gradefy                                  |

Reservas usam snapshot real de serviço, preço em centavos, duração, profissional, data e horário. Não são inventados valores históricos nem datas anteriores de remarcação. O motivo público de bloqueio aparece; observações internas não entram no payload de e-mail. Cancelamento administrativo comum sem motivo público registrado não inventa um motivo. Cancelamentos oferecem o link do estabelecimento para novo agendamento.

Convites mantêm papel, validade real, link com fragmento e código individual exibido apenas nos contextos já permitidos. Continuam oferecendo compartilhamento manual quando o envio falha; não foi criada uma fila paralela de convites nem persistido o token em claro.

Recuperação mantém HMAC individual, token em fragmento, expiração de 30 minutos e uso único. Links Mini Site preservam empresa/destino; Gradefy usa `/app/redefinir-senha`, legado mantém sua rota. Alteração de senha pelo perfil também registra aviso no outbox existente, na mesma transação. Nenhuma alteração de senha/sessão foi enfraquecida.

## Filas, idempotência e rastreabilidade

Reutilizados os workers existentes: reservas com lease por mensagem, claim token, até cinco tentativas, backoff e chave Resend igual ao ID da notificação; recuperações até três tentativas, lease existente e chave `password-ID`. A conclusão de recuperação verifica o número da tentativa para evitar sobrescrita por worker atrasado. A janela de replay seguro das reservas continua inferior à retenção de 24 horas da idempotência do Resend; fora dela exige revisão. Timeout usa a mesma chave. Convites preservam sua chave por convite/token e fallback manual.

Migration **022-gradefy-email-delivery.sql**, aditiva; 001–021 intactas. Novas tabelas de auditoria `email_deliveries`, `email_delivery_attempts`, `email_webhook_events`. Não são outra fila. Não armazenam destinatário, corpo, motivo privado, código ou token. Recuperação global tem company_id nulo e não é mostrada aos gestores; recuperação Mini Site e demais eventos têm empresa explícita.

| Estado                 | Significado                                                                |
| ---------------------- | -------------------------------------------------------------------------- |
| pending                | Aguardando envio ou nova tentativa                                         |
| processing / sending   | Worker processando a mensagem                                              |
| accepted / sent legado | API aceitou; não comprova entrega                                          |
| delivered              | Webhook válido confirmou entrega ao servidor do destinatário               |
| delayed                | Provedor informa atraso; conferir sem reenviar descontroladamente          |
| rejected / suppressed  | Rejeição permanente / supressão                                            |
| complained             | Destinatário marcou spam                                                   |
| failed                 | Falha de tentativa ou limite atingido; consultar fila/histórico            |
| review                 | Bloqueio de política, falta de identificador ou necessidade de intervenção |

O recebimento no servidor de e-mail não comprova caixa principal, leitura ou ausência de spam. Retornos HTTP do transporte nunca geram delivered. Uma resposta aceita sem ID requer revisão.

Em Node persistente, o worker roda periodicamente. Na Vercel, as respostas bem-sucedidas continuam disparando lote finito com `waitUntil`; ausência de tráfego pode atrasar retentativas. Não foi adicionado cron/infraestrutura nesta fase. Reenvios manuais automáticos não foram expostos na central.

## Webhook e central da gestão

Endpoint: `POST /api/webhooks/resend`, montado antes do parser JSON e da política de origem de navegador. Corpo bruto limitado a 32 KB, rate limit e assinatura Svix com validação de timestamp usando a biblioteca oficial `svix`. Na versão instalada, verify valida a assinatura e retorna void; o JSON é lido **depois** da verificação.

Configurar somente no Alpha HTTPS, com `RESEND_WEBHOOK_SECRET` privado. Eventos: `email.sent`, `email.delivered`, `email.delivery_delayed`, `email.bounced`, `email.complained`, `email.failed`, `email.suppressed`. Persistir apenas `svix-id`, `data.email_id`, tipo e timestamps. Identificação da empresa vem do registro interno do envio, nunca de metadados externos.

Dedupe por svix-id; eventos anteriores ao registro da resposta HTTP são reconciliados ao gravar o ID do provedor. Lock transacional por ID do provedor no PostgreSQL evita perder essa corrida. Estados terminais de falha/abuso prevalecem sobre delivered e eventos atrasados de accepted. Outros tipos assinados são ignorados. Não há mutação de reservas, finanças ou permissões.

No dashboard empresarial, abrir **Notificações por e-mail** e clicar **Atualizar notificações**. Mostra contadores, últimas 100 mensagens e até 300 tentativas recentes, com estados distintos e indicação de contato manual. Endpoint `GET /api/admin/email-notifications` usa as mesmas autorizações de empresa/owner/manager da gestão. Profissionais e clientes não recebem esse acesso. O histórico de bloqueios também distingue falhas/rejeições de aceitação e entrega.

Referências: [validação oficial](https://resend.com/docs/webhooks/verify-webhooks-requests), [catálogo de eventos](https://resend.com/docs/webhooks/event-types), [payload delivered](https://resend.com/docs/webhooks/emails/delivered), [payload suppressed](https://resend.com/docs/webhooks/emails/suppressed), [verificação Svix](https://docs.svix.com/receiving/verifying-payloads/how).

## Roteiro A–G da primeira rodada REAL — pendente de autorização

Antes de cada rodada, registrar: banco isolado exato, origem HTTPS, remetente, caixa controlada, scope, eventos autorizados e limite de mensagens. Sem esses itens e autorização explícita, permanecer disabled. Não registrar tokens nem chave.

1. **A — domínio:** comprovar Verified no Resend, sem alterar DNS automaticamente. Confirmar preservação do MX raiz.
2. **B — transporte:** após autorização, gerar uma única mensagem simples de teste usando o transporte protegido, destinatário autorizado e dados fictícios. Registrar somente horário, chave de teste, ID Resend e status HTTP. Não confundir aceitação com entrega.
3. **C — caixa:** conferir na caixa controlada (inclusive spam), remetente, assunto, texto, HTML, marca e botões, em celular e desktop. Capturas devem ocultar dados privados. O usuário confirma o recebimento.
4. **D — reserva:** empresa/cliente fictícios novos, login explícito do cliente no Mini Site, uma reserva, remarcação e cancelamento. Conferir empresa, preço e links corretos. Nenhuma conta recebe acesso à Igor automaticamente.
5. **E — caso principal:** nova reserva fictícia com caixa autorizada; bloquear período pela agenda existente, revisar impacto e confirmar com motivo público. Conferir um aviso por cliente, snapshot correto, motivo, ausência de observações internas e botão de novo agendamento. Abrir o link em outro dispositivo sem sessão administrativa; deve exigir login do cliente.
6. **F — equipe/segurança:** convites fictícios de profissional e gestor; aceitar com a conta correta; solicitar recuperação; usar uma vez e rejeitar repetição; conferir aviso de alteração de senha. Tokens/códigos não vão para logs nem relatório.
7. **G — falhas:** testes automáticos com HTTP 503, timeout, destinatário fora da lista, assinatura inválida, duplicação de webhook e recuperação posterior. Não provocar spam, bounce ou múltiplos envios reais desnecessários. Conferir estados e contato manual.

No fim: modo disabled, arquivar evidências sem segredos e conferir que nenhuma mensagem saiu da allowlist. Um evento não aceito pode ser reexecutado de forma controlada com a mesma chave dentro da janela segura; eventos incertos exigem inspeção no provedor antes de qualquer nova mensagem.

## Validação automatizada e pendências

Testes nunca usam a chave real: fixtures com chave falsa, endereços sintéticos explícitos e fetch simulado. A inscrição de filas antigas em alguns contratos de testes é uma operação **somente de fixture**, para preservar testes de workers anteriores; a aplicação não expõe essa operação. O contrato novo prova separadamente o bloqueio de histórico sem inscrição.

Validação local:

- `npm test`: **338/338**, backend/SQLite, incluindo isolamento e legado.
- Contrato direcionado final de templates/filas/recuperação: **29/29**; contrato de upgrade/integridade e envios diretos: **15/15**.
- `node tests/postgres/run-local.mjs --bin <PostgreSQL local>`: **266/266**, PostgreSQL **17.11**, cluster novo em `127.0.0.1`, removido ao terminar; relatório confirma `productionAccess=false`, `clusterStopped=true`, `clusterRemoved=true`.
- E2E direcionado: **8/8**, incluindo bloqueios, conta de cliente e central da gestão nas larguras 320/360/390/428/1440 px.
- Suíte E2E completa: **119/120** na primeira rodada. A única falha foi a fixture legada escolher domingo ao misturar getDay local e serialização UTC após 21h no Brasil. Corrigida apenas a fixture e reexecutado o cenário: **1/1 aprovado**. Assim, os 120 cenários foram validados, sem declarar uma segunda rodada completa que não foi executada.
- `npm run build`: aprovado, incluindo `tsc -b` e check tipado da agenda.
- `npm run format:check -- --end-of-line auto`: aprovado. Mantida a política existente de finais de linha do workspace Windows.
- `git diff --check`: aprovado.
- Prévia HTML/texto e capturas mobile/desktop em `test-results/email-preview*`, ignoradas pelo Git, usando dados fictícios e interceptação de todas as requisições. E-mail sem overflow em 320/360/390/428/800 px; logotipo oficial conferido.
- Provisionador executado: banco novo no temporário local, contadores zero e modo disabled. Preflight confirmou modo disabled, nenhum envio e nenhuma consulta remota.

As primeiras execuções detectaram expectativas antigas de assunto, habilitação implícita e snapshots de migrations. Os testes foram atualizados para as novas regras, preservando os contratos de autorização. O último ajuste de preservação normaliza explicitamente o default vazio da nova coluna na fixture legada, sem modificar dados da aplicação.

Auditoria adicional `npm audit --omit=dev`: **3 alertas preexistentes**, `ip-address` (moderado), `proxy-addr` (crítico) e `sharp` (alto). Esses pacotes não foram introduzidos por esta fase; o lockfile acrescenta somente Svix e suas três dependências. Nenhum `audit fix` geral foi aplicado. Revisar esses alertas antes de expor o Alpha.

Pendências operacionais: domínio verificado, Alpha HTTPS com ativos acessíveis, webhook público, chave restrita, autorização da rodada e confirmação humana da caixa postal. O preflight valida forma/configuração, não credenciais remotamente nem isolamento semântico dos dados. Bibliotecas de produção preexistentes também devem passar pela revisão de dependências antes do Alpha; não aplicar atualização geral neste escopo.

## Arquivos desta etapa

- `.env.example`
- `docs/GRADEFY-FASE-7F-4A-5-EMAILS-REAIS-RESEND.md`
- `docs/RESEND.md`
- `package-lock.json`
- `package.json`
- `scripts/create-email-homologation.mjs`
- `scripts/email-preflight.mjs`
- `server/agenda-blocks.js`
- `server/app.js`
- `server/client-auth.js`
- `server/email-center.js`
- `server/email-templates.js`
- `server/email-webhooks.js`
- `server/migrations.js`
- `server/migrations/022-gradefy-email-delivery.sql`
- `server/notifications.js`
- `server/password-recovery.js`
- `server/profile.js`
- `server/team.js`
- `server/transactional-email.js`
- `src/gradefy/agenda-blocks.tsx`
- `src/gradefy/dashboard.tsx`
- `src/gradefy/email-notifications.tsx`
- `tests/company-integrity.test.js`
- `tests/company-migration.test.js`
- `tests/data-ownership.test.js`
- `tests/e2e/flows.spec.js`
- `tests/e2e/gradefy-email-notifications.spec.js`
- `tests/email-delivery.test.js`
- `tests/guest.test.js`
- `tests/helpers/access-migration.js`
- `tests/helpers/agenda.js`
- `tests/helpers/application-context.js`
- `tests/helpers/barber-classic.js`
- `tests/helpers/block-cancellation-migration.js`
- `tests/helpers/block-cancellations.js`
- `tests/helpers/business-management.js`
- `tests/helpers/company-onboarding.js`
- `tests/helpers/data-ownership.js`
- `tests/helpers/email-delivery.js`
- `tests/helpers/email-fixtures.js`
- `tests/helpers/email-migration.js`
- `tests/helpers/finance.js`
- `tests/helpers/minisite.js`
- `tests/helpers/multitenant-access.js`
- `tests/helpers/notification-migration.js`
- `tests/helpers/operational-onboarding.js`
- `tests/helpers/operational-settings.js`
- `tests/helpers/professional-availability.js`
- `tests/helpers/professional-idempotency.js`
- `tests/helpers/professional-panel.js`
- `tests/helpers/professionals-migration.js`
- `tests/helpers/scheduling-reliability.js`
- `tests/helpers/session-address-invitations.js`
- `tests/helpers/site-editor.js`
- `tests/helpers/team.js`
- `tests/minisite-client-auth.test.js`
- `tests/notifications.test.js`
- `tests/password-recovery.test.js`
- `tests/postgres/foundation.test.js`

Nos contratos de migrations anteriores, as mudanças são expectativas da nova versão 022 e defaults aditivos. Nenhuma migration 001–021 foi editada; os 21 arquivos foram comparados ao HEAD. O teste legado de agenda usa agora o mesmo calendário UTC para escolher e serializar sua data futura, evitando enviar domingo depois das 21h locais.
