# Gradefy — Fase 7F.1: painel empresarial

Painel inicial para proprietários e gestores em `/app/dashboard`. Reutiliza sessão, memberships, entitlements, dados de agendamentos, design system e editor Meu Site. Não cria assinaturas, não inicia trial e não publica sites.

## Navegação e estados

- `/app` preserva as boas-vindas anônimas; com sessão, encaminha ao painel.
- Login encaminha ao painel, que resolve o destino conforme a situação empresarial. Cadastro sem empresa continua no onboarding.
- Sem empresa: seleção de plano. Empresa em configuração: retomada em `/app/onboarding/operations`.
- Uma membership de gestão permite seleção inequívoca; várias exigem escolha explícita. `?empresa=ID` mantém a escolha ao recarregar e acompanha o link de Meu Site.
- Memberships de profissional não dão acesso ao painel de gestão. Nenhum estado usa Igor como fallback.
- Desktop: navegação lateral. Mobile: Início, Agenda, Meu Site e Conta. Minha agenda leva à consulta no próprio painel; Meu Site abre o editor existente, inclusive antes da publicação.
- Serviços, Profissionais, Clientes, Financeiro e Configurações abrem informações claras sobre a gestão futura. Não encaminham para o admin legado sem contexto empresarial.
- Carregamento, conexão indisponível, lista vazia, seleção inválida e sessão expirada possuem feedback e caminhos de recuperação. Atualização manual, a cada minuto e ao retomar o foco.

## API e dados reais

`GET /api/dashboard` usa a autenticação existente e `X-Gradefy-Company-Id`. O header é apenas seletor: o servidor valida empresa ativa, membership ativa e papel owner/manager, inclusive dentro de uma transação de leitura consistente. Resposta sem cache.

Parâmetros aceitos: `date=YYYY-MM-DD`, `period=day|week|month`, `professionalId` e `page`. Datas reais entre 1900 e 2199, identificador do profissional da própria empresa e página inteira limitada; parâmetros desconhecidos são rejeitados.

| Indicador               | Origem e regra                                                                                                     |
| ----------------------- | ------------------------------------------------------------------------------------------------------------------ |
| Agendamentos de hoje    | COUNT de reservas confirmadas ou concluídas na data local da empresa                                               |
| Próximo atendimento     | Próxima reserva confirmada que ainda não começou, incluindo dias seguintes; cliente, profissional e serviços reais |
| Atendimentos concluídos | COUNT de reservas concluídas no período atual selecionado                                                          |
| Valor previsto          | SUM do total em centavos das reservas confirmadas e concluídas do período; não representa pagamentos recebidos     |

Dia, semana de segunda a domingo e mês são definidos a partir do horário do servidor convertido para `companies.timezone`. Datas de agenda são datas locais, sem conversão para o fuso do navegador. O próximo atendimento compara um limite inteiro de minutos arredondado para cima: um início já passado por segundos/milissegundos não é apresentado como futuro. Isso evita enviar frações para colunas INTEGER no PostgreSQL.

Consultas agregam no banco e usam os índices empresariais existentes. Agenda ordenada por horário/ID, 20 reservas por página; serviço vem do snapshot `appointment_services`, sem multiplicar indicadores em reservas legadas de vários serviços. Cancelados e no-show aparecem na agenda com status, mas não nos indicadores de volume previsto ou valor. Filtro lista até 200 profissionais da empresa, incluindo inativos para consulta histórica. Esse limite visual não altera as vagas dos planos.

Company, agenda, itens, profissionais, configurações, assinatura e onboarding têm escopo empresarial. Nenhuma consulta concede acesso por role global ou pelo slug público. A identidade do cliente global só é consultada através de uma reserva autorizada da empresa.

## Plano e publicação

Entitlements permanecem como fonte das permissões. A assinatura registrada e os timestamps reais determinam plano, validade, encerramento e dias restantes (arredondados para cima). Assinatura histórica encerrada também pode ser apresentada. Igor sem assinatura continua sem assinatura; o painel não altera o plano ou a política legada.

O card Meu Site mostra template, publicação e endereço público quando publicado. A visibilidade não é inferida pelo trial. Editor e proxy privado da logo são reutilizados, e cada operação continua sujeita às permissões já existentes no backend.

Endpoints reutilizados: `/api/auth/*`, `/api/companies`, `/api/onboarding/business` e editor/proxy `/api/company-site/*`. O novo endpoint não modifica o motor de disponibilidade nem as reservas.

