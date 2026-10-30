import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { checkPin, createSessionValue, SESSION_COOKIE, SESSION_MAX_AGE } from "@/lib/auth";
import { clientIp, rateLimit } from "@/lib/rateLimit";

export const runtime = "nodejs";

export async function POST(req: Request) {
  if (!rateLimit(`pin:${clientIp(req.headers)}`, 5, 10 * 60 * 1000)) {
    return NextResponse.json({ error: "rate_limited" }, { status: 429 });
  }

  let pin: unknown;
  try {
    pin = (await req.json())?.pin;
  } catch {
    return NextResponse.json({ error: "bad_request" }, { status: 400 });
  }
  if (typeof pin !== "string" || pin.length === 0 || pin.length > 32 || !checkPin(pin)) {
    return NextResponse.json({ error: "wrong_pin" }, { status: 401 });
  }

  (await cookies()).set(SESSION_COOKIE, createSessionValue(), {
    httpOnly: true,
    secure: true,
    sameSite: "strict",
    path: "/",
    maxAge: SESSION_MAX_AGE,
  });
  return NextResponse.json({ ok: true });
}
