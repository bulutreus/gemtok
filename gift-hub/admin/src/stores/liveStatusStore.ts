import { create } from "zustand";

export type LiveHeartbeat = {
  client_id?: string;
  state?: string;
  url?: string;
  last_event_type?: string;
  last_event_at?: string;
  serverReceivedAt?: string;
} | null;

type LiveState = {
  heartbeat: LiveHeartbeat;
  err: string | null;
  fetchStatus: () => Promise<void>;
};

export const useLiveStatusStore = create<LiveState>((set) => ({
  heartbeat: null,
  err: null,
  async fetchStatus() {
    try {
      const r = await fetch("/api/v1/live/status");
      const j = await r.json();
      if (!j.ok) throw new Error("status");
      set({ heartbeat: j.heartbeat ?? null, err: null });
    } catch {
      set({ err: "Durum okunamadı (Gift Hub çalışıyor mu?)" });
    }
  },
}));
