# Arquitetura, rotas e regras

## Páginas

| Rota                    | Conteúdo                                         | Acesso                    |
| ----------------------- | ------------------------------------------------ | ------------------------- |
| `/`                     | Landing page, serviços, galeria, sobre e contato | Público                   |
| `/agendar?servico=:id`  | Fluxo de agendamento com serviço pré-selecionado | Público até a confirmação |
| `/agendar?remarcar=:id` | Remarcação de reserva futura                     | Proprietário autenticado  |
| `/minha-conta`          | Login/cadastro ou lista de reservas e histórico  | Própria conta             |
| `/minha-conta/perfil`   | Nome, foto, contatos e senha                     | Própria conta             |
| `/admin/perfil`         | Perfil e segurança do administrador              | Administrador             |
| `/admin`                | Visão geral                                      | Administrador             |
| `/admin/agenda`         | Dia, semana, mês, status e bloqueios             | Administrador             |
| `/admin/servicos`       | CRUD de catálogo                                 | Administrador             |
| `/admin/financeiro`     | KPIs, gráficos e exportação                      | Administrador             |

## Contrato HTTP

Toda rota usa prefixo `/api`. Erros retornam `{ "error": "mensagem" }`; validações também podem incluir `details` com campos. Status 400 para dados inválidos, 401 para falta de sessão, 403 para papel/origem proibidos, 404 para recurso não encontrado, 409 para disputa de horário/e-mail duplicado e 412 para preço/duração alterados.

| Método | Rota                                                               | Regra                                                                                                                 |
| ------ | ------------------------------------------------------------------ | --------------------------------------------------------------------------------------------------------------------- |
| GET    | `/health`                                                          | Saúde e dialeto do banco                                                                                              |
| GET    | `/config`                                                          | Expediente, demo e canais configurados, sem credenciais                                                               |
| GET    | `/services`                                                        | Serviços ativos                                                                                                       |
| GET    | `/barbers`                                                         | Profissionais ativos                                                                                                  |
| GET    | `/availability?date=YYYY-MM-DD&barberId=igor&services=corte,barba` | Intervalos que acomodam todos os serviços; `except` só é considerado para proprietário/admin                          |
| POST   | `/auth/register`                                                   | `{name,email,phone,password}`; cria cliente, nunca administrador                                                      |
| POST   | `/auth/login`                                                      | `{email,password}`; cookie JWT HttpOnly SameSite=Lax                                                                  |
| GET    | `/auth/me`                                                         | `{user}` público sanitizado ou null                                                                                   |
| POST   | `/auth/logout`                                                     | Apaga cookie                                                                                                          |
| PATCH  | `/auth/profile`                                                    | `{name,email,phone,avatar,profileVersion,currentPassword?}`; própria conta, senha atual obrigatória ao alterar e-mail |
| PATCH  | `/auth/password`                                                   | `{currentPassword,password}`; própria conta, renova sessão e invalida as demais                                       |
| GET    | `/appointments`                                                    | Reservas somente do usuário autenticado                                                                               |
| POST   | `/appointments`                                                    | `{services:[id],barberId,date,time,expectedTotal?,expectedDuration?}`                                                 |
| PATCH  | `/appointments/:id/reschedule`                                     | Mesmo corpo da criação; proprietário, futuro, confirmado                                                              |
| PATCH  | `/appointments/:id/cancel`                                         | Proprietário, futuro, confirmado                                                                                      |
| GET    | `/admin/appointments?from=YYYY-MM-DD&to=YYYY-MM-DD`                | Lista com cliente, serviços e profissional                                                                            |
| PATCH  | `/admin/appointments/:id/status`                                   | `{status:"completed"                                                                                                  | "cancelled" | "no-show"}` |
| POST   | `/admin/services`                                                  | `{name,description,duration,price,category}`; preço em centavos                                                       |
| PUT    | `/admin/services/:id`                                              | Mesmos campos; altera somente o catálogo                                                                              |
| DELETE | `/admin/services/:id`                                              | Exclusão lógica (`active=0`)                                                                                          |
| GET    | `/admin/blocks?from=...&to=...`                                    | Bloqueios no período                                                                                                  |
| POST   | `/admin/blocks`                                                    | `{barberId,date,start:"12:00",end:"13:00",reason}`                                                                    |
| DELETE | `/admin/blocks/:id`                                                | Libera intervalo                                                                                                      |
| GET    | `/admin/metrics`                                                   | KPIs e séries calculados no servidor                                                                                  |
| GET    | `/admin/notifications`                                             | Contagem por canal e estado                                                                                           |

## Modelo de dados

```mermaid
erDiagram
    users ||--o{ appointments : agenda
    barbers ||--o{ appointments : atende
    barbers ||--o{ blocks : possui
    appointments ||--|{ appointment_services : registra
    services ||--o{ appointment_services : origina
    appointments ||--o{ notifications : dispara
```

