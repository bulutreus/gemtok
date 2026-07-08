# Otomatik TikTok hediye senkronizasyonu (GemTok)

Bu belge, canlı yayında gelen hediye olaylarının merkezi SQLite kataloğuna yazılması, sürümlenmesi ve oyunların / admin panelinin güncel veriyi kullanması akışını özetler.

## Bileşenler

| Katman | Görev |
|--------|--------|
| **TikFinity / köprü** | `gemtok-tikfinity-client.js` ve `sira/gemtok-tiktok-live-global.js` hediye payload’ına `giftKey` (TikTok hediye kodu), görünen ad, elmas, ikon URL’si ekler. |
| **Keşif** | Köprü, `POST /api/v1/live/discover-gift` (gift-hub) ile hediyeyi upsert eder. Admin gerekmez; localhost hız sınırı vardır. |
| **Veritabanı** | `gift-hub/lib/db.mjs` — `gifts` tablosu: `tiktok_id`, `name`, `diamond_count`, `image_file` / metadata, `first_seen`, `last_seen`, `category`, `active`. |
| **Sürüm** | Her başarılı keşif veya admin senkronundan sonra `giftsCatalogVersion` artar (`GET /api/v1/gifts/catalog-version`, liste yanıtlarında da döner). |
| **Tarayıcı olayları** | Keşif sonrası: `CustomEvent("gemtok-gifts-updated")`, `BroadcastChannel("gemtok-gifts-v1")`, `eventBus.emit("giftmanager:discovered", …)`. |
| **GiftManager (TS)** | `eventBus` üzerinde `gift` dinler → keşif POST → önbelleği temizler; `gemtok-gifts-updated` ve BroadcastChannel ile diğer sekmelerde de senkron kalır. |
| **Vanilla oyunlar** | `gemtok-gift-client.js` (`GemtokGiftHub`): `getAllGifts`, `subscribeGiftCatalog`, `invalidateGiftHubCaches`. |

## Oyun entegrasyonu kuralı

- Hediye listesini dosyada sabitlemeyin; **`GiftManager.getAllGifts()`** (paket) veya **`GemtokGiftHub.getAllGifts()`** (vanilla) kullanın.
- TikTok yeni hediye eklediğinde ilk gönderimde kayıt oluşur; kod değişikliği gerekmez.

## Admin paneli

`gift-hub` içindeki admin arayüzü kataloğu sıralar, filtreler ve `giftsCatalogVersion` ile periyodik yeniler; yeni hediyeler manuel ekleme olmadan listede görünür.

## Yerel çalıştırma

1. `gift-hub` sunucusunu başlatın (`node server.js` veya `npm start`).
2. Ana sayfa TikTok Live köprüsünün gift-hub’a erişebildiğinden emin olun (`GEMTOK_GIFT_HUB_URL` / varsayılan `http://127.0.0.1:8787`).

## Arena 5 Gen (`game/arena5gen/index.html`)

- Oyun **`gemtok-gift-client.js`** yükler; Gift Hub oyun kimliği **`arena5gen`** (`GEMTOK_HUB_GAME_ID`) ile `GET /api/v1/games/arena5gen/mappings-only` eşlemesini çeker.
- Admin’de her TikTok hediye kodu için **action_key** olarak takım id’lerinden biri seçilir: `fb`, `amed`, `bjk`, `gs`, `ts`, `p6` … `p10`, veya tüm eşlenmeyenler için **`default`** (her hediyede o anki **ilk aktif** oyuncu).
- Hub erişilemez veya eşleme yoksa mevcut **sabit id / isim** (`teamIdFromGiftDataLegacy`) yedek olarak kullanılır.
- Katalog veya eşleme güncellenince `subscribeGiftCatalog` haritayı yeniden yükler.
- **Ayarlar** panelindeki **Hediye → oyuncu** bölümü: Gift Hub `getAllGifts` listesini (görsel + isim) gösterir; seçimler `localStorage` anahtarı `arena5gen_gift_assign_map_v1` ile saklanır ve **sunucu eşlemesinden önce** uygulanır (`teamIdFromGiftData`).
