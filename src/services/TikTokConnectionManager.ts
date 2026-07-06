import { getEventBus } from "@/services/EventBus";
import { getGiftManager } from "@/services/GiftManager";
import type {
  ChatEvent,
  ConnectionEvent,
  DisconnectEvent,
  FollowEvent,
  GiftEvent,
  LikeEvent,
  LiveEventName,
  LiveEventPayload,
  MemberEvent,
  ReconnectEvent,
  ShareEvent,
  SubscribeEvent,
} from "@/types/tiktok";

declare global {
  interface Window {
    GemTokTikFinity?: {
      createClient: (opts: Record<string, unknown>) => GemTokTikFinityClient;
    };
    GemTokTikTokLive?: GemTokTikTokLiveBridge;
  }
}

interface GemTokTikTokLiveBridge {
  eventBus: {
    on: (e: string, fn: (p: unknown) => void) => void;
    off: (e: string, fn: (p: unknown) => void) => void;
  };
  getConnectionState?: () => { state: string; url?: string; leader?: boolean };
  reconnect?: () => void;
}

interface GemTokTikFinityClient {
  startAuto: () => Promise<void>;
  stop?: () => void;
  reconnect?: () => void;
}

const TIKTOK_PAYLOAD_EVENTS: LiveEventName[] = [
  "gift",
  "like",
  "follow",
  "share",
  "member",
  "subscribe",
  "chat",
];

export interface TikTokConnectionManagerStartOptions {
  hubBase?: string;
  /** "auto": GemTokTikTokLive varsa köprü; yoksa doğrudan TikFinity istemcisi. */
  portalBridge?: boolean | "auto";
  /** Köprü modunda varsayılan false (keşif öncü sekmede). Doğrudan modda true. */
  enableGiftManagerDiscover?: boolean;
  tikfinityClientOptions?: Record<string, unknown>;
  maxEventsPerFrame?: number;
}

type Queued = { name: LiveEventName; payload: unknown };

/**
 * TikFinity WebSocket’e yalnızca bu katman erişir; oyunlar yalnızca EventBus kullanır.
 */
export class TikTokConnectionManager {
  private static instance: TikTokConnectionManager | null = null;

  private queue: Queued[] = [];
  private flushRaf: number | null = null;
  private bridgeHandlers: Array<{ ev: string; fn: (p: unknown) => void }> = [];
  private pollId: ReturnType<typeof setInterval> | null = null;
  private lastLifecycleState: string | null = null;
  private client: GemTokTikFinityClient | null = null;
  private started = false;
  private bridgeMode = false;
  private maxPerFrame = 64;

  static getInstance(): TikTokConnectionManager {
    if (!TikTokConnectionManager.instance) TikTokConnectionManager.instance = new TikTokConnectionManager();
    return TikTokConnectionManager.instance;
  }

  isBridgeMode(): boolean {
    return this.bridgeMode;
  }

  isStarted(): boolean {
    return this.started;
  }

  start(options: TikTokConnectionManagerStartOptions = {}): void {
    if (this.started) return;
    this.started = true;
    this.maxPerFrame = options.maxEventsPerFrame ?? 64;

    const hubFromGlobal =
      typeof globalThis !== "undefined" &&
      (globalThis as unknown as { __GEMTOK_GIFT_HUB_URL__?: string }).__GEMTOK_GIFT_HUB_URL__;
    const hubBase = String(options.hubBase || hubFromGlobal || "")
      .trim()
      .replace(/\/$/, "");

    const bridgePref = options.portalBridge ?? "auto";
    const win = typeof globalThis !== "undefined" ? (globalThis as unknown as Window) : undefined;
    const hasLive = !!(win?.GemTokTikTokLive?.eventBus);
    const useBridge =
      bridgePref !== false && hasLive && (bridgePref === true || bridgePref === "auto");

    if (useBridge && win?.GemTokTikTokLive) {
      this.bridgeMode = true;
      this.attachPortalBridge(win.GemTokTikTokLive);
      this.startBridgeLifecyclePolling(() => win.GemTokTikTokLive?.getConnectionState?.());
    } else {
      this.bridgeMode = false;
      this.startDirectClient(win, options.tikfinityClientOptions ?? {});
    }

    const discover =
      options.enableGiftManagerDiscover ?? (this.bridgeMode ? false : hubBase.length > 0);
    if (hubBase) {
      getGiftManager().configure({ hubBase });
      if (discover) getGiftManager().attach();
    }
  }

  stop(): void {
    this.teardownBridge();
    if (this.pollId) {
      clearInterval(this.pollId);
      this.pollId = null;
    }
    if (this.flushRaf != null) {
      cancelAnimationFrame(this.flushRaf);
      this.flushRaf = null;
    }
    this.queue.length = 0;
    try {
      this.client?.stop?.();
    } catch {
      /* */
    }
    this.client = null;
    getGiftManager().detach();
    this.started = false;
    this.bridgeMode = false;
    this.lastLifecycleState = null;
  }

  reconnect(): void {
    const win = typeof globalThis !== "undefined" ? (globalThis as unknown as Window) : undefined;
    if (this.bridgeMode) {
      try {
        win?.GemTokTikTokLive?.reconnect?.();
      } catch {
        /* */
      }
      return;
    }
    try {
      this.client?.reconnect?.();
    } catch {
      /* */
    }
  }

  private enqueue<K extends LiveEventName>(name: K, payload: LiveEventPayload<K>): void {
    this.queue.push({ name, payload });
    if (this.flushRaf == null) {
      this.flushRaf = requestAnimationFrame(() => this.flush());
    }
  }

