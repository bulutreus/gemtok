import assert from "node:assert/strict";
import fs from "node:fs";
import vm from "node:vm";

const source = fs.readFileSync(new URL("../gemtok-tikfinity-client.js", import.meta.url), "utf8");

function makeRuntime({ storage = {}, search = "", env = null } = {}) {
  const raf = [];
  const sockets = [];
  class FakeWebSocket {
    static OPEN = 1;
    static CONNECTING = 0;
    constructor(url) {
      this.url = url;
      this.readyState = FakeWebSocket.CONNECTING;
      sockets.push(this);
    }
    close() { this.readyState = 3; }
  }
  const store = new Map(Object.entries(storage));
  const window = {
    location: { protocol: "https:", hostname: "bulutreus.github.io", search },
    localStorage: {
      getItem: (key) => store.get(key) ?? null,
      setItem: (key, value) => store.set(key, String(value)),
    },
    WebSocket: FakeWebSocket,
    requestAnimationFrame: (fn) => (raf.push(fn), raf.length),
    cancelAnimationFrame: () => {},
    setTimeout,
    clearTimeout,
    addEventListener: () => {},
    dispatchEvent: () => {},
    CustomEvent: class CustomEvent {},
    URLSearchParams,
    fetch: async () => ({ ok: false }),
    __ENV__: env,
    console,
  };
  window.window = window;
  window.globalThis = window;
  vm.runInNewContext(source, window, { filename: "gemtok-tikfinity-client.js" });
  return { window, sockets, flush: () => { while (raf.length) raf.shift()(); } };
}

{
  const rt = makeRuntime({ storage: { tikfinity_url: "ws://127.0.0.1:29999" } });
  const batches = [];
  const client = rt.window.GemTokTikFinity.createClient({ onPayloads: (batch) => batches.push(...batch) });
  await client.startAuto();
  assert.equal(rt.sockets.length, 1);
  assert.equal(rt.sockets[0].url, "ws://127.0.0.1:29999");

  const messages = [
    { eventType: "gift_event", data: JSON.stringify({ user: { uniqueId: "u1" }, giftName: "Rose", giftId: 1 }) },
    { event: "like", data: { user: { uniqueId: "u2" }, likeCount: 3 } },
    { type: "follow", data: { user: { uniqueId: "u3" } } },
    { event: "member", data: { user: { uniqueId: "u4" } }, },
    { event: "subscription", data: { user: { uniqueId: "u5" } } },
    { event: "share", data: { user: { uniqueId: "u6" } } },
  ];
  for (const message of messages) rt.sockets[0].onmessage({ data: JSON.stringify(message) });
  rt.flush();
  assert.deepEqual(Array.from(batches, (item) => item.type), ["gift", "like", "follow", "member", "subscribe", "share"]);
  client.stop();
}

{
  const rt = makeRuntime({ env: { TIKFINITY_WS_URL: "ws://127.0.0.1:28888" } });
  const client = rt.window.GemTokTikFinity.createClient({});
  await client.startAuto();
  assert.equal(rt.sockets[0].url, "ws://127.0.0.1:28888");
  client.stop();
}

{
  const rt = makeRuntime({ search: "?autoconnect=0" });
  const client = rt.window.GemTokTikFinity.createClient({});
  await client.startAuto();
  assert.equal(rt.sockets.length, 0);
}

console.log("TikFinity client tests passed");
