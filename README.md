# Planejador de Instagram

Sistema de planejamento e publicação de posts no Instagram. Este repositório está na **Fase 1 (Contas, onboarding e briefing)** do plano em [`docs/plano-de-construcao.md`](docs/plano-de-construcao.md).

Fase 1:

- várias contas, cada uma com marca, produtos (um principal) e isca (material gratuito);
- briefing em 5 etapas com salvamento automático (Negócio · Público e provas · Momento e meta · Isca e rotina · Referências visuais), retomando de onde parou;
- referências visuais (logo, artes, fontes) num bucket **privado** do R2, com validação do tipo real, limpeza de SVG e miniaturas;
- ficha do produto gerada pela Claude API num job, com **reserva de orçamento** antes da chamada e conciliação com o custo real; revisão bloco a bloco, edição (nova versão) e aprovação;
- cota mensal por conta (dentro do teto geral), alertas por conta, avisos no painel e manutenção diária (uploads abandonados, reservas órfãs).

Fase 0 (fundação):

- painel Next.js 16 (App Router) publicado no Netlify, com login do gestor;
- banco PostgreSQL (Neon) via Prisma 7 (client gerado + adapter `pg`);
- fila de jobs no Postgres, com Scheduled Function (agendador) e Background Function (executor);
- upload direto do navegador para o Cloudflare R2 (URL pré-assinada);
- envio de e-mail pelo Resend, sempre por job;
- registro de custo de IA e tela **Configurações → Orçamento** (teto de R$ 1.000, cotação, preços, alertas);
- CI no GitHub Actions com lint, tipos, testes unitários, testes de integração (Postgres real) e build.

## Requisitos

- Node 22 (veja `.nvmrc`) e pnpm 10 (`corepack enable` usa a versão do `packageManager`).
- PostgreSQL 16 local para desenvolvimento e testes (ou Docker: `docker run -p 5432:5432 -e POSTGRES_PASSWORD=postgres postgres:16`).

## Rodar localmente

```bash
pnpm install
cp .env.example .env              # preencha DATABASE_URL, DIRECT_URL, DATABASE_URL_TEST e JOBS_SECRET
pnpm db:migrate                   # aplica as migrations no banco de desenvolvimento
pnpm db:seed                      # cria a configuração global (teto R$ 1.000)
pnpm gestor:criar --email voce@exemplo.com --nome "Seu Nome"   # pede a senha sem eco (12+ caracteres)
pnpm dev                          # http://localhost:3000
```

O agendador do Netlify não roda localmente. Para executar os jobs vencidos uma vez: `pnpm jobs:rodar` (é assim que a ficha do produto é gerada em desenvolvimento, depois de clicar em "Gerar a ficha").

Em desenvolvimento, use `EMAIL_PROVEDOR=console` (o e-mail só aparece no log, sem o corpo). Sem as variáveis do R2, o teste de upload da tela Sistema mostra erro; o resto funciona.

### Scripts

| Script | O que faz |
|---|---|
| `pnpm dev` / `pnpm build` / `pnpm start` | Next.js (o build roda `prisma generate` antes) |
| `pnpm lint` | ESLint (flat config, zero avisos) |
| `pnpm typecheck` | `next typegen` + `tsc --noEmit` |
| `pnpm test:unit` | Testes unitários (`src/**/*.test.ts`), sem banco |
| `pnpm test:integracao` | Testes contra o Postgres de `DATABASE_URL_TEST` (o banco é **apagado** a cada teste). Inclui o empacotamento das funções do Netlify |
| `pnpm db:migrate` | Cria/aplica migrations em desenvolvimento |
| `pnpm db:migrate:deploy` | Aplica migrations pendentes (produção/CI) |
| `pnpm db:seed` | Seed idempotente |
| `pnpm gestor:criar` | Cria o gestor ou, com `--redefinir`, troca a senha e encerra as sessões |
| `pnpm jobs:rodar` | Executa os jobs vencidos uma vez (desenvolvimento) |
| `pnpm demo:dados` | Dados de demonstração no banco **local** (recusa `NODE_ENV=production` e bancos remotos) |

## Demonstração local

