# Configuração da agenda e abertura de semanas

No painel, abra **Agenda → Configurar agenda** (`/admin/agenda/configuracoes`). Escolha o profissional, os dias ativos, início/fim do expediente e até quatro intervalos fixos por dia. Todos os horários são de Brasília. Salve antes de liberar semanas.

## Regras de abertura

- **Automático:** janela de 1 a 90 dias de funcionamento. Hoje conta se for dia ativo; folgas configuradas não contam. O padrão preserva o funcionamento anterior (segunda a sábado, variáveis `OPEN_HOUR`/`CLOSE_HOUR`, sem almoço) e usa 90 dias de funcionamento. Nenhuma semana é fechada automaticamente na implantação.
- **Manual:** somente semanas explicitamente liberadas aceitam novas reservas, incluindo visitantes e remarcações. Reservas existentes continuam válidas mesmo quando estiverem fora da janela de abertura.
- O ciclo de referência vai de segunda a domingo. O período exibido vai do primeiro ao último dia ativo desse ciclo: com terça a sábado, o botão mostra terça a sábado. Dias inativos no meio também ficam indisponíveis.
- A primeira liberação pode incluir a semana atual, se ainda houver um dia ativo a partir de hoje. Em seguida, o botão oferece o primeiro ciclo futuro ainda não aberto. Datas passadas nunca aceitam reservas.
- Ao mudar os dias ativos, os períodos das semanas abertas são recalculados dentro dos mesmos ciclos. Isso permite, por exemplo, ativar uma segunda-feira em uma semana já aberta sem duplicar a liberação. Alterações que conflitem com reservas futuras confirmadas são recusadas.
- Os modos compartilham a grade. Voltar do automático ao manual reutiliza semanas já liberadas; não apaga reservas nem libera períodos extras. A navegação tem limite de segurança de 730 dias; o modo automático sempre respeita sua janela menor.

No modo manual, períodos fechados exibem exatamente: **“A agenda para este período ainda não foi aberta pelo barbeiro. Volte em breve!”**

## Intervalos e duração

`availableSlots` recebe o dia configurado, soma as durações dos serviços e subtrai os intervalos fixos, reservas confirmadas/concluídas e bloqueios pontuais. Cada espaço livre começa no início do expediente ou no final da ocupação anterior, avançando pela duração total escolhida. Só oferece `início + duração <= fim do espaço livre`.

Exemplo, 09h–19h com almoço 12h20–14h e serviço de 40 minutos:

`09:00, 09:40, 10:20, 11:00, 11:40 | almoço | 14:00, 14:40, 15:20, 16:00, 16:40, 17:20, 18:00`

12h00 não é oferecido porque terminaria no almoço. Uma reserva terminando exatamente às 12h20 é aceita; 14h inicia o próximo turno. Reservas anteriores com outra duração também são respeitadas. Expedientes não atravessam a meia-noite, intervalos não se sobrepõem e pelo menos um dia deve estar ativo. Bloqueios pontuais podem cobrir um turno inteiro, incluindo o almoço.

## Banco e rotas

| Tabela                  | Conteúdo                                                                                                               |
| ----------------------- | ---------------------------------------------------------------------------------------------------------------------- |
| `barber_settings`       | Profissional, `agenda_mode`, `max_days_ahead` e `version` para edições concorrentes                                    |
| `barber_working_hours`  | Uma linha por profissional/dia; `active`, `start_time`, `end_time`, `break_start`, `break_end`                         |
| `barber_working_breaks` | Intervalos adicionais a partir do segundo, ordenados por `position`                                                    |
| `released_weeks`        | Profissional, ciclo canônico `week_start`, `start_date`, `end_date`, data de liberação; chave única profissional/ciclo |

O esquema é adicionado automaticamente, sem apagar dados. Configurações ainda não salvas usam o expediente anterior como padrão. Fotos, perfis, serviços e reservas permanecem no banco.

