/**
 * TikTok LIVE — tam hediye kataloğu (`src/data/tiktok-gifts-full.json`).
 * TikTok webcast `/gift/list` ile üretilir: `npm run refresh-tiktok-gifts`
 * Yayında TikFinity `giftPictureUrl` gönderirse HUD önce onu kullanır.
 */
import giftsBundle from "../data/tiktok-gifts-full.json";

export type TiktokGiftEntry = {
  id: number;
  name: string;
  diamonds: number;
  /** Küçük panel ikonu */
  icon: string;
};

const RAW_GIFTS: readonly TiktokGiftEntry[] = (giftsBundle as { gifts: TiktokGiftEntry[] }).gifts;

export const TIKTOK_LIVE_GIFTS: readonly TiktokGiftEntry[] = Object.freeze(
  [...RAW_GIFTS].sort((a, b) => {
    if (a.diamonds !== b.diamonds) return a.diamonds - b.diamonds;
    return a.name.localeCompare(b.name, "en");
  }),
);

const byIdLookup = new Map<number, TiktokGiftEntry>();
for (const g of TIKTOK_LIVE_GIFTS) {
  byIdLookup.set(g.id, g);
}

export function giftById(id: number): TiktokGiftEntry | undefined {
  return byIdLookup.get(id);
}

export function normGiftName(s: string | undefined): string {
  return (s ?? "")
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/\p{M}/gu, "");
}

export function giftsSortedByName(): TiktokGiftEntry[] {
  return [...TIKTOK_LIVE_GIFTS].sort((a, b) => {
    if (a.diamonds !== b.diamonds) return a.diamonds - b.diamonds;
    return a.name.localeCompare(b.name, "en");
  });
}

/** Yalnızca 1 elmaslık hediyeler */
export function giftsOneDiamond(): TiktokGiftEntry[] {
  return TIKTOK_LIVE_GIFTS.filter((g) => g.diamonds === 1).sort((a, b) => a.name.localeCompare(b.name, "en"));
}

/** Katalog dosyasının üretim zamanı (ISO) */
export function tiktokCatalogFetchedAt(): string | undefined {
  const t = (giftsBundle as { fetchedAt?: string }).fetchedAt;
  return typeof t === "string" ? t : undefined;
}
