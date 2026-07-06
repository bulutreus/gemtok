This project uses a centralized TikTok Gift System.

Never create separate gift lists.
Always use the global gift database.
Every game must support gift-action mappings.
Follow the existing theme and component architecture.


# GEMTOK Project Rules

## Platform Identity

This project is GEMTOK, a TikTok Interactive Games Platform.

All games on the platform must share the same architecture, design system, and TikTok integration.

---

## TikTok Integration Rules

There must be ONLY ONE TikTok connection for the entire platform.

Never create separate TikTok, TikFinity, WebSocket, or Live connections inside individual games.

All games must use the Global TikTok Connection Manager.

Connection flow:

TikFinity WebSocket
→ TikTokConnectionManager
→ EventBus
→ Games

Games are consumers only.

Games must never connect directly to TikFinity.

---

## WebSocket Rules

Default WebSocket:

ws://127.0.0.1:21213

URL priority:

1. localStorage
2. Environment Variable
3. Default URL

Implement automatic reconnect with exponential backoff.

Prevent duplicate connections.

Maintain connection across page navigation.

---

## Event Bus Rules

All TikTok events must be dispatched through a centralized Event Bus.

Supported events:

* gift
* like
* follow
* share
* member
* subscribe
* chat

Games must subscribe to EventBus events.

Games must not parse WebSocket messages directly.

---

## Gift System Rules

Use a centralized Gift Manager.

Never create game-specific gift databases.

Never duplicate gift data.

Every game must load gifts from the global gift database.

New gifts discovered from TikTok events must automatically be added to the global gift database.

Store:

* giftId
* giftName
* diamondCount
* imageUrl
* lastSeen

Teknik akış ve bileşenler: `docs/AUTO_GIFTS.md`.

---

## Game Rules

Every game must support Gift Mapping.

Gift Mapping determines which game action is triggered by a TikTok gift.

Examples:

Rose → Speed +1

GG → Spawn Tank

Confetti → Money Rain

Mappings must be editable from the admin panel.

---

## Performance Rules

Use event queues.

Process events with requestAnimationFrame.

Prevent excessive re-renders.

Support high-volume like spam without lag.

Never process every incoming event directly inside React components.

---

## State Management Rules

Use Zustand for global state.

Use Context Providers only when necessary.

Keep TikTok connection state globally accessible.

Persist settings in localStorage.

---

## Admin Panel Rules

Admin panel must provide:

* Connection Status
* Gift Management
* Gift Discovery
* Game Mappings

Any new game must automatically appear in the mapping system.

---

## Design Rules

Follow the existing GEMTOK design system.

Reuse existing:

* colors
* typography
* spacing
* buttons
* cards
* animations

Do not introduce new UI styles.

Do not redesign existing components unless explicitly requested.

---

## Unified local settings panel (all games)

Platform-wide **yerel ayarlar** görünümü mockup ile aynıdır. Uygulama:

* `sıra/gemtok-settings-theme.css` — ortak neon / navy / radius; yalnızca `.gemtok-settings-theme` altında geçerli.
* Her oyun **mevcut** ayar HTML’ine dokunmadan kök sarmalayıcıya `class="… gemtok-settings-theme"` ekler (WarFront `#settingsModal`, arena3/5gen `#settings-backdrop`, Arena Battle `#settings-backdrop`, Country Birds `#settingsOverlay`, vote5 ayar paneli + backdrop).
* Piksel referansı: `docs/mockups/gemtok-unified-game-settings.html`.

---

## Code Quality Rules

Prefer reusable components.

Prefer services over duplicated logic.

Prefer centralized architecture.

Do not duplicate business logic.

Do not create alternative implementations when an existing service already exists.

Always extend existing systems before creating new ones.

---

## Future Development Rule

Any future game added to GEMTOK must automatically work with:

* Global TikTok Connection
* Event Bus
* Gift Manager
* Admin Mapping System
* **Unified local settings look** — link `sıra/gemtok-settings-theme.css` and add `gemtok-settings-theme` on the game’s existing settings root (no duplicate settings UI).

without requiring a new WebSocket connection.


Never create a WebSocket connection inside a game.

Always use:
- TikTokConnectionManager
- EventBus
- GiftManager

If an existing game contains direct TikTok communication, migrate it to EventBus instead of creating another connection.

Oyun-özel ek ayarlar (ör. takım adları) ayrı kalabilir; **görsel tema** için ayrı bir ikinci stil seti oluşturulmaz — yalnızca `gemtok-settings-theme.css` + `gemtok-settings-theme` sınıfı kullanılır.

The visual design must exactly match `docs/mockups/gemtok-unified-game-settings.html` (colors, spacing, neon accents).


Never hardcode TikTok gifts.

Always discover gifts dynamically from incoming gift events.

All gifts must be stored in the centralized GiftManager database.

New gifts must automatically appear in all games and the admin panel.

---

## Dil (yerel arşiv)

Statik `sıra/*.html` arayüz metinleri Türkçedir (nav, ana sayfa, oyun merkezi, entegrasyonlar özeti, hediye sayfası meta açıklamaları vb.). Kullanım şartları ve gizlilik sayfalarının **gövde metni** HTTrack arşivinde İngilizce kalabilir; başlık çubuğu Türkçeleştirilmiştir. Yeniden çeviri toplu güncellemesi: `tools/tr-site-strings.mjs` (ve gerektiğinde `ANA SAYFA.html` başlığı için `All-in-One…` satırına regex ile müdahale).
