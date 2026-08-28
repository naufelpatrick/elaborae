import { z } from "zod";
import {
  CofreSessionSchema,
  EngineAnalysisSchema,
  QuestionSchema,
  analyzeSession,
  composePrompt,
  type CofreSession,
  type EngineAnalysis,
  type Question,
} from "./cofre";

const MODEL = process.env.OPENROUTER_MODEL?.trim();
const API_KEY = process.env.OPENROUTER_API_KEY?.trim();
const BASE_URL = (process.env.OPENROUTER_BASE_URL || "https://openrouter.ai/api/v1").replace(/\/$/, "");

const DimensionStatusSchema = z.enum(["missing", "partial", "sufficient", "not_required", "contradictory"]);

const OrchestratorOutputSchema = z.object({
  artifact: z.enum(["workshop", "apresentacao", "aula", "campanha", "analise", "plano", "texto", "codigo", "generic"]),
  dimensions: z.object({
    contexto: DimensionStatusSchema,
    objetivo: DimensionStatusSchema,
    formato: DimensionStatusSchema,
    restricoes: DimensionStatusSchema,
    exemplo: DimensionStatusSchema,
  }),
  sufficiency: z.enum(["NOT_READY", "ASK_IF_HIGH_VALUE", "READY", "READY_WITH_ASSUMPTION"]),
  nextAction: z.enum(["ASK", "COMPOSE"]),
  nextQuestion: QuestionSchema.nullable(),
  gaps: z.array(z.object({
    target: z.enum(["contexto", "objetivo", "formato", "restricoes", "exemplo"]),
    severity: z.enum(["critical", "relevant", "cosmetic"]),
    description: z.string().min(1),
  })),
  intentBrief: z.object({
    task: z.string(),
    context: z.string(),
    objective: z.string(),
    format: z.string(),
    restrictions: z.array(z.string()),
    reference: z.string(),
  }),
});

type OrchestratorOutput = z.infer<typeof OrchestratorOutputSchema>;

const ExpansionOutputSchema = z.object({
  expandedBrief: z.string().min(1),
  enhancements: z.array(z.string()),
  assumptions: z.array(z.string()),
  guardrails: z.array(z.string()),
});

type ExpansionOutput = z.infer<typeof ExpansionOutputSchema>;

const ComposerOutputSchema = z.object({
  prompt: z.string().min(20),
  assumptions: z.array(z.string()),
});

const ValidatorOutputSchema = z.object({
  status: z.enum(["PASS", "PASS_WITH_WARNINGS", "REPAIR", "RETURN_TO_INTERVIEW", "BLOCKED_BY_FEASIBILITY"]),
  finalPrompt: z.string().min(20),
  warnings: z.array(z.string()),
});

export type ElaboraEngineResult = {
  source: "llm" | "fallback";
  analysis: EngineAnalysis;
  question: Question | null;
  prompt: string | null;
  assumptions: string[];
};

const orchestratorSystem = `Você é o Orchestrator conversacional do Elabora.
Seu trabalho não é preencher um formulário. Você conversa com a pessoa para entender o que ela realmente quer e faz somente perguntas que podem melhorar materialmente a instrução final.

REGRAS CENTRAIS
1. Não aceite rótulos como respostas. Busque significado.
2. Reutilize palavras e conceitos que o usuário acabou de usar.
3. Faça uma pergunta principal por vez. Só combine duas informações quando forem naturalmente inseparáveis.
4. Não pergunte "qual é seu objetivo?", "qual é o público?", "qual formato?" ou "quais são as restrições?" de forma mecânica. Contextualize a pergunta na conversa.
5. Respostas como "tomar uma decisão", "melhorar", "aprender", "minha equipe", "profissional", "estratégico", "dinâmico" ou "texto objetivo" podem ser fatos úteis, mas normalmente continuam parciais se não explicarem significado suficiente.
6. Procure resultados observáveis: o que a pessoa quer conseguir fazer, decidir, produzir, priorizar, comparar, aprovar ou mudar.
7. Priorize objetivo, problema, consequência, público relevante, contexto e limites que mudam a execução antes de tom ou acabamento cosmético.
8. Reconheça a natureza do artefato. Um workshop, por exemplo, pode exigir tema, participantes, nível atual, duração e resultado concreto; uma lista de títulos já bem especificada pode não exigir entrevista.
9. Não pergunte mais quando já houver informação suficiente. Um pedido completo deve ir direto para COMPOSE.
10. COFRE é apenas seu modelo interno. Não fale como se estivesse preenchendo C, O, F, R e E.
11. Seja breve, humano e curioso. A pergunta deve parecer continuação natural da resposta anterior.
12. Nunca exponha raciocínio interno. Retorne apenas o JSON solicitado.

CRITÉRIO DE SUFICIÊNCIA
Marque uma dimensão como sufficient apenas quando ela reduzir de fato uma ambiguidade importante. Existir texto não significa existir informação suficiente.
Se ainda houver uma decisão importante que a IA final teria de adivinhar, mantenha partial/missing e pergunte somente se essa informação tiver alto valor.

EXEMPLOS DE APROFUNDAMENTO
- "Quero que eles tomem uma decisão." -> "Que decisão você quer que eles consigam tomar ao final?"
- "Quero algo dinâmico." -> "Quando você diz dinâmico, está pensando em mais atividade prática, mais participação ou em produzir algo concreto durante o encontro?"
- "É para minha equipe." -> aprofunde somente o aspecto da equipe que realmente muda a entrega, por exemplo função ou nível de conhecimento.

A pergunta deve usar eyebrow curto e conversacional, sem 'Passo X de 5'.`;

