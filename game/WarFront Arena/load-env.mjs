/**
 * Proje kökündeki `.env` → `process.env` (`server.js` bunu ilk import eder; örn. `TIKFINITY_WS_URL`, `PORT`).
 * KEY=değer | KEY="değer" | # yorum. Zaten dolu ortam değişkenini ezmez.
 */
import { readFileSync, existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = dirname(fileURLToPath(import.meta.url));
const envPath = join(root, ".env");
if (!existsSync(envPath)) {
  /* yoksa sorun değil */
} else {
  try {
    const text = readFileSync(envPath, "utf8");
    for (let line of text.split(/\r?\n/)) {
      const t = line.trim();
      if (!t || t.startsWith("#")) continue;
      const eq = t.indexOf("=");
      if (eq < 1) continue;
      const key = t.slice(0, eq).trim();
      if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(key)) continue;
      let val = t.slice(eq + 1).trim();
      if (
        (val.startsWith('"') && val.endsWith('"') && val.length >= 2) ||
        (val.startsWith("'") && val.endsWith("'") && val.length >= 2)
      ) {
        val = val.slice(1, -1);
      }
      if (process.env[key]) continue;
      process.env[key] = val;
    }
  } catch {
    /* */
  }
}
