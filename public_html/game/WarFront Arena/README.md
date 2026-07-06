# WarFront Arena — TikFinity / Canlı Savaş Oyunu

İki takımın izleyicilerinin hediye, beğeni ve takip ile MOBA tarzı haritada savaştığı dikey (TikTok’a uygun) tarayıcı oyunu. **Aynı kullanıcıya gelen her hediye / beğeni / takip**, o birimde **profil (avatar) boyunu**, **can** ve **otomatik mermi gücünü** kademeli artırır (üst sınır `public/game.js` içinde `PROFILE_R_MAX`, `GIFT_PROFILE_DELTA`). **Gerçek hediye** (yalnızca beğeni veya takip değil) atan oyuncu, oturum boyunca **iki kat taban can** ile doğar; ilk gerçek hediyede mevcut can havuzu da iki katına çıkar (`HP_MAX_CAP` ile sınırlı). **Karşı takımdan gerçek oyuncu** öldüren birim de (`kill_reward`) profilde büyür. Birimler otomatik ateş eder; yetenekler (fırtına, şimşek, vb.) yoğun ama **oyuncu–oyuncu TTK** `PLAYER_INCOMING_DMG_SCALE` ve taban can ile dengelenir. **Takım morali** (üst HUD çubukları) kill ve serilere göre değişir; **havadan kasalar** can ve **kalkan** verir; **MVP** etiketi anlık en yüksek hasar veren oyuncuyu gösterir. Hediye adı eşlemesi `public/game.js` içindeki `GIFT_MAP` ile yapılandırılmıştır. **Ses:** `public/assets/sfx/` altında **Mixkit** kaynaklı gerçek MP3 örnekleri kullanılır (ok/şimşek/lazer/silah vb.); dosyalar yüklenemezse otomatik olarak Web Audio **sentez** yedeğine düşer. Ayrıntı ve lisans için `public/assets/sfx/README.md`. Chrome’da `AudioContext` yalnızca **ilk tıklama / dokunuş / tuş** ile oluşturulur; canlı olaydan önce en az bir kez sayfaya tıklayın, canvas üzerindeki **“Sesi aç (buraya tıkla)”** düğmesine basın veya **F2** ile açın (kısa test sesi duyulmalı). **F1** yalnızca oyun **efekt sesini** kapatır, **F2** tekrar açar; **kill şarkısı** (`1.mp3` / `2.mp3`, kill skoruna göre) **otomatik çalmaz** — **F3** ile açılır veya kapatılır (efektlerden bağımsız). Bu kısayollar **giriş kutusu odaktayken** çalışmaz (TikFinity WebSocket adresi alanındayken yanlışlıkla tetiklenmesin diye).

**Oyun hızı ve kalabalık:** `public/game.js` içinde `GAME_PACE` (simülasyon yavaşlığı), `CROWD_UNITS_PER_TEAM` (takım başına yalnızca **seyirci** birimi — otomatik ateş etmez), `PROJ_PACE` (mermi hızı) ile ayarlanır. **Kapışma dengesi:** gerçek oyuncu taban canı `PLAYER_BASE_HP`, can tavanı `HP_MAX_CAP`, gerçek oyuncuya gelen hasar çarpanı `PLAYER_INCOMING_DMG_SCALE`, **1◇ ağır mermi** düşük tek vuruş hasarı ve **kill sonrası can devri** (`KILL_HP_TRANSFER_RATIO`, `transferVictimHpToKiller`) aynı dosyada birlikte ayarlanır.

## Kurulum

```bash
cd /path/to/WarFront-Arena
npm install
npm start
```

Tarayıcıda: **http://127.0.0.1:3847** veya **http://localhost:3847** (IPv6/çözümleme sorunlarında `127.0.0.1` daha güvenilir)

### Windows: tek tık

Proje klasöründeki **`BASLAT.bat`** dosyasına çift tıklayın: kısa süreli bir pencere kapanabilir; asıl işlem **`WarFront Arena`** başlıklı **yeni** komut penceresinde çalışır (kapanmaz; bittiğinde `pause` ve `cmd /k` ile hata satırlarını görebilirsiniz). Bağımlılıklar yoksa `npm install` çalışır, sunucu **`WarFront Arena — Sunucu`** penceresinde açılır, **`_wait-node-port.mjs`** portu bekler, tarayıcı **http://127.0.0.1:3847** açılır. **`_wait-node-port.mjs` dosyasını silmeyin.**

## TikFinity ve canlı etkileşim

