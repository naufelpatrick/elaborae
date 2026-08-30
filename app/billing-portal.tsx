"use client";

import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import BillingPanel from "./billing-panel";

export default function BillingPortal() {
  const [target, setTarget] = useState<HTMLElement | null>(null);

  useEffect(() => {
    const footer = document.querySelector("main > footer");
    if (!footer) return;

    const slot = document.createElement("div");
    slot.className = "billingMount";
    footer.before(slot);
    setTarget(slot);

    return () => {
      slot.remove();
    };
  }, []);

  if (!target) return null;
  return createPortal(<BillingPanel />, target);
}
