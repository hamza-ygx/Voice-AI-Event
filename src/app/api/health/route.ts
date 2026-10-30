import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import registry from "../../../../agents/agents.json";
import { isValidSession, SESSION_COOKIE } from "@/lib/auth";
import { clientIp, rateLimit } from "@/lib/rateLimit";

export const runtime = "nodejs";

const noStore = { "Cache-Control": "no-store" };

export async function GET(req: Request) {
  if (!isValidSession((await cookies()).get(SESSION_COOKIE)?.value)) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401, headers: noStore });
  }
  if (!rateLimit(`health:${clientIp(req.headers)}`, 10, 60 * 1000)) {
    return NextResponse.json({ error: "rate_limited" }, { status: 429, headers: noStore });
  }

  const apiKey = process.env.ELEVENLABS_API_KEY;
  const agentId = registry.agents[0]?.id;
  if (!apiKey || !agentId) return NextResponse.json({ voice: "not_configured" }, { headers: noStore });

  const started = Date.now();
  try {
    const url = new URL("https://api.elevenlabs.io/v1/convai/conversation/token");
    url.searchParams.set("agent_id", agentId);
    const res = await fetch(url, { headers: { "xi-api-key": apiKey }, cache: "no-store" });
    return NextResponse.json(
      { voice: res.ok ? "ok" : `error_${res.status}`, ms: Date.now() - started },
      { headers: noStore },
    );
  } catch {
    return NextResponse.json({ voice: "unreachable" }, { headers: noStore });
  }
}
