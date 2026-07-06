# Country Birds — TikFinity WebSocket

TikFinity masaüstü uygulamasının yerel WebSocket’ine (`ws://127.0.0.1:21213`) bağlanır; JSON mesajlarını ayrıştırır; `gift`, `like`, `follow`, `member`, `subscribe`, `share` olaylarını uygulama içi aksiyonlara çevirir.

## WebSocket URL çözüm sırası

1. `localStorage` anahtarı: `countrybirds.tikfinity.wsUrl` (isteğe bağlı; geliştirici araçlarından ayarlanabilir)
2. Ortam değişkeni: `VITE_TIKFINITY_WS_URL` (`.env` içinde)
3. Varsayılan: `ws://127.0.0.1:21213`

## Otomatik bağlantıyı kapatma

- `?tikfinityAutoconnect=false` (veya `0`, `no`, `off`)
- `?noTikfinityAutoconnect=1` (veya `true`, `yes`, `on`)

## Yerel oynama (derlenmiş)

- **`dist/index.html`** dosyasını tarayıcıda açın (`file://` için önce **`npm run build`**).
- Klasör kökünde **`index.htm`**, aynı hedefe yönlendirir (Vite kaynak **`index.html`** ile karışmaması için `.htm`).

## Geliştirme

```bash
npm install
npm run dev
```

## Mesaj kısma

Gelen JSON nesneleri bir kuyruğa alınır; `requestAnimationFrame` ile kare başına sınırlı sayıda işlenir (`src/tikfinity/client.ts` içindeki `maxPerFrame`).

## Yeniden bağlanma

Bağlantı koptuğunda 2.5–6 saniye aralıkta yeniden denenir. Sekme kapanırken bağlantı kesilir (`beforeunload`).

## Angry Birds tarzı oyun

- Görseller `public/assets/` altında (`1.PNG`–`6.PNG` kuşlar, `backg1.PNG`–`backg8.PNG` arka planlar, **`pig.png` hedef domuzlar**).
- **Hediye (gift)** gelince: ayarlarda takıma bağlı **TikTok hediye id / adı** ile eşleşen takımın kuşu fırlar (`src/game/teamFromGift.ts` + `tiktokGiftsCatalog.ts`).
- **Tüm TikTok hediye listesi** `webcast/gift/list` yanıtından üretilen `src/data/tiktok-gifts-full.json` dosyasındadır (yüzlerce hediye; ikon + elmas + id). Güncellemek için: `npm run refresh-tiktok-gifts` (ağ gerekir, sonra `npm run build` veya dev yeniden yükleme).
- Sapan çizimi ve çarpışma kutuları arka plana göre **normalize (0–1) koordinatlar** ile `src/game/levelSpec.ts` içinde ayarlanır; arka plan değiştikçe `perBackground` ile ince ayar yapılabilir.
- Manuel test: sapanı sürükleyip bırakın veya **Test atışı** düğmesi.
- Ses: `public/shot.mp3` (atış), `public/bomb.mp3` (kutu yok olunca); kırılan kutu **2 saniye** sonra aynı yerde yeniden gelir.

## Kendi oyununuza bağlama

`src/tikfinity/actions.ts` içindeki `mapTikfinityEventToAction` ve `createTikfinityClient({ onAction })` geri çağrısı `src/main.ts` içinde `AngryGame` ile birleştirilmiştir.
