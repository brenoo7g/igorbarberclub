# Recuperação de senha

O cliente ou administrador abre **Já tenho conta → Esqueci minha senha**, informa o e-mail e recebe um link. No painel administrativo, o botão aparece diretamente no formulário de login. O modal mantém a seleção do agendamento e os campos do login. Também existe a página `/esqueci-senha`.

O link abre `/redefinir-senha#token=...`. O cliente digita e confirma a nova senha; a conta continua sendo a mesma, com suas reservas e informações preservadas. Todas as sessões anteriores são revogadas. É necessário entrar novamente; administradores têm também um atalho para o painel. Um segundo e-mail informa a alteração, sem incluir a senha.

## Configuração

Reutiliza `RESEND_API_KEY`, `EMAIL_FROM`, `APP_URL` e `JWT_SECRET`. Não é necessário criar um template no Resend nem ativar o Auth do Supabase. As tabelas são criadas automaticamente pela inicialização da API. Se as confirmações já usam um remetente autorizado para os destinatários, a recuperação usa a mesma configuração. Consulte [Resend](RESEND.md) para domínio e remetente.

Sem chave ou remetente, a solicitação retorna 503 com uma mensagem de indisponibilidade. Com configuração presente, retorna 202 genérico, independentemente de existir uma conta. Isso confirma o recebimento da solicitação, não a entrega do e-mail. Agendamentos sem login não criam contas e não dão direito de acesso por recuperação.

## API e armazenamento

- `POST /api/auth/forgot-password`: `{email}`. Normaliza e-mail, aplica limites e enfileira a mensagem para contas existentes.
- `POST /api/auth/reset-password`: `{token,password,confirmPassword}`. Valida o link e atualiza a senha em uma transação. Retorna 400 para link inválido, expirado, reutilizado ou credenciais alteradas desde a solicitação.
- `password_recovery`: destinatário, usuário, versão de sessão, hash do token, validade, evento e estado da fila.
- `password_recovery_limits`: limites persistentes por HMAC do e-mail/IP, compartilhados por instâncias da API.

Os links valem por 30 minutos desde a solicitação. O segredo do link é derivado com HMAC-SHA256 de um identificador aleatório exclusivo e da chave do servidor, com contexto separado dos JWTs. O banco guarda somente o hash SHA-256 para validação, permitindo reconstruir a mensagem para tentativas idempotentes sem guardar o token em texto aberto. O token está no fragmento da URL, não na query enviada ao servidor. A página usa `no-referrer` e remove o token da URL após o sucesso. Não há armazenamento da senha ou token em localStorage.

São permitidas até 3 solicitações por e-mail e 10 por IP em 15 minutos, com pelo menos 60 segundos entre solicitações do mesmo e-mail. Tentativas suprimidas contam nos limites e recebem a mesma resposta genérica. Há ainda um limite de 30 chamadas por IP/instância para as duas rotas. Os limites de solicitação não bloqueiam o login normal.

A API mantém a política existente: mínimo de 8 caracteres para clientes e 12 para administradores, máximo de 72 bytes UTF-8, confirmação igual e senha diferente da atual. O bloqueio da linha do usuário no PostgreSQL coordena redefinições simultâneas e alterações do perfil. O primeiro sucesso revoga todos os links anteriores e incrementa `session_version`. Alterar o e-mail ou a senha pelo perfil também invalida links pela versão de sessão. Um novo pedido não invalida links anteriores ainda válidos, evitando que pedidos indevidos impeçam a recuperação.

## Envio, falhas e operação

Na Vercel, a fila é processada com `waitUntil` após respostas bem-sucedidas da API, em paralelo à fila de agendamentos. Cada execução processa um e-mail de recuperação. No servidor Node local, o processamento ocorre a cada 15 segundos. A fila de recuperação é independente das confirmações de agendamento.

O envio usa a API do Resend com chave de idempotência por evento, timeout de 10 segundos e até 3 tentativas. Uma reserva de processamento expira em 30 segundos para permitir recuperar trabalhos interrompidos. Mensagens expiradas ou com credenciais desatualizadas não são enviadas. A rotação de `JWT_SECRET` impede reconstruir links pendentes criados com a chave antiga; nesses casos, solicite novo link.

Sem tráfego na Vercel, tentativas adicionais aguardam outra chamada da API. Para processamento contínuo sem visitas, é necessário um agendador externo. `sent` significa aceitação pelo provedor; entrega, rejeições e spam devem ser conferidos em **Emails** no Resend. Falhas são registradas sem tokens nem dados do destinatário. Não há webhook de entrega neste fluxo. Registros de recuperação com mais de 24 horas e limites antigos são removidos durante novas solicitações.

## Validação

`tests/password-recovery.test.js` cobre privacidade da resposta, origem do link, hash, validade, reutilização, concorrência, sessões revogadas, alterações de credenciais, regras de senha, limites persistentes, indisponibilidade, tentativas idempotentes e processamento interrompido. O provedor é simulado; nenhum e-mail real é enviado pelos testes.

`tests/e2e/password-recovery.spec.js` verifica o modal, preservação do formulário, erros, navegação/recarregamento, layout mobile e troca de senha pela API real em uma conta de teste isolada. Os testes de concorrência usam SQLite; o bloqueio PostgreSQL não substitui um teste de carga em múltiplas instâncias.

Referências: [OWASP — Forgot Password](https://cheatsheetseries.owasp.org/cheatsheets/Forgot_Password_Cheat_Sheet.html) e [Resend — Send Email](https://resend.com/docs/api-reference/emails/send-email).
