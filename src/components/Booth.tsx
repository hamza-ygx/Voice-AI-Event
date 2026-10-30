"use client";

import { useState } from "react";
import { CHARACTERS, type CharacterId } from "@/lib/characters";

export default function Booth() {
  const [status, setStatus] = useState("");

  const pick = async (id: CharacterId) => {
    setStatus("Kontrollerar anslutning…");
    try {
      const res = await fetch("/api/session", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ character: id }),
      });
      setStatus(
        res.ok
          ? "Sessionstoken mottagen."
          : res.status === 503
            ? "Agenten är inte konfigurerad än."
            : `Sessionen misslyckades (${res.status}).`,
      );
    } catch {
      setStatus("Ingen anslutning. Kontrollera internet.");
    }
  };

  return (
    <main className="screen picker">
      <h1 className="picker-title">Vem vill du prata med?</h1>
      <div className="picker-grid">
        {CHARACTERS.map((c) => (
          <button
            key={c.id}
            className="pick"
            onClick={() => pick(c.id)}
            style={{ "--c": c.color, "--g": c.glow } as React.CSSProperties}
          >
            <div className="pick-orb" />
            <div className="pick-name">{c.name}</div>
            <div className="pick-example">”{c.example}”</div>
          </button>
        ))}
      </div>
      <div className="status">{status}</div>
      <div className="wordmark">RKJH</div>
    </main>
  );
}
