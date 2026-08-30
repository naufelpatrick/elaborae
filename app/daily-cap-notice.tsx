"use client";

import { useEffect, useState } from "react";

export default function DailyCapNotice() {
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    const originalFetch = window.fetch.bind(window);

    window.fetch = async (...args) => {
      const response = await originalFetch(...args);

      if (response.status === 429 && response.url.includes("/api/elabora")) {
        try {
          const data = await response.clone().json() as { error?: string };
          if (data.error === "DAILY_FREE_LIMIT_REACHED") setVisible(true);
        } catch {
          // Keep the original response untouched if the payload cannot be read.
        }
      }

      return response;
    };

    return () => {
      window.fetch = originalFetch;
    };
  }, []);

  if (!visible) return null;

  return (
    <div
      role="status"
      aria-live="polite"
      style={{
        position: "fixed",
        left: "50%",
        bottom: 24,
        transform: "translateX(-50%)",
        zIndex: 10000,
        width: "min(92vw, 560px)",
        padding: "18px 20px",
        borderRadius: 18,
        border: "1px solid rgba(36, 27, 53, .12)",
        background: "rgba(255,255,255,.98)",
        boxShadow: "0 18px 60px rgba(36,27,53,.18)",
        color: "#241b35",
        fontFamily: "Manrope, sans-serif",
      }}
    >
      <div style={{ display: "flex", gap: 14, alignItems: "flex-start" }}>
        <div style={{ flex: 1 }}>
          <strong style={{ display: "block", fontSize: 16, marginBottom: 5 }}>Capacidade gratuita de hoje atingida</strong>
          <span style={{ display: "block", fontSize: 13, lineHeight: 1.5, color: "#71697c" }}>
            O Elaborae atingiu o limite de 100 novas consultas gratuitas de hoje. Novas consultas serão liberadas amanhã.
          </span>
        </div>
        <button
          type="button"
          onClick={() => setVisible(false)}
          style={{
            border: 0,
            borderRadius: 10,
            padding: "8px 11px",
            background: "#241b35",
            color: "white",
            cursor: "pointer",
            font: "600 12px Manrope, sans-serif",
          }}
        >
          Entendi
        </button>
      </div>
    </div>
  );
}
