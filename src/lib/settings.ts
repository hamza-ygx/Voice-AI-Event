const MIC_KEY = "orben.mic";
const VOLUME_KEY = "orben.volume";

function read(key: string): string | null {
  try {
    return window.localStorage.getItem(key);
  } catch {
    return null;
  }
}

function write(key: string, value: string | null) {
  try {
    if (value === null) window.localStorage.removeItem(key);
    else window.localStorage.setItem(key, value);
  } catch {}
}

export const getMicId = () => read(MIC_KEY) || undefined;
export const setMicId = (id: string | null) => write(MIC_KEY, id);

export function getVolume(): number {
  const v = Number(read(VOLUME_KEY));
  return Number.isFinite(v) && v > 0 && v <= 1 ? v : 1;
}
export const setVolume = (v: number) => write(VOLUME_KEY, String(v));
