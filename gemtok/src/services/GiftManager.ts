import { getEventBus } from "@/services/EventBus";
import type { GiftEvent, GiftManagerDiscoveredEvent } from "@/types/tiktok";

export interface HubGiftRow {
  tiktok_id: number;
  name: string;
  diamond_count: number;
  imageUrl: string | null;
  discoveredImageUrl?: string | null;
  first_seen?: string | null;
  last_seen?: string | null;
  category?: string;
  active?: boolean;
  updated_at?: string;
}

export interface GiftManagerOptions {
  /** Örn. http://127.0.0.1:8787 */
  hubBase: string;
  /** Keşif POST isteği arası minimum ms (spam önleme). */
  discoverThrottleMs?: number;
  /** Bellekte tutulan tam liste önbelleği (ms). */
  listCacheTtlMs?: number;
  /** İsteğe bağlı: `createGift` / `updateGift` için `X-Gemtok-Gift-Admin`. */
  adminToken?: string;
}

type GiftSubscriber = (reason: "discovered" | "invalidate" | "manual", detail?: unknown) => void;

/**
 * EventBus `gift` olaylarını Gift Hub keşfine bağlar; katalog önbelleği ve abonelikler.
 * Oyunlar `getAllGifts()` / `getGiftById()` ile merkezi veritabanını kullanmalıdır.
 */
export class GiftManager {
  private static instance: GiftManager | null = null;
  private hubBase = "";
  private throttleMs = 1200;
  private listCacheTtlMs = 25_000;
  private adminToken = "";
  private lastDiscover = new Map<number, number>();
  private unsub: (() => void) | null = null;
  private listCache: { gifts: HubGiftRow[]; at: number; version: number } | null = null;
  private byIdCache = new Map<number, { row: HubGiftRow; at: number }>();
  private subscribers = new Set<GiftSubscriber>();
  private browserInvalidateBound: (() => void) | null = null;
  private giftsBroadcastCh: BroadcastChannel | null = null;

  static getInstance(): GiftManager {
    if (!GiftManager.instance) GiftManager.instance = new GiftManager();
    return GiftManager.instance;
  }

  configure(options: GiftManagerOptions): void {
    this.hubBase = String(options.hubBase || "").replace(/\/$/, "");
    this.throttleMs = options.discoverThrottleMs ?? 1200;
    this.listCacheTtlMs = options.listCacheTtlMs ?? 25_000;
    this.adminToken = String(options.adminToken || "").trim();
  }

  subscribe(fn: GiftSubscriber): () => void {
    this.subscribers.add(fn);
    return () => this.subscribers.delete(fn);
  }

  private notify(reason: "discovered" | "invalidate" | "manual", detail?: unknown) {
    for (const fn of [...this.subscribers]) {
      try {
        fn(reason, detail);
      } catch {
        /* ignore */
      }
    }
  }

  /** Gift olaylarını dinlemeye başla (idempotent). */
  attach(): void {
    if (this.unsub) return;
    const bus = getEventBus();
    const handler = (gift: GiftEvent) => void this.onGift(gift);
    bus.on("gift", handler);
    this.unsub = () => bus.off("gift", handler);

    if (typeof window !== "undefined" && !this.browserInvalidateBound) {
      const onInv = () => {
        this.refreshCache();
        this.notify("invalidate");
      };
      window.addEventListener("gemtok-gifts-updated", onInv);
      try {
        this.giftsBroadcastCh = new BroadcastChannel("gemtok-gifts-v1");
        this.giftsBroadcastCh.onmessage = onInv;
      } catch {
        this.giftsBroadcastCh = null;
      }
      this.browserInvalidateBound = () => {
        window.removeEventListener("gemtok-gifts-updated", onInv);
        try {
          this.giftsBroadcastCh?.close();
        } catch {
          /* ignore */
        }
        this.giftsBroadcastCh = null;
      };
    }
  }

  detach(): void {
    if (this.unsub) {
      this.unsub();
      this.unsub = null;
    }
    if (this.browserInvalidateBound) {
      this.browserInvalidateBound();
      this.browserInvalidateBound = null;
    }
    this.lastDiscover.clear();
  }

  refreshCache(): void {
    this.listCache = null;
    this.byIdCache.clear();
  }

