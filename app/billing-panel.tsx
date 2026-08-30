"use client";

import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
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
  const [portalHost, setPortalHost] = useState<HTMLElement | null>(null);

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

  async function confirmReturnedPayment(current: Session | null) {
    const params = new URLSearchParams(window.location.search);
    const sessionId = params.get("session_id");
    if (params.get("payment") !== "success" || !sessionId || !current?.access_token) return;

    setMessage("Pagamento confirmado. Adicionando suas consultas…");
    const response = await fetch("/api/stripe/confirm", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${current.access_token}`,
      },
      body: JSON.stringify({ sessionId }),
    });

    if (!response.ok) {
      setMessage("O pagamento foi recebido, mas o saldo ainda está sendo confirmado.");
      return;
    }

    await refresh(current);
    setMessage("Consultas adicionadas ao seu saldo.");
    const cleanUrl = new URL(window.location.href);
    cleanUrl.searchParams.delete("payment");
    cleanUrl.searchParams.delete("session_id");
    window.history.replaceState({}, "", cleanUrl.toString());
  }

  useEffect(() => {
    const footer = document.querySelector("main > footer");
    if (!footer?.parentElement) return;

    let host = document.getElementById("billing-portal-host") as HTMLElement | null;
    const createdHere = !host;
    if (!host) {
      host = document.createElement("div");
      host.id = "billing-portal-host";
      footer.parentElement.insertBefore(host, footer);
    }
    setPortalHost(host);

    return () => {
      if (createdHere && host?.parentElement) host.remove();
    };
  }, []);

  useEffect(() => {
    if (!isSupabaseConfigured()) return;
    const supabase = getSupabaseBrowserClient();
    let mounted = true;

    supabase.auth.getSession().then(({ data }) => {
      if (!mounted) return;
      setSession(data.session);
      void refresh(data.session);
      void confirmReturnedPayment(data.session);
    });

    const { data: listener } = supabase.auth.onAuthStateChange((_event, nextSession) => {
      if (!mounted) return;
      setSession(nextSession);
      void refresh(nextSession);
    });

    const params = new URLSearchParams(window.location.search);
    if (params.get("payment") === "cancelled") {
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

  if (!session || !portalHost) return null;

  return createPortal(
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
    </section>,
    portalHost,
  );
}
