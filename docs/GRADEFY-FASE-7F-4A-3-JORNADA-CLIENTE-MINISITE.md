# Gradefy — Fase 7F.4A.3: login de cliente e rotas do Mini Site

## Alteração obrigatória da regra de produto

**Novas reservas no Gradefy Mini Site exigem autenticação explícita de cliente antes da seleção do serviço.** Esta regra substitui o agendamento anônimo descrito nas fases 7F.4A–7F.4A.2 somente para empresas com template `gradefy-minisite`.

Fluxo: Mini Site público → Agendar horário → Entrar ou criar conta → serviço → profissional/data/horário → revisão/confirmar → Minhas reservas. Se já existe uma sessão de cliente válida, a etapa de login não precisa ser repetida.

Início, catálogo e expediente comercial continuam públicos. A sessão de `/app` não satisfaz o login de cliente. O backend também recusa a criação de reservas anônimas, inclusive por POST direto ao endpoint antigo de visitantes.

O usuário deu prioridade a esta correção sobre a Fase 7F.4B. Todas as alterações pendentes anteriores foram preservadas; não foi retomado o redesign administrativo nem feita organização destrutiva de Git. Implementação no diretório `gradefyapp-recuperado`, branch `feat/gradefy-foundation`. Sem commit, push, Supabase, produção ou alterações de DNS.

## Separação segura das sessões

Foi identificada a causa anterior: o leitor público utilizava `req.user` vindo do cookie `session`, o mesmo do painel, e as rotas públicas compartilhavam páginas do Barber Classic.

A implementação reutiliza a tabela `users`, a senha existente, bcrypt, segredo de assinatura, `session_version`, validação de cadastro, rotas de perfil e recuperação com fila/limites existentes. **Não há outro cadastro de identidade ou tabela de senhas.**

| Uso                 | Cookie                                                                           | Audience JWT             |
| ------------------- | -------------------------------------------------------------------------------- | ------------------------ |
| Painel/fluxo legado | `session`, preservado                                                            | `barber-web`, preservado |
| Cliente Mini Site   | `gradefy-client` em desenvolvimento; `__Host-gradefy-client` com cookies seguros | `gradefy-client`         |

O cookie de cliente é HttpOnly, SameSite=Lax, com caminho `/`, duração de sete dias e Secure quando o ambiente já exige cookies seguros. Não altera o cookie, segredo ou formato dos tokens administrativos existentes. A nova finalidade usa uma audience distinta, assinatura HS256, issuer existente e versão da conta verificada novamente no banco.

No dispatcher público do Mini Site, a sessão administrativa é descartada **apenas do contexto da requisição pública**, sem apagar seu cookie. A identidade de cliente é então resolvida separadamente. Cookies trocados de nome não passam pela validação de audience. A resposta pública apresenta papel `client`, mesmo quando a mesma conta também possui um vínculo empresarial.

Rotas de `/app`, `/api/companies`, `/api/admin/*`, `/api/company-site` e demais áreas empresariais continuam usando somente a autenticação administrativa original. O prefixo público não expõe `/admin/*` ou `/professional/*`. Um cliente autenticado, por si só, não recebe acesso empresarial ou membership.

Login, cadastro e logout de cliente não emitem nem apagam `session`. Os canais de atualização do navegador também são separados (`gradefy-client-account` e o canal existente do painel). Se os dois cookies existem, cada interface resolve sua própria identidade.

**Exceção de segurança preservada:** alterar senha ou e-mail continua revogando versões antigas das sessões daquela mesma identidade, conforme a regra já existente. Isso é diferente de simplesmente entrar/sair como cliente. Uma recuperação de outra pessoa pelo Mini Site não apaga o cookie do proprietário; esse cenário foi testado.

## Rotas e apresentação

