# Gradefy — Fase 7F.4C.4.1

## Estado inicial e referência

Na branch `feat/gradefy-foundation`, o último commit era `89220ac`. As alterações locais das fases 7F.4C.3, 7F.4C.3.1, 7F.4C.4 e 7F.4C.4-R1 foram preservadas. A sidebar variava conforme as propriedades passadas por cada tela; `/app/meu-site` não a exibia. A gestão de acessos ainda usava registros altos e pouco alinhados com a Equipe desktop.

As referências foram o Dashboard e a Equipe originais em `docs/design-references/desktop/`, comparados com capturas reais anteriores em `test-results/gradefy-dashboard-before-1672x941.png` e `test-results/gradefy-team-before-reconstructed-1672x941.png`. Nenhuma imagem nova foi gerada por IA.

## Navegação compartilhada

`BusinessNav` é a única sidebar empresarial desktop. A ordem final é Dashboard (`/app/dashboard`), Agenda (`/app/agenda`), Clientes (`/app/clientes`), Equipe (`/app/equipe`), Serviços (`/app/servicos`), Pagamentos (`/app/financeiro`), Relatórios (`/app/relatorios`) e Configurações (`/app/configuracoes`). “Mais áreas” contém Profissionais (`/app/profissionais`) e Meu Site (`/app/meu-site`). As rotas e a navegação inferior mobile mantêm os destinos existentes. Os links incluem a empresa selecionada; só o link exato recebe `aria-current="page"`. A seção adicional abre quando contém a rota atual e usa `details/summary` para mouse, toque e teclado. A largura vem do token CSS `--gf-business-sidebar-width`: 244 px no desktop principal e 202 px entre 801 e 1199 px, inclusive no Meu Site e no deslocamento do rodapé.

`ManagementAccess` fornece a empresa selecionada via contexto. O editor de site usa o mesmo contexto e a mesma sidebar, sem alterar a tela de onboarding. A consulta de empresas já realizada pelo aplicativo pede agora `view=management`, com nome do plano, assinatura, validade e publicação somente para owner/manager e somente nas empresas da própria associação. `GET /api/companies` sem essa opção mantém o contrato antigo. O card mostra o estado real da assinatura, inclusive teste expirado; assinaturas ativas usam a própria data de término, sem confundir com a antiga data do trial. Quando algum dado não existe, usa estado neutro. Não há CTA de contratação porque ainda não existe rota de gestão de planos. Na troca de empresa, o contexto só exibe dados cujo ID corresponde à página atual, evitando informação anterior. Minha conta e o nome do estabelecimento continuam no rodapé; a sidebar rola internamente em alturas menores.

## Equipe e acessos

O cabeçalho de acessos oferece ação para focar o formulário de convite e três contagens derivadas de `/admin/team`: membros ativos, convites pendentes e convites expirados. Convites cancelados aparecem na lista com estado próprio e não entram na contagem de expirados. O aviso distingue conta com acesso de cadastro profissional. O formulário conserva e-mail, papel, criação ou vínculo profissional no aceite, seleção do profissional e validações existentes. Membros têm avatar, papel, situação, vínculo e ações autorizadas em linhas compactas. Convites mostram e-mail, papel, estado, criação quando informada, validade, vínculo profissional quando aplicável e entrega efetiva quando pendentes; renovação e cancelamento conservam os modais de confirmação.

As ações de alteração de papel, revogação e vínculo profissional continuam submetidas às permissões e verificações de concorrência existentes. O proprietário não recebe controles de revogação. O link e o código do convite só aparecem no modal autorizado do fluxo que os recebe; não são persistidos nem mostrados na listagem. O menu nativo, `aria-current`, o foco no formulário e os modais existentes preservam navegação por teclado e toque. As capturas de compartilhamento usam somente valores fictícios isolados no Playwright; nenhum convite ou e-mail real foi criado. A escala semanal e o cadastro de profissionais aprovados não foram reconstruídos.

## Capturas reais

Todas em 1672 × 941 px, produzidas pelo navegador de teste. As capturas da fase ficam em `test-results/` e não são artefatos versionados.

