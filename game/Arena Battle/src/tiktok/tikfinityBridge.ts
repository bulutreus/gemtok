import type { LiveEvent, LiveUser } from "../types";
import { mapPlayroomGiftToGameGift } from "./playroomGiftMap";
import { extractViewerProfileUrl } from "./viewerProfile";

function userFromPayload(data: Record<string, unknown>): LiveUser | null {
  const u = (data.user ?? data.sender ?? data.member) as Record<string, unknown> | undefined;
  const uniqueId = (u?.uniqueId ?? u?.userId ?? data.uniqueId ?? data.userId) as string | undefined;
  if (!uniqueId) return null;
  const nick = (u?.nickname ?? u?.displayName ?? u?.name ?? data.nickname ?? data.uniqueId ?? uniqueId) as string;
  const photo = extractViewerProfileUrl(data, u);
  return {
    id: String(uniqueId),
    displayName: String(nick || uniqueId).replace(/^@+/, ""),
    avatarUrl: photo,
  };
}

/** TikFinity / bridge JSON → LiveEvent */
export function mapTikFinityJsonToLiveEvent(raw: unknown): LiveEvent | null {
  if (raw == null || typeof raw !== "object") return null;
  const obj = raw as Record<string, unknown>;
  const event = String(obj.event ?? obj.type ?? "").toLowerCase();
  const data = (obj.data as Record<string, unknown> | undefined) ?? obj;

  if (event === "gift") {
    // TikTok streak hediyesi devam ederken her tik icin bir olay gelir ve
    // repeatCount kumulatiftir. Ara tiklar islenirse 5'li bir combo efekti
    // 1+2+3+4+5 = 15 birim sureye cikar. Yalnizca final olayi islenir.
    if (data.repeatEnd === false || data.repeat_end === false) return null;
    const user = userFromPayload(data);
    if (!user) return null;
    const giftName = String(data.giftName ?? data.giftId ?? "");
    const giftId = String(data.giftId ?? data.giftType ?? "");
    // `count` = hediye combo'su (kac kez gonderildi). Efekt SURESI bunun katidir
    // (WEAPON_DURATION_MS * count). Bu yuzden elmas degeri (diamondCount) buraya
    // KARISTIRILMAMALI: 1000 elmaslik tek hediye ~sonsuz sureye yol acardi ve
    // combo'lar yok sayilirdi. Hediyenin degeri zaten hangi silaha eslendigiyle yansir.
    const rawCombo = Number(
      data.repeatCount ??
        data.giftCombo ??
        data.comboCount ??
        data.groupCount ??
        data.repeat_count ??
        data.giftCount ??
        1
    );
    const count = Math.max(1, Math.min(20, Math.floor(Number.isFinite(rawCombo) ? rawCombo : 1)));
    return {
      kind: "gift",
      gift: mapPlayroomGiftToGameGift({ giftName, giftId }),
      user,
      count,
    };
  }

  if (event === "like") {
    const user = userFromPayload(data);
    if (!user) return null;
    return { kind: "like", user };
  }

  if (event === "follow" || event === "member" || event === "subscribe" || event === "share") {
    const user = userFromPayload(data);
    if (!user) return null;
    return { kind: "like", user };
  }

  return null;
}

export type TikFinityStatusFn = (msg: string) => void;

/** Known default local endpoint for TikFinity (verify in the TikTok LIVE API page for your build). */
export const TIKFINITY_DEFAULT_WS_URL = "ws://127.0.0.1:21213";

export type ConnectTikFinityWsOptions = {
  onStatus?: TikFinityStatusFn;
  onOpen?: () => void;
  onClose?: () => void;
};

