import type { TikfinityNormalizedEvent } from "./normalize";

function asRecord(v: unknown): Record<string, unknown> | null {
  return v != null && typeof v === "object" && !Array.isArray(v)
    ? (v as Record<string, unknown>)
    : null;
}

function firstUrlFromList(x: unknown): string | undefined {
  const o = asRecord(x);
  if (!o) return undefined;
  const ul = o.url_list;
  if (!Array.isArray(ul)) return undefined;
  for (const u of ul) {
    if (typeof u === "string" && u.length > 0) return u;
  }
  return undefined;
}

/** TikTok sayısal hediye id — GemTok köprüsünde çoğunlukla `giftKey`. */
function readGiftKey(m: Record<string, unknown>): number | undefined {
  const raw = m.giftKey ?? m.giftId ?? m.gift_id ?? m.giftID;
  if (typeof raw === "number" && Number.isFinite(raw)) return Math.floor(raw);
  if (typeof raw === "string" && raw.trim() !== "") {
    const p = parseInt(raw, 10);
    if (!Number.isNaN(p) && p > 0) return p;
  }
  return undefined;
}

function readDiamondCount(m: Record<string, unknown>): number | undefined {
  if (typeof m.diamondCount === "number") return m.diamondCount;
  if (typeof m.diamond_count === "number") return m.diamond_count;
  return undefined;
}

function readRepeatCount(m: Record<string, unknown>): number | undefined {
  const candidates = [m.repeatCount, m.repeat_count, m.giftCombo, m.comboCount, m.combo];
  for (const c of candidates) {
    if (typeof c === "number" && Number.isFinite(c) && c > 0) return Math.floor(c);
  }
  return undefined;
}

/** Aktif combo oturumları — kümülatif repeatCount’tan delta kuş sayısı. */
const streakSessions = new Map<string, number>();

function streakKey(userKey: string | undefined, giftId: number | undefined): string {
  return `${userKey ?? ""}#${giftId ?? 0}`;
}

/** Bu olay için fırlatılacak kuş sayısı (0 = yinelenen özet paketi). */
function computeLaunchCount(
  userKey: string | undefined,
  giftId: number | undefined,
  giftType: number | undefined,
  repeatCount: number | undefined,
  repeatEnd: boolean | undefined,
  diamondCount: number | undefined,
): number {
  if (repeatCount != null) {
    const repeat = Math.max(1, Math.min(99, Math.floor(repeatCount)));
    const key = streakKey(userKey, giftId);
    const prev = streakSessions.get(key) ?? 0;

    if (repeatEnd === false) {
      const delta = Math.max(1, repeat - prev);
      streakSessions.set(key, Math.max(prev, repeat));
      return delta;
    }

    if (repeatEnd === true) {
      const delta = Math.max(0, repeat - prev);
      streakSessions.delete(key);
      return delta;
    }

    if (repeat > prev) {
      const delta = repeat - prev;
      streakSessions.set(key, repeat);
      return Math.min(99, delta);
    }

    if (giftType === 1) {
      streakSessions.delete(key);
      return 0;
    }
  }

  streakSessions.delete(streakKey(userKey, giftId));
  return Math.max(1, Math.min(99, diamondCount ?? 1));
}

function readGiftType(m: Record<string, unknown>): number | undefined {
  if (typeof m.giftType === "number") return m.giftType;
  if (typeof m.gift_type === "number") return m.gift_type;
  return undefined;
}

function readRepeatEnd(m: Record<string, unknown>): boolean | undefined {
  if (typeof m.repeatEnd === "boolean") return m.repeatEnd;
  if (typeof m.repeat_end === "boolean") return m.repeat_end;
  return undefined;
}

/**
 * TikFinity / TikTok LIVE hediye payload’undan alanları çıkarır (düz veya giftDetails iç içe).
 */
