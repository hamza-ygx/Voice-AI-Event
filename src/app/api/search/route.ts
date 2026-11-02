import { NextResponse } from "next/server";
import { safeEqual } from "@/lib/auth";
import { rateLimit } from "@/lib/rateLimit";

export const runtime = "nodejs";

const noStore = { "Cache-Control": "no-store" };
const MAX_QUERY = 200;
const SNIPPET = 500;

export async function POST(req: Request) {
  const token = process.env.ORBEN_SEARCH_TOKEN;
  const apiKey = process.env.TAVILY_API_KEY;
  if (!token || token.length < 32 || !apiKey) {
    return NextResponse.json({ error: "not_configured" }, { status: 503, headers: noStore });
  }
  const auth = req.headers.get("authorization") ?? "";
  if (!safeEqual(auth, `Bearer ${token}`)) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401, headers: noStore });
  }
  if (!rateLimit("search", 60, 60 * 1000)) {
    return NextResponse.json({ error: "rate_limited" }, { status: 429, headers: noStore });
  }

  let query = "";
  try {
    const body = await req.json();
    query = typeof body?.query === "string" ? body.query.trim().slice(0, MAX_QUERY) : "";
  } catch {}
  if (!query) return NextResponse.json({ error: "bad_request" }, { status: 400, headers: noStore });

  try {
    const res = await fetch("https://api.tavily.com/search", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${apiKey}` },
      body: JSON.stringify({ query, search_depth: "basic", max_results: 3, include_answer: true }),
      signal: AbortSignal.timeout(5000),
      cache: "no-store",
    });
    if (!res.ok) {
      console.error("search upstream", res.status);
      return NextResponse.json({ error: "upstream" }, { status: 502, headers: noStore });
    }
    const data = (await res.json()) as {
      answer?: string;
      results?: { title?: string; content?: string; url?: string }[];
    };
    return NextResponse.json(
      {
        answer: data.answer ?? "",
        results: (data.results ?? []).slice(0, 3).map((r) => ({
          title: r.title ?? "",
          content: (r.content ?? "").slice(0, SNIPPET),
          source: r.url ? new URL(r.url).hostname : "",
        })),
      },
      { headers: noStore },
    );
  } catch {
    return NextResponse.json({ error: "timeout" }, { status: 504, headers: noStore });
  }
}
