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
  assert.match(analysis.nextQuestion?.text ?? "", /tema.*fazer ou decidir|tema.*decidir/i);
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
