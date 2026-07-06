/**
 * https://streamtoearn.io/gifts → yerel ayna:
 *   sıra/StreamToEarn-Gifts.html
 *   sıra/streamtoearn-gifts-assets/** (styles, js, images, favicon)
 *
 * CSS içindeki url(/…) göreli yollara çevrilir (file:// uyumu).
 * Son adım: GemTok sıra sayfası ile aynı üst menü + parçacık arka planı (StreamToEarn üst çubuğu gizlenir).
 *
 * Kullanım (repo kökü): node tools/mirror-streamtoearn-gifts-page.mjs
 */
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(__dirname, "..");
const SIRA = path.join(REPO_ROOT, "sıra");
const OUT_HTML = path.join(SIRA, "StreamToEarn-Gifts.html");
const ASSET_DIR_NAME = "streamtoearn-gifts-assets";
const OUT_ASSETS = path.join(SIRA, ASSET_DIR_NAME);
const BASE = "https://streamtoearn.io";
const START = `${BASE}/gifts`;

const UA =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36";

/** Sunucudan çekilebilir statik önekler + favicon */
const ALLOW_PREFIX = /^\/(styles|js|images)\//;
const ALLOW_FAVICON = /^\/favicon\.ico$/i;

function toAbsUrl(pathOrUrl) {
  const p = String(pathOrUrl || "").trim();
  if (!p) return null;
  if (p.startsWith("https://streamtoearn.io")) return p.split("#")[0];
  if (p.startsWith("/")) return BASE + p.split("#")[0];
  return null;
}

function diskPathForUrl(absUrl) {
  const u = new URL(absUrl);
  const rel = u.pathname.replace(/^\/+/, "");
  return path.join(OUT_ASSETS, rel);
}

async function fetchText(url) {
  const r = await fetch(url, { headers: { "User-Agent": UA, Accept: "*/*", Referer: START } });
  if (!r.ok) throw new Error(`HTTP ${r.status} ${url}`);
  return r.text();
}

async function fetchBuf(url) {
  const r = await fetch(url, { headers: { "User-Agent": UA, Accept: "*/*", Referer: START } });
  if (!r.ok) throw new Error(`HTTP ${r.status} ${url}`);
  return Buffer.from(await r.arrayBuffer());
}

async function tryFetchBuf(url) {
  try {
    const r = await fetch(url, { headers: { "User-Agent": UA, Accept: "*/*", Referer: START } });
    if (!r.ok) return { ok: false, status: r.status };
    return { ok: true, buf: Buffer.from(await r.arrayBuffer()) };
  } catch (e) {
    return { ok: false, err: e };
  }
}