TikTok’un resmi API’si her yayıncıya açık değildir; bu projede **TikTok WebCast sunucu köprüsü yoktur**. Oyun, **TikFinity masaüstü uygulamasının** aynı bilgisayarda sunduğu yerel WebSocket’e tarayıcıdan bağlanır (varsayılan **`ws://127.0.0.1:21213`**).

1. **TikFinity**’yi açın ve yayına bağlayın.
2. Oyunu **`http://127.0.0.1:3847`** üzerinden açın. Tarayıcı **`public/gemtok-tikfinity-client.js`** dosyasını yükler (kök depodaki `gemtok-tikfinity-client.js` ile aynı içerik; kök dosyayı değiştirdiyseniz bu kopyayı da güncelleyin). **Ayarlar** → **TikFinity WebSocket** alanında adresi doğrulayıp **Bağlan** deyin. Adres sırası: tarayıcı **`localStorage`** (`streamxt_tikfinity_ws_url`, `gemtok_tikfinity_ws_url`) → `window.__TIKFINITY_WS_URL__` → `<meta name="tikfinity-ws-url">` → sunucu **`GET /api/config`** içindeki `tikfinityWsUrl` (ortam **`TIKFINITY_WS_URL`** veya `config.json`) → yoksa **`ws://127.0.0.1:21213`**.
3. Otomatik bağlanmayı istemiyorsanız sayfaya **`?tikfinity=0`**, **`?tikfinityAuto=0`** veya **`?notikfinity=1`** ekleyin.
4. Gelen JSON olayları (`gift`, `like`, `follow`, `member`, `subscribe`, `social` içinde `follow`/`share`, sohbette **`1`** / **`2`** ile takım seçimi) **kuyruk + `requestAnimationFrame`** ile işlenir; bağlantı koptuğunda birkaç saniye aralıkla **sessizce** yeniden denenir.

**Yayında katılım (1 / 2):** TikFinity **bağlıyken** (`tikfinity_connected`) harita açılır; sohbette **`1`** (sol) veya **`2`** (sağ) yazanlar takıma girer. **Hediye / beğeni / takip / paylaşım** yalnızca bu listedeki kullanıcılara uygulanır. **`T`** testi canlıdayken kapalıdır.

### Harici WebSocket (WarFront Arena sunucusu `3847`)

Oyuncu sayfası `ws://SUNUCU_IP:3847` adresine bağlanır. Sunucuya şu JSON’u gönderen her istemci, tüm açık oyun sekmelerine olayı yayınlar:

```json
{
  "channel": "tiktok",
  "payload": {
    "type": "gift",
    "userId": "tiktok_unique_id",
    "nickname": "Rumuz",
    "giftId": "rose",
    "diamondCount": 1,
    "giftCombo": 12,
    "team": "auto",
    "avatarUrl": "https://example.com/avatar.jpg"
  }
}
```

- `type`: `"gift"` | `"like"` | `"follow"` (veya `subscribe`)
- `giftId`: aşağıdaki anahtarlardan biri (küçük harf, alt çizgi).
- `diamondCount` (isteğe bağlı): hediye **elmas / jeton** değeri. İsim `GIFT_MAP`’te yoksa oyun, legendadaki referans jetonlara **en yakın** hediyenin yeteneğini ve profil büyümesini kullanır.
- `giftCombo` (isteğe bağlı): **repeat / combo / group** değerlerinden **en büyüğü** (üst sınır 120, varsayılan 1). Oyun aynı yeteneği bu kadar kez gecikmeli tekrarlar (`abilityComboCap` ile yetenek başına tavan — `public/game.js`). Webhook’ta `giftCombo` veya `repeatCount` / `comboCount` / `groupCount` kullanılabilir.
- Beğeni yükünde `likeCount` iletilir; oyun **yalnızca bir ok salısı** üretir (spam yok). **Profil (avatar) büyümesi** `likeCount` ile karekök ölçeklenir (`GIFT_PROFILE_DELTA.like` + `growUnitFromGift` içinde `scale`).

### 2) HTTP webhook

```bash
curl -X POST http://localhost:3847/api/event ^
  -H "Content-Type: application/json" ^
  -d "{\"type\":\"gift\",\"userId\":\"u1\",\"nickname\":\"Ali\",\"giftId\":\"unknown_gift\",\"diamondCount\":400,\"team\":\"alpha\"}"
```

## Hediye → yetenek tablosu

