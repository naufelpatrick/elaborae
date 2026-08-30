"use client";

import { useEffect } from "react";

export default function CreatorPhotoRepair() {
  useEffect(() => {
    const image = document.querySelector<HTMLImageElement>(".creatorPhotoWrap img");
    if (!image) return;

    let mounted = true;
    image.removeAttribute("data-photo-ready");

    image.onload = () => {
      if (mounted) image.setAttribute("data-photo-ready", "true");
    };
    image.onerror = () => {
      image.removeAttribute("data-photo-ready");
      console.error("[Creator photo] jpeg endpoint failed to load");
    };

    image.decoding = "async";
    image.src = `/api/creator-photo?v=${Date.now()}`;

    return () => {
      mounted = false;
      image.onload = null;
      image.onerror = null;
    };
  }, []);

  return null;
}