/** Open a TikFinity (or compatible) WebSocket; call the returned function to close. Returns `null` if it cannot start. */
export function connectTikFinityWebSocket(
  url: string,
  dispatch: (e: LiveEvent) => void,
  opts?: ConnectTikFinityWsOptions | TikFinityStatusFn
): (() => void) | null {
  const options: ConnectTikFinityWsOptions =
    typeof opts === "function" ? { onStatus: opts } : (opts ?? {});

  type GemWin = Window & {
    GemTokLiveGameBridge?: {
      ensure: (o?: { hubBase?: string; showHud?: boolean }) => boolean;
      onPayload: (fn: (p: unknown) => void) => () => void;
    };
    GemTokTikTokLive?: unknown;
    __GEMTOK_GIFT_HUB_URL__?: string;
  };
  const win = typeof globalThis !== "undefined" ? (globalThis as unknown as GemWin) : null;
  if (win?.GemTokLiveGameBridge?.ensure && win?.GemTokTikTokLive) {
    const hub = win.__GEMTOK_GIFT_HUB_URL__ ?? "http://127.0.0.1:8787";
    if (win.GemTokLiveGameBridge.ensure({ hubBase: hub, showHud: false })) {
      {
        const queue: LiveEvent[] = [];
        let rafId = 0;
        const MAX_QUEUE = 280;
        const EVENTS_PER_FRAME = 40;
        const flushQueue = () => {
          let n = 0;
          while (n < EVENTS_PER_FRAME && queue.length > 0) {
            const ev = queue.shift()!;
            try {
              dispatch(ev);
            } catch (err) {
              if (import.meta.env.DEV) console.warn("[TikFinity] dispatch", err);
            }
            n += 1;
          }
          if (queue.length > 0) {
            rafId = requestAnimationFrame(flushQueue);
          } else {
            rafId = 0;
          }
        };
        const enqueue = (e: LiveEvent) => {
          queue.push(e);
          if (queue.length > MAX_QUEUE) {
            queue.splice(0, queue.length - MAX_QUEUE);
          }
          if (rafId === 0) {
            rafId = requestAnimationFrame(flushQueue);
          }
        };
        options.onStatus?.("GemTok portal (tek TikFinity bağlantısı).");
        options.onOpen?.();
        const unsub = win.GemTokLiveGameBridge.onPayload((raw) => {
          const live = mapTikFinityJsonToLiveEvent(raw);
          if (live) enqueue(live);
        });
        return () => {
          if (rafId !== 0) {
            cancelAnimationFrame(rafId);
            rafId = 0;
          }
          queue.length = 0;
          unsub();
          options.onClose?.();
        };
      }
    }
  }

  const trimmed = url.trim();
  if (!trimmed) {
    options.onStatus?.("WebSocket URL is empty.");
    return null;
  }

  const queue: LiveEvent[] = [];
  let rafId = 0;
  const MAX_QUEUE = 280;
  const EVENTS_PER_FRAME = 40;

  const flushQueue = () => {
    let n = 0;
    while (n < EVENTS_PER_FRAME && queue.length > 0) {
      const ev = queue.shift()!;
      try {
        dispatch(ev);
      } catch (err) {
        if (import.meta.env.DEV) console.warn("[TikFinity] dispatch", err);
      }
      n += 1;
    }
    if (queue.length > 0) {
      rafId = requestAnimationFrame(flushQueue);
    } else {
      rafId = 0;
    }
  };

  const enqueue = (e: LiveEvent) => {
    queue.push(e);
    if (queue.length > MAX_QUEUE) {
      queue.splice(0, queue.length - MAX_QUEUE);
    }
    if (rafId === 0) {
      rafId = requestAnimationFrame(flushQueue);
    }
  };

  let ws: WebSocket;
  try {
    ws = new WebSocket(trimmed);
  } catch (e) {
    options.onStatus?.(`Invalid address: ${e instanceof Error ? e.message : String(e)}`);
    return null;
  }

  ws.onopen = () => {
    options.onStatus?.("TikFinity WebSocket connected.");
    options.onOpen?.();
  };
  ws.onerror = () =>
    options.onStatus?.("WebSocket error (is TikFinity running and is the URL correct?).");
  ws.onclose = () => {
    options.onStatus?.("TikFinity WebSocket closed.");
    options.onClose?.();
  };

  ws.onmessage = (ev) => {
    let raw: unknown;
    try {
      raw = JSON.parse(String(ev.data));
    } catch {
      return;
    }
    if (import.meta.env.DEV) console.debug("[TikFinity]", raw);
    const live = mapTikFinityJsonToLiveEvent(raw);
    if (live) enqueue(live);
  };

  return () => {
    if (rafId !== 0) {
      cancelAnimationFrame(rafId);
      rafId = 0;
    }
    queue.length = 0;
    try {
      ws.close();
    } catch {
      /* ignore */
    }
  };
}
