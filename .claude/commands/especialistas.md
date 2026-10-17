---
description: Consulta o time de especialistas (marketing, comunicação, planejamento, viralização, Instagram, imagem) e consolida as recomendações
argument-hint: <pergunta, ideia de conteúdo ou feature do sistema>
---
Consulte o time de especialistas sobre: $ARGUMENTS

1. **Escolher**: decida quais especialistas são relevantes para o assunto. Os disponíveis são `especialista-marketing`, `especialista-comunicacao`, `especialista-planejamento`, `especialista-viralizacao`, `especialista-instagram`, `especialista-imagem`, `especialista-identidade-visual` e qualquer agente `produto-*` que exista em `.claude/agents/`. Não chame quem não tem nada a acrescentar. Diga quais vai chamar e por quê.
2. **Consultar**: chame os especialistas escolhidos em paralelo, passando a pergunta completa e o contexto que você já tem.
3. **Confrontar**: se houver recomendações conflitantes (por exemplo, viralização × tom de voz da marca), mande o conflito para os especialistas envolvidos e peça uma posição conjunta. Faça no máximo 1 rodada.
4. **Consolidar**: me entregue:
   - as recomendações principais, em ordem de prioridade
   - os pontos em que os especialistas concordam
   - os conflitos que restaram e a sua sugestão de decisão
   - quem disse o quê, de forma resumida