| Método | Rota                                    | Contrato                                                                                                          |
| ------ | --------------------------------------- | ----------------------------------------------------------------------------------------------------------------- |
| GET    | `/api/barbers/:id/schedule`             | Público: `{mode,active_days,dates,max_date}`                                                                      |
| GET    | `/api/admin/barbers/:id/schedule`       | Admin: `{settings,days,released_weeks,next_week}`                                                                 |
| PUT    | `/api/admin/barbers/:id/schedule`       | Admin: `{agenda_mode,max_days_ahead,version,days}`; cada dia possui `{weekday,active,start_time,end_time,breaks}` |
| POST   | `/api/admin/barbers/:id/released-weeks` | Admin: `{week_start,version}`; responde período, `url`, `text`, `whatsapp_url`                                    |
| GET    | `/api/availability`                     | Retorna `{slots,duration,reason,message}`; período fechado retorna lista vazia e motivo                           |

As rotas de reserva autenticada, visitante e remarcação revalidam a abertura e o expediente dentro da transação. Alteração de serviços também usa o mesmo lock das reservas. `409` indica conflito de horário, configuração desatualizada ou período fechado; `400` indica dados inválidos.

## Compartilhamento

O link usa a origem configurada em `APP_URL` e inclui `/agendar?semana=YYYY-MM-DD&profissional=ID`. Não deriva o domínio de cabeçalhos enviados pelo cliente. A seleção dos serviços continua sendo a primeira etapa; a data e o profissional já ficam preparados para a etapa seguinte.

Depois da liberação, o modal oferece **Copiar Link** e **Enviar no WhatsApp**. A mensagem contém as datas e o link, codificados em `https://wa.me/?text=...`. O envio é concluído pelo usuário no WhatsApp; abrir o modal não envia mensagens. Se a área de transferência não estiver disponível, o campo permite selecionar e copiar manualmente. [Formato oficial do WhatsApp](https://faq.whatsapp.com/5913398998672934).

O parâmetro `semana` aceita somente datas reais no formato ISO. Valores inválidos, impossíveis, muito antigos ou além do limite voltam para hoje. Um link da semana atual pode manter o início até seis dias antes de hoje, mas os dias passados ficam desativados e a data selecionada começa em hoje.

## Revisão e QA

- **Intervalos:** testes verificam 480 durações, espaços ocupados, múltiplos intervalos, almoço, fim do expediente e limites exatos; todo slot deve caber inteiramente em um espaço livre.
- **Fuso:** calendário usa datas ISO com operações em meio-dia UTC e determina “hoje” em `America/Sao_Paulo`. A comparação com o instante atual usa o deslocamento de Brasília (`-03:00`) vigente no horizonte suportado. Testes cobrem meia-noite de Brasília, ano novo e ano bissexto.
- **Folgas:** teste de terça a sábado, domingo ativo, janela contendo fim de semana e profissional com grade independente.
- **Concorrência:** reservas, bloqueios, consultas de disponibilidade, edição de expediente e edição de serviço usam o lock transacional PostgreSQL `789126`. SQLite serializa operações com `BEGIN IMMEDIATE`. Nunca há liberação do lock entre a validação e a gravação. [Locks transacionais PostgreSQL](https://www.postgresql.org/docs/16/explicit-locking.html#ADVISORY-LOCKS).
- **Liberação repetida:** o cliente envia o ciclo mostrado, e a chave única impede duplicatas. Repetir a mesma chamada devolve a semana já aberta, sem abrir silenciosamente a seguinte.
- **Preservação:** mudar a grade de modo incompatível com reservas confirmadas retorna 409, com data e hora do conflito. A edição usa versão para impedir sobrescrita por outra aba. Não exige recriação de contas.
- **Navegador:** teste do painel em 320/390/1440 pixels, modo manual, almoço, liberação, cópia, URL do WhatsApp, link com profissional, calendário público e fallback de datas inválidas. Mensagens reais não são enviadas pelos testes.

`npm run check` verifica TypeScript do frontend e dos módulos novos de agenda (JavaScript tipado com JSDoc), build e testes de backend. `npm run test:e2e` verifica os fluxos no Chromium. `tests/schedule.test.js` exercita a API com SQLite isolado; isso não substitui um teste de carga com múltiplas instâncias PostgreSQL. A revisão e os testes dão evidência dos casos cobertos, não uma garantia absoluta de ausência de bugs.
