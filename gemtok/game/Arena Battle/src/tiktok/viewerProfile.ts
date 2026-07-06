/**
 * Profile photos in TikTok / TikFinity / Playroom payloads can appear in different nested fields.
 */

function extractHttpUrl(v: unknown): string {
  if (typeof v === "string") {
    const t = v.trim();
    if (t.startsWith("https://") || t.startsWith("http://")) return t;
    return "";
  }
  if (!v || typeof v !== "object") return "";
  const o = v as Record<string, unknown>;
  if (typeof o.url === "string") {
    const t = o.url.trim();
    if (t.startsWith("http")) return t;
  }
  const list = o.url_list ?? o.urlList;
  if (Array.isArray(list)) {
    for (const item of list) {
      const inner = extractHttpUrl(item);
      if (inner) return inner;
    }
  }
  if (Array.isArray(o.url)) {
    for (const item of o.url) {
      const inner = extractHttpUrl(item);
      if (inner) return inner;
    }
  }
  return "";
}

/** First valid http(s) profile URL from the given candidates */
export function pickProfileImageUrl(...candidates: unknown[]): string {
  for (const c of candidates) {
    const u = extractHttpUrl(c);
    if (u) return u;
  }
  return "";
}

/** TikTok / TikFinity / GemTok köprüsü — tüm olası alanlardan profil URL */
export function extractViewerProfileUrl(
  data: Record<string, unknown> | null | undefined,
  user?: Record<string, unknown> | null
): string {
  if (!data || typeof data !== "object") return "";
  const nested =
    user ??
    (data.user && typeof data.user === "object"
      ? (data.user as Record<string, unknown>)
      : data.sender && typeof data.sender === "object"
        ? (data.sender as Record<string, unknown>)
        : data.member && typeof data.member === "object"
          ? (data.member as Record<string, unknown>)
          : null);

  return pickProfileImageUrl(
    data.avatarUrl,
    data.profileUrl,
    data.profilePictureUrl,
    data.profile_picture_url,
    data.profileImage,
    data.userPhotoUrl,
    data.profilePicture,
    data.avatar_thumb,
    data.avatarThumb,
    nested?.profilePictureUrl,
    nested?.avatarUrl,
    nested?.profile_url,
    nested?.profile_picture_url,
    nested?.profilePicture,
    nested?.avatarThumb,
    nested?.avatar_thumb,
    nested?.profilePictureLarge,
    nested?.profilePictureMedium,
    nested?.avatarJpg,
    nested?.userPhotoUrl,
    nested?.profileImage,
    nested?.headUrl,
    nested?.profilePicture ?? data.profilePicture
  );
}

/** Canvas draw: same-origin or anonymous-safe URLs only */
export function avatarImageUseAnonymousCors(url: string): boolean {
  if (!url) return false;
  try {
    if (typeof location !== "undefined" && new URL(url, location.href).origin === location.origin) {
      return true;
    }
  } catch {
    /* ignore */
  }
  return false;
}
