/**
 * TikFinity WebSocket köprüsü — Hostinger (HTTPS) sitesinden yerel TikFinity'ye.
 * ws://127.0.0.1:29213 → ws://127.0.0.1:21213
 */
import { createServer } from "http";
import { createRequire } from "module";
import { promises as fs } from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const require = createRequire(import.meta.url);

function loadWsModule() {
  const tries = [
    path.join(__dirname, "node_modules", "ws"),
    path.join(__dirname, "..", "game", "WarFront Arena", "node_modules", "ws"),
  ];
  for (const modPath of tries) {
    try {
      return require(modPath);
    } catch {
      /* */
    }
  }
  throw new Error("ws paketi bulunamadi. tools klasorunde: npm install ws");
}

const { WebSocketServer, WebSocket } = loadWsModule();

const PORT = Number(process.env.GEMTOK_TIKFINITY_BRIDGE_PORT || 29213);
const UPSTREAM = String(process.env.TIKFINITY_WS_URL || "ws://127.0.0.1:21213").trim();
const PUBLIC_ROOT = path.resolve(__dirname, "..");

const MIME = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".mjs": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".webp": "image/webp",
  ".gif": "image/gif",
  ".ico": "image/x-icon",
  ".mp3": "audio/mpeg",
  ".wav": "audio/wav",
  ".webm": "video/webm",
  ".woff": "font/woff",
  ".woff2": "font/woff2",
};

function isDeniedPath(filePath) {
  const rel = path.relative(PUBLIC_ROOT, filePath);
  if (!rel || rel.startsWith("..") || path.isAbsolute(rel)) return rel !== "";
  const normalized = rel.replace(/\\/g, "/").toLowerCase();
  return (
    normalized.startsWith(".git/") ||
    normalized.startsWith(".gemtok-private/") ||
    normalized.includes("/node_modules/") ||
    normalized.startsWith("node_modules/") ||
    normalized.endsWith(".env") ||
    normalized.endsWith(".php")
  );
}

const server = createServer(async (req, res) => {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
  if (req.method === "OPTIONS") {
    res.writeHead(204);
    res.end();
    return;
  }
  if (req.url === "/health" || req.url === "/") {
    if (req.url === "/") {
      res.writeHead(302, { Location: "/s%C4%B1ra/OYUN%20MERKEZI.html" });
      res.end();
      return;
    }
    res.writeHead(200, { "Content-Type": "application/json; charset=utf-8" });
    res.end(JSON.stringify({ ok: true, service: "gemtok-tikfinity-bridge", upstream: UPSTREAM, port: PORT }));
    return;
  }
  try {
    res.removeHeader("Access-Control-Allow-Origin");
    res.removeHeader("Access-Control-Allow-Methods");
    res.removeHeader("Access-Control-Allow-Headers");
    const requestUrl = new URL(req.url || "/", `http://127.0.0.1:${PORT}`);
    const pathname = decodeURIComponent(requestUrl.pathname);
    const filePath = path.resolve(PUBLIC_ROOT, `.${pathname}`);
    if (isDeniedPath(filePath)) {
      res.writeHead(403);
      res.end("Forbidden");
      return;
    }
    const stat = await fs.stat(filePath);
    if (!stat.isFile()) throw new Error("not_file");
    const body = await fs.readFile(filePath);
    res.writeHead(200, {
      "Content-Type": MIME[path.extname(filePath).toLowerCase()] || "application/octet-stream",
      "Cache-Control": "no-store",
      "X-Content-Type-Options": "nosniff",
    });
    res.end(body);
  } catch {
    res.writeHead(404, { "Content-Type": "text/plain; charset=utf-8" });
    res.end("Not found");
  }
});

const wss = new WebSocketServer({ server });

wss.on("connection", (client) => {
  let up = null;
  try {
    up = new WebSocket(UPSTREAM);
  } catch {
    try {
      client.close();
    } catch {}
    return;
  }
  const closeBoth = () => {
    try {
      client.close();
    } catch {}
    try {
      up?.close();
    } catch {}
  };
  up.on("message", (data) => {
    if (client.readyState === WebSocket.OPEN) client.send(data);
  });
  client.on("message", (data) => {
    if (up.readyState === WebSocket.OPEN) up.send(data);
  });
  up.on("close", closeBoth);
  up.on("error", closeBoth);
  client.on("close", closeBoth);
  client.on("error", closeBoth);
});

server.listen(PORT, "127.0.0.1", () => {
  console.log(`[gemtok-tikfinity-bridge] http://127.0.0.1:${PORT}/health`);
  console.log(`[gemtok-tikfinity-bridge] ws://127.0.0.1:${PORT}/  →  ${UPSTREAM}`);
  console.log("[gemtok-tikfinity-bridge] TikFinity acik olmali. Site HTTPS ise tarayicide yerel ag izni verin.");
  console.log(`[gemtok-tikfinity-bridge] Yerel oyun merkezi: http://127.0.0.1:${PORT}/`);
});
