/** Varsayılan TikFinity yerel WebSocket adresi */
export const DEFAULT_TIKFINITY_WS_URL = "ws://127.0.0.1:21213";

/** localStorage anahtarı (kullanıcı tarafından ayarlanabilir URL) */
export const STORAGE_KEY_WS_URL = "countrybirds.tikfinity.wsUrl";

const AUTCONNECT_FALSE = new Set(["0", "false", "no", "off"]);

/**
 * Öncelik: localStorage → import.meta.env.VITE_TIKFINITY_WS_URL → varsayılan
 */
export function resolveTikfinityWsUrl(): string {
  try {
    const fromStorage = localStorage.getItem(STORAGE_KEY_WS_URL)?.trim();
    if (fromStorage) return fromStorage;
  } catch {
    /* private mode vb. */
  }

  const fromEnv = import.meta.env.VITE_TIKFINITY_WS_URL as string | undefined;
  if (fromEnv?.trim()) return fromEnv.trim();

  return DEFAULT_TIKFINITY_WS_URL;
}

export function persistTikfinityWsUrl(url: string): void {
  try {
    localStorage.setItem(STORAGE_KEY_WS_URL, url.trim());
  } catch {
    /* ignore */
  }
}

/**
 * URL parametreleri ile otomatik bağlantıyı kapat:
 * - tikfinityAutoconnect=false | 0 | no | off
 * - noTikfinityAutoconnect=1 | true
 */
export function shouldAutoConnectFromSearch(search: string): boolean {
  const params = new URLSearchParams(search);
  const explicit = params.get("tikfinityAutoconnect");
  if (explicit != null && AUTCONNECT_FALSE.has(explicit.trim().toLowerCase())) {
    return false;
  }
  const noAuto = params.get("noTikfinityAutoconnect");
  if (noAuto != null) {
    const v = noAuto.trim().toLowerCase();
    if (v === "1" || v === "true" || v === "yes" || v === "on") return false;
  }
  return true;
}