function extractHtmlPaths(html) {
  const set = new Set();
  const re = /(?:href|src)=["'](\/[^"'#?]*)(?:\?[^"'#]*)?["']/gi;
  let m;
  while ((m = re.exec(html))) {
    const p = m[1].trim();
    if (p && p.startsWith("/")) set.add(p.split("?")[0]);
  }
  return set;
}

function extractCssUrls(cssText) {
  const set = new Set();
  const re = /url\(\s*["']?([^"')]+?)["']?\s*\)/gi;
  let m;
  while ((m = re.exec(cssText))) {
    let u = m[1].trim();
    if (u.startsWith("https://streamtoearn.io")) {
      try {
        u = new URL(u).pathname;
      } catch {
        continue;
      }
    }
    if (u.startsWith("/")) set.add(u.split("?")[0]);
  }
  return set;
}

function shouldDownloadPath(p) {
  if (ALLOW_FAVICON.test(p)) return true;
  return ALLOW_PREFIX.test(p);
}

function rewriteCssForSubfolder(cssText, cssUrlPath) {
  /** cssUrlPath örn. /styles/home.css — dosya OUT_ASSETS/styles/home.css */
  const depth = cssUrlPath.replace(/^\/+/, "").split("/").length - 1;
  const up = depth > 0 ? "../".repeat(depth) : "./";
  let out = cssText;
  out = out.replace(/url\(\s*["']?\/(styles|js|images)\//gi, (match, kind) => {
    return `url(${up}${kind}/`;
  });
  out = out.replace(/url\(\s*["']?https:\/\/streamtoearn\.io\/(styles|js|images)\//gi, (match, kind) => {
    return `url(${up}${kind}/`;
  });
  return out;
}

function rewriteHtml(html) {
  const prefix = `${ASSET_DIR_NAME}/`;
  let h = html;

  h = h.replace(/https:\/\/streamtoearn\.io(\/[^"'>\s]*)/gi, (_, pathname) => {
    const clean = pathname.split("?")[0];
    if (shouldDownloadPath(clean) || ALLOW_FAVICON.test(clean)) return prefix + clean.replace(/^\/+/, "");
    return "#";
  });

  h = h.replace(/href="\/#/g, 'href="#');

  h = h.replace(/\b(href|src)=["'](\/[^"'#?]*)(\?[^"']*)?["']/gi, (full, attr, pathname, q) => {
    const clean = pathname.split("?")[0];
    if (shouldDownloadPath(clean) || ALLOW_FAVICON.test(clean)) {
      const qpart = q || "";
      return `${attr}="${prefix}${clean.replace(/^\/+/, "")}${qpart}"`;
    }
    if (attr === "href" && (clean === "/gifts" || clean === "/gifts/")) return 'href="StreamToEarn-Gifts.html"';
    if (clean.startsWith("/") && !clean.startsWith("//")) return `${attr}="#"`;
    return full;
  });

  h = h.replace(/href="https:\/\/app\.streamtoearn\.io\/[^"]*"/gi, 'href="#"');

  return h;
}

/** StreamToEarn markası görünür metin / altbilgi kaldırılır; GemTok altbilgisi eklenmez (yerel arşiv). */
function stripStreamtoearnBrandingForGemtokMirror(html) {
  let h = html;
  h = h.replace(/<link rel="preconnect" href="https:\/\/api\.streamtoearn\.io"[^>]*>\s*/gi, "");
  h = h.replace(/<link rel="preconnect" href="https:\/\/app\.streamtoearn\.io"[^>]*>\s*/gi, "");
  h = h.replace(/<link rel="dns-prefetch" href="https:\/\/streamtoearnprod1[^>]*>\s*/gi, "");
  h = h.replace(/<meta property="og:site_name" content="StreamToEarn"\s*\/>/gi, '<meta property="og:site_name" content="GemTok" />');
  h = h.replace(/<meta name="twitter:site" content="@StreamToEarn"\s*\/>/gi, "");
  h = h.replace(/<!-- Organization \+ WebSite \(sitewide JSON-LD\) -->[\s\S]*?<\/script>\s*/i, "");
  h = h.replace(/<footer class="site(?:\s+gemtok-s2e-footer)?">[\s\S]*?<\/footer>/i, "");
  h = h.replace(/aria-label="StreamToEarn"/gi, 'aria-label="GemTok"');
  h = h.replace(/alt="StreamToEarn"/gi, 'alt=""');
  return h;
}

/** GemTok arka plan + üst menü; StreamToEarn header/drawer CSS ile gizlenir. İdempotent. */
function injectGemtokSiraChrome(html) {
  let h = stripStreamtoearnBrandingForGemtokMirror(html);
  if (h.includes('id="gemtok-s2e-chrome"')) return h;
  h = h.replace(/<html\s+lang="[^"]*"/i, '<html lang="tr" data-gemtok-sira-page="StreamToEarn-Gifts.html"');

  const headSnippet = `
    <link href="../httrack_mirror/www.gemtok.live/manifest.json" rel="manifest">
    <meta content="#1e88e5" name="theme-color">
    <link rel="icon" type="image/png" href="../gemtok/gemtok.png">
    <link href="./ANA SAYFA_files/css2" rel="stylesheet">
    <link href="./ANA SAYFA_files/bootstrap-icons.min.css" rel="stylesheet">
    <link href="./ANA SAYFA_files/common.min.css" rel="stylesheet">
    <style id="gemtok-s2e-chrome">
      #siteHeader.site-header,
      #siteDrawer.site-drawer { display: none !important; }
      body.gemtok-s2e-embed { background: transparent !important; min-height: 100vh; }
      body.gemtok-s2e-embed.s2e-home { background: transparent !important; }
    </style>`;

  h = h.replace(
    /(<link\s+rel="stylesheet"\s+href="[^"]*gifts-list\.css"\s*\/>)/i,
    `$1${headSnippet}`,
  );

  const bodyPrefix = `<body class="s2e-home subpage gemtok-s2e-embed">
  <canvas id="particles-canvas" width="1920" height="945"></canvas>
  <div class="glow-blob blob-1"></div>
  <div class="glow-blob blob-2"></div>
  <div class="grid-overlay"></div>
  <div class="main-content">
    <nav class="fixed top-0 left-0 right-0 z-50 pl-8 pr-4 sm:pl-9 sm:pr-6 py-4 backdrop-blur-md bg-[rgba(2,8,23,0.3)] border-b border-[rgba(0,212,255,0.1)]">
      <div class="w-full flex items-center justify-between gap-3 sm:gap-4 flex-wrap">
        <a class="font-display text-2xl font-bold tracking-wider text-white flex items-center gap-2" href="ANA SAYFA.html"><img src="../logo.png?v=2" alt="GemTok" style="height:64px;width:auto;max-height:72px;object-fit:contain"></a>
        <div class="hidden md:flex items-center gap-8">
          <a class="nav-link font-medium" href="ANA SAYFA.html">Platforms</a>
          <a class="nav-link font-medium" href="OYUN MERKEZI.html">Integrations</a>
        </div>
        <div id="gemtok-nav-actions" class="flex items-center gap-3 sm:gap-4 shrink-0 flex-wrap justify-end"></div>
      </div>
    </nav>
`;

  h = h.replace(
    /<body\s+class="s2e-home\s+subpage">[\s\n]*<header\s+class="site-header"\s+id="siteHeader">/i,
    `${bodyPrefix}<header class="site-header" id="siteHeader">`,
  );

  h = h.replace('<main class="page-wrap">', '<main class="page-wrap pt-24 md:pt-28">');

  h = h.replace(
    /\s*<\/body>\s*\n\s*<script\s+src="streamtoearn-gifts-assets\/js\/live\.js"/i,
    "\n</div>\n<script src=\"streamtoearn-gifts-assets/js/live.js\"",
  );

  if (!h.includes("gemtok-particles-bg.js")) {
    h = h.replace(
      /\n<\/html>\s*$/i,
      `
<script src="./gemtok-particles-bg.js"></script>
<script src="./gemtok-sira-router.js"></script>
</body>
</html>
`,
    );
  }

  if (!h.includes("gemtok-gift-region-filter.js")) {
    h = h.replace(
      /<script src="streamtoearn-gifts-assets\/js\/live\.js"\s*>\s*<\/script>/i,
      '<script src="streamtoearn-gifts-assets/js/live.js"></script>\n<script src="streamtoearn-gifts-assets/js/gemtok-gift-region-filter.js"></script>',
    );
  }

  h = h.replace(/<title>TikTok gifts list by countries<\/title>/i, "<title>Hediye kataloğu — GemTok</title>");

  return h;
}

async function main() {
  console.log("İndiriliyor:", START);
  const html = await fetchText(START);
  const queue = new Set();
  for (const p of extractHtmlPaths(html)) {
    if (shouldDownloadPath(p) || ALLOW_FAVICON.test(p)) queue.add(p);
  }
  for (const m of html.matchAll(/https:\/\/streamtoearn\.io(\/[^"'>\s<]+)/gi)) {
    const p = m[1].split("?")[0];
    if (shouldDownloadPath(p) || ALLOW_FAVICON.test(p)) queue.add(p);
  }

  const seen = new Set();
  while (queue.size > 0) {
    const batch = [...queue];
    queue.clear();
    for (const p of batch) {
      if (seen.has(p)) continue;
      if (!shouldDownloadPath(p) && !ALLOW_FAVICON.test(p)) continue;
      seen.add(p);
      const abs = BASE + p;
      const dest = diskPathForUrl(abs);
      fs.mkdirSync(path.dirname(dest), { recursive: true });
      if (p.endsWith(".css")) {
        const raw = await fetchText(abs);
        const rewritten = rewriteCssForSubfolder(raw, p);
        fs.writeFileSync(dest, rewritten, "utf8");
        for (const sub of extractCssUrls(raw)) {
          if (shouldDownloadPath(sub) && !seen.has(sub)) queue.add(sub);
        }
        console.log("  CSS", p);
      } else {
        const res = await tryFetchBuf(abs);
        if (!res.ok) {
          console.warn("  atlandı:", p, res.status || res.err?.message || res.err);
          continue;
        }
        fs.writeFileSync(dest, res.buf);
        console.log("  ", p, res.buf.length, "B");
      }
    }
  }

  const finalHtml = injectGemtokSiraChrome(rewriteHtml(html));
  fs.writeFileSync(OUT_HTML, finalHtml, "utf8");
  console.log("Yazıldı:", OUT_HTML);
  console.log("Varlıklar:", OUT_ASSETS, "| dosya:", seen.size);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
