# Gradefy — Fase 7F.3A: equipe, convites e permissões

## Entrega

- `/app/equipe`: seleção empresarial, membros ativos/revogados, papéis, convites, criação, renovação, cancelamento e confirmações de ações sensíveis.
- `/app/convite#token=…`: inspeção, login/cadastro existentes, troca de conta e aceite explícito. Login e cadastro preservam somente esse destino interno, sem redirecionamento externo.
- Menu e atalhos do dashboard incluem Equipe e acessos. Profissionais de atendimento continuam em `/app/profissionais`; convidar alguém não cadastra um profissional.
- Navegação móvel permite rolagem horizontal e mantém a área selecionada visível. Responsividade validada em 320, 390, 768 e 1440 px.

## Autorizações e isolamento

Somente um membership `owner`, ativo em empresa ativa, pode listar membros, convidar, renovar, cancelar, alterar papel ou revogar. `manager` mantém suas autorizações operacionais/financeiras anteriores, mas não administra acessos. O papel `professional` preserva a matriz existente: vínculo empresarial sem permissão de gestão.

Convites e mudanças permitem apenas `manager` e `professional`. Nenhum proprietário pode ser removido, rebaixado ou promovido por estas APIs, inclusive quando existem vários proprietários. Assim, o último proprietário permanece protegido; transferência de propriedade está fora desta fase.

Todas as consultas empresariais usam a empresa selecionada e as APIs administrativas existentes revalidam memberships no banco a cada requisição. Não há fallback para Igor. IDs de outras empresas são recusados. O aceite resolve a empresa pelo token persistido, ignorando seletores fornecidos pelo cliente.

Revogar altera apenas o membership daquela empresa para `inactive`. Preserva a conta global, profissionais, associações profissional-usuário, agendamentos, lançamentos e memberships de outras empresas. A sessão global continua válida; requisições posteriores à empresa revogada, inclusive financeiro e relatórios, são negadas. Requisições já em processamento não são canceladas retroativamente.

Mudanças exigem confirmação explícita e o papel/status esperado. Atualizações concorrentes com estado obsoleto retornam `409 MEMBER_CHANGED`.

## Convites e entrega

Tokens usam 32 bytes aleatórios criptográficos, codificados em hexadecimal. O banco guarda somente SHA-256; o token aparece apenas no link recém-criado/renovado e no e-mail. O fragmento da URL mantém o segredo fora de caminhos HTTP e referers. Não é salvo no localStorage nem nos registros de auditoria.

Validade de **7 dias**, calculada pelo relógio PostgreSQL quando disponível. Aceite único, cancelamento e substituição invalidam o hash. O aceite exige sessão válida e comparação com o e-mail atual da conta, lido novamente dentro da transação. O e-mail enviado pelo frontend nunca cria membership.

A renovação substitui o token, invalida o link anterior e reinicia sua validade. Como não se guarda o segredo em texto, um link antigo não é recuperável pelo painel; após fechar o modal, use Renovar e reenviar. Convites aceitos/cancelados não podem ser renovados. Um convite expirado substituído por outro não pode ser reativado enquanto existir o substituto pendente.

Há somente um convite pendente por e-mail/empresa. Criação, aceite, renovação, alteração e revogação são transacionais e serializados por empresa usando os locks existentes. Aceites concorrentes produzem um único membership e evento; o segundo retorna convite indisponível. Falhas revertem convite, membership e auditoria juntos.

A infraestrutura Resend existente foi reutilizada por um transporte compartilhado com notificações de agendamento. Quando `RESEND_API_KEY` e `EMAIL_FROM` já estão configurados, o convite é enviado depois do commit, com timeout e chave de deduplicação do provedor. O status indica aceitação pelo provedor, não chegada na caixa de entrada.

Sem configuração, a interface solicita compartilhamento manual. Falha de entrega mantém o convite válido e permite copiar seu link. Não há e-mails simulados, novo provedor pago, credenciais em código nem fila contendo tokens em texto. Reenvio é explícito por renovação; esta fase não cria retentativas automáticas de convites.

