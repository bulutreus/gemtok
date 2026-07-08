# GemTok yerel arşiv

Bu klasörde iki tür içerik var. **Yerel menü sayfalarında canlı kaynak siteye (`gemtok.live`) tıklanabilir link yoktur** (yalnızca kendi diskinizdeki dosyalar ve HTTrack komut örnekleri).

## TikTok LIVE — oyunlar ve bağlantı türleri

**TikFinity (WebSocket):** WarFront, Arena Battle (Playroom/TikFinity akışı), **Country Birds**, **arena3**, **arena5gen** — masaüstü TikFinity’nin yerel adresine bağlanır; yaygın varsayılan **`ws://127.0.0.1:21213`**. WarFront’ta **ortak istemci** kökteki `gemtok-tikfinity-client.js` kullanılır; **adres sırası** (WarFront): `localStorage` (`streamxt_tikfinity_ws_url`, `gemtok_tikfinity_ws_url`) → `window.__TIKFINITY_WS_URL__` → `<meta name="tikfinity-ws-url" content="...">` → `GET /api/config` içindeki `tikfinityWsUrl` → **`ws://127.0.0.1:21213`**. Otomatik bağlantıyı kapatmak için **`?tikfinity=0`** (veya `tikfinityAuto=0`, `notikfinity=1`). **Country Birds** kendi `src/tikfinity/config.ts` sırasını kullanır (`DEFAULT_TIKFINITY_WS_URL`, `countrybirds.tikfinity.wsUrl`). **arena3** ve **arena5gen** sayfalarında WebSocket URL’si **`localStorage` anahtarı `arena_tikfinity_ws_url`** ile saklanır; iki oyun aynı anahtarı paylaştığı için adres birinde kaydedilince diğeri de aynı adresi okuyabilir (tek TikFinity akışı için uygundur).

**Merkezi TikTok Live köprüsü (ANA SAYFA):** `sira/index.html` üzerinde `gemtok-tikfinity-client.js` ve `gemtok-tiktok-live-global.js` yüklenir; `GemTokTikTokLive.bootstrap({ hubBase, showHud })` ile **tek öncü sekme** TikFinity WebSocket’ine bağlanır, diğer sekmeler **`BroadcastChannel`** üzerinden aynı yükü alır. Olaylar `window.GemTokTikTokLive.eventBus` üzerinden (`gift`, `like`, `follow`, `share`, `member`, `subscribe`, diğerleri `chat`) yayılır. Kök istemcide WebSocket adresi önceliği: **`localStorage.tikfinity_url`** → derleme / `window.__TIKFINITY_WS_URL__` / meta → **`ws://127.0.0.1:21213`**; otomatik bağlantı **`?autoconnect=false`** (ve mevcut `?tikfinity=0` vb.) ile kapatılabilir. Canlıda görülen bilinmeyen hediyeler Gift Hub’a **`POST /api/v1/live/discover-gift`** ile düşer; admin arayüzünde **Bağlantı**, **Hediye kataloğu** ve **Oyun eşlemeleri** sekmeleri (`gift-hub` derlemesi: `npm run build:admin` → `public/admin/`). WarFront, arena3, arena5gen, Arena Battle, Country Birds ve vote5 (TikFinity yan kanalı) **`gemtok-live-game-bridge.js`** ile merkezi `GemTokTikTokLive` olaylarına bağlanır; köprü yüklenmezse eski doğrudan WebSocket yolu kullanılır (`docs/EventBusMigrationReport.md`).

**TypeScript EventBus paketi (`@gemtok/live`):** Kök dizinde `src/services/EventBus.ts`, `TikTokConnectionManager.ts`, `GiftManager.ts`, `hooks/useEventBus.ts`, `types/tiktok.ts` ve örnek `examples/GameEventIntegration.tsx` bulunur. Derleme: kökte **`npm install`** + **`npm run build`** → `dist/gemtok-live.js` + `dist/index.d.ts`. Mimari: **`docs/EventBusArchitecture.md`**. Oyunların köprü ile taşınması: **`docs/EventBusMigrationReport.md`**. Portalda `GemTokTikTokLive` varken `TikTokConnectionManager.start({ portalBridge: "auto" })` ikinci WebSocket açmadan olayları TypeScript `EventBus`’a aktarır.

