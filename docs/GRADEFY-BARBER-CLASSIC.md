# Gradefy — Barber Classic (Fase 6)

## Estrutura do template

`src/templates/barber-classic/index.tsx` registra `barber-classic` e compõe os componentes existentes. `SiteShell` resolve o site e fornece `SiteContext` antes de montar `AppProvider`; trocar o slug remonta o contexto e descarta catálogo/estado da empresa anterior. `src/site-context.tsx` contém links relativos ao site e a API com prefixo empresarial. `preview.ts` contém somente dados de demonstração.

Foram reaproveitados `Home`, `Layout`, `Brand`, benefícios, cards de serviços, carrossel/lightbox de `Portfolio`, `Booking`, `Account`, `Profile`, formulários e estilos originais. Novos estilos apenas acomodam logos e nomes variáveis. Não houve reconstrução do layout nem aplicação da identidade violeta/ciano do Gradefy.

## Dados fixos e dinâmicos

Textos genéricos de atração, benefícios, botões, títulos e experiência pertencem ao template. Permanecem “NÃO É SÓ UM CORTE. É SOBRE VOCÊ.”, “ESTILO É IDENTIDADE”, “NA MEDIDA DO SEU ESTILO”, “BARBEARIA DE VERDADE. FEITA PRA VOCÊ.” e “CHEGA JUNTO. SAIA COM ATITUDE.”.

| Informação                                                 | Fonte                                                                                                           |
| ---------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------- |
| ID, nome, slug, nicho, template, timezone                  | `companies`, com template ativo validado no backend                                                             |
| Logo, favicon, wordmark opcional e slogan                  | `company_settings.logo_url`, `favicon_url`, `wordmark_title`, `wordmark_subtitle`, `slogan`                     |
| Banner e imagem sobre o espaço                             | `company_settings.hero_image_url`, `about_image_url`                                                            |
| Descrição e apresentação complementar                      | `company_settings.description`, `about_detail`                                                                  |
| WhatsApp, telefone, Instagram                              | `company_settings.whatsapp`, `phone`, `instagram_url`                                                           |
| Endereço, cidade, região, link de localização              | `company_settings.address`, `city`, `region`, `location_url`                                                    |
| Cores opcionais                                            | `company_settings.primary_color`, `secondary_color`; somente hex válido; defaults Royal/vermelho do template    |
| Ordem de destaque e serviço destacado                      | `featured_service_ids` (JSON) e `highlight_service_id`; somente IDs presentes no catálogo da empresa são usados |
| Serviços, preços em centavos e duração                     | API existente `/services`, filtrada por `company_id`                                                            |
| Profissionais, especialidade, associação a serviços e foto | API `/barbers`, `barbers.photo_url`, `barber_services`, filtrados por empresa                                   |
| Portfólio e imagens                                        | API existente `/portfolio`; URLs de imagem incluem slug empresarial                                             |
| Dias, semanas liberadas, slots e reservas                  | APIs existentes de agenda, disponibilidade e appointments                                                       |

`server/public-site.js` retorna um DTO público explícito, sem memberships, subscriptions ou dados de clientes. URLs perigosas/credenciais são omitidas; Instagram exige domínio correspondente; cores inválidas são omitidas. Imagens usam assets locais ou HTTPS. O servidor não baixa URLs empresariais; CSP libera HTTPS apenas para imagens e continua restringindo scripts/conexões. Imagens externas devem estar em armazenamento estável; não há upload empresarial novo nesta fase.

## CompanyId e compatibilidade

`GET /api/public/:slug/site` usa o resolvedor da Fase 3; todas as consultas posteriores usam o `companyId` resolvido. Slug inexistente/suspenso retorna 404 e a UI apresenta indisponibilidade. Não existe fallback visual ou de API para Igor em slugs desconhecidos, nem template alternativo automático.

URLs públicas: `/:slug`, `/:slug/agendar`, `/:slug/minha-conta`, `/:slug/minha-conta/perfil` e páginas de recuperação existentes. Links, seleção, disponibilidade, criação, histórico, remarcação e cancelamento permanecem no prefixo empresarial. Autenticação de contas e edição do perfil global continuam nas rotas globais; JWT, cookies e credenciais não mudaram. A gestão continua exclusivamente nas APIs administrativas protegidas por membership. O site público não oferece edição de catálogo, equipe ou dados empresariais.

O root `/`, `/agendar`, `/minha-conta` e demais aliases legados permanecem na Igor, pelos mesmos handlers existentes. `/admin/*` mantém a interface administrativa atual, fora do layout público. A resolução administrativa e eventual seleção obrigatória de empresa continuam regidas pela Fase 3; não há painel Gradefy novo.

Migration **008** acrescenta apenas os campos de apresentação em `company_settings` e `barbers.photo_url`. Os textos/imagens/wordmark/favicon da Igor são transferidos uma vez para seus dados empresariais. Não altera preços, serviços, fotos do portfólio, profissionais, reservas, planos ou assinaturas; migrations 001–007 intactas. Reaplicação/seed não sobrescrevem personalizações. Testes fazem snapshot, falha injetada, rollback e reexecução em SQLite/PostgreSQL.

