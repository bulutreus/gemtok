import { useEffect } from "react";
import { useLiveStatusStore } from "../stores/liveStatusStore";

export function ConnectionPanel() {
  const heartbeat = useLiveStatusStore((s) => s.heartbeat);
  const err = useLiveStatusStore((s) => s.err);
  const fetchStatus = useLiveStatusStore((s) => s.fetchStatus);

  useEffect(() => {
    fetchStatus();
    const id = window.setInterval(() => {
      fetchStatus();
    }, 2000);
    return () => window.clearInterval(id);
  }, [fetchStatus]);

  const st = heartbeat?.state || "—";
  const url = heartbeat?.url || "—";
  const lastEv = heartbeat?.last_event_type || "—";
  const at = heartbeat?.last_event_at || heartbeat?.serverReceivedAt || "—";

  return (
    <section
      style={{
        padding: 16,
        marginBottom: 16,
        borderRadius: "var(--radius)",
        border: "1px solid var(--border)",
        background: "var(--panel)",
      }}
    >
      <h2 style={{ margin: "0 0 12px", fontSize: 15, color: "var(--text)" }}>TikFinity köprü durumu</h2>
      <p style={{ margin: "0 0 8px", fontSize: 13, color: "var(--muted)" }}>
        Ana sayfa (<code style={{ color: "var(--accent)" }}>sira/index.html</code>) açıkken tarayıcı buraya durum gönderir. TikFinity:{" "}
        <code style={{ color: "var(--accent)" }}>ws://127.0.0.1:21213</code> (veya{" "}
        <code style={{ color: "var(--accent)" }}>localStorage.tikfinity_url</code> / <code>gemtok_tikfinity_ws_url</code>).
      </p>
      <dl style={{ margin: 0, display: "grid", gap: 8, fontSize: 13 }}>
        <div>
          <dt style={{ color: "var(--muted)", display: "inline" }}>Durum: </dt>
          <dd style={{ display: "inline", color: "var(--text)", fontWeight: 600 }}>{st}</dd>
        </div>
        <div>
          <dt style={{ color: "var(--muted)", display: "inline" }}>URL: </dt>
          <dd style={{ display: "inline", wordBreak: "break-all" }}>{url}</dd>
        </div>
        <div>
          <dt style={{ color: "var(--muted)", display: "inline" }}>Son olay: </dt>
          <dd style={{ display: "inline" }}>{lastEv}</dd>
        </div>
        <div>
          <dt style={{ color: "var(--muted)", display: "inline" }}>Zaman: </dt>
          <dd style={{ display: "inline" }}>{at}</dd>
        </div>
      </dl>
      {err ? <p style={{ color: "#f87171", fontSize: 12, marginTop: 10 }}>{err}</p> : null}
      <p style={{ margin: "14px 0 0", fontSize: 12, color: "var(--muted)" }}>
        Yeniden bağlanmak için ana sayfadaki küçük panelden «Yeniden bağlan» kullanın veya TikFinity’yi kontrol edin. Otomatik bağlantıyı kapatma:{" "}
        <code>?autoconnect=false</code> veya <code>?tikfinity=0</code>.
      </p>
    </section>
  );
}