| `giftId` (TikTok adı normalize) | Yetenek |
|----------|---------|
| `rose`, `roses`, `tiny_rose` | MISSILE |
| `bling_rose`, `galaxy_rose`, `gold_rose`, `super_rose`, `blooming_rose`, `detailed_rose_bloom`, … | BULLET STORM |
| `tiktok`, `finger`, `finger_heart`, `good_finger` | LEISURE |
| `dumbbell`, `money` | BULLET STORM |
| `gift_box`, `mystery_box` | THUNDER BRIDGE |
| `donut`, `doughnut`, `swirl` | Tornado |
| `lotus`, `fire_heart`, `burning_heart` | FIRE LOTUS — **rakip yarıda** belirir; tüm rakipler **yakma** hasarı + çekim; merkezde son darbe |
| `crown`, `heart_wings`, `ghost`, `cloud` | MURAD |
| `dragon` | **Ejderha** — rakip yarısında uçar, altından alev; üstünden geçtiği rakipleri **yakar** (sürekli hasar) |
| `treasure_chest`, `boxing_glove`, `punch`, `fist`, `empire_treasure` | All combo |
| Beğeni (`type: like`) | MISSILE |
| Takip (`type: follow`) | HOOK |
| Tanınmayan isim + `diamondCount` yok | MISSILE; profil büyümesi `rose` seviyesinde |
| Tanınmayan isim + `diamondCount` > 0 | Legendadaki **en yakın jeton** referansına göre yetenek (bkz. `LEGEND_DIAMOND_BY_ID` / `public/game.js`) |

Oyuncu önce **`diamondCount` jeton paketi** (aşağıdaki sabit bantlar — `resolveJetonDiamondPackAbility` / `public/game.js`); paket yoksa `giftId` ve `giftKey` ile `GIFT_MAP`; hâlâ yoksa `diamondCount` ile legendadaki en yakın jeton referansı.

### Jeton paketi (elmas bantları, isimden önce uygulanır)

| `diamondCount` (yuvarlanmış) | Etki |
|-----------------------------|------|
| 1 | Tek **ağır mermi** (`heavy_ball`): rakibe kilitlenir, daha yüksek hasar/hız |
| 2–15 | 5 büyük mermi (kilitlenir), güçlü hasar |
| 16–25 | Karşı takımdan 10 oyuncuya **geniş alanlı** şimşek (mor menzil) |
| 26–36 | **MEGA girdap** (daha büyük, daha güçlü çekim ve iç hasar) |
| 85–120 | **LOTUS SALVO** — **rakip yarıda** ateş lotusu; **yakma DPS** + çekim + jeton halkası (mor kesik halka süsü) |
| 140–210 | Ejder imhası: tüm rakip oyuncular (crowd hariç) elenir (güçlü görsel) |
| 380–580 | **500◇ para tabancası** bandı: rakip **tüm harita** (oyuncu + seyirci + rakip mermi ve alanlar) temizlenir; güçlü patlama görseli ve moral artışı |

Büyük jeton bölgeleri ve şimşekler için ayrı **görsel** katmanlar vardır (`visualJeton`). Mermi çarpışmalarında takım `unitTeamId` ile 0/1’e çekilir; böylece köprüden `team` string gelse bile **dost birimlere** isabet engellenir (sahibiyle çakışma da atlanır). Bant sınırları `public/game.js` → `resolveJetonDiamondPackAbility` içindedir.

Takım: `team` alanı `alpha` (sol), `bravo` (sağ) veya `auto` / boş — **sohbette son seçilen 1 veya 2 takımı korur**; yalnızca açık `alpha`/`bravo` gönderilirse güncellenir. İlk etkileşimde (ör. yerel test) kayıt yoksa kullanıcı ID’sine göre sabit bir yarı seçilir.

## Sorun giderme

- **“Bu siteye ulaşılamıyor” / bağlanamıyor** — Önce **WarFront Arena — Sunucu** başlıklı pencerede `WarFront Arena (` ile başlayan satır görünüyor mu bakın; yoksa `npm install` veya `node` hatası vardır (kırmızı metin). Port **3847** başka programdaysa konsolda `EADDRINUSE` yazar; diğer süreci kapatın veya `set PORT=3850` ile farklı portta `npm start` çalıştırıp tarayıcıda aynı portu kullanın. Tarayıcı çok erken açıldıysa birkaç saniye sonra **yenileyin** veya doğrudan **http://127.0.0.1:3847** yazın. Windows Güvenlik Duvarı ilk `node.exe` çalıştığında engelleyebilir; yerel erişime izin verin.

