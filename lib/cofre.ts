import { z } from "zod";

export const ENGINE_VERSION = "0.3.0" as const;

export const DimensionSchema = z.enum(["contexto", "objetivo", "formato", "restricoes", "exemplo"]);
export type Dimension = z.infer<typeof DimensionSchema>;
export const DimensionStatusSchema = z.enum(["missing", "partial", "sufficient", "not_required", "contradictory"]);
export type DimensionStatus = z.infer<typeof DimensionStatusSchema>;
export const AnswerSchema = z.object({ question: z.string().min(1), answer: z.string().max(8000), dimension: DimensionSchema });
export type Answer = z.infer<typeof AnswerSchema>;
export const CofreSessionSchema = z.object({ originalRequest: z.string().max(12000), answers: z.array(AnswerSchema), skipped: z.array(DimensionSchema) });
export type CofreSession = z.infer<typeof CofreSessionSchema>;
export const QuestionSchema = z.object({ dimension: DimensionSchema, eyebrow: z.string(), text: z.string().min(1), hint: z.string(), options: z.array(z.string()), type: z.enum(["discovery", "deepening", "choice", "confirmation", "conflict_resolution"]) });
export type Question = z.infer<typeof QuestionSchema>;
export const EngineAnalysisSchema = z.object({
  engineVersion: z.literal(ENGINE_VERSION), promptVersion: z.literal("orchestrator-0.3.0"),
  artifact: z.enum(["workshop", "apresentacao", "aula", "campanha", "analise", "plano", "texto", "codigo", "generic"]),
  dimensions: z.record(DimensionSchema, DimensionStatusSchema),
  sufficiency: z.enum(["NOT_READY", "ASK_IF_HIGH_VALUE", "READY", "READY_WITH_ASSUMPTION"]),
  nextAction: z.enum(["ASK", "COMPOSE"]), nextQuestion: QuestionSchema.nullable(),
  gaps: z.array(z.object({ target: DimensionSchema, severity: z.enum(["critical", "relevant", "cosmetic"]), description: z.string() })),
});
export type EngineAnalysis = z.infer<typeof EngineAnalysisSchema>;

const vagueObjective = /^(?:quero\s+)?(?:tomar\s+uma\s+decis[aã]o|decidir|melhorar(?:\s+(?:os\s+)?resultados?)?|aprender|inovar|engajar|organizar(?:\s+melhor)?|entender(?:\s+um\s+assunto)?)\.?$/i;
const genericAudience = /^(?:é\s+)?para\s+(?:a\s+)?minha\s+equipe\.?$|^(?:é\s+)?para\s+(?:os\s+)?meus\s+clientes\.?$/i;
const cosmeticOnly = /^(?:quero\s+)?(?:algo\s+)?(?:profissional|estrat[eé]gico|din[aâ]mico|texto\s+objetivo|tom\s+profissional|seja\s+conciso)\.?$/i;
const dontKnow = /^(?:n[aã]o\s+sei|pular|skip)$/i;

const allText = (session: CofreSession) => [session.originalRequest, ...session.answers.map((item) => item.answer)].join("\n");
const dimensionTexts = (session: CofreSession, dimension: Dimension) => session.answers.filter((item) => item.dimension === dimension).map((item) => item.answer.trim());

function detectArtifact(text: string): EngineAnalysis["artifact"] {
  if (/\b(workshop|oficina|treinamento)\b/i.test(text)) return "workshop";
  if (/\b(apresenta[cç][aã]o|slides?|pitch)\b/i.test(text)) return "apresentacao";
  if (/\b(aula|atividade pedag[oó]gica|plano de aula)\b/i.test(text)) return "aula";
  if (/\b(campanha|an[uú]ncio)\b/i.test(text)) return "campanha";
  if (/\b(an[aá]lise|comparar|compara[cç][aã]o)\b/i.test(text)) return "analise";
  if (/\b(plano|estrat[eé]gia)\b/i.test(text)) return "plano";
  if (/\b(c[oó]digo|sistema|aplica[cç][aã]o|api)\b/i.test(text)) return "codigo";
  if (/\b(texto|artigo|post|e-?mail|roteiro)\b/i.test(text)) return "texto";
  return "generic";
}

function objectiveDepth(values: string[], text: string): DimensionStatus {
  const candidates = [...values, ...text.split("\n")].map((value) => value.trim()).filter(Boolean);
  const explicit = candidates.find((value) => /\b(?:objetivo|ao final|resultado|consig\w*|para que|com o objetivo|decid\w*|identif\w*|produz\w*|aprov\w*|aument\w*|reduz\w*)\b/i.test(value));
  if (!explicit || vagueObjective.test(explicit) || cosmeticOnly.test(explicit) || genericAudience.test(explicit)) return "partial";
  if (/\bdecis[aã]o\b/i.test(explicit) && !/\bdecidir\s+(?:se|qual|quais|como|entre|sobre)|decis[aã]o\s+(?:sobre|entre|de)\b/i.test(explicit)) return "partial";
  return explicit.split(/\s+/).length >= 5 ? "sufficient" : "partial";
}

