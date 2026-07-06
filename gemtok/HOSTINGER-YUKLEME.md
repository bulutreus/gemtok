# Hostinger’a yükleme (GemTok yerel arşiv)

Kök `index.html` açılışta **`sıra/ANA SAYFA.html`** akışına yönlendirir; oyun kartları ve lisans için **`sıra/OYUN MERKEZI.html`** doğrudan açılabilir veya menüden gidilir.

**Referans kaynağı:** Güncel düzen için yerel arşivdeki **`httrack_mirror/`** (varsa) ve **`sıra/`** HTML dosyalarını kullanın. Yerel `sıra/` dosyalarınızı (ör. strip veya elle düzenleme sonrası) **birebir geri yüklemek** istiyorsanız, ayna çekip ardından bu projedeki **yerel yollar** (`./gemtok-license.js`, `./gemtok-sira-router.js`, `../logo.png`, `OYUN MERKEZI.html` vb.) ve Türkçe/özel metinleri elle veya betikle birleştirmeniz gerekir. Pakette varsayılan akış **`sıra/ANA SAYFA.html`** olmalıdır.

**Lisans:** Anahtar listesi tarayıcıda `localStorage` içindedir; gizli sekme ana profilden ayrıdır. Anahtarları **`sıra/Admin Panel.html`** üzerinden üretip aynı sekmede Oyun Merkezi’nde kullanın.

**Web sitesi (Hostinger) lisans adımı:** Admin panelde anahtar ürettikten sonra **«Sunucu kaydı indir (.json)»** ile `gemtok-license-registry.json` dosyasını alın ve Hostinger’da **`sıra/`** klasörüne yükleyin. Lisanslı kullanıcılar Oyun Merkezi’nde anahtarı girip oyun açabilir ve TikFinity ile bağlanabilir. Yerelde üretilmiş anahtarlar için önce o kayıttan export edip siteye yükleyin.

Üst menü görseli: kök **`logo.png`**; `sıra/` içi **`../logo.png?v=…`**. Sekme ikonu (tarayıcı): **`gemtok/gemtok.png`** — `sıra/` `<link rel="icon" href="../gemtok/gemtok.png">`, kök `index.html` / `hub.html` `./gemtok/gemtok.png`. Eski HTTrack favicon satırını sekme ikonuna çevirmek için: `node tools/patch-gemtok-logo-favicon.mjs`.

## 1) Yükleme paketini oluşturun (önerilen: tam paket)

**En kolay:** `hostinger-hazirla.bat` dosyasına çift tıklayın — önce oyun derlemelerini (`Arena Battle`, `Country Birds`, `vote5/play`) alır, ardından **`hostinger-yukle`** paketini üretir.

Eski yol (yalnızca paketleme, derleme yok): `hostinger-paketle.bat`

Veya PowerShell’de proje kökünden:

```powershell
cd "C:\Users\PC\Desktop\GemTok"
.\hostinger-hazirla.ps1
```

- **`httrack_mirror`** varsa otomatik eklenir; yoksa `sıra/*_files/` yerel varlıkları kullanılır.
- Pakete kök **`gemtok/`** (manifest + ikon), paylaşılan **`gemtok-*.js`** betikleri ve tüm **`game/`** statik dosyaları dahildir (**`node_modules`**, **`.env`**, **`.vite`** hariç).

Yalnızca paket (derleme atlanır):

```powershell
.\hostinger-paketle.ps1 -WithGames
```

Çıktı: **`hostinger-yukle`** (veya klasör kilitliyse **`hostinger-yukle-YYYYMMDDHHmmss`**). İçeriği `public_html`’e atın.

## 2) Hostinger’da nereye yüklenir?

**`hostinger-yukle` içindeki her şeyi** (üst klasörü değil, **içeriğini**) **Dosya yöneticisi** veya FTP ile **`public_html`** köküne yükleyin.

Kökte şunlar görünmeli:

- `index.html`, `hub.html`, `.htaccess`, `robots.txt`, `HOSTINGER-YUKLEME.md`
- `sıra/`
- `httrack_mirror/` (tam pakette veya `-WithMirror` ile)
- `game/` ( `-WithGames` ile WarFront Arena, Arena Battle vb.; **`Car Race` klasörü robocopy ile hariç tutulur**)

Site açılışı: `https://alanadiniz.com/` → `index.html` → **`sıra/ANA SAYFA.html`** akışı.

## 3) FTP / zip / Türkçe klasör adı

- **`sıra`** adında Türkçe **ı** vardır; istemci **UTF-8** kullanmalı.
- Zip yüklüyorsanız **Extract** sonrası içerik doğrudan `public_html` altında olmalı (fazladan tek klasör sarmalaması kalmasın).

## 4) `.htaccess` ve `robots.txt`

Paketle birlikte gelen **`.htaccess`** şunları yapar (Apache / Hostinger LiteSpeed uyumludur; modül yoksa ilgili blok atlanır):

