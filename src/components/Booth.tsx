"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { CHARACTERS, type CharacterId } from "@/lib/characters";
import ConversationScreen, { type Handoff } from "./ConversationScreen";
import Kiosk from "./Kiosk";
import Orb from "./Orb";
import StaffPanel from "./StaffPanel";

const ATTRACT_MS = 4500;
const LONG_PRESS_MS = 1500;

export default function Booth() {
  const [selected, setSelected] = useState<CharacterId | null>(null);
  const [round, setRound] = useState(0);
  const [staff, setStaff] = useState(false);
  const [handoff, setHandoff] = useState<Handoff | null>(null);
  const [tick, setTick] = useState(0);
  const press = useRef<ReturnType<typeof setTimeout> | null>(null);

  const exit = useCallback(() => {
    setSelected(null);
    setHandoff(null);
    setRound((n) => n + 1);
  }, []);

  const switchTo = useCallback((to: CharacterId, h: Handoff) => {
    setHandoff(h);
    setSelected(to);
    setRound((n) => n + 1);
  }, []);

  useEffect(() => {
    if (selected) return;
    const id = setInterval(() => setTick((t) => t + 1), ATTRACT_MS);
    return () => clearInterval(id);
  }, [selected]);

  const startPress = () => {
    press.current = setTimeout(() => setStaff(true), LONG_PRESS_MS);
  };
  const endPress = () => {
    if (press.current) clearTimeout(press.current);
  };

  const character = CHARACTERS.find((c) => c.id === selected);
  const featured = CHARACTERS[tick % CHARACTERS.length];
  const featuredQuestion = featured.examples[Math.floor(tick / CHARACTERS.length) % featured.examples.length];

  return (
    <>
      <Kiosk />
      {character ? (
        <ConversationScreen key={round} character={character} onExit={exit} handoff={handoff} onSwitch={switchTo} />
      ) : (
        <main className="screen picker">
          <h1 className="picker-title">Vem vill du prata med?</h1>
          <div className="picker-grid">
            {CHARACTERS.map((c) => (
              <button
                key={c.id}
                className={`pick${c.id === "kompisen" ? " pick-main" : ""}${c.id === featured.id ? " featured" : ""}`}
                onClick={() => {
                  setHandoff(null);
                  setSelected(c.id);
                }}
                style={{ "--c": c.color, "--g": c.glow } as React.CSSProperties}
              >
                <Orb color={c.color} phase="idle" radius={0.34} density={1} className="pick-orb" />
                <div className="pick-name">{c.name}</div>
                <div className="pick-example">”{c.example}”</div>
              </button>
            ))}
          </div>
          <div className="attract" key={tick} style={{ "--c": featured.color } as React.CSSProperties}>
            Fråga <span>{featured.name}</span>: ”{featuredQuestion}”
          </div>
          <div
            className="wordmark"
            onPointerDown={startPress}
            onPointerUp={endPress}
            onPointerLeave={endPress}
          >
            RKJH
          </div>
        </main>
      )}
      {staff && <StaffPanel onClose={() => setStaff(false)} />}
    </>
  );
}
