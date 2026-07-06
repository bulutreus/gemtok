export type QueueDrainHandler<T> = (item: T) => void;

/**
 * Gelen mesajları kuyruğa alır; her animasyon karesinde en fazla `maxPerFrame` öğe işler.
 */
export function createRafMessageQueue<T>(options: {
  maxPerFrame: number;
  onItem: QueueDrainHandler<T>;
}): {
  enqueue: (item: T) => void;
  size: () => number;
  flushSync: () => void;
  stop: () => void;
} {
  const queue: T[] = [];
  let scheduled = false;
  let stopped = false;

  const pump = (): void => {
    scheduled = false;
    if (stopped) return;
    const { maxPerFrame, onItem } = options;
    let n = 0;
    while (n < maxPerFrame && queue.length > 0) {
      const item = queue.shift();
      if (item === undefined) break;
      try {
        onItem(item);
      } catch {
        /* uygulama hatası kuyruğu durdurmasın */
      }
      n++;
    }
    if (queue.length > 0 && !stopped) {
      scheduled = true;
      requestAnimationFrame(pump);
    }
  };

  const schedule = (): void => {
    if (stopped || scheduled) return;
    scheduled = true;
    requestAnimationFrame(pump);
  };

  return {
    enqueue(item: T) {
      if (stopped) return;
      queue.push(item);
      schedule();
    },
    size() {
      return queue.length;
    },
    flushSync() {
      while (queue.length > 0) {
        const item = queue.shift();
        if (item === undefined) break;
        options.onItem(item);
      }
    },
    stop() {
      stopped = true;
      queue.length = 0;
    },
  };
}
