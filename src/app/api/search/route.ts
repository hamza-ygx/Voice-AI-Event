import { NextResponse } from "next/server";
import { safeEqual } from "@/lib/auth";
import { rateLimit } from "@/lib/rateLimit";
import { tavilySearch } from "@/lib/search";

export const runtime = "nodejs";

const noStore = { "Cache-Control": "no-store" };
const MAX_QUERY = 200;

export async function POST(req: Request) {
  const token = process.env.ORBEN_SEARCH_TOKEN;
  const apiKey = process.env.TAVILY_API_KEY;
  if (!token || token.length < 32 || !apiKey) {
    return NextResponse.json({ error: "not_configured" }, { status: 503, headers: noStore });
  }
  const auth = req.headers.get("authorization") ?? "";
  const presented = auth.startsWith("Bearer ") ? auth.slice(7) : auth;
  if (!safeEqual(presented, token)) {
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

  const fallback = {
    answer: "",
    results: [],
    note: "No usable results. Tell the visitor you could not check it right now and suggest asking the hotel reception or the venue. Do not guess.",
  };
  try {
    const found = await tavilySearch(query);
    const empty = !found.answer && found.results.every((r) => !r.content);
    return NextResponse.json(empty ? fallback : found, { headers: noStore });
  } catch (e) {
    console.error("search failed", e instanceof Error ? e.message : "error");
    return NextResponse.json(fallback, { headers: noStore });
  }
}
