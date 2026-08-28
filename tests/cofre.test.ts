import assert from "node:assert/strict";
import test from "node:test";
import { analyzeSession, applyAnswer, composePrompt } from "../lib/cofre.ts";
import type { CofreSession } from "../lib/cofre.ts";

const createSession = (originalRequest: string): CofreSession => ({ originalRequest, answers: [], skipped: [] });

function respond(state: CofreSession, answer: string) {
  const analysis = analyzeSession(state);
  assert.ok(analysis.nextQuestion, "A pergunta seguinte deveria existir");
  return applyAnswer(state, analysis.nextQuestion, answer);
}

test("workshop vago inicia pela substância", () => {
  const analysis = analyzeSession(createSession("Quero preparar um workshop."));
  assert.equal(analysis.nextAction, "ASK");
  assert.match(analysis.nextQuestion?.text ?? "", /sobre o que será esse workshop.*quem vai participar/i);
  assert.equal(analysis.dimensions.objetivo, "partial");
});

test("rótulos vagos não tornam o workshop suficiente", () => {
  let state = createSession("Quero preparar um workshop.");
  state = respond(state, "Para minha equipe.");
  let analysis = analyzeSession(state);
  assert.equal(analysis.nextAction, "ASK");
  assert.notEqual(analysis.dimensions.contexto, "sufficient");

  state = applyAnswer(state, analysis.nextQuestion!, "Tomar uma decisão.");
  analysis = analyzeSession(state);
  assert.equal(analysis.dimensions.objetivo, "partial");
  assert.match(analysis.nextQuestion?.text ?? "", /que decisão/i);

  state = applyAnswer(state, analysis.nextQuestion!, "Texto objetivo.");
  analysis = analyzeSession(state);
  assert.equal(analysis.nextAction, "ASK");
  assert.notEqual(analysis.dimensions.formato, "sufficient");

  state = applyAnswer(state, analysis.nextQuestion!, "Tom profissional.");
  assert.equal(analyzeSession(state).nextAction, "ASK");
});

test("workshop profundo chega a READY e preserva fatos", () => {
  let state = createSession("Quero preparar um workshop sobre IA.");
  state = respond(state, "Quero que a equipe identifique usos de IA no processo e saia com três casos de uso priorizados.");
  state = respond(state, "É uma equipe de designers com contato básico com IA.");
  state = respond(state, "Teremos 2 horas.");
  const analysis = analyzeSession(state);
  assert.equal(analysis.nextAction, "COMPOSE");
  assert.equal(analysis.sufficiency, "READY");
  const prompt = composePrompt(state);
  assert.match(prompt, /três casos de uso priorizados/i);
  assert.match(prompt, /designers/i);
  assert.match(prompt, /2 horas/i);
  assert.doesNotMatch(prompt, /raciocínio privado|quando faltar/i);
});

test("pedido claro pode compor sem entrevista", () => {
  const analysis = analyzeSession(createSession("Crie uma tabela comparativa para a diretoria decidir entre os fornecedores A e B, usando custo total e prazo de implantação como critérios."));
  assert.equal(analysis.nextAction, "COMPOSE");
});

test("conversa natural de workshop termina assim que o núcleo fica suficiente", () => {
  let state = createSession("Quero preparar um workshop.");
  const turns = [
    "Sobre IA, para minha equipe.",
    "Quero que consigam decidir onde usar IA no trabalho.",
    "Alguns usam ChatGPT, mas sem muito método.",
    "Duas horas.",
  ];
  const questions: string[] = [];

  for (const turn of turns) {
    const analysis = analyzeSession(state);
    assert.equal(analysis.nextAction, "ASK");
    questions.push(analysis.nextQuestion!.text);
    state = applyAnswer(state, analysis.nextQuestion!, turn);
  }

  assert.match(questions[0], /sobre o que.*quem vai participar/i);
  assert.match(questions[1], /essa equipe.*fazer ou decidir/i);
  assert.match(questions[2], /já usa.*ou ainda está começando/i);
  assert.match(questions[3], /quanto tempo.*introdutório.*mão na massa/i);
  assert.equal(analyzeSession(state).nextAction, "COMPOSE");
  assert.match(composePrompt(state), /onde usar IA no trabalho/i);
  assert.match(composePrompt(state), /ChatGPT.*sem muito método/i);
  assert.match(composePrompt(state), /Duas horas/i);
});

test("resposta livre sobre o tema avança sem repetir a pergunta", () => {
  let state = createSession("Quero preparar um workshop.");
  const first = analyzeSession(state).nextQuestion!;
  state = applyAnswer(state, first, "Jobs to Be Done para gerentes de produto e participantes de pesquisa.");
  const second = analyzeSession(state).nextQuestion!;

  assert.notEqual(second.text, first.text);
  assert.equal(second.dimension, "objetivo");
  assert.match(second.text, /fazer ou decidir/i);
});

test("pular uma pergunta impede que ela reapareça", () => {
  const state = createSession("Quero preparar um workshop.");
  const first = analyzeSession(state).nextQuestion!;
  const skipped = { ...state, skipped: [first.dimension] };
  const second = analyzeSession(skipped).nextQuestion;

  assert.notEqual(second?.text, first.text);
  assert.notEqual(second?.dimension, first.dimension);
});
