# Gradefy — Fase 7F.4B: telas internas e jornada dos colaboradores

## Escopo e preservação

Trabalho realizado em `gradefyapp-recuperado`, branch `feat/gradefy-foundation`, sobre as alterações pendentes das fases 7F.3C.2, 7F.4A, 7F.4A.1, 7F.4A.2 e da correção do monitor de desenvolvimento. A situação foi apresentada antes da edição; o novo pedido de implementação foi atendido preservando todas essas alterações, sem commit ou push. A cópia antiga do projeto no diretório pai não foi modificada.

Os relatórios anteriores e as quatro imagens oficiais foram analisados. Os sete anexos iniciais tinham conteúdo idêntico, assim como o prompt reenviado. A composição reutiliza o logotipo oficial, Sora/Inter locais, fundo marinho, grade discreta, bordas roxas, detalhes ciano, cartões arredondados e hierarquia de ações. Nomes, e-mails, estabelecimentos, validade, horários e papéis vêm dos dados da aplicação. Os dados fictícios aparecem apenas nos testes descartáveis.

Esta fase não modifica backend, rotas da API, migrations, banco existente, autenticação, JWT, cookies, onboarding empresarial, limites dos planos, pagamentos, landing comercial ou aplicativo mobile. Nenhuma conexão com Supabase/produção foi realizada.

## Telas e componentes

- **Minha Conta:** saudação e e-mail, estado compacto e um cartão por estabelecimento com seu papel real. Proprietário/gestor abre o painel; profissional abre Minha Agenda. Todas as ações empresariais incluem `?empresa=ID`. Profissionais não recebem atalhos administrativos. O botão Meu Mini Site leva ao editor autorizado da empresa, que já controla prévia e publicação; a conta não presume publicação nem cria links públicos para rascunhos. Estados sem vínculo, configuração pendente, vínculo revogado, sessão expirada e erro recuperável continuam usando as leituras e gates existentes.
- **Convite pronto:** modal com marca, estabelecimento, função, estado, destinatário, validade e campos somente leitura. Cópia por ícone e por botão mantém os valores completos. Código e link não são persistidos por esta interface; continuam aparecendo somente na criação/renovação autorizada. Orientação de e-mail foi condensada. Mensagens de cópia usam `role="status"`.
- **Aceitar convite:** cards de função, validade e e-mail mascarado fornecido pelo backend. Conta incompatível recebe alerta curto e Trocar conta; conta correta recebe Aceitar convite. Login/cadastro conservam o fragmento do convite. O aceite continua obedecendo `nextPath` para profissionais, e mantém o acesso empresarial do gestor.
- **Agenda profissional:** quatro etapas — Dias, Horários, Intervalos e Revisão. Sete dias com controles nativos, limites reais da empresa, horários por dia, até quatro pausas pessoais, dias expansíveis, resumo semanal e recorrência explícita. Pausas empresariais continuam distintas das pessoais. Atualizar configuração fica em Mais opções; bloqueios pessoais existentes permanecem disponíveis. Revisão prioriza Salvar minha agenda. Após salvar, a mensagem informa a pendência de ativação quando o backend retorna estado de espera; não afirma que um profissional inativo já recebe reservas.

`JourneyFrame`, `DetailTile` e `StatusBadge` compartilham composição e estilos. `Button`, `ButtonLink`, `Input`, `Feedback`, `Loading`, `GradefyLogo`, `ManagementAccess` e `CompanySelector` existentes foram reutilizados. O `Modal` nativo recebeu apenas propriedades visuais opcionais (`className` e `brand`); os demais consumidores preservam seu comportamento.

Os estilos novos ficam sob classes específicas da jornada, do modal ou do assistente. O tema especial do Shell é aplicado apenas às três rotas envolvidas. Mini Site, Barber Classic e as outras páginas empresariais não recebem esse redesign.

## Correções e integridade

1. Os atalhos de gestão da conta agora mantêm a empresa exata, inclusive com múltiplos vínculos e papéis diferentes.
2. O modal de compartilhamento não devolvia o foco ao criar um convite: a atualização da equipe substitui o elemento que iniciou a ação. Ao fechar, o foco aguarda o formulário atualizado, inclusive com resposta lenta, e retorna ao botão de criação; se a leitura falhar, usa a ação de atualização da equipe. Escape, fechamento nativo e bloqueio de foco do diálogo permanecem ativos.
3. A mensagem antiga da conta afirmava que o site ainda não estava publicado sem consultar seu estado. Essa afirmação foi removida; a publicação continua sendo verificada pelo editor existente.
4. O assistente preserva o rascunho entre etapas. Alterações não salvas acionam aviso ao fechar/recarregar; trocar de empresa ou sair da conta pelo assistente pede descarte explícito. O rascunho não é gravado no armazenamento local nem enviado automaticamente.
5. A mensagem sobre concluir a ativação só aparece quando faltam ativação ou serviços, conforme os campos reais da API. Um profissional ativo com serviços, mas aguardando liberação manual, não recebe esse aviso incorreto. Um cenário de leitura simulado no E2E cobre essa distinção visual sem mudar o banco; o modo manual e suas permissões são testados com o backend real.

