# Sütun içi üst görseller (isteğe bağlı)

`client/public/assets/` içine şu **taban isimlerle** dosya koyun (Vite → `/assets/…`):

| Sütun | Dosyalar |
|-------|-----------|
| 1 | `1`, `2` |
| 2 | `3`, `4` |
| 3 | `5`, `6` |
| 4 | `7`, `8` |
| 5 | `9`, `10` |

Uzantı sırası: **.png** → **.webp** → **.jpg**. Hiçbiri yoksa uygulama **`client/column-defaults/`** içindeki numaralı SVG’leri gösterir.

`npm run build` sonrası `public` dosyaları `play/assets/` altına kopyalanır.
