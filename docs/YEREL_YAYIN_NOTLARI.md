# Yerel arşiv — yayın öncesi notlar

Bu depo **yerel arşiv** olarak tasarlanmıştır; tek turda “tüm siteyi üretimdeki canlı GemTok ile birebir” yapmak mümkün değildir. Aşağıdaki tarama, **kırık yerel yollar** ve **statik oyun girişleri** üzerine odaklanır.

## Yapılan düzeltmeler (özet)

| Konu | Aksiyon |
|------|---------|
| PWA `manifest.json` 404 | Tüm `sira/*.html` ve `gemtok/sira/*.html` içindeki `../httrack_mirror/www.gemtok.live/manifest.json` bağlantıları **`../gemtok/manifest.json`** olarak güncellendi; kökte `gemtok/manifest.json` eklendi. |
| Kök `index.html` | Var olmayan `httrack_mirror/...` bağlantısı kaldırıldı (404 önlenir). |
| Vote5 Vite girişi | `game/vote5/client/index.html` içinde `src="/main.jsx"` → **`./main.jsx`** (`file://` ve statik sunucu için daha güvenilir). |

## Oyunları açma (doğru giriş noktaları)

- **Yayın Puanı (vote5):** `game/vote5/play/index.html` (derlenmiş IIFE) veya `npm run dev` ile geliştirme.
- **Arena Battle / Country Birds:** `dist/index.html` — kök `index.html` / Vite `index.html` (`/src/main.ts`) **çift tıklama ile değil**.
- **WarFront Arena:** `game/WarFront Arena/public/index.html`.
- **Arena3 / Arena5gen:** `game/arena3/index.html`, `game/arena5gen/index.html`.

## Bilinçli olarak dışarıda kalanlar

- Aynalanan sayfalardaki **TikFinity, OBS, Itemsatis, Telegram** vb. harici `https://` bağlantıları yayın iş akışı içindir; bunları kaldırmak “yerel çalışır” ama “işlevsel demo”yu bozar.
- `game/WarFront Arena/public/assets/` altındaki kayıtlı **Rank Vote** HTML anlık görüntüleri canlı iframe içerir; yalnızca arşiv referansıdır.
- **Gift Hub** (`gift-hub/`) ve **Vote5 sunucusu** yayın sırasında ayrı süreç olarak çalıştırılmalıdır (`8787`, `5749` vb.).

## Önerilen elle doğrulama (15–30 dk)

1. `sira/index.html` → Oyun Merkezi → her oyun kartı.
2. Tarayıcı geliştirici araçları **Konsol / Ağ**: kırmızı 404 ve tekrarlayan başarısız istekler.
3. `npm run build` (vote5) ve kullandığınız diğer paketler için mevcut `package.json` betikleri.

Son güncelleme: depo içi tarama ve yukarıdaki yamalar.
