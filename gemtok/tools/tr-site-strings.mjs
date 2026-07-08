/**
 * Yerel arşiv: sira/*.html ortak çeviri yaması (idempotent).
 * Ana sayfa başlığındaki bozuk karakter için ayrıca kökte şu komutu kullanın:
 *   node -e "const fs=require('fs');const p='sira/index.html';let s=fs.readFileSync(p,'utf8');s=s.replace(/All-in-One Streaming Dashboard[\\s\\S]{0,3}GemTok/,'GemTok — Canlı yayın merkezi');fs.writeFileSync(p,s);"
 * Çalıştır: node tools/tr-site-strings.mjs
 */
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(__dirname, "..");
const sıraDir = path.join(root, "sıra");

const globalHtmlPairs = [
  ['<html lang="en">', '<html lang="tr">'],
  ['<html lang="EN">', '<html lang="tr">'],
  [">Platforms</a>", ">Platformlar</a>"],
  [">Integrations</a>", ">Oyun merkezi</a>"],
  [". All rights reserved.", ". Tüm hakları saklıdır."],
  [
    "The ultimate multi-platform streaming management tool for content creators.",
    "İçerik üreticileri için çoklu platform yayın yönetimi.",
  ],
];

function applyPairs(s, pairs) {
  for (const [a, b] of pairs) {
    if (!s.includes(a)) continue;
    s = s.split(a).join(b);
  }
  return s;
}

function patchSiraHtml(name, extraPairs = []) {
  const fp = path.join(sıraDir, name);
  if (!fs.existsSync(fp)) return;
  let s = fs.readFileSync(fp, "utf8");
  const orig = s;
  s = applyPairs(s, globalHtmlPairs);
  s = applyPairs(s, extraPairs);
  if (s !== orig) fs.writeFileSync(fp, s);
}

for (const name of fs.readdirSync(sıraDir)) {
  if (name.endsWith(".html")) patchSiraHtml(name);
}

patchSiraHtml("index.html", [
  ["THE ULTIMATE", "EN ÜST DÜZEY"],
  ["LIVE STREAMING TOOLS", "CANLI YAYIN ARAÇLARI"],
  ['<div class="text-[#64748b] text-sm mt-1">Thousand Streamers</div>', '<div class="text-[#64748b] text-sm mt-1">Bin yayıncı</div>'],
  [
    '<div class="text-[#64748b] text-sm mt-1">Million Events Processed</div>',
    '<div class="text-[#64748b] text-sm mt-1">Milyon işlenen olay</div>',
  ],
  ['<div class="text-[#64748b] text-sm mt-1">Platforms Connected</div>', '<div class="text-[#64748b] text-sm mt-1">Bağlı platform</div>'],
  ['<div class="pb-3 text-[#64748b] text-sm">Works with:</div>', '<div class="pb-3 text-[#64748b] text-sm">Uyumluluk:</div>'],
  ["Integrations</h2>", "Oyunlar ve bağlantılar</h2>"],
  [
    "Connect all your favorite games and streaming tools. Built to work perfectly with your existing setup.",
    "Oyunlarınız ve yayın araçlarınız tek yerde. Mevcut kurulumunuzla uyumlu çalışır.",
  ],
  ["Why GemTok", "Neden GemTok"],
  ["Built for Content Creators", "İçerik üreticileri için"],
  [
    "Focus on creating amazing content while we handle the complexity of multi-platform engagement. Real-time sync, powerful automation, and deep insights.",
    "Siz içeriğe odaklanın; çoklu platform etkileşimini biz sadeleştiriyoruz. Gerçek zamanlı eşleme, otomasyon ve özet bilgiler.",
  ],
  ["Unified Chat", "Birleşik sohbet"],
  [
    "View to comments from Twitch, YouTube, TikTok, Kick, and Douyin in one unified overlay.",
    "Twitch, YouTube, TikTok, Kick ve Douyin yorumlarını tek yerde görün.",
  ],
  ["Real-Time Event Sync", "Anlık olay eşleme"],
  [
    "Instantly sync follows, likes, shares, and donations across all your connected platforms.",
    "Takip, beğeni, paylaşım ve bağışları bağlı platformlarınızda anında eşitleyin.",
  ],
  ["Advanced Analytics", "Gelişmiş analiz"],
  [
    "Track engagement metrics, viewer growth, and revenue across all platforms with detailed reports.",
    "Etkileşim, izleyici artışı ve geliri tüm platformlarda raporlarla takip edin.",
  ],
  ["Trusted by Creators Worldwide", "Dünya çapında içerik üreticilerinin tercihi"],
  [
    "Join thousands of streamers who have simplified their multi-platform workflow with GemTok",
    "Çoklu platform akışını GemTok ile sadeleştiren binlerce yayıncıya katılın",
  ],
  ['alt="Creator 1"', 'alt="Yayıncı 1"'],
  ['alt="Creator 2"', 'alt="Yayıncı 2"'],
  ['alt="Creator 3"', 'alt="Yayıncı 3"'],
  ['alt="Creator 4"', 'alt="Yayıncı 4"'],
  ["105,000+ creators has joined", "105.000+ içerik üreticisi katıldı"],
  ["Start your multi-platform journey today", "Çoklu platform yolculuğunuza bugün başlayın"],
  [" Join Now ", " Katıl "],
  ["Ready to Stream Smarter?", "Daha akıllı yayına hazır mısınız?"],
]);

patchSiraHtml("admin.html", [
  ["<title>Admin Panel — GemTok</title>", "<title>Yönetici paneli — GemTok</title>"],
  ['">Admin Panel</h1>', '">Yönetici paneli</h1>'],
  [">Admin</a>", ">Yönetici</a>"],
]);

const hubPath = path.join(root, "hub.html");
if (fs.existsSync(hubPath)) {
  let h = fs.readFileSync(hubPath, "utf8");
  const o = h;
  h = h.replace('">Welcome</a>', '">Karşılama</a>');
  h = h.replace("TikTok Gifts (StreamToEarn aynası)", "TikTok hediyeleri (StreamToEarn aynası)");
  if (h !== o) fs.writeFileSync(hubPath, h);
}

console.log("tr-site-strings: tamam (ANA başlığı için üstteki nota bakın).");
