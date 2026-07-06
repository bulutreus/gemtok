import { promises as fs } from "node:fs";
import path from "node:path";

const root = path.resolve("sıra");
const wanted = [
  "ç", "Ç", "ğ", "Ğ", "ı", "İ", "ö", "Ö", "ş", "Ş", "ü", "Ü",
  "â", "Â", "î", "Î", "û", "Û", "’", "‘", "“", "”", "–", "—", "…", "•", "→", "←", "©", "®", "€",
];
const win1252 = new TextDecoder("windows-1252");
const replacements = new Map();

const explicit = {
  "Ã§": "ç", "Ã‡": "Ç", "ÄŸ": "ğ", "Äž": "Ğ", "Ä±": "ı", "Ä°": "İ",
  "Ã¶": "ö", "Ã–": "Ö", "ÅŸ": "ş", "Åž": "Ş", "Ã¼": "ü", "Ãœ": "Ü",
  "â€”": "—", "â€“": "–", "â€™": "’", "â€˜": "‘", "â€œ": "“", "â€": "”",
  "â€¦": "…", "â€¢": "•", "Â«": "«", "Â»": "»", "Â·": "·", "Â©": "©",
  "PortuguÃªs": "Português", "EspaÃ±ol": "Español", "RomânÄƒ": "Română", "Â ": " ",
  "Gï¿½Rï¿½ï¿½ YAPTIKTAN SONRAKï¿½ WELCOME SAYFASI": "GİRİŞ YAPTIKTAN SONRAKİ WELCOME SAYFASI",
  "MEMBER LOGï¿½N": "MEMBER LOGİN", "REGï¿½STER": "REGİSTER",
  "MENï¿½YE GERï¿½ BASINCA": "MENÜYE GERİ BASINCA",
  "Privacy Policy ï¿½ GemTok": "Privacy Policy — GemTok",
  "Terms of Service ï¿½ GemTok": "Terms of Service — GemTok",
};

for (const [broken, correct] of Object.entries(explicit)) replacements.set(broken, correct);

for (const correct of wanted) {
  const broken = win1252.decode(Buffer.from(correct, "utf8"));
  if (broken !== correct && !replacements.has(broken)) replacements.set(broken, correct);
}

// Daha once iki kez yanlis kodlanmis metinleri de ayni kontrollu tabloyla onar.
for (let pass = 0; pass < 3; pass += 1) {
  for (const [broken, correct] of [...replacements]) {
    const twice = win1252.decode(Buffer.from(broken, "utf8"));
    if (twice !== broken) replacements.set(twice, correct);
  }
}

const entries = await fs.readdir(root, { withFileTypes: true });
let changedFiles = 0;
let changedTokens = 0;

for (const entry of entries) {
  if (!entry.isFile() || !/\.(?:html|js)$/i.test(entry.name)) continue;
  const file = path.join(root, entry.name);
  let text = await fs.readFile(file, "utf8");
  const before = text;
  for (let pass = 0; pass < 3; pass += 1) {
    for (const [broken, correct] of replacements) {
      if (!text.includes(broken)) continue;
      const parts = text.split(broken);
      changedTokens += parts.length - 1;
      text = parts.join(correct);
    }
  }
  // Yukaridaki geri kazanilabilir dosya adlari duzeldikten sonra kalan
  // eski replacement karakterleri yalnizca ayirici/bullet olarak kullanilir.
  text = text.replaceAll("ï¿½", "•");
  if (text !== before) {
    await fs.writeFile(file, text, "utf8");
    changedFiles += 1;
    console.log(path.relative(process.cwd(), file));
  }
}

console.log(`Changed files: ${changedFiles}; replacements: ${changedTokens}`);
