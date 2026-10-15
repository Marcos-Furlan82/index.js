# Plano de construção: planejador e publicador de posts no Instagram

> Versão 1. Consolidado a partir das consultas aos agentes `especialista-instagram`, `especialista-imagem` e `especialista-marketing`.
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

**Modo de acesso:**
- Enquanto as contas forem do próprio gestor, o **Standard Access** basta. O gestor só precisa estar cadastrado como tester ou admin do app, sem App Review.
- Para atender **contas de terceiros** (vender o sistema como SaaS), é preciso **Advanced Access**, o que exige **App Review e Business Verification**. Isso leva semanas, então convém começar cedo.

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

## 4. Arquitetura proposta

```
┌─────────────────────────────── Painel web (gestor) ──────────────────────────────┐
│ Onboarding · Manual de identidade · Plano/Calendário · Prévia e aprovação ·     │
│ Tarefas manuais · Relatórios · Propostas de ajuste                               │
└──────────────────────────────────────┬───────────────────────────────────────────┘
                                       │
┌──────────────────────────────────────▼───────────────────────────────────────────┐
│ API (backend)                                                                    │
│  ├─ Módulo Marca/Produto/Briefing        ├─ Módulo Estratégia e Plano             │
│  ├─ Módulo Identidade Visual             ├─ Módulo Produção (legenda + arte)      │
│  ├─ Módulo Aprovação                     ├─ Módulo Análise e Propostas            │
│  └─ Orquestrador de especialistas (Claude API)                                   │
└───────┬──────────────────┬──────────────────────┬──────────────────┬─────────────┘
        │                  │                      │                  │
  ┌─────▼─────┐   ┌────────▼────────┐   ┌─────────▼────────┐  ┌──────▼──────────┐
  │ Banco de  │   │ Fila e agendador│   │ Renderizador de  │  │ Armazenamento de│
  │ dados     │   │ (publicação,    │   │ artes (HTML/CSS  │  │ mídia (URL      │
  │           │   │ métricas, token)│   │ → PNG/JPEG)      │  │ pública)        │
  └───────────┘   └────────┬────────┘   └──────────────────┘  └─────────────────┘
                           │
                  ┌────────▼────────┐
                  │ Instagram API   │
                  │ (Meta)          │
                  └─────────────────┘
```

### Stack sugerida (a confirmar com o gestor)

| Camada | Sugestão | Por quê |
|---|---|---|
| Linguagem | **TypeScript (Node.js)** | Um só idioma no front e no back. O repositório já se chama `index.js`. |
| Web + API | Next.js | Painel e API no mesmo projeto, o que é simples para um MVP |
| Banco | PostgreSQL + Prisma | Relacional, com migrações versionadas |
| Fila/agendador | pg-boss (usa o próprio Postgres) | Evita um Redis no MVP. Dá para trocar por BullMQ depois. |
| Mídia | Armazenamento compatível com S3 (ex.: Cloudflare R2) | A Meta precisa baixar a mídia de uma URL pública |
| Artes | Templates HTML/CSS renderizados com Playwright → JPEG | Marca consistente, texto perfeito, resultado repetível |
| IA de texto e visão | **Claude API** (`@anthropic-ai/sdk`), modelo `claude-opus-5-5` | Planejamento, legendas e leitura das artes de referência (visão), com saídas estruturadas em JSON |
| IA de imagem (opcional) | Provedor a definir | Só fundos e ilustrações **sem texto e sem logo** |
| Segredos | Tokens criptografados no banco, com chave em variável de ambiente | Tokens da Meta nunca aparecem em logs |

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
2. **Arte:** o especialista de imagem escolhe o template e preenche os campos. O renderizador gera o JPEG nos tamanhos certos:
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
4. **Reels (vídeo):** é a produção mais complexa. No MVP, o gestor envia o vídeo e o sistema cuida da capa, da legenda e da publicação. A geração automática de vídeo fica para depois (fase 8).

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
| `ContaInstagram` | ig_user_id, token (criptografado), expiração, scopes concedidos, status |
| `Marca` | Nome, tom de voz, palavras proibidas |
| `ManualIdentidade` | Versão, JSON, versão legível, aprovado_em |
| `Referencia` | Arquivo, análise extraída |
| `Produto` | Ficha, nicho, provas, restrições |
| `Isca` | Descrição, formato, entrega, pronta? |
| `Estrategia` | Momento, objetivo, mix, pilares, versão, aprovada_em |
| `Plano` | Período, estratégia, status |
| `Post` | Formato, data/hora, pilar, gancho, legenda, alt_text, template, campos, mídias, status, ação manual, ids da Meta |
| `Aprovacao` | Alvo, decisão, comentário, autor, data |
| `Metrica` | Post ou conta, métrica, valor, coletada_em |
| `PropostaAjuste` | Diagnóstico, proposta, impacto esperado, status |
| `GeracaoIA` | Especialista, versão do prompt, entrada, saída, custo (para auditoria) |

