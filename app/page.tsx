"use client";

import { FormEvent, useEffect, useRef, useState } from "react";
import {
  CofreSession,
  ENGINE_VERSION,
  Question,
  applyAnswer,
  composePrompt,
  nextQuestion as fallbackNextQuestion,
  summary,
} from "@/lib/cofre";

type View = "intent" | "interview" | "result" | "review";
type LoadingMode = "intent" | "answer" | "compose" | "adjust" | "review" | null;
type EngineReply = {
  source: "llm" | "fallback";
  question: Question | null;
  prompt: string | null;
  assumptions: string[];
  usage?: { freeLimitReached: boolean };
};

const initialSession: CofreSession = { originalRequest: "", answers: [], skipped: [] };

const loadingCopy: Record<Exclude<LoadingMode, null>, { title: string; detail: string }> = {
  intent: {
    title: "Entendendo sua ideia…",
    detail: "Identificando o que realmente precisa ser esclarecido antes de seguir.",
  },
  answer: {
    title: "Aprofundando sua resposta…",
    detail: "Avaliando se vale explorar mais algum ponto ou se já temos clareza suficiente.",
  },
  compose: {
    title: "Elaborando sua ideia…",
    detail: "Ampliando a execução sem mudar sua intenção e preparando um prompt realmente útil.",
  },
  adjust: {
    title: "Refinando o prompt…",
    detail: "Incorporando seu ajuste e validando a nova versão antes de entregar.",
  },
  review: {
    title: "Regenerando com suas revisões…",
    detail: "Reorganizando o contexto e reconstruindo o prompt com as mudanças que você fez.",
  },
};

function Logo() {
  return <div className="logo" aria-label="Elaborae"><span className="logoMark">E</span><span>Elabor<span className="accent">ae</span></span></div>;
}

function Thinking({ mode }: { mode: Exclude<LoadingMode, null> }) {
  const copy = loadingCopy[mode];
  return (
    <div className="thinkingOverlay" role="status" aria-live="polite" aria-busy="true">
      <div className="thinkingCard">
        <div className="thinkingMark" aria-hidden="true"><span /><span /><span /></div>
        <div>
          <strong>{copy.title}</strong>
          <p>{copy.detail}</p>
        </div>
      </div>
    </div>
  );
}