- `users`: UUID, nome, e-mail único normalizado, telefone, hash bcrypt, papel, criação, `avatar` (data URI WebP), `profile_version` e `session_version`.
- `barbers`: identificador, nome, especialidade, ativo. O seed cria Igor Borges; podem ser incluídos profissionais no banco.
- `services`: descrição, categoria, duração em minutos inteiros, preço em centavos, ativo.
- `appointments`: proprietário, profissional, data local ISO, minuto inicial/final, total em centavos, estado, criação.
- `appointment_services`: snapshot de nome, preço e duração no momento da reserva. Chave composta impede repetição do mesmo serviço.
- `blocks`: profissional, data, início/fim em minutos, motivo.
- `notifications`: canal, evento, payload congelado, status, tentativas, erro resumido, próxima tentativa. Nenhuma credencial é armazenada no payload. Ao enviar, nome/e-mail/telefone são consultados na conta atual; data, horário e serviços continuam sendo o snapshot do evento.

Veja o esquema executável em [`server/schema.sql`](../server/schema.sql). Datas usam texto ISO para a mesma implementação funcionar nos dois bancos. As chaves estrangeiras ficam habilitadas também no SQLite.

## Disponibilidade e consistência

O intervalo de uma reserva é semiaberto `[início, fim)`. Existe conflito quando `novoInicio < fimExistente && novoFim > inicioExistente`. Logo, terminar às 10h permite que outro atendimento comece às 10h.

O servidor soma as durações e os preços do catálogo; nunca confia em um total enviado pelo cliente. `expectedTotal` e `expectedDuration` permitem interromper a confirmação se o catálogo tiver mudado após a seleção. Também valida profissional, serviços ativos, domingo, expediente, horários já passados, intervalos de início baseados na duração total selecionada e horizonte de 90 dias.

Na transação, a agenda é bloqueada, a disponibilidade é recalculada e a reserva, seus snapshots e a outbox são gravados juntos. Agendamentos `confirmed` e `completed` ocupam o intervalo. Cancelamentos liberam o horário. Um bloqueio sobre reserva existente é rejeitado.

O administrador pode finalizar somente uma reserva confirmada. Conclusão exige término do intervalo; ausência exige que o horário inicial tenha chegado. Estados finais não podem ser reabertos por esta versão. Uma remarcação mantém o ID, recalcula os serviços e gera um novo evento com payload congelado.

## Cálculos financeiros

Todos os cálculos usam inteiros em centavos e exclusivamente `status='completed'`.

```text
receita(periodo) = soma(appointment.total de concluídos no período)
ticketMedio = arredondar(receita dos últimos 30 dias / número de atendimentos concluídos)
clientesUnicos = quantidade distinta de user_id nos últimos 30 dias
melhorDiaReceita = dia da semana com maior soma de receita nos últimos 30 dias
melhorDiaVolume = dia da semana com mais atendimentos concluídos nos últimos 30 dias
maisVendido = serviço com mais snapshots em atendimentos concluídos no período
```

O ticket é por atendimento, portanto um mesmo cliente com duas visitas representa dois tickets; a métrica de clientes únicos é separada. Semana começa na segunda-feira. Mês e ano são períodos civis até hoje. O gráfico e CSV mostram 14 dias, incluindo dias de receita zero. Esse faturamento é receita de serviços realizados; não é lucro e não inclui gestão de despesas, impostos ou conciliação de pagamentos.

## Segurança

Edições da conta bloqueiam a linha do usuário no PostgreSQL (`FOR UPDATE`) e comparam `profileVersion`, impedindo sobrescrita por uma aba desatualizada (409). IDs, papéis e versões de sessão não podem ser enviados nos formulários. A troca de credenciais incrementa `session_version`, verificada em cada requisição; apenas a sessão que concluiu a alteração recebe um novo cookie. Contas existentes recebem as novas colunas por migração aditiva e repetível dentro do lock de inicialização.

O corpo do perfil tem limite de 768 KB; as demais rotas mantêm 32 KB. Fotos na API aceitam apenas data URI JPG/PNG/WebP de até 512 KB, com validação do conteúdo, limite de pixels, rejeição de animação e recodificação. URLs externas e SVG são rejeitados. A conversão usa [Sharp](https://sharp.pixelplumbing.com/api-constructor/) sem preservar metadados da imagem original. A interface reduz fotos de até 5 MB antes do envio.

Hashes bcrypt com custo 12, JWT HS256 com issuer/audience/expiração e segredo apenas no servidor; cookie HttpOnly, SameSite=Lax e Secure em produção. A autorização é reavaliada na API consultando a conta no banco. Cadastro não permite elevação de papel. Toda consulta que aceita identificadores usa parâmetros. Reservas de outros usuários não são expostas ao cliente.

Helmet aplica cabeçalhos e CSP na distribuição de produção. Mutações com `Origin` diferente de `APP_URL` são rejeitadas; não há CORS aberto. Rate limiting geral e para tentativas de autenticação/edição do perfil. APIs não são armazenadas em cache. As sessões duram até sete dias, com revogação ao trocar credenciais. Recuperação de senha esquecida e verificação de propriedade do e-mail ainda não estão implementadas.
