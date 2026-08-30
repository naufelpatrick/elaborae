"use client";

import { useEffect, useRef, useState } from "react";
import type { Session } from "@supabase/supabase-js";
import { getSupabaseBrowserClient, isSupabaseConfigured } from "@/lib/supabase";

type PaidUsage = {
  plan: "paid" | "free";
  purchased: number;
  used: number;
  remaining: number;
};

export default function PaidPlanIndicator() {
  const [session, setSession] = useState<Session | null>(null);
  const [usage, setUsage] = useState<PaidUsage | null>(null);
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
      if (!bar) return;

      if (usage?.plan === "paid" && usage.purchased > 0) {
        const label = bar.querySelector("span");
        const counter = bar.querySelector("b");
        const nextCounter = `${usage.used} de ${usage.purchased} consulta${usage.purchased === 1 ? "" : "s"} utilizada${usage.purchased === 1 ? "" : "s"}`;
        if (label && label.textContent !== "Plano Pago") label.textContent = "Plano Pago";
        if (counter && counter.textContent !== nextCounter) counter.textContent = nextCounter;
      }
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
    };
  }, [session, usage]);

  return null;
}
