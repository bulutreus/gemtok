import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const sira = path.join(__dirname, "..", "sıra");
const needle = '<script src="./gemtok-license.js"></script>';
const insert = '<script src="./gemtok-particles-bg.js"></script><script src="./gemtok-license.js"></script>';

for (const f of fs.readdirSync(sira)) {
  if (!f.endsWith(".html")) continue;
  const p = path.join(sira, f);
  let s = fs.readFileSync(p, "utf8");
  if (!s.includes("particles-canvas")) continue;
  if (s.includes("gemtok-particles-bg.js")) continue;
  if (!s.includes(needle)) continue;
  const n = s.split(needle).length - 1;
  if (n !== 1) {
    console.warn("skip (license count!=1)", f, n);
    continue;
  }
  s = s.replace(needle, insert);
  fs.writeFileSync(p, s, "utf8");
  console.log("patched", f);
}