- **WebSocket / canlı olaylar gelmiyor** — Sunucu varsayılan olarak **IPv6 `::` + IPv4** (çift yığın) dinler; `localhost` ile de WebSocket çalışması gerekir. Yine de sorun varsa **Ctrl+F5**, ardından **`http://127.0.0.1:3847`** deneyin. Eski davranış (yalnız IPv4) için sunucuyu `set HOST=0.0.0.0` ile başlatın. LAN’dan bağlanırken sunucu makinesinde **3847** (veya `PORT`) için güvenlik duvarına izin verin.

- **TikFinity’ye bağlanamıyorum** — TikFinity masaüstünün çalıştığından ve yayının açık olduğundan emin olun. Tarayıcıda **Ayarlar** → WebSocket adresinin **`ws://127.0.0.1:21213`** (veya TikFinity’de gösterilen port) olduğunu kontrol edin. Gerekirse **`POST /api/event`** ile olay göndererek sunucu yolunu test edin.

- **`GET /api/…` 404** — Sayfa **statik sunucudan** açılmış olabilir. **http://127.0.0.1:3847** ile açın. Doğrulama: `GET http://127.0.0.1:3847/api/ping` içinde `streamxt: true`, `apiRevision` (14+) olmalı.

## Yayın düzeni

OBS / TikTok Studio’da **Tarayıcı kaynağı** URL’si: `http://localhost:3847` (veya aynı ağdaki PC IP’si). Çözünürlük: dikey 1080×1920 veya 720×1280; oyun alanı **1038:780** (her yarım arka plan **1023×1537** tasarımına göre) görünür pencereye sığacak şekilde ölçeklenir (üst HUD hariç kalan alan).

## Yapılandırma

`config.json` ile HUD’daki takım yazılarını, **arka plan yollarını** (`bgLeftPath`, `bgRightPath`) ve isteğe bağlı **`tikfinityWsUrl`** (sunucunun önerdiği TikFinity WebSocket adresi; istemcide `localStorage` doluysa istemci adresi önceliklidir) ayarlayın. Aynı bilgiyi tarayıcıda **Ayarlar** düğmesinden de kaydedebilirsiniz; görsel yüklemeleri `public/assets/streamxt-bg-left.*` / `streamxt-bg-right.*` olarak yazar. API: **`POST /api/settings`** (JSON: takım alanları, isteğe `leftImage` / `rightImage` → `{ "dataUrl": "data:image/png;base64,..." }`, veya `resetBackgrounds: true`). Sunucu bu uç için çok büyük gövdeye izin verir; **413** hâlâ görürseniz önde **nginx / Cloudflare** gibi bir katmanda `client_max_body_size` vb. sınırı kontrol edin ve Node sürecini yeniden başlatın.

## Arka plan (iki dosya)

Sol ve sağ yarım için **`public/assets/sol.png`** ve **`public/assets/sag.png`**. **Kill skoru** hangi takımın önde olduğuna göre **`public/assets/1.mp3`** (Alpha) veya **`public/assets/2.mp3`** (Bravo) çalar; lider değişince diğer parça kaldığı yerden devam eder. Ayrıntı: **`public/assets/README.md`**.

- Birim yüzü: köprü JSON’da `avatarUrl` veya `profilePictureUrl`
- Üst skor çubuğu (HUD): **`index.html`** / **`styles.css`**

## Dosyalar

- `server.js` — API (önce) + statik dosya + WebSocket + `GET /api/ping` + `GET /api/avatar-image` + `POST /api/event` + `GET /api/tiktok/live` (bilgi; köprü yok) + `POST /api/settings`
- `public/game.js` — oyun mantığı ve hediye haritası
- `public/index.html`, `public/styles.css` — arayüz

Yerel test: TikFinity **bağlı değilken** sayfadayken klavyede **`T`** tuşuna basın; saha sıfırlanır, **α** (sol) ve **β** (sağ) sabit iki düellocu karşılıklı konur ve **tüm hediye + jeton yetenekleri** sırayla tetiklenir; **her adımda** sıradaki yetenek uygulanır, **bir düellocunun canı bitene kadar** (veya güvenlik için süre dolana kadar) beklenir, ardından saha temizlenip ikisi yeniden canlanır ve sıradaki yetenek gelir. Her adımda **`TEST · …`** etiketi; tur sonunda **«TEST · Tur bitti»**. TikFinity **bağlıyken** `T` ve sim ızgarası devre dışıdır. Geliştirici araçlarında `#simPanel` üzerindeki `hidden` özniteliğini kaldırırsanız eski hediye ızgarası da görünür (canlı kapalıyken).
