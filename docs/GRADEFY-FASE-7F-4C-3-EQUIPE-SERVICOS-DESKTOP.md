# Gradefy 7F.4C.3 — Equipe e Serviços desktop

## Resultado e referências

As rotas `/app/equipe`, `/app/profissionais` e `/app/servicos` usam a composição desktop Gradefy, mantendo os formulários, confirmações, permissões e layouts mobile existentes. As referências oficiais foram identificadas visualmente em `docs/design-references/desktop/`:

- Equipe: `Imagem do ChatGPT 20 de out. de 2026, 20_18_12-4.png`.
- Serviços: `Imagem do ChatGPT 20 de out. de 2026, 20_18_13-5.png`.
- Dashboard aprovado: `Imagem do ChatGPT 20 de out. de 2026, 20_18_10-1.png`.

Foram reutilizados `BusinessNav`, `ManagementTopbar`, `Card`, `Button`, `Feedback`, os formulários e modais de `business-management.tsx` e os fluxos de convite de `team.tsx`. As folhas `team-desktop.css` e `services-desktop.css` aplicam o redesign apenas a partir de 801 px; as três rotas preservam a apresentação anterior até 800 px.

## Equipe, escala e acesso

`/app/equipe` permanece exclusiva do proprietário para convites, papéis e revogação. `/app/profissionais` permanece o cadastro operacional acessível segundo as permissões de gestão. A visão desktop compartilha os mesmos profissionais e oferece navegação entre as duas rotas, sem criar outro cadastro. Em `/app/equipe`, os controles completos de acesso continuam no bloco **Acessos e permissões**, acessível pelo resumo.

Os quatro indicadores vêm da lista empresarial de `/admin/professionals`: cadastrados, ativos, com `availability.state=ready` e com pelo menos um serviço vinculado. **Ativo** não é sinônimo de agenda pronta. A lista distingue cadastro, estado da agenda e vínculo de serviços; a desativação mantém o modal e a checagem de reservas futuras originais.

O novo `GET /api/admin/team/weekly` é leitura empresarial autorizada, limitada a uma semana válida dentro de ±366 dias e aos primeiros 200 profissionais ordenados por nome. A resposta indica quando a lista foi truncada. A consulta única lê `barbers`, `barber_working_hours`, `barber_working_breaks`, `barber_settings`, `released_weeks` e `blocks`, todos filtrados por `company_id` e os identificadores retornados. Retorna sete datas civis no fuso da empresa e os horários individuais, intervalos, folgas, bloqueios e situação de abertura manual. Não retorna motivos nem observações internas dos bloqueios. A escala é informativa e não substitui o motor de disponibilidade. O card de ausências mostra apenas os bloqueios futuros da semana em exibição, com acesso ao fluxo de agenda já existente. O desempenho usa `/admin/reports?area=professionals&period=last30`: quantidade de atendimentos **concluídos**, nunca receita prevista.

## Serviços

O catálogo desktop usa `/admin/services` e `/admin/professionals` da empresa selecionada. Busca, categoria e status filtram localmente a lista completa carregada pela API. A tabela mostra descrição, duração, preço, profissionais vinculados e estado; edição, ativação e desativação continuam nos formulários e APIs existentes. As quatro contagens são serviços cadastrados, ativos, categorias utilizadas e serviços com algum profissional vinculado. Profissionais inativos são identificados no vínculo; a elegibilidade para reservar continua definida pelo backend.

O ranking consulta `/admin/reports?area=services&period=last30` e mostra apenas atendimentos concluídos nos últimos 30 dias, sem contar cancelamentos. O painel **Composição do catálogo** distribui os serviços cadastrados por categoria, com contagens e barras proporcionais ao total do catálogo; não é apresentado como mix de faturamento nem de atendimentos. Não foram criados preços fictícios, avaliação, combo, pacote ou motor de reserva novo.

## Auditoria visual

