# Gradefy — Fase 7F.4C.4-R1

## Diagnóstico e ajustes

Branch `feat/gradefy-foundation`. O estado inicial tinha alterações locais não commitadas das fases 7F.4C.3, 7F.4C.3.1 e 7F.4C.4. Foram preservadas. O trabalho R1 ficou restrito à apresentação desktop de Financeiro, Relatórios e Configurações e ao teste visual dirigido.

| Tela          | Antes                                                                                                   | Depois                                                                                                                                                                                                                                                    |
| ------------- | ------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Financeiro    | Filtros antecediam os quatro indicadores; gráfico alto deixava o histórico fora da primeira tela.       | KPIs aparecem após o cabeçalho, seguidos pelos filtros reais compactados; gráfico proporcional com eixo, legenda e consulta aos dados preservados; cabeçalho e tabela do histórico começam na primeira tela de 1672 × 941.                                |
| Relatórios    | Financeiro, Atendimentos e Profissionais tinham gráficos altos em largura total.                        | Gráficos proporcionais nas três abas, mantendo “Leitura dos números” e os controles. A Visão geral mantém os gráficos financeiros, de atendimentos e serviços lado a lado, com cards de status e profissionais abaixo.                                    |
| Configurações | Os sete dias de edição detalhada ocupavam toda a coluna e o telefone do resumo aparecia sem formatação. | Resumo compacto mostra dias, expediente, fechamento e pausas reais; botão acessível abre a edição completa sem perder mudanças pendentes; telefone brasileiro é formatado apenas no card de apresentação. Cards de acesso por link ficaram proporcionais. |

## Dados e semântica

A série do gráfico vem de `GET /api/admin/reports` com a empresa e o intervalo selecionados. O backend agrega por data financeira, ordena por data e preenche dias sem movimento com zero. Na fixture isolada, o dia com `receivedCents = -2000` corresponde a um estorno manual de R$ 20,00. O valor negativo foi preservado; o teste verifica a série, a ordem cronológica e o painel “Ver dados”. O gráfico não transforma valores de serviços concluídos em recebimentos nem saldo operacional em lucro.

As cinco abas de Relatórios foram inspecionadas: Visão geral apresenta KPIs, duas séries, serviços, status e profissionais; Financeiro mantém seus quatro KPIs e leitura explicativa; Atendimentos mostra contagens e evolução; Serviços mostra ranking de atendimentos concluídos; Profissionais mostra desempenho por quantidade real. Os filtros e a exportação CSV permanecem nos componentes existentes. O protótipo inclui retenção, avaliação, crescimento, comparação, taxa de ocupação e insights que não têm fonte confiável nessa API; tais números não foram inventados.

Configurações preserva o formulário e a validação do servidor. A edição de horários fica sempre visível no mobile. No desktop, campos recolhidos continuam montados e guardam alterações não salvas; o botão não recolhe campos inválidos. Não houve salvamento automático, mudança nos expedientes profissionais nem alteração de regras de reserva. O perfil usa o ícone existente porque a resposta de configurações não fornece logo; o valor do telefone enviado à API não é mascarado.

## Arquivos da R1

- `src/gradefy/finance-desktop.tsx`, `finance-desktop.css` — gráfico compacto, ordem visual e proporções.
- `src/gradefy/reports-charts.tsx`, `reports-desktop.tsx`, `reports-desktop.css` — proporção opcional do SVG e espaçamento das abas desktop.
- `src/gradefy/operational-settings.tsx`, `settings-desktop.css` — resumo/edição dos horários, telefone de apresentação e cards.
- `tests/e2e/gradefy-finance-reports-settings-desktop.spec.js` — ordem dos KPIs, série negativa, responsividade, edição sem perda e confirmação visual.
- `tests/e2e/gradefy-operational-settings.spec.js` — abre a edição desktop antes de preencher os dias no teste de validação operacional existente.
- Este documento.

Nenhuma migration, rota, autenticação, componente mobile, ledger financeiro, interface de Equipe/Acessos ou navbar global foi modificada nesta lapidação.

## Capturas reais de navegador

Todas as imagens abaixo têm 1672 × 941 px e são produzidas pelo teste Playwright com fixture local isolada. O caso real sem interceptação é capturado nos arquivos `*-after-1672x941.png`. As capturas anteriores estão em `test-results/gradefy-{finance,reports,settings}-before-1672x941.png`.

| Tela / estado                            | Captura após a R1                                                 |
| ---------------------------------------- | ----------------------------------------------------------------- |
| Financeiro principal e histórico inicial | `test-results/gradefy-finance-fixture-1672x941.png`               |
| Histórico rolado                         | `test-results/gradefy-finance-history-fixture-1672x941.png`       |
| Série financeira e dados acessíveis      | `test-results/gradefy-finance-chart-data-r1-1672x941.png`         |
| Financeiro sem dados reais de teste      | `test-results/gradefy-finance-after-1672x941.png`                 |
| Relatórios: Visão geral                  | `test-results/gradefy-reports-fixture-1672x941.png`               |
| Relatórios: Financeiro                   | `test-results/gradefy-reports-finance-fixture-1672x941.png`       |
| Relatórios: Atendimentos                 | `test-results/gradefy-reports-appointments-fixture-1672x941.png`  |
| Relatórios: Serviços                     | `test-results/gradefy-reports-services-fixture-1672x941.png`      |
| Relatórios: Profissionais                | `test-results/gradefy-reports-professionals-fixture-1672x941.png` |
| Configurações: visão geral e perfil      | `test-results/gradefy-settings-fixture-1672x941.png`              |
| Configurações: card do estabelecimento   | `test-results/gradefy-settings-profile-r1-1672x941.png`           |
| Configurações: horários resumidos        | `test-results/gradefy-settings-hours-summary-r1-1672x941.png`     |
| Configurações: edição expandida          | `test-results/gradefy-settings-hours-fixture-1672x941.png`        |
| Configurações: estado após salvar        | `test-results/gradefy-settings-saved-r1-1672x941.png`             |

As capturas podem diferir dos protótipos em `docs/design-references/desktop/` porque estes representam recursos não disponíveis, como repasses bancários, gateway online, retenção, avaliações e integrações. Os cards atuais mostram apenas dados reais e ações existentes.

## Verificação

- Build web, TypeScript (`tsc -b`) e verificação JS de agenda: aprovados.
- SQLite dirigido (`finance`, `reports`, `operational-settings`): 31/31.
- PostgreSQL 17.11 portátil: 267/267 em cluster descartável de `127.0.0.1`; `test-results/postgres-validation/report.json` confirma `productionAccess: false`, `clusterStopped: true` e `clusterRemoved: true`.
- Mobile: 5/5 testes e TypeScript aprovados.
- E2E dirigido após a correção do teste operacional: 5/5. E2E geral final: 133/133, incluindo Igor/Barber Classic, escopo empresarial, exportação CSV, responsividade e fluxos operacionais.
- Backend completo em execução serial (`node --test --test-concurrency=1 tests/*.test.js`): 335/339. As quatro falhas conhecidas de validação de destinatários em `server/email-templates.js` permanecem fora do escopo. O comando padrão `npm test`, que roda os arquivos em paralelo, terminou em 332/339: as mesmas quatro falhas de e-mail e três falhas adicionais no teste do monitor de desenvolvimento. Esse teste passou isoladamente (7/7) e na suíte serial; há interferência entre arquivos de teste executados em paralelo, sem evidência de regressão nas telas R1.
- Prettier dos arquivos modificados e `git diff --check`: aprovados.

Não houve commit, push, acesso à produção ou envio de e-mails.