| Rota sob `/{slug}`                 | Acesso e comportamento                                                                                                     |
| ---------------------------------- | -------------------------------------------------------------------------------------------------------------------------- |
| `/`                                | Página pública existente, com links de navegação corrigidos                                                                |
| `/servicos`                        | Catálogo público real, preços e duração; CTA passa pelo login quando necessário                                            |
| `/horarios`                        | Grade comercial pública de `site.hours`, com intervalos e dias fechados; não usa a agenda individual como expediente geral |
| `/entrar`                          | Login exclusivo de cliente com identidade do estabelecimento                                                               |
| `/cadastro`                        | Nome e sobrenome, e-mail, telefone, senha e confirmação                                                                    |
| `/esqueci-senha`                   | Recuperação com contexto do estabelecimento                                                                                |
| `/redefinir-senha`                 | Nova senha, token no fragmento da URL e retorno seguro ao login de cliente                                                 |
| `/agendar`                         | Gate de cliente antes de montar o componente de agendamento ou carregar a seleção                                          |
| `/minha-conta`, `/minhas-reservas` | Minhas reservas, com cliente obrigatório, histórico, detalhes, remarcação e cancelamento                                   |
| `/minha-conta/perfil`              | Dados da própria conta, usando as validações e o controle de versão existentes                                             |
| Caminho desconhecido               | Mensagem e retorno próprios do Mini Site                                                                                   |

Todas as páginas novas usam fundo marinho, gradiente discreto, cores do estabelecimento, logo/identidade reais, fontes locais Mini Sora/Inter, cards centrais e controles de toque. Logo ausente tem iniciais; não há conteúdo substituto da Igor. O modal reutiliza a infraestrutura acessível existente com tema do Mini Site, sem recriar autenticação ou o motor de reservas.

A navbar apresenta **Minhas reservas, Serviços e Horários**, com destinos próprios, tanto no início quanto nas páginas internas. O menu móvel usa os mesmos destinos. O catálogo rápido existente continua disponível com o tema do Mini Site. Agendamentos pausados não ganham CTA de reserva no novo catálogo ou página de horários.

A suíte completa identificou uma colisão de especificidade entre `/{slug}/servicos` e o antigo wildcard `/admin/*`. O namespace administrativo legado passou a declarar também sua página e a configuração da agenda, antes das rotas empresariais públicas. Isso preserva `/admin/servicos` e as demais URLs válidas sem mudar sua interface ou autenticação. O teste do modal foi ajustado para distinguir o botão textual “Fechar” do botão de ícone com o mesmo nome acessível.

O Barber Classic continua utilizando Account, Profile, PasswordRecovery, URLs e sessão originais. Igor mantém `/`, `/agendar`, `/minha-conta` e administração legada. Seu agendamento de visitante não foi desativado.

## Contexto, recuperação e retornos

`customer-navigation.ts` aceita somente dois destinos: agendar ou reservas. Os identificadores opcionais de serviço, profissional, semana e remarcação são limitados a caracteres e comprimento definidos. Nenhuma URL arbitrária, `next`, `returnTo` ou domínio informado pelo navegador vira destino de navegação. O prefixo do estabelecimento vem do contexto resolvido do site.

Login, cadastro e links de recuperação entre as páginas preservam o slug e o destino. E-mails de recuperação usam a fila existente: o identificador do trabalho registra um namespace interno com o ID da empresa e um dos destinos permitidos. O token continua sendo HMAC/hasheado e de uso único, com expiração de 30 minutos, limites persistentes de IP/e-mail e resposta que não revela a existência de uma conta.

O processador resolve nome e slug no banco para montar a marca e o link. O e-mail do Mini Site não usa o nome da Igor. O token fica no fragmento `#token=...`; não há URL de retorno aberta. Um token emitido nesse contexto é recusado no endpoint global ou no contexto de outra empresa.

Reutilizar o ID textual da fila evita uma migration apenas para apresentação e destino. O formato anterior dos trabalhos Gradefy/legados permanece aceito. A confirmação de alteração de senha conserva o mesmo namespace empresarial.

## Reservas e dados anteriores

