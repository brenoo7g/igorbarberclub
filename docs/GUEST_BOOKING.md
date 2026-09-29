# Agendamento sem login

Na terceira etapa do agendamento, a aba **Continuar Sem Login** solicita somente **Nome + Sobrenome**, **Telefone** com DDD e **E-mail**. O botão **Confirmar agendamento** valida os campos e grava a reserva. As opções de criar conta e entrar continuam disponíveis; clientes já conectados confirmam usando seus dados da conta.

Nenhuma conta ou senha é criada para um visitante. Após uma reserva bem-sucedida, uma sessão persistente permite reutilizar os contatos e consultar, cancelar ou remarcar as reservas daquele navegador em **Minha conta / Meus agendamentos**. Os três contatos também ficam na reserva (`guest_name`, `guest_phone`, `guest_email`), com `user_id` nulo. Informar um e-mail já cadastrado não associa o visitante àquela conta nem permite consultar seu histórico. Mesmo criar uma conta depois com o mesmo e-mail não vincula automaticamente reservas antigas sem login.

O acesso permanece por 90 dias e é renovado ao consultar a identidade no site; outras chamadas renovam após um dia. **Esquecer este dispositivo** revoga a sessão no servidor e apaga o cookie, sem cancelar ou apagar reservas. A interface pede confirmação antes de esquecer. Se limpar os dados do navegador, usar outro aparelho ou deixar a sessão expirar, é necessário falar com a barbearia para gerenciar essas reservas. Não há recuperação automática por e-mail para visitantes. Reservas anteriores a este recurso não são associadas por coincidência de e-mail ou telefone.

Os contatos ficam preenchidos nas reservas seguintes e podem ser corrigidos antes de confirmar. Uma alteração atualiza os dados lembrados para o próximo agendamento, preservando os contatos originais dos agendamentos anteriores. Ao remarcar, a confirmação apresenta os contatos da reserva original. A opção de entrar ou criar uma conta continua disponível, mas a conta e o histórico de visitante permanecem separados; quando há login, a identidade da conta tem prioridade.

## API e consistência

`POST /api/appointments/guest` aceita os campos do agendamento e um objeto `guest`:

```json
{
  "services": ["corte"],
  "barberId": "igor",
  "date": "2030-01-07",
  "time": "09:00",
  "expectedTotal": 3500,
  "expectedDuration": 40,
  "guest": {
    "name": "Cliente Exemplo",
    "phone": "21999999999",
    "email": "cliente@example.com"
  }
}
```

Exemplo estrutural: use IDs, preço e duração reais do catálogo e uma data dentro dos próximos 90 dias. A rota utiliza a mesma transação, validação de preço/duração, cálculo de disponibilidade e lock da agenda autenticada. Duas tentativas para o mesmo horário não criam duas reservas. Há limite de dez solicitações por IP a cada 15 minutos na rota pública, além do limite geral. A proteção de origem continua ativa. Falhas de envio de notificação não desfazem uma reserva válida.

O cadastro autenticado usa `POST /api/appointments`. A lista `GET /api/appointments` e as rotas `PATCH /api/appointments/:id/cancel` e `PATCH /api/appointments/:id/reschedule` aceitam sessão de conta ou de visitante e verificam a propriedade da reserva. Visitantes não recebem permissões administrativas ou de edição de contas. Não há consulta pública por e-mail nem por código do agendamento. O código serve para identificar a reserva ao falar com a barbearia, não como credencial de acesso.

## Confirmação, agenda e financeiro

O visitante vê o resumo, seu nome e o código da reserva. Se o e-mail estiver configurado, a confirmação é destinada ao contato preenchido e inclui serviço, data, horário, profissional, duração e preço. Para reservas novas com sessão, o link leva a `/minha-conta` com a orientação de abrir no mesmo navegador. Eventos antigos, sem vínculo de sessão, mantêm o contato da barbearia. Cancelamento e remarcação geram suas notificações normalmente; não podem alterar reservas passadas ou finalizadas.

A agenda administrativa inclui essas reservas com nome e telefone. O administrador pode atualizar seu status ou cancelar pelo fluxo existente. Receitas e ticket médio consideram os atendimentos concluídos normalmente. Na contagem de clientes, contas usam seu ID e visitantes são agrupados pelo e-mail informado; esses contatos não representam identidades verificadas.

## Migração

As tabelas adicionais `guest_sessions` e `guest_appointments` são criadas automaticamente. `guest_sessions` guarda contatos, datas e somente o SHA-256 de um segredo aleatório de 256 bits. O segredo fica em cookie HttpOnly, SameSite=Lax, com expiração persistente; em produção usa Secure e o prefixo `__Host-`, sem Domain. Nada é gravado no localStorage. `GET /api/auth/me` retorna `{user,visitor}` sanitizados e prepara um cookie anônimo antes da primeira reserva, sem criar perfil no banco; reservas simultâneas desse navegador compartilham o identificador sob o lock de agendamento. O perfil e o vínculo são persistidos apenas quando a reserva é concluída. Um token revogado ou expirado nunca reabre seu histórico antigo.

Todas as mutações conservam a proteção de origem, a validação do horário e o lock de agenda. Cancelamento/remarcação revalidam a sessão dentro da transação, com bloqueio da linha no PostgreSQL. `tests/guest-session.test.js` verifica isolamento, concorrência, contatos, expiração, revogação e preservação de reservas; `tests/e2e/guest-session.spec.js` verifica reabertura com cookie persistente, histórico, pré-preenchimento, remarcação e cancelamento no celular. Os testes de concorrência automatizados usam SQLite.

Na inicialização, `appointments.user_id` passa a aceitar nulo e são adicionadas as três colunas de contato. PostgreSQL usa `ALTER TABLE` sob a transação e o lock de esquema. SQLite reconstrói a tabela dentro de uma transação para remover a restrição `NOT NULL`, copiando linhas, recriando índices/gatilhos e verificando chaves estrangeiras antes de habilitá-las novamente. A migração é repetível e preserva reservas, itens e notificações existentes. Não exige novas variáveis de ambiente.
