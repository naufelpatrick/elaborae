# PromptExIA

Webapp que transforma uma intenção em linguagem natural em um prompt universal, por meio de uma entrevista adaptativa curta baseada no **COFRE Engine v0.1**.

## Executar localmente

```bash
npm install
npm run dev
```

Abra `http://localhost:3000`.

## O que já funciona

- Entrada livre sem login.
- Entrevista adaptativa com uma pergunta por vez.
- Respostas rápidas, texto livre, pular e gerar antecipadamente.
- Composição de prompt universal e copiável.
- Resumo das cinco dimensões COFRE.
- Ajuste pós-geração e reinício da experiência.
- Interface responsiva e navegável por teclado.

## Estado da integração

Esta primeira versão usa um adaptador local determinístico para permitir testar toda a experiência sem credenciais. A arquitetura está pronta para substituir esse adaptador por um provedor de LLM server-side, mantendo os contratos do COFRE Engine.
