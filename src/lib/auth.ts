import { createHash, createHmac, timingSafeEqual } from "node:crypto";

export const SESSION_COOKIE = "orben_session";
export const SESSION_MAX_AGE = 60 * 60 * 24 * 3;

function secret(): string {
  const s = process.env.SESSION_SECRET;
  if (!s || s.length < 32) throw new Error("SESSION_SECRET missing or too short");
  return s;
}

function sign(payload: string): string {
  return createHmac("sha256", secret()).update(payload).digest("base64url");
}

export function safeEqual(a: string, b: string): boolean {
  const ha = createHash("sha256").update(a).digest();
  const hb = createHash("sha256").update(b).digest();
  return timingSafeEqual(ha, hb);
}

export function checkPin(input: string): boolean {
  const pin = process.env.APP_PIN;
  if (!pin) return false;
  return safeEqual(input, pin);
}

export function createSessionValue(): string {
  const exp = Math.floor(Date.now() / 1000) + SESSION_MAX_AGE;
  const payload = `v1.${exp}`;
  return `${payload}.${sign(payload)}`;
}

export function isValidSession(value: string | undefined): boolean {
  if (!value) return false;
  const parts = value.split(".");
  if (parts.length !== 3 || parts[0] !== "v1") return false;
  const exp = Number(parts[1]);
  if (!Number.isFinite(exp) || exp < Date.now() / 1000) return false;
  try {
    return safeEqual(parts[2], sign(`${parts[0]}.${parts[1]}`));
  } catch {
    return false;
  }
}