As referências têm cartões KPI com gradiente, composição principal em duas colunas, tabelas densas e painéis auxiliares. A implementação reproduz essa hierarquia com a sidebar e o cabeçalho compartilhados. As capturas principais foram geradas em 1672 × 941 px e comparadas visualmente com as referências. As diferenças intencionais são: KPIs baseados em cadastros reais no lugar de crescimento/produtividade ilustrativos; **Estado das agendas** no lugar de avaliações inexistentes; ausências em uma faixa própria; ícones no lugar de fotografias não cadastradas em serviços; e painel operacional no lugar de combos sem suporte. As cores e superfícies seguem o Dashboard aprovado.

As capturas “antes” reconstituem os componentes legados ainda presentes no DOM, ocultando temporariamente a nova composição apenas no teste visual. Elas não são uma captura arquivada do commit anterior; servem para comparar a hierarquia de cards legada com o novo desktop usando a mesma fixture isolada.

Capturas isoladas em `test-results/`:

| Tela                                          | Arquivo                                                                         |
| --------------------------------------------- | ------------------------------------------------------------------------------- |
| Equipe, banco de teste                        | `gradefy-team-real-1672x941.png`                                                |
| Equipe, apresentação anterior reconstituída   | `gradefy-team-before-reconstructed-1672x941.png`                                |
| Equipe, fixture visual preenchida             | `gradefy-team-presentation-1672x941.png`                                        |
| Equipe, permissões e ausências                | `gradefy-team-permissions-1672x941.png`                                         |
| Equipe, estado vazio                          | `gradefy-team-empty-1672x941.png`                                               |
| Profissionais, fixture visual preenchida      | `gradefy-professionals-presentation-1672x941.png`                               |
| Serviços, banco de teste                      | `gradefy-services-real-1672x941.png`                                            |
| Serviços, apresentação anterior reconstituída | `gradefy-services-before-reconstructed-1672x941.png`                            |
| Serviços, fixture visual preenchida           | `gradefy-services-presentation-1672x941.png`                                    |
| Serviços, formulário aberto                   | `gradefy-services-editor-1672x941.png`                                          |
| Serviços filtrados e vazios                   | `gradefy-services-filtered-1672x941.png`, `gradefy-services-empty-1672x941.png` |

A fixture `tests/e2e/fixtures/team-services-presentation.js` é interceptada somente pelo Playwright. Ela não grava banco, não envia e-mail nem altera indicadores reais.

## Arquivos e validação

- Backend: `server/app.js`, novo `server/team-overview.js`.
- Frontend: `src/gradefy/business-management.tsx`, `src/gradefy/team.tsx`, novos `team-overview.tsx`, `team-desktop.css`, `services-desktop.tsx`, `services-desktop.css`.
- Testes: `tests/helpers/team.js`, novos `tests/e2e/gradefy-team-services-desktop.spec.js` e `tests/e2e/fixtures/team-services-presentation.js`; os E2E anteriores de gestão, convites e equipe foram ajustados para verificar seus fluxos no layout mobile preservado ou o novo cabeçalho desktop.

Build e TypeScript passaram. Os 28 testes SQLite direcionados de equipe e gestão empresarial passaram, incluindo leitura semanal, bloqueios, abertura manual, permissões e isolamento entre empresas. Os 15 E2E direcionados passaram, incluindo larguras de 1024, 1280, 1366, 1440, 1672 e 1920 px, zoom 125% e larguras mobile de 320, 360, 390, 428 e 768 px. A suíte E2E geral passou com 131/131 testes. A suíte backend/SQLite completa terminou com 335/339 aprovados. Prettier dos arquivos alterados e `git diff --check` passaram.

O backend/SQLite completo reproduz as quatro falhas preexistentes de templates de e-mail (`Destino de e-mail inválido.`); os módulos de e-mail não foram alterados. PostgreSQL local não foi executado porque Docker e `psql` não estão disponíveis. Nenhum ambiente de produção foi acessado. Não houve migration, alteração de dados ou mudança de regras de agendamento.
