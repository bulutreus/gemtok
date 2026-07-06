# TikTok sütun oyunu (yayın puanı)

Dikey yayın ekranı: 5 çizgili sütun, üstte süre, altta **YAYIN PUANI** kutuları. TikTok canlı hediyeleri `tiktok-live-connector` ile dinlenir; hediye hangi sütuna aitse o sütuna düşer.

## Kurallar (varsayılan)

- **Küçük hediye** (`diamondCount` `smallGiftDiamondMin`–`smallGiftDiamondMax` arası, varsayılan **1–99** jeton): **1 jeton = 1 küçük** profil (combo/streak toplam jeton kadar, en fazla 200).
- **100+ jeton** (`diamondCount` ≥ `largeGiftMinDiamonds`): **2 büyük** profil (streak varsa `scaleAvatarsWithRepeat: true` ile 2×streak, tavan 50).
- **Yayın puanı**: Hediyenin toplam jeton değeri (`diamondCount` × tekrar) ilgili sütuna eklenir.
- **Streak**: Küçük hediyelerde profil sayısı zaten toplam jetonla artar. `scaleAvatarsWithRepeat` yalnızca **100+ jeton** hediyelerde combo çarpanını etkiler.

## Çalıştırma

### npm olmadan (yalnız tarayıcı)

Derlenmiş dosyalar **`play/`** klasöründedir. **`play/index.html`** dosyasına çift tıklayın veya proje kökündeki **`index.html`** (sizi `play/` içine yönlendirir). **Node veya npm çalıştırmanız gerekmez.**

- Chrome, `file://` üzerinde **`type="module"`** ile yüklenen ayrı betik dosyalarını güvenlik nedeniyle bloklar (“null origin” CORS). Bu yüzden `play/` çıktısı **tek klasik `vote5.js` (IIFE)** olarak üretilir; çift tıklama ile çalışması buna göre ayarlanmıştır.

- Bu modda **canlı TikTok bağlantısı yoktur** (TikTok dinleyicisi sunucuda çalışır). Ayarlardaki **test hediyeleri** ile oyunu kullanın.
- `config/columns.json` içeriği derleme anında arayüze gömülür. Ayarı değiştirdikten sonra yeniden paketlemek için bir kez **`npm run build`** çalıştırın; `play/` klasörünü güncellersiniz.

### TikTok canlı + sunucu

```bash
npm install
npm run dev
```

veya üretim benzeri:

```bash
npm run build
npm start
```

- Geliştirme arayüzü: http://127.0.0.1:5173  
- Sunucu (API + Socket.IO + derlenmiş arayüz): **http://127.0.0.1:5749/**

**5749** doluysa: `set PORT=5750` (veya PowerShell’de `$env:PORT=5750`) ile `npm start` çalıştırın; `npm run dev` kullanıyorsanız aynı port için `set VOTE5_SERVER_PORT=5750` ayarlayın (`client/vite.config.js` vekil hedefi).

**Not:** Kaynak geliştirme sayfası `client/index.html` — bunu `file://` ile açmayın. Hazır paket için `play/index.html` kullanın.

## TikFinity (tarayıcı — önerilen canlı)

