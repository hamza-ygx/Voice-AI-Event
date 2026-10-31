"use client";

import { useEffect, useState } from "react";
import { decodeTip } from "@/lib/tipLink";

export default function TipPage() {
  const [tip, setTip] = useState<string | null>(null);
  const [status, setStatus] = useState("");

  useEffect(() => {
    setTip(decodeTip(window.location.hash.slice(1)));
  }, []);

  if (tip === null) return null;

  const [title, ...rest] = tip.split("\n");
  const body = rest.join("\n").trim() || title;
  const heading = rest.length ? title.replace(/:$/, "") : "Tips från Orben";

  const save = async () => {
    if (navigator.share) {
      try {
        await navigator.share({ title: heading, text: tip });
        return;
      } catch (e) {
        if ((e as { name?: string })?.name === "AbortError") return;
      }
    }
    download();
  };

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(tip);
      setStatus("Kopierat");
    } catch {
      setStatus("Markera texten och kopiera");
    }
  };

  const download = () => {
    const url = URL.createObjectURL(new Blob([tip], { type: "text/plain;charset=utf-8" }));
    const a = document.createElement("a");
    a.href = url;
    a.download = "orben-tips.txt";
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  };

  return (
    <main className="tip-page">
      {tip ? (
        <>
          <h1>{heading}</h1>
          <p className="tip-text">{body}</p>
          <div className="tip-actions">
            <button className="chip primary" onClick={save}>
              Spara i Anteckningar
            </button>
            <button className="chip" onClick={copy}>
              Kopiera
            </button>
            <button className="chip" onClick={download}>
              Ladda ner
            </button>
          </div>
          <p className="tip-status" aria-live="polite">
            {status}
          </p>
          <p className="tip-note">Tipset finns bara i den här länken och sparas inte någon annanstans.</p>
        </>
      ) : (
        <p className="tip-text">Tipset kunde inte läsas. Skanna QR-koden igen.</p>
      )}
    </main>
  );
}
