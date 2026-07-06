/**
 * Bellek içi TikTok Live köprü durumu (localhost Gift Hub).
 * Tarayıcıdan gelen heartbeat + discover hız sınırı.
 */

let lastHeartbeat = null;
/** @type {Map<string, number[]>} ip -> zaman damgaları (ms) */
const discoverHits = new Map();

export function recordHeartbeat(body) {
  lastHeartbeat = {
    ...body,
    serverReceivedAt: new Date().toISOString(),
  };
}

export function getLastHeartbeat() {
  return lastHeartbeat;
}

const DISCOVER_WINDOW_MS = 60_000;
const DISCOVER_MAX_PER_WINDOW = 120;

export function allowDiscover(ip) {
  const key = String(ip || "unknown").slice(0, 64);
  const now = Date.now();
  let arr = discoverHits.get(key) || [];
  arr = arr.filter((t) => now - t < DISCOVER_WINDOW_MS);
  if (arr.length >= DISCOVER_MAX_PER_WINDOW) return false;
  arr.push(now);
  discoverHits.set(key, arr);
  return true;
}
