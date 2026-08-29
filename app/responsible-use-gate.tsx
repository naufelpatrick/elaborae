"use client";

import { useEffect, useState } from "react";
import type { Session } from "@supabase/supabase-js";
import { getSupabaseBrowserClient, isSupabaseConfigured } from "@/lib/supabase";

const ACK_PREFIX = "elaborae:responsible-use:";

function clearAcknowledgements() {
  for (let index = sessionStorage.length - 1; index >= 0; index -= 1) {
    const key = sessionStorage.key(index);
    if (key?.startsWith(ACK_PREFIX)) sessionStorage.removeItem(key);
  }
}

export default function ResponsibleUseGate() {
  const [userId, setUserId] = useState<string | null>(null);
  const [open, setOpen] = useState(false);
  const [read, setRead] = useState(false);

  useEffect(() => {
    if (!isSupabaseConfigured()) return;

    const supabase = getSupabaseBrowserClient();
    let mounted = true;

    function sync(session: Session | null) {
      if (!mounted) return;
      const nextUserId = session?.user?.id || null;
      setUserId(nextUserId);
      setRead(false);

      if (!nextUserId) {
        setOpen(false);
        return;
      }

      const acknowledged = sessionStorage.getItem(`${ACK_PREFIX}${nextUserId}`) === "1";
      setOpen(!acknowledged);
    }

    void supabase.auth.getSession().then(({ data }) => sync(data.session));

    const { data: listener } = supabase.auth.onAuthStateChange((event, session) => {
      if (event === "SIGNED_OUT") clearAcknowledgements();
      sync(session);
    });

    return () => {
      mounted = false;
      listener.subscription.unsubscribe();
    };
  }, []);

  useEffect(() => {
    if (!open) return;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = previousOverflow;
    };
  }, [open]);

  function acknowledge() {
    if (!userId || !read) return;
    sessionStorage.setItem(`${ACK_PREFIX}${userId}`, "1");
    setOpen(false);
  }

  if (!open || !userId) return null;

  return (
    <div className="responsibleGateOverlay">
      <section
        className="responsibleGate"
        role="dialog"
        aria-modal="true"
        aria-labelledby="responsible-use-title"
        aria-describedby="responsible-use-description"
      >
        <div className="responsibleGateMark" aria-hidden="true">E</div>
        <div className="responsibleGateKicker">Antes de começar</div>
        <h2 id="responsible-use-title">Uso responsável do Elaborae</h2>
        <p id="responsible-use-description">
          O Elaborae ajuda a elaborar prompts, mas o conteúdo gerado deve ser revisado antes de ser utilizado.
        </p>

        <ul>
          <li>Revise e valide o prompt antes de utilizá-lo em uma IA.</li>
          <li>Você é responsável pelo uso do material e pelas decisões tomadas a partir dele.</li>
          <li>Pedidos relacionados a fraude, violência, exploração, invasão ou outras atividades nocivas podem ser bloqueados.</li>
          <li>Evite informar dados pessoais, confidenciais ou sensíveis que não sejam necessários.</li>
        </ul>

        <label className="responsibleGateCheck">
          <input type="checkbox" checked={read} onChange={(event) => setRead(event.target.checked)} />
          <span>Li e entendi as orientações de uso responsável.</span>
        </label>

        <button className="primary responsibleGateButton" type="button" disabled={!read} onClick={acknowledge}>
          Entendi e quero continuar <span>→</span>
        </button>
      </section>
    </div>
  );
}
