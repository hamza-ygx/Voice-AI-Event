export const TIP_MAX = 1000;

export function encodeTip(text: string) {
  const bytes = new TextEncoder().encode(text.slice(0, TIP_MAX));
  let bin = "";
  bytes.forEach((b) => (bin += String.fromCharCode(b)));
  return btoa(bin).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

export function decodeTip(code: string) {
  try {
    const b64 = code.replace(/-/g, "+").replace(/_/g, "/");
    const bin = atob(b64 + "=".repeat((4 - (b64.length % 4)) % 4));
    const bytes = Uint8Array.from(bin, (c) => c.charCodeAt(0));
    return new TextDecoder("utf-8", { fatal: true }).decode(bytes).slice(0, TIP_MAX);
  } catch {
    return "";
  }
}