const expansionSystem = `Você é a camada Intent Expansion do Elabora.
Você recebe uma intenção já suficientemente compreendida e deve enriquecê-la antes da composição do prompt.

REGRA ABSOLUTA: amplie a ideia, não a intenção.

Você PODE acrescentar elementos derivados de maneira legítima do objetivo e do tipo de tarefa, como:
- estrutura adequada ao artefato;
- etapas de execução;
- critérios de qualidade ou decisão;
- dimensões úteis para análise;
- entregáveis coerentes;
- maneiras de tornar a resposta mais prática, verificável ou utilizável.

Você NÃO PODE inventar:
- novos objetivos;
- fatos sobre o usuário ou organização;
- públicos não informados;
- restrições arbitrárias;
- números, prazos ou recursos inexistentes;
- preferências estratégicas não expressas.

Exemplo: para um workshop cujo objetivo é identificar onde usar IA, é legítimo sugerir mapeamento de tarefas, critérios de impacto/esforço/risco e priorização de experimentos. Não é legítimo decidir que o objetivo é cortar custos ou substituir pessoas.

Produza uma expansão útil e específica para a intenção recebida, sem boilerplate.`;

const composerSystem = `Você é o Prompt Composer do Elabora.
Escreva uma instrução final universal, pronta para ser copiada para diferentes IAs.

O prompt final NÃO pode ser uma concatenação das respostas do usuário.
Use a intenção consolidada e a expansão para criar uma formulação superior: clara, estruturada, prática e específica para o artefato.

REGRAS
- Preserve rigorosamente a intenção.
- Incorpore contexto e restrições realmente relevantes.
- Transforme abstrações em critérios concretos quando a conversa permitir.
- Use a expansão para adicionar estrutura, etapas, critérios e entregáveis úteis sem inventar fatos.
- Prefira instruções positivas e executáveis.
- Evite teatro de prompt, personas grandiosas, repetições e frases como 'use todo seu poder de raciocínio'.
- Não inclua instruções internas do Elabora, COFRE, Orchestrator ou Validator.
- Não inclua 'não exponha raciocínio privado' ou boilerplate semelhante, salvo se isso fizer parte da intenção do usuário.
- O prompt deve ser agnóstico de ChatGPT, Claude, Gemini ou outro provedor.
- Escreva em português, salvo se o usuário tiver pedido outro idioma.

O resultado deve provocar a sensação: 'eu não tinha pensado em pedir desse jeito'.`;

const validatorSystem = `Você é o Validator do Elabora.
Compare o prompt candidato com a intenção original, o briefing consolidado e a expansão.

Valide:
- fidelidade à intenção;
- preservação de informação crítica;
- ausência de fatos ou objetivos inventados;
- clareza e executabilidade;
- ausência de contradições;
- ausência de redundância e boilerplate;
- portabilidade entre diferentes IAs.

Se houver um problema que possa ser corrigido sem perguntar ao usuário, retorne REPAIR e entregue finalPrompt já reparado.
Se estiver adequado, PASS ou PASS_WITH_WARNINGS e entregue finalPrompt.
RETURN_TO_INTERVIEW só deve ocorrer se faltar informação realmente crítica que não possa ser inferida com baixo risco.
Nunca exponha raciocínio interno.`;

