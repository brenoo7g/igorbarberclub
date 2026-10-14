# Gradefy — Painel do Profissional (7F.3C)

## Experiência e entrada

`/app/minha-agenda?empresa=<id>` apresenta resumo de hoje, próximo atendimento, consulta diária/semanal, detalhes, expediente efetivo, pausas, indisponibilidades e serviços habilitados. Reutiliza o shell, tokens, logo, fontes, componentes, estilos e funções de calendário existentes. A navegação profissional contém apenas Minha Agenda, Meus Horários e Minha Conta; horários aparecem somente quando há vínculo ativo. Logout e gestão da conta continuam no fluxo existente.

Após login convencional, a seleção empresarial usa os memberships atuais: profissional entra na própria agenda; proprietário/gestor permanece no dashboard. Com várias empresas, o seletor inclui todos os vínculos autorizados e a rota muda conforme o papel da empresa escolhida. A chave do componente é a empresa selecionada, e requisições abortáveis evitam reaproveitar dados de outra empresa. Uma URL antiga sem autorização mostra seleção/orientação, sem dados de atendimentos.

Convites por código e pelo link antigo continuam usando os mesmos endpoints, segredo, aceite e autenticação. A confirmação oferece acesso à área correspondente: profissional segue para Minha Agenda; gestor, para o dashboard. Aceitar um convite cria somente o membership previsto e não cadastra um profissional, empresa, plano ou trial.

Sem vínculo, o painel informa: **“Seu acesso foi criado. O proprietário ainda precisa vincular sua conta ao cadastro profissional do estabelecimento.”** Não retorna atendimentos, profissionais alternativos, horários ou resumo. Permite verificar novamente, alternar empresas autorizadas, acessar a conta ou sair. Não oferece acesso administrativo como substituto.

## Vínculo explícito e auditoria

A relação existente `professional_users` foi reutilizada. Seu `PRIMARY KEY(company_id,barber_id)` e `UNIQUE(company_id,user_id)` preservam um cadastro por conta e uma conta por cadastro dentro da empresa. Não houve backfill por nome, telefone ou e-mail, nem associação automática de contas antigas.

Em `/app/equipe`, o proprietário vê a associação ou sua pendência. **Associar profissional / Alterar vínculo profissional** abre a seleção de um cadastro existente e uma confirmação explícita. O endpoint revalida a conta, membership, papel, profissional, empresa e estado ativo. Perfis vinculados a outra conta não podem ser apropriados. A operação não altera nomes, serviços, reservas, quotas ou papéis.

Alteração e remoção usam o vínculo anterior como expectativa otimista. Uma confirmação antiga retorna `PROFESSIONAL_LINK_CHANGED`; duas operações concorrentes não podem controlar o mesmo cadastro. Conta revogada ou com papel alterado conserva seu histórico, mas o proprietário pode **Remover vínculo profissional**, liberando o cadastro sem reativar a conta ou mudar seu papel.

O CRUD legado de profissionais continua compatível, inclusive o vínculo inicial do dono durante o onboarding suspenso. Novos vínculos nesse CRUD exigem proprietário autorizado; substituir/remover uma associação existente exige `confirmLink: true` e `expectedUserId`. Edições comuns de nome, especialidade, foto, serviços e status mantêm as permissões anteriores de proprietário/gestor. Associação inalterada não é regravada. `/app/profissionais` identifica cadastros com conta vinculada; a gestão do vínculo fica concentrada na equipe.

O lock transacional existente de equipe (`team/access`) serializa mudanças de papel, revogação e vínculos. Escritas de vínculo também utilizam os locks dos profissionais, em ordem consistente, impedindo disputa com desativação. Unicidade e foreign keys compostas são a última barreira no banco. Toda troca de vínculo registra ator, conta afetada, profissional anterior/novo e horário, na mesma transação.

## Autorização e dados protegidos

Toda requisição resolve a sessão, empresa e membership atuais. A identidade operacional vem exclusivamente da relação validada com o usuário autenticado. O painel não aceita `professionalId` como autoridade; filtros desconhecidos são rejeitados e consultas de detalhes incluem empresa **e** profissional na cláusula SQL. Dados completos da empresa não são retornados para filtragem no navegador.

O DTO profissional contém somente identificação do atendimento, data, início/fim, cliente, situação e nomes/durações históricos dos serviços. Não contém preços, total financeiro, pagamentos, receitas, despesas, relatórios, contatos de clientes ou lista empresarial de clientes. Notas de clientes e `appointments.notes` não são expostas, pois a arquitetura atual não distingue instrução operacional compartilhada de nota administrativa privada. Motivos textuais dos bloqueios também são omitidos.

O mesmo usuário pode ser profissional em A, gestor em B e proprietário em C. Cada requisição usa o papel do membership daquela empresa; um papel autorizado em B não concede acesso à administração de A. Nenhum papel global, formato JWT, cookie, segredo ou fluxo de login foi alterado.

