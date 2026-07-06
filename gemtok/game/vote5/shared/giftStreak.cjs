/**
 * Hediye combo (streak) delta + profil sayısı planı.
 */

const streakSessions = new Map();

function userKeyFromData(data) {
  return String(
    data?.uniqueId ?? data?.userId ?? data?.user?.uniqueId ?? data?.user?.unique_id ?? '',
  ).trim();
}

/** Bu olayda yeni gelen jeton adedi (kümülatif repeatCount farkı). */
function computeGiftRepeatDelta(data, giftId) {
  const giftType = Number(data?.giftType ?? data?.gift_type ?? data?.gift?.gift_type);
  const repeat = Math.max(
    1,
    Number(data?.repeatCount ?? data?.repeat_count ?? data?.gift?.repeat_count) || 1,
  );
  const key = `${userKeyFromData(data)}#${giftId || '?'}`;
  const prev = streakSessions.get(key) ?? 0;

  if (giftType === 1 && data?.repeatEnd === false) {
    const delta = Math.max(1, repeat - prev);
    streakSessions.set(key, Math.max(prev, repeat));
    return delta;
  }
  if (giftType === 1 && data?.repeatEnd === true) {
    const delta = Math.max(1, repeat - prev);
    streakSessions.delete(key);
    return delta;
  }
  if (repeat > prev) {
    const delta = repeat - prev;
    streakSessions.set(key, repeat);
    return delta;
  }
  streakSessions.delete(key);
  return repeat;
}

function giftVisualPlan(diamondPerUnit, deltaRepeat, cfg) {
  const delta = Math.max(1, deltaRepeat || 1);
  const points = diamondPerUnit * delta;
  const smin = cfg?.smallGiftDiamondMin ?? 1;
  const smax = cfg?.smallGiftDiamondMax ?? 99;
  const largeMin = cfg?.largeGiftMinDiamonds ?? 100;

  if (diamondPerUnit >= largeMin) {
    const mult = cfg?.scaleAvatarsWithRepeat === true ? delta : 1;
    return { size: 'large', count: Math.min(20, 2 * mult), points };
  }
  if (diamondPerUnit >= smin && diamondPerUnit <= smax) {
    return { size: 'small', count: Math.min(40, delta), points };
  }
  return null;
}

module.exports = {
  computeGiftRepeatDelta,
  giftVisualPlan,
  userKeyFromData,
};