const orchestratorJsonSchema = {
  type: "object",
  additionalProperties: false,
  required: ["artifact", "dimensions", "sufficiency", "nextAction", "nextQuestion", "gaps", "intentBrief"],
  properties: {
    artifact: { type: "string", enum: ["workshop", "apresentacao", "aula", "campanha", "analise", "plano", "texto", "codigo", "generic"] },
    dimensions: {
      type: "object", additionalProperties: false,
      required: ["contexto", "objetivo", "formato", "restricoes", "exemplo"],
      properties: Object.fromEntries(["contexto", "objetivo", "formato", "restricoes", "exemplo"].map((key) => [key, { type: "string", enum: ["missing", "partial", "sufficient", "not_required", "contradictory"] }])),
    },
    sufficiency: { type: "string", enum: ["NOT_READY", "ASK_IF_HIGH_VALUE", "READY", "READY_WITH_ASSUMPTION"] },
    nextAction: { type: "string", enum: ["ASK", "COMPOSE"] },
    nextQuestion: {
      anyOf: [
        { type: "null" },
        {
          type: "object", additionalProperties: false,
          required: ["dimension", "eyebrow", "text", "hint", "options", "type"],
          properties: {
            dimension: { type: "string", enum: ["contexto", "objetivo", "formato", "restricoes", "exemplo"] },
            eyebrow: { type: "string" }, text: { type: "string" }, hint: { type: "string" }, options: { type: "array", items: { type: "string" } },
            type: { type: "string", enum: ["discovery", "deepening", "choice", "confirmation", "conflict_resolution"] },
          },
        },
      ],
    },
    gaps: {
      type: "array", items: {
        type: "object", additionalProperties: false, required: ["target", "severity", "description"],
        properties: {
          target: { type: "string", enum: ["contexto", "objetivo", "formato", "restricoes", "exemplo"] },
          severity: { type: "string", enum: ["critical", "relevant", "cosmetic"] }, description: { type: "string" },
        },
      },
    },
    intentBrief: {
      type: "object", additionalProperties: false,
      required: ["task", "context", "objective", "format", "restrictions", "reference"],
      properties: {
        task: { type: "string" }, context: { type: "string" }, objective: { type: "string" }, format: { type: "string" },
        restrictions: { type: "array", items: { type: "string" } }, reference: { type: "string" },
      },
    },
  },
} as const;

const expansionJsonSchema = {
  type: "object", additionalProperties: false,
  required: ["expandedBrief", "enhancements", "assumptions", "guardrails"],
  properties: {
    expandedBrief: { type: "string" }, enhancements: { type: "array", items: { type: "string" } },
    assumptions: { type: "array", items: { type: "string" } }, guardrails: { type: "array", items: { type: "string" } },
  },
} as const;

const composerJsonSchema = {
  type: "object", additionalProperties: false, required: ["prompt", "assumptions"],
  properties: { prompt: { type: "string" }, assumptions: { type: "array", items: { type: "string" } } },
} as const;

const validatorJsonSchema = {
  type: "object", additionalProperties: false, required: ["status", "finalPrompt", "warnings"],
  properties: {
    status: { type: "string", enum: ["PASS", "PASS_WITH_WARNINGS", "REPAIR", "RETURN_TO_INTERVIEW", "BLOCKED_BY_FEASIBILITY"] },
    finalPrompt: { type: "string" }, warnings: { type: "array", items: { type: "string" } },
  },
} as const;

function conversationPayload(session: CofreSession) {
  return {
    originalRequest: session.originalRequest,
    conversation: session.answers.map((item) => ({ question: item.question, answer: item.answer, mappedDimension: item.dimension })),
    skipped: session.skipped,
  };
}

