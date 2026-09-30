# Igor Barber Club · aplicativo

Projeto independente em React Native, Expo SDK 57 e TypeScript. Todas as configurações, imagens copiadas, dependências e saídas ficam em `app-mobile/`. Não importa arquivos do site, não usa seu banco e não altera seu servidor.

## Executar

Requer Node.js 24 ou superior. Abra um terminal **nesta pasta**:

```powershell
cd app-mobile
npm.cmd ci
npm.cmd start
```

O `npm.cmd` evita o bloqueio de scripts do PowerShell. Em macOS/Linux, use `npm`.

- Celular: abra o QR code com uma versão do Expo Go compatível com SDK 57, na mesma rede.
- Navegador: `npm.cmd run web`.
- Emulador Android já configurado: `npm.cmd run android`.
- Simulador iOS: `npm run ios`, em macOS com Xcode.

Documentação: [criação e templates Expo](https://docs.expo.dev/more/create-expo/) e [Expo Go](https://expo.dev/go).

## Funcionalidades

- Home com a chamada da landing page, diferenciais, atalhos e próximo agendamento local.
- Serviços com filtros, preços em reais e sessões de 40 minutos, conforme o pedido.
- Agendamento em três etapas: serviço, data/horário e revisão com nome.
- Persistência de perfil, agendamentos e cancelamentos usando AsyncStorage.
- Validação de horários passados e conflitos entre agendamentos deste dispositivo.
- Galeria com fotos reais copiadas do projeto, filtros e ampliação.
- Perfil local, apresentação de Igor Borges, região de Campo Grande/RJ no mapa e Instagram.
- Tema #0D0D0D, azul #365FFF e fontes DM Sans / Barlow Condensed, incluídas no bundle.

## Limites desta versão inicial

**O agendamento é uma demonstração local.** Nenhum horário é enviado ou confirmado com a barbearia. A interface informa isso antes e depois da confirmação. O botão do Instagram permite combinar uma reserva real.

Os horários são ilustrativos: segunda a sábado, blocos de 40 minutos a partir de 09h e 13h, até 17h, em uma janela de 21 dias e no fuso de Brasília. Não refletem a agenda real de Igor. Valores e serviços seguem a solicitação, independentemente do catálogo do site.

O perfil não é uma conta autenticada. Não há login, sincronização entre aparelhos, pagamentos ou notificações. O mapa abre apenas a região; o endereço exato deve ser confirmado no Instagram, como no site. As imagens hero e ambiente são as imagens conceituais já presentes na landing page; as cinco fotos da galeria vêm de `server/portfolio-photos`, copiadas para este projeto.

A próxima etapa para produção é integrar uma API autorizada de disponibilidade e reservas, com autenticação e proteção contra conflitos no servidor. O ponto de troca da persistência está em `src/state/ClubContext.tsx`. Identificadores de pacote em `app.json` são iniciais e precisam ser confirmados antes de publicar. Nenhum APK/IPA foi publicado.

## Estrutura

```text
App.tsx                  fontes, navegação e área segura
src/components/          componentes compartilhados
src/screens/             Home, Services, Booking, Gallery, Account
src/data/                catálogo e galeria
src/lib/booking.ts       datas, validação e regras locais
src/state/               persistência independente
src/theme.ts             cores, tipografia e estilos
assets/images/           cópias independentes das imagens do site
tests/                   testes das regras e fluxo no navegador
scripts/                 servidor de teste e auditoria do isolamento
```

## Verificações

```powershell
npm.cmd run typecheck
npm.cmd test
npm.cmd run build:web
npx.cmd playwright install chromium
npm.cmd run test:e2e
npm.cmd run check:site
```

Os testes de navegador usam a exportação web em `dist/` e a porta local 8097. Capturas ficam em `test-results/`. A interface nativa ainda precisa de validação em aparelhos Android/iOS.

`site-integrity.json` registra os hashes SHA-256 dos 118 arquivos preexistentes no início deste trabalho, exceto `.git` e `node_modules`. `check:site` confere alterações, remoções e arquivos novos fora do aplicativo. Alterações futuras intencionais no site farão essa auditoria apontar diferenças; o snapshot não deve ser sobrescrito para esconder alterações.