function contextDepth(values: string[], text: string, artifact: EngineAnalysis["artifact"]): DimensionStatus {
  const candidates = [...values, ...text.split("\n")].map((value) => value.trim());
  if (candidates.some((value) => genericAudience.test(value))) return "partial";
  const specific = candidates.some((value) => /\b(?:equipe|time|participantes?|clientes?|alunos?|professores?|diretoria|designers?|gerentes?|gestores?|desenvolvedores?|marketing|vendas|produto)\b(?:\s+(?:de|da|do|com)\s+[^.\n]+)?/i.test(value) && !genericAudience.test(value));
  if (!specific) return "missing";
  if (artifact === "workshop" && !candidates.some((value) => /\b(?:b[aá]sico|iniciante|intermedi[aá]rio|avan[cç]ado|experi[eê]ncia|conhece|contato|familiaridade|usam?|come[cç]ando|m[eé]todo)\b/i.test(value))) return "partial";
  return "sufficient";
}

function formatDepth(values: string[], text: string, artifact: EngineAnalysis["artifact"]): DimensionStatus {
  const joined = [...values, text].join(" ");
  if (values.some((value) => cosmeticOnly.test(value))) return "partial";
  if (artifact === "workshop") return /\b(?:agenda|roteiro|plano|din[aâ]mica|atividades?|blocos?|materiais?|casos? de uso|entreg[aá]vel)\b/i.test(joined) ? "sufficient" : "partial";
  if (/\b(lista|tabela|roteiro|plano|e-?mail|post|artigo|slides?|apresenta[cç][aã]o|json|resumo|checklist)\b/i.test(joined)) return "sufficient";
  return "missing";
}

function restrictionsDepth(values: string[], text: string, artifact: EngineAnalysis["artifact"]): DimensionStatus {
  const joined = [...values, text].join(" ");
  if (values.some((value) => cosmeticOnly.test(value))) return "partial";
  if (/\b(?:(?:\d+|uma?|duas|meio)\s*(?:minutos?|horas?|dias?|semanas?|palavras?|slides?|itens?|per[ií]odo)|prazo|or[cç]amento|sem\s+(?:depender|usar|acesso)|n[aã]o\s+pode|m[aá]ximo|limite)\b/i.test(joined)) return "sufficient";
  return ["workshop", "apresentacao", "aula"].includes(artifact) ? "missing" : "not_required";
}

function makeQuestion(dimension: Dimension, type: Question["type"], eyebrow: string, text: string, hint: string, options: string[] = []): Question {
  return QuestionSchema.parse({ dimension, type, eyebrow, text, hint, options });
}

const interviewOrder: Dimension[] = ["contexto", "objetivo", "formato", "restricoes", "exemplo"];
const stepName: Record<Dimension, string> = { contexto: "Contexto", objetivo: "Objetivo", formato: "Formato", restricoes: "Restrições", exemplo: "Exemplo" };

function fiveStepQuestion(session: CofreSession, artifact: EngineAnalysis["artifact"]): Question | null {
  const completed = new Set<Dimension>([...session.answers.map((answer) => answer.dimension), ...session.skipped]);
  const dimension = interviewOrder.find((item) => !completed.has(item));
  if (!dimension) return null;
  const step = interviewOrder.indexOf(dimension) + 1;
  const eyebrow = `Passo ${step} de 5 · ${stepName[dimension]}`;
  const isWorkshop = artifact === "workshop";

  if (dimension === "contexto") return makeQuestion("contexto", "discovery", eyebrow, isWorkshop ? "Para eu entender o cenário: sobre o que será o workshop e quem vai participar?" : "Em que situação você vai usar isso e quem estará envolvido?", "Conte apenas o contexto que pode mudar a resposta.");
  if (dimension === "objetivo") return makeQuestion("objetivo", "deepening", eyebrow, isWorkshop ? "Quando o workshop terminar, o que você quer que os participantes consigam fazer ou decidir?" : "O que precisa acontecer para você considerar que esse resultado funcionou?", "Descreva o resultado prático que você espera.");
  if (dimension === "formato") return makeQuestion("formato", "choice", eyebrow, isWorkshop ? "O que você precisa ter em mãos para conduzir o workshop?" : "Como essa entrega precisa chegar para ser útil na prática?", isWorkshop ? "Por exemplo: agenda, roteiro de facilitação, atividades ou materiais." : "Diga a estrutura ou o tipo de entrega que você pretende usar.", isWorkshop ? ["Agenda + roteiro", "Plano com atividades", "Kit completo"] : []);
  if (dimension === "restricoes") return makeQuestion("restricoes", "discovery", eyebrow, isWorkshop ? "Que limites preciso respeitar ao montar esse workshop?" : "Existe algum limite ou condição que a resposta precisa respeitar?", isWorkshop ? "Pode incluir duração, número de participantes, recursos disponíveis ou algo que não pode acontecer." : "Considere prazo, tamanho, tom, orçamento ou algo que deve ser evitado.");
  return makeQuestion("exemplo", "confirmation", eyebrow, "Existe algum exemplo ou referência que represente o resultado que você espera?", "Se não houver uma referência útil, pode escolher “Não sei / Pular”.");
}

