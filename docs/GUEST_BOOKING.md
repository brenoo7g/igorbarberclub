# Agendamento sem login

Na terceira etapa do agendamento, a aba **Continuar Sem Login** solicita somente **Nome + Sobrenome**, **Telefone** com DDD e **E-mail**. O botão **Confirmar agendamento** valida os campos e grava a reserva. As opções de criar conta e entrar continuam disponíveis; clientes já conectados confirmam usando seus dados da conta.

Nenhuma conta, senha ou sessão é criada para um visitante. Os três contatos ficam na reserva (`guest_name`, `guest_phone`, `guest_email`), com `user_id` nulo. Informar um e-mail já cadastrado não associa o visitante àquela conta nem permite consultar seu histórico. Mesmo criar uma conta depois com o mesmo e-mail não vincula automaticamente reservas antigas sem login.

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

O cadastro autenticado usa `POST /api/appointments`; a lista de reservas e as rotas de cancelamento/remarcação por conta continuam exigindo sessão e propriedade da reserva. Não há consulta pública por e-mail nem por código do agendamento. O código serve para identificar a reserva ao falar com a barbearia, não como credencial de acesso.

## Confirmação, agenda e financeiro

O visitante vê o resumo, seu nome e o código da reserva. Se o e-mail estiver configurado, a confirmação é destinada ao contato preenchido e inclui serviços, data, horário, profissional, duração e preço. O link leva à seção de contato da barbearia. Para cancelar ou remarcar, o visitante precisa contatar a barbearia; não recebe uma instrução para acessar uma conta inexistente.

A agenda administrativa inclui essas reservas com nome e telefone. O administrador pode atualizar seu status ou cancelar pelo fluxo existente. Receitas e ticket médio consideram os atendimentos concluídos normalmente. Na contagem de clientes, contas usam seu ID e visitantes são agrupados pelo e-mail informado; esses contatos não representam identidades verificadas.

## Migração

Na inicialização, `appointments.user_id` passa a aceitar nulo e são adicionadas as três colunas de contato. PostgreSQL usa `ALTER TABLE` sob a transação e o lock de esquema. SQLite reconstrói a tabela dentro de uma transação para remover a restrição `NOT NULL`, copiando linhas, recriando índices/gatilhos e verificando chaves estrangeiras antes de habilitá-las novamente. A migração é repetível e preserva reservas, itens e notificações existentes. Não exige novas variáveis de ambiente.