**Yayın Puanı (vote5):** Birincil canlı akış **`tiktok-live-connector`** ile sunucuya gider (`vote5/README.md`). TikFinity sütun modu için isteğe bağlı köprü: `game/vote5/play/index.html` içinde `gemtok-tiktok-live-global.js` + `gemtok-live-game-bridge.js` (tek WS politikası). Arayüz geliştirmede **5173**, API/Socket.IO için **5749** (veya `baslat.bat` ile seçilen boş port). Statik **`game/vote5/play/index.html`** için `game/vote5` içinde **`npm run build`** (`client/vite.config.js` içinde `base: './'`).

1. **Başlatıcı (isteğe bağlı):** `GemTok-TikTok-Oyunlari.bat` — **yerel oyun başlatıcı** (`node tools/gemtok-game-launcher.mjs`, `http://127.0.0.1:17070`) arka planda açılabilir. `sira/oyun-merkezi.html` içinde «Oyuna bağlan» **anında** derlenmiş `index.html` dosyasına gider; başlatıcı açıksa aynı tıklamada ilgili `baslat.bat` / `BASLAT.bat` arka planda tetiklenir (Vite **5173** / WarFront **3847** için). Yalnızca launcher: **`GemTok-Oyun-Launcher.bat`**. **Country Birds** doğrudan **`game/Country Birds/dist/index.html`** veya **`game/Country Birds/index.htm`** ile açılır (önce `npm run build`); oyun için **5173** gerekmez. **vote5** geliştirmede **5173** kullanır (`game\vote5\baslat.bat`); Arena Battle ile aynı anda yalnızca bir Vite dev sunucusu çalıştırın.
2. **WarFront Arena:** `game/WarFront Arena/BASLAT.bat` veya `node server.js` — TikFinity entegrasyonu `public/game.js` + `gemtok-tikfinity-client.js`. Ayarlar: `README.md` «TikFinity ve canlı etkileşim».
3. **Arena Battle:** **`game/Arena Battle/dist/index.html`** — derleme **tek IIFE** + `<script defer>`; **Chrome’da `file://`** genelde çalışır. Kaynak değişince `npm run build`. Geliştirme: `baslat.bat` (**5173**). `vite.config.ts` içinde `base: './'`.
4. **Country Birds:** `game/Country Birds/dist/index.html` (klasör kökünde **`index.htm`** → `dist/` yönlendirir) — Vite modül derlemesi; `file://` için **`npm run build`** (`base: './'`). Geliştirme: `npm run dev` (**5173**). TikFinity: `src/tikfinity/`.
5. **vote5:** `game/vote5/baslat.bat` veya `npm run dev`; statik arayüz **`game/vote5/play/index.html`** + ayrı Node sunucusu (README).
6. **arena3 / arena5gen:** `game/arena3/index.html`, `game/arena5gen/index.html` — tek dosya; TikFinity **`?tikfinity=0`** / **`?autows=0`** ile kapatılabilir.
7. **Oyun Merkezi:** `sira/oyun-merkezi.html` — tüm oyunlar yerel `../game/...` yollarına gider; lisans kapsamları `gemtok-license.js` ve Admin paneldeki oyun seçimleriyle eşlenir.

## TikTok Hediye Yönetimi (Gift Hub)

Merkezi **SQLite** veritabanı + **REST API** (`http://127.0.0.1:8787`) + **React** admin (`/admin/`). Hediye kataloğu tek kaynaktan (`sira/gift-images/gift-list.json`) senkronlanır; oyun başına hediye → aksiyon eşlemeleri veritabanında tutulur — oyun klasörlerinde hediye listesi **çoğaltılmaz**.