As validações anteriores de dias ativos, expediente, intervalos e sobreposição foram preservadas. Salvar usa o mesmo endpoint, versões empresariais/pessoais e chave de idempotência, incluindo repetição após perda de resposta. Proteção de reservas confirmadas, locks, isolamento, ativação e recorrência continuam no backend original; nenhuma regra de autorização foi transferida para o frontend.

## Mobile e acessibilidade

Validação nas larguras **320, 360, 390, 428, 768, 1024 e 1440 px**. As informações da conta e do convite ficam em uma coluna nos celulares. O assistente adapta os dias em duas colunas no desktop e mantém campos sem transbordamento. Intervalos usam `details`/`summary` nativos e podem ser recolhidos. O diálogo tem altura limitada à viewport e rolagem interna, com acesso às ações finais.

Os controles usam labels, foco visível, checkbox nativo, campos de horário nativos, identificação da etapa atual, feedback acessível e botões de cópia/remoção nomeados. A troca de etapa leva o foco ao título. A preferência de movimento reduzido desativa animações/transições no escopo novo. Não foram adicionadas bibliotecas, animações contínuas ou imagens decorativas pesadas.

## Arquivos desta fase

Criados:

- `src/gradefy/journey.tsx`
- `src/gradefy/journey.css`
- `tests/e2e/gradefy-internal-journey.spec.js`
- `docs/GRADEFY-FASE-7F-4B-REDESIGN-TELAS-INTERNAS.md`

Modificados, preservando o trabalho anterior:

- `src/components/UI.tsx`
- `src/gradefy/Shell.tsx`
- `src/gradefy/pages.tsx`
- `src/gradefy/team.tsx`
- `src/gradefy/professional-setup.tsx`
- `src/gradefy/professional-setup.css`
- `src/gradefy/professional-agenda.tsx`
- `tests/e2e/gradefy-professional-setup.spec.js`
- `tests/e2e/gradefy-team.spec.js`
- `tests/e2e/gradefy-team-code.spec.js`
- `tests/e2e/gradefy-address-invitations.spec.js`

Os arquivos do assistente e seu E2E já estavam presentes e não versionados na fase anterior. Os ajustes dos testes existentes acompanham títulos e microtextos novos; não removem as verificações de permissões, estado e persistência.

## Validação executada

| Verificação                                                                            | Resultado     |
| -------------------------------------------------------------------------------------- | ------------- |
| Backend/SQLite, `node --test --test-concurrency=2 tests/*.test.js`                     | 313 aprovados |
| PostgreSQL portátil local 17.11, `node tests/postgres/run-local.mjs --bin <bin-local>` | 248 aprovados |
| E2E direcionado: jornada interna, equipe, código, assistente e CEP/convites            | 22 aprovados  |
| Build final, `npm run build` (TypeScript, `check:schedule` e Vite)                     | Aprovado      |
| E2E completo, após os ajustes visuais finais                                           | 112 aprovados |
| Revalidação da jornada, assistente e Barber Classic após refinamento da mensagem       | 14 aprovados  |
| Revalidação de foco com resposta lenta, jornada e convites                             | 12 aprovados  |
| Prettier completo e `git diff --check`                                                 | Aprovados     |

Comandos de validação usaram `DOTENV_CONFIG_PATH=NUL`, `DATABASE_URL=''` e `POSTGRES_URL=''`. O navegador iniciou `tests/browser-server.js`, com SQLite em memória e armazenamento de teste na porta 4173. O PostgreSQL usou um cluster novo em `127.0.0.1:65253`, sem reutilizar banco/serviço existente. O relatório registra `testExitCode=0`, `clusterStopped=true`, `clusterRemoved=true` e `productionAccess=false`.

A primeira rodada do novo arquivo E2E terminou com 2 aprovados e 3 falhas: retorno de foco no modal, ausência de `confirm: true` no teste de revogação e um seletor de status ambíguo durante loading. O foco foi corrigido na interface; os dois testes foram corrigidos para usar o contrato real e selecionar o feedback específico. A rodada dirigida seguinte passou com 22/22. Logs iniciais e finais são mantidos separadamente.

Logs locais: `test-results/internal-backend.log`, `internal-postgres.log`, `internal-e2e-directed.log`, `internal-e2e-focused.log`, `internal-e2e-full.log`, `internal-e2e-final.log`, `internal-e2e-invitation-final.log`, `internal-build-final.log` e `internal-format.log`. O relatório do cluster está em `test-results/postgres-validation/report.json`.

Cobertura combinada dos testes novos e existentes:

