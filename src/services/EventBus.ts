import type { LiveEventMap, LiveEventName, LiveEventPayload } from "@/types/tiktok";

type AnyHandler = (payload: unknown) => void;

export class EventBus {
  private static instance: EventBus | null = null;

  /** Aynı callback yalnızca bir kez kayıtlı olur (referans eşitliği). */
  private readonly listeners = new Map<LiveEventName, Map<AnyHandler, AnyHandler>>();

  static getInstance(): EventBus {
    if (!EventBus.instance) EventBus.instance = new EventBus();
    return EventBus.instance;
  }

  on<K extends LiveEventName>(eventName: K, callback: (payload: LiveEventPayload<K>) => void): void {
    let bucket = this.listeners.get(eventName);
    if (!bucket) {
      bucket = new Map();
      this.listeners.set(eventName, bucket);
    }
    const fn = callback as AnyHandler;
    if (bucket.has(fn)) return;
    bucket.set(fn, fn);
  }

  off<K extends LiveEventName>(eventName: K, callback: (payload: LiveEventPayload<K>) => void): void {
    const bucket = this.listeners.get(eventName);
    if (!bucket) return;
    bucket.delete(callback as AnyHandler);
    if (bucket.size === 0) this.listeners.delete(eventName);
  }

  once<K extends LiveEventName>(eventName: K, callback: (payload: LiveEventPayload<K>) => void): void {
    const wrapped = ((payload: LiveEventPayload<K>) => {
      this.off(eventName, wrapped as (p: LiveEventPayload<K>) => void);
      callback(payload);
    }) as (payload: LiveEventPayload<K>) => void;
    this.on(eventName, wrapped);
  }

  emit<K extends LiveEventName>(eventName: K, payload: LiveEventPayload<K>): void {
    const bucket = this.listeners.get(eventName);
    if (!bucket || bucket.size === 0) return;
    const snapshot = Array.from(bucket.values());
    for (const fn of snapshot) {
      try {
        fn(payload as unknown);
      } catch {
        /* oyun hatası bus’u düşürmemeli */
      }
    }
  }

  clear(eventName: LiveEventName): void {
    this.listeners.delete(eventName);
  }

  clearAll(): void {
    this.listeners.clear();
  }
}

export function getEventBus(): EventBus {
  return EventBus.getInstance();
}
