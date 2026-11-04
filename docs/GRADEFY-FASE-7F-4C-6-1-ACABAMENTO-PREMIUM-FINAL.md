# Gradefy — Fase 7F.4C.6.1: acabamento premium final

## Estado inicial e escopo

Branch `feat/gradefy-foundation`, com alterações locais não commitadas das fases 7F.4C.5, 7F.4C.5.1 e 7F.4C.6 preservadas. A revisão usou os relatórios dessas fases, das fases 7F.4C.4-R1 e 7F.4C.4.1, as referências em `docs/design-references/{mobile,desktop}` e as capturas anteriores em `test-results/`. As mudanças desta etapa são de apresentação e texto no painel Gradefy. APIs, permissões, autenticação, regras financeiras e de agenda, templates públicos e Igor Barber Club permaneceram sem alterações.

## Dashboard mobile

- Saudação e data usam os dados de `GET /api/dashboard`, formatados no fuso da empresa. A data ganhou formato compacto somente no mobile. A descrição repetitiva foi ocultada no mobile.
- O plano e o estado da assinatura vêm do mesmo objeto `subscription` da API e aparecem como chips no card da empresa. Estado vencido recebe apresentação restrita e mantém o card completo do plano mais abaixo na tela. O seletor de empresas mantém o controle nativo acessível, agora compacto no card.
- Os quatro KPIs mantêm os valores da API. O intervalo e as explicações financeiras estão em controles `<details>` acionáveis por toque e teclado. Recebimentos continuam identificados como lançamentos manuais líquidos; valor previsto não é pagamento recebido.
- A divergência observada entre o KPI de hoje e a lista é legítima: `server/dashboard.js` conta **confirmados e concluídos** no KPI; a lista inclui todos os status, inclusive cancelados e ausências. O rótulo passou a ser “Agendamentos ativos hoje”. Nenhum contador foi alterado.
- `body.gf-body` remove o mínimo global de 320 px apenas nas rotas Gradefy, permitindo viewport de 312 px sem rolagem horizontal. O mínimo global do site legado permanece.

## Textos e consequências

| Antes                                                                                                                             | Depois                                                                                       | Motivo                                |
| --------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------- | ------------------------------------- |
| “Agendamentos de hoje”                                                                                                            | “Agendamentos ativos hoje”                                                                   | Explicita o critério da consulta.     |
| “Veja como está sua agenda hoje.”                                                                                                 | Oculto no cabeçalho mobile                                                                   | Repetia a saudação e a agenda.        |
| “01/11/2026 a 30/11/2026 · indicadores de toda a empresa”                                                                         | “Sobre os indicadores”, expansível                                                           | Mantém período e escopo consultáveis. |
| “Gerencie os cadastros de [empresa].”                                                                                             | “Gerencie seus clientes.”                                                                    | Elimina repetição do nome.            |
| “Consulte outra data ou ajuste os filtros.”                                                                                       | “Nenhum atendimento encontrado.”                                                             | Estado vazio direto.                  |
| “Nenhuma movimentação para este gráfico no período selecionado.”                                                                  | “Nenhuma movimentação neste período.”                                                        | Mantém sentido financeiro.            |
| “Configurações operacionais” e “Seu estabelecimento, suas regras.”                                                                | “Configurações” e “Funcionamento, reservas e dados do estabelecimento.”                      | Cabeçalho mais claro.                 |
| “Recarregar configurações”                                                                                                        | “Atualizar dados”                                                                            | Ação curta.                           |
| “Reservas online pausadas. Seu site permanece publicado. A agenda administrativa e as reservas existentes continuam disponíveis.” | “Novas reservas pelo site pausadas. O site e as reservas existentes permanecem disponíveis.” | Mantém a consequência operacional.    |

As confirmações de retirada de publicação, mudanças de horários, cancelamento e as distinções entre recebimento, previsão e despesa permaneceram explícitas. Exemplos de estados vazios e confirmações sensíveis são capturados na suíte visual.

## Configurações, Meu Site e onboarding

- **Configurações desktop:** título, descrições e ações foram encurtados. O resumo da empresa, horários expansíveis, regras, contatos, salvamento, validação e links continuam nos mesmos cards. O texto distingue expediente da empresa de agendas, pausas e bloqueios individuais.
- **Meu Site:** a visão geral apresenta nome, status confirmado pela API, endereço calculado a partir da origem atual e do slug existente, prévia, site publicado, cópia, compartilhamento, edição, salvamento e acesso à publicação. A retirada do ar continua exigindo a confirmação existente. A prévia e o portfólio permanecem no editor. O endereço de rascunho é rotulado “Endereço após publicação”. A cópia tem feedback acessível; o compartilhamento usa Web Share quando disponível e oferece cópia como alternativa.
- **Onboarding:** os campos existentes foram agrupados em Sobre o negócio, Endereço do site, Contatos e Localização. Plano, segmento e template continuam visíveis e corrigíveis. O slug mantém validação e tratamento de conflito originais. O layout agora usa mais largura no desktop e uma coluna no mobile. Criação, idempotência, retomada e início posterior do trial permanecem sob os mesmos endpoints.

