/**
 * GemTok — yerel oyun başlatıcı (yalnızca 127.0.0.1).
 * `sira/oyun-merkezi.html` tıklamada GET /launch?game=… arka planda tetikleyebilir (baslat/BASLAT);
 * tarayıcı doğrudan derlenmiş oyuna gider; delayMs yanıt alanı geriye dönük uyumluluk içindir.
 */
import http from "http";
import { exec } from "child_process";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "..");
const PORT = Number(process.env.GEMTOK_LAUNCHER_PORT || 17070);

/** bat dosyası adı yalnızca buradan; dışarıdan komut enjekte edilmez. */
const GAMES = {
  warFront: {
    dir: path.join(ROOT, "game", "WarFront Arena"),
    bat: "BASLAT.bat",
    openUrl: "http://127.0.0.1:3847/",
    delayMs: 0,
  },
  arenaBattle: {
    dir: path.join(ROOT, "game", "Arena Battle"),
    bat: "baslat.bat",
    openUrl: "http://127.0.0.1:5173/",
    delayMs: 0,
  },
  vote5: {
    dir: path.join(ROOT, "game", "vote5"),
    bat: "baslat.bat",
    openUrl: "http://127.0.0.1:5173/",
    delayMs: 0,
  },
};

function cors(res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
}

function sendJson(res, status, body) {
  cors(res);
  res.writeHead(status, { "Content-Type": "application/json; charset=utf-8" });
  res.end(JSON.stringify(body));
}

function escapeForCmdDir(dir) {
  return path.resolve(dir).replace(/"/g, "'");
}

function spawnBat(gameId, spec) {
  const batPath = path.join(spec.dir, spec.bat);
  if (!fs.existsSync(batPath)) {
    return { ok: false, message: "bat_missing", batPath };
  }
  const d = escapeForCmdDir(spec.dir);
  const cmd = `start "gemtok-${gameId}" cmd /k cd /d "${d}" && call ${spec.bat}`;
  exec(cmd, { cwd: ROOT }, (err) => {
    if (err) console.error("[gemtok-game-launcher]", err.message || err);
  });
  return { ok: true };
}

const server = http.createServer((req, res) => {
  if (req.method === "OPTIONS") {
    cors(res);
    res.writeHead(204);
    res.end();
    return;
  }
  if (req.method !== "GET") {
    sendJson(res, 405, { ok: false, message: "method" });
    return;
  }
  let u;
  try {
    u = new URL(req.url || "/", "http://127.0.0.1");
  } catch {
    sendJson(res, 400, { ok: false });
    return;
  }

  if (u.pathname === "/health") {
    sendJson(res, 200, { ok: true, port: PORT });
    return;
  }

  if (u.pathname !== "/launch") {
    sendJson(res, 404, { ok: false, message: "not_found" });
    return;
  }

  const game = String(u.searchParams.get("game") || "").trim();
  const spec = GAMES[game];
  if (!spec) {
    sendJson(res, 400, { ok: false, message: "unknown_game" });
    return;
  }

  const started = spawnBat(game, spec);
  if (!started.ok) {
    sendJson(res, 404, { ok: false, message: started.message, batPath: started.batPath });
    return;
  }

  sendJson(res, 200, {
    ok: true,
    game,
    openUrl: spec.openUrl,
    delayMs: spec.delayMs,
  });
});

server.on("error", (e) => {
  console.error("[gemtok-game-launcher]", e.code || e.message);
  process.exitCode = 1;
});

server.listen(PORT, "127.0.0.1", () => {
  console.log(`GemTok game launcher http://127.0.0.1:${PORT}  (GET /health  /launch?game=warFront)`);
});
