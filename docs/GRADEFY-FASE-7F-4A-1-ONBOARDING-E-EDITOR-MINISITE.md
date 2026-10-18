# Gradefy — Fase 7F.4A.1: configuração inicial e editor do Mini Site

## Escopo e estado do trabalho

Implementado em `gradefyapp-recuperado`, branch `feat/gradefy-foundation`. As alterações não commitadas das Fases 7F.3C.2 e 7F.4A foram identificadas e preservadas, conforme a autorização anterior para continuar sem commit. Foram consultados os relatórios 7F.3C.1, 7F.3C.2 e 7F.4A.

Não houve commit, push, acesso a produção/Supabase, alteração de DNS, autenticação, aplicativo mobile, pagamentos ou motor de reservas.

## Onboarding

O catálogo destinado a novos clientes Gradefy apresenta somente `gradefy-minisite`, no nicho operacional `barbershop`. A etapa de escolha de template deixou de ser necessária: Plano → Segmento → Empresa → Configuração operacional → **Personalize seu Mini Site** → Revisão → publicação explícita no editor. A antiga URL `/app/onboarding/template` redireciona com segurança para o próximo passo apropriado.

O cadastro utiliza o template padrão revalidado no catálogo; ignora uma escolha antiga/adulterada de template no armazenamento local. Nichos ainda não suportados continuam “Em breve”. Não há cards, demonstrações ou seleção de Barber Classic/Igor no novo onboarding.

Registros históricos e integrações legadas que enviam explicitamente `barber-classic` continuam válidos no backend. O catálogo público do onboarding não permite selecionar esse template. A verificação interna de conclusão operacional reconhece os templates históricos para não impedir a retomada de cadastros anteriores. Nenhuma empresa existente é convertida automaticamente.

O início dos sete dias permanece na ação explícita **Concluir configuração e iniciar 7 dias grátis**, já existente na configuração operacional. Depois dessa conclusão privada, o proprietário segue diretamente à personalização. Salvar textos, imagens ou horários não inicia/reinicia trial e não publica o site.

## Editor

O Mini Site reutiliza o controlador de edição, uploads, versões, imagens privadas e publicação existentes. O Barber Classic mantém seu editor e limite histórico de 40 imagens.

Seções do novo editor:

1. **Visão geral:** identidade, estado Rascunho/Publicado e iframe da prévia autenticada real, sem reservas.
2. **Identidade:** nome, slogan, descrição opcional, logo, banner opcional e cores.
3. **Portfólio:** até cinco imagens, ordenação e exclusão, com validação também no backend.
4. **Contatos e localização:** WhatsApp, Instagram, endereço, cidade, UF e destino de localização. Dados preenchidos no onboarding/CEP são reaproveitados.
5. **Horário de funcionamento:** expediente comercial, dias fechados e até quatro intervalos por dia.
6. **Publicação:** checklist resumido, prévia, ação explícita de publicar e confirmação para retirar do ar.

Abas mantêm o mesmo formulário em memória. A interface distingue alterações não salvas, salvamento em andamento, erro e sucesso. Imagens são salvas ao enviar; os demais campos permanecem como rascunho até salvar. Falhas de upload não apagam os campos do formulário. O armazenamento indisponível desabilita apenas as ações que dependem dele.

Conflitos de versão mantêm o rascunho e oferecem continuar editando ou descartar explicitamente e carregar a versão atual. A troca de empresa fica desabilitada com alterações pendentes; respostas atrasadas de mutações também são ignoradas se o contexto empresarial mudou. Recarregar/fechar a página com alterações pendentes ativa a proteção nativa do navegador.

Prévia mostra os **dados já salvos** e mantém a autenticação e a proibição de reservas reais. Publicação permanece desabilitada enquanto houver alterações não salvas. A validação definitiva de plano, onboarding, catálogo, profissionais, grade e imagens continua no backend existente.

## Horários e integridade

A única fonte do expediente geral continua sendo `company_settings.working_days_json`, exposta como `working_days` em Configurações e no editor. Não foi criada uma cópia dos horários.

O `PUT /api/company-site` aceita opcionalmente `working_days`, usando exatamente o schema operacional existente. Nome, contatos, identidade e expediente são gravados na mesma transação. Mudanças de expediente reutilizam os locks de políticas e entitlements, a autorização da gestão e o controle de assinatura do módulo operacional.

