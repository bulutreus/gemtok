# GemTok profesyonel lisans sistemi

Canlı sistem `sıra/gemtok-license-api.php` üzerinden çalışır. Anahtarların kendisi sunucuda tutulmaz; HMAC-SHA256 özeti saklanır. Aktivasyonlar cihazla sınırlandırılır, kaba kuvvet denemeleri hız sınırlamasına tabidir ve oyun açılışında iptal/süre durumu yeniden doğrulanır.

## Hostinger ortam değişkenleri

Üç farklı, uzun ve rastgele değer tanımlayın:

```text
GEMTOK_LICENSE_ADMIN_SECRET=yonetici-panelinde-girilecek-en-az-32-karakter
GEMTOK_LICENSE_PEPPER=64-karakter-rastgele-gizli-deger
GEMTOK_LICENSE_TOKEN_SECRET=64-karakter-baska-rastgele-gizli-deger
```

Bu değerleri JavaScript veya HTML içine yazmayın. Hostinger ortam değişkeni sunmuyorsa `.gemtok-private/config.example.php` dosyasını `.gemtok-private/config.php` adıyla kopyalayıp üç değeri değiştirin. `config.php` dosyasını Git'e eklemeyin.

`public_html/.gemtok-private/` PHP tarafından ilk istekte oluşturulur ve `.htaccess` ile dış erişime kapatılır. Kurulumdan sonra şu adres yalnızca servis durumunu göstermelidir:

```text
https://alan-adiniz/sıra/gemtok-license-api.php
```

Yanıtta `version: 2`, `adminConfigured: true` görülmelidir. Eski `gemtok-license-registry.json` dosyasını canlı yayında tutmayın; yeni API onu okumaz ve ziyaretçilere anahtar listesi göndermez.

## Yayına alma

Kök `sıra/`, `game/` ve `gemtok-game-license-gate.js` dosyalarını Hostinger paketine kopyalayın. Yönetici panelinde sunucu parolası alanına `GEMTOK_LICENSE_ADMIN_SECRET` değerini girin. Yeni anahtar üretildiğinde yalnızca yeni anahtar o anda gösterilir; kaybedilen anahtar sunucudan geri okunamaz.

PHP 7.4 veya üzeri gerekir. HTTPS zorunlu tutulmalıdır.
