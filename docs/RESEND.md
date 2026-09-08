# Confirmação de agendamento por e-mail

O envio já está integrado à API do Resend. Não é necessário instalar um plugin nem configurar SMTP no Supabase: o site usa sua própria autenticação e envia pelo backend Express.

## Fluxo implementado

1. O cliente confirma o agendamento.
2. O servidor valida e grava a reserva e o evento de e-mail na mesma transação.
3. Após a resposta da API, a função Vercel processa a fila usando o remetente `EMAIL_FROM`.
4. O Resend recebe a mensagem destinada ao e-mail da conta do cliente.

Novos eventos incluem nome do cliente, serviços, data, horário de Brasília, profissional, duração, preço total, pagamento presencial e código da reserva, além do link de acesso à conta para consultar, cancelar ou remarcar. Cancelamentos e remarcações também geram e-mail. Preço e profissional são registrados no evento; editar o catálogo depois não altera uma confirmação pendente. Eventos antigos continuam compatíveis, mas não contêm esses dois campos históricos.

## Conectar na Vercel

1. Crie sua conta no [Resend](https://resend.com).
2. Em **Domains → Add domain**, adicione um domínio que você controla. Copie os registros DNS de envio apresentados pelo Resend para o painel onde administra esse domínio e aguarde o status **Verified**. O domínio/subdomínio do remetente deve ser exatamente o verificado. [Guia oficial de domínios](https://resend.com/docs/dashboard/domains/introduction).
3. Em **API Keys**, crie uma chave com permissão de envio, preferencialmente limitada a esse domínio. Copie o valor para a Vercel; não o coloque no código, no GitHub ou em mensagens. [Chaves de API](https://resend.com/docs/dashboard/api-keys/introduction).
4. Na **Vercel → igorbarberclub → Settings → Environment Variables**, configure em **Production**:

| Nome             | Valor                                                |
| ---------------- | ---------------------------------------------------- |
| `RESEND_API_KEY` | A chave secreta criada no Resend, iniciada por `re_` |
| `EMAIL_FROM`     | `Igor Barber Club <agenda@SEU-DOMINIO-VERIFICADO>`   |
| `APP_URL`        | `https://igorbarberclub.vercel.app`                  |

Substitua `SEU-DOMINIO-VERIFICADO` pelo domínio real. Cole somente os valores, sem aspas externas e sem o nome da variável. Essas variáveis pertencem ao servidor: não use prefixo `VITE_`. A chave Resend não é a chave do Supabase; `EMAIL_FROM` não é o e-mail de login do administrador.

5. Salve e faça **Deployments → Redeploy**.
6. Abra `/api/config`: `notifications.email: true` indica que as duas variáveis de e-mail estão presentes. Esse indicador não valida a chave nem a verificação do domínio.
7. Faça uma reserva usando um e-mail seu para testar. Confira a mensagem e os eventos de entrega na seção **Emails** do Resend. Cancele a reserva de teste ao terminar. Sem credenciais configuradas, os testes automatizados usam uma API simulada e não enviam mensagens reais.

## Domínio e remetente

O envio para clientes exige domínio próprio verificado; não é possível verificar `gmail.com`, `outlook.com` ou `vercel.app` como seu domínio. O site pode continuar hospedado em `igorbarberclub.vercel.app` enquanto o remetente usa um domínio próprio. O Resend permite enviar de endereços do domínio verificado sem cadastrar cada remetente individualmente. [Remetentes no Resend](https://resend.com/docs/knowledge-base/how-do-I-create-an-email-address-or-sender-in-resend).

`Igor Barber Club <onboarding@resend.dev>` serve apenas para testes enviados ao e-mail da sua conta Resend, não para qualquer cliente. Não habilite esse remetente em produção com uma fila de outros destinatários. [Limitação do domínio de testes](https://resend.com/docs/knowledge-base/403-error-resend-dev-domain).

## Diagnóstico e entrega

- **Configuração indica false:** confirme as duas variáveis em Production e o redeploy.
- **401/403 no provedor:** confira a chave, suas permissões, o domínio Verified e o domínio exato em `EMAIL_FROM`.
- **429:** limite do provedor; a fila mantém tentativas com atraso.
- **Reserva confirmada, mas sem e-mail:** consulte **Emails** no Resend e `/api/admin/notifications` autenticado como administrador. O agendamento permanece salvo mesmo se o envio falhar.

Na Vercel, cada resposta bem-sucedida da API pode processar até dois eventos. Sem tráfego, novas tentativas aguardam a próxima chamada; para processamento contínuo é necessário um worker/agendador externo. As tentativas são limitadas a cinco. Antes de ativar o envio numa base que já recebeu reservas, confira os eventos pendentes antigos, pois a ativação também libera essa fila. `sent` no banco significa que o Resend aceitou a requisição; a entrega efetiva deve ser conferida no Resend, incluindo rejeições e spam. A aplicação ainda não recebe webhooks de entrega.
