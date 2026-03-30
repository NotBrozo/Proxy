import { Router, type IRouter, type Request, type Response } from "express";

const router: IRouter = Router();

const BLOCKED_HOSTS = new Set([
  "localhost",
  "127.0.0.1",
  "0.0.0.0",
  "::1",
]);

function isBlockedHost(hostname: string): boolean {
  if (BLOCKED_HOSTS.has(hostname)) return true;
  if (hostname.startsWith("192.168.") || hostname.startsWith("10.") || hostname.startsWith("172.")) return true;
  return false;
}

function resolveUrl(base: string, relative: string): string {
  try {
    return new URL(relative, base).href;
  } catch {
    return relative;
  }
}

function rewriteHtml(html: string, targetUrl: string, proxyBase: string): string {
  const baseUrl = new URL(targetUrl);

  const rewriteAttr = (attr: string) => (match: string, prefix: string, url: string, suffix: string): string => {
    if (!url || url.startsWith("data:") || url.startsWith("javascript:") || url.startsWith("#")) {
      return match;
    }
    try {
      const absolute = resolveUrl(targetUrl, url);
      const proxied = `${proxyBase}?url=${encodeURIComponent(absolute)}`;
      return `${prefix}${proxied}${suffix}`;
    } catch {
      return match;
    }
  };

  const rewriteLink = (attr: string) => (match: string, prefix: string, url: string, suffix: string): string => {
    if (!url || url.startsWith("data:") || url.startsWith("javascript:") || url.startsWith("#")) {
      return match;
    }
    try {
      const absolute = resolveUrl(targetUrl, url);
      const proxied = `${proxyBase}?url=${encodeURIComponent(absolute)}`;
      return `${prefix}${proxied}${suffix}`;
    } catch {
      return match;
    }
  };

  let result = html;

  result = result.replace(/<base[^>]*>/gi, "");

  result = result.replace(
    /((?:href|src|action)\s*=\s*["'])([^"']+)(["'])/gi,
    (match, prefix, url, suffix) => {
      if (!url || url.startsWith("data:") || url.startsWith("javascript:") || url.startsWith("#") || url.startsWith("mailto:") || url.startsWith("tel:")) {
        return match;
      }
      try {
        const absolute = resolveUrl(targetUrl, url);
        const proxied = `/api/proxy/resource?url=${encodeURIComponent(absolute)}`;
        if (prefix.toLowerCase().includes("href")) {
          return `${prefix}/api/proxy?url=${encodeURIComponent(absolute)}${suffix}`;
        }
        return `${prefix}${proxied}${suffix}`;
      } catch {
        return match;
      }
    }
  );

  result = result.replace(
    /(url\s*\(\s*["']?)([^"')]+)(["']?\s*\))/gi,
    (match, prefix, url, suffix) => {
      if (!url || url.startsWith("data:")) return match;
      try {
        const absolute = resolveUrl(targetUrl, url);
        return `${prefix}/api/proxy/resource?url=${encodeURIComponent(absolute)}${suffix}`;
      } catch {
        return match;
      }
    }
  );

  result = result.replace(/<head([^>]*)>/i, `<head$1><base href="${targetUrl}">`);

  const injectScript = `
<script>
(function() {
  var _target = ${JSON.stringify(targetUrl)};
  try { window.top.postMessage({ type: 'PROXY_URL', url: _target }, '*'); } catch(e) {}
  document.addEventListener('click', function(e) {
    var el = e.target.closest('a');
    if (el && el.href && !el.href.startsWith('/api/proxy')) {
      try {
        window.top.postMessage({ type: 'PROXY_NAVIGATE', url: el.href }, '*');
      } catch(ex) {}
    }
  }, true);
})();
</script>`;

  result = result.replace(/<\/head>/i, `${injectScript}</head>`);

  return result;
}

