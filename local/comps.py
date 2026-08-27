"""Market comps: eBay sold-listings scrape (works from residential IPs — the
Cloudflare-hosted version got 403'd because eBay blocks datacenter IPs)."""
from __future__ import annotations

import re
import statistics

UA = ("Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 "
      "(KHTML, like Gecko) Chrome/126.0 Safari/537.36")


def ebay_sold(query: str, timeout: float = 12.0) -> dict:
    import httpx

    url = "https://www.ebay.com/sch/i.html"
    params = {"_nkw": query, "LH_Sold": "1", "LH_Complete": "1"}
    try:
        r = httpx.get(url, params=params, timeout=timeout,
                      headers={"User-Agent": UA, "Accept-Language": "en-US,en;q=0.9"},
                      follow_redirects=True)
        if r.status_code != 200:
            return {"ok": False, "error": f"eBay HTTP {r.status_code}", "link": str(r.url)}
        html = r.text
    except Exception as e:
        return {"ok": False, "error": f"{type(e).__name__}: {e}", "link": f"{url}?_nkw={query}"}

    prices = []
    for m in re.finditer(r's-item__price[^>]*>\s*\$?([\d,]+(?:\.\d{2})?)', html):
        try:
            prices.append(float(m.group(1).replace(",", "")))
        except ValueError:
            pass
    prices = prices[:30]
    if not prices:
        return {"ok": True, "count": 0, "link": str(r.url),
                "note": "No sold listings parsed (page layout may have changed)"}
    return {
        "ok": True, "count": len(prices),
        "low": min(prices), "high": max(prices),
        "median": round(statistics.median(prices), 2),
        "link": str(r.url),
    }


def pricecharting_link(query: str) -> str:
    from urllib.parse import quote_plus
    return f"https://www.pricecharting.com/search-products?q={quote_plus(query)}&type=prices"
