type GiftRow = {
  tiktok_id: number;
  name: string;
  diamond_count: number;
  imageUrl: string | null;
  discoveredImageUrl?: string | null;
  first_seen?: string | null;
  last_seen?: string | null;
  category?: string;
  active?: boolean;
};

type ActionRow = { action_key: string; label: string };

function fmtTs(s: string | null | undefined): string {
  if (!s) return "—";
  const t = Date.parse(s);
  if (!Number.isFinite(t)) return String(s).slice(0, 19);
  try {
    return new Date(t).toLocaleString(undefined, { dateStyle: "short", timeStyle: "short" });
  } catch {
    return String(s).slice(0, 19);
  }
}

export function GiftImageThumb(props: { src: string | null; alt: string }) {
  if (!props.src) {
    return (
      <div
        style={{
          width: 40,
          height: 40,
          borderRadius: 8,
          background: "rgba(0,0,0,0.35)",
          border: "1px solid var(--border)",
        }}
      />
    );
  }
  return (
    <img
      src={props.src}
      alt={props.alt}
      width={40}
      height={40}
      loading="lazy"
      style={{ borderRadius: 8, objectFit: "cover", border: "1px solid var(--border)" }}
    />
  );
}

export function ActionSelect(props: {
  actions: ActionRow[];
  value: string;
  disabled?: boolean;
  onChange: (actionKey: string) => void;
}) {
  return (
    <select
      disabled={props.disabled}
      value={props.value}
      onChange={(e) => props.onChange(e.target.value)}
      style={{
        width: "100%",
        maxWidth: 280,
        padding: "8px 10px",
        borderRadius: 8,
        border: "1px solid var(--border)",
        background: "rgba(2,8,23,0.85)",
        color: "var(--text)",
      }}
    >
      <option value="">— Eşleme yok —</option>
      {props.actions.map((a) => (
        <option key={a.action_key} value={a.action_key}>
          {a.label} ({a.action_key})
        </option>
      ))}
    </select>
  );
}

export function GiftMappingTable(props: {
  gifts: GiftRow[];
  actions: ActionRow[];
  mappingByGift: Map<number, string>;
  busyId: number | null;
  onAssign: (giftId: number, actionKey: string) => void;
  hideActions?: boolean;
}) {
  return (
    <div style={{ overflowX: "auto", borderRadius: "var(--radius)", border: "1px solid var(--border)" }}>
      <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
        <thead>
          <tr style={{ background: "var(--panel)", textAlign: "left" }}>
            <th style={{ padding: 10, width: 52 }}></th>
            <th style={{ padding: 10 }}>Hediye</th>
            <th style={{ padding: 10, width: 100 }}>Kod</th>
            <th style={{ padding: 10, width: 72 }}>Jeton</th>
            <th style={{ padding: 10, minWidth: 90 }}>Kategori</th>
            <th style={{ padding: 10, minWidth: 120 }}>Son görülme</th>
            <th style={{ padding: 10, width: 72 }}>Aktif</th>
            {props.hideActions ? <th style={{ padding: 10, minWidth: 56 }}>Keşif</th> : null}
            {props.hideActions ? null : <th style={{ padding: 10 }}>Oyun aksiyonu</th>}
          </tr>
        </thead>
        <tbody>
          {props.gifts.map((g) => {
            const cur = props.mappingByGift.get(g.tiktok_id) || "";
            const active = g.active !== false;
            return (
              <tr key={g.tiktok_id} style={{ borderTop: "1px solid rgba(10,61,89,0.5)" }}>
                <td style={{ padding: 8 }}>
                  <GiftImageThumb src={g.imageUrl || g.discoveredImageUrl || null} alt={g.name} />
                </td>
                <td style={{ padding: 8, color: "var(--text)" }}>{g.name}</td>
                <td style={{ padding: 8, fontFamily: "monospace", color: "var(--muted)" }}>{g.tiktok_id}</td>
                <td style={{ padding: 8, color: "var(--muted)" }}>{g.diamond_count}</td>
                <td style={{ padding: 8, color: "var(--muted)", fontSize: 12 }}>{g.category?.trim() ? g.category : "—"}</td>
                <td style={{ padding: 8, color: "var(--muted)", fontSize: 12 }}>{fmtTs(g.last_seen)}</td>
                <td style={{ padding: 8, fontSize: 12, color: active ? "var(--accent)" : "#f87171" }}>
                  {active ? "Evet" : "Hayır"}
                </td>
                {props.hideActions ? (
                  <td style={{ padding: 8, color: "var(--muted)", fontSize: 11 }}>
                    {g.discoveredImageUrl ? (
                      <a href={g.discoveredImageUrl} target="_blank" rel="noreferrer" style={{ color: "var(--accent)" }}>
                        CDN
                      </a>
                    ) : (
                      "—"
                    )}
                  </td>
                ) : null}
                {props.hideActions ? null : (
                  <td style={{ padding: 8 }}>
                    <ActionSelect
                      actions={props.actions}
                      value={cur}
                      disabled={props.busyId === g.tiktok_id}
                      onChange={(key) => props.onAssign(g.tiktok_id, key)}
                    />
                  </td>
                )}
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