- **Güvenlik başlıkları:** `X-Content-Type-Options`, `X-Frame-Options` (SAMEORIGIN), `Referrer-Policy`, `Permissions-Policy`, HTTPS iken kısa **HSTS**.
- **Performans:** `mod_deflate` ile metin/CSS/JS sıkıştırma; `mod_expires` + `Cache-Control` ile HTML kısa, görseller/fontlar daha uzun önbellek.
- **Dizin listesi kapalı:** `Options -Indexes`.
- **`/game/` ve bilinen kopyalayıcı UA:** Varsayılan User-Agent’i HTTrack, wget, curl, Scrapy vb. olan isteklere `game/` altında **403** (tarayıcıdan normal oynayan kullanıcı etkilenmez). **Sınır:** UA kolayca taklitlenir; `file://` ile yerel açılan ayna veya “tarayıcı gibi” indiren araçlar bu engeli aşabilir. Tam koruma için oyun varlıklarına sunucu tarafı **oturum / imzalı URL** gerekir.

**`robots.txt`:** `/game/` için `Disallow` ve HTTrack/wget için ek kurallar (uyan botlar için). Robots yok sayılırsa yine `.htaccess` devreye girer.

LiteSpeed’de 500 veya beklenmeyen davranış olursa panelden `.htaccess` / `mod_rewrite` / `mod_headers` izinlerini kontrol edin; sorunlu satırı geçici olarak yorum satırı yapın.

## 5) Oyunlar (WarFront, Arena Battle, Country Birds, vote5, arena3, arena5gen)

Router kartları **`../game/...`** statik adreslere gider; **Vite `dist`** oyunlarında (`Arena Battle`, **Country Birds**, **vote5/client**) `base: './'` ile göreli `assets/` yolları kullanılır. Sayfalar Hostinger’da **http(s)** ile açılabilir. TikTok **canlı köprü** (TikFinity / Node WebSocket / `tiktok-live-connector`) paylaşımlı hostingde çalışmaz; köprü yayıncının **kendi bilgisayarında** çalışır — sitede oyun **arayüzü** ve sıra sayfaları sunulur. **arena3** ve **arena5gen** tek HTML dosyalarıdır.

### Websitede Arena Battle’ı çalıştırma

1. Yükleme paketinde **`game/`** olsun: `.\hostinger-paketle.ps1 -WithMirror -WithGames` (veya en az `-WithGames`).
2. `public_html` yapısı: `sıra/`, `game/Arena Battle/dist/` (içinde `index.html` ve `assets/`), kökteki `sıra/gemtok-license.js` yolunu `dist` içindeki HTML **../../../sıra/** ile bulur — **`sıra` klasörünü** atmayın.
3. Ziyaretçi önce sitede **Oyun Merkezi**’nde lisans anahtarını uygulasın; sonra Arena’ya girsin (aynı site kökeninde `localStorage` / oturum).
4. Sunucu **Linux** ise klasör adı **`Arena Battle`** ile birebir aynı olmalı (büyük/küçük harf duyarlı).
5. Boş sayfa veya 404: F12 → **Ağ**; `dist/assets/arena-bundle.js` veya `style.css` yüklenmiyorsa `dist` eksik veya yol yanlıştır — yerelde `game\Arena Battle` içinde **`npm run build`** ile `dist` üretin, paketi yeniden yükleyin.

- **TikTok Gifts (StreamToEarn aynası):** **`sıra/StreamToEarn-Gifts.html`** + **`sıra/streamtoearn-gifts-assets/`** — güncellemek için kökte **`node tools/mirror-streamtoearn-gifts-page.mjs`**. Hediye **veri** listesi: **`sıra/gift-images/gift-list.json`** ve görseller **`sıra/gift-images/`**; **`sıra/`** yüklemeyi unutmayın.

- **Arena Battle:** **`game/Arena Battle/dist/index.html`** — üretim derlemesi **tek IIFE paketi** + `<script defer>` kullanır; **Chrome’da `file://` ile de** (çift tıklama) modül engeline takılmadan açılabilir. `dist/` için **`game/Arena Battle` içinde `npm run build`**. İsteğe bağlı: **`http-ile-ac.bat`** (`npm run preview`, port 4173), **`baslat.bat`** (Vite 5173). **`file://` ile beyaz sayfa (eski derlemeler):** `crossorigin` + stil sırası; güncel `vite.config.ts` ile `npm run build` yenileyin. TikTok köprüsü yine yayıncı bilgisayarında.

## 6) Hızlı kontrol

1. Ana sayfa açılıyor mu?
2. `sıra/ANA SAYFA.html` ve menüler yükleniyor mu?
3. F12 → **Ağ**: çok sayıda 404 var mı? (genelde eksik `httrack_mirror` veya yanlış yükleme yolu.)

## Paketi yeniden üretmek

Betik çalışınca hedef klasör sıfırlanıp yeniden doldurulur (kilit varsa yeni zaman damgalı klasör kullanılır).

---

**Küçük paket** (yalnız `index.html` + `sıra` + `.htaccess` + kılavuz, ayna/oyun yok):  
`powershell -File .\hostinger-paketle.ps1` *(bayrak yok)*
