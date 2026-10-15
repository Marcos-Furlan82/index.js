# Plano de construção: planejador e publicador de posts no Instagram

> Versão 2. Consolidado a partir das consultas aos agentes `especialista-instagram`, `especialista-imagem` e `especialista-marketing`, com as decisões do gestor (seção 10).
> Itens marcados com ⚠️ precisam ser reconfirmados na documentação oficial da Meta antes de virar código.

---

## 1. Visão geral

O sistema recebe o acesso a uma conta de Instagram e entende o negócio, o público, o momento da empresa e a identidade visual. Com o apoio de um time de especialistas de IA, ele monta um plano de publicação, produz as artes e as legendas, publica automaticamente e analisa os resultados. O **gestor** (humano) aprova a prévia e todas as mudanças de estratégia.

### Princípios

1. **O humano decide, a máquina executa.** Nada é publicado sem uma prévia aprovada, e nenhuma mudança de estratégia é aplicada sem aprovação.
2. **Nunca guardar usuário e senha do Instagram.** A conta é conectada por OAuth oficial da Meta (veja a seção 3).
3. **A marca é sagrada.** Logo, cores e textos das artes vêm sempre de templates baseados no manual de identidade visual. A IA de imagem só gera elementos de apoio.
4. **Regras explícitas, IA para o resto.** Matrizes de estratégia, limites da API e regras de nicho ficam em código e configuração. A IA trabalha dentro dessas regras.
5. **Tudo rastreável.** Cada post guarda com qual briefing, versão do manual, prompt e aprovação foi gerado.

---

## 2. O que cada parte faz

| Quem | Responsabilidade |
|---|---|
| **Gestor (humano)** | Cria a conta, converte para conta profissional e autoriza o app via OAuth. Responde ao briefing, envia artes de referência e informa a isca. Aprova a prévia, o plano e as propostas de ajuste. Faz manualmente o que a API não permite. |
| **Sistema** | Faz o onboarding, diagnostica o momento da conta, cria o manual de identidade visual, planeja, produz, agenda, publica, coleta métricas e propõe ajustes. |
| **Especialistas de IA (dentro do produto)** | Marketing, comunicação, planejamento, viralização, Instagram, imagem, identidade visual, **nicho** e **produto**. Veja a seção 5. |

---

## 3. Conexão com o Instagram (correção importante)

O gestor **não deve passar login e senha**. Automatizar o login com senha viola os termos da Meta e costuma levar ao bloqueio da conta. O fluxo correto é este:

1. O gestor cria a conta e a converte para **conta profissional (Business ou Creator)**.
2. Criamos um **app no Meta for Developers** usando a **Instagram API with Instagram Login**. Esse caminho não exige Página do Facebook.
3. Scopes: `instagram_business_basic` e `instagram_business_content_publish`. Depois, `instagram_business_manage_comments` para a fase de comentários.
4. O gestor clica em "Conectar Instagram" no sistema e autoriza.
5. O sistema troca o token curto (cerca de 1h) por um **token longo (60 dias)**, guarda **criptografado** e **renova automaticamente** antes de vencer.

**Modo de acesso (decidido: uso próprio, com várias contas):**
- O sistema é só do gestor, então o **Standard Access** basta, sem App Review.
- **Cada conta de Instagram** precisa ser adicionada como **tester do Instagram** no app da Meta, e o convite precisa ser aceito dentro da própria conta (Configurações → Apps e sites). Só depois disso a conta pode ser conectada via OAuth.
- O sistema deve ter um passo a passo guiado para isso, na tela "Adicionar conta".
- ⚠️ Confirmar se existe um limite de testers por app em modo de desenvolvimento.
- Se um dia o sistema for oferecido a terceiros, aí será preciso **Advanced Access**, com App Review e Business Verification.

**Várias contas:**
- Cada conta tem sua própria marca, briefing, produtos, manual de identidade visual, estratégia, token e limite de publicação.
- O painel tem um seletor de conta e uma visão geral com o calendário de todas as contas.

**Limitações da API que o produto precisa tratar:**

