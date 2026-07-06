# Oturumlu sayfaları de aynalamak (Stream Studio, Soundboard, Games)

Bu uygulama sayfaları **giriş (session cookie)** olmadan açıldığında sunucu sizi `/en/login/?next=...` adresine yönlendirir. HTTrack varsayılan olarak sizin tarayıcı oturumunuzu bilmez; bu yüzden aynada **yalnızca giriş ekranı** görünür. Tam arayüzü indirmek için:

## 1. Netscape `cookies.txt` dosyası oluşturun

1. Tarayıcıda canlı siteye **kendiniz** gidin ve normal şekilde giriş yapın (Stream Studio / Soundboard / Games dahil erişebildiğiniz hâle gelin). Bu belgede canlı adrese tıklanabilir link yok.
2. “Get cookies.txt LOCALLY” veya “cookies.txt” gibi bir eklentiyle **Netscape cookies.txt** formatında dışa aktarın (yalnızca `gemtok.live` için filtreleyebilirsiniz).
3. Dosyayı şu konuma kaydedin (proje klasörünüzdeki ayna kökü):

   `httrack_mirror/cookies.txt`

   (HTTrack bu dosyayı proje kökünde arar; yoksa boş başlar.)

## 2. Aynayı çerezlerle yeniden çalıştırın

PowerShell (örnek; yolları kendi kullanıcı adınıza göre düzeltin):

```powershell
cd "C:\Users\PC\Desktop\GemTok\httrack_mirror"
& "C:\Program Files\WinHTTrack\httrack.exe" -i -O "C:\Users\PC\Desktop\GemTok\httrack_mirror" -%L "C:\Users\PC\Desktop\GemTok\gemtok_seed_urls.txt" "+*.gemtok.live/*" "+help.gemtok.live/*" -r20 -E7200 -c8 -F "Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/120.0.0.0" -s2 -%P -n -b1
```

`-b1` çerez dosyasını kullanmayı açar (bazı kurulumlarda varsayılan zaten açıktır). Çerezlerin süresi dolunca işlemi tekrarlayın.

## 3. Güvenlik

`cookies.txt` **hesabınıza erişim** sağlar; paylaşmayın, Git’e eklemeyin. İş bitince silebilirsiniz.

## 4. Tarayıcıdan tek sayfa kaydı

Oturum gerektiren tek bir ekranı tam HTML olarak saklamak için (daha önce yaptığınız gibi) tarayıcıda **Sayfayı farklı kaydet** kullanmak da geçerlidir; örnek: `Automation — GemTok.html` (Stream Studio widget).