## Capturas reais

As capturas após esta fase são renderizadas pelo Chromium em `test-results/gradefy-7f4c61-*.png`. O teste usa o servidor Playwright com SQLite em memória e dados fictícios; os estados apresentados por interceptação permanecem somente no navegador. Capturas anteriores disponíveis para comparação: `test-results/mobile-dashboard-before-390x844.png`, `gradefy-settings-before-1672x941.png` e `minisite-editor-1440.png`. A captura anterior do onboarding com o mesmo estado não foi preservada; a comparação dessa tela usa a estrutura anterior documentada no Git e a captura posterior.

| Área                     | Arquivos após a fase                                                                                                                               |
| ------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------- |
| Dashboard 390 × 844      | `dashboard-trial`, `dashboard-filled`, `dashboard-restricted`, `dashboard-company-selector`, `dashboard-finance-detail`                            |
| Configurações 1672 × 941 | `settings-main`, `settings-hours-summary`, `settings-hours-edit`, `settings-operational`                                                           |
| Meu Site 1672 × 941      | `site-published`, `site-unpublished`, `site-identity`, `site-portfolio`, `site-sensitive-confirmation`                                             |
| Onboarding               | `onboarding-desktop-1672x941`, `onboarding-mobile-390x844`, `onboarding-partial-390x844`, `onboarding-errors-390x844`, `onboarding-resume-390x844` |

A comparação visual dos textos do Dashboard está em `test-results/mobile-dashboard-before-390x844.png` e `test-results/gradefy-7f4c61-dashboard-trial-390x844.png`; a tabela anterior registra as mudanças literais. O estado vazio real está em `test-results/mobile-dashboard-empty-390x844.png`, e a confirmação sensível está em `test-results/gradefy-7f4c61-site-sensitive-confirmation-1672x941.png`.

O seletor nativo é expandido somente na fixture visual para exibir suas opções na captura. A ação real continua sendo o `<select>` existente. O teste também confere ausência de overflow nas larguras móveis 312, 320, 360, 390 e 428 px e nas larguras desktop principais. O zoom real de 125% ainda depende de conferência manual no navegador de destino.

## Acessibilidade e limites

Os detalhes financeiros e do período usam `<summary>` focável; os links e botões preservam seus rótulos, e o seletor de empresa mantém `<label>`. Erros de campo e feedback de salvamento continuam associados aos controles. O site legado e o template público não receberam os estilos desta fase.

O formulário de onboarding ainda não salva um rascunho antes de criar a empresa; isso é o comportamento preexistente. A retomada após a criação está testada. A fase seguinte de QA deve revisar manualmente zoom de 125% e leitura por tecnologias assistivas em navegador e sistema reais.

## Arquivos desta fase

`src/gradefy/dashboard.tsx`, `dashboard-mobile.css`, `styles.css`, `business-setup.tsx`, `business-setup.css`, `minisite-editor.tsx`, `minisite-editor.css`, `operational-settings.tsx`, `business-management.tsx`, `agenda.tsx`, `reports-charts.tsx`; testes `tests/e2e/gradefy-business.spec.js`, `gradefy-operational-settings.spec.js`, `gradefy-session-stability.spec.js`, `gradefy-premium-finish.spec.js`; este documento. Os demais arquivos locais alterados pertencem às fases anteriores e foram preservados.

## Validação

- Build web + TypeScript + checagem tipada de agenda: aprovado.
- E2E dirigido dos quatro grupos de captura: 4/4, incluindo cópia real do endereço público. E2E dirigido de onboarding, Mini Site, Dashboard mobile, Configurações e sessão: 20/20.
- Regressão E2E completa sobre o build final: **147/147**. Inclui Igor/Barber Classic, autenticação e reserva do Mini Site, empresas distintas, agenda, financeiro, perfil, configurações e onboarding.
- SQLite dirigido (`dashboard`, `company-onboarding`, `operational-settings`, `site-editor`, `site-publication`, `reports`, `business-management`, `finance`): **77/77**. Backend completo em execução serial, com variáveis de conexão externas zeradas: **339/339**.
- PostgreSQL **17.11** em cluster novo descartável no loopback: **267/267**. `test-results/postgres-validation/report.json` registra `productionAccess: false`, `testExitCode: 0`, `clusterStopped: true` e `clusterRemoved: true`. As mensagens de falha injetada no log pertencem aos testes de rollback, que passaram.
- App mobile: **5/5** e `tsc --noEmit` aprovado.
- `npm run format:check -- --end-of-line auto` e `git diff --check`: aprovados. O comando Prettier sem `--end-of-line auto` aponta diferenças preexistentes de terminador de linha em 198 arquivos fora do escopo; nenhum deles foi formatado por esta fase.

Não houve commit, push, deploy, envio de e-mails ou acesso a produção.
