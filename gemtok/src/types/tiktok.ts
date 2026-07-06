/**
 * GemTok TikTok Live — EventBus için güçlü tipler (TikFinity → payload eşlemesi).
 */

export type TikTokTeam = string | undefined;

/** TikFinity / istemci tarafından gelen kullanıcı alanları (payload’lar gevşek olabilir). */
export interface TikTokUserFields {
  userId?: string;
  nickname?: string;
  avatarUrl?: string;
  team?: TikTokTeam;
  user?: unknown;
}

export interface GiftEvent extends TikTokUserFields {
  type: "gift";
  /** TikTok hediye kimliği (sayısal). */
  giftKey?: string | number;
  /** TikFinity slug / kısa kod (ör. rose). */
  giftId?: string;
  /** İnsan okunur ad (TikFinity giftName). */
  giftName?: string;
  /** CDN veya ikon URL (TikFinity). */
  giftImageUrl?: string;
  diamondCount?: number;
  [key: string]: unknown;
}

export interface LikeEvent extends TikTokUserFields {
  type: "like";
  likeCount?: number;
  [key: string]: unknown;
}

export interface FollowEvent extends TikTokUserFields {
  type: "follow";
  [key: string]: unknown;
}

export interface ShareEvent extends TikTokUserFields {
  type: "share";
  [key: string]: unknown;
}

export interface MemberEvent extends TikTokUserFields {
  type: "member";
  [key: string]: unknown;
}

export interface SubscribeEvent extends TikTokUserFields {
  type: "subscribe";
  [key: string]: unknown;
}

/** gift/like/... dışındaki ham olaylar (join_pick, lane_pick vb.) */
export interface ChatEvent {
  type: string;
  [key: string]: unknown;
}

export interface ConnectionEvent {
  state: "connected";
  url?: string;
  leader?: boolean;
}

export interface DisconnectEvent {
  state: "disconnected" | "disabled_by_url" | "invalid_url" | "error";
  url?: string;
  leader?: boolean;
  message?: string;
}

export interface ReconnectEvent {
  state: "reconnecting";
  url?: string;
  leader?: boolean;
}

/** Gift Hub canlı keşif sonrası (EventBus üzerinden UI / oyun güncellemesi). */
export interface GiftManagerDiscoveredEvent {
  tiktokId: number;
  name: string;
  diamondCount: number;
  source: "live";
  giftsCatalogVersion?: number;
}

export interface LiveEventMap {
  gift: GiftEvent;
  like: LikeEvent;
  follow: FollowEvent;
  share: ShareEvent;
  member: MemberEvent;
  subscribe: SubscribeEvent;
  chat: ChatEvent;
  connection: ConnectionEvent;
  disconnect: DisconnectEvent;
  reconnect: ReconnectEvent;
  "giftmanager:discovered": GiftManagerDiscoveredEvent;
}

export type LiveEventName = keyof LiveEventMap;

export type LiveEventPayload<K extends LiveEventName> = LiveEventMap[K];