| Tema | Situação |
|---|---|
| Formatos publicáveis | Imagem, carrossel (até 10 itens ⚠️), Reels e Stories (imagem ou vídeo) |
| **Não** publicável via API | Stickers, enquetes e links em Stories; tag de parceria paga; marcação de produtos; filtros; música da biblioteca do Instagram ⚠️. Esses casos viram **tarefa manual** para o gestor, com lembrete. |
| Mídia | Precisa estar em **URL pública**. Imagem somente **JPEG**, até 8 MB, proporção de 4:5 a 1.91:1 ⚠️ |
| Fluxo | Criar container → aguardar `FINISHED` → `media_publish`. O container expira em 24h. |
| Limite | 50 ou 100 posts por 24h ⚠️. Consultar `content_publishing_limit` antes de publicar. |
| Agendamento | **Não existe agendamento nativo.** O sistema precisa de agendador próprio. |
| Métricas | `reach`, `views`, `likes`, `comments`, `saved`, `shares` e `total_interactions`. Atraso de até 48h. `impressions` e `plays` foram descontinuadas em 2025. Demografia só aparece a partir de 100 seguidores. |

**Conta nova:** recomendar ao gestor que use a conta manualmente por 1 a 2 semanas (perfil completo, bio, alguns posts) e que a automação comece com 1 post por dia, subindo aos poucos.

---

## 4. Arquitetura (hospedagem no Netlify)

```
┌──────────────────────────── Painel web (Next.js no Netlify) ─────────────────────┐
│ Contas · Onboarding · Manual de identidade · Plano/Calendário · Prévia e        │
│ aprovação · Estúdio de vídeo · Tarefas manuais · Relatórios · Propostas         │
└──────────────────────────────────────┬───────────────────────────────────────────┘
                                       │
┌──────────────────────────────────────▼───────────────────────────────────────────┐
│ API (rotas Next.js = funções síncronas, até ~30s)                                │
│  Marca/Produto/Briefing · Identidade Visual · Estratégia e Plano · Produção ·    │
│  Aprovação · Análise e Propostas · Orquestrador de especialistas (Claude API)    │
└──────┬─────────────────────────────┬─────────────────────────────────────────────┘
       │ grava jobs                  │ upload direto do navegador (URL pré-assinada)
┌──────▼──────────────┐     ┌────────▼──────────────────┐
│ PostgreSQL (Neon)   │     │ Cloudflare R2             │
│ dados + tabela jobs │     │ mídia com URL pública     │
└──────▲──────────────┘     └────────▲──────────────────┘
       │                             │
┌──────┴─────────────────────────────┴─────────────────────────────────────────────┐
│ Trabalho em segundo plano (Netlify)                                              │
│  • Scheduled Function (cron a cada 1–5 min): despacha jobs vencidos              │
│  • Background Functions (até 15 min): gerar plano, gerar imagens, publicar,      │
│    acompanhar status do container, coletar insights, renovar tokens              │
└──────┬───────────────┬──────────────────┬──────────────────┬─────────────────────┘
       │               │                  │                  │
 ┌─────▼──────┐ ┌──────▼───────┐ ┌────────▼────────┐ ┌───────▼──────────────┐
 │ Claude API │ │ Gemini API   │ │ Render de vídeo │ │ Instagram API (Meta) │
 │ texto,     │ │ imagens e    │ │ (serviço        │ │ publicação e métricas│
 │ estratégia,│ │ clipes de    │ │ externo)        │ │                      │
 │ visão      │ │ vídeo        │ │                 │ │                      │
 └────────────┘ └──────────────┘ └─────────────────┘ └──────────────────────┘
```

### O que o Netlify muda no plano

