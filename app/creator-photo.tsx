"use client";

import { useEffect } from "react";

const CREATOR_PHOTO_URL = "https://avatars.githubusercontent.com/u/52705137?v=4";

export default function CreatorPhotoRepair() {
  useEffect(() => {
    const image = document.querySelector<HTMLImageElement>(".creatorPhotoWrap img");
    if (!image) return;

    image.decoding = "async";
    image.referrerPolicy = "no-referrer";
    image.src = CREATOR_PHOTO_URL;
  }, []);

  return null;
}
