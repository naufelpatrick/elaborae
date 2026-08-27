export type Dimension = "contexto" | "objetivo" | "formato" | "restricoes" | "exemplo";

export type Answer = { question: string; answer: string; dimension: Dimension };

export type CofreSession = {
  originalRequest: string;
  answers: Answer[];
  skipped: Dimension[];
};

export type Question = {
  dimension: Dimension;
  eyebrow: string;
  text: string;
  hint: string;
  options: string[];
};

const questions: Record<Dimension, Question> = {
  objetivo: {
    dimension: "objetivo",
    eyebrow: "Vamos dar foco ao resultado",
    text: "O que deve acontecer quando essa tarefa estiver concluída?",
    hint: "Descreva a decisão, mudança ou entrega que você espera.",
    options: ["Tomar uma decisão", "Criar uma entrega", "Entender um assunto"],
  },
  contexto: {
    dimension: "contexto",
    eyebrow: "Só o contexto que faz diferença",
    text: "Para quem é isso e em qual situação será usado?",
    hint: "Público, canal ou momento de uso — apenas o que for relevante.",
    options: ["Para minha equipe", "Para clientes", "Para uso pessoal"],
  },
  formato: {
    dimension: "formato",
    eyebrow: "Vamos combinar a entrega",
    text: "Como você quer receber o resultado?",
    hint: "Ex.: uma lista, roteiro, tabela, texto curto ou plano detalhado.",
    options: ["Passo a passo", "Texto objetivo", "Tabela comparativa"],
  },
  restricoes: {
    dimension: "restricoes",
    eyebrow: "Último ajuste importante",
    text: "Existe algum limite ou critério que a IA precisa respeitar?",
    hint: "Prazo, tamanho, tom, itens proibidos ou requisitos obrigatórios.",
    options: ["Tom profissional", "Seja conciso", "Não há restrições"],
  },
  exemplo: {
    dimension: "exemplo",
    eyebrow: "Referência opcional",
    text: "Há algum exemplo ou referência que represente o que você espera?",
    hint: "Você pode descrever uma referência ou seguir sem ela.",
    options: [],
  },
};

const hasFormat = (text: string) => /\b(lista|tabela|roteiro|plano|email|e-mail|post|artigo|slides?|apresenta[cç][aã]o|json|resumo)\b/i.test(text);
const hasAudience = (text: string) => /\b(para|público|cliente|equipe|diretoria|alunos?|usuários?|instagram|linkedin)\b/i.test(text);
const hasConstraint = (text: string) => /\b(curto|breve|palavras|minutos|tom|sem |até |limite|formal|executivo|profissional)\b/i.test(text);

export function nextQuestion(session: CofreSession): Question | null {
  const done = new Set([...session.answers.map((a) => a.dimension), ...session.skipped]);
  const source = session.originalRequest;
  const candidates: Dimension[] = [];
  if (!done.has("objetivo") && source.trim().split(/\s+/).length < 10) candidates.push("objetivo");
  if (!done.has("contexto") && !hasAudience(source)) candidates.push("contexto");
  if (!done.has("formato") && !hasFormat(source)) candidates.push("formato");
  if (!done.has("restricoes") && !hasConstraint(source)) candidates.push("restricoes");
  return candidates.length ? questions[candidates[0]] : null;
}

export function composePrompt(session: CofreSession): string {
  const byDimension = Object.fromEntries(session.answers.map((item) => [item.dimension, item.answer]));
  const parts = [
    `Tarefa: ${session.originalRequest.trim()}`,
    byDimension.objetivo && `Resultado esperado: ${byDimension.objetivo}`,
    byDimension.contexto && `Contexto de uso: ${byDimension.contexto}`,
    byDimension.formato && `Formato da entrega: ${byDimension.formato}`,
    byDimension.restricoes && !/não h(á|a)/i.test(byDimension.restricoes) && `Critérios e limites: ${byDimension.restricoes}`,
    byDimension.exemplo && `Referência útil: ${byDimension.exemplo}`,
    "Entregue uma resposta clara, diretamente utilizável e fiel às informações fornecidas. Quando faltar um dado indispensável, sinalize a lacuna em vez de inventar precisão. Não exponha raciocínio privado; apresente apenas critérios, evidências e conclusões relevantes.",
  ].filter(Boolean);
  return parts.join("\n\n");
}

export function summary(session: CofreSession) {
  const lookup = Object.fromEntries(session.answers.map((item) => [item.dimension, item.answer]));
  return [
    ["Contexto", lookup.contexto || "Preservado a partir do pedido original"],
    ["Objetivo", lookup.objetivo || session.originalRequest],
    ["Formato", lookup.formato || "Formato adequado à tarefa"],
    ["Restrições", lookup.restricoes || "Sem restrições adicionais"],
    ["Exemplo", lookup.exemplo || "Não necessário"],
  ];
}