| Limite do Netlify | Consequência no projeto |
|---|---|
| Funções síncronas têm até cerca de 30s e corpo de até 6 MB ⚠️ | Tarefas longas (gerar plano, imagens, vídeo, publicar) viram **jobs** e rodam em **Background Functions** (até 15 min). O painel acompanha o status. |
| Não existe processo rodando o tempo todo (sem worker fixo) | No lugar do pg-boss entra uma **tabela `jobs` no Postgres** (com `FOR UPDATE SKIP LOCKED`). Uma **Scheduled Function** roda a cada 1 a 5 minutos e dispara os jobs vencidos. ⚠️ Confirmar o intervalo mínimo de cron no plano do Netlify. |
| Upload de vídeo de até 300 MB não cabe numa função | O navegador envia o arquivo **direto para o R2** com URL pré-assinada. A função só registra o arquivo. |
| Chromium/Playwright é pesado demais para funções | As artes são renderizadas com **Satori + resvg** (templates em JSX → PNG → JPEG com `sharp`). É leve e roda em função. |
| Renderizar vídeo (ffmpeg/Remotion) não é viável em função | A montagem dos vídeos fica num **serviço externo de renderização por templates** (seção 6.6). |
| Background Functions podem não estar disponíveis em plano de teste ⚠️ | Conferir o plano do Netlify antes da fase 6. |

### Stack definida

| Camada | Escolha | Por quê |
|---|---|---|
| Linguagem | **TypeScript (Node.js)** | Decidido pelo gestor |
| Web + API | **Next.js** no **Netlify** | Decidido pelo gestor |
| Banco | **PostgreSQL** no **Neon** (é o que o Netlify DB usa), com Prisma | Serverless, com integração nativa ao Netlify |
| Jobs | Tabela `jobs` no Postgres + Netlify Scheduled e Background Functions | Funciona sem worker fixo |
| Mídia | **Cloudflare R2** (bucket público para a Meta baixar) | Sem custo de saída de dados e com upload direto do navegador |
| Artes | **Satori + resvg + sharp** | Templates da marca renderizados dentro de funções |
| IA de texto e visão | **Claude API** (`@anthropic-ai/sdk`), modelo `claude-opus-5-5` | Estratégia, legendas, roteiros e análise das referências por visão, com saídas em JSON validado |
| IA de imagem | **Gemini API** (modelos de imagem do Google) ⚠️ confirmar o modelo atual | Bom em manter consistência a partir de várias imagens de referência (fotos reais do produto, artes do gestor) |
| IA de vídeo (clipes) | **Gemini API** (Veo), com a mesma chave ⚠️ confirmar preço por segundo | Clipes curtos de apoio, de 4 a 8s, para os vídeos |
| Montagem de vídeo | Serviço de render por templates (ex.: Shotstack ou Creatomate) ⚠️ escolher na fase 8 | Monta o Reels com a marca: cenas, texto animado, logo, legendas e trilha |
| Segredos | Variáveis de ambiente no Netlify; tokens da Meta criptografados no banco | Nada de chave no código ou nos logs |

### Chaves de API necessárias

| Chave | Para quê | Onde obter | Quando |
|---|---|---|---|
| `ANTHROPIC_API_KEY` | Todos os especialistas: estratégia, plano, legendas, roteiros, análise das referências, relatórios | console.anthropic.com | Fase 1 |
| `GEMINI_API_KEY` | Geração e edição de imagens e clipes de vídeo | Google AI Studio (aistudio.google.com) | Fase 4 |
| `META_APP_ID` / `META_APP_SECRET` | Conectar as contas de Instagram (OAuth) | developers.facebook.com | Fase 6 |
| Chave do serviço de render de vídeo | Montar os Reels | Site do provedor escolhido | Fase 8 |
| `DATABASE_URL`, chaves do R2, `ENCRYPTION_KEY` | Infraestrutura | Neon, Cloudflare e geração local | Fase 0 |

Configure limites de gasto nos painéis da Anthropic e do Google desde o início.

---

## 5. Especialistas dentro do produto

Os agentes em `.claude/agents/` servem para **construir** o sistema. O produto também tem especialistas, que são prompts versionados executados pela Claude API, cada um com **entrada e saída em JSON validado**.

O orquestrador segue uma **sequência fixa, controlada por código**, e não um agente livre. Isso torna cada etapa previsível, auditável e mais barata.