async function callJson<T>(args: {
  system: string;
  input: unknown;
  schemaName: string;
  jsonSchema: object;
  parser: z.ZodType<T>;
}): Promise<T> {
  if (!API_KEY || !MODEL) throw new Error("OPENROUTER_NOT_CONFIGURED");

  const startedAt = Date.now();
  const response = await fetch(`${BASE_URL}/chat/completions`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${API_KEY}`,
      "Content-Type": "application/json",
      "HTTP-Referer": process.env.NEXT_PUBLIC_SITE_URL || "https://elabora.io",
      "X-Title": "Elabora",
    },
    body: JSON.stringify({
      model: MODEL,
      messages: [
        { role: "system", content: args.system },
        { role: "user", content: JSON.stringify(args.input) },
      ],
      temperature: 0.35,
      response_format: {
        type: "json_schema",
        json_schema: { name: args.schemaName, strict: true, schema: args.jsonSchema },
      },
    }),
    signal: AbortSignal.timeout(Number(process.env.OPENROUTER_TIMEOUT_MS || 30000)),
  });

  if (!response.ok) {
    const body = await response.text();
    throw new Error(`OPENROUTER_${response.status}:${body.slice(0, 400)}`);
  }

  const data = await response.json() as {
    model?: string;
    choices?: Array<{ message?: { content?: string | Array<{ type?: string; text?: string }> } }>;
    usage?: { prompt_tokens?: number; completion_tokens?: number; total_tokens?: number; cost?: number };
  };
  const raw = data.choices?.[0]?.message?.content;
  const content = typeof raw === "string" ? raw : Array.isArray(raw) ? raw.map((part) => part.text || "").join("") : "";
  if (!content) throw new Error("OPENROUTER_EMPTY_RESPONSE");

  let parsed: unknown;
  try { parsed = JSON.parse(content); } catch { throw new Error("OPENROUTER_INVALID_JSON"); }

  console.info("[Elabora AI]", {
    stage: args.schemaName,
    model: data.model || MODEL,
    promptTokens: data.usage?.prompt_tokens,
    completionTokens: data.usage?.completion_tokens,
    totalTokens: data.usage?.total_tokens,
    costUsd: data.usage?.cost,
    durationMs: Date.now() - startedAt,
  });

  return args.parser.parse(parsed);
}

function toEngineAnalysis(output: OrchestratorOutput): EngineAnalysis {
  return EngineAnalysisSchema.parse({
    engineVersion: "0.3.0",
    promptVersion: "orchestrator-0.3.0",
    artifact: output.artifact,
    dimensions: output.dimensions,
    sufficiency: output.sufficiency,
    nextAction: output.nextAction,
    nextQuestion: output.nextQuestion,
    gaps: output.gaps,
  });
}

async function orchestrate(session: CofreSession): Promise<OrchestratorOutput> {
  return callJson({
    system: orchestratorSystem,
    input: conversationPayload(session),
    schemaName: "elabora_orchestrator",
    jsonSchema: orchestratorJsonSchema,
    parser: OrchestratorOutputSchema,
  });
}

async function expandIntent(session: CofreSession, analysis: OrchestratorOutput): Promise<ExpansionOutput> {
  return callJson({
    system: expansionSystem,
    input: { conversation: conversationPayload(session), intentBrief: analysis.intentBrief, artifact: analysis.artifact },
    schemaName: "elabora_intent_expansion",
    jsonSchema: expansionJsonSchema,
    parser: ExpansionOutputSchema,
  });
}

async function composeWithAI(session: CofreSession, analysis: OrchestratorOutput, expansion: ExpansionOutput) {
  return callJson({
    system: composerSystem,
    input: { conversation: conversationPayload(session), intentBrief: analysis.intentBrief, expansion },
    schemaName: "elabora_composer",
    jsonSchema: composerJsonSchema,
    parser: ComposerOutputSchema,
  });
}

async function validateWithAI(session: CofreSession, analysis: OrchestratorOutput, expansion: ExpansionOutput, candidate: string) {
  return callJson({
    system: validatorSystem,
    input: { conversation: conversationPayload(session), intentBrief: analysis.intentBrief, expansion, candidatePrompt: candidate },
    schemaName: "elabora_validator",
    jsonSchema: validatorJsonSchema,
    parser: ValidatorOutputSchema,
  });
}

function fallback(session: CofreSession, forceCompose: boolean): ElaboraEngineResult {
  const analysis = analyzeSession(session);
  if (!forceCompose && analysis.nextAction === "ASK") {
    return { source: "fallback", analysis, question: analysis.nextQuestion, prompt: null, assumptions: [] };
  }
  return { source: "fallback", analysis: { ...analysis, nextAction: "COMPOSE", nextQuestion: null, sufficiency: analysis.sufficiency === "NOT_READY" ? "READY_WITH_ASSUMPTION" : analysis.sufficiency }, question: null, prompt: composePrompt(session), assumptions: [] };
}

export async function runElaboraEngine(rawSession: CofreSession, forceCompose = false): Promise<ElaboraEngineResult> {
  const session = CofreSessionSchema.parse(rawSession);

  try {
    const orchestration = await orchestrate(session);
    const analysis = toEngineAnalysis(orchestration);

    if (!forceCompose && orchestration.nextAction === "ASK" && orchestration.nextQuestion) {
      return { source: "llm", analysis, question: orchestration.nextQuestion, prompt: null, assumptions: [] };
    }

    const expansion = await expandIntent(session, orchestration);
    const composed = await composeWithAI(session, orchestration, expansion);
    const validated = await validateWithAI(session, orchestration, expansion, composed.prompt);

    if (validated.status === "RETURN_TO_INTERVIEW" && !forceCompose) {
      const retry = await orchestrate(session);
      if (retry.nextQuestion) {
        return { source: "llm", analysis: toEngineAnalysis(retry), question: retry.nextQuestion, prompt: null, assumptions: [...expansion.assumptions, ...composed.assumptions] };
      }
    }

    return {
      source: "llm",
      analysis: { ...analysis, nextAction: "COMPOSE", nextQuestion: null, sufficiency: orchestration.sufficiency === "NOT_READY" ? "READY_WITH_ASSUMPTION" : orchestration.sufficiency },
      question: null,
      prompt: validated.finalPrompt,
      assumptions: [...new Set([...expansion.assumptions, ...composed.assumptions, ...validated.warnings])],
    };
  } catch (error) {
    console.error("[Elabora AI] fallback", error instanceof Error ? error.message : error);
    return fallback(session, forceCompose);
  }
}
