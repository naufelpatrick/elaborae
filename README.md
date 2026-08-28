# Elaborae

Webapp que transforma uma intenção em linguagem natural em um prompt universal por meio de uma conversa adaptativa apoiada pelo **COFRE Engine**.

## Executar localmente

```bash
npm install
cp .env.example .env.local
npm run dev
```

Abra `http://localhost:3000`.

## OpenRouter

Para ativar a camada inteligente, configure no servidor:

```env
OPENROUTER_API_KEY=sua_chave
OPENROUTER_MODEL=modelo_escolhido_no_openrouter
OPENROUTER_BASE_URL=https://openrouter.ai/api/v1
OPENROUTER_TIMEOUT_MS=30000
NEXT_PUBLIC_SITE_URL=https://elabora.io
```

`OPENROUTER_API_KEY` nunca deve usar prefixo `NEXT_PUBLIC_`.

Se `OPENROUTER_API_KEY` ou `OPENROUTER_MODEL` não estiverem configurados, ou se o provedor falhar, o app volta automaticamente ao engine determinístico existente.

## Pipeline inteligente

A experiência usa quatro etapas server-side:

1. **Orchestrator** — interpreta a conversa, identifica lacunas relevantes e decide se vale fazer outra pergunta.
2. **Intent Expansion** — amplia a ideia sem alterar a intenção, acrescentando estrutura, critérios e possibilidades legitimamente derivadas do objetivo.
3. **Composer** — transforma intenção + expansão em um prompt realmente elaborado, em vez de apenas concatenar respostas.
4. **Validator** — revisa fidelidade, clareza, invenções, contradições e portabilidade antes da entrega.

Princípios centrais:

> **Não aceite rótulos como respostas. Busque significado.**

> **Amplie a ideia, não a intenção.**

## O que já funciona

- Entrada livre sem login.
- Conversa adaptativa com uma pergunta principal por vez.
- Perguntas geradas dinamicamente pelo LLM quando OpenRouter está configurado.
- Aprofundamento semântico de respostas vagas.
- Intent Expansion antes da composição.
- Prompt universal, generativo e validado.
- Respostas rápidas, texto livre, pular e gerar antecipadamente.
- Resumo das dimensões COFRE.
- Ajuste pós-geração e revisão das respostas.
- Fallback determinístico quando a camada de IA não está disponível.
- Telemetria server-side básica de modelo, tokens, custo e duração via logs.

## Arquitetura

```text
Interface
  ↓
POST /api/elabora
  ↓
Orchestrator (LLM)
  ↓
ASK ───────────────→ nova pergunta
  │
 READY
  ↓
Intent Expansion (LLM)
  ↓
Composer (LLM)
  ↓
Validator (LLM)
  ↓
Prompt final

Em qualquer falha de provider/schema:
→ COFRE determinístico como fallback
```