| Especialista (produto) | Recebe | Entrega |
|---|---|---|
| **Produto** (gerado no onboarding) | Respostas do briefing | Ficha do produto: promessa, diferenciais, provas, objeções, o que pode e o que não pode ser prometido |
| **Nicho** (playbooks) | Nicho e ficha do produto | Pilares, tipos de prova, CTAs e **regras de compliance** do nicho |
| **Marketing** | Briefing, nicho e momento | Objetivo dos 90 dias, funil, KPIs e encaixe da isca |
| **Identidade visual** | Logo, artes de referência e briefing | Manual de identidade visual, em versão legível e em JSON (seção 6.3) |
| **Planejamento** | Estratégia e capacidade de postagem | Plano editorial: datas, formatos, pilares e temas |
| **Viralização** | Cada pauta | Ganchos, com nota de potencial de 1 a 10 |
| **Comunicação** | Pauta, ganchos, tom de voz e público | Legenda, CTA, texto da arte e texto alternativo |
| **Imagem** | Pauta e manual | Escolha do template e conteúdo de cada campo da arte |
| **Instagram** | Post pronto | Checagem de formato, hashtags e limites da API, e lista do que precisa ser feito manualmente |

**Comunicação + nicho:** a legenda é gerada pelo especialista de comunicação **dentro das regras do playbook do nicho e da ficha do produto**, como pediu o gestor.

---

## 6. Fluxos principais

### 6.1 Onboarding (por conta)

1. **Conectar o Instagram** (OAuth).
2. **Briefing guiado.** As 12 perguntas essenciais:
   1. O que você vende, preço e como a pessoa compra
   2. Nicho (lista: produto físico, produto digital, SaaS, serviço local, mentoria, terapia/saúde, curso, outro)
   3. Quem compra: perfil, dor, desejo e principal objeção
   4. Diferencial em uma frase
   5. Provas: depoimentos, números, cases, certificações
   6. Situação da conta (o sistema também lê da API)
   7. A marca já é conhecida fora do Instagram?
   8. Objetivo em 90 dias: seguidores, leads, vendas ou agenda
   9. **Isca ou bônus** (pergunta obrigatória, veja 6.4)
   10. Frequência possível e quem aparece em vídeo
   11. Tom de voz, palavras proibidas e restrições legais ou do conselho profissional
   12. Datas importantes e sazonalidade
3. **Envio de referências:** logo, fontes (se houver) e de 3 a 10 artes que representam o que o gestor espera ver na página.
4. O sistema gera a **ficha do produto** e o gestor revisa.

### 6.2 Diagnóstico do momento

O sistema classifica a conta combinando dados da API (seguidores, data do último post, alcance médio) com as respostas do briefing:

| Momento | Como é detectado | Objetivo nas semanas 1 a 8 | Mix semanal | Pilares |
|---|---|---|---|---|
| **Começando do zero** | Conta nova e marca desconhecida | Alcance e posicionamento | 60% Reels, 30% carrossel, 10% post; Stories diários | Educação 40%, autoridade 25%, prova 15%, oferta 20% (a partir da semana 4) |
| **Marca conhecida, conta fraca** | Marca conhecida e conta pequena ou nova | Trazer a base existente e converter | 40% Reels, 40% carrossel, 20% Stories | Prova 35%, educação 30%, bastidores 15%, oferta 20% |
| **Conta a retomar** | Último post há mais de 60 dias | Reativar e sinalizar a volta | Semana 1: post de retorno e caixinha de perguntas; depois 50% Reels, 30% carrossel, 20% interação | Volta 15%, educação 35%, interação 25%, prova 10%, oferta 15% |
| **Ativa em crescimento** | Postagem regular e alcance estável | Converter e escalar | 40% Reels, 30% carrossel, 30% Stories de venda | Oferta 30%, prova 30%, educação 25%, comunidade 15% |

O gestor **confirma ou corrige** o diagnóstico. Os números ficam em configuração e podem ser ajustados.

### 6.3 Manual de identidade visual

1. Um modelo com visão analisa as referências:
   - cores dominantes e proporção entre elas
   - tipografia
   - densidade de texto
   - margens
   - estilo de foto
   - elementos gráficos
   - uso do logo
   - ritmo do grid