O script `scripts/demo-dados.ts` monta um ambiente de demonstração sem chamar a Claude API e sem R2:

- gestor demo **demo@exemplo.com** com a senha **demo-local-2026!** (só para ambiente local; está escrita no script);
- cotação (R$ 5,40) e preços **de exemplo** dos modelos;
- duas contas fictícias com briefing preenchido, isca e referências (imagens geradas na hora):
  - **Doce Ateliê** (curso de confeitaria, objetivo: contatos, isca pronta): referências concluídas, um produto secundário e a ficha do produto **aprovada**;
  - **Clínica Respira** (terapia online, objetivo: agenda cheia, isca sugerida): faltam artes nas referências e a ficha está **em revisão**, com uma pendência que impede aprovar ("garantido" sem prova);
- as fichas são geradas pelo job real com um cliente de IA **falso** (reserva, custo e aviso funcionam de verdade) e há alguns gastos de exemplo no mês.

```bash
pg_ctlcluster 16 main start        # se o Postgres local estiver parado
pnpm install
pnpm db:migrate:deploy             # banco de desenvolvimento do .env
pnpm demo:dados                    # pode rodar de novo: recria as contas demo
pnpm dev                           # http://localhost:3000 — entre com demo@exemplo.com
```

O script imprime os endereços de cada tela: contas, cada etapa do briefing (`/contas/<id>/briefing?etapa=1` a `5`), referências, ficha em revisão e aprovada (`/contas/<id>/produtos/<id>/ficha`), Orçamento com a divisão por conta (`/configuracoes/orcamento`) e Avisos (`/notificacoes`).

Sem as variáveis do R2 no `.env`, as imagens ficam em `.armazenamento-local/` (fora do git) e o painel as mostra pela rota `/api/dev/arquivo`, que **só existe em desenvolvimento** (responde 404 em produção e exige login). Com o R2 configurado, o script grava no bucket privado.

## Estrutura

```
prisma/                 schema, migrations e seed
prisma.config.ts        configuração do Prisma 7 (URL das migrations, seed)
netlify/functions/      despachar-jobs.mts (Scheduled) e executar-jobs-background.mts (Background)
scripts/                criar-gestor.ts, rodar-jobs.ts, demo-dados.ts (+ demo/)
src/proxy.ts            checagem otimista do cookie de sessão (Next 16: "proxy", antigo middleware)
src/app/                login, painel (Início, Contas, briefing, ficha, Avisos, Orçamento, Sistema) e /api
src/auth/               senha (scrypt), sessão, limite de tentativas, IP do cliente
src/contas/             contas, produtos, conta ativa (cookie só como padrão de navegação)
src/briefing/           perguntas e textos, esquemas zod, obrigatórios, sugestões de isca, autosave
src/especialistas/      produto/: prompt, esquema da ficha, regras, estimativa, job e revisão
src/ia/                 cliente da Claude API (config do modelo, erros, uso por modelo)
src/notificacoes/       avisos do painel
src/jobs/               fila, executor, despachante, agendamentos e handlers (ping, enviar-email,
                        manutencao-diaria, gerar-ficha-produto)
src/armazenamento/      R2 (áreas pública e privada), mídias, referências, tipo real, SVG, imagens, limpeza
src/email/              provedores (resend, console, memória) e modelos
src/custos/             cálculo de custo, registro e conciliação, reservas, orçamento e alertas
src/lib/                env (validação preguiçosa), db, log com redação, dinheiro, datas (fuso de SP)
tests/integracao/       testes com Postgres real
```

## Como a fila de jobs funciona

