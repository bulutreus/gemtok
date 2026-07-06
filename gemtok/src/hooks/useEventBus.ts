import { useEffect, useRef } from "react";
import { getEventBus } from "@/services/EventBus";
import type { LiveEventMap, LiveEventName } from "@/types/tiktok";

/**
 * Oyun / bileşen mount olduğunda abone olur, unmount’ta kaldırır (bellek sızıntısı yok).
 */
export function useEventBus<K extends LiveEventName>(
  eventName: K,
  callback: (payload: LiveEventMap[K]) => void
): void {
  const cbRef = useRef(callback);
  cbRef.current = callback;

  useEffect(() => {
    const bus = getEventBus();
    const wrapped = (payload: LiveEventMap[K]) => {
      cbRef.current(payload);
    };
    bus.on(eventName, wrapped);
    return () => {
      bus.off(eventName, wrapped);
    };
  }, [eventName]);
}