- Novas reservas do Mini Site usam `/api/public/{slug}/appointments` e `user_id` do cliente verificado, sem payload `guest`.
- `/appointments/guest` é recusado no Mini Site, inclusive quando alguém tenta reutilizar o acesso antigo ou o cookie do painel.
- Histórico, remarcação e cancelamento exigem cliente e continuam filtrando por empresa e propriedade da reserva no backend.
- Preços, duração, profissionais compatíveis, expediente, almoço, buffers, indisponibilidade, concorrência, snapshots e idempotência continuam no motor existente.
- Resposta perdida mantém a mesma chave de idempotência e não cria outra reserva. O teste que interceptava a URL de visitante foi adaptado ao POST autenticado e mantém a verificação da chave.
- Reservas antigas de visitantes do Mini Site **não foram apagadas ou associadas automaticamente pelo e-mail**. Permanecem no banco e na gestão autorizada. O novo acesso de cliente não reivindica registros antigos apenas porque o e-mail coincide. A eventual associação segura desses registros não foi introduzida nesta correção.
- O fallback de reservas de um site retirado do ar usa shell neutro do template correto. Não apresenta a marca Classic em um Mini Site nem publica o conteúdo privado novamente.

Falhas temporárias na leitura canônica de sessão recebem retry. Uma falha pública não invalida a sessão do painel. Logout/expiração do cliente retorna à entrada daquele estabelecimento, sem levar ao dashboard empresarial.

## Arquivos desta atualização

Criados:

- `server/client-auth.js`
- `src/templates/gradefy-minisite/customer.tsx`
- `src/templates/gradefy-minisite/customer.css`
- `src/templates/gradefy-minisite/customer-navigation.ts`
- `tests/minisite-client-auth.test.js`
- `tests/e2e/gradefy-minisite-client.spec.js`
- `tests/helpers/minisite-client-browser.js`
- Este relatório.

Modificados, preservando as alterações das fases anteriores:

- `server/app.js`
- `server/guest-session.js`
- `server/profile.js`
- `server/password-recovery.js`
- `src/context.tsx`
- `src/main.tsx`
- `src/templates/index.tsx`
- `src/templates/gradefy-minisite/index.tsx`
- `tests/helpers/minisite.js`
- `tests/e2e/gradefy-minisite-booking.spec.js`
- `tests/e2e/gradefy-minisite.spec.js`
- `tests/browser-server.js`

**Nenhuma migration, dependência ou arquivo do app mobile foi alterado.** As opções adicionadas aos instaladores de perfil/recuperação mantêm os valores padrão anteriores para os consumidores legados.

## Testes reais

| Verificação                                                                       | Resultado                                                                                        |
| --------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------ |
| Backend/SQLite completo (`node --test --test-concurrency=2 tests/*.test.js`)      | 320 aprovados                                                                                    |
| Backend direcionado Mini Site + autenticação de cliente                           | 21 aprovados                                                                                     |
| Teste final de sessão/recuperação, incluindo contexto empresarial incorreto       | 7 aprovados                                                                                      |
| PostgreSQL portátil 17.11 (`node tests/postgres/run-local.mjs --bin <bin-local>`) | 248 aprovados                                                                                    |
| Primeira rodada E2E direcionada                                                   | 17 aprovados; 1 falha no interceptor do teste, corrigida para filtrar POST                       |
| Primeira rodada E2E completa                                                      | 113 aprovados; 2 falhas na precedência de `/admin/servicos` e 1 no seletor de fechar, corrigidas |
| Revalidação E2E de fluxo legado e cliente após as correções                       | 9 aprovados                                                                                      |
| E2E completo final                                                                | 116 aprovados, sem falhas (6,8 min)                                                              |
| Build, TypeScript, `check:schedule`                                               | Aprovados                                                                                        |
| Prettier (`npm run format:check -- --end-of-line auto`) e `git diff --check`      | Aprovados                                                                                        |

A primeira execução do teste novo de preço esperava HTTP 409; o contrato existente retorna **412** para preço divergente. O teste passou a exigir exatamente 412, mantendo a recusa de preço adulterado. Nenhuma regra de preços foi modificada.