| Estado                    | Arquivo                                                                                                                                                                                                                                      |
| ------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Oito rotas principais     | `nav-dashboard-1672x941.png`, `nav-agenda-1672x941.png`, `nav-clientes-1672x941.png`, `nav-equipe-1672x941.png`, `nav-servicos-1672x941.png`, `nav-financeiro-1672x941.png`, `nav-relatorios-1672x941.png`, `nav-configuracoes-1672x941.png` |
| Áreas adicionais e rodapé | `nav-profissionais-1672x941.png`, `nav-meu-site-1672x941.png`, `nav-more-footer-1672x941.png`                                                                                                                                                |
| Acessos                   | `team-access-populated-1672x941.png`, `team-access-summary-1672x941.png`, `team-access-invite-form-1672x941.png`, `team-access-members-1672x941.png`, `team-access-invitations-1672x941.png`                                                 |
| Modais e estados          | `team-access-confirmation-1672x941.png`, `team-access-share-1672x941.png`, `team-access-empty-1672x941.png`, `team-access-real-1672x941.png`                                                                                                 |

A comparação com o Dashboard original confirmou a composição e a largura de 244 px usada no Dashboard aprovado, além de logo, ícones, destaque violeta, card inferior e identificação. Uma primeira captura de Meu Site revelou falta dos estilos base da sidebar; a importação foi corrigida e a captura final foi refeita. A fixture com 18 convites revelou overflow em 1024 px causado por direção de flex herdada; a direção da linha foi corrigida. Um teste posterior mediu 244 px no Dashboard e 234 px na Agenda: a largura passou a usar o mesmo token CSS nas dez rotas. As novas capturas foram geradas após a correção.

## Arquivos desta fase

- Fonte dos dados: `server/app.js`, `server/company-access.js`, `src/gradefy/company-access.ts`, `src/gradefy/management.tsx`.
- Sidebar e integração: `src/gradefy/business-nav.tsx`, `src/gradefy/business-design.css`, `src/gradefy/dashboard-desktop.css`, `src/gradefy/Shell.tsx`, `src/gradefy/site-editor.tsx`, `src/gradefy/site-editor-nav.css`, além das chamadas em `agenda.tsx`, `business-management.tsx`, `dashboard-desktop.tsx` e `team.tsx`.
- Acessos: `src/gradefy/team.tsx`, `src/gradefy/team.css`.
- Testes: `tests/helpers/multitenant-access.js`, `tests/e2e/gradefy-business-navigation.spec.js`, `gradefy-agenda.spec.js`, `gradefy-finance.spec.js`, `gradefy-team.spec.js`, `gradefy-internal-journey.spec.js`, `gradefy-session-stability.spec.js` e `gradefy.spec.js` na mesma pasta.
- Este relatório. Os demais arquivos modificados no Git pertencem a fases anteriores e foram preservados.

## Verificação

- Build web, TypeScript e checagem JS de agenda: aprovados.
- SQLite dirigido: 45/45 nos testes de gestão, equipe, dashboard e onboarding; 17/17 no contrato de contexto após manter a resposta padrão de `/api/companies`.
- PostgreSQL 17.11 portátil, cluster local descartável: 267/267; `test-results/postgres-validation/report.json` confirma `productionAccess: false`, `clusterStopped: true` e `clusterRemoved: true`.
- Mobile: 5/5 e TypeScript aprovados.
- E2E dirigido de navegação/jornada/Equipe e Serviços: 12/12; recuperação de conta e sessão após atualização da rota de empresas: 18/18; navegação e acessos após padronização da largura: 4/4. A primeira execução geral concluiu 135/137 porque duas interceptações antigas de `/api/companies` não simulavam o erro na nova consulta `?view=management`. Foram corrigidas. A execução geral final, após a correção do CSS, passou **137/137**.
- Backend serial: 335/339. As quatro falhas são de validação de destinatários em `server/email-templates.js`, já relatadas na fase anterior; nenhuma alteração foi feita nesse módulo.
- As verificações cobrem a ordem dos links, item ativo, teclado, troca de empresa, card de plano, acessos, largura constante da sidebar nas dez rotas em 1672 e 1024 px e viewports de 320 a 1920 px. Em 1024 px com muitos convites não há overflow global. Uma simulação de escala CSS de 125% no teste não causou overflow; isso não equivale ao zoom real do navegador, que ainda requer conferência manual.

## Limitações para o Alpha

Não existe página de gestão de assinatura/cobrança, portanto o card é informativo. Os quatro testes conhecidos de validação de destinatário em templates de e-mail e a interferência paralela do monitor de desenvolvimento continuam fora desta fase. O zoom real do navegador em 125% precisa de conferência manual; o teste automatizado usa escala CSS apenas para verificar overflow. Os testes visuais usam fixtures locais; a captura real sem interceptação foi mantida separada. Não houve migration, mudança de autenticação, de permissão, de backend de convites ou de regra financeira. Não houve acesso à produção, commit ou push.
