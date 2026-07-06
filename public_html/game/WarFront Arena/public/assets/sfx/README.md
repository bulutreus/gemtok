# Ses efektleri (gerçek örnekler)

Bu klasördeki dosyalar **Mixkit** ücretsiz ses kütüphanesinden indirilen **önizleme (preview) MP3** kopyalarıdır. Ticari ve kişisel projelerde kullanım için Mixkit lisansına uyun: https://mixkit.co/license/

| Dosya | Olay | Mixkit `active_storage` önizleme ID |
|--------|------|-------------------------------------|
| `spawn_whoosh.mp3` | Birim doğar | 1492 |
| `arrow_missile.mp3` | Füze / ok | 2772 |
| `laser_beam.mp3` | Işın (beam) | 1660 |
| `gun_laser.mp3` | Mermi fırtınası (tekrarlı) | 1670 |
| `electric_thunder.mp3` | Şimşek köprüsü | 2595 |
| `whoosh_tornado.mp3` | Hortum | 1714 |
| `magic_lotus.mp3` | Ateş lotusu | 2807 |
| `blade_murad.mp3` | Murad | 2782 |
| `dragon_swoosh.mp3` | Ejder | 790 |
| `hook_whoosh.mp3` | Kanca | 2780 |
| `hit_impact.mp3` | Çarpma | 1143 |
| `explosion_kill.mp3` | Öldürme | 1687 |
| `combo_chime.mp3` | Seri / kombo | 212 |

Dosyaları değiştirmek için aynı isimlerle yeni MP3 koymanız yeterli (`public/game.js` içindeki `SFX_URLS` yollarıyla eşleşmeli). Önizleme yerine tam sürüm indirirseniz dosya adlarını koruyun veya `SFX_URLS` güncelleyin.

Sunucu üzerinden açılmalı (`http://localhost:3847`); `file://` ile MP3 yüklenemeyebilir — oyun otomatik olarak eski **Web Audio sentez** sesine düşer.