| Área                | Cenários                                                                                                                                                                                             |
| ------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Conta e contexto    | Proprietário, gestor, profissional, múltiplas empresas/papéis, conta vazia, configuração pendente, revogação e retry sem logout indevido                                                             |
| Convites            | Funções, identidade correta/incorreta, troca de conta, cadastro/login com fragmento, cópia integral, renovação, cancelamento, expiração, uso anterior e aceite concorrente                           |
| Agenda              | Redirecionamento, sete dias, horários individuais, pausas múltiplas, sobreposição, limites da empresa, recorrência, edição, perda de resposta, versões, bloqueios e proteção de reservas confirmadas |
| Segurança/regressão | Papéis revalidados no backend, acesso de outra empresa recusado, sessão canônica, Igor/Classic e Mini Site preservados                                                                               |
| Interface           | Sete larguras, formulário e diálogo por teclado, retorno de foco, cópia com feedback e capturas mobile/desktop                                                                                       |

## Capturas

Arquivos em `test-results/`, não versionados. Todos os dados são fictícios. Link e código do modal são mascarados nas capturas; os valores reais de produção não são lidos, usados ou registrados.

| Tela                    | Mobile 390 px                                                | Desktop 1440 px                                               |
| ----------------------- | ------------------------------------------------------------ | ------------------------------------------------------------- |
| Minha Conta             | [Captura](../test-results/internal-account-390.png)          | [Captura](../test-results/internal-account-1440.png)          |
| Conta com vários papéis | [Captura](../test-results/internal-account-multiple-390.png) | [Captura](../test-results/internal-account-multiple-1440.png) |
| Convite pronto          | [Captura](../test-results/internal-invite-ready-390.png)     | [Captura](../test-results/internal-invite-ready-1440.png)     |
| Aceitar convite         | [Captura](../test-results/internal-invite-accept-390.png)    | [Captura](../test-results/internal-invite-accept-1440.png)    |
| Conta incompatível      | [Captura](../test-results/internal-invite-mismatch-390.png)  | [Captura](../test-results/internal-invite-mismatch-1440.png)  |
| Agenda — Dias           | [Captura](../test-results/internal-schedule-days-390.png)    | [Captura](../test-results/internal-schedule-days-1440.png)    |
| Agenda — Horários       | [Captura](../test-results/internal-schedule-hours-390.png)   | [Captura](../test-results/internal-schedule-hours-1440.png)   |
| Agenda — Intervalos     | [Captura](../test-results/internal-schedule-breaks-390.png)  | [Captura](../test-results/internal-schedule-breaks-1440.png)  |
| Agenda — Revisão        | [Captura](../test-results/internal-schedule-review-390.png)  | [Captura](../test-results/internal-schedule-review-1440.png)  |

## Validação manual

No diretório `gradefyapp-recuperado`, iniciar `npm run dev` usando somente banco local/de desenvolvimento. Usar contas e IDs reais desse ambiente; os fixtures do E2E não são criados nesse banco.

1. Abrir **http://localhost:5173/app/conta**. Conferir cada empresa, seu papel e destino do botão principal. Meu Mini Site deve abrir o editor da empresa correta, sem presumir que um rascunho está publicado.
2. Como proprietário, abrir **http://localhost:5173/app/equipe?empresa=ID**, criar um convite e conferir modal, cópia, Escape, retorno do foco, renovação e cancelamento.
3. Abrir o link gerado em outra sessão/navegador. Conferir **`/app/convite#token=...`**, conta incompatível, troca de conta, cadastro e aceite. Não colar um token real em relatórios ou capturas.
4. Como profissional, abrir **http://localhost:5173/app/minha-agenda/configurar?empresa=ID**. Testar dias, horários diferentes, pausas sobrepostas, revisão, alternância explícita de recorrência, edição e salvamento. Confirmar que a rotina nova não ativa o profissional nem associa serviços.
5. Conferir as URLs públicas da Igor (`/`, `/agendar`, `/minha-conta`) e o slug de uma empresa Mini Site publicada.

Para visualizar apenas dados fictícios, `node tests/browser-server.js` pode ser iniciado com `.env` desabilitado e URLs de banco esvaziadas, conforme os comandos dos testes. Ele serve o build na porta **4173**, usa banco em memória e não inicia transporte de e-mails. Não executar junto com Playwright na mesma porta. Os fixtures têm endereços `@example.com` e senha de teste `ClienteDemo2026!`, exclusivamente nesse servidor descartável.

## Limites e pendências

- Homologação física de teclado virtual, zoom, leitor de tela e seleção de horário no Android/iOS continua recomendada. A execução automatizada usa Chromium, sem afirmar equivalência completa a aparelhos reais ou uma auditoria WCAG integral.
- Alterações são preservadas entre etapas, mas ainda não há rascunho persistido antes de Salvar. Ao confirmar descarte ou recarregar deliberadamente, a rotina persistida é recarregada.
- A conta oferece o editor autorizado para a gestão; não adiciona um novo endpoint para consultar publicação nem permissões de edição aos profissionais.
- Não foram implementados recursos de fases futuras, novo dashboard ou novos fluxos de autenticação/agenda.
