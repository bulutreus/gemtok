# GemTok Gift Hub — merkezi TikTok hediye servisi

Yerel **SQLite** veritabanı + **REST API** + **React** admin paneli. Tüm oyunlar hediye listesini buradan çeker; hediye → oyun aksiyonu eşlemeleri veritabanında tutulur.

## Başlatma

- **Kök:** `GemTok-Gift-Hub.bat` veya `gift-hub/baslat.bat`
- İlk sefer: `npm install` + `npm run build:admin` (bat otomatik dener)
- Tarayıcı: `http://127.0.0.1:8787/admin/`
- API: `http://127.0.0.1:8787/api/v1/...`

## Ortam değişkenleri

| Değişken | Varsayılan | Açıklama |
|----------|------------|----------|
| `GEMTOK_GIFT_HUB_PORT` | `8787` | HTTP port |
| `GEMTOK_GIFT_HUB_ADMIN_SECRET` | `gemtok-gift-local-change-me` | Yazma işlemleri için `X-Gemtok-Gift-Admin` başlığı |

## Veri kaynağı

- **Hediyeler:** `sıra/gift-images/gift-list.json` — sunucu açılışında ve admin panelden «yeniden içe aktar» ile DB’ye senkronlanır. Dosyaya yeni satır eklendiğinde bir sonraki senkronla **tüm oyunlar** aynı kaydı görür (ayrı kopya yok).
- **Görseller:** `GET /gift-images/<dosya>` ile `sıra/gift-images/` üzerinden sunulur.

## Oyun entegrasyonu

Kökte **`gemtok-gift-client.js`** yükleyin:

```html
<script src="../gemtok-gift-client.js"></script>
```

```js
// TikFinity / canlı hediye olayından aksiyon çözümü
const { actionKey, giftId, giftMeta } = await GemtokGiftHub.resolveGiftAction("vote5", payload);
```

İsteğe bağlı: `localStorage.gemtok_gift_hub_url` veya `window.__GEMTOK_GIFT_HUB_URL__` ile hub adresi.

## API özeti

- `GET /api/v1/meta` — sürüm, desteklenen olay türleri
- `GET /api/v1/games` — oyun listesi
- `GET /api/v1/games/:gameId/actions` — aksiyon şeması
- `GET /api/v1/gifts` — sayfalı katalog (`search`, `limit`, `offset`, `unmappedForGame`)
- `GET /api/v1/gifts/:tiktokId` — tek hediye
- `GET /api/v1/games/:gameId/mappings-only` — küçük eşleme listesi (istemci önbelleği)
- `PUT /api/v1/games/:gameId/mappings/:giftTiktokId` — admin
- `DELETE ...` — eşlemeyi kaldır
- `POST /api/v1/gifts` — yeni hediye (admin)
- `POST /api/v1/sync/gift-list-json` — JSON’dan toplu senkron (admin)

## React bileşenleri

`gift-hub/admin/src/components/` altında **ThemeShell**, **GiftImageThumb**, **ActionSelect**, **GiftMappingTable** — admin projesinde kullanılır; başka Vite/React oyunları `npm pack` veya dosya kopyası ile yeniden kullanabilir.