  private onGift(gift: GiftEvent): void {
    if (!this.hubBase) return;
    const gid = parseInt(String(gift.giftKey ?? "").trim(), 10);
    if (!Number.isFinite(gid) || gid <= 0) return;
    const now = Date.now();
    const last = this.lastDiscover.get(gid) ?? 0;
    if (now - last < this.throttleMs) return;
    this.lastDiscover.set(gid, now);

    const nameHuman = String(gift.giftName || gift.name || "").trim();
    const slug = String(gift.giftId ?? "").trim();
    const displayName =
      nameHuman.slice(0, 200) || (slug ? slug.replace(/_/g, " ").slice(0, 200) : `Gift ${gid}`);
    const imageUrl = String(gift.giftImageUrl || (gift as { imageUrl?: string }).imageUrl || "").trim().slice(0, 2000);
    const category = String((gift as { giftCategory?: string }).giftCategory || (gift as { category?: string }).category || "").slice(
      0,
      120,
    );

    const body = {
      tiktok_id: gid,
      name: displayName,
      diamond_count: Number(gift.diamondCount) || 0,
      imageUrl,
      category,
    };

    void fetch(`${this.hubBase}/api/v1/live/discover-gift`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Accept: "application/json" },
      body: JSON.stringify(body),
    })
      .then((r) => r.json().catch(() => ({})))
      .then((j: { ok?: boolean; giftsCatalogVersion?: number }) => {
        if (!j || !j.ok) return;
        this.refreshCache();
        const ev: GiftManagerDiscoveredEvent = {
          tiktokId: gid,
          name: displayName,
          diamondCount: body.diamond_count,
          source: "live",
          giftsCatalogVersion: j.giftsCatalogVersion,
        };
        getEventBus().emit("giftmanager:discovered", ev);
        this.notify("discovered", ev);
      })
      .catch(() => {});
  }

  async getAllGifts(opts?: { force?: boolean }): Promise<HubGiftRow[]> {
    if (!this.hubBase) return [];
    const v = await this.fetchCatalogVersion();
    if (
      !opts?.force &&
      this.listCache &&
      Date.now() - this.listCache.at < this.listCacheTtlMs &&
      this.listCache.version === v
    ) {
      return this.listCache.gifts;
    }
    const out: HubGiftRow[] = [];
    const limit = 200;
    let offset = 0;
    for (;;) {
      const r = await fetch(`${this.hubBase}/api/v1/gifts?limit=${limit}&offset=${offset}&sort=name&order=asc`);
      const j = (await r.json()) as { ok?: boolean; gifts?: HubGiftRow[]; giftsCatalogVersion?: number };
      if (!j.ok || !Array.isArray(j.gifts)) break;
      out.push(...j.gifts);
      if (j.gifts.length < limit) break;
      offset += limit;
    }
    this.listCache = { gifts: out, at: Date.now(), version: v };
    return out;
  }

  private async fetchCatalogVersion(): Promise<number> {
    try {
      const r = await fetch(`${this.hubBase}/api/v1/gifts/catalog-version`);
      const j = (await r.json()) as { giftsCatalogVersion?: number };
      return Number(j.giftsCatalogVersion) || 0;
    } catch {
      return 0;
    }
  }

  async getGiftById(id: number, opts?: { force?: boolean }): Promise<HubGiftRow | null> {
    if (!Number.isFinite(id) || id <= 0) return null;
    const c = this.byIdCache.get(id);
    if (!opts?.force && c && Date.now() - c.at < this.listCacheTtlMs) return c.row;
    const r = await fetch(`${this.hubBase}/api/v1/gifts/${encodeURIComponent(String(id))}`);
    const j = (await r.json()) as { ok?: boolean; gift?: HubGiftRow };
    if (!j.ok || !j.gift) return null;
    this.byIdCache.set(id, { row: j.gift, at: Date.now() });
    return j.gift;
  }

  async getGiftByName(name: string, opts?: { force?: boolean }): Promise<HubGiftRow | null> {
    const n = String(name || "").trim().toLowerCase();
    if (!n) return null;
    const all = await this.getAllGifts({ force: opts?.force });
    return all.find((g) => g.name.toLowerCase() === n) ?? all.find((g) => g.name.toLowerCase().includes(n)) ?? null;
  }

  /** Admin API — manuel ekleme (token gerekir). Canlı keşif için `discover-gift` kullanılır. */
  async createGift(
    row: Partial<HubGiftRow> & { tiktok_id: number; name: string; diamond_count?: number; image_file?: string; metadata?: object },
  ): Promise<{ ok: boolean; message?: string }> {
    if (!this.hubBase || !this.adminToken) return { ok: false, message: "admin_token_required" };
    const r = await fetch(`${this.hubBase}/api/v1/gifts`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Accept: "application/json",
        "X-Gemtok-Gift-Admin": this.adminToken,
      },
      body: JSON.stringify({
        tiktok_id: row.tiktok_id,
        name: row.name,
        diamond_count: row.diamond_count ?? 0,
        image_file: row.image_file ?? "",
        metadata: row.metadata ?? {},
      }),
    });
    const j = (await r.json().catch(() => ({}))) as { ok?: boolean; message?: string };
    if (j.ok) this.refreshCache();
    return { ok: !!j.ok, message: j.message };
  }

  async updateGift(
    row: Partial<HubGiftRow> & { tiktok_id: number; name: string; diamond_count?: number; image_file?: string; metadata?: object },
  ): Promise<{ ok: boolean; message?: string }> {
    return this.createGift(row as { tiktok_id: number; name: string });
  }
}

export function getGiftManager(): GiftManager {
  return GiftManager.getInstance();
}