---

## 8. Fases de construção

Cada fase é desenvolvida com o comando `/feature`, uma feature por vez, sempre com aprovação do gestor. O critério de "pronto" de cada fase inclui testes automatizados.

| Fase | Entrega | Critério de pronto |
|---|---|---|
| **0. Fundação** | Projeto TypeScript, banco, autenticação do gestor, fila, armazenamento de mídia, CI com lint e testes. **Em paralelo:** criar o app na Meta, cadastrar o gestor como tester e levar a conta para Business/Creator. | Gestor faz login no painel; o CI fica verde. |
| **1. Onboarding e briefing** | Cadastro de marca e produto, briefing guiado (12 perguntas + isca), upload de referências, geração da ficha do produto pelo especialista de produto. | O gestor completa o briefing e aprova a ficha do produto. |
| **2. Identidade visual** | Análise das referências por visão, especialista de identidade visual, manual em JSON e versão legível, editor e aprovação, versionamento. | Manual aprovado e salvo com versão. |
| **3. Estratégia e plano** | Diagnóstico do momento, playbooks de nicho, matriz da seção 6.2, encaixe da isca, geração do calendário com formatos, tela de calendário. | Plano de 4 semanas gerado e editável. |
| **4. Produção** | Templates HTML/CSS (6 iniciais), renderizador, geração de legendas, ganchos e alt text, validações automáticas e de compliance. | Cada item do plano tem arte e legenda válidas. |
| **5. Prévia e aprovação** | Simulação do feed e do grid, lote piloto, aprovação, edição e refação por post, feedback que ajusta o manual e as preferências. | Gestor aprova o piloto pela interface. |
| **6. Conexão e publicação** ⚠️ | OAuth do Instagram, armazenamento e renovação do token, agendador, publicação de imagem, carrossel e Stories, controle de limite, idempotência, tarefas manuais. **Antes de começar:** reconfirmar todos os itens ⚠️ com o `especialista-instagram`. | Post aprovado é publicado sozinho no horário; falhas avisam o gestor. |
| **7. Análise e propostas** | Coleta de insights, painel de KPIs, regras de ajuste, relatório semanal, propostas com aprovação que geram nova versão da estratégia. | Relatório semanal com propostas aprováveis. |
| **8. Piloto automático e expansão** | Modo automático com pausas de segurança, publicação de Reels a partir de vídeo enviado, mais templates, IA de imagem para fundos, palavra-chave → DM automática (novas permissões), multi-conta e App Review para terceiros. | Conta rodando 4 semanas no automático com o gestor só aprovando propostas. |

**MVP = fases 0 a 6:** uma conta do próprio gestor, imagem, carrossel e Stories de imagem, com aprovação da prévia. Fica de fora a App Review, porque a conta é do próprio gestor.

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
| Custo de IA | Prompts com cache, saídas estruturadas, custo registrado por geração em `GeracaoIA` |
| Conta nova sem dados de métricas | Usar metas de referência nas primeiras 4 semanas; demografia só a partir de 100 seguidores |

---

## 10. Decisões pendentes do gestor

1. **Uso:** o sistema é só para as suas contas, ou será vendido para terceiros (SaaS)? Isso define se é preciso App Review.
2. **Stack:** confirmar TypeScript/Next.js/PostgreSQL ou indicar outra preferência.
3. **Hospedagem:** onde o sistema vai rodar (ex.: Vercel + Neon/Supabase, Railway, VPS).
4. **IA de imagem:** usar ou não no MVP, e qual provedor.
5. **Orçamento mensal** de IA e infraestrutura.
6. **Reels:** no MVP, você vai gravar e enviar os vídeos?
7. **Janela de veto** no modo automático: quantas horas antes de publicar?

---

## 11. Próximos passos

1. O gestor responde às decisões da seção 10.
2. Fazer o merge do PR com os agentes e com este plano.
3. Começar a **fase 0** com `/feature fase 0 do plano de construção (docs/plano-de-construcao.md)`.
4. Em paralelo, o gestor cria a conta, converte para profissional, usa manualmente por 1 a 2 semanas e cria a conta de desenvolvedor na Meta.
