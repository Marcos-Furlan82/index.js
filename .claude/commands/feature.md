---
description: Planeja (especialistas + arquiteto + crítico), pede aprovação e implementa uma feature
argument-hint: <descrição da feature>
---
Desenvolva a feature: $ARGUMENTS

Siga este fluxo com os subagentes do projeto:

1. **Consultar especialistas**: se a feature envolver regras de negócio de marketing, conteúdo, Instagram ou mídia, consulte primeiro os especialistas relevantes (`especialista-*` e `produto-*`) em paralelo. Pergunte o que a feature precisa ter para ser útil, quais regras e restrições ela deve respeitar e quais erros evitar. Qualquer feature que integre com a API do Instagram exige consultar o `especialista-instagram`. Se a feature for puramente técnica, pule este passo e diga isso.
2. **Planejar**: chame o agente `arquiteto` com a descrição da feature e o resumo das recomendações dos especialistas, para propor um plano.
3. **Revisar**: passe o plano completo para o agente `critico`, junto com as recomendações dos especialistas, para que ele confira se o plano as respeita.
4. **Debater**: se o veredito do `critico` for REVISAR, devolva o plano e as objeções ao `arquiteto` para ajustar, e mande a nova versão de volta ao `critico`. Faça no máximo 2 rodadas.
5. **Aprovar**: mostre para mim o plano final, um resumo das recomendações dos especialistas e do debate, e as objeções que ficaram sem resolver. **Pare e espere minha aprovação.** Não escreva código antes disso.
6. **Implementar**: depois que eu aprovar, chame o agente `implementador` com o plano aprovado.
7. **Relatar**: me mostre o resumo do `implementador` (arquivos alterados e resultado dos testes).
