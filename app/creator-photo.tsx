"use client";

import { useEffect } from "react";

const CREATOR_PHOTO_CHUNKS = ["/patrick-web-01.b64", "/patrick-web-02.b64"] as const;

function base64ToBlobUrl(base64: string) {
  const clean = base64.replace(/\s/g, "");
  if (!clean.startsWith("/9j/")) throw new Error("PHOTO_DATA_INVALID");

  const binary = atob(clean);
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index += 1) {
    bytes[index] = binary.charCodeAt(index);
  }

  return URL.createObjectURL(new Blob([bytes], { type: "image/jpeg" }));
}

export default function CreatorPhotoRepair() {
  useEffect(() => {
    const image = document.querySelector<HTMLImageElement>(".creatorPhotoWrap img");
    if (!image) return;

    let mounted = true;
    let objectUrl: string | null = null;
    image.removeAttribute("data-photo-ready");

    Promise.all(
      CREATOR_PHOTO_CHUNKS.map(async (url) => {
        const response = await fetch(url, { cache: "no-store" });
        if (!response.ok) throw new Error(`PHOTO_CHUNK_NOT_FOUND:${url}`);
        return response.text();
      }),
    )
      .then((parts) => {
        if (!mounted) return;
        objectUrl = base64ToBlobUrl(parts.join(""));
        image.decoding = "async";
        image.onload = () => {
          if (mounted) image.setAttribute("data-photo-ready", "true");
        };
        image.onerror = () => {
          image.removeAttribute("data-photo-ready");
          console.error("[Creator photo] decoded image failed to load");
        };
        image.src = objectUrl;
      })
      .catch((error) => {
        image.removeAttribute("data-photo-ready");
        console.error("[Creator photo]", error);
      });

    return () => {
      mounted = false;
      image.onload = null;
      image.onerror = null;
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, []);

  return null;
}
