# Acesso simplificado para testes

Execute `npm run dev:test-access`. Em **Minha conta**, use **Acessar agendamentos de teste** e informe o e-mail usado em uma reserva sem conta nesse ambiente. Não é solicitada senha, código ou confirmação de e-mail. Funciona em outro navegador e depois de apagar cookies, expirar ou esquecer a sessão, enquanto o servidor de teste estiver rodando.

O servidor usa exclusivamente SQLite em memória, separado do Supabase e do SQLite normal. As credenciais de envio de notificações são desativadas nesse processo. Os dados são descartados ao encerrar ou reiniciar o servidor. Esse modo é para testar o fluxo com contatos fictícios; não confirma a identidade de ninguém. Históricos de visitante com o mesmo e-mail são agrupados apenas nesta base temporária. Contas com senha, inclusive a administração, continuam exigindo login normal.

Para testar em um celular na mesma rede, configure `APP_URL` com o endereço usado, por exemplo `http://192.168.1.10:5173`, antes de iniciar. Abra esse mesmo endereço no computador e no celular. Use o IP real do computador; `localhost` no celular aponta para o próprio celular. O acesso depende da rede e das permissões do firewall. Não execute simultaneamente o servidor normal na porta 3001.

O modo exige `DEMO_MODE` habilitado (padrão local), banco efêmero e ambiente não produtivo. A aplicação recusa iniciá-lo com PostgreSQL, SQLite em arquivo, `NODE_ENV=production` ou Vercel. A API `/api/auth/test-access` e seu botão não ficam disponíveis na aplicação normal. Não há variável para liberar essa rota no site público.

Testes em `tests/test-access.test.js` verificam recuperação, múltiplos dispositivos, expiração/revogação, preservação do histórico, separação de contas e bloqueio fora do ambiente temporário. Testes não enviam e-mails reais.