## Arquivos desta subfase

Criados:

- `server/dashboard.js`.
- `src/gradefy/dashboard.tsx`, `src/gradefy/dashboard-types.ts`, `src/gradefy/dashboard.css`.
- `tests/dashboard.test.js`, `tests/helpers/dashboard.js`, `tests/helpers/dashboard-browser.js`, `tests/e2e/gradefy-dashboard.spec.js`.
- Este documento.

Alterados:

- `server/app.js`: registro da API antes do roteador empresarial.
- `server/entitlements.js`: exportação do relógio existente, sem alteração de regras.
- `server/company-site.js`: extração do resolvedor de imagem existente para reutilizar a logo privada.
- `src/main.tsx`, `src/gradefy/Shell.tsx`, `src/gradefy/pages.tsx`, `src/gradefy/plans.tsx`: rota, escopo visual e destinos após autenticação.
- `tests/browser-server.js`, `tests/postgres/foundation.test.js`: fixtures exclusivamente de teste e suíte compartilhada PostgreSQL.
- `tests/e2e/gradefy.spec.js`, `tests/e2e/gradefy-plans.spec.js`, `tests/e2e/gradefy-business.spec.js`: expectativas dos novos destinos e simulação completa de expiração da sessão.

Sem migrations novas ou modificadas. Alterações anteriores das Fases 7A–7E.2 foram preservadas. Nenhuma mudança no app mobile, nos templates dos estabelecimentos ou no login/cookies/JWT.

## Validação e uso local

SQLite e PostgreSQL executam a mesma suíte direcionada: autorização, seleção explícita, isolamento, agregados/status, snapshots múltiplos, paginação, datas e timezone, limites de minuto, trial/publicação, revogação, onboarding e preservação do legado/checksums. E2E usa fixtures somente no servidor de testes, com 320, 390, 768 e 1440 px, recarregamento, falha de conexão e sessão expirada.

Comandos executados com `DOTENV_CONFIG_PATH=NUL`, `DATABASE_URL=''` e `POSTGRES_URL=''`:

- `node --test tests/dashboard.test.js`.
- `npm test` — inclui a suíte SQLite.
- `node tests/postgres/run-local.mjs --bin C:\Users\Breno\AppData\Local\Gradefy\postgresql-17.11\pgsql\bin` — cluster local descartável, encerrado e removido pelo runner.
- `npm run test:e2e`.
- `npm run build` — TypeScript, check JS de agenda e Vite.
- `npm run format:check`; `git diff --check`.

Logs e screenshots locais em `test-results/phase7f1-*`, `test-results/gradefy-dashboard-*.png` e `test-results/postgres-validation/report.json`, ignorados pelo Git.

| Verificação                            | Resultado final                                 |
| -------------------------------------- | ----------------------------------------------- |
| SQLite direcionado 7F.1                | 9 aprovados                                     |
| Backend/SQLite completo                | 159 aprovados                                   |
| PostgreSQL local 17.11                 | 107 aprovados                                   |
| E2E completo Chromium                  | 43 aprovados                                    |
| Responsividade                         | 320, 390, 768 e 1440 px sem overflow horizontal |
| Build, TypeScript e check JS de agenda | Aprovados                                       |
| Prettier e git diff --check            | Aprovados                                       |

A validação PostgreSQL detectou e permitiu corrigir o parâmetro fracionado da comparação de horários. Os testes passaram a cobrir o instante exato do agendamento e um milissegundo/segundo depois. Expectativas E2E antigas de retorno ao resumo empresarial foram ajustadas para a retomada operacional após login. A rodada final das suítes passou integralmente.

Para testar com dados descartáveis em um terminal PowerShell novo:

```powershell
$env:DOTENV_CONFIG_PATH='NUL'
$env:DATABASE_URL=''
$env:POSTGRES_URL=''
$env:NODE_ENV='development'
$env:APP_URL='http://localhost:5173'
npm.cmd run dev:test-access
```

Acesse `http://localhost:5173/app/dashboard`. Faça login com uma conta de gestão do banco local; o modo descartável utiliza somente os dados de demonstração. Os cenários de múltiplas empresas da suíte E2E não são instalados no funcionamento normal.

Pendências para 7F.2: gestão completa dos atendimentos e módulos empresariais indicados como futuros. Esta entrega não inclui CRUD novo de reservas, financeiro completo, clientes, cobrança, relatórios avançados ou notificações push. Produção não foi acessada; nenhum commit ou push.