Revogação bloqueia novas requisições com a sessão antiga. Desativar o cadastro retorna estado inativo, sem dados da agenda, e impede operações. Alterar o vínculo muda imediatamente quais atendimentos a API permite consultar; não depende de renovar JWT. Contas, cadastros e registros históricos são preservados. Assinatura/trial expirado permite somente leitura de dados próprios, conforme a política já existente. A compatibilidade legada da Igor, sem assinatura automaticamente atribuída, permanece.

## Conclusão e horários

A única nova ação operacional é concluir um atendimento próprio **confirmado e cujo horário final já passou**. Ela reutiliza o controlador de transição da agenda administrativa, o relógio do servidor, fuso empresarial, locks de atendimento/profissional e infraestrutura persistente de idempotência. O payload profissional não aceita status arbitrário. Expectativas de data, início, fim e situação rejeitam alterações concorrentes sem expor notas privadas.

`Idempotency-Key` mantém escopo empresarial/ator, usando a operação existente `managed-status` com marcador de payload próprio. Autorização e propriedade são verificadas antes de devolver um replay. Conclusão e auditoria são atômicas; uma falha faz rollback também da chave. Repetição de conclusão terminal é um no-op. O índice único de evento por empresa/atendimento impede dupla autoria. Não há geração de pagamento, recebimento ou envio de e-mail pela conclusão.

Cancelamento, reagendamento, ausência, alteração de serviços/preços, equipe, configurações, exportação e financeiro administrativo não foram concedidos. Os endpoints administrativos continuam protegidos por suas permissões anteriores.

Horários usam `readSchedule`, configurações operacionais e a interseção já existente com o funcionamento empresarial. Pausas são apenas agrupadas/clampadas para apresentação; o motor de disponibilidade não foi duplicado nem alterado. A edição de expediente continua com a gestão. A Fase 7F.3B conserva a proteção de troca de fuso após a primeira reserva. Calendário e conclusão usam datas/horas locais do estabelecimento; o teste de Manaus verifica a virada de dia e o atendimento próximo à meia-noite em ambos os adaptadores.

## Endpoints

Todos os endpoints profissionais exigem autenticação e `X-Gradefy-Company-Id` explícito. A resolução empresarial existente foi estendida ao prefixo `/professional`, preservando os aliases públicos da Igor.

| Método e rota                                        | Função                                                                                |
| ---------------------------------------------------- | ------------------------------------------------------------------------------------- |
| `GET /api/professional/agenda`                       | Agenda própria, resumo de hoje, próximo atendimento, horários e bloqueios do período. |
| `GET /api/professional/agenda/:id`                   | Detalhe minimizado de um atendimento próprio e expectativa de estado.                 |
| `GET /api/professional/hours`                        | Expedientes individuais/efetivos e serviços habilitados, sem valores.                 |
| `PATCH /api/professional/agenda/:id/complete`        | Conclusão própria com transição existente e auditoria atômica.                        |
| `PATCH /api/admin/team/members/:userId/professional` | Associação, alteração ou remoção pelo proprietário, com confirmação.                  |

Listagem aceita `from`, `view=day|week`, `status` e `page`. Cada consulta cobre no máximo sete dias e trinta atendimentos por página. Detalhes de outra empresa/profissional retornam 404. Sem vínculo/inativo, a listagem devolve orientação sem atendimentos; detalhes/mutações ficam bloqueados.

Exemplo de vínculo:

```json
{
  "professionalId": "cadastro-existente",
  "expectedProfessionalId": null,
  "confirm": true
}
```

Para remover, `professionalId` é null e `expectedProfessionalId` é o cadastro atual. A expectativa de conclusão é devolvida pelo GET de detalhe; o PATCH recebe somente `expected` e, opcionalmente, o header de idempotência.

## Migration e arquivos

**017-gradefy-professional-panel.sql** adiciona somente `professional_activity_events` e índices de histórico/conclusão. Não recria tabelas existentes, não migra reservas, não cria profissionais e não modifica `professional_users`. Identificadores obrigatórios usam `NOT NULL` explícito; foreign keys compostas garantem que atores, contas, cadastros e atendimentos referenciados pertencem à empresa do evento. SQLite e PostgreSQL executam o mesmo SQL. Migrations 001–016 permanecem intactas.

Arquivos novos:

- `server/migrations/017-gradefy-professional-panel.sql`
- `server/professional-links.js`
- `server/professional-panel.js`
- `src/gradefy/agenda-display.ts`
- `src/gradefy/professional-agenda.tsx`
- `src/gradefy/professional-agenda.css`
- `tests/professional-panel.test.js`
- `tests/helpers/professional-panel.js`
- `tests/helpers/professional-panel-migration.js`
- `tests/helpers/professional-browser.js`
- `tests/e2e/gradefy-professional-panel.spec.js`
- `docs/GRADEFY-PROFESSIONAL-PANEL-7F3C.md`

Integrações modificadas nesta fase:

- `server/agenda.js`, `server/app.js`, `server/migrations.js`, `server/professionals.js`, `server/team.js`
- `src/main.tsx`, `src/gradefy/Shell.tsx`, `agenda.tsx`, `management.tsx`, `pages.tsx`, `team.tsx`, `business-management.tsx`
- `tests/browser-server.js`, `tests/postgres/foundation.test.js`, `tests/e2e/gradefy-agenda.spec.js`, `tests/e2e/gradefy-team-code.spec.js`
- `tests/company-integrity.test.js`, `company-migration.test.js`, `data-ownership.test.js`
- `tests/helpers/access-migration.js`, `agenda.js`, `barber-classic.js`, `business-management.js`, `company-onboarding.js`, `data-ownership.js`, `finance.js`, `operational-onboarding.js`, `professional-idempotency.js`, `professionals-migration.js`, `scheduling-reliability.js`, `site-editor.js`, `operational-settings-migration.js`, `operational-settings.js`, `team.js`

Os ajustes nos testes anteriores atualizam as versões esperadas e a reconstrução de bancos antigos para a 017. Helpers de DROP/reconstrução são exclusivos de bancos descartáveis de teste. Fixtures novas usam empresas próprias, sem alterar contagens ou vínculos das fixtures anteriores. Trabalho local das fases anteriores foi preservado, sem commit ou push.

## Validação e demonstração

Os testes dirigidos cobrem propriedade no servidor, IDOR, privacidade de DTO, estados pendente/inativo, owner/manager/professional, papéis por empresa, vínculo explícito, confirmação antiga, concorrência, remoção após revogação, escape via CRUD legado, expediente, snapshots, conclusão válida/inválida, perda de resposta, rollback, quota, trial ativo/expirado, assinaturas, histórico financeiro e meia-noite. A migration é aplicada novamente, submetida a falha intermediária e conferida quanto a checksum/preservação do legado.

O Chromium cobre seis fluxos reais: agenda e quatro larguras, conclusão com perda de resposta, associação/remoção, troca de papel por empresa/logout, convite pelo link antigo e desativação/revogação/remoção de vínculo. A suíte anterior verifica convite por código, login/cadastro, administrador, Igor, Barber Classic, financeiro, relatórios, editor, agendamentos e configurações.

| Verificação                          | Resultado                          |
| ------------------------------------ | ---------------------------------- |
| Backend/SQLite dirigido desta fase   | 15 passaram                        |
| Backend/SQLite completo              | 254 passaram                       |
| PostgreSQL 17.11 local completo      | 199 passaram                       |
| E2E dirigido profissional            | 6 passaram                         |
| E2E completo Chromium                | 74 passaram                        |
| Build, TypeScript e `check:schedule` | Passaram                           |
| Prettier e `git diff --check`        | Passaram                           |
| Visual 320/390/768/1440 px           | Conferido; sem overflow horizontal |

A regressão inicial encontrou o vínculo do dono no onboarding suspenso, preservado com validação específica do criador da configuração. As expectativas PostgreSQL foram atualizadas para a tabela nova e a representação textual de COUNT. O teste antigo de login profissional passou a aguardar Minha Agenda, em vez do dashboard intermediário. Essas correções não alteram autenticação ou trial.

```powershell
$env:DOTENV_CONFIG_PATH='NUL'
$env:DATABASE_URL=''
$env:POSTGRES_URL=''
node --test tests/professional-panel.test.js
npm.cmd test
node tests/postgres/run-local.mjs --bin 'C:\Users\Breno\AppData\Local\Gradefy\postgresql-17.11\pgsql\bin'
npm.cmd run build
npx.cmd playwright test
npm.cmd run format:check
git diff --check
```

PostgreSQL foi um cluster portátil temporário em loopback, encerrado/removido pelo runner. SQLite e navegador usam banco em memória. Não foi carregado `.env` nem acessado Supabase, produção, Cloudflare ou DNS. Logs/capturas ficam em `test-results/professional-panel-*.log` e `professional-agenda-*.png`, ignorados pelo Git. `test-results/postgres-validation/report.json` registra versão, resultado e remoção do cluster.

Após o build, mantenha as variáveis acima e inicie a demonstração descartável:

```powershell
$env:RESEND_API_KEY=''
$env:EMAIL_FROM=''
node tests/browser-server.js
```

- Painel: `http://127.0.0.1:4173/app/minha-agenda?empresa=staff-browser-a`.
- Profissional: `staff-browser-second@example.com` / `ClienteDemo2026!`.
- Proprietário: `staff-browser-owner@example.com`, mesma senha; vínculo em `/app/equipe?empresa=staff-browser-a`.
- Sem vínculo: `staff-browser-pending@example.com`, mesma senha.
- Papéis múltiplos: `staff-browser-primary@example.com`, mesma senha.

São contas fictícias exclusivas do servidor de teste, sem e-mail real. Parar o servidor perde os dados da demonstração. Alterações de horário continuam administrativas; notas operacionais compartilhadas e outras ações exigirão definição específica futura. Não foram iniciados comissões, folha, ponto, chat, aplicativo nativo, Super Admin ou Fase 7G.
