import "playroomkit/style.css";
import { insertCoin, onTikTokLiveEvent } from "playroomkit";
import type { TikTokLiveEvent } from "playroomkit";
import type { LiveEvent, LiveUser } from "../types";
import { mapPlayroomGiftToGameGift } from "./playroomGiftMap";
import {
  resetPlayroomTikTokMount,
  PLAYROOM_UI_ATTR,
  PLAYROOM_UI_ACTIVE,
  setAllowPlayroomBootstrapInDom,
  removePlayroomBootstrapShellFromDom,
} from "./playroomReset";
import { extractViewerProfileUrl, pickProfileImageUrl } from "./viewerProfile";

function toLiveUser(d: TikTokLiveEvent["data"], raw?: TikTokLiveEvent): LiveUser {
  const id = d.userId || d.msgId || `anon_${d.t}`;
  const displayName = (d.name || "Viewer").replace(/^@+/, "");
  const extra = (raw ?? {}) as unknown as Record<string, unknown>;
  const photo = extractViewerProfileUrl(
    { ...extra, ...d, user: extra.user },
    (extra.user as Record<string, unknown> | undefined) ?? undefined
  ) || pickProfileImageUrl(d.userPhotoUrl);
  return { id, displayName, avatarUrl: photo };
}

/** Some server payloads put fields on the root instead of inside `data` */
function coerceTikTokEvent(event: TikTokLiveEvent): TikTokLiveEvent {
  if (event.data && typeof event.data === "object") return event;
  const e = event as TikTokLiveEvent & Partial<TikTokLiveEvent["data"]>;
  if (e.userId != null || e.name != null || e.msgId != null || e.giftName != null) {
    const photo = pickProfileImageUrl(
      e.userPhotoUrl,
      (e as Record<string, unknown>).profilePictureUrl,
      (e as Record<string, unknown>).headUrl,
      (e as Record<string, unknown>).profilePicture,
      (e as Record<string, unknown>).avatar_thumb
    );
    return {
      type: event.type,
      data: {
        t: typeof e.t === "number" ? e.t : Date.now(),
        msgId: String(e.msgId ?? ""),
        userId: String(e.userId ?? ""),
        name: String(e.name ?? "Viewer"),
        userPhotoUrl: photo || String(e.userPhotoUrl ?? ""),
        comment: e.comment,
        giftName: e.giftName,
        giftPhotoUrl: e.giftPhotoUrl,
        giftId: e.giftId,
        giftDiamondCount: e.giftDiamondCount,
      },
    };
  }
  return event;
}

/** Playroom TikTokLiveEvent → in-game LiveEvent */
export function mapPlayroomTikTokToLiveEvent(raw: TikTokLiveEvent): LiveEvent | null {
  const event = coerceTikTokEvent(raw);
  const d = event.data;
  if (!d) return null;

  switch (event.type) {
    case "like":
      return { kind: "like", user: toLiveUser(d, event) };
    case "gift":
      return {
        kind: "gift",
        gift: mapPlayroomGiftToGameGift(d),
        user: toLiveUser(d, event),
        count: Math.max(1, d.giftDiamondCount ?? 1),
      };
    case "subscribe":
      return { kind: "like", user: toLiveUser(d, event) };
    case "chat":
    case "streamEnd":
    default:
      return null;
  }
}

export type PlayroomConnectOptions = {
  /** https://docs.joinplayroom.com — `gameId` from the developer dashboard (recommended) */
  gameId?: string;
};

const CONNECT_TIMEOUT_MS = 180_000;

/**
 * [Playroom docs](https://docs.joinplayroom.com/features/integrations/tiktok):
 * `insertCoin` with `liveMode: "tiktok"`, then `onTikTokLiveEvent`.
 */
export async function connectPlayroomTikTok(
  onLive: (e: LiveEvent) => void,
  options: PlayroomConnectOptions = {}
): Promise<() => void> {
  resetPlayroomTikTokMount();
  setAllowPlayroomBootstrapInDom(true);
  document.body.setAttribute(PLAYROOM_UI_ATTR, PLAYROOM_UI_ACTIVE);

  const gid = options.gameId?.trim();
  const init: Parameters<typeof insertCoin>[0] = {
    liveMode: "tiktok",
    ...(gid ? { gameId: gid } : {}),
  };

  try {
    await Promise.race([
      insertCoin(
        init,
        undefined,
        (err) => {
          console.error("[Playroom TikTok] insertCoin error:", err);
        }
      ),
      new Promise<never>((_, rej) =>
        setTimeout(
          () =>
            rej(
              new Error(
                "Timeout: Playroom window did not open or the live stream did not start. Enter your TikTok username and press Launch; go live on TikTok with Mobile gaming. If it persists, refresh and try again."
              )
            ),
          CONNECT_TIMEOUT_MS
        )
      ),
    ]);
  } finally {
    document.body.removeAttribute(PLAYROOM_UI_ATTR);
    setAllowPlayroomBootstrapInDom(false);
    removePlayroomBootstrapShellFromDom();
  }

  const unsub = onTikTokLiveEvent((event) => {
    if (import.meta.env.DEV) console.debug("[Playroom TikTok]", event.type, event);
    const mapped = mapPlayroomTikTokToLiveEvent(event);
    if (mapped) onLive(mapped);
  });

  return () => {
    unsub();
    resetPlayroomTikTokMount();
  };
}
