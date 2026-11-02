"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { cueTest } from "@/lib/sounds";
import { getMicId, getShowHeard, getVolume, setMicId, setShowHeard, setVolume } from "@/lib/settings";

type Health = { state: "checking" } | { state: "ok"; ms: number } | { state: "error"; label: string };

const SEARCH_LABELS: Record<string, string> = { ok: "OK", not_configured: "inte inställd" };

export default function StaffPanel({ onClose }: { onClose: () => void }) {
  const [devices, setDevices] = useState<MediaDeviceInfo[]>([]);
  const [micId, setMic] = useState<string>(getMicId() ?? "");
  const [level, setLevel] = useState(0);
  const [micError, setMicError] = useState("");
  const [volume, setVol] = useState(getVolume());
  const [showHeard, setHeard] = useState(getShowHeard());
  const [search, setSearch] = useState("");
  const [health, setHealth] = useState<Health>({ state: "checking" });
  const [online, setOnline] = useState(true);
  const stream = useRef<MediaStream | null>(null);

  const checkHealth = useCallback(async () => {
    setHealth({ state: "checking" });
    try {
      const res = await fetch("/api/health", { cache: "no-store" });
      if (res.status === 401) return setHealth({ state: "error", label: "PIN-inloggningen har gått ut, ladda om sidan" });
      const body = (await res.json()) as { voice?: string; ms?: number; search?: string };
      setSearch(body.search ?? "");
      if (body.voice === "ok") setHealth({ state: "ok", ms: body.ms ?? 0 });
      else setHealth({ state: "error", label: `svarar inte (${body.voice ?? res.status})` });
    } catch {
      setHealth({ state: "error", label: "ingen kontakt med servern" });
    }
  }, []);

  useEffect(() => {
    setOnline(navigator.onLine);
    checkHealth();
  }, [checkHealth]);

  useEffect(() => {
    let raf = 0;
    let ctx: AudioContext | null = null;
    let cancelled = false;
    (async () => {
      try {
        const s = await navigator.mediaDevices.getUserMedia({ audio: micId ? { deviceId: { exact: micId } } : true });
        if (cancelled) return s.getTracks().forEach((t) => t.stop());
        stream.current = s;
        setMicError("");
        const all = await navigator.mediaDevices.enumerateDevices();
        setDevices(all.filter((d) => d.kind === "audioinput"));
        ctx = new AudioContext();
        const analyser = ctx.createAnalyser();
        analyser.fftSize = 512;
        ctx.createMediaStreamSource(s).connect(analyser);
        const data = new Uint8Array(analyser.fftSize);
        const tick = () => {
          analyser.getByteTimeDomainData(data);
          let peak = 0;
          for (const v of data) peak = Math.max(peak, Math.abs(v - 128) / 128);
          setLevel((l) => Math.max(peak, l * 0.9));
          raf = requestAnimationFrame(tick);
        };
        tick();
      } catch {
        setMicError("Mikrofonen kunde inte öppnas. Kontrollera att den är inkopplad och tillåten.");
      }
    })();
    return () => {
      cancelled = true;
      cancelAnimationFrame(raf);
      ctx?.close().catch(() => {});
      stream.current?.getTracks().forEach((t) => t.stop());
      stream.current = null;
    };
  }, [micId]);

  const chooseMic = (id: string) => {
    setMic(id);
    setMicId(id || null);
  };

  const chooseVolume = (v: number) => {
    setVol(v);
    setVolume(v);
  };

  return (
    <div className="staff" role="dialog" aria-label="Personalpanel">
      <div className="staff-card">
        <h2>Personalpanel</h2>

        <section>
          <h3>Mikrofon</h3>
          <select value={micId} onChange={(e) => chooseMic(e.target.value)}>
            <option value="">Standardmikrofon</option>
            {devices.map((d) => (
              <option key={d.deviceId} value={d.deviceId}>
                {d.label || "Mikrofon"}
              </option>
            ))}
          </select>
          <div className="meter">
            <div className="meter-fill" style={{ width: `${Math.min(100, level * 140)}%` }} />
          </div>
          <p className="staff-note">{micError || "Prata nära mikrofonen – stapeln ska slå ut ordentligt."}</p>
        </section>

        <section>
          <h3>Ljud</h3>
          <div className="staff-row">
            <input
              type="range"
              min={0.2}
              max={1}
              step={0.05}
              value={volume}
              onChange={(e) => chooseVolume(Number(e.target.value))}
              aria-label="Volym för rösterna"
            />
            <span>{Math.round(volume * 100)} %</span>
            <button className="chip" onClick={cueTest}>
              Testa högtalare
            </button>
          </div>
          <p className="staff-note">Volymen gäller rösterna. Ställ in datorns huvudvolym först.</p>
        </section>

        <section>
          <h3>Felsökning</h3>
          <label className="staff-row">
            <input
              type="checkbox"
              checked={showHeard}
              onChange={(e) => {
                setShowHeard(e.target.checked);
                setHeard(e.target.checked);
              }}
            />
            <span>Visa vad rösten hörde ("Du sa: …")</span>
          </label>
          <p className="staff-note">Bara för test. Stäng av före eventet.</p>
        </section>

        <section>
          <h3>Anslutning</h3>
          <p className={`staff-status ${online ? "ok" : "bad"}`}>Internet: {online ? "ansluten" : "ingen anslutning"}</p>
          <p className={`staff-status ${health.state === "ok" ? "ok" : health.state === "error" ? "bad" : ""}`}>
            Röstjänsten:{" "}
            {health.state === "checking" ? "kontrollerar…" : health.state === "ok" ? `OK (${health.ms} ms)` : health.label}
          </p>
          {search && (
            <p className={`staff-status ${search === "ok" ? "ok" : "bad"}`}>
              Webbsök (Conciergen): {SEARCH_LABELS[search] ?? `fel (${search})`}
            </p>
          )}
          <button className="chip" onClick={checkHealth}>
            Kontrollera igen
          </button>
        </section>

        <div className="staff-actions">
          <button className="chip" onClick={() => window.location.reload()}>
            Ladda om sidan
          </button>
          <button className="chip primary" onClick={onClose}>
            Stäng
          </button>
        </div>
      </div>
    </div>
  );
}