  private flush(): void {
    this.flushRaf = null;
    const bus = getEventBus();
    let n = 0;
    while (n < this.maxPerFrame && this.queue.length > 0) {
      const item = this.queue.shift();
      if (!item) break;
      bus.emit(item.name, item.payload as never);
      n += 1;
    }
    if (this.queue.length > 0) {
      this.flushRaf = requestAnimationFrame(() => this.flush());
    }
  }

  private attachPortalBridge(live: GemTokTikTokLiveBridge): void {
    const bus = live.eventBus;
    for (const ev of TIKTOK_PAYLOAD_EVENTS) {
      const fn = (payload: unknown) => {
        if (ev === "chat") this.enqueue("chat", (payload ?? { type: "chat" }) as LiveEventPayload<"chat">);
        else this.routePayload(ev, payload);
      };
      bus.on(ev, fn);
      this.bridgeHandlers.push({ ev, fn });
    }
  }

  private routePayload(ev: string, payload: unknown): void {
    if (!payload || typeof payload !== "object") return;
    switch (ev) {
      case "gift":
        this.enqueue("gift", payload as GiftEvent);
        break;
      case "like":
        this.enqueue("like", payload as LikeEvent);
        break;
      case "follow":
        this.enqueue("follow", payload as FollowEvent);
        break;
      case "share":
        this.enqueue("share", payload as ShareEvent);
        break;
      case "member":
        this.enqueue("member", payload as MemberEvent);
        break;
      case "subscribe":
        this.enqueue("subscribe", payload as SubscribeEvent);
        break;
      case "chat":
        this.enqueue("chat", payload as ChatEvent);
        break;
      default:
        this.enqueue("chat", { type: String(ev), ...(payload as object) } as LiveEventPayload<"chat">);
    }
  }

  private teardownBridge(): void {
    const win = typeof globalThis !== "undefined" ? (globalThis as unknown as Window) : undefined;
    const live = win?.GemTokTikTokLive;
    if (!live) {
      this.bridgeHandlers.length = 0;
      return;
    }
    for (const { ev, fn } of this.bridgeHandlers) {
      try {
        live.eventBus.off(ev, fn);
      } catch {
        /* */
      }
    }
    this.bridgeHandlers.length = 0;
  }

  private startBridgeLifecyclePolling(
    getSnapshot: () => { state: string; url?: string; leader?: boolean } | undefined
  ): void {
    if (this.pollId) return;
    this.pollId = setInterval(() => {
      const snap = getSnapshot();
      if (!snap) return;
      const { state, url, leader } = snap;
      if (state === this.lastLifecycleState) return;
      this.lastLifecycleState = state;

      if (state === "connected") {
        this.enqueue("connection", { state: "connected", url, leader } satisfies ConnectionEvent);
      } else if (state === "reconnecting") {
        this.enqueue("reconnect", { state: "reconnecting", url, leader } satisfies ReconnectEvent);
      } else if (state === "connecting") {
        /* */
      } else {
        const st: DisconnectEvent["state"] =
          state === "invalid_url"
            ? "invalid_url"
            : state === "disabled_by_url"
              ? "disabled_by_url"
              : state === "error"
                ? "error"
                : "disconnected";
        this.enqueue("disconnect", { state: st, url, leader } satisfies DisconnectEvent);
      }
    }, 450);
  }

  private startDirectClient(win: Window | undefined, extraOpts: Record<string, unknown>): void {
    const GT = win?.GemTokTikFinity;
    if (!GT || typeof GT.createClient !== "function") {
      this.enqueue("disconnect", { state: "error", message: "GemTokTikFinity yok", leader: true } satisfies DisconnectEvent);
      return;
    }

    const onPayloads = (batch: unknown[]) => {
      if (!Array.isArray(batch)) return;
      for (const raw of batch) {
        if (!raw || typeof raw !== "object") continue;
        const o = raw as { type?: string };
        const t = String(o.type || "");
        if (t === "gift") this.enqueue("gift", o as GiftEvent);
        else if (t === "like") this.enqueue("like", o as LikeEvent);
        else if (t === "follow") this.enqueue("follow", o as FollowEvent);
        else if (t === "share") this.enqueue("share", o as ShareEvent);
        else if (t === "member") this.enqueue("member", o as MemberEvent);
        else if (t === "subscribe") this.enqueue("subscribe", o as SubscribeEvent);
        else this.enqueue("chat", o as ChatEvent);
      }
    };

    const onStatus = (s: { phase?: string; url?: string; message?: string }) => {
      const phase = String(s.phase || "");
      if (phase === "connected") {
        this.enqueue("connection", { state: "connected", url: s.url, leader: true } satisfies ConnectionEvent);
      } else if (phase === "reconnecting") {
        this.enqueue("reconnect", { state: "reconnecting", url: s.url, leader: true } satisfies ReconnectEvent);
      } else if (phase === "connecting") {
        /* */
      } else {
        const st: DisconnectEvent["state"] =
          phase === "invalid_url"
            ? "invalid_url"
            : phase === "disabled_by_url"
              ? "disabled_by_url"
              : phase === "error"
                ? "error"
                : "disconnected";
        this.enqueue("disconnect", {
          state: st,
          url: s.url,
          leader: true,
          message: s.message,
        } satisfies DisconnectEvent);
      }
    };

    this.client = GT.createClient({
      emitLanePickForChatDigits: true,
      eventsPerFrame: 48,
      onPayloads,
      onStatus,
      ...extraOpts,
    });
    void this.client.startAuto();
  }
}

export function getTikTokConnectionManager(): TikTokConnectionManager {
  return TikTokConnectionManager.getInstance();
}
