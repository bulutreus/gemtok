/**
 * Tek seferlik / tekrar güvenli: yalnızca sekme ikonu (favicon) → ../gemtok/gemtok.png
 * Üst menü logosu sayfa içinde ../logo.png kalır.
 * Kök index.html / hub.html → ./gemtok/gemtok.png (favicon)
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
  console.error("sıra klasörü bulunamadı:", REPO_ROOT);
  process.exit(1);
}

const FAV_OLD = '<link href="../httrack_mirror/www.gemtok.live/file/public/img/favicon0475.html" rel="shortcut icon">';
const FAV_NEW = '<link rel="icon" type="image/png" href="../gemtok/gemtok.png">';

function patchHtmlContent(raw) {
  let s = raw;
  s = s.split(FAV_OLD).join(FAV_NEW);
  return s;
}

function patchRootHtml(raw) {
  let s = raw;
  if (!s.includes('rel="icon"') && !s.includes("rel='icon'") && s.includes("<head>")) {
    s = s.replace("<head>", '<head>\n  <link rel="icon" type="image/png" href="./gemtok/gemtok.png">');
  }
  return s;
}

let n = 0;
for (const name of fs.readdirSync(SIRA)) {
  if (!name.endsWith(".html")) continue;
  const fp = path.join(SIRA, name);
  const before = fs.readFileSync(fp, "utf8");
  const after = patchHtmlContent(before);
  if (after !== before) {
    fs.writeFileSync(fp, after, "utf8");
    n++;
    console.log("sira/", name);
  }
}

for (const rel of ["index.html", "hub.html"]) {
  const fp = path.join(REPO_ROOT, rel);
  if (!fs.existsSync(fp)) continue;
  const before = fs.readFileSync(fp, "utf8");
  const after = patchRootHtml(before);
  if (after !== before) {
    fs.writeFileSync(fp, after, "utf8");
    n++;
    console.log(rel);
  }
}

console.log("Güncellenen dosya:", n);
