/**
 * Sayfa içi nav img → ../logo.png?v=2; sekme ikonu (link rel="icon" href="../gemtok/...) aynı kalır.
 * Kullanım (repo kökü): node tools/revert-nav-logo-to-logo-png.mjs
 */
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(__dirname, "..");
const sub = fs.readdirSync(REPO_ROOT, { withFileTypes: true });
const siraEnt = sub.find((d) => d.isDirectory() && fs.existsSync(path.join(REPO_ROOT, d.name, "index.html")));
const SIRA = siraEnt ? path.join(REPO_ROOT, siraEnt.name) : null;
if (!SIRA) {
  console.error("sıra bulunamadı");
  process.exit(1);
}

let n = 0;
for (const name of fs.readdirSync(SIRA)) {
  if (!name.endsWith(".html")) continue;
  const fp = path.join(SIRA, name);
  let s = fs.readFileSync(fp, "utf8");
  const before = s;
  s = s.replace(/src="\.\.\/gemtok\/gemtok\.png(\?v=\d+)?"/g, 'src="../logo.png?v=2"');
  if (s !== before) {
    fs.writeFileSync(fp, s, "utf8");
    n++;
    console.log("sira/", name);
  }
}
console.log("Güncellenen:", n);