2. O especialista de identidade visual gera um **rascunho do manual**, em versão legível e em JSON:
   ```json
   {
     "versao": "1.0",
     "paleta": { "primaria": "#...", "secundaria": "#...", "neutras": ["#..."], "pares_permitidos": [["texto", "fundo"]], "proporcao": "60/30/10" },
     "tipografia": { "titulo": { "familia": "", "peso": 700, "min_px": 64, "max_chars": 40 }, "corpo": { "familia": "", "min_px": 32 }, "licenca": "OFL" },
     "logo": { "arquivos": { "positivo": "", "negativo": "" }, "area_respiro_pct": 10, "min_px": 80, "posicoes": ["inf-dir"] },
     "grid": { "margem_px": 80, "padrao_perfil": "alternar foto/tipográfico" },
     "estilo_foto": { "luz": "", "enquadramento": "", "tratamento": "", "proibido": [] },
     "templates": ["capa_carrossel", "slide_texto", "citacao", "produto", "capa_reels", "story"],
     "tom_visual": [], "do": [], "dont": []
   }
   ```
3. O gestor valida **campo por campo**.
4. O manual é **versionado**, e cada arte registra com qual versão foi gerada.
5. Se as referências forem inconsistentes entre si, o sistema avisa e pede uma escolha em vez de misturar estilos.

### 6.4 Isca (pergunta obrigatória)

- Em **todo** plano novo, e a cada novo ciclo de planejamento, o sistema pergunta: *"Existe alguma isca ou bônus para oferecer?"*
- **Se houver**, o sistema registra: o que é, formato, como a pessoa recebe e se já está pronta.
- **Se não houver**, o sistema sugere iscas típicas do nicho: checklist, aula de 15 minutos, cupom de primeira compra, diagnóstico gratuito.
- **No calendário:**
  - Em conta nova, a isca entra na semana 3 ou 4. Nos demais momentos, desde a semana 1.
  - Ritmo semanal: 1 post de isca, 1 conteúdo que desperta a dor que a isca resolve e 2 lembretes em Stories.
  - Também: Destaque fixo e 1 post fixado no perfil.
- **Sequência:** isca → 3 a 5 dias de nutrição → oferta.
- **Entrega:** "link na bio" no MVP. A entrega automática por palavra-chave via DM fica para a fase 8, porque exige outras permissões da Meta.

### 6.5 Plano de publicação

O plano é um calendário. Cada item tem:
- data e horário
- **formato**: post único, carrossel, Reels ou Stories
- pilar, objetivo e tema
- gancho, roteiro ou texto dos slides, legenda e CTA
- template e campos da arte, e texto alternativo
- se tem isca
- se precisa de **ação manual** (por exemplo, enquete em Stories)

O gestor aprova o plano como um todo e pode editar itens individuais.

### 6.6 Produção

1. **Legenda:** comunicação + nicho + produto + gancho da viralização.
2. **Imagem de base**, por ordem de preferência:
   1. **foto real** enviada pelo gestor (produto, equipe, espaço);
   2. **foto real editada pela IA de imagem**, por exemplo o produto colocado num cenário, usando as fotos reais como referência;
   3. **imagem gerada pela IA** (fundo, cenário, ilustração).

   Em todos os casos, a IA **nunca gera texto, logo, pessoas reais ou rostos de "clientes"**.
3. **Arte:** o especialista de imagem escolhe o template e preenche os campos. O renderizador (Satori) aplica texto, logo e cores do manual e gera o JPEG nos tamanhos certos:
   - Feed e carrossel: 1080×1350 (4:5)
   - Stories e Reels: 1080×1920 (9:16)
3. **Validações automáticas** antes de liberar para aprovação:
   - proporção, resolução, JPEG, sRGB e até 8 MB
   - contraste de texto pelo menos 4.5:1 (WCAG)
   - fonte mínima e limite de caracteres por campo
   - nada fora da área segura de Stories e Reels, nem cortado no recorte 3:4 do grid
   - só cores da paleta, logo com respiro e mesma proporção em todos os slides do carrossel
   - texto alternativo preenchido e licença registrada para cada ativo
   - **regras de compliance do nicho** (por exemplo, em saúde: nada de promessa de cura e registro profissional visível)