1. Quem precisa de trabalho em segundo plano chama `enfileirarJob({ tipo, payload, chaveIdempotencia? })`. O payload é validado pelo schema do tipo. Chave repetida devolve sempre o job existente (mesmo que tenha falhado); reabrir é explícito com `reenfileirarJob` (botão "Tentar de novo" na tela Sistema).
2. A Scheduled Function `despachar-jobs` roda a cada 2 minutos: recupera jobs travados e dispara até `min(vencidos, JOBS_PARALELISMO - ativos)` chamadas à Background Function, autenticadas por `JOBS_SECRET`.
3. A Background Function `executar-jobs-background` executa jobs em sequência por até 15 minutos. Ela só reivindica um job se sobrar tempo para o maior timeout dos tipos + 1 minuto. Cada tipo tem timeout (padrão 2 min, máximo 8 min). O maior hoje é o da ficha do produto (**6 min**): o executor só reivindica com 7 min livres, então cada invocação roda poucos jobs longos; mantenha `JOBS_PARALELISMO` em 2 ou mais.
4. Falha: nova tentativa com espera exponencial (30 s, 1 min, 2 min... até 1 h, ±20%), ou a espera pedida pelo erro (`ErroComEspera`, ex.: 429 com `retry-after`), se for maior. `ErroPermanente` ou tentativas esgotadas: `FALHOU`.
5. Todo dia (fuso de SP) o despacho garante o job `manutencao-diaria`: apaga uploads `PENDENTE` com mais de 24 h (objeto no bucket certo + linha, em lotes de 100), linhas `REJEITADA` com mais de 7 dias e expira reservas de orçamento órfãs.
6. Um job `EXECUTANDO` há mais de 20 minutos é considerado travado e volta para a fila (ou falha, se esgotou as tentativas).
7. Posse: só quem reivindicou (mesmo `tentativas` e `lockedAt`) consegue gravar o resultado. **Todo handler deve ser idempotente.**

Para criar um tipo novo: crie o handler em `src/jobs/handlers/` com `definirJob({ schema, executar, timeoutMs?, maxTentativas? })` e registre em `src/jobs/registro.ts`.

**Plano B (sem Background Functions no plano do Netlify):** trocar o corpo de `despachar-jobs` para chamar `executarLote({ orcamentoMs: 25_000 })` diretamente e reduzir o timeout dos tipos (a regra "maior timeout + 1 min" precisa caber no orçamento). Só serve para jobs curtos.

## Orçamento

- O custo de cada chamada de IA é registrado por `registrarCusto` (tokens, imagens, segundos de vídeo × tabela de preços × cotação), com o mês de referência no fuso de São Paulo.
- **Reserva antes de gastar:** o job chama `reservarOrcamento` com o custo **máximo** estimado (maior preço entre o modelo principal e os de fallback, prompt do sistema como escrita de cache e 2 × o limite de saída). A reserva é feita sob uma trava global do banco: 10 pedidos simultâneos com saldo para 3 resultam em exatamente 3 reservas. Depois da chamada, `registrarUsosEConciliar` grava o custo real (uma linha por modelo, inclusive o de fallback) e concilia a reserva na mesma transação. Se a chamada comprovadamente não foi cobrada (erro antes de a resposta começar, 4xx, 429, 529), a reserva é liberada; se não dá para saber, ela expira sozinha (validade = timeout do job + 2 min).
- `podeGastar(contaId, previsto)` (leitura para a tela) soma gasto + reservas ativas. Sem cotação ou sem preços cadastrados, a resposta é `orcamento_nao_configurado` (nada é gerado). Publicação nunca passa por essa checagem.
- Modelo sem preço: a geração fica `precoPendente` e a reserva `PENDENTE_PRECO` (o valor reservado continua contando). Ao cadastrar o preço, as gerações pendentes daquele modelo são recalculadas e as reservas conciliadas.
- **Divisão por conta:** cota mensal opcional por conta, dentro do teto geral (aviso se a soma das cotas passar do teto).
- Alertas de 50%, 80% e 100% (geral e de cada conta com cota) aparecem no painel e, se houver e-mail de notificação, são enviados uma única vez por mês.
- O seed **não** cadastra preços nem cotação: o gestor informa na tela, a partir das páginas de preços dos provedores.

## Configuração dos serviços

### Neon (banco)

1. Crie o projeto na região **AWS São Paulo (sa-east-1)**.
2. Copie as duas strings de conexão:
   - **pooled** (host com `-pooler`) → `DATABASE_URL`;
   - **direta** (sem `-pooler`) → `DIRECT_URL` (usada só por `prisma migrate`).
