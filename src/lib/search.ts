const SNIPPET = 500;

export type SearchResult = { answer: string; results: { title: string; content: string; source: string }[] };

export async function tavilySearch(query: string): Promise<SearchResult> {
  const apiKey = process.env.TAVILY_API_KEY;
  if (!apiKey) throw new Error("not_configured");
  const res = await fetch("https://api.tavily.com/search", {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${apiKey}` },
    body: JSON.stringify({ query, search_depth: "basic", max_results: 3, include_answer: true }),
    signal: AbortSignal.timeout(5000),
    cache: "no-store",
  });
  if (!res.ok) throw new Error(`upstream_${res.status}`);
  const data = (await res.json()) as { answer?: string; results?: { title?: string; content?: string; url?: string }[] };
  return {
    answer: data.answer ?? "",
    results: (data.results ?? []).slice(0, 3).map((r) => ({
      title: r.title ?? "",
      content: (r.content ?? "").slice(0, SNIPPET),
      source: r.url ? new URL(r.url).hostname : "",
    })),
  };
}

export const searchConfigured = () => Boolean(process.env.TAVILY_API_KEY && (process.env.ORBEN_SEARCH_TOKEN?.length ?? 0) >= 32);
