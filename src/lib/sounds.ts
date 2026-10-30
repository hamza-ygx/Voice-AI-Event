let ctx: AudioContext | null = null;

function audio(): AudioContext | null {
  try {
    ctx ??= new AudioContext();
    if (ctx.state === "suspended") ctx.resume().catch(() => {});
    return ctx;
  } catch {
    return null;
  }
}

function tone(from: number, to: number, start: number, duration: number, gain: number) {
  const a = audio();
  if (!a) return;
  const t = a.currentTime + start;
  const osc = a.createOscillator();
  const amp = a.createGain();
  osc.type = "sine";
  osc.frequency.setValueAtTime(from, t);
  osc.frequency.exponentialRampToValueAtTime(to, t + duration);
  amp.gain.setValueAtTime(0, t);
  amp.gain.linearRampToValueAtTime(gain, t + 0.015);
  amp.gain.exponentialRampToValueAtTime(0.0001, t + duration);
  osc.connect(amp).connect(a.destination);
  osc.start(t);
  osc.stop(t + duration + 0.02);
}

export function cueListenStart() {
  tone(520, 660, 0, 0.12, 0.08);
  tone(780, 880, 0.1, 0.14, 0.07);
}

export function cueListenStop() {
  tone(700, 520, 0, 0.16, 0.07);
}

export function cueTest() {
  tone(440, 440, 0, 0.35, 0.15);
  tone(660, 660, 0.4, 0.35, 0.15);
}
