/**
 * One-shot: remove HTTrack/extension cruft and unused script tags from HTML under the repo.
 * Skips node_modules, .git, httrack_mirror (large mirrors).
 */
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(__dirname, "..");
const SKIP_DIRS = new Set(["node_modules", ".git", "httrack_mirror"]);

function removeGiveFreely(s) {
  return s
    .replace(/<div[^>]*class="give-freely-root"[^>]*>[\s\S]*?<\/template><\/div>/gi, "")
    .replace(/<div id="give-freely-root[^"]*"[^>]*>[\s\S]*?<\/template><\/div>/gi, "");
}

function removeJqueryPair(s) {
  return s.replace(
    /<script src="[^"]*jquery\.min\.js\.indir"><\/script>\s*<script src="[^"]*prod-common\.min\.js\.indir"><\/script>\s*/gi,
    ""
  );
}

function removeRecaptchaGhost(s) {
  const markers = ['<script src="./gemtok-license.js"', "<script defer src=\"./gemtok-license.js\""];
  let idx = -1;
  for (const m of markers) {
    idx = s.indexOf(m);
    if (idx >= 0) break;
  }
  if (idx < 0) return s;
  const head = s.slice(0, idx);
  if (head.indexOf("g-recaptcha") < 0) return s;
  const start = head.lastIndexOf('<div style="background-color: rgb(255, 255, 255)');
  if (start < 0) return s;
  return s.slice(0, start) + s.slice(idx);
}

function removeModalDemo(s) {
  const startTag = '<div class="fixed inset-0 z-50 items-center justify-center hidden" id="modalDemo">';
  const i = s.indexOf(startTag);
  if (i < 0) return s;
  const j = s.indexOf("<footer", i);
  if (j < 0) return s;
  return s.slice(0, i) + s.slice(j);
}

function walkHtmlFiles(dir, out = []) {
  for (const ent of fs.readdirSync(dir, { withFileTypes: true })) {
    if (ent.isDirectory() && SKIP_DIRS.has(ent.name)) continue;
    const full = path.join(dir, ent.name);
    if (ent.isDirectory()) walkHtmlFiles(full, out);
    else if (ent.name.endsWith(".html")) out.push(full);
  }
  return out;
}

const files = walkHtmlFiles(root);
function removeExtensionInjectedStyles(s) {
  return s
    .replace(/<style id="mttstyle">[\s\S]*?<\/style>/gi, "")
    .replace(/<style id="mttstyleSubtitle">[\s\S]*?<\/style>/gi, "")
    .replace(/<style id="grabbit-visited-styles">[\s\S]*?<\/style>/gi, "");
}

function cleanHtml(s) {
  s = removeGiveFreely(s);
  s = removeJqueryPair(s);
  s = removeRecaptchaGhost(s);
  s = removeExtensionInjectedStyles(s);
  return s;
}

for (const p of files) {
  const rel = path.relative(sira, p);
  let s = fs.readFileSync(p, "utf8");
  const before = s.length;
  s = cleanHtml(s);
  if (rel === "ANA SAYFA.html") s = removeModalDemo(s);
  if (s.length !== before) {
    fs.writeFileSync(p, s, "utf8");
    console.log("cleaned", rel.replace(/\\/g, "/"), "bytes", before, "->", s.length);
  }
}
