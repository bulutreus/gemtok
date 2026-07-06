/** TikTok-style gift / interaction types */
export type GiftType =
  | "like"
  | "rose"
  | "finger_heart"
  | "rosa"
  | "perfume"
  | "confetti"
  | "donut"
  | "sunglasses"
  | "corgi";

export type WeaponMode =
  | "none"
  | "power_blade"
  | "ultra_blade"
  | "sniper"
  | "minigun"
  | "bomber"
  | "hyper_blade"
  | "god_mode";

export interface LiveUser {
  id: string;
  displayName: string;
  avatarUrl: string;
}

export interface LikeEvent {
  kind: "like";
  user: LiveUser;
}

export interface GiftEvent {
  kind: "gift";
  gift: GiftType;
  user: LiveUser;
  /** Gift count (combo) */
  count: number;
}

export type LiveEvent = LikeEvent | GiftEvent;
