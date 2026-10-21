# Jeiel Tattoo

Repositório: [joehadest/jeieltattoorifas](https://github.com/joehadest/jeieltattoorifas).

Site de rifas em português, com tema preto, branco e dourado, feito com React, TypeScript e Vite. A identidade foi adaptada à arte enviada por Jeiel Tattoo.

## Campanha Jeiel Tattoo

A demonstração usa a arte em `public/images/rifa-tattoo-jeiel.jpeg`, com tattoo de R$ 1.000 ou R$ 500 no Pix, 100 números de 01 a 100 e R$ 30 por número. O WhatsApp foi mantido exatamente como enviado: +55 84 9954-0402. O Pix transcrito da arte é `jeiellimeira36@gmail.com` e a cidade informada é Alto do Rodrigues/RN.

O ano do sorteio de 29/12 e o nome do recebedor do Pix ainda precisam ser confirmados. A prévia não recebe pagamentos. A campanha real deve permanecer em rascunho até completar a data, o regulamento e os dados de pagamento.

Para atualizar o banco já criado pelo SQL Editor, execute **somente** `supabase/atualizar-jeiel-tattoo.sql`. Esse arquivo adiciona a numeração configurável, a personalização visual e o armazenamento de imagens, preserva campanhas existentes e prepara o rascunho. Dados de configuração já preenchidos não são substituídos. Ele pode ser reaplicado sem restaurar o visual ou sobrescrever o rascunho editado. Para gerar novamente o arquivo combinado, execute `npm.cmd run db:prepare`.

## Executar

Requer Node.js 22.12 ou superior.

```powershell
npm.cmd install
npm.cmd run dev
```

Abra o endereço exibido pelo Vite. No Windows, use `npm.cmd` se a política do PowerShell bloquear `npm.ps1`.

- `/`: campanhas, filtros, busca, instruções e perguntas frequentes.
- `/campanha/<id>`: seleção de números, disponibilidade e regulamento.
- `/conta`: cadastro, login, recuperação de senha, perfil e números do participante.
- `/resultados`: resultados públicos dos sorteios.
- `/admin`: indicadores e reservas recentes.
- `/admin/campanhas`: criar, editar e pausar campanhas.
- `/admin/pedidos`: conferir e confirmar pagamentos ou cancelar reservas.
- `/admin/sorteios`: conferir os números elegíveis, realizar e consultar o sorteio.
- `/admin/aparencia`: logo, cores, fontes, imagens, textos e organização do site, com prévia ao vivo.
- `/admin/configuracoes`: nome do site, Pix, recebedor, cidade e WhatsApp.

Sem as variáveis do Supabase, o projeto abre em **demonstração local**. As campanhas são exemplos e as reservas ficam no `localStorage`. O painel de demonstração é acessível sem login e não deve receber dados pessoais ou pagamentos reais. Os dados locais não são enviados ao Supabase ao conectá-lo.

Para ver o visual com campanhas de exemplo mesmo com o Supabase configurado, execute `npm.cmd run dev:demo` e abra `http://127.0.0.1:5174`. O modo demo usa um ambiente separado e não grava no Supabase. Com o banco real vazio, o site apresenta o estado sem campanhas até o administrador criar e ativar a primeira.

## Personalizar pelo painel

Entre em **Personalizar site** (`/admin/aparencia`). O editor permite alterar:

- Logo, nome, tamanho da marca e ícone do navegador.
- Cores do fundo, superfícies, textos, bordas e botões; fontes e arredondamento.
- Textos do cabeçalho, destaque, campanhas, instruções, dúvidas, rodapé, termos, página da campanha e pop-up do Pix.
- Imagem do destaque, enquadramento e campanha em evidência.
- Perguntas frequentes e passos, incluindo adicionar, remover e reordenar; benefícios com inclusão e remoção de frases.
- Ordem e visibilidade das seções da página inicial.
- Título e descrição da página no navegador.

A prévia de computador ou celular usa a própria página pública e acompanha as alterações antes de salvar. Ela pode mostrar campanhas em rascunho para conferir a composição e não cria reservas. **Salvar alterações** aplica o visual ao site; **Descartar alterações** recupera a versão salva. **Restaurar visual padrão** carrega o tema original na prévia e ainda exige salvar para aplicá-lo.

Se a prévia não abrir após uma recarga do painel, use **Recarregar prévia**. Esse botão reinicia somente a visualização e preserva as alterações ainda não salvas no editor.

Imagens podem ser enviadas pelo painel ou informadas por endereço HTTPS. No Supabase, os arquivos PNG, JPG, WebP e AVIF de até 5 MB ficam no bucket público `site-assets`; somente administradores podem enviar arquivos. Use esse espaço para imagens públicas da marca e das campanhas. Cada envio recebe um endereço novo, sem substituir imagens já usadas. Remover uma imagem do editor retira sua referência da página, mas preserva o arquivo no armazenamento.

Na demonstração, as imagens ficam apenas no navegador, com limite de 1 MB por arquivo e espaço total limitado pelo `localStorage`. O salvamento visual preserva os dados de Pix e WhatsApp, gerenciados em **Configurações**. Conteúdo, preço, números e regulamento de cada rifa ficam em **Campanhas**.

## Integrar ao Supabase

1. Em um banco novo, execute os arquivos de `supabase/migrations/` em ordem, começando por `202610200001_initial.sql`. O SQL cria tabelas, políticas RLS, funções de reserva e confirmação. Não executa sorteios nem publica campanhas.
2. Em Authentication → Users, crie seu usuário administrador. Copie o UUID e execute no SQL Editor:

```sql
insert into public.admin_users(user_id) values ('UUID-DO-USUARIO');
```

3. Copie `.env.example` para `.env.local` e preencha com a URL e a chave **pública** `anon`/`publishable` do Supabase:

```dotenv
VITE_SUPABASE_URL=https://SEU-PROJETO.supabase.co
VITE_SUPABASE_ANON_KEY=SUA-CHAVE-PUBLICA
```

4. Reinicie o Vite. Entre em `/admin` com o e-mail e a senha do usuário criado. Configure Pix e WhatsApp, crie uma campanha com data e regulamento e ative-a.

As variáveis `VITE_` são públicas e entram no JavaScript do navegador. **Nunca use nelas a senha do PostgreSQL, `DATABASE_URL`, a chave `service_role` ou uma chave secreta.**

### Preparar o banco usando `postgres`

Alternativamente ao SQL Editor, defina `DATABASE_URL` no `.env` ou no `.env.local` e rode:

```powershell
npm.cmd run db:check
npm.cmd run db:sync
```

`db:check` verifica a conexão e a estrutura sem alterar dados. `db:sync` cria a estrutura quando o banco está vazio ou atualiza o esquema existente, configura o armazenamento e cadastra a Rifa Tattoo como rascunho com os dados reais da arte. A identidade inicial preta e dourada fica gravada no banco. O comando preserva configurações e campanhas já editadas e não cria participantes, reservas ou pagamentos de demonstração.

Toda a sincronização ocorre em uma transação, com bloqueio para evitar duas atualizações simultâneas. Se o banco tiver somente parte das tabelas esperadas ou ocorrer um erro, as alterações da execução são revertidas. A senha não é exibida no terminal e não entra no site. Os dois arquivos de ambiente são carregados, com preferência pelo `.env.local` para valores repetidos.

Para criar somente a estrutura em um projeto novo, sem cadastrar a campanha, existe também:

```powershell
npm.cmd run db:setup
```

O script usa `postgres` apenas no Node.js. Ele exige TLS e recusa executar se as tabelas principais já existirem. Caracteres especiais na senha devem ser codificados na URL, por exemplo `@` como `%40`. A conexão direta do Supabase pode exigir IPv6; se necessário, use a conexão Session Pooler fornecida no painel do projeto. A URL do banco não é suficiente para o cliente web: ele também precisa da URL e chave pública do Supabase.

## Fluxo de pagamento

1. Cliente seleciona um número; o pop-up mostra o acesso à conta e os dados de Pix. Ele entra ou cria sua conta antes de reservar. Pode fechar para escolher mais números ou selecionar cinco aleatórios.
2. Ao confirmar a reserva, os números ficam bloqueados por **30 minutos**. O preço é calculado no banco; a chave única dos bilhetes e o bloqueio transacional da campanha impedem a duplicidade.
3. O pop-up gera o QR Code e Pix copia e cola com o valor. O cliente pode copiar a chave ou o código completo.
4. “Enviar comprovante no WhatsApp” abre uma conversa com código, nome, campanha, números e valor. O cliente precisa anexar o comprovante manualmente.
5. O administrador verifica o recebimento e confirma no painel. Abrir o WhatsApp ou copiar o Pix não confirma o pagamento.
6. Reservas expiradas liberam os números e não podem ser confirmadas; pagamento recebido após expiração precisa de atendimento pelo organizador antes de uma nova reserva.

“Meus números” consulta os pedidos da conta autenticada, em qualquer dispositivo. Reservas antigas ainda sem proprietário podem ser vinculadas usando o UUID e o token aleatório que já estavam neste navegador. A vinculação invalida o token antigo e não usa telefone ou e-mail como prova de propriedade. Cada cliente consulta somente seus pedidos; o administrador mantém acesso às reservas para conferir os pagamentos. O endpoint público de disponibilidade retorna somente números, status e prazo.

## Contas dos participantes

As migrações `202610200004_customer_accounts.sql` e `202610200005_draws.sql` já estão incluídas no SQL combinado e em `db:sync`. Novas reservas exigem login e recebem `customer_id` da sessão validada pelo banco; esse campo não é escolhido pelo navegador. `customer_profiles` usa RLS para permitir que cada usuário leia e atualize apenas seu perfil. `get_account_orders` retorna somente suas reservas, inclusive os dados da campanha necessários para consultar uma participação pausada.

Cadastro, login, confirmação e recuperação de senha usam Supabase Auth. As senhas não são armazenadas em tabelas da aplicação. Configure **Authentication → Emails → SMTP Settings** para entregar mensagens de confirmação e recuperação aos clientes. O envio padrão do Supabase é limitado e não substitui um SMTP configurado para operação pública. A confirmação por e-mail permanece habilitada conforme a configuração do projeto.

No projeto atual, o domínio `jeieltattoo.webpulseservicos.com` foi verificado no Resend com três registros DNS na Vercel. O Supabase está com SMTP ativo em `smtp.resend.com:465`, usuário `resend`, remetente `noreply@jeieltattoo.webpulseservicos.com` e nome `Jeiel Tattoo`. A chave foi inserida diretamente pelo responsável no Supabase e tem permissão de envio no Resend; ela não faz parte do código nem das variáveis públicas. Em 20/10/2026, um único e-mail de recuperação solicitado pelo painel do Supabase recebeu o status **Delivered** no Resend. O teste validou o envio SMTP, sem alterar a senha nem concluir o fluxo de recuperação ou criar uma conta nova.

Em **Authentication → URL Configuration**, configure o endereço do site e permita os retornos `/conta` e `/conta/redefinir-senha` na origem publicada. Para a prévia real local, foram configurados `http://127.0.0.1:5173`, `http://127.0.0.1:5173/conta` e `http://127.0.0.1:5173/conta/redefinir-senha`. Ao publicar, substitua a URL principal e inclua os retornos do domínio definitivo. Não use curingas amplos em produção.

O endereço previsto para a publicação na Vercel é `https://jeieltattoo.webpulseservicos.com`. Após publicar e validar o HTTPS, configure essa URL principal e os retornos exatos `https://jeieltattoo.webpulseservicos.com/conta` e `https://jeieltattoo.webpulseservicos.com/conta/redefinir-senha`. Os registros de e-mail não substituem a conexão do subdomínio ao projeto na Vercel; essa conexão deve ser configurada na publicação, inclusive porque os registros específicos de e-mail substituem a resolução por wildcard nesse subdomínio.

Referências: [senhas e recuperação no Supabase](https://supabase.com/docs/guides/auth/passwords), [URLs de retorno](https://supabase.com/docs/guides/auth/redirect-urls).

## Sorteio no site

O administrador prepara o sorteio em `/admin/sorteios` e confirma digitando o nome da campanha. O servidor exige a data cadastrada já alcançada no horário de Brasília, regulamento, ao menos um número pago e nenhuma reserva pendente ainda válida. A operação não é automática: o organizador precisa conferir os pagamentos e acionar o sorteio.

`admin_draw_campaign` trava a campanha durante a seleção, usa aleatoriedade UUID v4 do PostgreSQL e amostragem por rejeição para evitar viés de módulo. Todos os números pagos têm a mesma chance, independentemente de quem os comprou. A campanha é encerrada e o resultado é gravado na mesma transação. O banco impede novo sorteio, mudanças no resultado e reabertura ou edição da campanha sorteada.

O registro guarda os números elegíveis ordenados, o SHA-256 desse conjunto, a amostra e a posição selecionada, o método, a data e o administrador responsável. A consulta pública mostra o número vencedor, o nome abreviado e os dados do registro, sem telefone, e-mail ou identificadores privados do pedido. Esse registro permite conferir o conjunto e a seleção armazenados; não é uma prova de aleatoriedade verificável por um serviço independente nem impede alterações por um proprietário com acesso administrativo direto ao banco.

O resultado aparece na campanha, em `/resultados` e na área do participante. Os testes de interface com reserva, confirmação e sorteio são feitos em modo `qa`, na porta 5175, com dados locais e identificação de demonstração. Os modos `demo` e `qa` ignoram a conexão Supabase, mesmo se houver variáveis reais no ambiente.

## Verificação e publicação

O acompanhamento financeiro fica em `/admin/pagamentos`: filtros por campanha, status, busca e período da reserva no horário de Brasília, totais brutos, detalhes e exportação CSV. O CSV protege campos de participantes contra execução como fórmulas em planilhas. Cancelar ou confirmar mantém a confirmação explícita e as validações do banco: apenas administrador, reserva pendente dentro do prazo e campanha ainda sem sorteio.

A migração `202610210006_payment_tracking.sql`, incluída no SQL combinado, adiciona `order_events` com leitura restrita ao administrador e eventos que não podem ser editados ou apagados pelas rotas da aplicação. As novas reservas congelam chave Pix, recebedor, cidade e WhatsApp em `payment_snapshot`. Assim, alterações posteriores nas configurações não trocam o destino de um pedido aberto. Pedidos anteriores mantêm os dados que já possuem, sem inventar datas ou eventos históricos. `paid_at` é a data da **confirmação pelo organizador**, não uma prova de crédito no banco.

O checkout consulta o pedido autenticado a cada 8 segundos enquanto estiver pendente e a página estiver visível, ao retornar para a página e pelo botão “Verificar status”. Para ao encontrar um estado final. As consultas exigem a conta proprietária e respeitam RLS. Ao expirar ou cancelar, os botões Pix deixam de ser exibidos e o cliente é orientado a falar com o organizador caso tenha pago. Os números não são atribuídos novamente por um pagamento tardio.

**Pix automático ainda não integrado.** Em 21/10/2026 foi escolhida a Efí como candidata para avaliação. Não há credenciais, conta conectada, cobrança dinâmica ou webhook Efí neste projeto. O fluxo atual continua com conferência manual. A aceitação desta campanha deve ser confirmada diretamente com a Efí; capacidade técnica da API não garante aprovação da atividade. O Asaas foi descartado nesta avaliação porque sua lista oficial inclui rifas e sorteios entre as atividades não atendidas.

Para avançar com a Efí, o titular deve consultar o [atendimento oficial](https://sejaefi.com.br/central-de-ajuda/api) sobre o formato real da campanha, os documentos exigidos, a conta adequada e as tarifas. Após a aprovação, a [documentação de credenciais](https://dev.efipay.com.br/docs/api-pix/credenciais/) orienta a criação da aplicação, separação de homologação/produção e certificado. Credenciais e certificados devem permanecer no servidor, fora de variáveis `VITE_`, banco público, GitHub e chat. A próxima implementação deverá criar cobrança com `txid` estável por pedido, consultar a API para validar o recebimento, deduplicar notificações e tratar pagamentos duplicados ou após o prazo sem substituir o dono dos números. O recebimento de [webhooks Efí](https://dev.efipay.com.br/docs/api-pix/webhooks/) exige definir e testar a autenticação do servidor; o site estático atual não recebe essas notificações.

Referências da avaliação: [cobranças imediatas Efí](https://dev.efipay.com.br/docs/api-pix/cobrancas-imediatas/), [termos Efí Empresas, seção 13](https://sejaefi.com.br/termos-e-contratos/termos-e-condicoes-de-uso-modalidade-empresas), [atividades não atendidas no Asaas](https://central.ajuda.asaas.com/hc/pt-br/articles/54012368446491-Quais-atividades-econ%C3%B4micas-n%C3%A3o-s%C3%A3o-aceitas-no-Asaas).

```powershell
npm.cmd test
npm.cmd run build
```

Para hospedagem estática, publique `dist/` e configure fallback de rotas para `index.html`. Defina as duas variáveis públicas do Supabase no ambiente de build. `public/_redirects` já inclui o fallback para hospedagens compatíveis (Netlify/Cloudflare Pages). A chave e a senha do banco ficam fora da hospedagem estática.

As regras do banco e os testes locais precisam também ser validados no projeto Supabase de destino. O SQL não inclui proteção externa contra automação de reservas; para uma operação pública, adicione limitação de requisições e verificação de bot em uma Edge Function antes de expor a reserva em escala.

## Referências pesquisadas

- [Rifa Digital](https://rifa.digital/): página da campanha, cotas, Pix e painel de gestão.
- [Rifando Vip](https://www.rifando.vip/): personalização e acompanhamento de campanhas.
- [Rifeme](https://www.rifeme.com.br/): catálogo de campanhas com categorias e apresentação dos prêmios.

Interface própria inspirada nesses padrões de uso. Fotos ilustrativas via [Unsplash](https://unsplash.com/), com alternativa local em SVG caso a imagem não carregue. Nome, prêmios, imagens, regulamentos e textos de privacidade devem ser definidos para a operação final.