Nesta cópia Windows, o comando de formatação sem `--end-of-line auto` aponta 224 arquivos por finais de linha. A verificação completa com essa opção passa, preservando CRLF/LF existentes. Não foi feita reformatação global de arquivos alheios à correção.

As suítes cobrem login incorreto/correto, cadastro inválido/válido/duplicado, cookie administrativo sem identidade de cliente, cliente sem permissão administrativa, mesma identidade em ambas as sessões, troca indevida de audiences, expiração e versão inválida, origem não permitida, ausência de vínculo empresarial após cadastro, reserva real com conflito/idempotência, propriedade e empresa, recuperação com marca/link corretos e rejeição de token em contexto incorreto. Os cenários do motor e da nova autenticação do Mini Site também foram ajustados no helper compartilhado com PostgreSQL.

Os E2E exercitam interface real de cadastro/login, reserva, histórico/detalhes, cancelamento, recuperação indisponível, reset válido e retorno, destinos adulterados, erro temporário de sessão e navbar pública. As verificações mobile incluem **320, 360, 390 e 428 px**, além de tablet/desktop. São verificadas ausência de overflow, legibilidade de inputs e ausência de elementos/identidade da Igor/Classic nessas páginas.

O runner PostgreSQL criou um cluster próprio em `127.0.0.1:49367`, com `.env` desabilitado e sem conexão de produção. O relatório registra `productionAccess=false`, `testExitCode=0`, `clusterStopped=true` e `clusterRemoved=true`. SQLite usa bancos em memória/temporários. O navegador usa o servidor descartável em memória da porta 4173.

O envio de recuperação foi validado com transporte Resend **simulado**, sem enviar e-mails reais. Um fixture de reset do Mini Site foi adicionado separadamente do fixture legado para não alterar seus testes ou identidades.

Logs em `test-results/client-auth-{directed-final,backend-focused,backend-full,postgres,e2e-focused,e2e-full,e2e-regression,e2e-final,build-final,format-final}.log`, além de `test-results/postgres-validation/report.json`. Os comandos usam `DOTENV_CONFIG_PATH=NUL`, `DATABASE_URL=''` e `POSTGRES_URL=''`.

## Evidências visuais e validação local

Capturas apenas com dados fictícios em `test-results/mini-client-{login,registration,services,hours,reservations,profile,recovery}-{390,1440}.png`. Elas não são versionadas e não contêm tokens reais de recuperação ou convite.

No diretório `gradefyapp-recuperado`, executar `npm run dev` com banco de desenvolvimento. Abrir `http://localhost:5173/{slug}` de uma empresa Mini Site publicada e conferir:

1. Logado apenas em `/app`, clicar Agendar horário: deve abrir `/{slug}/entrar` antes de qualquer seleção.
2. Fazer cadastro/login de cliente: deve continuar em `/{slug}/agendar`, mantendo o estabelecimento.
3. Abrir `/{slug}/servicos` e `/{slug}/horarios` sem login: conteúdo público e tema Gradefy.
4. Abrir `/{slug}/minha-conta` ou `/{slug}/minhas-reservas`: exigir cliente; consultar, detalhar, remarcar e cancelar somente suas reservas.
5. Entrar/sair como cliente e conferir que o painel do proprietário permanece conectado.
6. Testar recuperação: conferir o slug no e-mail e o retorno ao login daquele estabelecimento. Um reset intencional de senha da mesma identidade mantém a revogação de segurança das versões antigas.
7. Conferir as URLs legadas da Igor, que continuam usando Barber Classic e seu fluxo anterior.

Para reproduzir sem dados reais, executar build e os E2E com `.env` desabilitado. O servidor de teste instala `minisite-browser` somente na memória; não cria esse estabelecimento no banco usado por `npm run dev`.

Pendências: homologar teclado e seletores nativos em Android/iOS reais e configurar o transporte de e-mail no ambiente de homologação para validar entrega real. Esta correção não provisiona provedores nem modifica produção.
