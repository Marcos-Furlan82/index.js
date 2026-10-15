# Projeto: sistema de planejamento e publicação de posts no Instagram

## Agentes

Os agentes ficam em `.claude/agents/`:

- **Desenvolvimento**: `arquiteto`, `critico`, `implementador`
- **Especialistas**: `especialista-marketing`, `especialista-comunicacao`, `especialista-planejamento`, `especialista-viralizacao`, `especialista-instagram`, `especialista-imagem`, `especialista-identidade-visual`
- **Produtos**: `produto-<nome>` (um por produto divulgado)

## Comandos

- `/feature <descrição>`: consulta os especialistas, planeja, debate, pede aprovação e implementa.
- `/especialistas <pergunta>`: consulta o time de especialistas e consolida as recomendações.

## Regras

- O contexto da marca e dos produtos fica em `docs/contexto.md`.
- Toda integração com a API do Instagram deve passar antes pelo `especialista-instagram`.
