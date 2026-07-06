# Arka plan görselleri

Oyun canvas’ında **sol yarım** ve **sağ yarım** için iki görsel kullanılır. Varsayılan dosyalar:

| Dosya | Konum |
|--------|--------|
| **sol.png** | Sol takım (Alpha) yarısı — kırpmadan `contain` ile yarım alana sığdırılır (canvas genişliği görsele göre ayarlanır) |
| **sag.png** | Sağ takım (Bravo) yarısı |

Her ikisini de **`public/assets/`** içine koyun:

- `public/assets/sol.png`
- `public/assets/sag.png`

## Ayarlar / `config.json`

- `bgLeftPath` ve `bgRightPath` alanları `/assets/...` biçiminde güvenli dosya adlarıyla (örn. `/assets/streamxt-bg-left.png`) yolu belirtir.
- Tarayıcıdaki **Ayarlar** panelinden veya **`POST /api/settings`** ile yüklenen özel görseller `streamxt-bg-left.*` ve `streamxt-bg-right.*` olarak kaydedilir; `resetBackgrounds: true` ile tekrar **`/assets/sol.png`** ve **`/assets/sag.png`** kullanılır.

PNG dışında JPEG, WebP veya AVIF kullanılabilir.

Sayfa **`http://localhost:3847`** ile açılmalı (`file://` ile görseller yüklenmez; ses MP3’leri de sunucu üzerinden gerekir).

**Ses efektleri:** `public/assets/sfx/` — ayrıntılar `sfx/README.md`.

**Kill müziği (skor):** Daha çok kill’i olan takımın parçası çalar; Alpha → `1.mp3`, Bravo → `2.mp3`. Lider değişince diğer parça duraklatılır ve kaldığı yerden devam eder; parça bitince başa sarar.

- `public/assets/1.mp3`
- `public/assets/2.mp3`
