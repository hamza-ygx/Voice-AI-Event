import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import registry from "../../../../agents/agents.json";
import { isValidSession, SESSION_COOKIE } from "@/lib/auth";
import { isCharacterId } from "@/lib/characters";
import { clientIp, rateLimit } from "@/lib/rateLimit";

export const runtime = "nodejs";

const noStore = { "Cache-Control": "no-store" };

export async function POST(req: Request) {
  if (!isValidSession((await cookies()).get(SESSION_COOKIE)?.value)) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401, headers: noStore });
  }
  if (!rateLimit(`session:${clientIp(req.headers)}`, 20, 60 * 1000)) {
    return NextResponse.json({ error: "rate_limited" }, { status: 429, headers: noStore });
  }

  let character: unknown;
  try {
    character = (await req.json())?.character;
  } catch {
    return NextResponse.json({ error: "bad_request" }, { status: 400, headers: noStore });
  }
  if (!isCharacterId(character)) {
    return NextResponse.json({ error: "bad_request" }, { status: 400, headers: noStore });
  }

  const agentId = registry.agents.find((a) => a.name === character)?.id;
  const apiKey = process.env.ELEVENLABS_API_KEY;
  if (!agentId || !apiKey) {
    return NextResponse.json({ error: "not_configured" }, { status: 503, headers: noStore });
  }

  const url = new URL("https://api.elevenlabs.io/v1/convai/conversation/token");
  url.searchParams.set("agent_id", agentId);
  const res = await fetch(url, { headers: { "xi-api-key": apiKey }, cache: "no-store" });
  if (!res.ok) {
    console.error("token request failed", res.status);
    return NextResponse.json({ error: "upstream" }, { status: 502, headers: noStore });
  }
  const { token } = (await res.json()) as { token?: string };
  if (!token) return NextResponse.json({ error: "upstream" }, { status: 502, headers: noStore });

  return NextResponse.json({ token }, { headers: noStore });
}
