import type { GiftType, LiveEvent, LiveUser } from "../types";

const NAMES = [
  "Dalysi",
  "ADAM",
  "Cody",
  "Mira",
  "Alex",
  "Jordan",
  "Nova",
  "Echo",
  "Luna",
  "Rex",
];

const GIFTS: GiftType[] = [
  "rose",
  "finger_heart",
  "rosa",
  "perfume",
  "confetti",
  "donut",
  "sunglasses",
  "corgi",
];

let uid = 0;
function randomUser(): LiveUser {
  uid += 1;
  const name = NAMES[Math.floor(Math.random() * NAMES.length)]!;
  const id = `u_${uid}`;
  return {
    id,
    displayName: `${name}_${uid % 100}`,
    avatarUrl: "",
  };
}

export type EventHandler = (e: LiveEvent) => void;

/** Dev helper: emits random TikTok-like events */
export function startMockStream(onEvent: EventHandler, intervalMs = 1400): () => void {
  let t: ReturnType<typeof setInterval>;
  t = setInterval(() => {
    const roll = Math.random();
    if (roll < 0.45) {
      onEvent({ kind: "like", user: randomUser() });
    } else {
      const gift = GIFTS[Math.floor(Math.random() * GIFTS.length)]!;
      onEvent({
        kind: "gift",
        gift,
        user: randomUser(),
        count: Math.random() < 0.2 ? 1 + Math.floor(Math.random() * 4) : 1,
      });
    }
  }, intervalMs);
  return () => clearInterval(t);
}
