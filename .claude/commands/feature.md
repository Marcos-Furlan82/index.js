---
description: Planeja (arquiteto + crítico), pede aprovação e implementa uma feature
argument-hint: <descrição da feature>
---
Desenvolva a feature: $ARGUMENTS

Siga este fluxo com os subagentes do projeto:

1. **Planejar**: chame o agente `arquiteto` com a descrição da feature para propor um plano.
2. **Revisar**: passe o plano completo para o agente `critico`.
3. **Debater**: se o veredito do `critico` for REVISAR, devolva o plano e as objeções ao `arquiteto` para ajustar, e mande a nova versão de volta ao `critico`. Faça no máximo 2 rodadas.
4. **Aprovar**: mostre para mim o plano final, um resumo do debate e as objeções que ficaram sem resolver. **Pare e espere minha aprovação.** Não escreva código antes disso.
5. **Implementar**: depois que eu aprovar, chame o agente `implementador` com o plano aprovado.
6. **Relatar**: me mostre o resumo do `implementador` (arquivos alterados e resultado dos testes).
