const LS = "gemtok_gift_hub_admin_token";

export function getAdminToken(): string {
  try {
    return localStorage.getItem(LS) || "";
  } catch {
    return "";
  }
}

export function setAdminToken(t: string) {
  try {
    localStorage.setItem(LS, t);
  } catch {}
}

export async function apiGet(path: string): Promise<Response> {
  return fetch(path, { headers: { Accept: "application/json" } });
}

export async function apiWrite(path: string, init: RequestInit): Promise<Response> {
  const token = getAdminToken();
  return fetch(path, {
    ...init,
    headers: {
      Accept: "application/json",
      "Content-Type": "application/json",
      ...(token ? { "X-Gemtok-Gift-Admin": token } : {}),
      ...(init.headers || {}),
    },
  });
}
