export type TikfinityEventKind =
  | "gift"
  | "like"
  | "follow"
  | "member"
  | "subscribe"
  | "share";

export type TikfinityUser = {
  uniqueId?: string;
  nickname?: string;
};

export type TikfinityNormalizedEvent = {
  kind: TikfinityEventKind;
  rawEvent: string;
  user?: TikfinityUser;
  /** Orijinal parse edilmiş mesaj (oyun mantığı için) */
  payload: unknown;
};

function asRecord(v: unknown): Record<string, unknown> | null {
  return v != null && typeof v === "object" && !Array.isArray(v)
    ? (v as Record<string, unknown>)
    : null;
}

function readUser(data: Record<string, unknown>): TikfinityUser | undefined {
  const u = asRecord(data.user);
  if (!u) return undefined;
  return {
    uniqueId: typeof u.uniqueId === "string" ? u.uniqueId : undefined,
    nickname: typeof u.nickname === "string" ? u.nickname : undefined,
  };
}

function normEventName(s: string): string {
  return s.trim().toLowerCase();
}

/**
 * TikFinity / benzeri servislerden gelen JSON’u tek şemaya indirger.
 * Bilinen şekiller: { event, data }, { type }, social + data.action
 */
export function normalizeTikfinityMessage(raw: unknown): TikfinityNormalizedEvent | null {
  const root = asRecord(raw);
  if (!root) return null;

  let eventName =
    (typeof root.event === "string" && root.event) ||
    (typeof root.type === "string" && root.type) ||
    (typeof root.name === "string" && root.name) ||
    "";

  const data = asRecord(root.data) ?? root;
  eventName = normEventName(eventName);

  if (!eventName && typeof data.action === "string") {
    eventName = normEventName(data.action as string);
  }

  if (eventName === "social") {
    const action = typeof data.action === "string" ? normEventName(data.action) : "";
    if (action === "follow" || action === "share") {
      eventName = action;
    }
  }

  const map: Record<string, TikfinityEventKind | undefined> = {
    gift: "gift",
    like: "like",
    follow: "follow",
    member: "member",
    membermessage: "member",
    join: "member",
    roomenter: "member",
    subscribe: "subscribe",
    subscription: "subscribe",
    share: "share",
  };

  const kind = map[eventName];
  if (!kind) return null;

  return {
    kind,
    rawEvent: eventName,
    user: readUser(data),
    payload: raw,
  };
}

/** GemTok merkezi köprüsünün düz payload’ı (`type: gift|like|…`, `gemtok-tikfinity-client`). */
export function normalizeGemTokFlatPayload(p: unknown): TikfinityNormalizedEvent | null {
  const root = asRecord(p);
  if (!root) return null;
  const t = typeof root.type === "string" ? normEventName(root.type) : "";
  if (!t) return null;
  const data = asRecord(root.data) ?? root;
  const map: Record<string, TikfinityEventKind | undefined> = {
    gift: "gift",
    like: "like",
    follow: "follow",
    member: "member",
    join: "member",
    subscribe: "subscribe",
    subscription: "subscribe",
    share: "share",
  };
  const kind = map[t];
  if (!kind) return null;
  return {
    kind,
    rawEvent: t,
    user: readUser(data) ?? readUser(root),
    payload: p,
  };
}