export default function Home() {
  const [view, setView] = useState<View>("intent");
  const [session, setSession] = useState<CofreSession>(initialSession);
  const [question, setQuestion] = useState<Question | null>(null);
  const [prompt, setPrompt] = useState("");
  const [draft, setDraft] = useState("");
  const [copied, setCopied] = useState(false);
  const [adjusting, setAdjusting] = useState(false);
  const [reviewSession, setReviewSession] = useState<CofreSession | null>(null);
  const [busy, setBusy] = useState(false);
  const [loadingMode, setLoadingMode] = useState<LoadingMode>(null);
  const [limitReached, setLimitReached] = useState(false);
  const consultationIdRef = useRef<string | null>(null);
  const currentStep = question ? ["contexto", "objetivo", "formato", "restricoes", "exemplo"].indexOf(question.dimension) + 1 : 5;

  function getConsultationId() {
    if (!consultationIdRef.current) {
      consultationIdRef.current = globalThis.crypto?.randomUUID?.() || `elabora-${Date.now()}-${Math.random().toString(36).slice(2)}`;
    }
    return consultationIdRef.current;
  }

  useEffect(() => {
    let mounted = true;
    fetch("/api/elabora", { cache: "no-store" })
      .then((response) => response.json())
      .then((data: { usage?: { freeUsed?: boolean } }) => {
        if (mounted) setLimitReached(Boolean(data.usage?.freeUsed));
      })
      .catch(() => undefined);
    return () => { mounted = false; };
  }, []);

  async function requestEngine(nextSession: CofreSession, forceCompose = false, mode: Exclude<LoadingMode, null> = forceCompose ? "compose" : "answer") {
    setLoadingMode(mode);
    setBusy(true);
    try {
      const response = await fetch("/api/elabora", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ session: nextSession, forceCompose, consultationId: getConsultationId() }),
      });

      if (response.status === 429) {
        setLimitReached(true);
        setView("intent");
        return false;
      }
      if (!response.ok) throw new Error("ENGINE_REQUEST_FAILED");

      const result = await response.json() as EngineReply;
      setQuestion(result.question);
      if (result.usage?.freeLimitReached) setLimitReached(true);

      if (result.prompt) {
        setPrompt(result.prompt);
        setView("result");
      } else if (result.question) {
        setView("interview");
      } else {
        setPrompt(composePrompt(nextSession));
        setView("result");
      }
      return true;
    } catch {
      const fallbackQuestion = forceCompose ? null : fallbackNextQuestion(nextSession);
      setQuestion(fallbackQuestion);
      if (fallbackQuestion) {
        setView("interview");
      } else {
        setPrompt(composePrompt(nextSession));
        setView("result");
      }
      return true;
    } finally {
      setBusy(false);
      setLoadingMode(null);
    }
  }

  async function start(event: FormEvent) {
    event.preventDefault();
    if (!draft.trim() || busy || limitReached) return;
    const next = { ...initialSession, originalRequest: draft.trim() };
    setSession(next);
    const completed = await requestEngine(next, false, "intent");
    if (completed) setDraft("");
  }

  async function answer(value = draft) {
    if (!question || !value.trim() || busy) return;
    const next = applyAnswer(session, question, value);
    setSession(next);
    const completed = await requestEngine(next, false, "answer");
    if (completed) setDraft("");
  }

  async function skip() {
    if (!question || busy) return;
    const next = { ...session, skipped: [...session.skipped, question.dimension] };
    setSession(next);
    await requestEngine(next, false, "answer");
  }

  function reset() {
    if (limitReached) return;
    setSession(initialSession);
    setQuestion(null);
    setPrompt("");
    setDraft("");
    setAdjusting(false);
    setLoadingMode(null);
    consultationIdRef.current = null;
    setView("intent");
  }

  async function copyPrompt() {
    await navigator.clipboard.writeText(prompt);
    setCopied(true);
    window.setTimeout(() => setCopied(false), 1800);
  }

  async function adjust(event: FormEvent) {
    event.preventDefault();
    if (!draft.trim() || busy) return;
    const next = { ...session, originalRequest: `${session.originalRequest}\n\nAjuste solicitado: ${draft.trim()}` };
    setSession(next);
    setAdjusting(false);
    const completed = await requestEngine(next, true, "adjust");
    if (completed) setDraft("");
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

  async function saveReview() {
    if (!reviewSession || busy) return;
    const next = {
      ...reviewSession,
      originalRequest: reviewSession.originalRequest.trim(),
      answers: reviewSession.answers.filter((item) => item.answer.trim()).map((item) => ({ ...item, answer: item.answer.trim() })),
    };
    setSession(next);
    setReviewSession(null);
    await requestEngine(next, true, "review");
  }

  function cancelReview() {
    setReviewSession(null);
    setView("result");
  }

  return (
    <main>
      <header><Logo /><div className="enginePill"><span /> COFRE Engine <b>{ENGINE_VERSION}</b></div></header>
      {busy && loadingMode && <Thinking mode={loadingMode} />}

      {view === "intent" && (
        <section className="hero shell">
          <div className="kicker">Clareza antes do comando</div>
          <h1>O que você quer<br />fazer com <em>IA?</em></h1>
          <p className="lead">Explique do seu jeito. Algumas perguntas inteligentes transformam sua ideia em um prompt pronto para qualquer IA.</p>
          {limitReached && (
            <div className="limitNotice" role="status" aria-live="polite">
              <span aria-hidden="true">✓</span>
              <div><b>Limite gratuito utilizado</b><p>Você já usou sua consulta gratuita nesta sessão do navegador. Em breve teremos novos planos de acesso.</p></div>
            </div>
          )}
          <form className={`intentCard${limitReached ? " locked" : ""}`} onSubmit={start}>
            <label htmlFor="intent">Sua ideia</label>
            <textarea id="intent" autoFocus={!limitReached} disabled={limitReached || busy} value={draft} maxLength={12000} onChange={(e) => setDraft(e.target.value)} placeholder={limitReached ? "Sua consulta gratuita nesta sessão já foi utilizada." : "Ex.: Quero preparar uma apresentação para convencer a diretoria a investir mais em pesquisa com usuários…"} />
            <div className="cardFooter"><span>{draft.length.toLocaleString("pt-BR")} / 12.000</span><button className="primary" disabled={!draft.trim() || busy || limitReached}>{limitReached ? "Limite gratuito utilizado" : <>Continuar <span>→</span></>}</button></div>
          </form>
          <div className="trust"><span>✦</span><p><b>Sem formulários complicados.</b><br />O COFRE identifica apenas o que realmente faz diferença.</p></div>
          <section className="cofreIntro" aria-labelledby="cofre-title">
            <div className="cofreIntroCopy">
              <div className="kicker">Por trás do Elaborae</div>
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
          <button className="back" disabled={busy} onClick={() => setView("intent")}>← Voltar</button>
          <div className="progress" aria-label={`Etapa de refinamento ${currentStep}`}><span style={{ width: `${currentStep * 20}%` }} /></div>
          <div className="kicker">{question.eyebrow}</div>
          <h2>{question.text}</h2>
          <p className="lead">{question.hint}</p>
          {!!question.options.length && <div className="chips">{question.options.map((option) => <button key={option} disabled={busy} onClick={() => answer(option)}>{option}</button>)}</div>}
          <div className="answerBox">
            <textarea autoFocus disabled={busy} value={draft} onChange={(e) => setDraft(e.target.value)} placeholder="Escreva do seu jeito…" />
            <button className="primary round" onClick={() => answer()} disabled={!draft.trim() || busy} aria-label="Enviar resposta">→</button>
          </div>
          <div className="interviewActions"><button disabled={busy} onClick={skip}>Não sei / Pular</button><button disabled={busy} onClick={() => requestEngine(session, true, "compose")}>Gerar com o que já temos</button></div>
        </section>
      )}

      {view === "result" && (
        <section className="result shell">
          <div className="resultTop"><div><div className="kicker success">✓ Prompt validado</div><h2>Seu Prompt COFRE<br />está pronto.</h2></div><button className="secondary" disabled={busy || limitReached} onClick={reset}>{limitReached ? "✓ Consulta gratuita utilizada" : "＋ Criar outro"}</button></div>
          <div className="resultGrid">
            <article className="promptCard">
              <div className="promptHead"><span className="universal">◎ Universal</span><span>Pronto para usar em qualquer IA</span></div>
              <pre>{prompt}</pre>
              <button className="copy" disabled={busy} onClick={copyPrompt}>{copied ? "✓ Copiado" : "▣ Copiar prompt"}</button>
            </article>
            <aside>
              <h3>Como ele foi construído</h3>
              <p>O COFRE organizou sua intenção em cinco dimensões — sem inventar detalhes.</p>
              <div className="summary">{summary(session).map(([label, value], index) => <div key={label}><i>{index + 1}</i><span><b>{label}</b><small>{value}</small></span></div>)}</div>
            </aside>
          </div>
          {limitReached && <div className="usageNote"><b>Consulta gratuita utilizada.</b> Você ainda pode ajustar ou revisar este prompt, mas não iniciar uma nova consulta nesta sessão do navegador.</div>}
          {adjusting ? <form className="adjustBox" onSubmit={adjust}><input autoFocus disabled={busy} value={draft} onChange={(e) => setDraft(e.target.value)} placeholder="Ex.: deixe mais executivo e limite a 10 tópicos" /><button className="primary" disabled={busy}>Aplicar ajuste</button></form> : <div className="resultActions"><button disabled={busy} onClick={() => setAdjusting(true)}>✎ Ajustar prompt</button><button disabled={busy} onClick={openReview}>↶ Revisar respostas</button></div>}
        </section>
      )}

      {view === "review" && reviewSession && (
        <section className="review shell narrow">
          <button className="back" disabled={busy} onClick={cancelReview}>← Voltar ao prompt</button>
          <div className="kicker">Revise antes de regenerar</div>
          <h2>Suas respostas</h2>
          <p className="lead">Edite o que mudou ou remova uma resposta que não deve fazer parte do prompt.</p>
          <div className="reviewList">
            <article>
              <label htmlFor="original-request">Pedido inicial</label>
              <textarea id="original-request" disabled={busy} value={reviewSession.originalRequest} onChange={(event) => setReviewSession({ ...reviewSession, originalRequest: event.target.value })} />
            </article>
            {reviewSession.answers.map((item, index) => (
              <article key={`${item.question}-${index}`}>
                <div className="reviewLabel"><label htmlFor={`answer-${index}`}>{item.question}</label><button disabled={busy} onClick={() => removeAnswer(index)} aria-label={`Remover resposta: ${item.answer}`}>Remover</button></div>
                <textarea id={`answer-${index}`} disabled={busy} value={item.answer} onChange={(event) => updateAnswer(index, event.target.value)} />
              </article>
            ))}
          </div>
          <div className="reviewActions"><button className="secondary" disabled={busy} onClick={cancelReview}>Cancelar</button><button className="primary" disabled={!reviewSession.originalRequest.trim() || busy} onClick={saveReview}>Salvar e regenerar</button></div>
        </section>
      )}

      <footer><span>Elaborae</span><span>Ideias claras. Prompts melhores.</span><span>Privacidade por padrão</span></footer>
    </main>
  );
}
