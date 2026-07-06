# Arena Battle with TikFinity

[TikFinity](https://tikfinity.zerody.one/) provides overlays, TTS, and live tools for TikTok LIVE. **It does not auto-open your game URL inside the app**; as a streamer you show the game like this:

## 1) Showing the game on stream (recommended)

1. Serve the game over **HTTPS** (e.g. `npm run build` + static host, or tunnel `npm run dev` with [Cloudflare Tunnel](https://developers.cloudflare.com/cloudflare-one/connections/connect-apps/) / ngrok).
2. In **TikTok LIVE Studio** or **OBS**, add a **Browser / Browser source**.
3. Paste your **Arena Battle URL** as the source URL (e.g. `https://your-tunnel.trycloudflare.com`).
4. Run TikFinity as usual; keep its alert/overlay URLs as **separate** sources if you use them.

TikFinity connects to TikTok; the game runs as another embedded browser source on the same scene. Both can run together.

## 2) TikFinity WebSocket → game (automatic)

Unless **`?tikfinity=0`** is in the address bar, the game tries to connect to TikFinity’s known default local endpoint (**`ws://127.0.0.1:21213`**). If TikFinity runs on the same PC, you usually do not need to paste a URL. On disconnect it retries after a short delay. If your build uses another port, save the URL in the in-game settings panel or `localStorage.setItem("tikfinity_ws_url", "ws://...")`.

To disable auto-connect entirely: **`?tikfinity=0`**.

## 3) TikFinity WebSocket → game (manual / custom URL)

The [TikTok LIVE API page](https://tikfinity.zerody.one/tiktok/dapi) (TikFinity account) lists the **local WebSocket** for the desktop app. If the default fails, set `localStorage.setItem("tikfinity_ws_url", "ws://...")` or use `.env` `VITE_TIKFINITY_WS_URL` for dev.

- The WebSocket must match **TikFinity running on the same machine** (TikFinity’s own requirement).
- Because the **Browser Source** runs on the **streamer PC**, `ws://127.0.0.1:...` is usually reachable.
- Field names may vary by TikFinity version; check devtools `[TikFinity]` logs (`npm run dev`).

The game maps: `gift`, `like`, `follow` / `member` / `subscribe` / `share` (the last four are treated like a `like` join). Viewer name and avatar are read from common `user` fields (`nickname`, `profilePictureUrl`, `avatar_thumb.url_list`, etc.). TikTok CDN URLs often load on canvas without CORS.

## 4) “Redirect” expectations

TikFinity “screen URL” is usually **inside TikFinity’s own widget**; it typically does not HTTP-302 to your `.html`. To show this game, add **your game URL directly** to the broadcast software as above.
