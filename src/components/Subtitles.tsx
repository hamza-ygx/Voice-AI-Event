"use client";

import { useEffect, useRef, useState } from "react";
import QRCode from "qrcode";
import { encodeTip } from "@/lib/tipLink";

export type RevealMode = "hold" | "pace" | "all";

const CHARS_PER_SECOND = 15;

type Props = {
  text: string;
  userSaid: string;
  mode: RevealMode;
  rate: number;
  takeHome: string | null;
};

function cutAtWord(text: string, n: number) {
  if (n >= text.length) return text;
  const space = text.lastIndexOf(" ", n);
  return space > 0 ? text.slice(0, space) : "";
}

function TakeHome({ text }: { text: string }) {
  const [svg, setSvg] = useState("");
  useEffect(() => {
    let alive = true;
    const link = `${window.location.origin}/tips#${encodeTip(text)}`;
    QRCode.toString(link, { type: "svg", errorCorrectionLevel: "L", margin: 1, color: { dark: "#07080c", light: "#ffffff" } })
      .then((s) => alive && setSvg(s))
      .catch(() => alive && setSvg(""));
    return () => {
      alive = false;
    };
  }, [text]);
  if (!svg) return null;
  return (
    <div className="takehome">
      <div className="takehome-qr" dangerouslySetInnerHTML={{ __html: svg }} />
      <div className="takehome-label">Skanna för att spara tipset</div>
    </div>
  );
}

export default function Subtitles({ text, mode, rate, takeHome }: Props) {
  const [shown, setShown] = useState(0);
  const shownRef = useRef(0);

  useEffect(() => {
    if (!text) {
      shownRef.current = 0;
      setShown(0);
      return;
    }
    if (mode === "all") {
      shownRef.current = text.length;
      setShown(text.length);
      return;
    }
    if (mode === "hold") return;
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      shownRef.current = text.length;
      setShown(text.length);
      return;
    }
    let raf = 0;
    let last = performance.now();
    const step = (now: number) => {
      shownRef.current = Math.min(text.length, shownRef.current + ((now - last) / 1000) * CHARS_PER_SECOND * rate);
      last = now;
      setShown(Math.floor(shownRef.current));
      if (shownRef.current < text.length) raf = requestAnimationFrame(step);
    };
    raf = requestAnimationFrame(step);
    return () => cancelAnimationFrame(raf);
  }, [text, mode, rate]);

  const visible = cutAtWord(text, shown);

  return (
    <div className="subtitles" aria-live="polite">
      {visible && <p>{visible}</p>}
      {takeHome && mode === "all" && <TakeHome text={takeHome} />}
    </div>
  );
}
