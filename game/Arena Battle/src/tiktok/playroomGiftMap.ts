import type { GiftType } from "../types";

/** Playroom TikTokLiveEvent.data — giftName / giftId come from the platform (language may vary) */
export function mapPlayroomGiftToGameGift(data: {
  giftName?: string;
  giftId?: string;
}): GiftType {
  const raw = `${data.giftId ?? ""} ${data.giftName ?? ""}`.toLowerCase();

  const has = (s: string) => raw.includes(s);

  if (has("corgi") || has("köpek")) return "corgi";
  if (has("donut") || has("doughnut") || has("çörek")) return "donut";
  if (has("confetti") || has("konfeti")) return "confetti";
  if (has("perfume") || has("parfüm") || has("perf")) return "perfume";
  if (has("sunglass") || has("glass") || has("gözlük")) return "sunglasses";
  if (has("rosa") || has("pink rose") || has("pembe gül")) return "rosa";
  if (has("finger") || has("kalp") || has("heart") || has("heartme")) return "finger_heart";
  if (has("rose") && !has("pink")) return "rose";

  return "rose";
}
