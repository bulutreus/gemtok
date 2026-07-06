/**
 * BASLAT.bat — 127.0.0.1:PORT TCP hazir olana kadar bekler.
 */
import net from "node:net";

const port = Math.max(1, Math.min(65535, Number.parseInt(String(process.argv[2] || "3847"), 10) || 3847));
const host = "127.0.0.1";
const maxRounds = 45;

function tryPortOnce() {
  return new Promise((resolve) => {
    const socket = net.connect({ port, host }, () => {
      socket.destroy();
      resolve(true);
    });
    socket.on("error", () => resolve(false));
    socket.setTimeout(1200, () => {
      try {
        socket.destroy();
      } catch {
        /* */
      }
      resolve(false);
    });
  });
}

async function main() {
  for (let i = 0; i < maxRounds; i++) {
    if (await tryPortOnce()) process.exit(0);
    await new Promise((r) => setTimeout(r, 1000));
  }
  process.exit(1);
}

main().catch((e) => {
  console.error("[wait-node-port]", e);
  process.exit(1);
});