[TikFinity](https://tikfinity.zerody.one/) masaüstü uygulaması açıkken tarayıcı **otomatik** olarak yerel WebSocket’e bağlanır (varsayılan **`ws://127.0.0.1:21213`**).

- **Adres sırası:** `localStorage` anahtarı **`vote5_tikfinity_ws`** → derleme ortamı **`VITE_TIKFINITY_WS`** → varsayılan `ws://127.0.0.1:21213`.
- **Otomatik bağlantıyı kapat:** sayfaya **`?noTikfinity=1`** veya **`?tikfinity=0`** ekleyin.
- **Olaylar:** `gift` (JSON `event` + `data`, TikTok benzeri alanlar), `like`, `follow`, `member` / `subscribe` / `join`, `share`. Hediyeler sunucu ile aynı sütun kurallarına göre yönlendirilir; diğer olaylar kullanıcı adına göre sütuna dağıtılır.
- Gelen mesajlar **kuyruk + requestAnimationFrame** ile kısılı işlenir; kopunca birkaç saniye aralıkla **sessizce** yeniden bağlanır.

Ayarlar panelinde TikFinity/TikTok bağlantı alanı **yoktur**; URL’yi konsoldan `localStorage.setItem('vote5_tikfinity_ws','ws://...')` ile değiştirebilirsiniz.

## TikTok bağlantısı (sunucu, isteğe bağlı)

Sunucu (`npm run dev` / `npm start`) hâlâ `tiktok-live-connector` ile `config/columns.json` içindeki **`tiktokUsername`** üzerinden canlıya bağlanabilir; arayüzden TikTok düğmesi kaldırılmıştır.

1. `config/columns.json` içinde `tiktokUsername` alanına yayıncı TikTok kullanıcı adını yazın (veya ortam değişkeni `TIKTOK_USERNAME`).
2. Her sütun için **`giftIds`** (sayısal TikTok hediye ID’leri) ve/veya **`giftKeywords`** kullanın. Yayına bağlanınca katalog yüklendiğinde anahtar kelimeler hediye **adında** aranır (küçük harf, alt dizgi); bulunan ID’ler `giftIds` ile birleştirilir. **İlk iki** eşleşen hediye sütun başlığındaki iki ikonu besler; listedeki tüm ID’ler o sütuna yönlendirilir.
3. Varsayılan takım eşlemesi `giftKeywords` ile verilmiştir (Galatasaray, Fenerbahçe, Beşiktaş, Trabzonspor, Amedspor). Hediye adları ülkeye ve güncellemeye göre değişebilir; eşleşmezse `set LOG_GIFTS=1` ile konsoldaki **giftId** ve isimleri görüp `giftIds` alanına elle yazın.

`demoRouteUnmatchedGifts: false` iken, hiçbir sütunda tanımlı olmayan hediye **yok sayılır** (yanlış takıma düşmez). Demo/test için `true` yapabilirsiniz; o zaman eşleşmeyen hediyeler hash ile rastgele bir sütuna gider.

## Arayüzden ayarlar

Sağ üst **Ayarlar** menüsünden test hediyeleri, **sütun başına 2 hediye ID’si** (TikFinity kataloğu veya sunucu kataloğu ile uyumlu) ve **“Hediyeleri gizle”** seçenekleri kullanılır. Özel görseller `localStorage` (`vote5_column_header_images`) ile ilgili değildir; sütun ikonları `assets/` ve yapılandırmadan gelir.

### Yayın öncesi hediye listesi (`config/gifts-seed.json`)

Yayına girmeden sütunlara hediye seçebilmek için proje kökünde **`config/gifts-seed.json`** dosyası vardır: her satır `id`, `name`, `diamondCount` (veya `diamond_count`) ve isteğe bağlı `image` (http URL) alanlarıyla `catalogFromGiftList` biçimine uygundur.

- **Sunucu** (`npm start` / `npm run dev`): Açılışta bu dosya okunur ve `/api/gifts` ile Socket.IO `game:visual` içindeki hediye listesi doldurulur. TikTok’a bağlanıp `getAvailableGifts` başarılı olunca katalog **TikTok listesiyle tamamen değiştirilir**.
- **`play/` / `file://`**: Derlemede aynı JSON arayüze gömülür; ayarlar panelinde API yoksa bile palet boş kalmaz.
- Ayarlarda **Hediye ID** + **Listeye ekle** ile tohumda olmayan ID’leri anında listeye ekleyebilirsiniz (oturum süresince; sayfa yenilenince yalnızca tohum + sunucu/TikTok listesi kalır).

### GemTok Gift Hub (merkezi hediye listesi)

İstemci **`gemtok-gift-client.js`** ile `http://127.0.0.1:8787` (veya `localStorage` anahtarı **`gemtok_gift_hub_url`**) adresindeki **gift-hub** sunucusundan hediye listesini çeker; katalog `sıra/gift-images/gift-list.json` ile senkron SQLite’tan gelir. Hub çalışıyorsa ayar paleti ve TikFinity tarafı bu görselleri / elmas değerlerini kullanır; sunucu veya TikTok’tan gelen satırlar aynı ID’de listeyi günceller (hub görselleri, canlı olaylar http görsel verirse onlar öncelikli olabilir). Hub kapalıysa davranış önceki gibi **tohum JSON** ve `/api/gifts` / Socket ile devam eder.

## Not

TikTok’un resmi API’si değil; `tiktok-live-connector` topluluk kütüphanesidir. TikTok tarafı değişikliklerinde bağlantı hata verebilir. Üretim için imzalı WebSocket sağlayıcıları gibi alternatifleri değerlendirin.
