"use client";

import { FormEvent, useMemo, useState } from "react";
import { CofreSession, ENGINE_VERSION, applyAnswer, composePrompt, nextQuestion, summary } from "@/lib/cofre";

type View = "intent" | "interview" | "result" | "review";

const initialSession: CofreSession = { originalRequest: "", answers: [], skipped: [] };

function Logo() {
  return <div className="logo" aria-label="PromptExIA"><span className="logoMark">P</span><span>Prompt<span className="accent">Ex</span>IA</span></div>;
}

export default function Home() {
  const [view, setView] = useState<View>("intent");
  const [session, setSession] = useState<CofreSession>(initialSession);
  const [draft, setDraft] = useState("");
  const [copied, setCopied] = useState(false);
  const [adjusting, setAdjusting] = useState(false);
  const [reviewSession, setReviewSession] = useState<CofreSession | null>(null);
  const question = useMemo(() => nextQuestion(session), [session]);
  const prompt = useMemo(() => composePrompt(session), [session]);
  const currentStep = question ? ["contexto", "objetivo", "formato", "restricoes", "exemplo"].indexOf(question.dimension) + 1 : 5;

  function start(event: FormEvent) {
    event.preventDefault();
    if (!draft.trim()) return;
    const next = { ...initialSession, originalRequest: draft.trim() };
    setSession(next);
    setDraft("");
    setView(nextQuestion(next) ? "interview" : "result");
  }

  function answer(value = draft) {
    if (!question || !value.trim()) return;
    const next = applyAnswer(session, question, value);
    setSession(next);
    setDraft("");
    if (!nextQuestion(next)) setView("result");
  }

  function skip() {
    if (!question) return;
    const next = { ...session, skipped: [...session.skipped, question.dimension] };
    setSession(next);
    if (!nextQuestion(next)) setView("result");
  }

  function reset() {
    setSession(initialSession);
    setDraft("");
    setAdjusting(false);
    setView("intent");
  }

  async function copyPrompt() {
    await navigator.clipboard.writeText(prompt);
    setCopied(true);
    window.setTimeout(() => setCopied(false), 1800);
  }

  function adjust(event: FormEvent) {
    event.preventDefault();
    if (!draft.trim()) return;
    setSession({ ...session, originalRequest: `${session.originalRequest}\n\nAjuste solicitado: ${draft.trim()}` });
    setDraft("");
    setAdjusting(false);
  }

  function updateAnswer(index: number, answer: string) {
    if (!reviewSession) return;
    setReviewSession({ ...reviewSession, answers: reviewSession.answers.map((item, itemIndex) => itemIndex === index ? { ...item, answer } : item) });
  }

  function removeAnswer(index: number) {
    if (!reviewSession) return;
    setReviewSession({ ...reviewSession, answers: reviewSession.answers.filter((_, itemIndex) => itemIndex !== index) });
  }

  function openReview() {
    setReviewSession({ ...session, answers: session.answers.map((item) => ({ ...item })), skipped: [...session.skipped] });
    setView("review");
  }

  function saveReview() {
    if (!reviewSession) return;
    setSession({ ...reviewSession, originalRequest: reviewSession.originalRequest.trim(), answers: reviewSession.answers.filter((item) => item.answer.trim()).map((item) => ({ ...item, answer: item.answer.trim() })) });
    setReviewSession(null);
    setView("result");
  }

  function cancelReview() {
    setReviewSession(null);
    setView("result");
  }

  return (
    <main>
      <header><Logo /><div className="enginePill"><span /> COFRE Engine <b>{ENGINE_VERSION}</b></div></header>

      {view === "intent" && (
        <section className="hero shell">
          <div className="kicker">Clareza antes do comando</div>
          <h1>O que você quer<br />fazer com <em>IA?</em></h1>
          <p className="lead">Explique do seu jeito. Algumas perguntas inteligentes transformam sua ideia em um prompt pronto para qualquer IA.</p>
          <form className="intentCard" onSubmit={start}>
            <label htmlFor="intent">Sua ideia</label>
            <textarea id="intent" autoFocus value={draft} maxLength={12000} onChange={(e) => setDraft(e.target.value)} placeholder="Ex.: Quero preparar uma apresentação para convencer a diretoria a investir mais em pesquisa com usuários…" />
            <div className="cardFooter"><span>{draft.length.toLocaleString("pt-BR")} / 12.000</span><button className="primary" disabled={!draft.trim()}>Continuar <span>→</span></button></div>
          </form>
          <div className="trust"><span>✦</span><p><b>Sem formulários complicados.</b><br />O COFRE identifica apenas o que realmente faz diferença.</p></div>
          <section className="cofreIntro" aria-labelledby="cofre-title">
            <div className="cofreIntroCopy">
              <div className="kicker">Por trás do PromptExIA</div>
              <h2 id="cofre-title">O que é o Framework <em>C.O.F.R.E.?</em></h2>
              <p>É uma metodologia para transformar uma ideia ainda incompleta em uma instrução clara e útil para sistemas de IA. Você conversa naturalmente; o Engine identifica, nos bastidores, apenas as informações que podem melhorar o resultado.</p>
              <div className="notForm"><span>✦</span><b>COFRE é um modelo de diagnóstico, não um formulário.</b></div>
            </div>
            <div className="cofreDimensions">
              {[
                ["C", "Contexto", "A situação, o público e o cenário que ajudam a IA a interpretar o pedido."],
                ["O", "Objetivo", "O resultado que você realmente quer alcançar — não apenas a tarefa."],
                ["F", "Formato", "Como a resposta precisa chegar para ser imediatamente utilizável."],
                ["R", "Restrições", "Os limites, critérios e condições que precisam ser respeitados."],
                ["E", "Exemplo", "Uma referência útil quando ela ajuda a reduzir ambiguidades."],
              ].map(([letter, title, description]) => (
                <article key={letter}>
                  <i>{letter}</i>
                  <div><h3>{title}</h3><p>{description}</p></div>
                </article>
              ))}
            </div>
          </section>
        </section>
      )}

      {view === "interview" && question && (
        <section className="interview shell narrow">
          <button className="back" onClick={() => setView("intent")}>← Voltar</button>
          <div className="progress" aria-label={`Passo ${currentStep} de 5`}><span style={{ width: `${currentStep * 20}%` }} /></div>
          <div className="kicker">{question.eyebrow}</div>
          <h2>{question.text}</h2>
          <p className="lead">{question.hint}</p>
          {!!question.options.length && <div className="chips">{question.options.map((option) => <button key={option} onClick={() => answer(option)}>{option}</button>)}</div>}
          <div className="answerBox">
            <textarea autoFocus value={draft} onChange={(e) => setDraft(e.target.value)} placeholder="Escreva do seu jeito…" />
            <button className="primary round" onClick={() => answer()} disabled={!draft.trim()} aria-label="Enviar resposta">→</button>
          </div>
          <div className="interviewActions"><button onClick={skip}>Não sei / Pular</button><button onClick={() => setView("result")}>Gerar com o que já temos</button></div>
        </section>
      )}

      {view === "result" && (
        <section className="result shell">
          <div className="resultTop"><div><div className="kicker success">✓ Prompt validado</div><h2>Seu Prompt COFRE<br />está pronto.</h2></div><button className="secondary" onClick={reset}>＋ Criar outro</button></div>
          <div className="resultGrid">
            <article className="promptCard">
              <div className="promptHead"><span className="universal">◎ Universal</span><span>Pronto para usar em qualquer IA</span></div>
              <pre>{prompt}</pre>
              <button className="copy" onClick={copyPrompt}>{copied ? "✓ Copiado" : "▣ Copiar prompt"}</button>
            </article>
            <aside>
              <h3>Como ele foi construído</h3>
              <p>O COFRE organizou sua intenção em cinco dimensões — sem inventar detalhes.</p>
              <div className="summary">{summary(session).map(([label, value], index) => <div key={label}><i>{index + 1}</i><span><b>{label}</b><small>{value}</small></span></div>)}</div>
            </aside>
          </div>
          {adjusting ? <form className="adjustBox" onSubmit={adjust}><input autoFocus value={draft} onChange={(e) => setDraft(e.target.value)} placeholder="Ex.: deixe mais executivo e limite a 10 tópicos" /><button className="primary">Aplicar ajuste</button></form> : <div className="resultActions"><button onClick={() => setAdjusting(true)}>✎ Ajustar prompt</button><button onClick={openReview}>↶ Revisar respostas</button></div>}
        </section>
      )}

      {view === "review" && reviewSession && (
        <section className="review shell narrow">
          <button className="back" onClick={cancelReview}>← Voltar ao prompt</button>
          <div className="kicker">Revise antes de regenerar</div>
          <h2>Suas respostas</h2>
          <p className="lead">Edite o que mudou ou remova uma resposta que não deve fazer parte do prompt.</p>
          <div className="reviewList">
            <article>
              <label htmlFor="original-request">Pedido inicial</label>
              <textarea id="original-request" value={reviewSession.originalRequest} onChange={(event) => setReviewSession({ ...reviewSession, originalRequest: event.target.value })} />
            </article>
            {reviewSession.answers.map((item, index) => (
              <article key={`${item.question}-${index}`}>
                <div className="reviewLabel"><label htmlFor={`answer-${index}`}>{item.question}</label><button onClick={() => removeAnswer(index)} aria-label={`Remover resposta: ${item.answer}`}>Remover</button></div>
                <textarea id={`answer-${index}`} value={item.answer} onChange={(event) => updateAnswer(index, event.target.value)} />
              </article>
            ))}
          </div>
          <div className="reviewActions"><button className="secondary" onClick={cancelReview}>Cancelar</button><button className="primary" disabled={!reviewSession.originalRequest.trim()} onClick={saveReview}>Salvar e regenerar</button></div>
        </section>
      )}

      <footer><span>PromptExIA</span><span>Intenção clara. Resultado melhor.</span><span>Privacidade por padrão</span></footer>
    </main>
  );
}