4. **Vídeos (Reels e Stories em vídeo).** Há dois caminhos.

   **a) Upload de vídeo pelo gestor**
   - O arquivo vai direto para o R2.
   - O sistema valida formato, duração, tamanho e proporção 9:16 ⚠️.
   - Depois cria a capa no template da marca, a legenda e publica.
   - Esse caminho entra no MVP (fase 6).

   **b) Estúdio de vídeos curtos (criação automática, de 7 a 30s)**
   1. O especialista de viralização e o de comunicação escrevem o **roteiro em cenas**: gancho nos 2 primeiros segundos, desenvolvimento e CTA.
   2. Cada cena usa um destes materiais:
      - foto ou vídeo do gestor;
      - imagem gerada ou editada pela Gemini;
      - **clipe curto gerado pela Veo**, de 4 a 8s, só para cenas sem texto, sem logo e sem pessoas reais;
      - **slide animado** a partir de um carrossel já aprovado.
   3. O **serviço de render** monta o vídeo com o template da marca: texto animado dentro da área segura, logo, **legendas na tela**, transições e trilha.
   4. A trilha precisa ser **licenciada ou sem direitos**, porque a música da biblioteca do Instagram não está disponível pela API. O sistema mantém uma biblioteca de trilhas com o registro da licença de cada uma.
   5. **Narração por voz sintética** fica como opção futura.
   6. O vídeo gerado passa pela mesma prévia e aprovação que as artes.
   7. O custo estimado aparece **antes** de gerar, porque vídeo de IA é cobrado por segundo.

   Formato mais barato para começar: **carrossel animado → Reels**. Ele reaproveita artes já aprovadas e não exige vídeo de IA.

### 6.7 Prévia e aprovação (piloto → automático)

1. **Prévia inicial:** antes da primeira publicação, o sistema mostra um **lote piloto** (por exemplo, a primeira semana):
   - simulação do feed e do grid do perfil
   - cada arte com a legenda
   - de 1 a 3 variações de estilo, para o gestor escolher a direção
2. O gestor **aprova, edita ou pede refação**, com comentário por post. O feedback vira ajuste no manual ou nas preferências.
3. **Modo automático:** depois da aprovação do piloto, o gestor pode ligar o "piloto automático". O sistema então cria e publica sozinho, **dentro da estratégia e do manual aprovados**.
4. **O automático pausa sozinho e volta a pedir aprovação quando:**
   - a estratégia muda (por uma proposta aprovada da seção 6.9)
   - o manual muda de versão
   - entra um tema sensível ou uma oferta nova
   - uma validação falha
5. O gestor pode **pausar a qualquer momento**. Também pode configurar uma **janela de veto**, por exemplo: posts ficam visíveis 24h antes de publicar.

### 6.8 Publicação

O agendador:
1. sobe a mídia para uma URL pública;
2. cria o container perto do horário (ele expira em 24h);
3. aguarda o status `FINISHED`;
4. chama `media_publish` no horário marcado.

Também:
- respeita o limite diário consultando `content_publishing_limit`;
- tenta de novo com backoff e com **idempotência**, para nunca publicar o mesmo post duas vezes.

Status do post: `rascunho → em_revisao → aprovado → agendado → publicando → publicado | falhou | manual_pendente`.

Se a publicação falhar, o sistema avisa o gestor. Se o token for revogado, pausa tudo e pede nova conexão.

### 6.9 Análise e propostas estratégicas

- **Coleta:** um job diário puxa os insights. Os dados são considerados estáveis só depois de 48h.
- **KPIs por objetivo:**
  - alcance de não seguidores nos Reels
  - (salvamentos + compartilhamentos) / alcance
  - cliques e DMs / alcance
  - conversão da isca
  - vendas ou agendamentos, informados pelo gestor
- **Regras (média de 3 semanas, comparada com a própria conta):**
  - Não seguidores abaixo de 20% nos Reels → propor ganchos novos e temas mais amplos.
  - Salvamentos/alcance abaixo de 1% → mais carrosséis do tipo checklist ou passo a passo.
  - Alcance bom e leads abaixo de 0,5% → rever a promessa da isca e o CTA.
  - Leads bons e vendas baixas → mais prova e quebra de objeções.
  - Perda de seguidores maior que o ganho → menos oferta, mais educação.
  - Formato com o dobro da média em 3 posts → aumentar o peso dele no mix.
  - Frequência entregue abaixo de 70% → propor reduzir o plano.
