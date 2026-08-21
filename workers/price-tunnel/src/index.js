const ALLOWED = new Set([
  "www.pricecharting.com",
  "pricecharting.com",
  "www.ebay.com",
  "ebay.com",
]);

function json(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "content-type": "application/json; charset=utf-8" },
  });
}

function allowed(raw) {
  let parsed;
  try {
    parsed = new URL(raw);
  } catch {
    return false;
  }
  if (parsed.protocol !== "https:") return false;
  return ALLOWED.has(parsed.hostname);
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    if (request.method === "GET" && (url.pathname === "/" || url.pathname === "/health")) {
      return json({ ok: true, service: "cardenhance-price-tunnel" });
    }
    if (request.method !== "GET" || url.pathname !== "/fetch") {
      return json({ ok: false, error: "not_found" }, 404);
    }
    const token = env.AUTH_KEY_SECRET;
    if (token) {
      const header = request.headers.get("authorization") ?? "";
      if (header !== `Bearer ${token}`) return json({ ok: false, error: "unauthorized" }, 401);
    }
    const target = url.searchParams.get("url") ?? "";
    if (!allowed(target)) return json({ ok: false, error: "host_not_allowed" }, 400);
    const upstream = await fetch(target, {
      headers: {
        "User-Agent": "Mozilla/5.0 (compatible; CardEnhance/1.0)",
        Accept: "text/html,application/xhtml+xml",
      },
      redirect: "follow",
    });
    const body = await upstream.text();
    return new Response(body, {
      status: upstream.status,
      headers: {
        "content-type": upstream.headers.get("content-type") ?? "text/html; charset=utf-8",
        "x-upstream-status": String(upstream.status),
      },
    });
  },
};