Alterar o expediente incrementa `operational_version`; a gravação do editor incrementa `site_version`. Isso invalida tanto um editor de site antigo quanto uma tela de configurações operacionais desatualizada. Payloads legados que não incluem `working_days` preservam os horários existentes.

Não são alterados `barber_settings`, `barber_working_hours`, intervalos ou recorrência dos profissionais. O motor original continua cruzando expediente comercial com disponibilidade individual, pausas, bloqueios, duração dos serviços e políticas. Agendamentos existentes não são cancelados ou reescritos pelo editor.

O Mini Site mostra **Horário de funcionamento**, com dados comerciais explícitos. Na ausência de grade, permanece a orientação de consultar a agenda, sem inventar “Aberto agora”. Dias e intervalos são validados no backend. Limites de plano e edição de horários com assinatura expirada permanecem protegidos.

O snapshot privado reaproveita os dados estruturados do CEP para revisão. Alterações somente em identidade, WhatsApp ou horário preservam esse endereço. Editar endereço/cidade/UF livremente utiliza a invalidação de metadados antigos já existente, evitando dados de CEP incompatíveis.

## Tela de conclusão

**Seu negócio está pronto!** mostra cards compactos com plano real, template do estabelecimento, estado do trial e publicação consultados no backend. Datas não são fixadas no código e respeitam o fuso empresarial.

As ações são **Personalizar meu Mini Site** ou **Visualizar meu Mini Site**, quando já existem configurações visuais, e **Ir para meu painel**. Configuração e publicação continuam separadas.

## Banco e compatibilidade

**Nenhuma migration nova.** As colunas necessárias já existem nas migrations anteriores. A última migration permanece a 020. Migrations 001–020 não foram editadas nesta etapa.

Igor, seus IDs e URLs, o template Barber Classic e suas fotografias permanecem preservados. O registry público e a demonstração histórica do Barber Classic continuam disponíveis fora do novo fluxo comercial. Autorização, cookies, JWT, isolamento empresarial e regras de reserva não foram substituídos.

## Arquivos desta etapa

Criados:

- `src/gradefy/minisite-editor.tsx`
- `src/gradefy/minisite-editor.css`
- `src/gradefy/working-hours.tsx`
- `tests/e2e/gradefy-minisite-editor.spec.js`
- Este relatório.

Modificados:

- `server/onboarding-catalog.js`
- `server/company-onboarding.js`
- `server/operational-onboarding.js`
- `server/company-site.js`
- `src/gradefy/catalog.tsx`
- `src/gradefy/business-setup.tsx`
- `src/gradefy/plans.tsx`
- `src/gradefy/operations.tsx`
- `src/gradefy/site-editor.tsx`
- `src/main.tsx`
- `src/templates/gradefy-minisite/index.tsx` (título da seção de funcionamento)
- `tests/gradefy-catalog.test.js`
- `tests/helpers/minisite.js`
- `tests/helpers/site-browser.js`
- `tests/postgres/foundation.test.js`
- `tests/e2e/gradefy-address-invitations.spec.js`
- `tests/e2e/gradefy-business.spec.js`
- `tests/e2e/gradefy-catalog.spec.js`
- `tests/e2e/gradefy-operations.spec.js`
- `tests/e2e/gradefy-minisite.spec.js`

As demais alterações pendentes pertencem às fases anteriores e foram preservadas.

## Validação

Logs: `test-results/minisite-editor-*.log`. Capturas do editor em 320, 390, 768 e 1440 px: `test-results/minisite-editor-{largura}.png`.

| Verificação                                     | Resultado                                   |
| ----------------------------------------------- | ------------------------------------------- |
| Backend/SQLite completo                         | 306 aprovados                               |
| Backend direcionado Mini Site + catálogo        | 16 aprovados                                |
| E2E direcionado de Mini Site, editor e catálogo | 10 aprovados                                |
| Build + TypeScript web + check:schedule         | Aprovados                                   |
| PostgreSQL local 17.11                          | 248 aprovados; cluster encerrado e removido |
| E2E completo Chromium                           | 99 aprovados                                |
| Prettier e git diff --check                     | Aprovados                                   |

