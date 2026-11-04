# Gradefy — Fase 7F.4C.6: Clientes, Pagamentos e Perfil mobile

## Escopo e referências

Branch `feat/gradefy-foundation`. As alterações locais das fases 7F.4C.5 e 7F.4C.5.1 foram preservadas. Os arquivos em `docs/design-references/mobile/` foram abertos visualmente: `image-gen-1(1).png` é o Dashboard, `image-gen-2(1).png` é a Agenda, `image-gen-3(1).png` é Clientes, `image-gen-4.png` é Pagamentos e `image-gen-5.png` é Perfil. As duas primeiras telas e a navbar inferior aprovada não foram redesenhadas.

## Alterações

- **Clientes:** cabeçalho móvel com marca, notificações e conta; busca da API em uma linha; quatro indicadores reais de `GET /api/admin/clients`; cards com inicial, contato e data de cadastro; acesso ao detalhe e histórico existentes; ações de cadastro e agendamento. Busca e paginação continuam no servidor. O estado de busca sem resultados é distinto do cadastro vazio.
- **Pagamentos:** quatro indicadores do livro financeiro real, gráfico de `GET /api/admin/reports` já carregado pelo componente existente, valor histórico de serviços concluídos identificado separadamente, filtros, histórico, paginação, formulários e modais originais. A função de apresentação de sinais monetários é compartilhada com a tabela desktop: recebimentos são positivos; estornos e despesas pagas são negativos; despesas pendentes não são apresentadas como saída paga. O saldo operacional não é chamado de lucro, e o histórico de serviços não é chamado de recebimento.
- **Perfil:** a conta e os estabelecimentos reais aparecem em cards, com papel de cada vínculo e plano empresarial quando informado pela API. Os atalhos empresariais, incluindo Profissionais, são mostrados somente quando o usuário tem vínculo de proprietário ou gestor; a jornada de profissional e de conta sem empresa permanece. A saída utiliza o logout original. Nenhum recurso sem backend (edição de foto, pagamentos online, aniversários, VIP, avaliações ou campanhas) foi simulado.

As rotas, permissões, autenticação, APIs, migrations, templates públicos, identidade do Igor, Dashboard e Agenda foram preservados. A apresentação desktop de Clientes e Pagamentos continua nos componentes existentes; o Perfil desktop conserva o card original. Os estilos novos são limitados a `max-width: 800px`.

## Comparação visual

As capturas de antes foram copiadas das evidências locais existentes: `test-results/mobile-phase-7f4c6-{clientes,pagamentos,perfil}-before-390x844.png`. As capturas de depois são produzidas no navegador Chromium pelo teste dirigido, com fixture isolada para Clientes e Pagamentos e conta real de teste para Perfil:

| Tela       | Captura após a fase                                                                                                                                                          | Diferença deliberada em relação ao protótipo                                                                                                                                                           |
| ---------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Clientes   | `test-results/mobile-phase-7f4c6-clientes-fixture-390x844.png`, `mobile-phase-7f4c6-clientes-lista-390x844.png`                                                              | Indicadores de cadastros, novos, reserva futura e visitas concluídas substituem VIP, aniversários, última visita e gasto não disponíveis na listagem atual; avatares usam iniciais.                    |
| Pagamentos | `test-results/mobile-phase-7f4c6-pagamentos-fixture-390x844.png`, `mobile-phase-7f4c6-pagamentos-grafico-390x844.png`, `mobile-phase-7f4c6-pagamentos-historico-390x844.png` | Os cards mostram entradas manuais, despesas pagas, saldo e previsão reais; não há taxas de serviço, crescimento fictício, gateway ou pagamentos online. O gráfico mantém valores negativos de estorno. |
| Perfil     | `test-results/mobile-phase-7f4c6-perfil-real-390x844.png`, `mobile-phase-7f4c6-perfil-sem-empresa-390x844.png`, `mobile-phase-7f4c6-perfil-multiplos-papeis-390x844.png`     | Contas com múltiplas empresas mostram todos os vínculos; atalhos são apenas para recursos existentes e papéis autorizados. Não há botão de edição de perfil sem fluxo implementado.                    |

As três telas também foram capturadas em 320 × 844, 360 × 844, 428 × 844 e 1672 × 941 px. As capturas em 1672 px mostram que as composições desktop aprovadas permanecem visíveis. Após a primeira comparação, a busca de Clientes foi compactada e os textos dos KPIs de Pagamentos foram encurtados sem perder a distinção contábil. A segunda comparação foi feita com screenshots reais geradas após o rebuild.

## Arquivos desta fase

`src/gradefy/business-management.tsx`, `clients-mobile.css`, `finance.tsx`, `finance-mobile.css`, `finance-desktop.tsx`, `pages.tsx`, `account-mobile.css`, `tests/e2e/gradefy-mobile-clients-finance-profile.spec.js` e este documento.

## Validação

- Build web, TypeScript e verificação tipada da agenda: aprovados.
- SQLite dirigido de Clientes e Financeiro: 20/20.
- App mobile legado: 5/5 testes e TypeScript aprovados.
- E2E dirigido das três telas e dos estados sem empresa/profissional: 4/4. Regressão dirigida de gestão, financeiro e jornada interna: 14/15 na primeira rodada; um teste de convite da Equipe atingiu timeout numa espera de atualização assíncrona, fora das três telas desta fase. A suíte E2E completa sobre o build final passou **143/143**, incluindo o convite e os quatro testes novos.
- Backend completo em ambiente de teste, com URLs de banco zeradas: **339/339**.
- PostgreSQL 17.11 portátil em cluster novo descartável no loopback: **267/267**. `test-results/postgres-validation/report.json` registra `productionAccess: false`, `testExitCode: 0`, `clusterStopped: true` e `clusterRemoved: true`.
- Prettier dos arquivos modificados e `git diff --check`: aprovados.

Nenhum commit, push, acesso à produção ou alteração de banco persistente foi feito. O teste E2E utiliza SQLite de navegador isolado; a fixture de apresentação é interceptada no navegador e não grava clientes nem pagamentos.
