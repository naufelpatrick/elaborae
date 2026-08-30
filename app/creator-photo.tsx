"use client";

import { useEffect } from "react";

const CREATOR_PHOTO_CHUNKS = Array.from(
  { length: 7 },
  (_, index) => `/patrick-exact-${String(index + 1).padStart(2, "0")}.b64`,
);

export default function CreatorPhotoRepair() {
  useEffect(() => {
    let mounted = true;

    Promise.all(
      CREATOR_PHOTO_CHUNKS.map(async (url) => {
        const response = await fetch(url, { cache: "force-cache" });
        if (!response.ok) throw new Error("PHOTO_CHUNK_NOT_FOUND");
        return response.text();
      }),
    )
      .then((parts) => {
        if (!mounted) return;
        const base64 = parts.join("").replace(/\s/g, "");
        if (!base64.startsWith("/9j/")) throw new Error("PHOTO_DATA_INVALID");

        const image = document.querySelector<HTMLImageElement>(".creatorPhotoWrap img");
        if (!image) return;
        image.decoding = "async";
        image.src = `data:image/jpeg;base64,${base64}`;
      })
      .catch((error) => {
        console.error("[Creator photo]", error);
      });

    return () => {
      mounted = false;
    };
  }, []);

  return null;
}
