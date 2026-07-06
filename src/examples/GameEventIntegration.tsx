import { useEffect, useState } from "react";
import { useEventBus } from "@/hooks/useEventBus";
import type { FollowEvent, GiftEvent, LikeEvent } from "@/types/tiktok";

/**
 * Örnek: WebSocket veya TikFinity kodu yok; yalnızca EventBus aboneliği.
 * Gerçek oyunda bu bileşen yerine `useEventBus` doğrudan kullanılabilir.
 */
export function GameEventIntegrationExample(): JSX.Element {
  const [lastGift, setLastGift] = useState<string>("—");
  const [likes, setLikes] = useState(0);
  const [follows, setFollows] = useState(0);

  useEventBus("gift", (g: GiftEvent) => {
    const label = String(g.giftId ?? g.giftKey ?? "gift");
    setLastGift(label);
  });

  useEventBus("like", (_l: LikeEvent) => {
    setLikes((n) => n + 1);
  });

  useEventBus("follow", (_f: FollowEvent) => {
    setFollows((n) => n + 1);
  });

  useEffect(() => {
    console.info("[GemTok örnek oyun] EventBus hazır; TikFinity bağlantısı TikTokConnectionManager’da.");
  }, []);

  return (
    <div
      style={{
        fontFamily: "system-ui,sans-serif",
        fontSize: 13,
        padding: 12,
        borderRadius: 10,
        background: "rgba(15,30,55,0.85)",
        color: "#e2e8f0",
        border: "1px solid rgba(0,212,255,0.25)",
        maxWidth: 360,
      }}
    >
      <div style={{ fontWeight: 700, color: "#7dd3fc", marginBottom: 8 }}>Örnek oyun (EventBus)</div>
      <div>Son hediye: {lastGift}</div>
      <div>Like (sayım): {likes}</div>
      <div>Takip: {follows}</div>
    </div>
  );
}