router.get("/proxy", async (req: Request, res: Response): Promise<void> => {
  const rawUrl = req.query["url"];
  if (!rawUrl || typeof rawUrl !== "string") {
    res.status(400).json({ error: "BAD_REQUEST", message: "Missing required query parameter: url" });
    return;
  }

  let parsedUrl: URL;
  try {
    let urlToFetch = rawUrl;
    if (!urlToFetch.startsWith("http://") && !urlToFetch.startsWith("https://")) {
      urlToFetch = "https://" + urlToFetch;
    }
    parsedUrl = new URL(urlToFetch);
  } catch {
    res.status(400).json({ error: "BAD_REQUEST", message: "Invalid URL provided" });
    return;
  }

  if (isBlockedHost(parsedUrl.hostname)) {
    res.status(400).json({ error: "BAD_REQUEST", message: "Cannot proxy local or private addresses" });
    return;
  }

  try {
    const headers: Record<string, string> = {
      "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
      "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8",
      "Accept-Language": "en-US,en;q=0.5",
      "Accept-Encoding": "identity",
      "Cache-Control": "no-cache",
      "Pragma": "no-cache",
    };

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 15000);

    const response = await fetch(parsedUrl.href, {
      headers,
      redirect: "follow",
      signal: controller.signal,
    });

    clearTimeout(timeout);

    const finalUrl = response.url || parsedUrl.href;
    const contentType = response.headers.get("content-type") || "";

    if (contentType.includes("text/html")) {
      const html = await response.text();
      const rewritten = rewriteHtml(html, finalUrl, "/api/proxy");
      res.setHeader("Content-Type", "text/html; charset=utf-8");
      res.setHeader("X-Frame-Options", "SAMEORIGIN");
      res.setHeader("X-Proxied-Url", finalUrl);
      res.send(rewritten);
    } else {
      const buffer = await response.arrayBuffer();
      res.setHeader("Content-Type", contentType || "application/octet-stream");
      res.send(Buffer.from(buffer));
    }
  } catch (err: any) {
    req.log.error({ err }, "Proxy fetch failed");
    if (err?.name === "AbortError") {
      res.status(504).json({ error: "TIMEOUT", message: "The request to the target site timed out" });
    } else {
      res.status(500).json({ error: "PROXY_ERROR", message: err?.message || "Failed to fetch the requested URL" });
    }
  }
});

router.get("/proxy/resource", async (req: Request, res: Response): Promise<void> => {
  const rawUrl = req.query["url"];
  if (!rawUrl || typeof rawUrl !== "string") {
    res.status(400).json({ error: "BAD_REQUEST", message: "Missing required query parameter: url" });
    return;
  }

  let parsedUrl: URL;
  try {
    parsedUrl = new URL(rawUrl);
  } catch {
    res.status(400).json({ error: "BAD_REQUEST", message: "Invalid URL provided" });
    return;
  }

  if (isBlockedHost(parsedUrl.hostname)) {
    res.status(400).json({ error: "BAD_REQUEST", message: "Cannot proxy local or private addresses" });
    return;
  }

  try {
    const headers: Record<string, string> = {
      "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
      "Accept": "*/*",
      "Accept-Encoding": "identity",
    };

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 15000);

    const response = await fetch(parsedUrl.href, {
      headers,
      redirect: "follow",
      signal: controller.signal,
    });

    clearTimeout(timeout);

    const contentType = response.headers.get("content-type") || "application/octet-stream";

    res.setHeader("Content-Type", contentType);
    res.setHeader("Cache-Control", "public, max-age=3600");
    res.setHeader("Access-Control-Allow-Origin", "*");

    const buffer = await response.arrayBuffer();

    if (contentType.includes("text/css")) {
      let css = Buffer.from(buffer).toString("utf-8");
      css = css.replace(
        /url\s*\(\s*(['"]?)([^'")\s]+)(['"]?)\s*\)/gi,
        (match, q1, url, q2) => {
          if (!url || url.startsWith("data:")) return match;
          try {
            const absolute = new URL(url, parsedUrl.href).href;
            return `url(${q1}/api/proxy/resource?url=${encodeURIComponent(absolute)}${q2})`;
          } catch {
            return match;
          }
        }
      );
      res.send(css);
    } else {
      res.send(Buffer.from(buffer));
    }
  } catch (err: any) {
    req.log.error({ err }, "Resource proxy fetch failed");
    res.status(500).json({ error: "PROXY_ERROR", message: err?.message || "Failed to fetch resource" });
  }
});

export default router;