- Depois de 4 semanas, as metas são **recalibradas** pela média da própria conta.
- **Relatório semanal:** os especialistas interpretam os números e geram **propostas de ajuste** com justificativa e impacto esperado. O gestor **aprova ou rejeita cada uma**. Uma proposta aprovada gera uma nova versão da estratégia e do plano.

---

## 7. Modelo de dados (principais entidades)

| Entidade | Campos principais |
|---|---|
| `Workspace` | Gestor e usuários |
| `ContaInstagram` | ig_user_id, @usuário, token (criptografado), expiração, scopes concedidos, status de tester, status |
| `Marca` | 1 por conta: nome, tom de voz, palavras proibidas |
| `ManualIdentidade` | Versão, JSON, versão legível, aprovado_em |
| `Referencia` | Arquivo, análise extraída |
| `Produto` | Ficha, nicho, provas, restrições |
| `Isca` | Descrição, formato, entrega, pronta? |
| `Estrategia` | Momento, objetivo, mix, pilares, versão, aprovada_em |
| `Plano` | Período, estratégia, status |
| `Post` | Conta, formato, data/hora, pilar, gancho, legenda, alt_text, template, campos, mídias, status, ação manual, ids da Meta |
| `Midia` | Origem (upload, Gemini, Veo, render), arquivo no R2, dimensões, duração, licença, custo |
| `RoteiroVideo` | Cenas (tipo, material, texto, duração), trilha, status do render |
| `Trilha` | Arquivo, licença, origem |
| `Job` | Tipo, conta, payload, executar_em, tentativas, status, erro, chave de idempotência |
| `Aprovacao` | Alvo, decisão, comentário, autor, data |
| `Metrica` | Post ou conta, métrica, valor, coletada_em |
| `PropostaAjuste` | Diagnóstico, proposta, impacto esperado, status |
| `GeracaoIA` | Especialista, versão do prompt, entrada, saída, custo (para auditoria) |

---

## 8. Fases de construção

Cada fase é desenvolvida com o comando `/feature`, uma feature por vez, sempre com aprovação do gestor. O critério de "pronto" de cada fase inclui testes automatizados.

| Fase | Entrega | Critério de pronto |
|---|---|---|
| **0. Fundação** | Projeto Next.js + TypeScript publicado no Netlify, Neon + Prisma, login do gestor, tabela de jobs com Scheduled e Background Functions, R2 com upload pré-assinado, CI com lint e testes. **Em paralelo:** criar o app na Meta e levar as contas para Business/Creator. | Gestor faz login no painel publicado; um job de teste roda pelo agendador; o CI fica verde. |
| **1. Contas, onboarding e briefing** | Cadastro de **várias contas** (cada uma com sua marca), seletor de conta, briefing guiado (12 perguntas + isca), upload de referências, geração da ficha do produto pelo especialista de produto. | O gestor cria 2 contas, completa o briefing e aprova a ficha do produto. |
| **2. Identidade visual** | Análise das referências por visão, especialista de identidade visual, manual em JSON e versão legível, editor e aprovação, versionamento. | Manual aprovado e salvo com versão. |
| **3. Estratégia e plano** | Diagnóstico do momento, playbooks de nicho, matriz da seção 6.2, encaixe da isca, geração do calendário com formatos, tela de calendário. | Plano de 4 semanas gerado e editável. |
| **4. Produção** | Templates em JSX/Satori (6 iniciais), renderizador, biblioteca de mídia, **Gemini para gerar e editar imagens** a partir de referências, legendas, ganchos e alt text, validações automáticas e de compliance. | Cada item do plano tem arte e legenda válidas. |
| **5. Prévia e aprovação** | Simulação do feed e do grid, lote piloto, aprovação, edição e refação por post, feedback que ajusta o manual e as preferências. | Gestor aprova o piloto pela interface. |
| **6. Conexão e publicação** ⚠️ | Passo a passo de tester + OAuth por conta, armazenamento e renovação do token, publicação de imagem, carrossel e Stories, **upload e publicação de vídeos (Reels)** com capa da marca, controle de limite por conta, idempotência, tarefas manuais. **Antes de começar:** reconfirmar todos os itens ⚠️ com o `especialista-instagram`. | Post e vídeo aprovados são publicados sozinhos no horário, em mais de uma conta; falhas avisam o gestor. |
| **7. Análise e propostas** | Coleta de insights, painel de KPIs por conta e consolidado, regras de ajuste, relatório semanal, propostas com aprovação que geram nova versão da estratégia. | Relatório semanal com propostas aprováveis. |
| **8. Estúdio de vídeos curtos** | Roteiro em cenas, carrossel animado → Reels, clipes com Veo, montagem por templates no serviço de render, legendas na tela, biblioteca de trilhas licenciadas, estimativa de custo antes de gerar. | Reels de 15s gerado, aprovado e publicado com a identidade da marca. |
| **9. Piloto automático e expansão** | Modo automático com pausas de segurança, mais templates, palavra-chave → DM automática (novas permissões), narração por voz. | Conta rodando 4 semanas no automático com o gestor só aprovando propostas. |

