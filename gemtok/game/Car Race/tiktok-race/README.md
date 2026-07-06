# TikTok canlı yayın — bayrak yarışı

Ekran görüntüsündeki tarzda dikey (9:16) pist, **neon arcade** temasında **5 şerit** ve bayraklı araçlar. İzleyiciler **sohbette ülke anahtar kelimesi** yazarak veya **hediyeleri** `config.json` içinde şeride bağlayarak arabayı ilerletir. Gökyüzü, piksel dağlar, asfalt doku / ışık bandı **CSS ile** oluşturulur (harici görsel dosyası gerekmez; araçlar `assets/cars` içinden).

## Gereksinimler

- [Node.js](https://nodejs.org/) **20+** (`tiktok-live-connector` bunu ister)
- TikTok’ta **canlı yayın açık** bir kullanıcı adı (genelde kendi hesabın)

## Kurulum

```bash
cd tiktok-race
npm install
```

## Çalıştırma

**Windows:** `tiktok-race` klasöründe **`sunucuyu-baslat.bat`** dosyasına çift tıklayın (ilk seferde `npm install` çalışır). İsteğe bağlı TikTok adı: `sunucuyu-baslat.bat kullanici_adi`

1. `config.json` içinde `tiktokUsername` alanına TikTok **@kullanıcı_adı** (sadece ad, @ olmadan da olur) yazın **veya** komut satırından verin:

```bash
npm start -- sizin_kullanici_adiniz
```

2. Aynı klasördeki **`index.html`** dosyasını tarayıcıda açın (çift tıklama yeterli).  
   - WebSocket: sayfa adresiyle aynı host/port (`localhost` / `::1` ise `127.0.0.1` kullanılır; WarFront ile aynı kural). Varsayılan `config.json` → `wsPort` **21213**.
   - Sağ panelde **TikTok bağlantısı** → **Bağlan**: WarFront Arena ile aynı şekilde **`POST /api/tiktok/live`** (JSON `{ "username": "..." }` veya `{ "tiktokUsername": "..." }`). Eski yol **`POST /api/tiktok-username`** hâlâ çalışır. Sayfayı mümkünse **`npm start`** ile sunulan adresten açın (API ile aynı origin).

3. **OBS / TikTok Live Studio:** “Tarayıcı kaynağı” ile `index.html` dosyasının tam yolunu açın; genişlik/yükseklik **1080×1920** veya pencereyi dikey kullanın.

Varsayılan görünüm **neon arcade** stilindedir (piksel gökyüzü / dağlar, kırmızı-beyaz bariyer, neon şeritler, hız izi, `Press Start 2P` model yazıları). Kış manzarasına dönmek için `#stage` öğesinden `theme-arcade` sınıfını kaldırın.

## Araç görselleri (PNG / JPG / WebP / HEIC)

Kendi araç çizimlerinizi **`tiktok-race/assets/cars/`** klasörüne koyun. **`.heic` / `.heif`** (iPhone vb.) dosyaları, sunucu (`npm start` veya `npm run http`) açıkken **otomatik PNG’ye çevrilir**; tarayıcı listesinde `assets/cars/.heic-png-cache/<ad>.png` olarak görünür (önbellek klasörü `.gitignore`’dadır). Aynı ada sahip **zaten bir `.png`/`.jpg`/…** varsa HEIC yok sayılır (elle PNG önceliklidir). Sağ panelde her araç kutusunun altında, dosya adından üretilen **kısa isim** (pist plakasıyla aynı **Oswald** fontu) görünür; `index.html` içindeki `carLabelFromPath` eşlemesiyle bilinen dosya adları düzgün etiketlenir.

Oyun şu isimleri **sırayla** dener; biri bulunursa çizim yerine görsel kullanılır:

| Şerit | Dosya adları (önce ülke kodu, yoksa sıra numarası) |
|--------|------------------------------------------------------|
| 1 | `tr.png`, `tr.jpg`, `tr.webp`, sonra `1.png` … |
| 2 | `krd.png` … veya `2.png` … |
| 3 | `az.png` … veya `3.png` … |
| 4 | `sy.png` … veya `4.png` … |
| 5 | `af.png` … veya `5.png` … |

Ayrıntı: `assets/cars/README.txt`.

## Plakalar

Her şeritte plaka, araç görselinin **solunda** (sol alt, tampon hizası) **Türkiye AB tipi** görünümle çizilir: solda dar dikey **mavi** şerit üzerinde altta yan yana beyaz **TR**, sağda beyaz/gri gövde üzerinde siyah plaka metni (**Oswald** fontu, Google Fonts). Sağ paneldeki **Plakalar** alanından metinleri yazıp **Plakaları kaydet**e basın; tarayıcıda `localStorage` anahtarı **`tiktokRaceLanePlates`** (5 elemanlı JSON dizi) saklanır. **Plakaları gizle** ile pistteki plakalar kapatılır (yazılar kaybolmaz); tercih **`tiktokRaceHidePlates`** (`1` = gizli) ile saklanır. Boş veya geçersiz karakterler temizlenir; satır boş bırakılırsa varsayılan örnek plaka kullanılır (en fazla 14 karakter: `A–Z`, `0–9`, boşluk). Gerçek plaka formatına uygun örnek: `34 ABC 1234`.

## Hediyeyi şeride bağlama (`config.json`)

- **`giftNameToLane`:** Hediye adında geçen metin (küçük harf, `includes`). Örnek: `"match": "rose"` → 0. şerit (Türkiye).
- **`giftIdToLane`:** TikTok’un sayısal hediye ID’si → şerit. ID’leri öğrenmek için sunucuyu çalıştırıp konsolda gelen hediye loglarını veya `tiktok-live-connector` örneklerini kullanabilirsiniz.
- Sunucu önce **sohbette seçilen 1–5 şeridini** (aynı `uniqueId` ile) kullanır; yoksa eşleşen hediyede `resolvedLane` gönderir; ikisi de yoksa hediye istemciye düşmez (konsolda log).

## Sohbet kelimeleri

Oyunda varsayılan olarak şu tarz kelimeler ilgili şeridi **küçük** iter (büyük/küçük harf duyarsız, `İ`/`I` normalize):

| Şerit        | Örnek kelimeler                          |
|-------------|-------------------------------------------|
| Türkiye     | TURKIYE, TÜRKİYE, TURKEY                  |
| Kürdistan   | KURDISTAN, KÜRDİSTAN, KURD                |
| Azerbaycan  | AZERBAYCAN, AZERBAIJAN                    |
| Suriye      | SURIYE, SURİYE, SYRIA                     |
| Afganistan  | AFGHANISTAN, AFGANISTAN, AFGAN            |

Tam metin veya içinde geçen eşleşme kullanılır (dikkat: çok kısa kelimeler yanlış eşleşmeye yol açabilir; gerekirse `index.html` içindeki `CHAT_KEYWORDS` dizisini daraltın).

### Şerit numarası (1–5) + hediye jetonu

İzleyici önce sohbette **yalnızca** `1`, `2`, `3`, `4` veya `5` yazarak (üstten alta sırayla pistteki şeritleri seçer; tam genişlik rakamlar da kabul edilir) hangi arabayı destekleyeceğini belirler; ardından gönderdiği hediyeler o şeridi ilerletir. **Jeton (TikTok elması) değeri** kadar “adım” uygulanır: örneğin hediye başına **1** jeton ≈ 1 birim ilerleme, **30** jeton ≈ 30 kat (tekrarlı / kombo hediyelerde `repeatCount` ile çarpılır). Aynı şeridi seçmiş izleyici için **her 50 beğeni** (TikTok’un gönderdiği `likeCount` toplamı) **1 adım** (1 jetonluk ilerleme ile aynı ölçek) uygular; beğeniler şerit seçilmeden de birikir, şerit yazılınca veya sonraki beğenide dilimler işlenir. Sunucu `config.json` içindeki `giftIdToLane` / `giftNameToLane` ile de şerit çözebilir; sohbette numara seçildiyse **numara seçimi önceliklidir**. `config.json` içinde `enableExtendedGiftInfo: true` tutmak jeton değerinin gelmesine yardımcıdır.

## Demo (hediye olmadan)

`index.html` açıkken klavyede **1–5** tuşları şeritleri iter, **R** yeni tur başlatır.

## Yasal uyarı

`tiktok-live-connector` resmi TikTok API’si değildir; TikTok kurallarına ve bölgenizdeki yasalara uygun kullanın. Paket README’sinde üretim için Euler WebSocket API önerisi vardır.

## Eski proje dosyası

Üst klasördeki `Race game - Tiktok interactive widget.html` StreamDPS kaydıdır; bu yeni paket ondan bağımsızdır.
