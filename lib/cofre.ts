import { z } from "zod";

export const ENGINE_VERSION = "0.2" as const;

export const DimensionSchema = z.enum(["contexto", "objetivo", "formato", "restricoes", "exemplo"]);
export type Dimension = z.infer<typeof DimensionSchema>;
export const DimensionStatusSchema = z.enum(["missing", "partial", "sufficient", "not_required", "contradictory"]);
export type DimensionStatus = z.infer<typeof DimensionStatusSchema>;
export const AnswerSchema = z.object({ question: z.string().min(1), answer: z.string().min(1).max(8000), dimension: DimensionSchema });
export type Answer = z.infer<typeof AnswerSchema>;
export const CofreSessionSchema = z.object({ originalRequest: z.string().max(12000), answers: z.array(AnswerSchema), skipped: z.array(DimensionSchema) });
export type CofreSession = z.infer<typeof CofreSessionSchema>;
export const QuestionSchema = z.object({ dimension: DimensionSchema, eyebrow: z.string(), text: z.string().min(1), hint: z.string(), options: z.array(z.string()), type: z.enum(["discovery", "deepening", "choice", "confirmation", "conflict_resolution"]) });
export type Question = z.infer<typeof QuestionSchema>;
export const EngineAnalysisSchema = z.object({
  engineVersion: z.literal(ENGINE_VERSION), promptVersion: z.literal("orchestrator-0.2.0"),
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
const latest = (session: CofreSession) => session.answers.at(-1)?.answer.trim() ?? session.originalRequest.trim();
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

function hasTopic(text: string) {
  return /\b(?:workshop|oficina|treinamento)\s+(?:sobre|de)\s+[^.\n]{2,}/i.test(text) || /\b(?:tema|assunto)\s*(?:é|:|sobre)\s*[^.\n]{2,}/i.test(text) || /\bsobre\s+(?!isso|esse|o assunto)[^.\n]{2,}/i.test(text);
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
  const specific = candidates.some((value) => /\b(?:equipe|time|clientes?|alunos?|professores?|diretoria|designers?|gestores?|desenvolvedores?|marketing|vendas|produto)\b(?:\s+(?:de|da|do|com)\s+[^.\n]+)?/i.test(value) && !genericAudience.test(value));
  if (!specific) return "missing";
  if (artifact === "workshop" && !candidates.some((value) => /\b(?:b[aá]sico|iniciante|intermedi[aá]rio|avan[cç]ado|experi[eê]ncia|conhece|contato|familiaridade)\b/i.test(value))) return "partial";
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
  if (/\b(?:\d+\s*(?:minutos?|horas?|dias?|semanas?|palavras?|slides?|itens?)|prazo|or[cç]amento|sem\s+[^.]+|n[aã]o\s+pode|m[aá]ximo|limite)\b/i.test(joined)) return "sufficient";
  return ["workshop", "apresentacao", "aula"].includes(artifact) ? "missing" : "not_required";
}

function makeQuestion(dimension: Dimension, type: Question["type"], eyebrow: string, text: string, hint: string, options: string[] = []): Question {
  return QuestionSchema.parse({ dimension, type, eyebrow, text, hint, options });
}

function topicLabel(text: string) {
  const match = text.match(/\b(?:workshop|oficina|treinamento)\s+(?:sobre|de)\s+([^.,\n]+)/i) || text.match(/\bsobre\s+([^.,\n]+)/i);
  return match?.[1]?.trim() || "o tema";
}

function workshopQuestion(session: CofreSession, states: Record<Dimension, DimensionStatus>): Question | null {
  const text = allText(session);
  const last = latest(session);
  if (vagueObjective.test(last) || /\btomar\s+uma\s+decis[aã]o\b/i.test(last)) return makeQuestion("objetivo", "deepening", "Vamos tornar o resultado concreto", `Que decisão você quer que ${/equipe/i.test(text) ? "sua equipe" : "as pessoas"} consiga tomar ao final do workshop?`, "Diga qual escolha, prioridade ou caminho precisa ficar claro.");
  if (!hasTopic(text)) return makeQuestion("objetivo", "discovery", "Vamos dar substância ao workshop", "Qual é o tema do workshop e o que você gostaria que as pessoas conseguissem fazer ou decidir ao final?", "Tema e resultado caminham juntos aqui.");
  if (states.objetivo !== "sufficient") return makeQuestion("objetivo", "deepening", "Vamos tornar o resultado observável", "O que as pessoas precisam conseguir fazer, decidir ou produzir ao final desse workshop?", "Um resultado concreto ajuda a definir toda a dinâmica.");
  if (genericAudience.test(last) || states.contexto === "partial") return makeQuestion("contexto", "deepening", "Agora, quem vai participar", `Que equipe é essa e quanto ela já conhece sobre ${topicLabel(text)}?`, "Área de atuação e nível atual já são suficientes.");
  if (states.contexto === "missing") return makeQuestion("contexto", "discovery", "Agora, quem vai participar", `Quem participará do workshop sobre ${topicLabel(text)} e quanto essas pessoas já conhecem do tema?`, "Isso define profundidade, linguagem e tipo de atividade.");
  if (states.restricoes === "missing") return makeQuestion("restricoes", "discovery", "Um limite que muda o desenho", "Quanto tempo vocês terão para o workshop?", "A duração determina a quantidade de blocos e atividades.", ["1 hora", "2 horas", "Meio período"]);
  if (states.formato !== "sufficient") return makeQuestion("formato", "choice", "Vamos combinar a entrega", "O que você quer ter em mãos para conduzir o workshop?", "Por exemplo: agenda com tempos, roteiro de facilitação, atividades e materiais.", ["Agenda + roteiro", "Plano com atividades", "Kit completo de facilitação"]);
  return null;
}

function genericQuestion(session: CofreSession, states: Record<Dimension, DimensionStatus>, artifact: EngineAnalysis["artifact"]): Question | null {
  const last = latest(session);
  if (vagueObjective.test(last) || states.objetivo === "partial") {
    if (/melhorar/i.test(last)) return makeQuestion("objetivo", "deepening", "Vamos concretizar essa mudança", `O que está acontecendo hoje em ${last.replace(/^(?:quero\s+)?melhorar\s*/i, "").replace(/[.]$/, "") || "isso"} que você gostaria que fosse diferente?`, "Descreva a mudança que indicaria sucesso.");
    if (/decis/i.test(last)) return makeQuestion("objetivo", "deepening", "Vamos dar foco à decisão", "Que decisão exatamente precisa ficar mais clara?", "Nomeie a escolha que essa entrega deve apoiar.");
    return makeQuestion("objetivo", "deepening", "Vamos tornar o resultado concreto", "O que você quer que as pessoas consigam fazer, decidir ou mudar depois disso?", "Procure um resultado que seja possível observar.");
  }
  if (states.objetivo === "missing") return makeQuestion("objetivo", "discovery", "Vamos dar foco ao resultado", `O que precisa acontecer como consequência ${artifact === "apresentacao" ? "dessa apresentação" : "desse trabalho"}?`, "Descreva a decisão, mudança ou entrega que você espera.");
  if (genericAudience.test(last) || states.contexto === "partial") return makeQuestion("contexto", "deepening", "Só o contexto que muda a resposta", `Quando você diz “${last.replace(/[.]$/, "")}”, quem são essas pessoas e o que elas já sabem sobre o assunto?`, "Uma descrição curta já ajuda a calibrar a resposta.");
  if (states.contexto === "missing" && ["apresentacao", "aula", "campanha", "texto"].includes(artifact)) return makeQuestion("contexto", "discovery", "Só o contexto que faz diferença", "Quem vai usar ou receber esse resultado?", "Informe apenas o público que muda a forma da resposta.");
  if (states.restricoes === "missing" && ["apresentacao", "aula"].includes(artifact)) return makeQuestion("restricoes", "discovery", "Um limite que muda a execução", artifact === "apresentacao" ? "Quanto tempo você terá para apresentar?" : "Quanto tempo estará disponível para a atividade?", "Tempo é uma restrição funcional, não apenas acabamento.");
  if (states.formato === "missing") return makeQuestion("formato", "choice", "Vamos combinar uma entrega utilizável", "Como você pretende usar esse resultado na prática?", "Isso ajuda a escolher a estrutura sem impor um formato artificial.");
  return null;
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
  const proposed = artifact === "workshop" ? workshopQuestion(session, dimensions) : genericQuestion(session, dimensions, artifact);
  const next = session.answers.length >= 7 ? null : proposed;
  const gaps = (Object.entries(dimensions) as [Dimension, DimensionStatus][])
    .filter(([, status]) => ["missing", "partial", "contradictory"].includes(status))
    .map(([target, status]) => ({ target, severity: target === "objetivo" || (artifact === "workshop" && ["contexto", "restricoes"].includes(target)) ? "critical" as const : "relevant" as const, description: `${target} permanece ${status}; ainda há ambiguidade com impacto na execução.` }));
  return EngineAnalysisSchema.parse({
    engineVersion: ENGINE_VERSION, promptVersion: "orchestrator-0.2.0", artifact, dimensions,
    sufficiency: next ? (gaps.some((gap) => gap.severity === "critical") ? "NOT_READY" : "ASK_IF_HIGH_VALUE") : "READY",
    nextAction: next ? "ASK" : "COMPOSE", nextQuestion: next, gaps,
  });
}

export const nextQuestion = (session: CofreSession) => analyzeSession(session).nextQuestion;

export function applyAnswer(rawSession: CofreSession, currentQuestion: Question, rawAnswer: string): CofreSession {
  const session = CofreSessionSchema.parse(rawSession);
  const answer = rawAnswer.trim();
  if (!answer || dontKnow.test(answer)) return CofreSessionSchema.parse({ ...session, skipped: [...new Set([...session.skipped, currentQuestion.dimension])] });
  let dimension = currentQuestion.dimension;
  const hasObservableOutcome = /\b(?:identif\w*|produz\w*|cri\w*|decid\w*|prioriz\w*|aprov\w*|aument\w*|reduz\w*|consig\w*|sai(?:a|am|r)?\s+com)\b/i.test(answer);
  if (genericAudience.test(answer) || (!hasObservableOutcome && /\b(?:equipe|clientes?|alunos?|professores?|diretoria|designers?|gestores?|participantes?)\b/i.test(answer))) dimension = "contexto";
  else if (/\b(?:\d+\s*(?:minutos?|horas?|dias?|semanas?)|prazo|or[cç]amento|limite)\b/i.test(answer)) dimension = "restricoes";
  const next = { ...session, answers: [...session.answers, { question: currentQuestion.text, answer, dimension }] };
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
  const lookup = (dimension: Dimension) => session.answers.filter((item) => item.dimension === dimension).map((item) => item.answer).join("; ");
  return [
    ["Contexto", lookup("contexto") || "Preservado a partir do pedido original"],
    ["Objetivo", lookup("objetivo") || session.originalRequest],
    ["Formato", lookup("formato") || "Formato adequado à natureza da tarefa"],
    ["Restrições", lookup("restricoes") || "Sem restrições adicionais"],
    ["Exemplo", lookup("exemplo") || "Não necessário"],
  ];
}
