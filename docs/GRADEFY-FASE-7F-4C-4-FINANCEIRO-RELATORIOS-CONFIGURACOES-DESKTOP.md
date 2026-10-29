# Gradefy — Fase 7F.4C.4

## Escopo e estado inicial

Branch `feat/gradefy-foundation`. As alterações locais das fases 7F.4C.3 e 7F.4C.3.1 foram preservadas. Antes desta fase, Financeiro, Relatórios e Configurações eram funcionais, mas não seguiam a composição desktop dos protótipos em `docs/design-references/desktop/`. Capturas iniciais em `test-results/gradefy-{finance,reports,settings}-before-1672x941.png`.

## Alterações

- **Financeiro:** quatro indicadores baseados em valores reais, série diária do endpoint de relatórios, histórico tabular com valores assinados, estado, método, ações e paginação; coluna lateral com comparação de entradas/saídas, saldo operacional e distribuição líquida por método. Recebimento, despesa, estorno, auditoria e confirmações continuam usando os fluxos existentes. O `GET /api/admin/finance` ganhou apenas `methodTotals` de leitura, agrupado por empresa, período e método; estornos subtraem do método original. Despesas pendentes ou anuladas não são apresentadas como caixa pago.
- **Relatórios:** quatro indicadores contextuais, gráficos de séries já calculadas pela API, ranking de serviços concluídos, status e desempenho real de profissionais, mantendo filtros, URL, CSV e detalhes existentes. Gráficos receberam preenchimento sutil e eixo monetário em BRL; estados vazios continuam explícitos.
- **Configurações:** apresentação empresarial, cards de acesso aos módulos reais e acabamento desktop em duas colunas; os campos, pausas, regras e versionamento existentes permanecem. Alterações não salvas são indicadas e podem ser descartadas. Links de equipe respeitam o papel do usuário. Nenhum controle fictício de cobrança, integração ou notificação foi criado.
- **Compatibilidade:** layouts desktop usam CSS a partir de 801 px; os fluxos mobile e o Barber Classic permanecem nos componentes existentes. Nenhuma migration, autenticação ou rota pública foi alterada.

Arquivos desta fase: `server/finance.js`; `src/gradefy/finance-types.ts`, `finance.tsx`, `finance-desktop.tsx`, `finance-desktop.css`, `reports.tsx`, `reports-charts.tsx`, `reports-desktop.tsx`, `reports-desktop.css`, `operational-settings.tsx`, `settings-desktop.css`; `tests/helpers/finance.js`; `tests/e2e/gradefy-finance.spec.js`, `gradefy-reports.spec.js`, `gradefy-finance-reports-settings-desktop.spec.js`, `fixtures/finance-reports-settings-presentation.js`; e este documento.

## Comparação com os protótipos

| Tela          | Elementos reproduzidos                                                                   | Adaptação exigida pelos dados reais                                                                                                                   |
| ------------- | ---------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------- |
| Pagamentos    | Quatro KPIs, área financeira, tabela de histórico e painéis laterais                     | Sem taxas online, repasses ou saques; saldo é operacional e movimentações são manuais. Os filtros existentes ocupam uma linha própria acima dos KPIs. |
| Relatórios    | KPIs, gráficos lado a lado, ranking e cartões analíticos                                 | Sem retenção, avaliação, crescimento percentual ou comparativo de períodos que a API não calcula.                                                     |
| Configurações | Perfil, cards em duas colunas, horário, serviços, equipe, financeiro, avisos e segurança | Campos operacionais continuam editáveis na página; sem toggles de gateway, WhatsApp, calendário externo ou MFA inexistentes.                          |

As capturas preenchidas usam interceptações Playwright locais em `tests/e2e/fixtures/finance-reports-settings-presentation.js`; não gravam no banco nem enviam notificações. As capturas do ambiente de teste sem interceptação mostram os estados vazios reais.

## Capturas locais, 1672 × 941

- Financeiro real: `test-results/gradefy-finance-after-1672x941.png`; preenchido: `gradefy-finance-fixture-1672x941.png`; histórico: `gradefy-finance-history-fixture-1672x941.png`; modal: `gradefy-finance-payment-modal-1672x941.png`; detalhe: `gradefy-finance-expense-details-1672x941.png`.
- Relatórios reais: `test-results/gradefy-reports-after-1672x941.png`; visão geral, financeiro, atendimentos, serviços, profissionais e vazio: `gradefy-reports-{fixture,finance-fixture,appointments-fixture,services-fixture,professionals-fixture,empty}-1672x941.png`.
- Configurações reais: `test-results/gradefy-settings-after-1672x941.png`; perfil, dados, horários, regras, edição pendente e somente leitura: `gradefy-settings-{fixture,business-fixture,hours-fixture,booking-fixture,unsaved-fixture,readonly-fixture}-1672x941.png`.
- Mobile representativo: `test-results/finance-overview-390.png`, `reports-overview-390.png` e `operational-settings-390.png`.

## Verificação e limites

- Build web e TypeScript: aprovados.
- SQLite direcionado: 31/31 aprovados, incluindo métodos de pagamento líquidos, estornos e isolamento de empresa.
- E2E direcionado: 11/11 aprovados. Após os últimos ajustes visuais, os dois testes próprios da fase passaram novamente, cobrindo 1024–1920 px, 320–768 px e zoom de 125% nas três páginas.
- Backend completo: 335/339. Quatro falhas conhecidas de validação de destinatários em `server/email-templates.js`, fora do escopo desta fase.
- Mobile: 5/5 testes e TypeScript aprovados.
- E2E geral: 133/133 aprovados. Após esse ciclo, houve apenas um ajuste de composição CSS/JSX em Relatórios e os dois testes visuais próprios foram executados novamente.
- PostgreSQL 17.11 portátil: 267/267 aprovados em cluster descartável criado por `tests/postgres/run-local.mjs`; `testExitCode=0`, `clusterStopped=true` e `clusterRemoved=true`. O encerramento rápido excedeu o prazo e o executor usou encerramento imediato do próprio cluster de teste.
- Prettier dos arquivos da fase, `git diff --check` e build final: aprovados.
- Nenhum banco de produção foi acessado.

Não houve commit nem push. A navbar global e a área interna de Equipe/Acessos continuam reservadas à Fase 7F.4C.4.1.
