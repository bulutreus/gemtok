import { TEAM_COUNT } from "./assets";
import { giftById, normGiftName } from "./tiktokGiftsCatalog";

/** Varsayılan takım → TikTok hediye id (Rose, Hearts, Lion, Perfume, Finger Heart, Blue Bead) — tam katalogdaki id’ler */
export const DEFAULT_TEAM_GIFT_IDS: readonly number[] = [5655, 5586, 6369, 5658, 5487, 5319];

function hashUserToTeam(userKey: string | undefined): number {
  const u = userKey ?? "";
  let h = 2166136261;
  for (let i = 0; i < u.length; i++) h = Math.imul(h ^ u.charCodeAt(i), 16777619);
  return Math.abs(h) % TEAM_COUNT;
}

function hashGiftNameToTeam(giftName: string): number {
  const gn = normGiftName(giftName);
  let h = 0;
  for (let i = 0; i < gn.length; i++) h = (h * 31 + gn.charCodeAt(i)) >>> 0;
  return h % TEAM_COUNT;
}

/**
 * TikTok hediyesini, ayarlarda her takıma atanan hediye id’sine göre takıma (0..TEAM_COUNT-1) eşler.
 * Önce giftId, sonra tam / kısmi isim eşleşmesi; yoksa hediye adı hash’i.
 */
export function teamFromGiftAssignment(
  giftName: string | undefined,
  giftId: number | undefined,
  userKey: string | undefined,
  teamGiftIds: readonly number[],
): number {
  const n = Math.min(teamGiftIds.length, TEAM_COUNT);
  const validId = giftId != null && Number.isFinite(giftId) ? Math.floor(giftId) : undefined;
  if (validId != null) {
    for (let i = 0; i < n; i++) {
      if (teamGiftIds[i] === validId) return i;
    }
  }
  const gn = normGiftName(giftName);
  if (gn.length > 0) {
    for (let i = 0; i < n; i++) {
      const g = giftById(teamGiftIds[i]!);
      if (g && normGiftName(g.name) === gn) return i;
    }
    for (let i = 0; i < n; i++) {
      const g = giftById(teamGiftIds[i]!);
      if (!g) continue;
      const cn = normGiftName(g.name);
      if (cn.length > 0 && (gn.includes(cn) || cn.includes(gn))) return i;
    }
    return hashGiftNameToTeam(giftName ?? "");
  }
  return hashUserToTeam(userKey);
}

/** Manuel sapan seçimi için kısa etiketler */
export const TEAM_SLOT_LABELS = ["Takım 1", "Takım 2", "Takım 3", "Takım 4", "Takım 5", "Takım 6"] as const;
