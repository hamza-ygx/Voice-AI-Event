"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";

const MAX_LEN = 12;

export default function PinScreen() {
  const router = useRouter();
  const [pin, setPin] = useState("");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState("");
  const [shake, setShake] = useState(false);

  const submit = useCallback(async () => {
    if (!pin || busy) return;
    setBusy(true);
    setMsg("");
    try {
      const res = await fetch("/api/pin", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ pin }),
      });
      if (res.ok) {
        router.refresh();
        return;
      }
      setMsg(res.status === 429 ? "För många försök. Vänta några minuter." : "Fel PIN-kod.");
      setShake(true);
      setTimeout(() => setShake(false), 400);
      setPin("");
    } catch {
      setMsg("Ingen anslutning. Kontrollera internet.");
    } finally {
      setBusy(false);
    }
  }, [pin, busy, router]);

  const press = useCallback((d: string) => {
    setMsg("");
    setPin((p) => (p.length < MAX_LEN ? p + d : p));
  }, []);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (/^\d$/.test(e.key)) press(e.key);
      else if (e.key === "Backspace") setPin((p) => p.slice(0, -1));
      else if (e.key === "Enter") submit();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [press, submit]);

  return (
    <main className="screen pin">
      <h1>Ange PIN</h1>
      <div className={`pin-dots${shake ? " shake" : ""}`} aria-label={`${pin.length} siffror`}>
        {Array.from({ length: pin.length }, (_, i) => (
          <span key={i} />
        ))}
      </div>
      <div className="keypad">
        {["1", "2", "3", "4", "5", "6", "7", "8", "9"].map((d) => (
          <button key={d} onClick={() => press(d)} disabled={busy}>
            {d}
          </button>
        ))}
        <button onClick={() => setPin((p) => p.slice(0, -1))} disabled={busy} aria-label="Radera">
          ←
        </button>
        <button onClick={() => press("0")} disabled={busy}>
          0
        </button>
        <button onClick={submit} disabled={busy || !pin} aria-label="OK">
          OK
        </button>
      </div>
      <div className="pin-msg" role="alert">
        {msg}
      </div>
    </main>
  );
}
