# Arena Battle — TikTok Live–style interactive game

Portrait (9:16) arena: viewers **spawn on LIKE**, gifts grant weapons / speed; mass (score) grows the circle; **LEADERBOARD** (top 4) and a round timer are shown.

## Run locally

```bash
npm install
npm run dev
```

Open the URL Vite prints (default `http://localhost:5173`).

**Windows:** double-click `baslat.bat` — it runs `npm install` if needed, starts the dev server, and can open the browser when ready.

## TikTok Live (Playroom Kit)

This project uses the [Playroom TikTok integration](https://docs.joinplayroom.com/features/integrations/tiktok): `insertCoin({ liveMode: "tiktok" })` and `onTikTokLiveEvent` (official example: [Cards demo code](https://docs.joinplayroom.com/features/integrations/tiktok#code-for-the-cards-demo)).

1. Create a game in the [Playroom dashboard](https://joinplayroom.com) and copy `gameId` (often required for `insertCoin`).
2. Add `.env` at the project root: `VITE_PLAYROOM_GAME_ID=your_game_id` (see `.env.example`). You can also persist with `localStorage.setItem("playroom_game_id", "your_id")`.
3. **Append `?playroom=1` to the URL** — Playroom TikTok flow starts automatically (TikTok username → Launch → go live with **Mobile gaming** on TikTok). When `?playroom=1` is set, **TikFinity auto-connect is disabled** to avoid clashes.
4. The Playroom API is **experimental**; see their docs.

Viewer **name and avatar** come from the event payload. TikTok CDN images are drawn on canvas with `crossOrigin` only when the host allows CORS (otherwise the image may still load without CORS).

Playroom’s `insertCoin` injects **`.bootstrap-wrapper`** into the page. Outside the flow it is **hidden with CSS** and **removed from the DOM** if the SDK re-adds it. The game bootstraps **once** per page load. If something breaks, refresh.

### Stuck / second attempt does nothing

If `window.__playroomjs_mounted` stays set, the next `insertCoin` may **wait forever**. **Refresh the page.** In the overlay: **TikTok username → Launch → Mobile gaming live on TikTok**.

**URL flags:** `?mock=0` — disable the local mock stream. `?tikfinity=0` — disable TikFinity auto WebSocket. `?playroom=1` — auto-start Playroom TikTok (needs `gameId` as above).

## TikFinity

TikFinity does not “deep link” into this game; you show the game in **OBS / TikTok LIVE Studio** as a **browser / browser source**. Optionally connect **TikFinity’s WebSocket** so events reach the game: the page **auto-connects** to the default local URL (disable with `?tikfinity=0`). Do **not** use Playroom TikTok and TikFinity at the same time. Details: [docs/TIKFINITY.md](docs/TIKFINITY.md).

### Gift name mapping

`giftName` / `giftId` strings from TikTok are mapped to in-game `GiftType` in `src/tiktok/playroomGiftMap.ts`; extend that file for new gifts.

## Shortcut / gift cheat sheet

| Interaction | In-game effect   |
|--------------|------------------|
| LIKE         | Spawn / join     |
| ROSE         | Power Blade      |
| HEART        | Ultra Blade      |
| ROSA         | Sniper           |
| PERF         | Speed boost      |
| CONF         | Minigun          |
| DONUT        | Bomber           |
| GLASS        | Hyper Blade      |
| CORGI        | God Mode         |

## License

MIT — use freely.