export function extractGiftFields(
  payload: unknown,
  userKey?: string,
): {
  giftName?: string;
  giftId?: number;
  diamondCount?: number;
  repeatCount?: number;
  giftPictureUrl?: string;
  /** Yinelenen combo özeti — kuş yok */
  skip?: boolean;
  /** Bu olayda fırlatılacak kuş sayısı */
  tokenCount?: number;
} {
  const root = asRecord(payload);
  if (!root) return {};
  const data = asRecord(root.data) ?? root;
  const gd = asRecord(data.giftDetails) ?? {};
  const gm = asRecord(data.giftMessage);
  const gmd = asRecord(gm?.giftDetails) ?? {};
  const m: Record<string, unknown> = { ...root, ...data, ...gd, ...gmd };

  const giftName =
    (typeof m.giftName === "string" && m.giftName) ||
    (typeof m.name === "string" && m.name) ||
    undefined;

  const giftId = readGiftKey(m);
  const diamondCount = readDiamondCount(m);
  const repeatCount = readRepeatCount(m);
  const giftType = readGiftType(m);
  const repeatEnd = readRepeatEnd(m);

  const tokenCount = computeLaunchCount(
    userKey,
    giftId,
    giftType,
    repeatCount,
    repeatEnd,
    diamondCount,
  );
  if (tokenCount <= 0) {
    return { skip: true };
  }

  let giftPictureUrl: string | undefined;
  if (typeof m.giftPictureUrl === "string" && m.giftPictureUrl.length > 0) {
    giftPictureUrl = m.giftPictureUrl;
  } else if (typeof m.giftImageUrl === "string" && m.giftImageUrl.length > 0) {
    giftPictureUrl = m.giftImageUrl;
  } else if (typeof m.imageUrl === "string" && m.imageUrl.length > 0) {
    giftPictureUrl = m.imageUrl;
  } else {
    const gi = asRecord(m.giftImage) ?? asRecord(m.image) ?? asRecord(m.icon);
    giftPictureUrl = firstUrlFromList(gi);
  }

  return { giftName, giftId, diamondCount: tokenCount, repeatCount, giftPictureUrl, tokenCount };
}

export type GameAction =
  | {
      type: "spawnGiftBurst";
      user?: string;
      meta: unknown;
      giftName?: string;
      giftId?: number;
      giftPictureUrl?: string;
      diamondCount?: number;
      repeatCount?: number;
      tokenCount?: number;
      skip?: boolean;
    }
  | { type: "nudgeFromLike"; user?: string; meta: unknown }
  | { type: "celebrateFollow"; user?: string; meta: unknown }
  | { type: "welcomeMember"; user?: string; meta: unknown }
  | { type: "celebrateSubscribe"; user?: string; meta: unknown }
  | { type: "celebrateShare"; user?: string; meta: unknown };

function displayUser(ev: TikfinityNormalizedEvent): string | undefined {
  return ev.user?.nickname || ev.user?.uniqueId;
}

/**
 * TikFinity olaylarını oyun / UI aksiyonlarına çevirir.
 */
export function mapTikfinityEventToAction(ev: TikfinityNormalizedEvent): GameAction {
  const user = displayUser(ev);
  switch (ev.kind) {
    case "gift": {
      const g = extractGiftFields(ev.payload, user);
      return {
        type: "spawnGiftBurst",
        user,
        meta: ev.payload,
        giftName: g.giftName,
        giftId: g.giftId,
        giftPictureUrl: g.giftPictureUrl,
        diamondCount: g.diamondCount,
        repeatCount: g.repeatCount,
        tokenCount: g.tokenCount,
        skip: g.skip,
      };
    }
    case "like":
      return { type: "nudgeFromLike", user, meta: ev.payload };
    case "follow":
      return { type: "celebrateFollow", user, meta: ev.payload };
    case "member":
      return { type: "welcomeMember", user, meta: ev.payload };
    case "subscribe":
      return { type: "celebrateSubscribe", user, meta: ev.payload };
    case "share":
      return { type: "celebrateShare", user, meta: ev.payload };
  }
}

export type ActionSink = (action: GameAction) => void;