3. Recomendado: desative os deploy previews no Netlify ou use um branch do Neon para eles, para que um preview nunca escreva no banco de produção.

### Cloudflare R2 (mídia)

1. Crie o bucket.
2. Crie um token de API do R2 com **Object Read & Write restrito a esse bucket** → `R2_ACCESS_KEY_ID` e `R2_SECRET_ACCESS_KEY`. O ID da conta vai em `R2_ACCOUNT_ID`.
3. Conecte um **domínio próprio** ao bucket (acesso público) → `R2_PUBLIC_BASE_URL`. O subdomínio `r2.dev` tem limite de taxa e não serve para produção (a Meta precisa baixar as mídias).
4. Configure o **CORS** do bucket (Settings → CORS policy), trocando a origem pela URL do painel:

```json
[
  {
    "AllowedOrigins": ["https://seu-painel.netlify.app"],
    "AllowedMethods": ["PUT", "GET", "HEAD"],
    "AllowedHeaders": ["content-type"],
    "MaxAgeSeconds": 3600
  }
]
```

Uploads que ficarem `PENDENTE` (o navegador não terminou) são apagados pela manutenção diária.

#### Bucket privado (referências da marca)

1. Crie um **segundo bucket**, sem domínio público e sem acesso público (nem `r2.dev`) → `R2_BUCKET_PRIVADO`.
2. Dê ao mesmo token acesso de leitura e escrita aos **dois** buckets.
3. CORS do bucket privado (só o envio direto do navegador; a leitura é por URL assinada em `<img>`, que não precisa de CORS):

```json
[
  {
    "AllowedOrigins": ["https://seu-painel.netlify.app"],
    "AllowedMethods": ["PUT"],
    "AllowedHeaders": ["content-type"],
    "MaxAgeSeconds": 3600
  }
]
```

Todas as referências (inclusive artes de outras marcas, usadas só para entender o estilo) ficam neste bucket. O painel gera uma URL GET assinada de 5 minutos a cada exibição; o SVG original é sempre baixado como arquivo, nunca aberto no navegador.

### Anthropic (Claude API)

1. Crie uma chave de API → `ANTHROPIC_API_KEY`. No console da Anthropic, configure um **limite de gasto mensal** um pouco acima do teto do sistema.
2. O modelo de texto é `claude-opus-5-5` (mude com `IA_MODELO_TEXTO`, sem mexer no código). `IA_FALLBACK=default` liga o fallback no servidor quando o modelo recusa um pedido (cabeçalho beta `server-side-fallback-2026-07-01`); `desligado` é a chave de emergência.
3. Em **Configurações → Orçamento**, cadastre (provedor `anthropic`) os preços do modelo principal **e** dos modelos de fallback conhecidos, senão a ficha não é gerada ("Cadastre o preço de: ..."):

| Modelo | Entrada | Saída | Cache leitura | Cache escrita (5 min) |
|---|---|---|---|---|
| `claude-opus-5-5` | 4 | 20 | 0,20 | 5 |
| `claude-opus-5` | 5 | 25 | 0,50 | 6,25 |
| `claude-opus-4-8` | confira | confira | confira | confira |

Valores em US$ por milhão de tokens; confira sempre na página de preços da Anthropic antes de cadastrar.

### Resend (e-mail)

1. Adicione e verifique o seu domínio (registros DNS de SPF/DKIM indicados pelo Resend).
2. Crie uma API key com permissão só de envio → `RESEND_API_KEY`.
3. `EMAIL_PROVEDOR=resend` e `EMAIL_REMETENTE="Planejador <avisos@seudominio.com.br>"`.

### Netlify

1. Importe o repositório. O `netlify.toml` já define o build (`pnpm build`, publicação `.next`, Node 22) e o diretório das funções. O runtime de Next.js (`@netlify/plugin-nextjs`) é instalado automaticamente.
2. Cadastre as variáveis do `.env.example` em **Site configuration → Environment variables** (escopos: Builds, Functions e Runtime). `DATABASE_URL_TEST` não vai para o Netlify.
3. Em produção o build roda `pnpm db:migrate:deploy && pnpm build` (contexto `production` do `netlify.toml`). Previews só fazem build. As migrations devem ser sempre aditivas.
4. Background Functions exigem um plano que as inclua. Sem elas, veja o plano B acima.

