"use client";

import { useEffect, useState } from "react";

export default function CreatorPhoto() {
  const [src, setSrc] = useState<string | null>(null);

  useEffect(() => {
    let mounted = true;

    fetch("/patrick-naufel-small.b64", { cache: "force-cache" })
      .then((response) => {
        if (!response.ok) throw new Error("PHOTO_NOT_FOUND");
        return response.text();
      })
      .then((base64) => {
        const clean = base64.trim();
        if (mounted && clean.startsWith("/9j/")) {
          setSrc(`data:image/jpeg;base64,${clean}`);
        }
      })
      .catch(() => {
        if (mounted) setSrc(null);
      });

    return () => {
      mounted = false;
    };
  }, []);

  if (!src) {
    return (
      <div
        aria-hidden="true"
        style={{ width: "100%", height: "100%", display: "grid", placeItems: "center", color: "#71697c", font: "700 44px Manrope, sans-serif" }}
      >
        E
      </div>
    );
  }

  return <img src={src} alt="Patrick Naufel, criador do Elaborae" />;
}
