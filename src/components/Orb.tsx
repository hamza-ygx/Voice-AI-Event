"use client";

import { useEffect, useRef } from "react";

export type OrbPhase = "connecting" | "idle" | "listening" | "thinking" | "speaking";

export type OrbAudio = {
  input: () => number;
  output: () => number;
  outputBins: () => Uint8Array | null;
};

type Props = {
  color: string;
  phase: OrbPhase;
  audio: React.RefObject<OrbAudio | null>;
  onClick: () => void;
  label: string;
};

function rgb(hex: string): [number, number, number] {
  const n = parseInt(hex.slice(1), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

const rgba = ([r, g, b]: [number, number, number], a: number) => `rgba(${r},${g},${b},${a})`;
const mix = ([r, g, b]: [number, number, number], [r2, g2, b2]: [number, number, number], k: number): [number, number, number] => [
  Math.round(r + (r2 - r) * k),
  Math.round(g + (g2 - g) * k),
  Math.round(b + (b2 - b) * k),
];

export default function Orb({ color, phase, audio, onClick, label }: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const phaseRef = useRef(phase);
  phaseRef.current = phase;

  useEffect(() => {
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext("2d");
    if (!canvas || !ctx) return;

    const base = rgb(color);
    const light = mix(base, [255, 255, 255], 0.55);
    const dark = mix(base, [0, 0, 0], 0.55);
    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)");

    let size = 0;
    const resize = () => {
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      size = canvas.clientWidth;
      canvas.width = size * dpr;
      canvas.height = size * dpr;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    };
    resize();
    const ro = new ResizeObserver(resize);
    ro.observe(canvas);

    let level = 0;
    let swirl = 0;
    let wave = 0;
    let raf = 0;
    const start = performance.now();

    const body = (cx: number, cy: number, r: number, alpha = 1) => {
      const g = ctx.createRadialGradient(cx - r * 0.35, cy - r * 0.4, r * 0.05, cx, cy, r);
      g.addColorStop(0, rgba(light, alpha));
      g.addColorStop(0.45, rgba(base, alpha));
      g.addColorStop(1, rgba(dark, alpha));
      return g;
    };

    const draw = (now: number) => {
      const calm = reduced.matches;
      const t = ((now - start) / 1000) * (calm ? 0.25 : 1);
      const amp = calm ? 0.35 : 1;
      const p = phaseRef.current;
      const a = audio.current;
      const target = p === "listening" ? (a?.input() ?? 0) : p === "speaking" ? (a?.output() ?? 0) : 0;
      level += (Math.min(1, target * 1.6) - level) * 0.25;
      swirl += ((p === "thinking" ? 1 : 0) - swirl) * 0.06;
      wave += ((p === "speaking" ? 1 : 0) - wave) * 0.08;

      const cx = size / 2;
      const cy = size / 2;
      const R = size * 0.27;
      ctx.clearRect(0, 0, size, size);

      const breath = p === "idle" || p === "connecting" ? Math.sin(t * 1.3) * 0.035 * amp : 0;
      const listenScale = p === "listening" ? level * 0.22 * amp : 0;
      const r = R * (1 + breath + listenScale);

      const glowR = Math.min(size * 0.5, r * (1.7 + level * 0.5 * amp));
      const glow = ctx.createRadialGradient(cx, cy, r * 0.6, cx, cy, glowR);
      glow.addColorStop(0, rgba(base, 0.45 + level * 0.25));
      glow.addColorStop(1, rgba(base, 0));
      ctx.fillStyle = glow;
      ctx.fillRect(0, 0, size, size);

      if (p === "listening") {
        for (let i = 0; i < 2; i++) {
          const k = ((t * 0.6 + i * 0.5) % 1);
          ctx.beginPath();
          ctx.arc(cx, cy, r * (1 + k * 0.45), 0, Math.PI * 2);
          ctx.strokeStyle = rgba(light, (1 - k) * (0.15 + level * 0.6));
          ctx.lineWidth = 2;
          ctx.stroke();
        }
      }

      if (wave > 0.01) {
        const bins = a?.outputBins() ?? null;
        const N = 160;
        for (let layer = 2; layer >= 0; layer--) {
          ctx.beginPath();
          for (let i = 0; i <= N; i++) {
            const ang = (i / N) * Math.PI * 2;
            const m = Math.abs(((i / N) * 2) % 2 - 1);
            const bin = bins && bins.length ? bins[Math.floor(m * bins.length * 0.35)] / 255 : 0;
            const ripple =
              Math.sin(ang * 6 + t * 3.2 + layer) * 0.5 +
              Math.sin(ang * 9 - t * 2.1 + layer * 2) * 0.3 +
              bin * 0.9;
            const rr = r * (0.94 + layer * 0.06) + r * wave * amp * (0.04 + level * 0.32) * ripple;
            const x = cx + Math.cos(ang) * rr;
            const y = cy + Math.sin(ang) * rr;
            if (i === 0) ctx.moveTo(x, y);
            else ctx.lineTo(x, y);
          }
          ctx.closePath();
          ctx.fillStyle = layer === 0 ? body(cx, cy, r * 1.1, wave) : rgba(base, 0.18 * wave);
          ctx.fill();
        }
      }

      if (wave < 0.99) {
        ctx.beginPath();
        ctx.arc(cx, cy, r, 0, Math.PI * 2);
        ctx.fillStyle = body(cx, cy, r, 1 - wave);
        ctx.fill();
      }

      if (swirl > 0.01) {
        ctx.save();
        ctx.beginPath();
        ctx.arc(cx, cy, r, 0, Math.PI * 2);
        ctx.clip();
        ctx.globalCompositeOperation = "lighter";
        for (let i = 0; i < 3; i++) {
          const ang = t * 1.6 * amp + (i * Math.PI * 2) / 3;
          const bx = cx + Math.cos(ang) * r * 0.45;
          const by = cy + Math.sin(ang) * r * 0.45;
          const g = ctx.createRadialGradient(bx, by, 0, bx, by, r * 0.65);
          g.addColorStop(0, rgba(light, 0.4 * swirl));
          g.addColorStop(1, rgba(light, 0));
          ctx.fillStyle = g;
          ctx.fillRect(cx - r, cy - r, r * 2, r * 2);
        }
        ctx.restore();
      }

      raf = requestAnimationFrame(draw);
    };
    raf = requestAnimationFrame(draw);

    return () => {
      cancelAnimationFrame(raf);
      ro.disconnect();
    };
  }, [color, audio]);

  return (
    <button className="orb" onClick={onClick} aria-label={label}>
      <canvas ref={canvasRef} />
    </button>
  );
}
