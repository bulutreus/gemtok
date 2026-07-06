# GemTok EventBus / TikTok Live migrasyon raporu

Bu rapor, **tek TikFinity WebSocket** (merkezi `GemTokTikTokLive` + `BroadcastChannel`) politikasına geçişte hangi oyunların güncellendiğini özetler.

## Ortak bileşenler

| Dosya | Rol |
|--------|-----|
| `gemtok-tikfinity-client.js` (kök) | TikFinity JSON → düz payload (`gift`, `like`, …). |
| `sıra/gemtok-tiktok-live-global.js` | Tek öncü sekme WebSocket + `GemTokTikTokLive.eventBus` + çok sekme senkronu. |
| `gemtok-live-game-bridge.js` (kök) | `GemTokLiveGameBridge.ensure()` → `bootstrap`, `onPayload()` → tüm TikTok olaylarına abone olma yardımcısı. |

**Geri uyumluluk:** Köprü script’leri yoksa veya `GemTokTikTokLive` yüklenemezse, oyunlar önceki **doğrudan WebSocket** yoluna düşer (WarFront, arena3/5gen, Arena Battle, Country Birds, vote5).

## Güncellenen oyunlar ve dosyalar

### WarFront Arena

- **Kaldırılan / devre dışı:** Varsayılan akışta tarayıcı içi **ikinci** `new WebSocket(TikFinity)` açılmaz; `GemTokLiveGameBridge` + `GemTokTikTokLive` kullanılır.
- **Dosyalar:** `game/WarFront Arena/public/index.html` (köprü script’leri + `__GEMTOK_GIFT_HUB_URL__`), `public/game.js` (`startTikfinityAutoConnect`, `disconnectTikfinityClient`, HUD yoklaması).
- **Eski yol:** Köprü yoksa `connectTikfinityWebSocket()` aynen çalışır.

### arena3 & arena5gen

- **Kaldırılan:** Köprü aktifken doğrudan `new WebSocket` ile TikFinity bağlantısı açılmaz.
- **Dosyalar:** `game/arena3/index.html`, `game/arena5gen/index.html` (script ekleri), gömülü `connectTikfinity` / `disconnectTikfinity` / `handleGemTokPortalGift`.
- **Olaylar:** Portal düz `gift` payload’ı `{ event: 'gift', data: p }` şeklinde mevcut `handleTikfinityParsed` ile işlenir (hediye mantığı değişmedi).

### Arena Battle (Vite kaynak + `dist/`)

- **Dosyalar:** `game/Arena Battle/index.html`, `src/tiktok/tikfinityBridge.ts` — `connectTikFinityWebSocket` önce `GemTokLiveGameBridge` dener; başarılıysa WebSocket açılmaz.
- **Derleme:** `npm run build` → `dist/` güncellenir.

### Country Birds (Vite kaynak + `dist/`)

- **Dosyalar:** `index.html` (köprü script’leri), `src/tikfinity/normalize.ts` (`normalizeGemTokFlatPayload`), `src/tikfinity/client.ts` (portal öncelikli istemci).
- **Derleme:** `npm run build` → `dist/index.html` içinde `../../../` ile kök script’lere referans.

### vote5 (Yayın Puanı — TikFinity yan kanal)

- **Dosyalar:** `game/vote5/client/index.html`, `client/tikfinityLive.js` (`attachTikfinityBridge` içinde portal dalı).
- **Not:** Birincil canlı akış `tiktok-live-connector` ile sunucuya gider; TikFinity köprüsü isteğe bağlı sütun modu için kullanılmaya devam eder.
- **Derleme:** `game/vote5` içinde `npm run build` ile `play/` güncellenir (Vite `outDir`: `../play`).
- **Launcher:** `sıra/OYUN MERKEZI.html` vote5 bağlantısı `../game/vote5/play/index.html` ile bu çıktıya yönlendirilir (eski `client/dist` yolu kullanılmıyordu).

### Sıra / portal (önceden yapılmıştı)

- `sıra/ANA SAYFA.html`, `OYUN MERKEZI.html`, `Integrations.html` — `GemTokTikTokLive.bootstrap` + nav rozeti.

## TypeScript paket (`@gemtok/live`)

- `src/services/EventBus.ts`, `TikTokConnectionManager.ts`, `GiftManager.ts`, `hooks/useEventBus.ts` — yeni Vite/React oyunları için.
- Dokümantasyon: `docs/EventBusArchitecture.md`.

## Bilinçli olarak dokunulmayan / manuel

| Öğe | Sebep |
|------|--------|
| `hostinger-yukle/...` altındaki Car Race kopyası | Ayrı dağıtım paketi; köprüyü elle aynı script sırasıyla ekleyin. |
| `game/WarFront Arena/public/gemtok-tikfinity-client.js` | Yerel kopya; kök `gemtok-tikfinity-client.js` ile senkron tutulmalı (mevcut README uyarısı). |

## Gelecek oyun kuralı

1. Sayfaya sırayla: `gemtok-tikfinity-client.js` → `gemtok-tiktok-live-global.js` → `gemtok-live-game-bridge.js` → `GemTokLiveGameBridge.ensure({ hubBase })`.
2. Oyun içi: `GemTokLiveGameBridge.onPayload(handler)` veya `GemTokTikTokLive.eventBus.on("gift", …)` — **asla** doğrudan `new WebSocket` ile TikFinity’ye bağlanmayın (köprü yoksa istisna: yalnızca geri uyumluluk için).

## Doğrulama önerisi

1. Ana sayfayı açın (`sıra/ANA SAYFA.html`) — TikTok Live köprüsü çalışsın.
2. Oyunu aynı tarayıcıda başka sekmede açın — öncü sekme bağlıyken oyun **izleyici** olarak olay almalı.
3. Yalnızca oyun URL’sini açın (portal yok) — oyun sekmesi öncü olur; yine tek WebSocket kuralı korunur.
