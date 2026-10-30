"use client";

import { useCallback, useState } from "react";
import { CHARACTERS, type CharacterId } from "@/lib/characters";
import ConversationScreen from "./ConversationScreen";

export default function Booth() {
  const [selected, setSelected] = useState<CharacterId | null>(null);
  const [round, setRound] = useState(0);
  const exit = useCallback(() => {
    setSelected(null);
    setRound((n) => n + 1);
  }, []);

  const character = CHARACTERS.find((c) => c.id === selected);
  if (character) return <ConversationScreen key={round} character={character} onExit={exit} />;

  return (
    <main className="screen picker">
      <h1 className="picker-title">Vem vill du prata med?</h1>
      <div className="picker-grid">
        {CHARACTERS.map((c) => (
          <button
            key={c.id}
            className="pick"
            onClick={() => setSelected(c.id)}
            style={{ "--c": c.color, "--g": c.glow } as React.CSSProperties}
          >
            <div className="pick-orb" />
            <div className="pick-name">{c.name}</div>
            <div className="pick-example">”{c.example}”</div>
          </button>
        ))}
      </div>
      <div className="wordmark">RKJH</div>
    </main>
  );
}
