/**
 * TikFinity WebSocket köprüsü — statik HTTPS sitesinden yerel TikFinity'ye.
 * ws://127.0.0.1:29213 → ws://127.0.0.1:21213
 */
import { createServer } from "http";
import { createRequire } from "module";
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

const server = createServer((req, res) => {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
  if (req.method === "OPTIONS") {
    res.writeHead(204);
    res.end();
    return;
  }
  if (req.url === "/health" || req.url === "/") {
    res.writeHead(200, { "Content-Type": "application/json; charset=utf-8" });
    res.end(JSON.stringify({ ok: true, service: "gemtok-tikfinity-bridge", upstream: UPSTREAM, port: PORT }));
    return;
  }
  res.writeHead(404);
  res.end();
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
});