- **Başlatma:** `GemTok-Gift-Hub.bat` veya `gift-hub/baslat.bat` (ilk kurulumda `npm install` + `npm run build:admin`).
- **Tapujemy ile katalog güncelleme:** `uploads/gifts-0.md` dosyasını (sayfa metni / dışa aktarım) güncelleyin; kökte **`node tools/parse-tapujemy-gifts.mjs`** çalıştırın → `sira/gift-images/gift-list.json` ve **`gift-list.loader.js`** (dosyadan açılışta liste için) yenilenir. Ardından Gift Hub adminde **gift-list.json yeniden içe aktar** veya sunucuyu yeniden başlatın.
- **Küresel hediye + görseller (önerilen):** **`node tools/sync-global-gifts-tiktok.mjs`** — TikTok `webcast/gift/list` için bir dizi ülke kodundan istek atıp birleştirir (şu an API aynı 552 ID’yi döndürür); `uploads/gifts-0.md` ile birleşik **657** civarı benzersiz kayıt üretir, `gift-list.json` / `gift-list.loader.js` yazar ve CDN’den `.webp` indirir. Sadece JSON için: **`--no-download`**. Gift Hub’ı yeniden senkronlayın.
- **StreamToEarn bölge kataloğu + TikTok ID eşlemesi:** **`node tools/sync-gifts-from-streamtoearn.mjs`** — `streamtoearn.io/gifts` bölge sayfaları (`?region=XX`) ile kart ikonlarını resmi `webcast/gift/list` ile eşleştirir; `gift-list.json` kayıtlarına **`regions`** ekler. Yerel HTML önceliği: **`sira/hediyeler.html`** (`node tools/mirror-streamtoearn-gifts-page.mjs` ile güncellenir; çıktıya GemTok üst menü + parçacık arka planı eklenir, StreamToEarn üst çubuğu gizlenir), sonra `gift-hub/giftlist/…`, `uploads/TikTok-gifts-list-by-countries.html`. Yalnızca yerel: **`--s2e-offline`**; özel yol: **`--html "…"`**; görselleri atlamak: **`--no-download`**. Yalnızca TikTok API: **`sync-global-gifts-tiktok.mjs`**.
- **StreamToEarn hediye sayfasında ülkeye göre süzme (yerel HTML):** **`node tools/fetch-streamtoearn-gift-regions.mjs`** → **`sira/streamtoearn-gifts-assets/gift-regions.json`** (TikTok CDN yolundan hangi ülkelerde göründüğü). Sayfada **`gemtok-gift-region-filter.js`** ülke seçimini `?region=XX` ile uygular; fiyat filtresiyle birlikte çalışır.
- **Hediye ikonları (yalnızca mevcut JSON):** `game/vote5` içinde `npm install` yapılmış olmalı (`tiktok-live-connector`). **`node tools/download-gift-images-tiktok-cdn.mjs`** — `gift-list.json` satırları için ikon indirir; katalogda olmayan ID’lerde `5655.webp` şablonu kullanılır.
- **Sıra arayüzü:** `sira/hediye-yonetimi.html` (iframe + doğrudan link).
- **Oyun istemcisi:** kök `gemtok-gift-client.js` → `GemtokGiftHub.resolveGiftAction(gameId, tiktokPayload)`.
- **Ayrıntı:** `gift-hub/README.md`.

- **Sıra / portal:** `localStorage` içindeki **`gemtok_sira_portal`** (eski: `hottok_sira_portal`) ile giriş/abonelik geri dönüşü çalışır. `file://` ile giriş yaptığınız oturum `http://127.0.0.1` ile paylaşılmaz; oyun sayfaları köprü portlarında yerel giriş kontrolünü yapmaz — tıklamada sıra tarafında premium kontrolü sürer.