Links de divulgação da agenda e links em notificações agora usam slug/nome da empresa. Novos eventos guardam identidade empresarial no snapshot; eventos antigos sem esse dado usam a própria empresa quando o envelope é preparado. Envelopes já persistidos permanecem intactos. Transporte de WhatsApp/e-mail continua com a configuração global existente.

## Preview

`/preview/barber-classic` compõe o mesmo layout com `[Sua logo]`, `[Nome da sua barbearia]`, `[Sua localização]`, `[Seus serviços]`, `[Sua equipe]` e `[Seu portfólio]`. Dados estão em memória, separados do banco; a API de preview não faz chamadas empresariais nem grava dados e recusa mutações. O CTA não realiza agendamento de demonstração. A integração da seleção de template com onboarding pertence a uma etapa posterior.

O site normal não usa os dados de preview. Sobre, galeria, imagens, contatos e serviços opcionais sem conteúdo são ocultados. Sem logo, mostra ícone neutro e nome real; sem favicon, usa ícone neutro do template. `publicationIssues` prepara a validação mínima de nome, template/nicho e presença de serviços/profissionais para um futuro fluxo de publicação. Esta fase não cria esse fluxo.

## Limitações e Fase 7

- Editor administrativo dos dados empresariais, upload/armazenamento de logo/banner/fotos e workflow de publicação ainda não existem. Os campos estão preparados; manutenção confiável do backend deve ser empresarial. A publicação futura também deverá validar slugs reservados, associações agendáveis e expediente configurado.
- Relógio da agenda continua com a regra existente de Brasília; esta entrega não implementa outras zonas operacionais.
- Sessão de visitante mantém o contrato de cookies da Fase 3. A navegação entre empresas pode substituir o contexto anônimo ativo; não permite acessar histórico de outra empresa. Persistência de vários contextos anônimos simultâneos precisa de uma etapa própria.
- O app mobile continua com seu contrato legado; não passou a renderizar sites por slug nesta fase.
- CSR permanece como antes: títulos/descrições/favicon mudam após carregar os dados. SSR, SEO por slug, domínios próprios, outros templates/nichos e painel do SaaS ficam para fases posteriores.

## Arquivos e validação

Novos: `server/migrations/008-gradefy-barber-classic.sql`, `server/public-site.js`, `src/site-context.tsx`, `src/templates/barber-classic/index.tsx`, `src/templates/barber-classic/preview.ts`, `public/images/barber-classic-icon.svg`, `tests/barber-classic.test.js`, `tests/helpers/barber-classic.js`, `tests/helpers/barber-classic-migration.js`, `tests/e2e/barber-classic.spec.js` e este documento.

Ajustados nesta fase:

- Backend: `server/app.js`, `server/company-context.js`, `server/migrations.js`, `server/professionals.js`, `server/schedule.js`, `server/notifications.js`.
- Frontend: `index.html`, `src/main.tsx`, `src/context.tsx`, `src/lib.ts`, `src/types.ts`, `src/styles.css`; componentes `UI`, `Layout`, `Portfolio`, `AuthForm`; páginas `Home`, `Booking`, `Account`, `Profile`, `PasswordRecovery`.
- Fixtures e expectativas de migração: `tests/browser-server.js`, `tests/postgres/foundation.test.js`, `tests/company-integrity.test.js`, `tests/company-migration.test.js`, `tests/data-ownership.test.js`, helpers `access-migration`, `data-ownership`, `professionals-migration`, `professional-idempotency`, `scheduling-reliability`.
- Documentação: `docs/GRADEFY-STABILIZATION.md`, `docs/GRADEFY-MIGRATION.md`, `docs/ARCHITECTURE.md`.

Validação de 2026-10-09: **105 backend/SQLite, 63 PostgreSQL 17.11, 21 E2E e 5 mobile aprovados**, build/typecheck web/mobile, Prettier e `git diff --check` aprovados. Os E2E novos cobrem marca/catálogo/mídia/contato por empresa, preview sem API, slug inválido, conteúdo opcional e larguras 390/768/1440; suítes anteriores cobrem os fluxos completos de reserva, recuperação, administração, agenda e carrossel.

A pendência prévia da Fase 5.1 foi resolvida **antes das edições da Fase 6**, com 58 testes PostgreSQL aprovados. Pacote completo PostgreSQL foi restaurado em `%LOCALAPPDATA%/Gradefy/postgresql-17.11`; sem instalar serviço. Cada runner provisiona um cluster isolado em localhost/porta aleatória e o remove ao final. Logs `test-results/phase51-postgres-restored.txt`, `phase6-unit.txt`, `phase6-postgres.txt`, `phase6-e2e.txt`, `phase6-build.txt`, `phase6-mobile.txt` e `phase6-mobile-typecheck.txt`.

Falhas da primeira rodada de navegador foram corrigidas antes da rodada final: encaixe de `/admin` e CSP de imagens HTTPS; um seletor de preview foi ajustado para conteúdo presente em mais de um local. Não há falhas pendentes nos testes executados. Nenhum acesso a produção, commit ou push. Alterações anteriores das Fases 4–5.1 permanecem no working tree.
