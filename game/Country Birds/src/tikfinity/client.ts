import { resolveTikfinityWsUrl } from "./config";
import { normalizeGemTokFlatPayload, normalizeTikfinityMessage } from "./normalize";
import { createRafMessageQueue } from "./rafQueue";
import { mapTikfinityEventToAction, type ActionSink } from "./actions";

const RECONNECT_MIN_MS = 2500;
const RECONNECT_MAX_MS = 6000;

function reconnectDelayMs(): number {
  return RECONNECT_MIN_MS + Math.random() * (RECONNECT_MAX_MS - RECONNECT_MIN_MS);
}

export type TikfinityClientOptions = {
  getUrl?: () => string;
  maxPerFrame?: number;
  onAction: ActionSink;
  /** Bağlantı durumu (isteğe bağlı UI) */
  onStatus?: (s: "connecting" | "open" | "closed" | "error" | "idle") => void;
};

export function createTikfinityClient(options: TikfinityClientOptions): {
  connect: () => void;
  disconnect: () => void;
  isConnected: () => boolean;
} {
  type GemWin = Window & {
    GemTokLiveGameBridge?: {
      ensure: (o?: { hubBase?: string; showHud?: boolean }) => boolean;
      onPayload: (fn: (p: unknown) => void) => () => void;
    };
    GemTokTikTokLive?: unknown;
    __GEMTOK_GIFT_HUB_URL__?: string;
  };
  const gwin = typeof globalThis !== "undefined" ? (globalThis as unknown as GemWin) : null;
  if (gwin?.GemTokLiveGameBridge?.ensure && gwin?.GemTokTikTokLive) {
    const hub = gwin.__GEMTOK_GIFT_HUB_URL__ ?? "http://127.0.0.1:8787";
    if (gwin.GemTokLiveGameBridge.ensure({ hubBase: hub, showHud: false })) {
      let bridgeUnsub: (() => void) | null = null;
      let portalManualClose = false;
      const maxPerFrame = options.maxPerFrame ?? 8;
      const portalQueue = createRafMessageQueue<unknown>({
        maxPerFrame,
        onItem(raw) {
          const ev = normalizeGemTokFlatPayload(raw) ?? normalizeTikfinityMessage(raw);
          if (!ev) return;
          options.onAction(mapTikfinityEventToAction(ev));
        },
      });
      return {
        connect() {
          portalManualClose = false;
          bridgeUnsub?.();
          bridgeUnsub = gwin.GemTokLiveGameBridge!.onPayload((payload) => {
            if (portalManualClose) return;
            portalQueue.enqueue(payload);
          });
          options.onStatus?.("open");
        },
        disconnect() {
          portalManualClose = true;
          bridgeUnsub?.();
          bridgeUnsub = null;
          portalQueue.stop();
          options.onStatus?.("idle");
        },
        isConnected() {
          return bridgeUnsub != null && !portalManualClose;
        },
      };
    }
  }

  const getUrl = options.getUrl ?? resolveTikfinityWsUrl;
  const maxPerFrame = options.maxPerFrame ?? 8;

  let ws: WebSocket | null = null;
  let manualClose = false;
  let reconnectTimer: ReturnType<typeof setTimeout> | null = null;

  const queue = createRafMessageQueue<unknown>({
    maxPerFrame,
    onItem(raw) {
      const ev = normalizeTikfinityMessage(raw);
      if (!ev) return;
      options.onAction(mapTikfinityEventToAction(ev));
    },
  });

  const clearReconnect = (): void => {
    if (reconnectTimer != null) {
      clearTimeout(reconnectTimer);
      reconnectTimer = null;
    }
  };

  const scheduleReconnect = (): void => {
    if (manualClose) return;
    clearReconnect();
    reconnectTimer = setTimeout(() => {
      reconnectTimer = null;
      openSocket();
    }, reconnectDelayMs());
  };

  const openSocket = (): void => {
    if (manualClose) return;
    clearReconnect();
    try {
      ws?.close();
    } catch {
      /* ignore */
    }
    ws = null;

    const url = getUrl();
    options.onStatus?.("connecting");

    let socket: WebSocket;
    try {
      socket = new WebSocket(url);
    } catch {
      options.onStatus?.("error");
      scheduleReconnect();
      return;
    }

    ws = socket;

    socket.onopen = () => {
      options.onStatus?.("open");
    };

    socket.onmessage = (e) => {
      const text = typeof e.data === "string" ? e.data : null;
      if (text == null) return;
      let parsed: unknown;
      try {
        parsed = JSON.parse(text) as unknown;
      } catch {
        return;
      }
      if (Array.isArray(parsed)) {
        for (const item of parsed) queue.enqueue(item);
        return;
      }
      queue.enqueue(parsed);
    };

    socket.onerror = () => {
      options.onStatus?.("error");
    };

    socket.onclose = () => {
      ws = null;
      if (manualClose) {
        options.onStatus?.("idle");
        return;
      }
      options.onStatus?.("closed");
      scheduleReconnect();
    };
  };

  return {
    connect() {
      manualClose = false;
      openSocket();
    },
    disconnect() {
      manualClose = true;
      clearReconnect();
      queue.stop();
      try {
        ws?.close();
      } catch {
        /* ignore */
      }
      ws = null;
    },
    isConnected() {
      return ws?.readyState === WebSocket.OPEN;
    },
  };
}