Limites técnicos, sem relação com vagas comerciais:

- 20 criações/renovações por proprietário/empresa a cada 15 minutos.
- 60 inspeções/aceites por IP a cada 15 minutos, além do limiter HTTP existente.
- Contadores persistentes compartilhados entre instâncias, com identidades protegidas por HMAC e expurgo de janelas vencidas. Falhas também consomem tentativas.

## Persistência e endpoints

Migration nova `015-gradefy-team-access.sql`, aditiva, compatível com SQLite/PostgreSQL:

- `company_invitations`: empresa, destinatário, papel, hash, estado, autor, aceite, validade e entrega; UNIQUE parcial para pendentes e FKs explícitas.
- `company_access_events`: empresa, responsável, afetado, convite, ação, papéis anteriores/novos e instante. A FK composta impede referência a convite de outra empresa.
- `company_invitation_limits`: contadores técnicos; nenhuma empresa ou identidade pessoal implícita.

Identificadores e referências obrigatórias são explicitamente NOT NULL. Não foram alteradas migrations 001–014, autenticação, cookies, JWT, preços ou assinaturas. Os testes históricos apenas passam a esperar a versão 015 e reconstruir seus bancos descartáveis sem as tabelas posteriores.

| Método | Endpoint                                 | Autorização                                 |
| ------ | ---------------------------------------- | ------------------------------------------- |
| GET    | `/api/admin/team`                        | Owner da empresa selecionada                |
| POST   | `/api/admin/team/invitations`            | Owner                                       |
| POST   | `/api/admin/team/invitations/:id/renew`  | Owner + confirmação                         |
| POST   | `/api/admin/team/invitations/:id/cancel` | Owner + confirmação                         |
| PATCH  | `/api/admin/team/members/:userId/role`   | Owner + estado esperado + confirmação       |
| POST   | `/api/admin/team/members/:userId/revoke` | Owner + estado esperado + confirmação       |
| POST   | `/api/team/invitations/inspect`          | Token válido + limite de tentativas         |
| POST   | `/api/team/invitations/accept`           | Sessão + token válido + e-mail destinatário |

As rotas administrativas usam `X-Gradefy-Company-Id`, como as demais áreas. Login, cadastro, logout, leitura de sessão e listagem de empresas continuam nos endpoints existentes.

## Planos e preservação

Individual: `individual`, 2299 centavos BRL/mês, 7 dias, um profissional ativo. Equipe: `team`, 3299 centavos BRL/mês, 7 dias, profissionais ativos sem limite numérico. Nenhum limite comercial novo para usuários administrativos foi introduzido: os catálogos atuais não definem essa restrição.

Convidar, aceitar ou revogar não inicia/reinicia trial, não cria assinatura e não consome vaga de atendimento. Igor continua sem assinatura automaticamente atribuída. Marketing, Cloudflare, mobile e Barber Classic não foram modificados.

## Validação

Suíte compartilhada SQLite/PostgreSQL cobre proprietários, gestores, terceiros, criação, hash, duplicação, cancelamento, expiração, substituição, e-mail divergente, cadastro real, aceite concorrente, memberships independentes, papéis, proprietário protegido, revogação, sessão antiga, rollback e auditoria. Também verifica persistência dos limites entre instâncias, FKs/NULLs, preços, histórico e ausência de alteração de assinatura/trial.

Os E2E usam API real e três jornadas: gerenciamento responsivo; cadastro/aceite e revogação de sessão antiga; login existente, conta divergente, logout e links inválidos. As suítes existentes verificam as demais áreas e Igor.

PostgreSQL testado: **17.11**, cluster portátil descartável vinculado exclusivamente a `127.0.0.1`, criado/removido pelo runner protegido. Nenhum banco de produção foi acessado.

Resultados finais:

| Verificação                                         | Resultado                                         |
| --------------------------------------------------- | ------------------------------------------------- |
| `node --test tests/team.test.js`                    | 17 testes passaram                                |
| `npm.cmd test`                                      | 216 testes backend/SQLite passaram                |
| Runner PostgreSQL local 17.11                       | 162 testes passaram; cluster parado e removido    |
| `npm.cmd run test:e2e`                              | 61 testes Chromium passaram                       |
| E2E específico de equipe após o último ajuste móvel | 3 testes passaram                                 |
| `npm.cmd run build`                                 | TypeScript, verificação de agenda e Vite passaram |
| `npm.cmd run format:check`                          | Prettier aprovado                                 |
| `git diff --check`                                  | Sem erros de whitespace                           |

O Git iniciou limpo no commit `2feeace` e nenhuma alteração desta fase foi commitada ou enviada ao remoto.

O teste de contador fracionário usa parâmetro vinculado, como a aplicação. PostgreSQL pode arredondar um literal SQL numérico ao convertê-lo para INTEGER antes do CHECK; o parâmetro fracionário é rejeitado e os contadores da aplicação sempre são inteiros. SQLite rejeita o valor fracionário via CHECK.

## Demonstração local

Para testar sem ler `.env`, em PowerShell:

```powershell
$env:DOTENV_CONFIG_PATH='NUL'
$env:DATABASE_URL=''
$env:POSTGRES_URL=''
$env:DEMO_MODE='true'
npm.cmd run dev:test-access
```

Abra `http://localhost:5173/app/equipe`. Entre com o proprietário de demonstração do seed ou com o proprietário da sua empresa no ambiente local. O banco de demonstração é temporário e apagado ao encerrar. Abra o link do convite em janela anônima para testar o cadastro/aceite. Não use credenciais ou banco de produção nessa demonstração.

Para reproduzir exatamente as fixtures E2E: `npm.cmd run build` e `node tests/browser-server.js` (porta 4173). Proprietário de teste: `business-browser-owner@example.com`, senha fictícia `ClienteDemo2026!`, empresa `business-browser-team`. URL: `http://127.0.0.1:4173/app/equipe?empresa=business-browser-team`. Não inicie esse servidor enquanto Playwright estiver usando a porta.

## Pendências deliberadas

Transferência de propriedade, novas permissões, restrições comerciais para gestores, fila automática de convites e recursos da próxima fase continuam fora do escopo. A entrega real por e-mail depende da configuração Resend existente; testes usam transporte simulado ou compartilhamento manual, sem acessar provedores reais.

## Arquivos alterados/criados

- `docs/GRADEFY-TEAM-7F3A.md`
- `server/app.js`
- `server/migrations.js`
- `server/migrations/015-gradefy-team-access.sql`
- `server/notifications.js`
- `server/team.js`
- `server/transactional-email.js`
- `src/gradefy/Shell.tsx`
- `src/gradefy/business-management.css`
- `src/gradefy/business-nav.tsx`
- `src/gradefy/dashboard.tsx`
- `src/gradefy/pages.tsx`
- `src/gradefy/team.css`
- `src/gradefy/team.tsx`
- `src/main.tsx`
- `tests/company-integrity.test.js`
- `tests/company-migration.test.js`
- `tests/data-ownership.test.js`
- `tests/e2e/gradefy-team.spec.js`
- `tests/helpers/access-migration.js`
- `tests/helpers/agenda.js`
- `tests/helpers/barber-classic.js`
- `tests/helpers/business-management.js`
- `tests/helpers/company-onboarding.js`
- `tests/helpers/data-ownership.js`
- `tests/helpers/finance-migration.js`
- `tests/helpers/finance.js`
- `tests/helpers/operational-onboarding.js`
- `tests/helpers/professional-idempotency.js`
- `tests/helpers/professionals-migration.js`
- `tests/helpers/scheduling-reliability.js`
- `tests/helpers/site-editor.js`
- `tests/helpers/team-migration.js`
- `tests/helpers/team.js`
- `tests/postgres/foundation.test.js`
- `tests/team.test.js`