- **Kullanım sırası:** Kök `index.html` artık doğrudan `sira/index.html` sayfasını açar. Numara menüsü için `hub.html` kullanılabilir; oradaki ana bağlantılar **önce** `sira/*.html` (tarayıcıdan kaydettiğiniz sayfalar) adresine gider. Aynı satırda isteğe bağlı **HTTrack** yedeği linki de vardır (giriş/kayıt/profil demo için). `sıra` içindeki `_files` / `.indir` dosyaları tam çevrimdışı çalışmayabilir.

## 1. HTTrack aynası (`httrack_mirror/`)

[WinHTTrack](https://www.httrack.com/) ile `gemtok.live` alan adındaki **herkese açık** sayfalar indirilir. Giriş sonrası görünen sayfalar (ör. oturum açılmış `welcome`, `account` içeriği) sunucu tarafında yönlendirildiği için aynada çoğunlukla **giriş / kayıt** sayfası görünür; bu normaldir.

- **Ana menü (yerel):** `sira/index.html` — kökteki `index.html` bu sayfayı açar. HTTrack ana sayfası yedek olarak `httrack_mirror/www.gemtok.live/en/index.html` adresindedir.
- **Yerel kimlik doğrulama (demo, tarayıcıda):** `en/gemtok-local-auth.js` — hesaplar `localStorage` içinde tutulur; şifreler **SHA-256 özet** (düz metin değil). **Oturumu hatırla** işaretliyse oturum yaklaşık **30 gün**, değilse **oturum süresi** boyunca (`sessionStorage`). Bu yalnızca **çevrimdışı arşiv** içindir; cihazınızdaki veriler görülebilir — **sunucu güvenliği veya gerçek Google OAuth değildir.**
- **Member Login (yerel demo, 2 adım):** `en/login/index.html` — **Adım 1:** e-posta → **İleri — şifre**. **Adım 2:** şifre ve *Login Now*. Örnek hesap: **`admin`** / yerel demoda `en/gemtok-local-auth.js` içinde tanımlı şifre (parolayı arayüzde veya dokümantasyonda paylaşmayın). Yanlış şifre, kayıtsız e-posta veya yalnızca Google ile açılmış hesap için sayfada **Türkçe uyarı** gösterilir. `?cikis=1` ile oturum temizlenir.
- **Kayıt:** `en/register/index.html` — aynı modül; e-posta zaten kayıtlıysa veya şifreler eşleşmiyorsa **satır içi mesaj** (alert yok). *Register with Google* yine **modal ile e-posta** (canlı OAuth yok); kayıtlı e-postada uyarı verilir.
- **Hesap (yerel):** `sira/hesap.html` — oturum açıksa özet, lisans bilgisi ve Abonelik / Güvenlik sekmeleri. Ayrı **Profil** sayfası (`profil.html`) kaldırıldı; eski ayna yolları `account/profile` yerelde **Hesap** dosyasına yönlendirilir (`gemtok-sira-router.js`). **Çıkış:** `GemTokLocalAuth.performLogout` / yerel router ile oturum anahtarları temizlenir.
- **Welcome (yerel menü):** HTTrack’in indirdiği `welcome/index.html` yalnızca girişe yönlendiriyordu; yerine üç kartlı (Stream Studio / Soundboard / Classic Games) **statik bir yerel sayfa** yazıldı. `admin` ve yerel demoda tanımlı şifre ile girişten sonra bu sayfa açılır. HTTrack `welcome/`’u yeniden yazarsa bu dosyayı yedekleyip geri koymanız gerekir.
- `httrack_mirror/index.html` artık doğrudan ana menüye yönlendirir (klasörü veya bu dosyayı açsanız bile HTTrack dosya listesi çıkmaz). Eski HTTrack site listesi yedeği: `_httrack_site_listesi.html` (WinHTTrack yeniden tamamlayınca `index.html`’i tekrar üretebilir; o zaman bu yönlendirme dosyasını geri koymanız gerekebilir).
- Aynayı **güncellemek veya sürdürmek** için WinHTTrack’te “Continue interrupted download” kullanın veya aynı çıktı klasörüyle komut satırından devam edin (`httrack --continue`, proje klasöründe).
- `httrack_mirror/cookies.txt` ve `hts-cache/` oturum/ipucu içerebilir; klasörü paylaşmayacaksanız silin veya dışarı vermeyin.

- İlk çalıştırma komutu örneği (derinlik ve süre sınırlı):

```text
"C:\Program Files\WinHTTrack\httrack.exe" https://www.gemtok.live/en/ https://www.gemtok.live/welcome/ https://www.gemtok.live/account/ -O "C:\Users\PC\Desktop\GemTok\httrack_mirror" "+*.gemtok.live/*" -r6 -E1200 -c6 -F "Mozilla/5.0 ..." -s2
```

(`+v` kullanmayın; bazen filtre olarak yorumlanabilir.)

### Daha geniş kopya (Stream Studio, Soundboard, Games)

- Ek başlangıç adresleri `gemtok_seed_urls.txt` dosyasında (Stream Studio rotaları yerel otomasyon kayıtlarından türetilebilir).
- Genişletilmiş tarama için örnek (mevcut aynayı **sürdürür**, `hts-cache` korunur):

```powershell
cd "C:\Users\PC\Desktop\GemTok\httrack_mirror"
& "C:\Program Files\WinHTTrack\httrack.exe" -i -O "C:\Users\PC\Desktop\GemTok\httrack_mirror" -%L "C:\Users\PC\Desktop\GemTok\gemtok_seed_urls.txt" "+*.gemtok.live/*" "+help.gemtok.live/*" -r20 -E7200 -c8 -F "Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/120.0.0.0" -s2 -%P -n
```

- **Giriş gerektiren** uygulama içi sayfaların tam HTML/JS çıktısı için bkz. **`COOKIES-TR.md`** (tarayıcı `cookies.txt` export + aynı komutla tekrar tarama).

## 2. Tarayıcıdan kaydettiğiniz sayfalar (kök dizindeki yerel HTML kayıtları)

Bu dosyalar oturumunuzla birlikte kaydedilmiş anlık görüntülerdir. Script dosyalarındaki **`.indir` uzantısı** tarayıcıda çalışmayacağı için **`.js` olarak düzeltildi**; böylece mümkün olduğunca çevrimdışı çalışır.

Aynı HTML + `_files` klasörleri **`httrack_mirror/www.gemtok.live/_yerel_kayitlar/`** altına da kopyalanır (`account/index.html`, `profile/index.html`, …). Tek menü: **`httrack_mirror/yerel-sayfalar.html`** veya **`_yerel_kayitlar/index.html`**. HTTrack ana listesinin üstünde mor kutu ile yerel kayıtlara link verilir. Kayıtlı sayfalardaki **canlı site `href` adresleri `#` yapıldı** (tıklayınca canlıya gitmez); yine de sayfa içi scriptler ağ isteği atabilir.

## Birleşik oyun ayarları — UI mockup

Tüm oyunlarda aynı görsel dilde kullanılacak **resmi platform ayar paneli** tasarım referansı: **`docs/mockups/gemtok-unified-game-settings.html`** — dosyayı tarayıcıda açın (1920×1080 / 16:9 sunum için tam ekran önerilir). Yalnızca yerel referans; canlı siteye yönlendirme yoktur.

**Uygulama:** `sira/gemtok-settings-theme.css` — her oyun kendi ayar köküne `gemtok-settings-theme` sınıfı ekler (ek modal / FAB yok). Görsel referans: `docs/mockups/gemtok-unified-game-settings.html`.

## Yasal / kullanım notu

Sitenin tasarımı, metinleri ve markası telif ve kullanım koşullarına tabidir. Bu arşivi yalnızca **kişisel yedekleme veya inceleme** için kullanın; başka bir hizmet gibi yayınlamayın veya ticari olarak kopyalamayın.