Testes adicionados/atualizados cobrem ausência de Classic no catálogo do novo onboarding, seleção automática do Mini Site, pular a etapa redundante, rascunhos legados/adulterados, preservar Classic/Igor, upload durante a personalização, até cinco fotos, reordenação/exclusão, contatos e CEP, horários gerais independentes dos profissionais, mesma transação de identidade/horário, conflitos e rollback, trial preservado, prévia, publicação/despublicação, erros de rede e armazenamento, navegação entre seções e tela concluída.

SQLite usa bancos em memória. PostgreSQL usa cluster novo, portátil/local **17.11**, em loopback, criado pelo runner de testes; nenhuma URL de Supabase ou banco existente é usada. E2E usa o servidor descartável com imagens privadas em armazenamento de teste e não envia mensagens reais.

Na primeira rodada completa de E2E, 97 casos passaram e dois apontaram incompatibilidades com o fluxo anterior: um teste ainda esperava `barber-classic` no cadastro e a confirmação do plano escolhido havia sido retirada da tela de segmento. A expectativa foi atualizada para Mini Site e a confirmação foi restaurada. A rodada final foi executada novamente após essas correções. A conclusão também passou a consultar o estado vigente do trial no backend e mostrar o nome comercial atualizado no editor.

Comandos executados: `npm test`; `node --test tests/minisite.test.js tests/gradefy-catalog.test.js`; `node tests/postgres/run-local.mjs --bin <PostgreSQL-17.11-local/bin>`; `npm run build`; Playwright direcionado aos três arquivos de Mini Site/editor/catálogo; `npm run test:e2e -- --reporter=list --global-timeout=900000`; `npm run format:check -- --end-of-line auto`; `git diff --check`. A rodada final completa terminou com exit code 0, 99 aprovados e nenhum teste pendente ou falho. O cluster PostgreSQL final terminou com `productionAccess=false`, `testExitCode=0`, `clusterStopped=true` e `clusterRemoved=true`.

Não foram executados testes do aplicativo mobile nesta etapa, pois ele está fora do escopo e não foi alterado. Não houve publicação/deploy real; publicação e reservas foram exercitadas nos servidores locais descartáveis.

## Teste manual

1. No projeto `gradefyapp-recuperado`, execute `npm run dev` com banco e armazenamento de desenvolvimento já configurados. Não use produção.
2. Abra `http://localhost:5173/app`, crie uma conta e escolha plano e Barbearia. Deve seguir direto ao cadastro da empresa, mostrando Gradefy Mini Site, sem seleção de Classic.
3. Preencha os dados empresariais/CEP e conclua os serviços, profissionais e agendas. Ao confirmar explicitamente o início do trial, será aberto `/app/onboarding/site?empresa=ID`.
4. Em **Personalize seu Mini Site**, revise identidade/contatos reaproveitados, envie logo/banner opcionais e até cinco fotos. Reordene/exclua fotos.
5. Configure **Horário de funcionamento** e confira que a rotina pessoal do profissional permanece intacta. Tente horários inválidos e observe o erro recuperável.
6. Edite campos e navegue entre seções: o rascunho deve permanecer. Salve. A prévia deve mostrar os dados salvos sem permitir reservas.
7. Use **Concluir e revisar** para abrir **Seu negócio está pronto!**. Confira datas e plano reais; o estado continua Rascunho.
8. Em `/app/meu-site`, abra **Publicação** e publique explicitamente. Confira `/{slug}`, reserva pública, histórico e cancelamento; retire o site do ar e confirme a preservação do histórico.
9. Abra duas abas, salve na primeira e tente sobrescrever pela segunda: deve informar conflito sem perder o formulário. Teste também rede/armazenamento indisponíveis e as quatro larguras solicitadas.
10. Confira `/`, `/agendar`, `/minha-conta` e empresas antigas com Barber Classic.

## Limitações

Personalização é parte do onboarding após a ativação privada operacional existente; esta fase não muda o momento autorizado de início do trial. As mudanças não criam uma etapa nova persistida no banco: rascunhos salvos são retomados pelo editor e pelo onboarding existentes. Campos ainda não salvos permanecem somente em memória, com proteção contra fechamento; não há persistência local de imagens ou de dados administrativos sensíveis.

O armazenamento privado deve estar configurado para uploads reais. Visão geral mostra a prévia salva, não uma publicação pública nem uma simulação de campos ainda não enviados. Outros nichos continuam indisponíveis até implementação operacional e testes próprios.
