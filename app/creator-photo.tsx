"use client";

import { useEffect } from "react";

export default function CreatorPhotoRepair() {
  useEffect(() => {
    let mounted = true;

    fetch("/patrick-naufel-small.b64", { cache: "force-cache" })
      .then((response) => {
        if (!response.ok) throw new Error("PHOTO_NOT_FOUND");
        return response.text();
      })
      .then((base64) => {
        if (!mounted) return;
        const clean = base64.trim();
        if (!clean.startsWith("/9j/")) return;

        const image = document.querySelector<HTMLImageElement>('.creatorPhotoWrap img[src="/patrick-naufel.jpg"]');
        if (image) image.src = `data:image/jpeg;base64,${clean}`;
      })
      .catch(() => undefined);

    return () => {
      mounted = false;
    };
  }, []);

  return null;
}
