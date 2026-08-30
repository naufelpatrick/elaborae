"use client";

import { useEffect, useState } from "react";
import type { Session } from "@supabase/supabase-js";
import { getSupabaseBrowserClient, isSupabaseConfigured } from "@/lib/supabase";

type BillingUsage = {
  used: number;
  limit: number;
  limitReached: boolean;
  paidBalance?: number;
};

export default function BillingPanel() {
  const [session, setSession] = useState<Session | null>(null);
  const [usage, setUsage] = useState<BillingUsage | null>(null);
  const [busyPack, setBusyPack] = useState<30 | 60 | null>(null);
  const [message, setMessage] = useState("");

  async function refresh(current: Session | null) {
    if (!current?.access_token) {
      setUsage(null);
      return;
    }
    const response = await fetch("/api/elabora", {
      cache: "no-store",
      headers: { Authorization: `Bearer ${current.access_token}` },
    });
    if (!response.ok) return;
    const data = await response.json() as { usage?: BillingUsage };
    if (data.usage) setUsage(data.usage);
  }

  useEffect(() => {
    if (!isSupabaseConfigured()) return;
    const supabase = getSupabaseBrowserClient();
    let mounted = true;

    supabase.auth.getSession().then(({ data }) => {
      if (!mounted) return;
      setSession(data.session);
      void refresh(data.session);
    });

    const { data: listener } = supabase.auth.onAuthStateChange((_event, nextSession) => {
      if (!mounted) return;
      setSession(nextSession);
      void refresh(nextSession);
    });

    const params = new URLSearchParams(window.location.search);
    if (params.get("payment") === "success") {
      setMessage("Pagamento confirmado. Atualizando seu saldo…");
      window.setTimeout(() => {
        supabase.auth.getSession().then(({ data }) => {
          void refresh(data.session);
          setMessage("Consultas adicionadas ao seu saldo.");
        });
      }, 1800);
    } else if (params.get("payment") === "cancelled") {
      setMessage("Pagamento cancelado. Nenhuma consulta foi cobrada.");
    }

    return () => {
      mounted = false;
      listener.subscription.unsubscribe();
    };
  }, []);

  async function buy(credits: 30 | 60) {
    if (!session?.access_token || busyPack) return;
    setBusyPack(credits);
    setMessage("");
    try {
      const response = await fetch("/api/stripe/checkout", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${session.access_token}`,
        },
        body: JSON.stringify({ credits }),
      });
      const data = await response.json() as { url?: string; message?: string };
      if (!response.ok || !data.url) throw new Error(data.message || "CHECKOUT_FAILED");
      window.location.assign(data.url);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Não foi possível abrir o pagamento agora.");
      setBusyPack(null);
    }
  }

  if (!session) return null;

  return (
    <section className="billingSection" aria-labelledby="billing-title">
      <div className="billingHead">
        <div>
          <div className="kicker">Mais consultas</div>
          <h2 id="billing-title">Continue elaborando.</h2>
          <p>Compre uma vez e use quando quiser. Sem assinatura.</p>
        </div>
        <div className="creditBalance">
          <span>Seu saldo pago</span>
          <strong>{usage?.paidBalance || 0}</strong>
          <small>consultas</small>
        </div>
      </div>

      {message && <div className="billingMessage" role="status">{message}</div>}

      <div className="billingPlans">
        <article>
          <span className="planName">Essencial</span>
          <strong>30 <small>consultas</small></strong>
          <div className="planPrice">R$ 19,90</div>
          <p>R$ 0,66 por consulta</p>
          <button onClick={() => buy(30)} disabled={busyPack !== null}>
            {busyPack === 30 ? "Abrindo pagamento…" : "Comprar 30 consultas"}
          </button>
        </article>
        <article className="featured">
          <span className="planBadge">Melhor custo</span>
          <span className="planName">Mais</span>
          <strong>60 <small>consultas</small></strong>
          <div className="planPrice">R$ 34,90</div>
          <p>R$ 0,58 por consulta</p>
          <button onClick={() => buy(60)} disabled={busyPack !== null}>
            {busyPack === 60 ? "Abrindo pagamento…" : "Comprar 60 consultas"}
          </button>
        </article>
      </div>
      <p className="billingFootnote">Ajustes e revisões do mesmo prompt continuam sem consumir uma nova consulta.</p>
    </section>
  );
}
