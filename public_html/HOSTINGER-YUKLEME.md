# GemTok Hostinger Yükleme Kılavuzu

Bu klasör Hostinger için hazırlanmış web paketidir. İçeriği `public_html` klasörüne yüklenir.

## Yükleme

1. Hostinger Dosya Yöneticisi veya FTP ile `public_html` klasörünü açın.
2. `hostinger-yukle` klasörünün kendisini değil, içindeki tüm dosya ve klasörleri yükleyin.
3. Yükleme bittikten sonra ana adresi açın: `https://alanadiniz.com/`
4. Site otomatik olarak `sıra/ANA SAYFA.html` sayfasına yönlenir.

## Kontrol Edilecek Dosyalar

Şu adresler 404 vermemelidir:

- `/sıra/ANA SAYFA.html`
- `/sıra/OYUN MERKEZI.html`
- `/sıra/gemtok-license-registry.json`
- `/game/WarFront%20Arena/public/game.js`
- `/game/Arena%20Battle/dist/index.html`

## Lisans

Admin panelden oluşturduğunuz lisans kayıtlarını `sıra/gemtok-license-registry.json` dosyası olarak Hostinger'daki `sıra/` klasörüne yükleyin.

Kullanıcı akışı:

1. Oyun Merkezi'ni açın.
2. Lisans anahtarını girin.
3. `Anahtarı uygula` düğmesine basın.
4. Oyunu aynı sekmeden açın.

## TikFinity Bağlantısı

Hostinger paylaşımlı sunucusu TikFinity masaüstü uygulamasını çalıştırmaz. TikFinity bağlantısı yayıncının kendi bilgisayarında çalışır.

Yayıncı bilgisayarında:

1. TikFinity masaüstü uygulamasını açın.
2. `GemTok-TikFinity-Kopru.bat` dosyasını çalıştırın.
3. Hostinger sitesinde Oyun Merkezi'nden oyunu açın.
4. Chrome/Edge yerel ağ erişimi isterse izin verin.

Bağlantı sırası:

1. Tarayıcı `localStorage` içindeki URL
2. Ortam değişkeni veya siteye gömülen URL
3. Varsayılan adres: `ws://127.0.0.1:21213`

Otomatik bağlantıyı kapatmak için URL sonuna şunlardan biri eklenebilir:

- `?autoconnect=false`
- `?tikfinity=0`
- `?tikfinityAuto=0`
- `?notikfinity=1`

## Önbellek

Dosyaları güncellediğiniz halde eski sayfa görünüyorsa:

- Tarayıcıda `Ctrl+Shift+R` ile sert yenileme yapın.
- Hostinger önbelleği açıksa temizleyin.
- Oyun dosyalarında eski `game.js` veya `assets` dosyaları kalmadığını kontrol edin.

## Paket Yenileme

Yerel bilgisayarda güncel Hostinger paketini yeniden oluşturmak için proje kökünde:

```powershell
.\hostinger-hazirla.ps1
```

veya:

```bat
hostinger-hazirla.bat
```

Hazırlanan paketteki içerik tekrar `public_html` içine yüklenir.
