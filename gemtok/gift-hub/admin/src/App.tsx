import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { apiGet, apiWrite, getAdminToken, setAdminToken } from "./api";
import { ThemeShell } from "./components/ThemeShell";
import { GiftMappingTable } from "./components/GiftMappingTable";
import { ConnectionPanel } from "./components/ConnectionPanel";

type Game = { game_id: string; display_name: string };
type ActionRow = { action_key: string; label: string };
type Gift = {
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

type GiftSort = "name" | "diamond" | "last_seen" | "first_seen";

type AdminTab = "connection" | "gifts" | "mappings";

export default function App() {
  const [tab, setTab] = useState<AdminTab>("mappings");
  const [tokenIn, setTokenIn] = useState(getAdminToken());
  const [games, setGames] = useState<Game[]>([]);
  const [gameId, setGameId] = useState("");
  const [actions, setActions] = useState<ActionRow[]>([]);
  const [gifts, setGifts] = useState<Gift[]>([]);
  const [search, setSearch] = useState("");
  const [offset, setOffset] = useState(0);
  const [totalApprox, setTotalApprox] = useState(0);
  const [sortBy, setSortBy] = useState<GiftSort>("name");
  const [sortOrder, setSortOrder] = useState<"asc" | "desc">("asc");
  const [activeFilter, setActiveFilter] = useState<"all" | "1" | "0">("all");
  const catalogVerRef = useRef<number | null>(null);
  const [mappingByGift, setMappingByGift] = useState<Map<number, string>>(new Map());
  const [busyId, setBusyId] = useState<number | null>(null);
  const [msg, setMsg] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);

  const limit = 40;

  const loadGames = useCallback(async () => {
    const r = await apiGet("/api/v1/games");
    const j = await r.json();
    if (!j.ok) throw new Error("games");
    setGames(j.games || []);
    setGameId((cur) => cur || (j.games?.[0]?.game_id ?? ""));
  }, []);

  const loadActions = useCallback(async (gid: string) => {
    if (!gid) return;
    const r = await apiGet(`/api/v1/games/${encodeURIComponent(gid)}/actions`);
    const j = await r.json();
    if (!j.ok) throw new Error("actions");
    setActions(j.actions || []);
  }, []);

  const loadMappings = useCallback(async (gid: string) => {
    if (!gid) return;
    const r = await apiGet(`/api/v1/games/${encodeURIComponent(gid)}/mappings-only`);
    const j = await r.json();
    if (!j.ok) throw new Error("mappings");
    const m = new Map<number, string>();
    for (const row of j.mappings || []) {
      m.set(row.gift_tiktok_id, row.action_key);
    }
    setMappingByGift(m);
  }, []);

  const loadGifts = useCallback(async () => {
    const q = new URLSearchParams();
    q.set("limit", String(limit));
    q.set("offset", String(offset));
    if (search.trim()) q.set("search", search.trim());
    q.set("sort", sortBy);
    q.set("order", sortOrder);
    q.set("active", activeFilter);
    const r = await apiGet(`/api/v1/gifts?${q.toString()}`);
    const j = await r.json();
    if (!j.ok) throw new Error("gifts");
    setGifts(j.gifts || []);
    setTotalApprox(j.totalApprox || 0);
    if (typeof j.giftsCatalogVersion === "number") {
      catalogVerRef.current = j.giftsCatalogVersion;
    }
  }, [offset, search, sortBy, sortOrder, activeFilter]);

  useEffect(() => {
    loadGames().catch((e) => setErr(String(e.message || e)));
  }, [loadGames]);

  useEffect(() => {
    if (!gameId) return;
    setErr(null);
    Promise.all([loadActions(gameId), loadMappings(gameId)]).catch((e) => setErr(String(e.message || e)));
  }, [gameId, loadActions, loadMappings]);

  useEffect(() => {
    setErr(null);
    loadGifts().catch((e) => setErr(String(e.message || e)));
  }, [loadGifts]);

  /** Canlı keşif / senkron sonrası katalog sürümü değişince listeyi yenile */
  useEffect(() => {
    if (tab !== "gifts" && tab !== "mappings") return;
    const id = window.setInterval(async () => {
      try {
        const r = await apiGet("/api/v1/gifts/catalog-version");
        const j = await r.json();
        if (!j.ok || typeof j.giftsCatalogVersion !== "number") return;
        const v = j.giftsCatalogVersion;
        const prev = catalogVerRef.current;
        if (prev !== null && v !== prev) {
          catalogVerRef.current = v;
          await loadGifts();
        } else {
          catalogVerRef.current = v;
        }
      } catch {
        /* ignore */
      }
    }, 4000);
    return () => clearInterval(id);
  }, [tab, loadGifts]);

  const onSaveToken = () => {
    setAdminToken(tokenIn.trim());
    setMsg("Anahtar tarayıcıda saklandı (yalnızca bu cihaz).");
    setTimeout(() => setMsg(null), 2500);
  };

  const onSyncJson = async () => {
    setErr(null);
    const r = await apiWrite("/api/v1/sync/gift-list-json", { method: "POST", body: "{}" });
    const j = await r.json().catch(() => ({}));
    if (!r.ok) {
      setErr(j.message || "Senkron başarısız (admin anahtarı gerekli).");
      return;
    }
    setMsg(`gift-list.json senkron: ${JSON.stringify(j)}`);
    await loadGifts();
  };

  const onAssign = async (giftTiktokId: number, actionKey: string) => {
    if (!gameId) return;
    setBusyId(giftTiktokId);
    setErr(null);
    try {
      if (!actionKey) {
        const r = await apiWrite(`/api/v1/games/${encodeURIComponent(gameId)}/mappings/${giftTiktokId}`, {
          method: "DELETE",
        });
        if (!r.ok) {
          const j = await r.json().catch(() => ({}));
          throw new Error(j.message || "delete");
        }
        setMappingByGift((prev) => {
          const n = new Map(prev);
          n.delete(giftTiktokId);
          return n;
        });
      } else {
        const r = await apiWrite(`/api/v1/games/${encodeURIComponent(gameId)}/mappings/${giftTiktokId}`, {
          method: "PUT",
          body: JSON.stringify({ action_key: actionKey, priority: 0 }),
        });
        if (!r.ok) {
          const j = await r.json().catch(() => ({}));
          throw new Error(j.message || "save");
        }
        setMappingByGift((prev) => {
          const n = new Map(prev);
          n.set(giftTiktokId, actionKey);
          return n;
        });
      }
    } catch (e) {
      setErr(String((e as Error).message || e));
    } finally {
      setBusyId(null);
    }
  };

  const pageInfo = useMemo(() => {
    const end = offset + gifts.length;
    return `${offset + 1}–${end} · veritabanında ~${totalApprox} hediye`;
  }, [offset, gifts.length, totalApprox]);

  const tabBtn = (id: AdminTab, label: string) => (
    <button
      type="button"
      key={id}
      onClick={() => setTab(id)}
      style={{
        padding: "10px 14px",
        borderRadius: 8,
        border: tab === id ? "1px solid var(--accent)" : "1px solid var(--border)",
        background: tab === id ? "var(--accent-soft)" : "rgba(0,0,0,0.2)",
        color: tab === id ? "var(--accent)" : "var(--text)",
        cursor: "pointer",
        fontWeight: 600,
        fontSize: 13,
      }}
    >
      {label}
    </button>
  );

  return (
    <ThemeShell
      title="GemTok TikTok Live merkezi"
      subtitle="Tek TikFinity bağlantısı (ana sayfa), olay otobüsü, hediye keşfi ve oyun eşlemeleri."
    >
      <div style={{ display: "flex", flexWrap: "wrap", gap: 8, marginBottom: 18 }}>
        {tabBtn("connection", "Bağlantı")}
        {tabBtn("gifts", "Hediye kataloğu")}
        {tabBtn("mappings", "Oyun eşlemeleri")}
      </div>

      <section
        style={{
          padding: 16,
          marginBottom: 16,
          borderRadius: "var(--radius)",
          border: "1px solid var(--border)",
          background: "var(--panel)",
        }}
      >
        <label style={{ display: "block", fontSize: 12, color: "var(--muted)", marginBottom: 6 }}>
          Admin anahtarı (GEMTOK_GIFT_HUB_ADMIN_SECRET)
        </label>
        <div style={{ display: "flex", flexWrap: "wrap", gap: 8, alignItems: "center" }}>
          <input
            type="text"
            value={tokenIn}
            onChange={(e) => setTokenIn(e.target.value)}
            placeholder="X-Gemtok-Gift-Admin"
            style={{
              flex: "1 1 220px",
              padding: "10px 12px",
              borderRadius: 8,
              border: "1px solid var(--border)",
              background: "rgba(2,8,23,0.85)",
              color: "var(--text)",
            }}
          />
          <button
            type="button"
            onClick={onSaveToken}
            style={{
              padding: "10px 16px",
              borderRadius: 8,
              border: "1px solid var(--accent)",
              background: "var(--accent-soft)",
              color: "var(--accent)",
              cursor: "pointer",
              fontWeight: 600,
            }}
          >
            Anahtarı kaydet
          </button>
          <button
            type="button"
            onClick={onSyncJson}
            style={{
              padding: "10px 16px",
              borderRadius: 8,
              border: "1px solid var(--border)",
              background: "rgba(0,0,0,0.25)",
              color: "var(--text)",
              cursor: "pointer",
            }}
          >
            gift-list.json yeniden içe aktar
          </button>
        </div>
        {msg ? <p style={{ color: "var(--accent)", fontSize: 12, marginTop: 10 }}>{msg}</p> : null}
        {err ? <p style={{ color: "#f87171", fontSize: 12, marginTop: 10 }}>{err}</p> : null}
      </section>

      {tab === "connection" ? <ConnectionPanel /> : null}

      {tab === "gifts" || tab === "mappings" ? (
        <>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 12, marginBottom: 16, alignItems: "center" }}>
            <label style={{ fontSize: 13, color: "var(--muted)" }}>Oyun</label>
            <select
              value={gameId}
              onChange={(e) => {
                setGameId(e.target.value);
                setOffset(0);
              }}
              style={{
                padding: "8px 12px",
                borderRadius: 8,
                border: "1px solid var(--border)",
                background: "rgba(2,8,23,0.85)",
                color: "var(--text)",
                minWidth: 200,
              }}
            >
              {games.map((g) => (
                <option key={g.game_id} value={g.game_id}>
                  {g.display_name}
                </option>
              ))}
            </select>
          </div>

          <div style={{ display: "flex", flexWrap: "wrap", gap: 10, marginBottom: 14, alignItems: "center" }}>
            <input
              type="search"
              placeholder="Hediye ara (ad veya kod)…"
              value={search}
              onChange={(e) => {
                setSearch(e.target.value);
                setOffset(0);
              }}
              style={{
                flex: "1 1 200px",
                padding: "10px 12px",
                borderRadius: 8,
                border: "1px solid var(--border)",
                background: "rgba(2,8,23,0.85)",
                color: "var(--text)",
              }}
            />
            <label style={{ fontSize: 12, color: "var(--muted)", display: "flex", alignItems: "center", gap: 6 }}>
              Sırala
              <select
                value={sortBy}
                onChange={(e) => {
                  setSortBy(e.target.value as GiftSort);
                  setOffset(0);
                }}
                style={{
                  padding: "6px 8px",
                  borderRadius: 8,
                  border: "1px solid var(--border)",
                  background: "rgba(2,8,23,0.85)",
                  color: "var(--text)",
                }}
              >
                <option value="name">Ad</option>
                <option value="diamond">Jeton (değer)</option>
                <option value="last_seen">Son görülme</option>
                <option value="first_seen">İlk görülme</option>
              </select>
            </label>
            <label style={{ fontSize: 12, color: "var(--muted)", display: "flex", alignItems: "center", gap: 6 }}>
              Yön
              <select
                value={sortOrder}
                onChange={(e) => {
                  setSortOrder(e.target.value as "asc" | "desc");
                  setOffset(0);
                }}
                style={{
                  padding: "6px 8px",
                  borderRadius: 8,
                  border: "1px solid var(--border)",
                  background: "rgba(2,8,23,0.85)",
                  color: "var(--text)",
                }}
              >
                <option value="asc">Artan</option>
                <option value="desc">Azalan</option>
              </select>
            </label>
            <label style={{ fontSize: 12, color: "var(--muted)", display: "flex", alignItems: "center", gap: 6 }}>
              Durum
              <select
                value={activeFilter}
                onChange={(e) => {
                  setActiveFilter(e.target.value as "all" | "1" | "0");
                  setOffset(0);
                }}
                style={{
                  padding: "6px 8px",
                  borderRadius: 8,
                  border: "1px solid var(--border)",
                  background: "rgba(2,8,23,0.85)",
                  color: "var(--text)",
                }}
              >
                <option value="all">Tümü</option>
                <option value="1">Yalnız aktif</option>
                <option value="0">Yalnız pasif</option>
              </select>
            </label>
            <span style={{ fontSize: 12, color: "var(--muted)" }}>{pageInfo}</span>
            <button
              type="button"
              disabled={offset <= 0}
              onClick={() => setOffset(Math.max(0, offset - limit))}
              style={{ padding: "8px 12px", borderRadius: 8, cursor: offset <= 0 ? "not-allowed" : "pointer" }}
            >
              Önceki
            </button>
            <button
              type="button"
              disabled={gifts.length < limit}
              onClick={() => setOffset(offset + limit)}
              style={{
                padding: "8px 12px",
                borderRadius: 8,
                cursor: gifts.length < limit ? "not-allowed" : "pointer",
              }}
            >
              Sonraki
            </button>
          </div>
        </>
      ) : null}

      {tab === "gifts" ? (
        <GiftMappingTable
          gifts={gifts}
          actions={[]}
          mappingByGift={new Map()}
          busyId={null}
          hideActions
          onAssign={() => {}}
        />
      ) : null}

      {tab === "mappings" ? (
        <GiftMappingTable
          gifts={gifts}
          actions={actions}
          mappingByGift={mappingByGift}
          busyId={busyId}
          onAssign={onAssign}
        />
      ) : null}
    </ThemeShell>
  );
}
