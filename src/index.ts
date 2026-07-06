export { EventBus, getEventBus } from "@/services/EventBus";
import { getEventBus as _getEventBus } from "@/services/EventBus";

/** `getEventBus()` ile aynı tekil örnek — dokümantasyondaki `eventBus.on(...)` kullanımı için. */
export const eventBus = _getEventBus();
export { GiftManager, getGiftManager, type HubGiftRow } from "@/services/GiftManager";
export {
  TikTokConnectionManager,
  getTikTokConnectionManager,
  type TikTokConnectionManagerStartOptions,
} from "@/services/TikTokConnectionManager";
export { useEventBus } from "@/hooks/useEventBus";
export { GameEventIntegrationExample } from "@/examples/GameEventIntegration";
export type {
  ChatEvent,
  ConnectionEvent,
  DisconnectEvent,
  FollowEvent,
  GiftEvent,
  GiftManagerDiscoveredEvent,
  LikeEvent,
  LiveEventMap,
  LiveEventName,
  LiveEventPayload,
  MemberEvent,
  ReconnectEvent,
  ShareEvent,
  SubscribeEvent,
  TikTokUserFields,
} from "@/types/tiktok";
