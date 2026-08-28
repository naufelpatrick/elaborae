import assert from "node:assert/strict";
import test from "node:test";
import { analyzeSession, applyAnswer, composePrompt } from "../lib/cofre.ts";
import type { CofreSession, Dimension } from "../lib/cofre.ts";

const createSession = (originalRequest: string): CofreSession => ({ originalRequest, answers: [], skipped: [] });

test("entrevista segue os cinco passos do COFRE uma única vez", () => {
  let state = createSession("Quero preparar um workshop.");
  const answers = [
    "Será sobre Jobs to Be Done para designers de produto.",
    "Quero que consigam aplicar a metodologia no dia a dia.",
    "Um roteiro com agenda e atividades práticas.",
    "Duas horas, para no máximo 15 participantes.",
    "Use como referência um workshop mão na massa.",
  ];
  const expected: Dimension[] = ["contexto", "objetivo", "formato", "restricoes", "exemplo"];
  const questions: string[] = [];

  for (const [index, answer] of answers.entries()) {
    const analysis = analyzeSession(state);
    assert.equal(analysis.nextAction, "ASK");
    assert.equal(analysis.nextQuestion?.dimension, expected[index]);
    assert.match(analysis.nextQuestion?.eyebrow ?? "", new RegExp(`Passo ${index + 1} de 5`, "i"));
    questions.push(analysis.nextQuestion!.text);
    state = applyAnswer(state, analysis.nextQuestion!, answer);
  }

  assert.equal(new Set(questions).size, 5);
  assert.equal(analyzeSession(state).nextAction, "COMPOSE");
  assert.equal(analyzeSession(state).nextQuestion, null);
});

test("respostas permanecem na dimensão que foi perguntada", () => {
  let state = createSession("Quero preparar um workshop.");
  for (const answer of ["Equipe de produto", "Duas horas", "Duas horas", "Formato executivo", "Sem exemplo"]) {
    const question = analyzeSession(state).nextQuestion!;
    state = applyAnswer(state, question, answer);
  }
  assert.deepEqual(state.answers.map((answer) => answer.dimension), ["contexto", "objetivo", "formato", "restricoes", "exemplo"]);
});

test("pular avança para a etapa seguinte sem repetir", () => {
  let state = createSession("Quero preparar um workshop.");
  const seen: Dimension[] = [];
  for (let index = 0; index < 5; index += 1) {
    const question = analyzeSession(state).nextQuestion!;
    seen.push(question.dimension);
    state = { ...state, skipped: [...state.skipped, question.dimension] };
  }
  assert.deepEqual(seen, ["contexto", "objetivo", "formato", "restricoes", "exemplo"]);
  assert.equal(analyzeSession(state).nextAction, "COMPOSE");
});

test("prompt final contém as cinco dimensões respondidas", () => {
  let state = createSession("Quero preparar um workshop.");
  for (const answer of ["Equipe de design", "Aplicar JTBD", "Roteiro", "Duas horas", "Workshop da empresa"]) {
    const question = analyzeSession(state).nextQuestion!;
    state = applyAnswer(state, question, answer);
  }
  const prompt = composePrompt(state);
  assert.match(prompt, /Contexto de uso: Equipe de design/i);
  assert.match(prompt, /Resultado esperado: Aplicar JTBD/i);
  assert.match(prompt, /Formato da entrega: Roteiro/i);
  assert.match(prompt, /Critérios e limites: Duas horas/i);
  assert.match(prompt, /Referência útil: Workshop da empresa/i);
});