**MVP = fases 0 a 6:** várias contas próprias; post, carrossel e Stories com imagem e com IA de imagem; upload e publicação de vídeos; aprovação da prévia. Sem App Review, porque todas as contas são do gestor.

---

## 9. Riscos e cuidados

| Risco | Mitigação |
|---|---|
| Bloqueio da conta por automação | OAuth oficial, conta aquecida manualmente, ritmo gradual, nada de rajadas |
| Mudanças na API da Meta | Módulo de integração isolado, especificações em configuração, revisão periódica pelo `especialista-instagram` |
| Token expirado ou revogado | Renovação automática com antecedência, alerta e pausa segura |
| Arte "com cara de IA" ou fora da marca | Templates como base; IA de imagem só para fundos, sem texto, logo ou rostos |
| Direitos autorais | Só fontes com licença comercial, imagens próprias ou licenciadas, licença registrada por ativo, música já embutida no vídeo |
| Compliance de nicho (saúde, terapia, finanças, cursos) | Regras configuráveis por nicho e bloqueio automático de padrões proibidos. As regras de conselhos profissionais mudam (o CFM, por exemplo, revisou a publicidade médica em 2023), então devem ser **revisadas por um humano ou profissional da área** antes de valer. |
| Promessas enganosas | Ficha do produto com o que "pode e não pode prometer", aplicada em toda legenda; aviso de "resultados variam" em infoprodutos |
| Custo de IA (principalmente vídeo, cobrado por segundo) | Prompts com cache, saídas estruturadas, custo registrado por geração, **estimativa antes de gerar vídeo**, limites de gasto nos painéis dos provedores e um teto mensal configurável no sistema |
| Limites do Netlify (tempo, tamanho, cron) | Tarefas longas como jobs em Background Functions, upload direto para o R2, confirmar limites do plano contratado ⚠️ |
| Conta nova sem dados de métricas | Usar metas de referência nas primeiras 4 semanas; demografia só a partir de 100 seguidores |

---

## 10. Decisões

**Tomadas:**
1. Uso **próprio**, com **várias contas** de Instagram. Standard Access; cada conta entra como tester.
2. Stack **TypeScript + Next.js + PostgreSQL**.
3. Hospedagem no **Netlify**, com Neon e Cloudflare R2.
4. **IA de imagem no MVP**, com a Gemini API.
5. **Vídeos:** upload no MVP (fase 6) e estúdio de vídeos curtos na fase 8.

**Pendentes:**
1. **Orçamento mensal** de IA e infraestrutura, para definir limites de gasto.
2. **Janela de veto** no modo automático: quantas horas antes de publicar?
3. **Serviço de render de vídeo** (Shotstack, Creatomate ou outro), a decidir na fase 8 comparando preço e templates.

---

## 11. Próximos passos

1. Fazer o merge do PR com os agentes e com este plano.
2. Começar a **fase 0** com `/feature fase 0 do plano de construção (docs/plano-de-construcao.md)`.
3. **Em paralelo, o gestor:**
   - cria as contas e converte para profissional;
   - usa cada conta manualmente por 1 a 2 semanas;
   - cria a conta de desenvolvedor na Meta;
   - cria contas no Netlify, Neon e Cloudflare;
   - gera as chaves da Anthropic e da Gemini, com limite de gasto.
