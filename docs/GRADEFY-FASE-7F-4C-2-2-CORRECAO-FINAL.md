# Gradefy 7F.4C.2.2 — correção final de Agenda e Clientes desktop

## Resultado

- A Agenda mantém quatro KPIs e mostra **Não compareceu** em linha própria. Cancelamentos e ausências não são somados. A API já calcula `statusCounts` para o período e os filtros antes de aplicar paginação; os cards agora mostram também o escopo da contagem.
- A lista lateral chama-se **Próximos confirmados** e informa que consulta a página atual do período selecionado. Nunca inclui cancelados. A equipe é apresentada como **Equipe do período**: são profissionais ativos cadastrados, sem inferir disponibilidade a partir do cadastro. Cada profissional mantém acesso à agenda individual.
- A escala, os nomes, os status e os cards laterais da Agenda ganharam legibilidade. O modal de bloqueio mantém o fluxo original de prévia, confirmação e notificações; o espaçamento entre revisão e notificações foi corrigido.
- A tabela de Clientes recebeu mais espaço, contraste e tipografia. O botão de três pontos abre um menu acessível com detalhes/histórico e edição autorizada. Há atalhos no painel lateral para o cliente selecionado. A busca do cabeçalho usa o CSS compartilhado mesmo quando Clientes é aberto diretamente.

## Investigação de Ana Martins

As duas linhas da captura anterior vinham da fixture `tests/helpers/business-browser.js`: dois agendamentos distintos, com IDs distintos, tinham o mesmo nome, telefone e e-mail de convidado. A importação gerava dois cadastros empresariais com IDs diferentes. A API não repetia o mesmo ID e o React renderizava cada item apenas uma vez. A fixture passou a usar Ana e Bruna Martins com contatos distintos. Nenhum registro real foi apagado ou unido; clientes homônimos continuam permitidos.

## Comparação visual e limites

As capturas foram geradas em 1672 × 941 e comparadas com `desktop-agenda.png`, `desktop-clientes.png` e o dashboard aprovado em `docs/design-references/gradefy-7F4C2-referencias-desktop/docs/design-references/`.

| Tela                           | Captura em `test-results/`                        |
| ------------------------------ | ------------------------------------------------- |
| Agenda, dados reais de teste   | `gradefy-agenda-real-1672x941.png`                |
| Agenda, fixture isolada        | `gradefy-agenda-controlled-fixture-1672x941.png`  |
| Bloqueio aberto                | `gradefy-agenda-block-modal-1672x941.png`         |
| Prévia com reserva afetada     | `gradefy-agenda-block-preview-1672x941.png`       |
| Clientes, dados reais de teste | `gradefy-clients-real-1672x941.png`               |
| Clientes, fixture isolada      | `gradefy-clients-controlled-fixture-1672x941.png` |
| Detalhes e histórico           | `gradefy-clients-detail-1672x941.png`             |
| Menu de ações                  | `gradefy-clients-menu-1672x941.png`               |

As referências mostram conteúdo mais denso e alguns indicadores ilustrativos. A implementação apresenta somente registros e métricas reais; os dados de captura controlada são interceptados pelo Playwright e nunca gravados no banco. A saudação “Olá, Gestão!” nas capturas vem do nome **Gestão de Cadastros** da fixture de autenticação. No produto, o cabeçalho usa o primeiro nome do usuário autenticado e fallback neutro quando ausente.

## Validação

O E2E visual cobre filtro de ausência, KPIs, busca, menu por teclado, edição, histórico, isolamento empresarial, resoluções desktop/mobile e zoom de 125%. Os testes existentes cobrem linha do tempo, simultaneidade, bloqueio com cancelamento e notificações, permissões e fluxos legados.

| Verificação                                           | Resultado                                                                                                                                              |
| ----------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Build, incluindo TypeScript                           | Aprovado                                                                                                                                               |
| TypeScript isolado                                    | Aprovado                                                                                                                                               |
| E2E direcionado                                       | 8/8 iniciais e 5/5 visuais após adicionar as capturas do modal; os ajustes finais foram validados na suíte geral                                       |
| E2E geral                                             | 128/128 aprovados                                                                                                                                      |
| Agenda, Clientes e bloqueios SQLite                   | 32/32 aprovados                                                                                                                                        |
| Backend/SQLite completo                               | 334/338 aprovados; quatro falhas preexistentes de templates de e-mail com `Destino de e-mail inválido.` em `barber-classic`, `guest` e `notifications` |
| Prettier dos arquivos desta fase e `git diff --check` | Aprovados                                                                                                                                              |
| PostgreSQL local                                      | Não executado: Docker, Podman, `psql`, `pg_ctl` e servidor local não estavam disponíveis; produção não foi acessada                                    |

Nenhum motor novo de disponibilidade, migration ou mudança de regra de negócio foi introduzido. As alterações não commitadas das fases anteriores foram preservadas.
