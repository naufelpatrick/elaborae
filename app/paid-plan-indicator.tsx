"use client";

import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import type { Session } from "@supabase/supabase-js";
import { getSupabaseBrowserClient, isSupabaseConfigured } from "@/lib/supabase";

type PaidUsage = {
  plan: "paid" | "free";
  purchased: number;
  used: number;
  remaining: number;
};

const LOW_CREDIT_THRESHOLD = 5;

export default function PaidPlanIndicator() {
  const [session, setSession] = useState<Session | null>(null);
  const [usage, setUsage] = useState<PaidUsage | null>(null);
  const [warningHost, setWarningHost] = useState<HTMLElement | null>(null);
  const lastRefreshRef = useRef(0);

  async function refresh(current: Session | null) {
    if (!current?.access_token) {
      setUsage(null);
      return;
    }

    const response = await fetch("/api/billing/usage", {
      cache: "no-store",
      headers: { Authorization: `Bearer ${current.access_token}` },
    });
    if (!response.ok) return;
    const data = await response.json() as PaidUsage;
    setUsage(data);
    lastRefreshRef.current = Date.now();
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

    return () => {
      mounted = false;
      listener.subscription.unsubscribe();
    };
  }, []);

  useEffect(() => {
    if (!session?.access_token) return;

    const sync = () => {
      const bar = document.querySelector<HTMLElement>(".usageBar");
      if (!bar) {
        setWarningHost(null);
        return;
      }

      if (usage?.plan === "paid" && usage.purchased > 0) {
        const label = bar.querySelector("span");
        const counter = bar.querySelector("b");
        const nextCounter = `${usage.used} de ${usage.purchased} consulta${usage.purchased === 1 ? "" : "s"} utilizada${usage.purchased === 1 ? "" : "s"}`;
        if (label && label.textContent !== "Plano Pago") label.textContent = "Plano Pago";
        if (counter && counter.textContent !== nextCounter) counter.textContent = nextCounter;
      }

      let host = document.getElementById("paid-credit-warning-host");
      if (!host) {
        host = document.createElement("div");
        host.id = "paid-credit-warning-host";
        bar.insertAdjacentElement("afterend", host);
      }
      setWarningHost(host);
    };

    const observer = new MutationObserver(() => {
      const hasBar = Boolean(document.querySelector(".usageBar"));
      if (!hasBar) return;
      sync();
      if (Date.now() - lastRefreshRef.current > 1500) void refresh(session);
    });

    observer.observe(document.body, { childList: true, subtree: true, characterData: true });
    sync();

    const onFocus = () => void refresh(session);
    const onVisibility = () => {
      if (document.visibilityState === "visible") void refresh(session);
    };
    window.addEventListener("focus", onFocus);
    document.addEventListener("visibilitychange", onVisibility);

    return () => {
      observer.disconnect();
      window.removeEventListener("focus", onFocus);
      document.removeEventListener("visibilitychange", onVisibility);
      document.getElementById("paid-credit-warning-host")?.remove();
      setWarningHost(null);
    };
  }, [session, usage]);

  const lowCredits = usage?.plan === "paid" && usage.purchased > 0 && usage.remaining <= LOW_CREDIT_THRESHOLD;

  function goToPlans() {
    document.querySelector(".billingSection")?.scrollIntoView({ behavior: "smooth", block: "start" });
  }

  if (!lowCredits || !warningHost || !usage) return null;

  const empty = usage.remaining <= 0;
  return createPortal(
    <div className={`paidCreditWarning${empty ? " empty" : ""}`} role="status" aria-live="polite">
      <div>
        <strong>{empty ? "Seus créditos acabaram." : "Seus créditos estão no fim."}</strong>
        <p>
          {empty
            ? "Compre um novo pacote para iniciar outra consulta."
            : `Você ainda tem ${usage.remaining} consulta${usage.remaining === 1 ? "" : "s"}. Compre mais para continuar sem interrupções.`}
        </p>
      </div>
      <button type="button" onClick={goToPlans}>Comprar mais consultas</button>
    </div>,
    warningHost,
  );
}