## Primeiro deploy

1. Configure Neon, R2, Resend e as variáveis no Netlify (seções acima).
2. Faça o deploy de produção (a migration inicial é aplicada no build).
3. Rode o seed e crie o gestor apontando para o Neon, da sua máquina (use a conexão direta):

```bash
DATABASE_URL="<DIRECT_URL do Neon>" DIRECT_URL="<DIRECT_URL do Neon>" pnpm db:seed
DATABASE_URL="<DIRECT_URL do Neon>" pnpm gestor:criar --email voce@exemplo.com --nome "Seu Nome"
```

### Checklist pós-deploy

- [ ] `https://<site>/api/saude` responde `{"ok":true,"banco":"ok"}`.
- [ ] Login no painel publicado com o gestor criado. Sair e entrar de novo.
- [ ] **Configurações → Orçamento:** cadastrar a cotação do dólar e os preços dos modelos usados (sem isso, `podeGastar` responde `orcamento_nao_configurado`). Conferir o teto (R$ 1.000) e o e-mail de notificação.
- [ ] **Sistema → Enfileirar ping:** em até ~2 minutos o job aparece como **Concluído** (prova que o agendador e a Background Function rodam).
- [ ] **Sistema → Enviar e-mail de teste:** o e-mail chega na caixa de entrada (não no spam).
- [ ] **Sistema → Teste de upload:** enviar uma imagem; o link público abre.
- [ ] Upload de vídeo de até 300 MB (fase 1, pela biblioteca de mídia; nesta fase o limite é validado por teste automatizado).
- [ ] Nos logs da função `executar-jobs-background` não aparecem segredos (tokens, cookies, URLs assinadas).
- [ ] Configurar limites de gasto nos painéis da Anthropic e do Google, um pouco acima do teto do sistema.

Fase 1:

- [ ] Variáveis novas no Netlify: `R2_BUCKET_PRIVADO`, `ANTHROPIC_API_KEY`, `IA_FALLBACK` (e `IA_MODELO_TEXTO` só se for trocar o modelo).
- [ ] Bucket privado criado sem acesso público e com o CORS acima; abrir a URL de um objeto sem assinatura dá erro.
- [ ] Preços cadastrados para o modelo principal e os de fallback (tabela acima).
- [ ] Criar uma conta, preencher o briefing (sair no meio e voltar: continua de onde parou; o indicador mostra "Salvo agora").
- [ ] Referências: enviar um **SVG com `<script>`** (aparece o aviso "Removemos partes do SVG..." e o arquivo baixado não tem o script), um **PNG de logo** com fundo transparente, uma arte com menos de 1080 px (recusada) e a mesma arte duas vezes (recusada).
- [ ] Gerar a ficha de verdade: o aviso "Ficha do produto pronta" aparece em até ~4 min, o custo aparece em Orçamento (por conta) e não sobra reserva "em andamento".
- [ ] Revisar, editar um bloco (nova versão), marcar os blocos deduzidos e aprovar.
- [ ] Nos logs das funções não aparecem respostas do briefing, instruções ou textos da IA (só códigos como `ia:recusa`, `saida_invalida`).
- [ ] No dia seguinte, o job `manutencao-diaria` aparece como concluído em Sistema.
- [ ] **Critério de pronto da fase:** 2 contas com a ficha do produto principal aprovada e zero pendências que impedem aprovar.

## Pontos a confirmar no primeiro deploy

Itens que não puderam ser confirmados sem uma conta Netlify/Cloudflare/Resend real. Em cada um, a opção mais segura já foi escolhida:

1. **Agendamento:** `*/2 * * * *` (UTC). Scheduled Functions só rodam em deploys publicados de produção e têm limite de ~30 s; o despacho espera no máximo 5 s por disparo. Confirmar o intervalo mínimo permitido no plano.
2. **Background Functions:** detectadas pelo sufixo `-background` (o manifesto gerado por `netlify build --offline` marca `invocationMode: "background"`). O `@netlify/functions` 6 também aceita `config.background: true`; mantivemos o sufixo. Confirmar que o plano inclui Background Functions (senão, plano B).
3. **URL do site no agendador:** usa `context.site.url`, depois `URL` (variável do Netlify) e por fim `APP_URL`. Confirmar nos logs de `despachar-jobs` que os disparos recebem 202.
4. **IP do cliente:** em produção só `x-nf-client-connection-ip` é usado no limite de tentativas de login (sem ele, todos caem no balde "desconhecido", também limitado). Confirmar que o header chega nas server actions.
5. **Proxy do Next:** o runtime do Netlify (v5.16.x) empacota o `src/proxy.ts` como edge function (`___netlify-edge-handler-node-middleware`). No `netlify build --offline` local, só esse empacotamento falhou, por falta de acesso à rede. Confirmar que `/` sem cookie redireciona para `/login`.
6. **R2:** cliente S3 com endpoint da conta, região `auto`, **path-style** e checksums só quando exigidos (o SDK v3 adiciona CRC32 por padrão, o que quebraria o PUT do navegador). A URL assina `content-type` e `content-length`. Confirmar o primeiro upload pelo navegador (CORS) e que o R2 rejeita um PUT com tamanho diferente.
7. **Resend:** remetente de domínio verificado; `idempotencyKey` = id do job evita e-mail duplicado em novas tentativas.
8. **pnpm no Netlify:** a versão vem do campo `packageManager` (corepack). Só `@prisma/engines` e `esbuild` rodam scripts de instalação (`pnpm-workspace.yaml`); conferir no log do build que não há aviso de build script ignorado que importe.
9. **Job `netlify-build` do CI:** roda `netlify build --offline` sem site vinculado e confere o manifesto das funções. Está como não obrigatório (depende de downloads do Netlify); torne obrigatório depois de vê-lo verde.
10. **Fallback da Claude API:** confirmar em `/v1/models` (com o cabeçalho beta) o `allowed_fallback_models` do modelo e manter `MODELOS_FALLBACK_CONHECIDOS` (`src/ia/config.ts`) igual. Não está documentado como a saída estruturada se comporta quando o fallback assume no meio da resposta; o código tenta o texto inteiro e, se não validar, só o trecho depois do último bloco `fallback`.
11. **Uso parcial em erro no meio do stream:** o custo registrado vem do último estado da mensagem recebido pelo SDK (`currentMessage`); sem ele, a reserva fica até expirar. Conferir nos primeiros erros reais.
12. **sharp e jsdom no Netlify:** ficam fora do bundle do Next (`serverExternalPackages`) e nunca entram no pacote das funções (há teste). Conferir o primeiro upload de referência em produção (SVG e PNG).

## Segurança

- Sem cadastro público: o gestor é criado por script. Senhas com scrypt (N=2^17).
- Sessão opaca: cookie `__Host-sessao` (HttpOnly, Secure, SameSite=Lax, 30 dias); o banco guarda só o sha256 do token. Sair apaga a sessão.
- Bloqueio de 15 minutos após 10 falhas por IP; por e-mail, só atraso progressivo (até 8 s), para que ninguém tranque o gestor fora. Emergência: `pnpm gestor:criar --email ... --redefinir`.
- `exigirSessao()` no layout do painel e no início de toda server action.
- Logs passam por redação (chaves como token, secret, senha, apiKey, authorization, cookie e URLs pré-assinadas).
- Dados do briefing nunca vão para logs nem para `Job.erro`: os erros do job da ficha têm mensagens fixas (códigos). Provas sem autorização de uso não são enviadas à IA.
- Os dados do usuário vão para a IA entre tags e marcados como dados (nunca instruções). Links vindos do usuário ou da IA só viram link se forem http(s), com `rel="noopener noreferrer"`.
- Referências da marca em bucket privado; tipo real conferido pelos bytes; SVG limpo antes de ser guardado; imagens com mais de 50 megapixels recusadas.
- Toda action confere que a conta existe e não está arquivada e que o produto (ou a ficha) pertence à conta.
- Nenhum segredo no repositório; `.env` está no `.gitignore`.