export function analyzeSession(rawSession: CofreSession): EngineAnalysis {
  const session = CofreSessionSchema.parse(rawSession);
  const text = allText(session);
  const artifact = detectArtifact(text);
  const dimensions: Record<Dimension, DimensionStatus> = {
    contexto: contextDepth(dimensionTexts(session, "contexto"), text, artifact),
    objetivo: objectiveDepth(dimensionTexts(session, "objetivo"), text),
    formato: formatDepth(dimensionTexts(session, "formato"), text, artifact),
    restricoes: restrictionsDepth(dimensionTexts(session, "restricoes"), text, artifact),
    exemplo: "not_required",
  };
  const next = fiveStepQuestion(session, artifact);
  const gaps = (Object.entries(dimensions) as [Dimension, DimensionStatus][])
    .filter(([, status]) => ["missing", "partial", "contradictory"].includes(status))
    .map(([target, status]) => ({ target, severity: target === "objetivo" || (artifact === "workshop" && ["contexto", "restricoes"].includes(target)) ? "critical" as const : "relevant" as const, description: `${target} permanece ${status}; ainda há ambiguidade com impacto na execução.` }));
  return EngineAnalysisSchema.parse({
    engineVersion: ENGINE_VERSION, promptVersion: "orchestrator-0.3.0", artifact, dimensions,
    sufficiency: next ? (gaps.some((gap) => gap.severity === "critical") ? "NOT_READY" : "ASK_IF_HIGH_VALUE") : "READY",
    nextAction: next ? "ASK" : "COMPOSE", nextQuestion: next, gaps,
  });
}

export const nextQuestion = (session: CofreSession) => analyzeSession(session).nextQuestion;

export function applyAnswer(rawSession: CofreSession, currentQuestion: Question, rawAnswer: string): CofreSession {
  const session = CofreSessionSchema.parse(rawSession);
  const answer = rawAnswer.trim();
  if (!answer || dontKnow.test(answer)) return CofreSessionSchema.parse({ ...session, skipped: [...new Set([...session.skipped, currentQuestion.dimension])] });
  const next = { ...session, answers: [...session.answers, { question: currentQuestion.text, answer, dimension: currentQuestion.dimension }] };
  return CofreSessionSchema.parse(next);
}

export function composePrompt(rawSession: CofreSession): string {
  const session = CofreSessionSchema.parse(rawSession);
  const grouped = (dimension: Dimension) => session.answers.filter((item) => item.dimension === dimension).map((item) => item.answer).join("; ");
  return [
    `Tarefa: ${session.originalRequest.trim()}`,
    grouped("objetivo") && `Resultado esperado: ${grouped("objetivo")}`,
    grouped("contexto") && `Contexto de uso: ${grouped("contexto")}`,
    grouped("formato") && `Formato da entrega: ${grouped("formato")}`,
    grouped("restricoes") && !/não h(á|a)/i.test(grouped("restricoes")) && `Critérios e limites: ${grouped("restricoes")}`,
    grouped("exemplo") && `Referência útil: ${grouped("exemplo")}`,
  ].filter(Boolean).join("\n\n");
}

export function summary(rawSession: CofreSession) {
  const session = CofreSessionSchema.parse(rawSession);
  const analysis = analyzeSession(session);
  const lookup = (dimension: Dimension) => session.answers.filter((item) => item.dimension === dimension).map((item) => item.answer).join("; ");
  const fromOriginal = (dimension: Dimension, fallback: string) => {
    const status = analysis.dimensions[dimension];
    return status === "sufficient" || status === "partial" ? "Compreendido a partir do pedido inicial" : fallback;
  };

  return [
    ["Contexto", lookup("contexto") || fromOriginal("contexto", "Sem contexto adicional necessário")],
    ["Objetivo", lookup("objetivo") || fromOriginal("objetivo", "Objetivo preservado a partir do pedido")],
    ["Formato", lookup("formato") || (analysis.dimensions.formato === "sufficient" ? "Definido no pedido inicial" : "Adaptado à natureza da tarefa")],
    ["Restrições", lookup("restricoes") || (analysis.dimensions.restricoes === "sufficient" ? "Restrições identificadas no pedido inicial" : "Nenhuma restrição adicional necessária")],
    ["Exemplo", lookup("exemplo") || "Não foi necessário solicitar referência"],
  ];
}
