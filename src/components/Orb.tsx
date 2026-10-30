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
  audio?: React.RefObject<OrbAudio | null>;
  onClick?: () => void;
  label?: string;
  radius?: number;
  density?: number;
  className?: string;
};

type RGB = [number, number, number];

function rgb(hex: string): RGB {
  const n = parseInt(hex.slice(1), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

const rgba = ([r, g, b]: RGB, a: number) => `rgba(${r},${g},${b},${a})`;
const mix = ([r, g, b]: RGB, [r2, g2, b2]: RGB, k: number): RGB => [
  Math.round(r + (r2 - r) * k),
  Math.round(g + (g2 - g) * k),
  Math.round(b + (b2 - b) * k),
];

function dotSprite(fill: RGB, halo: RGB) {
  const s = 64;
  const c = document.createElement("canvas");
  c.width = c.height = s;
  const g = c.getContext("2d")!;
  const h = g.createRadialGradient(s / 2, s / 2, s * 0.16, s / 2, s / 2, s / 2);
  h.addColorStop(0, rgba(halo, 0.35));
  h.addColorStop(1, rgba(halo, 0));
  g.fillStyle = h;
  g.fillRect(0, 0, s, s);
  g.beginPath();
  g.arc(s / 2, s / 2, s * 0.2, 0, Math.PI * 2);
  g.fillStyle = rgba(fill, 1);
  g.fill();
  return c;
}

type Spark = { x: number; y: number; z: number; r: number; v: number; life: number };

const GOLDEN = Math.PI * (3 - Math.sqrt(5));
const TILT = 0.42;

export default function Orb({ color, phase, audio, onClick, label, radius = 0.34, density = 1, className }: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const phaseRef = useRef(phase);
  phaseRef.current = phase;

  useEffect(() => {
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext("2d");
    if (!canvas || !ctx) return;

    const base = rgb(color);
    const light = mix(base, [255, 255, 255], 0.45);
    const white = mix(base, [255, 255, 255], 0.85);
    const front = dotSprite(white, light);
    const mid = dotSprite(light, base);
    const back = dotSprite(base, base);
    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)");

    let size = 0;
    let px = new Float32Array(0);
    let py = new Float32Array(0);
    let pz = new Float32Array(0);
    let seed = new Float32Array(0);

    const build = () => {
      const n = Math.round(Math.min(900, Math.max(220, size * 1.6)) * density);
      px = new Float32Array(n);
      py = new Float32Array(n);
      pz = new Float32Array(n);
      seed = new Float32Array(n);
      for (let i = 0; i < n; i++) {
        const y = 1 - (i / (n - 1)) * 2;
        const r = Math.sqrt(1 - y * y);
        const th = GOLDEN * i;
        px[i] = Math.cos(th) * r;
        py[i] = y;
        pz[i] = Math.sin(th) * r;
        seed[i] = Math.random() * Math.PI * 2;
      }
    };

    const resize = () => {
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      const next = canvas.clientWidth;
      canvas.width = next * dpr;
      canvas.height = next * dpr;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      const rebuild = Math.abs(next - size) > 40 || px.length === 0;
      size = next;
      if (rebuild) build();
    };
    resize();
    const ro = new ResizeObserver(resize);
    ro.observe(canvas);

    const sparks: Spark[] = [];
    let level = 0;
    let swirl = 0;
    let wave = 0;
    let listen = 0;
    let dimmed = 1;
    let spin = 0;
    let vortex = 0;
    let flow = 0;
    let last = performance.now();
    let raf = 0;
    const start = last;

    const draw = (now: number) => {
      const calm = reduced.matches;
      const dt = Math.min(0.05, (now - last) / 1000);
      last = now;
      const t = ((now - start) / 1000) * (calm ? 0.3 : 1);
      const amp = calm ? 0.3 : 1;
      const p = phaseRef.current;
      const a = audio?.current;

      const target = p === "listening" ? (a?.input() ?? 0) : p === "speaking" ? (a?.output() ?? 0) : 0;
      level += (Math.min(1, target * 2) - level) * 0.25;
      swirl += ((p === "thinking" ? 1 : 0) - swirl) * 0.05;
      wave += ((p === "speaking" ? 1 : 0) - wave) * 0.08;
      listen += ((p === "listening" ? 1 : 0) - listen) * 0.1;
      dimmed += ((p === "connecting" ? 0.45 : 1) - dimmed) * 0.05;

      const active = Math.max(listen, wave);
      const motion = active * (0.35 + level * 0.9) * amp;
      spin += dt * (0.2 + swirl * 1.4 + active * 0.25 + level * 0.9) * amp;
      vortex += dt * swirl * 2.2 * amp;
      flow += dt * (1 + level * 3) * amp;

      const cx = size / 2;
      const cy = size / 2;
      const R = size * radius;
      const breath = 1 + Math.sin(t * 1.2) * 0.03 * amp * (1 - active);
      const bins = wave > 0.01 ? (a?.outputBins() ?? null) : null;
      const binSpan = bins ? Math.max(1, Math.floor(bins.length * 0.45)) : 0;

      ctx.clearRect(0, 0, size, size);
      ctx.globalCompositeOperation = "source-over";
      ctx.globalAlpha = 1;

      const glowR = Math.min(size * 0.5, R * (1.5 + level * 0.5 + listen * 0.15));
      const glow = ctx.createRadialGradient(cx, cy, 0, cx, cy, glowR);
      glow.addColorStop(0, rgba(base, (0.16 + level * 0.22 + swirl * 0.06) * dimmed));
      glow.addColorStop(1, rgba(base, 0));
      ctx.fillStyle = glow;
      ctx.fillRect(0, 0, size, size);

      const sy = Math.sin(spin);
      const cyR = Math.cos(spin);
      const st = Math.sin(TILT + Math.sin(t * 0.3) * 0.08 * amp);
      const ct = Math.cos(TILT + Math.sin(t * 0.3) * 0.08 * amp);
      const n = px.length;
      const dotR = Math.max(1.5, size / 210);

      for (let i = 0; i < n; i++) {
        let x = px[i];
        let y = py[i];
        let z = pz[i];
        const s = seed[i];

        let d = breath + Math.sin(s * 3 + t * 1.4) * 0.02 * amp;
        d += listen * amp * (0.14 + level * 0.45 * (0.7 + 0.3 * Math.sin(s * 5 + t * 6)));
        if (bins) {
          const bin = bins[Math.min(bins.length - 1, Math.floor(Math.abs(y) * binSpan))] / 255;
          d += wave * amp * (0.06 + bin * 0.4 + 0.04 * Math.sin(Math.atan2(z, x) * 6 + t * 3.4));
        }

        if (motion > 0.001) {
          x += Math.sin(s * 7.1 + flow * 2.3) * 0.075 * motion;
          y += Math.cos(s * 5.3 + flow * 1.9) * 0.075 * motion;
          z += Math.sin(s * 3.7 + flow * 2.7) * 0.075 * motion;
        }

        if (swirl > 0.01) {
          const ang = vortex * (1.4 - Math.abs(y));
          const c = Math.cos(ang);
          const sn = Math.sin(ang);
          const nx = x * c - z * sn;
          z = x * sn + z * c;
          x = nx;
          y *= 1 - swirl * 0.45;
          d *= 1 - swirl * 0.08;
        }

        x *= d;
        y *= d;
        z *= d;

        const rx = x * cyR - z * sy;
        const rz = x * sy + z * cyR;
        const ry = y * ct - rz * st;
        const rz2 = y * st + rz * ct;

        const persp = 1.6 / (2.6 - rz2);
        const depth = Math.max(0, Math.min(1, (rz2 + 1.2) / 2.4));
        const sz = dotR * (0.55 + depth * 0.95) * persp * (1 + level * 0.25);
        const half = sz * 2.5;

        ctx.globalAlpha = (0.18 + depth * 0.82) * dimmed;
        ctx.drawImage(depth > 0.62 ? front : depth > 0.35 ? mid : back, cx + rx * R * persp - half, cy + ry * R * persp - half, half * 2, half * 2);
      }

      if (!calm) {
        const emit = (listen + wave) * level;
        const count = emit > 0.1 ? Math.floor(emit * 3 + Math.random()) : 0;
        for (let k = 0; k < count && sparks.length < 120; k++) {
          const u = Math.random() * 2 - 1;
          const th = Math.random() * Math.PI * 2;
          const r = Math.sqrt(1 - u * u);
          sparks.push({ x: Math.cos(th) * r, y: u, z: Math.sin(th) * r, r: 1.1, v: 0.35 + Math.random() * 0.5 + level * 0.6, life: 1 });
        }
      }
      for (let k = sparks.length - 1; k >= 0; k--) {
        const sp = sparks[k];
        sp.r += sp.v * dt;
        sp.life -= dt * 0.9;
        if (sp.life <= 0 || sp.r > 1.9) {
          sparks.splice(k, 1);
          continue;
        }
        const x = sp.x * sp.r;
        const y = sp.y * sp.r;
        const z = sp.z * sp.r;
        const rx = x * cyR - z * sy;
        const rz = x * sy + z * cyR;
        const ry = y * ct - rz * st;
        const rz2 = y * st + rz * ct;
        const persp = 1.6 / (2.6 - rz2);
        const half = dotR * 2.2 * sp.life;
        ctx.globalAlpha = sp.life * 0.9;
        ctx.drawImage(front, cx + rx * R * persp - half, cy + ry * R * persp - half, half * 2, half * 2);
      }

      if (listen > 0.01 && !calm) {
        for (let i = 0; i < 2; i++) {
          const k = (t * 0.55 + i * 0.5) % 1;
          ctx.globalAlpha = (1 - k) * listen * (0.15 + level * 0.5);
          ctx.beginPath();
          ctx.arc(cx, cy, R * (1.2 + k * 0.45), 0, Math.PI * 2);
          ctx.strokeStyle = rgba(light, 1);
          ctx.lineWidth = 1.5;
          ctx.stroke();
        }
      }

      ctx.globalAlpha = 1;
      raf = requestAnimationFrame(draw);
    };
    raf = requestAnimationFrame(draw);

    return () => {
      cancelAnimationFrame(raf);
      ro.disconnect();
    };
  }, [color, audio, radius, density]);

  if (!onClick) {
    return (
      <div className={className ?? "orb"} aria-hidden>
        <canvas ref={canvasRef} />
      </div>
    );
  }

  return (
    <button className={className ?? "orb"} onClick={onClick} aria-label={label}>
      <canvas ref={canvasRef} />
    </button>
  );
}
