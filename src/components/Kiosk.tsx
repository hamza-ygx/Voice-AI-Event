"use client";

import { useEffect } from "react";

const CURSOR_HIDE_MS = 3000;

export default function Kiosk() {
  useEffect(() => {
    let timer: ReturnType<typeof setTimeout> | undefined;
    const body = document.body;

    const showCursor = () => {
      body.classList.remove("cursor-hidden");
      clearTimeout(timer);
      timer = setTimeout(() => body.classList.add("cursor-hidden"), CURSOR_HIDE_MS);
    };
    const blockMenu = (e: Event) => e.preventDefault();
    const goFullscreen = () => {
      if (!document.fullscreenElement) document.documentElement.requestFullscreen?.().catch(() => {});
    };

    showCursor();
    window.addEventListener("pointermove", showCursor);
    window.addEventListener("pointerdown", showCursor);
    window.addEventListener("pointerdown", goFullscreen);
    window.addEventListener("contextmenu", blockMenu);
    window.addEventListener("dragstart", blockMenu);
    return () => {
      clearTimeout(timer);
      body.classList.remove("cursor-hidden");
      window.removeEventListener("pointermove", showCursor);
      window.removeEventListener("pointerdown", showCursor);
      window.removeEventListener("pointerdown", goFullscreen);
      window.removeEventListener("contextmenu", blockMenu);
      window.removeEventListener("dragstart", blockMenu);
    };
  }, []);

  return null;
}
