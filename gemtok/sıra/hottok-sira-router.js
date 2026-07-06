(function () {
  var PAGES = {
    home: "ANA SAYFA.html",
    gameHub: "OYUN MERKEZI.html",
    login: "MEMBER LOGİN.html",
    register: "REGİSTER.html",
    welcome: "GİRİŞ YAPTIKTAN SONRAKİ WELCOME SAYFASI.html",
    account: "Account A TIKLAYINCA.html",
    subscription: "Subscription A TIKLAYINCA.html",
    profile: "Profile A TIKLAYINCA.html",
    security: "Security E TIKLAYINCA.html",
    integrations: "Integrations.html",
    gifts: "TikTok Gifts.html",
    terms: "Terms of Service — HOTTOK.html",
    privacy: "Privacy Policy — HOTTOK.html",
    server: "Change Server.html",
    admin: "Admin Panel.html",
    /** Oyunlar: Car Race (21213 köprü), WarFront (3847), Arena Battle (`dist/index.html` + Vite dev 5173). TikFinity URL sırası ve `?tikfinity=0` için kök `gemtok-tikfinity-client.js` ile aynı mantık; Car Race aynı port çakışmasında Node WS’e düşer (`?legacyWs=1`). */
    carRace: "../game/Car Race/tiktok-race/index.html",
    carRaceImage: "../game/Car Race/Car Race.png",
    warFront: "../game/WarFront%20Arena/public/index.html",
    warFrontImage: "../game/WarFront%20Arena/WarFront%20Arena.png",
    menu: "MENÜYE GERİ BASINCA.html",
  };

  /** Arena Battle Vite `dist` çıktısı `type="module"` kullanır: `file://` ile açılırsa boş kalır. file:// iken Vite dev (5173); http(s) ile göreli dist (boşluklar %20). */
  function arenaBattleImageHref() {
    return "../game/Arena%20Battle/Arena%20Battle.png";
  }
  function arenaBattleHref() {
    try {
      if (location.protocol === "file:") return "http://127.0.0.1:5173/";
    } catch (e) {}
    return "../game/Arena%20Battle/dist/index.html";
  }
  var SESSION_KEY = "hottok_sira_session";
  var ACCOUNTS_KEY = "hottok_sira_accounts";
  var LAST_USER_KEY = "hottok_sira_last_user";
  var PORTAL_KEY = "hottok_sira_portal";
  var LEGACY_SESSION = "gemtok_sira_session";
  var LEGACY_ACCOUNTS = "gemtok_sira_accounts";
  var LEGACY_LAST_USER = "gemtok_sira_last_user";
  var LEGACY_PORTAL = "gemtok_sira_portal";
  /** Yerel demo yönetici parolası (kaynakta sabit; arayüz metinlerinde yazılmaz). */
  var SEED_ADMIN_HASH = "h_019412c9_9";

  /** Mitolojik rastgele takma ad havuzu (yerel demo hesapları). */
  var MYTH_DISPLAY_NAMES = [
    "Zeus",
    "Hera",
    "Athena",
    "Poseidon",
    "Hermes",
    "Apollon",
    "Artemis",
    "Ares",
    "Hephaistos",
    "Demeter",
    "Dionysos",
    "Persephone",
    "Kronos",
    "Rhea",
    "Gaia",
    "Odin",
    "Thor",
    "Loki",
    "Freya",
    "Baldur",
    "Tyr",
    "Heimdall",
    "Frigg",
    "Ra",
    "Isis",
    "Osiris",
    "Anubis",
    "Horus",
    "Bastet",
    "Thoth",
    "Sekhmet",
    "Gilgamesh",
    "Enkidu",
    "Tiamat",
    "Marduk",
    "Ishtar",
    "Simurg",
    "Phoenix",
    "Griffin",
    "Hydra",
    "Medusa",
    "Minotauros",
    "Perseus",
    "Herakles",
    "Odysseus",
    "Achilles",
    "Patroclus",
    "Orpheus",
    "Nemesis",
    "Nike",
    "Iris",
    "Eos",
    "Selene",
    "Helios",
    "Atlas",
    "Prometheus",
    "Hyperion",
    "Okeanos",
    "Charon",
    "Cerberus",
    "Echidna",
    "Chimera",
    "Ymir",
    "Jormungandr",
    "Fenrir",
    "Skadi",
    "Hel",
    "Vali",
    "Vidar",
    "Sif",
  ];

  function randomMythDisplayName(usedMap) {
    var arr = MYTH_DISPLAY_NAMES;
    var u = usedMap || {};
    for (var t = 0; t < 100; t++) {
      var base = arr[Math.floor(Math.random() * arr.length)];
      var tryName = t > 30 ? base + Math.floor(100 + Math.random() * 900) : base;
      if (!u[tryName]) {
        u[tryName] = 1;
        return tryName;
      }
    }
    return arr[Math.floor(Math.random() * arr.length)] + String(Date.now()).slice(-4);
  }

  /** Mevcut tüm hesaplara (admin hariç) bir kez mitolojik takma ad atar; oturum görünen adı güncellenir. */
  function assignMythDisplayNamesOnce() {
    try {
      if (localStorage.getItem("hottok_myth_display_v1")) return;
      migrateLegacyStorageOnce();
      var raw = localStorage.getItem(ACCOUNTS_KEY) || "{}";
      var accounts = JSON.parse(raw);
      if (!accounts || typeof accounts !== "object") accounts = {};
      var used = {};
      for (var k in accounts) {
        if (!Object.prototype.hasOwnProperty.call(accounts, k)) continue;
        var row = accounts[k];
        if (!row || typeof row !== "object") continue;
        var em = normEmail(String(row.email || k));
        if (row.isAdmin === true || em === "admin") continue;
        row.displayName = randomMythDisplayName(used);
        accounts[k] = row;
      }
      localStorage.setItem(ACCOUNTS_KEY, JSON.stringify(accounts));
      try {
        var sk = sessionStorage.getItem(SESSION_KEY) || localStorage.getItem(SESSION_KEY);
        if (sk) {
          var s = JSON.parse(sk);
          var sem = normEmail(s.email || "");
          if (sem && sem !== "admin" && accounts[sem]) {
            s.displayName = accounts[sem].displayName;
            var js = JSON.stringify(s);
            localStorage.setItem(SESSION_KEY, js);
            sessionStorage.setItem(SESSION_KEY, js);
            sessionStorage.setItem("hottok_local_display_name", s.displayName);
          }
        }
      } catch (eSe) {}
      localStorage.setItem("hottok_myth_display_v1", "1");
    } catch (eM) {}
  }

  function migrateLegacyStorageOnce() {
    try {
      if (!localStorage.getItem(ACCOUNTS_KEY) && localStorage.getItem(LEGACY_ACCOUNTS)) {
        localStorage.setItem(ACCOUNTS_KEY, localStorage.getItem(LEGACY_ACCOUNTS));
      }
      if (!localStorage.getItem(SESSION_KEY) && localStorage.getItem(LEGACY_SESSION)) {
        localStorage.setItem(SESSION_KEY, localStorage.getItem(LEGACY_SESSION));
      }
      if (!sessionStorage.getItem(SESSION_KEY) && sessionStorage.getItem(LEGACY_SESSION)) {
        sessionStorage.setItem(SESSION_KEY, sessionStorage.getItem(LEGACY_SESSION));
      }
      if (!localStorage.getItem(PORTAL_KEY) && localStorage.getItem(LEGACY_PORTAL)) {
        localStorage.setItem(PORTAL_KEY, localStorage.getItem(LEGACY_PORTAL));
      }
      if (!localStorage.getItem(LAST_USER_KEY) && localStorage.getItem(LEGACY_LAST_USER)) {
        localStorage.setItem(LAST_USER_KEY, localStorage.getItem(LEGACY_LAST_USER));
      }
    } catch (e) {}
  }

  function fallbackLogoDataUri(label) {
    var clean = String(label || "HOTTOK").replace(/[^a-z0-9]/gi, "").toUpperCase();
    var text = (clean || "GT").slice(0, 2);
    var svg =
      '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 128 128">' +
      '<defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1"><stop stop-color="#00d4ff"/><stop offset="1" stop-color="#7c3aed"/></linearGradient></defs>' +
      '<rect width="128" height="128" rx="24" fill="#020817"/>' +
      '<rect x="5" y="5" width="118" height="118" rx="20" fill="none" stroke="url(#g)" stroke-width="4"/>' +
      '<circle cx="98" cy="28" r="9" fill="#00d4ff" opacity=".85"/>' +
      '<text x="64" y="76" text-anchor="middle" font-family="Arial, sans-serif" font-size="34" font-weight="800" fill="#ffffff">' +
      text +
      "</text>" +
      "</svg>";
    return "data:image/svg+xml;charset=utf-8," + encodeURIComponent(svg);
  }

  function installImageFallbacks() {
    var imgs = document.querySelectorAll("img");
    for (var i = 0; i < imgs.length; i++) {
      var img = imgs[i];
      if (img.getAttribute("data-sira-img-fallback") === "1") continue;
      img.setAttribute("data-sira-img-fallback", "1");
      img.addEventListener("error", function () {
        if (this.getAttribute("data-sira-fallback-applied") === "1") return;
        this.setAttribute("data-sira-fallback-applied", "1");
        var label = this.getAttribute("alt") || this.getAttribute("title") || this.getAttribute("src") || "HOTTOK";
        this.src = fallbackLogoDataUri(label);
        this.style.objectFit = "cover";
        if (!this.style.borderRadius) this.style.borderRadius = "12px";
      });
      if (img.complete && img.naturalWidth === 0) {
        img.dispatchEvent(new Event("error"));
      }
    }
  }

  function navHasGiftLink(container) {
    if (!container) return false;
    if (container.querySelector('[data-sira-gift-nav="1"]')) return true;
    var kids = container.querySelectorAll("a");
    for (var k = 0; k < kids.length; k++) {
      var label = String(kids[k].textContent || "").replace(/\s+/g, " ").trim().toLowerCase();
      if (label === "tiktok gift" || label === "tiktok gifts") return true;
    }
    return false;
  }

  /** Sabit üst menü iç satırı (hesap sayfaları dahil tüm varyantlar). */
  function queryAllNavBarRows() {
    return document.querySelectorAll("nav.fixed.top-0.left-0.right-0 > div.flex.items-center.justify-between");
  }

  /** Logo / nav-link / btn-secondary ölçülerini sayfadan bağımsız sabitler (rem kökü farklı olsa bile). */
  function ensureNavUnifyStyles() {
    try {
      if (document.getElementById("hottok-nav-unify-styles")) return;
      var style = document.createElement("style");
      style.id = "hottok-nav-unify-styles";
      style.textContent =
        "nav.fixed.top-0.left-0.right-0{font-size:16px;-webkit-text-size-adjust:100%;}" +
        "nav.fixed.top-0.left-0.right-0 img[src*='logo.png']{height:56px!important;max-height:64px!important;width:auto!important;object-fit:contain!important;flex-shrink:0!important;vertical-align:middle;}" +
        "nav.fixed.top-0.left-0.right-0 a.nav-link{font-size:1rem!important;line-height:1.5rem!important;font-weight:500!important;white-space:nowrap;}" +
        "nav.fixed.top-0.left-0.right-0 a.btn-secondary{font-size:0.875rem!important;line-height:1.25rem!important;font-weight:600!important;padding:0.625rem 1.25rem!important;min-height:2.625rem!important;box-sizing:border-box!important;display:inline-flex!important;align-items:center!important;justify-content:center!important;}" +
        "nav.fixed.top-0.left-0.right-0 a.font-display.text-2xl{font-size:1.5rem!important;line-height:2rem!important;}" +
        "nav.fixed.top-0.left-0.right-0 > div.flex.items-center.justify-between{align-items:center!important;min-height:56px;}" +
        "nav.fixed.top-0.left-0.right-0 a.btn-secondary.hottok-nav-account-btn{width:2.75rem!important;height:2.75rem!important;min-width:2.75rem!important;min-height:2.75rem!important;padding:0!important;border-radius:0.625rem!important;background:rgba(13,21,37,0.96)!important;border:1px solid rgba(71,85,105,0.55)!important;color:#fff!important;}" +
        "nav.fixed.top-0.left-0.right-0 a.btn-secondary.hottok-nav-account-btn i{color:#fff!important;font-size:1.125rem!important;line-height:1!important;}" +
        "nav.fixed.top-0.left-0.right-0 a.btn-secondary .hottok-nav-inline-svg{display:inline-block;vertical-align:middle;flex-shrink:0;pointer-events:none;}" +
        "nav.fixed.top-0.left-0.right-0 a.btn-secondary.hottok-nav-account-btn .hottok-nav-inline-svg{display:block;margin:0 auto;}";
      (document.head || document.documentElement).appendChild(style);
    } catch (eSt) {}
  }

  /** Üst menüde yalnızca kişi ikonu olan giriş / hesap düğmesine kutu görünümü sınıfı. */
  function wireNavAccountIconClass() {
    try {
      var as = document.querySelectorAll("nav.fixed.top-0.left-0.right-0 a.btn-secondary");
      for (var i = 0; i < as.length; i++) {
        var a = as[i];
        if (a.getAttribute("data-hottok-account-icon") === "1") continue;
        var href = String(a.getAttribute("href") || "");
        if (href.indexOf("admin=1") >= 0 || href.indexOf("hottok-hub") >= 0) continue;
        if (a.children.length !== 1) continue;
        var el = a.children[0];
        if (!el || el.tagName !== "I") continue;
        var cls = String(el.className || "");
        if (cls.indexOf("bi-person") === -1) continue;
        a.classList.add("hottok-nav-account-btn");
        a.setAttribute("data-hottok-account-icon", "1");
      }
    } catch (eAcc) {}
  }

  /** Üst menü btn-secondary içindeki bi-* webfont ikonlarını inline SVG ile değiştirir (font yoksa tofu olmaz). */
  function replaceNavBootstrapIconsWithInlineSvg() {
    try {
      var ns = "http://www.w3.org/2000/svg";
      var as = document.querySelectorAll("nav.fixed.top-0.left-0.right-0 a.btn-secondary");
      for (var a = 0; a < as.length; a++) {
        var link = as[a];
        if (link.getAttribute("data-hottok-nav-svg-inline") === "1") continue;
        var icons = link.querySelectorAll("i[class*='bi-']");
        if (!icons.length) continue;
        var did = false;
        for (var k = 0; k < icons.length; k++) {
          var iel = icons[k];
          var c = String(iel.className || "");
          var svg = document.createElementNS(ns, "svg");
          svg.setAttribute("xmlns", ns);
          svg.setAttribute("fill", "currentColor");
          svg.setAttribute("aria-hidden", "true");
          svg.setAttribute("focusable", "false");
          svg.setAttribute("class", "hottok-nav-inline-svg");
          if (c.indexOf("bi-person") >= 0) {
            svg.setAttribute("width", "18");
            svg.setAttribute("height", "18");
            svg.setAttribute("viewBox", "0 0 24 24");
            var p = document.createElementNS(ns, "path");
            p.setAttribute("d", "M12 12a4 4 0 1 0-4-4 4 4 0 0 0 4 4zm0 2c-2.67 0-8 1.34-8 4v2h16v-2c0-2.66-5.33-4-8-4z");
            svg.appendChild(p);
          } else if (c.indexOf("bi-grid") >= 0) {
            svg.setAttribute("width", "16");
            svg.setAttribute("height", "16");
            svg.setAttribute("viewBox", "0 0 16 16");
            svg.setAttribute("class", "hottok-nav-inline-svg mr-3");
            var p2 = document.createElementNS(ns, "path");
            p2.setAttribute(
              "d",
              "M1 2.5A1.5 1.5 0 0 1 2.5 1h3A1.5 1.5 0 0 1 7 2.5v3A1.5 1.5 0 0 1 5.5 7h-3A1.5 1.5 0 0 1 1 5.5v-3zm8 0A1.5 1.5 0 0 1 10.5 1h3A1.5 1.5 0 0 1 15 2.5v3A1.5 1.5 0 0 1 13.5 7h-3A1.5 1.5 0 0 1 9 5.5v-3zm-8 8A1.5 1.5 0 0 1 2.5 9h3A1.5 1.5 0 0 1 7 10.5v3A1.5 1.5 0 0 1 5.5 15h-3A1.5 1.5 0 0 1 1 13.5v-3zm8 0a1.5 1.5 0 0 1 1.5-1.5h3a1.5 1.5 0 0 1 1.5 1.5v3a1.5 1.5 0 0 1-1.5 1.5h-3A1.5 1.5 0 0 1 9 13.5v-3z"
            );
            svg.appendChild(p2);
          } else if (c.indexOf("bi-house") >= 0) {
            svg.setAttribute("width", "16");
            svg.setAttribute("height", "16");
            svg.setAttribute("viewBox", "0 0 16 16");
            svg.setAttribute("class", "hottok-nav-inline-svg mr-3");
            var p3 = document.createElementNS(ns, "path");
            p3.setAttribute(
              "d",
              "M8.354 1.146a.5.5 0 0 0-.708 0l-6 6A.5.5 0 0 0 1.5 7.5v7a.5.5 0 0 0 .5.5h4.5a.5.5 0 0 0 .5-.5v-4h2v4a.5.5 0 0 0 .5.5H14a.5.5 0 0 0 .5-.5v-7a.5.5 0 0 0-.146-.354l-6-6zM2.5 7.707 8 2.207l5.5 5.5V15h-3v-4a.5.5 0 0 0-.5-.5H9a.5.5 0 0 0-.5.5v4h-3V7.707z"
            );
            svg.appendChild(p3);
          } else {
            continue;
          }
          if (iel.parentNode) iel.parentNode.replaceChild(svg, iel);
          did = true;
        }
        if (did) link.setAttribute("data-hottok-nav-svg-inline", "1");
      }
    } catch (eSvg) {}
  }

  /** Hesap / welcome satırlarında eksik w-full ve gap — pazarlama sayfalarıyla aynı flex şeridi. */
  function normalizeNavInnerLayout() {
    try {
      var rows = queryAllNavBarRows();
      for (var r = 0; r < rows.length; r++) {
        var inner = rows[r];
        if (!inner.classList.contains("w-full")) {
          inner.classList.add("w-full");
          inner.setAttribute("data-hottok-nav-wfull", "1");
        }
        var cn = inner.className || "";
        if (!/\bgap-\d/.test(cn)) {
          inner.classList.add("gap-3", "sm:gap-4");
        }
      }
      wireNavAccountIconClass();
      replaceNavBootstrapIconsWithInlineSvg();
    } catch (eLay) {}
  }

  function wireGiftNav() {
    var rows = queryAllNavBarRows();
    for (var r = 0; r < rows.length; r++) {
      var mid = rows[r].children[1];
      if (!mid || !mid.querySelector) continue;
      if (navHasGiftLink(mid)) continue;
      var hasPlat = mid.querySelector('a[href*="ANA SAYFA"]');
      var hasInt = mid.querySelector('a[href*="OYUN MERKEZI"]');
      if (!hasPlat || !hasInt) continue;
      var gift = document.createElement("a");
      gift.className = "nav-link font-medium";
      gift.href = PAGES.gifts;
      gift.textContent = "TikTok Gifts";
      gift.setAttribute("data-sira-gift-nav", "1");
      mid.appendChild(gift);
    }
    var links = Array.prototype.slice.call(document.querySelectorAll("a"));
    for (var i = 0; i < links.length; i++) {
      var text = String(links[i].textContent || "").replace(/\s+/g, " ").trim().toLowerCase();
      if (text !== "support") continue;
      var parent = links[i].parentElement;
      if (!parent || navHasGiftLink(parent)) continue;
      var gift2 = links[i].cloneNode(false);
      gift2.textContent = "TikTok Gifts";
      gift2.href = PAGES.gifts;
      gift2.setAttribute("data-sira-gift-nav", "1");
      parent.insertBefore(gift2, links[i].nextSibling);
    }
  }

  function currentFile() {
    try {
      return decodeURIComponent(location.pathname.split("/").pop() || "");
    } catch (e) {
      return location.pathname.split("/").pop() || "";
    }
  }

  /** Dosya adları Türkçe İ / i içerebilir; tr-TR ile eşleştir (giriş formu submit’inin yakalanması için). */
  function isPage(name) {
    var a = currentFile();
    var b = String(name || "");
    if (a === b) return true;
    try {
      if (a.localeCompare(b, "tr-TR", { sensitivity: "accent" }) === 0) return true;
    } catch (eLc) {}
    return a.toLowerCase() === b.toLowerCase();
  }

  /** Yerel demo yönetici parolası doğrulaması (büyük/küçük harf ve boşluk toleranslı). */
  function adminPasswordAccepts(plain) {
    return String(plain || "")
      .trim()
      .toUpperCase() === "BULUTREUS";
  }

  function isAccountLikePage() {
    return (
      isPage(PAGES.account) ||
      isPage(PAGES.profile) ||
      isPage(PAGES.security) ||
      isPage(PAGES.subscription) ||
      isPage(PAGES.server) ||
      isPage(PAGES.admin) ||
      isPage(PAGES.welcome) ||
      isPage(PAGES.menu)
    );
  }

  /** Oyunlar http://127.0.0.1 üzerinden açılınca giriş/abonelik için sıra klasörü mutlak adresi */
  function persistHottokPortalBase() {
    try {
      var u = new URL(location.href);
      u.hash = "";
      u.search = "";
      var p = u.pathname || "/";
      if (p.length > 1 && !p.endsWith("/")) u.pathname = p.replace(/[^/]*$/, "");
      localStorage.setItem(PORTAL_KEY, u.href);
    } catch (e) {}
  }

  function localSupport(pathname) {
    if (pathname.indexOf("/en/support/tiktok-gifts") === 0) return PAGES.gifts;
    if (pathname.indexOf("/en/support/terms-of-service") === 0) return PAGES.terms;
    if (pathname.indexOf("/en/support/privacy-policy") === 0) return PAGES.privacy;
    if (pathname.indexOf("/en/support") === 0) return PAGES.home;
    if (pathname.indexOf("/en/integration") === 0) return PAGES.integrations;
    if (pathname.indexOf("/en/platforms") === 0) return PAGES.home;
    return null;
  }

  function mapHottokUrl(raw) {
    if (!raw || raw === "#") return raw;
    var url;
    try {
      url = new URL(raw, location.href);
    } catch (e) {
      return raw;
    }
    var pathLower = "";
    try {
      pathLower = decodeURIComponent(String(url.pathname || "")).replace(/\\/g, "/").toLowerCase();
    } catch (e2) {
      pathLower = String(url.pathname || "").replace(/\\/g, "/").toLowerCase();
    }
    if (pathLower.indexOf("game/car race/tiktok-race/index.html") >= 0) return PAGES.carRace;
    if (pathLower.indexOf("game/warfront arena/public/index.html") >= 0) return PAGES.warFront;
    if (pathLower.indexOf("game/arena battle/dist/index.html") >= 0) return arenaBattleHref();
    if (pathLower.indexOf("game/arena battle/index.html") >= 0) return arenaBattleHref();
    if (!/gemtok\.live$/i.test(url.hostname)) return raw;
    var path = url.pathname.replace(/\/+$/, "/").toLowerCase();
    var local = localSupport(path);
    if (local) return local;
    if (path.indexOf("/en/login") === 0) return PAGES.gameHub + "?admin=1";
    if (path.indexOf("/en/register") === 0) return PAGES.register;
    if (path.indexOf("/welcome") === 0) return PAGES.welcome;
    if (path.indexOf("/account/subscription") === 0) return PAGES.subscription;
    if (path.indexOf("/account/profile") === 0) return PAGES.profile;
    if (path.indexOf("/account/security") === 0) return PAGES.security;
    if (path.indexOf("/account/server") === 0) return PAGES.server;
    if (path.indexOf("/account") === 0) return PAGES.account;
    if (path.indexOf("/en/recovery") === 0) return PAGES.gameHub + "?admin=1";
    if (path === "/en/" || path === "/en" || path === "/") return PAGES.home + (url.hash || "");
    return PAGES.home;
  }

  function hrefPointsToMemberLogin(raw) {
    if (!raw || raw === "#") return false;
    try {
      var last = decodeURIComponent(
        String(new URL(raw, location.href).pathname || "")
          .replace(/\\/g, "/")
          .split("/")
          .pop() || ""
      );
      if (!last) return false;
      if (last === PAGES.login) return true;
      return last.localeCompare(PAGES.login, "tr-TR", { sensitivity: "accent" }) === 0;
    } catch (eH) {
      return false;
    }
  }

  function rewriteLinks() {
    var nodes = document.querySelectorAll("a[href], form[action]");
    for (var i = 0; i < nodes.length; i++) {
      var attr = nodes[i].tagName === "FORM" ? "action" : "href";
      var raw = nodes[i].getAttribute(attr);
      if (raw && hrefPointsToMemberLogin(raw)) {
        nodes[i].setAttribute(attr, PAGES.gameHub + "?admin=1");
        if (nodes[i].tagName === "A") nodes[i].removeAttribute("target");
        continue;
      }
      var next = mapHottokUrl(raw);
      if (next) nodes[i].setAttribute(attr, next);
      if (nodes[i].tagName === "A") nodes[i].removeAttribute("target");
    }
  }

  function fieldValue(form, names) {
    for (var i = 0; i < names.length; i++) {
      var el = form.querySelector(names[i]);
      if (el && String(el.value || "").trim()) return String(el.value).trim();
    }
    return "";
  }

  function normEmail(raw) {
    return String(raw || "").trim().toLowerCase();
  }

  function hashPassword(raw) {
    var s = String(raw || "");
    var h = 0;
    for (var i = 0; i < s.length; i++) h = (Math.imul(31, h) + s.charCodeAt(i)) | 0;
    return "h_" + ("00000000" + (h >>> 0).toString(16)).slice(-8) + "_" + s.length;
  }

  function verifyPassword(account, password) {
    if (!account) return false;
    var plain = String(password || "");
    var stored = String(account.passwordHash || "");
    if (!stored) return false;
    return stored === hashPassword(plain) || stored === plain;
  }

  function readAccounts() {
    migrateLegacyStorageOnce();
    assignMythDisplayNamesOnce();
    try {
      return JSON.parse(localStorage.getItem(ACCOUNTS_KEY) || "{}");
    } catch (e) {
      return {};
    }
  }

  function saveAccounts(accounts) {
    try {
      localStorage.setItem(ACCOUNTS_KEY, JSON.stringify(accounts));
    } catch (e) {}
  }

  function updateAccount(email, patch) {
    var key = normEmail(email);
    if (!key) return null;
    var accounts = readAccounts();
    var row = accounts[key] || {
      email: key,
      displayName: randomMythDisplayName(),
      passwordHash: null,
      provider: "password",
      createdAt: new Date().toISOString(),
      country: "Turkey",
      language: "en",
      timezone: browserTimezone(),
      premium: false,
    };
    for (var name in patch) {
      if (Object.prototype.hasOwnProperty.call(patch, name)) row[name] = patch[name];
    }
    accounts[key] = row;
    saveAccounts(accounts);
    return row;
  }

  function ensureSeedAccount() {
    var accounts = readAccounts();
    if (!accounts.admin || accounts.admin.passwordHash !== SEED_ADMIN_HASH) {
      accounts.admin = {
        email: "admin",
        displayName: "Yerel Admin",
        passwordHash: SEED_ADMIN_HASH,
        provider: "password",
        createdAt: new Date().toISOString(),
        country: "Turkey",
        language: "en",
        timezone: browserTimezone(),
        premium: true,
        isAdmin: true,
      };
      saveAccounts(accounts);
    } else if (!accounts.admin.isAdmin) {
      accounts.admin.isAdmin = true;
      accounts.admin.premium = true;
      saveAccounts(accounts);
    }
  }

  function browserTimezone() {
    try {
      return Intl.DateTimeFormat().resolvedOptions().timeZone || "Europe/Istanbul";
    } catch (e) {
      return "Europe/Istanbul";
    }
  }

  function firstInput(form, selectors) {
    for (var i = 0; i < selectors.length; i++) {
      var el = form.querySelector(selectors[i]);
      if (el) return el;
    }
    return null;
  }

  function passwordInputs(form) {
    var root = form || document;
    var sels = ['input[type="password"]', 'input[name*="password"]', 'input[id*="password"]'];
    var out = [];
    for (var s = 0; s < sels.length; s++) {
      var nodes = root.querySelectorAll(sels[s]);
      for (var j = 0; j < nodes.length; j++) {
        if (out.indexOf(nodes[j]) < 0) out.push(nodes[j]);
      }
    }
    if (out.length) return out;
    return Array.prototype.slice.call(document.querySelectorAll('input[type="password"]'));
  }

  function passwordValueAt(form, index) {
    if (index === 0 && document.getElementById("password")) return String(document.getElementById("password").value || "");
    if (index === 1 && document.getElementById("password_confirm")) return String(document.getElementById("password_confirm").value || "");
    var fields = passwordInputs(form);
    return fields[index] ? String(fields[index].value || "") : "";
  }

  function authMessageBox(form) {
    var box = document.getElementById("hottok-sira-auth-message");
    if (box) return box;
    box = document.createElement("div");
    box.id = "hottok-sira-auth-message";
    box.setAttribute("role", "status");
    box.style.cssText =
      "display:none;margin:0 0 1rem 0;padding:.75rem 1rem;border-radius:.5rem;border:1px solid rgba(148,163,184,.35);background:rgba(15,23,42,.65);color:#cbd5e1;font-size:.875rem;";
    var anchor = firstInput(form, ["input", "button", "a"]);
    if (anchor && anchor.parentNode) {
      anchor.parentNode.insertBefore(box, anchor);
    } else {
      form.insertBefore(box, form.firstChild);
    }
    return box;
  }

  function showAuthMessage(form, text, kind) {
    var box = authMessageBox(form);
    box.textContent = text;
    box.style.display = text ? "block" : "none";
    box.style.borderColor = kind === "error" ? "rgba(248,113,113,.55)" : "rgba(52,211,153,.45)";
    box.style.background = kind === "error" ? "rgba(127,29,29,.30)" : "rgba(6,78,59,.25)";
    box.style.color = kind === "error" ? "#fecaca" : "#a7f3d0";
  }

  function currentForm() {
    return document.querySelector("form") || document.body;
  }

  function readSession() {
    migrateLegacyStorageOnce();
    try {
      var raw = sessionStorage.getItem(SESSION_KEY);
      if (raw) return JSON.parse(raw);
      var v1Session =
        sessionStorage.getItem("hottok_v1_session") ||
        sessionStorage.getItem("gemtok_v1_session");
      if (v1Session) {
        var parsedSession = JSON.parse(v1Session);
        if (parsedSession && parsedSession.emailNorm) {
          return {
            email: normEmail(parsedSession.emailNorm),
            displayName: parsedSession.displayName || normEmail(parsedSession.emailNorm).split("@")[0] || "Kullanıcı",
            provider: parsedSession.provider || "password",
            createdAt: parsedSession.createdAt || new Date().toISOString(),
          };
        }
      }
      var legacyUser =
        sessionStorage.getItem("hottok_local_user") ||
        sessionStorage.getItem("gemtok_local_user");
      var legacyName =
        sessionStorage.getItem("hottok_local_display_name") ||
        sessionStorage.getItem("gemtok_local_display_name");
      var legacyProvider =
        sessionStorage.getItem("hottok_local_auth_provider") ||
        sessionStorage.getItem("gemtok_local_auth_provider");
      if (legacyUser) {
        return {
          email: normEmail(legacyUser).replace(/^google:/, ""),
          displayName: legacyName || normEmail(legacyUser).replace(/^google:/, "").split("@")[0] || "Kullanıcı",
          provider: legacyProvider || (String(legacyUser).indexOf("google:") === 0 ? "google" : "password"),
          createdAt: new Date().toISOString(),
        };
      }
      raw = localStorage.getItem(SESSION_KEY);
      if (raw) return JSON.parse(raw);
      legacyUser = localStorage.getItem("hottok_local_user") || localStorage.getItem("gemtok_local_user");
      legacyName = localStorage.getItem("hottok_local_display_name") || localStorage.getItem("gemtok_local_display_name");
      legacyProvider = localStorage.getItem("hottok_local_auth_provider") || localStorage.getItem("gemtok_local_auth_provider");
      if (legacyUser) {
        return {
          email: normEmail(legacyUser).replace(/^google:/, ""),
          displayName: legacyName || normEmail(legacyUser).replace(/^google:/, "").split("@")[0] || "Kullanıcı",
          provider: legacyProvider || (String(legacyUser).indexOf("google:") === 0 ? "google" : "password"),
          createdAt: new Date().toISOString(),
        };
      }
      var v1 = localStorage.getItem("hottok_v1_session") || localStorage.getItem("gemtok_v1_session");
      if (v1) {
        var parsed = JSON.parse(v1);
        if (parsed && parsed.emailNorm) {
          return {
            email: normEmail(parsed.emailNorm),
            displayName: parsed.displayName || normEmail(parsed.emailNorm).split("@")[0] || "Kullanıcı",
            provider: parsed.provider || "password",
            createdAt: parsed.createdAt || new Date().toISOString(),
          };
        }
      }
      return null;
    } catch (e) {
      return null;
    }
  }

  function saveSession(user) {
    var ep = user.endpointId;
    if (!ep && user.email) {
      try {
        ep = ensureUserEndpointId(user.email);
      } catch (eEp) {}
    }
    if (!ep) {
      var seedKey = normEmail(user.email) || String(user.email || "guest");
      ep = stableFourDigitsFromSeed(seedKey + "|hottok-endpoint");
    }
    var payload = {
      email: user.email || "yerel@hottok.local",
      displayName: user.displayName || (user.email ? user.email.split("@")[0] : "Yerel Kullanıcı"),
      provider: user.provider || "password",
      createdAt: user.createdAt || new Date().toISOString(),
      country: user.country || "Turkey",
      language: user.language || "en",
      timezone: user.timezone || browserTimezone(),
      premium: !!user.premium,
      isAdmin: !!user.isAdmin,
      endpointId: ep,
      savedAt: Date.now(),
    };
    try {
      localStorage.setItem(SESSION_KEY, JSON.stringify(payload));
      sessionStorage.setItem(SESSION_KEY, JSON.stringify(payload));
      localStorage.setItem(LAST_USER_KEY, payload.email);
      sessionStorage.setItem("hottok_local_user", payload.email);
      sessionStorage.setItem("hottok_local_display_name", payload.displayName);
      sessionStorage.setItem("hottok_local_auth_provider", payload.provider);
    } catch (e) {}
    return payload;
  }

  function currentUser() {
    var session = readSession();
    if (!session || !session.email) return null;
    var accounts = readAccounts();
    var account = accounts[normEmail(session.email)];
    if (!account) {
      account = updateAccount(session.email, {
        email: normEmail(session.email),
        displayName: session.displayName || normEmail(session.email).split("@")[0] || "Kullanıcı",
        provider: session.provider || "password",
        createdAt: session.createdAt || new Date().toISOString(),
      });
    } else if (
      (session.displayName && session.displayName !== account.displayName) ||
      (session.country && session.country !== account.country) ||
      (session.language && session.language !== account.language) ||
      (session.timezone && session.timezone !== account.timezone)
    ) {
      account = updateAccount(session.email, {
        displayName: session.displayName || account.displayName,
        country: session.country || account.country || "Turkey",
        language: session.language || account.language || "en",
        timezone: session.timezone || account.timezone || browserTimezone(),
      });
    }
    return account || session;
  }

  function stableFourDigitsFromSeed(seed) {
    var s = String(seed || "x");
    var h = 0;
    for (var i = 0; i < s.length; i++) h = (Math.imul(31, h) + s.charCodeAt(i)) | 0;
    var n = Math.abs(h) % 10000;
    return ("0000" + n).slice(-4);
  }

  function ensureUserEndpointId(email) {
    var key = normEmail(email);
    if (!key) return "";
    var accounts = readAccounts();
    var row = accounts[key];
    if (!row) return "";
    if (row.endpointId) return row.endpointId;
    var dig = stableFourDigitsFromSeed(key + "|hottok-endpoint");
    updateAccount(key, { endpointId: dig });
    return dig;
  }

  function readGameLicenseSummary() {
    try {
      if (!window.HottokLicense || !HottokLicense.readLicenseSession) return null;
      var s = HottokLicense.readLicenseSession();
      if (!s) return null;
      if (HottokLicense.isUnlimitedTier && HottokLicense.isUnlimitedTier(s.tier)) {
        return { unlimited: true, daysLeft: null, clientIp: s.clientIp || "", tier: s.tier || "" };
      }
      if (s.expiresAt == null) return null;
      if (Date.now() > Number(s.expiresAt)) return null;
      var daysLeft = Math.max(0, Math.ceil((Number(s.expiresAt) - Date.now()) / 86400000));
      return { unlimited: false, daysLeft: daysLeft, clientIp: s.clientIp || "", tier: s.tier || "" };
    } catch (e0) {
      return null;
    }
  }

  function wireNavAuthEntry() {
    var navs = document.querySelectorAll("nav.fixed");
    for (var n = 0; n < navs.length; n++) {
      var links = navs[n].querySelectorAll("a.btn-secondary");
      for (var i = 0; i < links.length; i++) {
        var a = links[i];
        if (!a.querySelector) continue;
        var href = String(a.getAttribute("href") || "");
        if (href.indexOf("admin=1") >= 0 || href.indexOf("hottok-hub") >= 0) continue;
        var isNavPerson =
          a.querySelector(".bi-person-fill") ||
          a.querySelector("i[class*='bi-person']") ||
          a.getAttribute("data-hottok-account-icon") === "1";
        if (!isNavPerson) continue;
        var u = currentUser();
        if (u && u.email) {
          a.setAttribute("href", PAGES.account);
          var plan = u.premium ? "Premium" : "Free";
          var gl = readGameLicenseSummary();
          var parts = [];
          if (gl) {
            if (gl.unlimited) parts.push("Sınırsız lisans");
            else parts.push(gl.daysLeft + " gün");
          }
          parts.push(plan);
          a.setAttribute("title", parts.join(" · "));
        } else {
          a.setAttribute("href", PAGES.gameHub + "?admin=1");
          a.removeAttribute("title");
        }
      }
    }
  }

  function fillAccountHesapOzet() {
    if (!isPage(PAGES.account)) return;
    var licBox = document.getElementById("hottok-lisans-kalan");
    var box = document.getElementById("hottok-hesap-ozet");
    var u = currentUser();
    if (!u) {
      if (licBox) licBox.textContent = "";
      if (box)
        box.innerHTML =
          '<p class="text-[#94a3b8] text-sm m-0">Oturum yok. <a class="text-cyan-400 underline" href="' +
          PAGES.gameHub +
          '?admin=1">Oyun Merkezi</a> üzerinden yönetici girişi yapılabilir.</p>';
      return;
    }
    var gl = readGameLicenseSummary();
    if (licBox) {
      if (gl && gl.unlimited) {
        licBox.innerHTML =
          '<div class="font-display text-5xl sm:text-6xl font-bold text-cyan-300 leading-none">∞</div>' +
          '<div class="text-[#94a3b8] text-base sm:text-lg mt-2 font-semibold">sınırsız oyun lisansı</div>';
      } else if (gl && gl.daysLeft != null && gl.daysLeft >= 0) {
        licBox.innerHTML =
          '<div class="font-display text-5xl sm:text-6xl font-bold text-cyan-300 leading-none">' +
          String(gl.daysLeft) +
          '</div>' +
          '<div class="text-[#94a3b8] text-base sm:text-lg mt-2 font-semibold">gün kaldı</div>';
      } else {
        licBox.innerHTML =
          '<div class="text-[#94a3b8] text-base">Aktif oyun lisansı yok</div>' +
          '<a class="inline-block mt-3 text-cyan-400 font-semibold underline text-sm" href="' +
          PAGES.gameHub +
          '">Anahtar için Oyun Merkezi</a>';
      }
    }
    if (box) {
      box.innerHTML = "";
    }
  }

  function clearSession() {
    try {
      localStorage.removeItem(SESSION_KEY);
      sessionStorage.removeItem(SESSION_KEY);
      localStorage.removeItem(LEGACY_SESSION);
      sessionStorage.removeItem(LEGACY_SESSION);
      localStorage.removeItem(LEGACY_ACCOUNTS);
      localStorage.removeItem(LEGACY_PORTAL);
      localStorage.removeItem(LEGACY_LAST_USER);
      sessionStorage.removeItem("hottok_local_user");
      sessionStorage.removeItem("hottok_local_display_name");
      sessionStorage.removeItem("hottok_local_auth_provider");
      sessionStorage.removeItem("hottok_local_registered");
      sessionStorage.removeItem("gemtok_local_user");
      sessionStorage.removeItem("gemtok_local_display_name");
      sessionStorage.removeItem("gemtok_local_auth_provider");
      sessionStorage.removeItem("gemtok_local_registered");
    } catch (e) {}
  }

  function handleAuthSubmit(form, provider) {
    ensureSeedAccount();
    var email = fieldValue(form, [
      "input#contact_email",
      'input[name="contact_email"]',
      'input[type="email"]',
      'input[name*="email"]',
      'input[id*="email"]',
      'input[name*="contact"]',
      'input[id*="contact"]',
    ]);
    var name = fieldValue(form, ['input[name="name"]', 'input[id="name"]', 'input[name*="full"]']);
    var emailNorm = normEmail(email);
    var passwords = passwordInputs(form);
    var password = passwordValueAt(form, 0);
    var passwordConfirm = passwordValueAt(form, 1);
    var accounts = readAccounts();

    if (authFormKind(form) === "login") {
      try {
        location.href = PAGES.gameHub + "?admin=1";
      } catch (eL) {}
      return;
    }

    if (!emailNorm) {
      showAuthMessage(form, "E-posta girin.", "error");
      return;
    }

    if (isPage(PAGES.register)) {
      if (emailNorm.indexOf("@") < 0) {
        showAuthMessage(form, "Geçerli bir e-posta adresi girin.", "error");
        return;
      }
      if (accounts[emailNorm]) {
        showAuthMessage(form, "Bu e-posta adresi zaten kayıtlı. Lütfen giriş yapın.", "error");
        return;
      }
      if (!password || password.length < 6) {
        showAuthMessage(form, "Şifre en az 6 karakter olmalı.", "error");
        return;
      }
      if (passwordConfirm && password !== passwordConfirm) {
        showAuthMessage(form, "Şifreler eşleşmiyor. Aynı şifreyi iki kez yazın.", "error");
        return;
      }
      accounts[emailNorm] = {
        email: emailNorm,
        displayName: String(name || "").trim() || randomMythDisplayName(),
        passwordHash: hashPassword(password),
        provider: "password",
        createdAt: new Date().toISOString(),
        country: "Turkey",
        language: "en",
        timezone: browserTimezone(),
        premium: false,
      };
      saveAccounts(accounts);
      saveSession(accounts[emailNorm]);
      try {
        sessionStorage.setItem("hottok_local_registered", "1");
      } catch (e) {}
      showAuthMessage(form, "Hesap oluşturuldu. Yönlendiriliyorsunuz...", "ok");
      setTimeout(function () {
        location.href = PAGES.welcome;
      }, 350);
      return;
    }

    return;
  }

  function disableGoogleAuth() {
    var nodes = document.querySelectorAll("a, button");
    for (var i = 0; i < nodes.length; i++) {
      var text = String(nodes[i].textContent || "").toLowerCase();
      var href = String(nodes[i].getAttribute("href") || "").toLowerCase();
      var title = String(nodes[i].getAttribute("title") || "").toLowerCase();
      var className = String(nodes[i].className || "").toLowerCase();
      if (text.indexOf("google") >= 0 || href.indexOf("oauth/google") >= 0 || title.indexOf("google") >= 0 || className.indexOf("google") >= 0) {
        nodes[i].setAttribute("href", "#");
        nodes[i].setAttribute("aria-hidden", "true");
        nodes[i].style.display = "none";
      }
    }
  }

  function enhanceAuthButtons() {
    if (!isPage(PAGES.login) && !isPage(PAGES.register) && !document.querySelector("form #contact_email")) return;
    var buttons = document.querySelectorAll("button, input[type='submit'], a");
    for (var i = 0; i < buttons.length; i++) {
      var text = String(buttons[i].textContent || buttons[i].value || "").replace(/\s+/g, " ").trim().toLowerCase();
      if (text === "login now" || text === "register now") {
        var btn = buttons[i];
        btn.classList.remove("col-span-6", "me-2", "text-left");
        btn.classList.add("w-full");
        btn.style.display = "block";
        btn.style.width = "100%";
        btn.style.maxWidth = "28rem";
        btn.style.margin = "0 auto";
        btn.style.textAlign = "center";
        btn.style.paddingTop = "1rem";
        btn.style.paddingBottom = "1rem";
        btn.style.fontSize = "1rem";
        btn.style.justifyContent = "center";
        var parent = btn.parentElement;
        if (parent) {
          parent.classList.remove("grid", "grid-cols-12");
          parent.style.display = "block";
          parent.style.textAlign = "center";
        }
      }
    }
  }

  function syncUserText(extraNameNeedles) {
    var s = currentUser();
    if (!s) return;
    /** TikTok Gifts: binlerce kart metni; TreeWalker gereksiz ve otomatik doldurma riski yok. */
    if (isPage(PAGES.gifts)) return;
    var emailNeedles = ["lostp092@gmail.com", "google:lostp092@gmail.com", "yerel@hottok.local", "yerel@gemtok.local"];
    var nameNeedles = ["Bulut", "Yerel Kullanıcı", "Yerel Admin"];
    if (extraNameNeedles && extraNameNeedles.length) {
      for (var en = 0; en < extraNameNeedles.length; en++) {
        if (extraNameNeedles[en] && nameNeedles.indexOf(extraNameNeedles[en]) < 0) nameNeedles.push(extraNameNeedles[en]);
      }
    }
    var createdAt = s.createdAt ? new Date(s.createdAt) : new Date();
    var joinedText = "Joined " + createdAt.toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" });
    var days = Math.max(0, Math.floor((Date.now() - createdAt.getTime()) / 86400000));
    var countryText = s.country || "Turkey";
    var languageText = languageLabel(s.language || "en");
    var timezoneText = s.timezone || browserTimezone();
    var walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
    var node;
    while ((node = walker.nextNode())) {
      var text = node.nodeValue;
      for (var i = 0; i < emailNeedles.length; i++) text = text.split(emailNeedles[i]).join(s.email);
      if (isAccountLikePage()) text = text.replace(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi, s.email);
      for (var j = 0; j < nameNeedles.length; j++) text = text.split(nameNeedles[j]).join(s.displayName);
      text = text.replace(/Joined\s+\d{1,2}\s+\w+\s+\d{4}\s*\(\d+\s+days?\)/g, joinedText + " (" + days + " days)");
      text = text.replace(/\(\d+\s+days?\)/g, "(" + days + " days)");
      text = text.replace(/Joined\s+\d{1,2}\s+\w+\s+\d{4}/g, joinedText);
      node.nodeValue = text;
    }
    var inputs = document.querySelectorAll("input, textarea, select");
    for (var k = 0; k < inputs.length; k++) {
      var value = String(inputs[k].value || "");
      for (var ev = 0; ev < emailNeedles.length; ev++) value = value.split(emailNeedles[ev]).join(s.email);
      for (var nv = 0; nv < nameNeedles.length; nv++) value = value.split(nameNeedles[nv]).join(s.displayName);
      if (value !== String(inputs[k].value || "")) inputs[k].value = value;
      if (inputs[k].defaultValue != null) {
        var def = String(inputs[k].defaultValue || "");
        for (var ed = 0; ed < emailNeedles.length; ed++) def = def.split(emailNeedles[ed]).join(s.email);
        for (var nd = 0; nd < nameNeedles.length; nd++) def = def.split(nameNeedles[nd]).join(s.displayName);
        inputs[k].defaultValue = def;
      }
      if (inputs[k].placeholder) {
        var ph = inputs[k].placeholder;
        for (var ep = 0; ep < emailNeedles.length; ep++) ph = ph.split(emailNeedles[ep]).join(s.email);
        for (var np = 0; np < nameNeedles.length; np++) ph = ph.split(nameNeedles[np]).join(s.displayName);
        inputs[k].placeholder = ph;
      }
    }
    var emailInputs = document.querySelectorAll(
      'input[type="email"], input[readonly], input[name*="email"], input[id*="email"], input#contact_email, input[name="contact_email"]'
    );
    for (var e = 0; e < emailInputs.length; e++) {
      if (isAccountLikePage() || !emailInputs[e].value || emailNeedles.indexOf(emailInputs[e].value) >= 0) {
        emailInputs[e].value = s.email;
        emailInputs[e].defaultValue = s.email;
      }
    }
    var nameInputs = document.querySelectorAll('input[name="name"], input[id="name"], input[name*="full"]');
    for (var n = 0; n < nameInputs.length; n++) {
      if (isAccountLikePage() || !nameInputs[n].value || nameNeedles.indexOf(nameInputs[n].value) >= 0) {
        nameInputs[n].value = s.displayName;
        nameInputs[n].defaultValue = s.displayName;
      }
    }
    setSelectValue('select[name="country"], select[id="country"]', countryText);
    setSelectValue('select[name="language"], select[id="language"]', s.language || "en");
    setSelectValue('select[name="timezone"], select[id="timezone"]', timezoneText);
    setBootstrapDisplay("country", countryText);
    setBootstrapDisplay("language", languageText);
    setBootstrapDisplay("timezone", timezoneText);
    syncPremiumText(s);
    wireNavAuthEntry();
    fillAccountHesapOzet();
  }

  function syncVisibleDisplayName(name) {
    if (!isAccountLikePage()) return;
    var next = String(name || "").trim();
    if (!next) return;
    var user = currentUser();
    var oldName = user && user.displayName ? user.displayName : "";
    var needles = ["Bulut", "Yerel Kullanıcı", "Yerel Admin"];
    if (oldName && needles.indexOf(oldName) < 0) needles.push(oldName);
    var walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
    var node;
    while ((node = walker.nextNode())) {
      var text = node.nodeValue;
      for (var i = 0; i < needles.length; i++) text = text.split(needles[i]).join(next);
      node.nodeValue = text;
    }
  }

  function syncPremiumText(user) {
    if (!user || !isAccountLikePage()) return;
    var plan = user.premium ? "Premium" : "Free Tier";
    var desc = user.premium ? "Premium plan is active for this local account." : "Enjoy Soundboard and Stream Studio with limited features.";
    var walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
    var node;
    while ((node = walker.nextNode())) {
      var text = node.nodeValue;
      text = text.replace(/Free Tier|Premium/g, plan);
      text = text.replace(/Enjoy Soundboard and Stream Studio with limited features\./g, desc);
      text = text.replace(/Premium plan is active for this local account\./g, desc);
      node.nodeValue = text;
    }
  }

  function languageLabel(code) {
    var map = { en: "English", tr: "Türkçe", id: "Indonesia", es: "Español", pt: "Português", vi: "Tiếng Việt", zh: "汉语", ar: "اَلْعَرَبِيَّةُ" };
    return map[code] || code || "English";
  }

  function setSelectValue(selector, value) {
    var nodes = document.querySelectorAll(selector);
    for (var i = 0; i < nodes.length; i++) {
      try {
        nodes[i].value = value;
      } catch (e) {}
    }
  }

  function setBootstrapDisplay(selectId, value) {
    var select = document.getElementById(selectId);
    if (!select) return;
    var wrap = select.closest(".bootstrap-select");
    if (!wrap) return;
    var labels = wrap.querySelectorAll(".filter-option-inner-inner, .filter-option");
    for (var i = 0; i < labels.length; i++) labels[i].textContent = value;
    var button = wrap.querySelector("button[title]");
    if (button) button.setAttribute("title", value);
  }

  function updateProfileFromForm(form) {
    var session = readSession();
    if (!session || !session.email) return;
    var before = currentUser();
    var name = fieldValue(form, ['input[name="name"]', 'input[id="name"]', 'input[name*="full"]']);
    var country = fieldValue(form, ['select[name="country"]', 'select[id="country"]', 'input[name="country"]']) || bootstrapDisplayValue("country");
    var language = fieldValue(form, ['select[name="language"]', 'select[id="language"]']) || languageCodeFromLabel(bootstrapDisplayValue("language"));
    var timezone = fieldValue(form, ['select[name="timezone"]', 'select[id="timezone"]', 'input[name="timezone"]']) || bootstrapDisplayValue("timezone");
    var patch = {};
    if (name) patch.displayName = name;
    if (country) patch.country = country;
    if (language) patch.language = language;
    if (timezone) patch.timezone = timezone;
    var updated = updateAccount(session.email, patch);
    if (updated) saveSession(updated);
    syncUserText(before && before.displayName ? [before.displayName] : []);
    if (name) syncVisibleDisplayName(name);
    showAuthMessage(form, "Profil bilgileri kaydedildi.", "ok");
  }

  function bootstrapDisplayValue(selectId) {
    var select = document.getElementById(selectId);
    if (!select) return "";
    var wrap = select.closest(".bootstrap-select");
    if (!wrap) return "";
    var label = wrap.querySelector(".filter-option-inner-inner");
    return label ? String(label.textContent || "").trim() : "";
  }

  function languageCodeFromLabel(label) {
    var map = { English: "en", "Türkçe": "tr", Indonesia: "id", "Español": "es", "Português": "pt", "Tiếng Việt": "vi", "汉语": "zh", "اَلْعَرَبِيَّةُ": "ar" };
    return map[label] || label || "";
  }

  function updatePasswordFromForm(form) {
    var session = readSession();
    if (!session || !session.email) {
      showAuthMessage(form, "Şifre değiştirmek için önce giriş yapın.", "error");
      return;
    }
    var passwords = passwordInputs(form);
    var current = passwordValueAt(form, 0);
    var next = passwordValueAt(form, 1);
    var confirm = passwordValueAt(form, 2);
    if (!next && passwords.length === 1) next = current;
    if (!next || next.length < 6) {
      showAuthMessage(form, "Yeni şifre en az 6 karakter olmalı.", "error");
      return;
    }
    if (confirm && next !== confirm) {
      showAuthMessage(form, "Yeni şifreler eşleşmiyor.", "error");
      return;
    }
    var accounts = readAccounts();
    var key = normEmail(session.email);
    var row = accounts[key];
    if (row && row.passwordHash && current && passwords.length > 1 && !verifyPassword(row, current)) {
      showAuthMessage(form, "Mevcut şifre hatalı.", "error");
      return;
    }
    row = updateAccount(key, {
      passwordHash: hashPassword(next),
      provider: "password",
    });
    if (row) saveSession(row);
    showAuthMessage(form, "Şifre güncellendi.", "ok");
  }

  function requireAdminSession() {
    var session = readSession();
    if (!session || normEmail(session.email) !== "admin") return false;
    if (session.isAdmin) return true;
    var accounts = readAccounts();
    var row = accounts.admin;
    if (row && row.isAdmin) {
      try {
        saveSession({
          email: "admin",
          displayName: session.displayName || row.displayName || "Yerel Admin",
          provider: session.provider || row.provider || "password",
          createdAt: session.createdAt || row.createdAt || new Date().toISOString(),
          country: session.country || row.country || "Turkey",
          language: session.language || row.language || "en",
          timezone: session.timezone || row.timezone || browserTimezone(),
          premium: true,
          isAdmin: true,
        });
      } catch (eAdm) {}
      return true;
    }
    return false;
  }

  var _adminLicenseFeedback = { text: "", kind: "ok" };
  /** Son «Anahtar üret» ile oluşturulan anahtarlar (.txt indirme için). */
  var _lastGeneratedLicenseKeys = [];
  var _licDestructive = null;

  function buildHottokLicenseKeysText(keys, headerLine) {
    var rows = (keys || [])
      .map(function (k) {
        return String(k || "").trim();
      })
      .filter(Boolean);
    if (!rows.length) return null;
    var lines = [];
    lines.push(String(headerLine || "HOTTOK — lisans anahtarları"));
    try {
      lines.push("Tarih: " + new Date().toLocaleString("tr-TR"));
    } catch (eD) {
      lines.push("Tarih: " + new Date().toISOString());
    }
    lines.push("");
    for (var i = 0; i < rows.length; i++) lines.push(rows[i]);
    return lines.join("\n");
  }

  function hottokLicenseTxtFilename(stem) {
    var d = new Date();
    var pad = function (n) {
      return ("0" + n).slice(-2);
    };
    return (
      "hottok-" +
      String(stem || "lisans") +
      "-" +
      d.getFullYear() +
      pad(d.getMonth() + 1) +
      pad(d.getDate()) +
      "-" +
      pad(d.getHours()) +
      pad(d.getMinutes()) +
      ".txt"
    );
  }

  function downloadHottokLicenseKeysText(keys, stem, headerLine) {
    try {
      var text = buildHottokLicenseKeysText(keys, headerLine);
      if (!text) return false;
      var blob = new Blob([text], { type: "text/plain;charset=utf-8" });
      var a = document.createElement("a");
      a.href = URL.createObjectURL(blob);
      a.download = hottokLicenseTxtFilename(stem);
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      setTimeout(function () {
        try {
          URL.revokeObjectURL(a.href);
        } catch (eRev) {}
      }, 2500);
      return true;
    } catch (eDl) {
      return false;
    }
  }

  function setAdminLicenseFeedback(text, kind) {
    _adminLicenseFeedback = {
      text: String(text || ""),
      kind: kind === "error" ? "error" : kind === "warn" ? "warn" : "ok",
    };
  }

  function tryConsumeLicenseDestructive(type, keyRaw) {
    var HL = window.HottokLicense;
    var nk = "";
    try {
      nk = HL && HL.normalizeKey ? HL.normalizeKey(keyRaw) : String(keyRaw || "").trim().toUpperCase().replace(/\s+/g, "");
    } catch (eNk) {
      nk = "";
    }
    if (!nk) return false;
    var now = Date.now();
    if (_licDestructive && _licDestructive.type === type && _licDestructive.key === nk && now < _licDestructive.until) {
      _licDestructive = null;
      return true;
    }
    _licDestructive = { type: type, key: nk, until: now + 8000 };
    return false;
  }

  function renderAdminPanel() {
    if (!isPage(PAGES.admin)) return;
    if (!requireAdminSession()) {
      location.href = PAGES.gameHub + "?admin=1";
      return;
    }
    renderAdminLicenseBlock();
  }

  function renderAdminLicenseBlock() {
    if (!isPage(PAGES.admin)) return;
    if (!requireAdminSession()) return;
    var box = document.getElementById("hottok-admin-licenses");
    if (!box || !window.HottokLicense) return;
    var HL = window.HottokLicense;
    var storeUrl = HL.getItemsatisUrl();
    var reg = HL.readRegistry();
    try {
      if (HL.migrateKeyClientIps) HL.migrateKeyClientIps();
    } catch (eM) {}
    var keys = Object.keys(reg.keys || {}).sort();

    box.innerHTML = "";

    var fbSnapLic = _adminLicenseFeedback.text ? { text: _adminLicenseFeedback.text, kind: _adminLicenseFeedback.kind } : null;
    _adminLicenseFeedback = { text: "", kind: "ok" };
    if (fbSnapLic && fbSnapLic.text) {
      var pfb = document.createElement("p");
      pfb.setAttribute("role", "status");
      pfb.className =
        "text-sm mb-3 " +
        (fbSnapLic.kind === "error" ? "text-red-400" : fbSnapLic.kind === "warn" ? "text-amber-300" : "text-emerald-400");
      pfb.textContent = fbSnapLic.text;
      box.appendChild(pfb);
    }

    var p1 = document.createElement("p");
    p1.className = "text-[#94a3b8] text-sm mb-2";
    p1.textContent =
      "ItemSatış mağaza URL’si (boş bırakılırsa varsayılan GemTok profili kullanılır). Oyun Merkezi «lisans satın al» bu adresi açar.";
    box.appendChild(p1);
    var urlRow = document.createElement("div");
    urlRow.className = "flex flex-wrap gap-2 items-center mb-4";
    var urlInp = document.createElement("input");
    urlInp.type = "url";
    urlInp.id = "hottok-admin-itemsatis-url";
    urlInp.className =
      "flex-1 min-w-[200px] rounded-lg border border-[#0a3d59] bg-[rgba(15,30,55,0.5)] px-3 py-2 text-sm text-white";
    urlInp.placeholder = "https://www.itemsatis.com/profil/…";
    urlInp.value = storeUrl;
    urlRow.appendChild(urlInp);
    var urlBtn = document.createElement("button");
    urlBtn.type = "button";
    urlBtn.className = "btn-secondary px-4 py-2 rounded-lg font-semibold text-sm";
    urlBtn.textContent = "URL kaydet";
    urlBtn.setAttribute("data-admin-save-itemsatis", "1");
    urlRow.appendChild(urlBtn);
    box.appendChild(urlRow);

    var p2 = document.createElement("p");
    p2.className = "text-[#94a3b8] text-sm mb-2 mt-4";
    p2.textContent = "Yeni anahtarlar (süre, ilk kullanımda başlar):";
    box.appendChild(p2);
    var genRow = document.createElement("div");
    genRow.className = "flex flex-wrap gap-2 items-center mb-4";
    var selTier = document.createElement("select");
    selTier.id = "hottok-lic-tier";
    selTier.className =
      "rounded-lg border border-[#0a3d59] bg-[rgba(15,30,55,0.5)] px-3 py-2 text-sm text-white";
    [["7d", "1 hafta"], ["30d", "1 ay"], ["90d", "3 ay"], ["365d", "1 yıl"], ["unl", "Sınırsız"]].forEach(function (opt) {
      var o = document.createElement("option");
      o.value = opt[0];
      o.textContent = opt[1];
      selTier.appendChild(o);
    });
    genRow.appendChild(selTier);
    var cnt = document.createElement("input");
    cnt.type = "number";
    cnt.id = "hottok-lic-count";
    cnt.min = "1";
    cnt.max = "100";
    cnt.value = "5";
    cnt.className =
      "w-20 rounded-lg border border-[#0a3d59] bg-[rgba(15,30,55,0.5)] px-2 py-2 text-sm text-white";
    genRow.appendChild(cnt);
    var selScope = document.createElement("select");
    selScope.id = "hottok-lic-scope";
    selScope.className =
      "rounded-lg border border-[#0a3d59] bg-[rgba(15,30,55,0.5)] px-3 py-2 text-sm text-white";
    [
      ["all", "Tüm oyunlar"],
      ["carRace", "Car Race"],
      ["warFront", "WarFront"],
      ["arenaBattle", "Arena Battle"],
    ].forEach(function (opt) {
      var o = document.createElement("option");
      o.value = opt[0];
      o.textContent = opt[1];
      selScope.appendChild(o);
    });
    genRow.appendChild(selScope);
    var genBtn = document.createElement("button");
    genBtn.type = "button";
    genBtn.className = "btn-secondary px-4 py-2 rounded-lg font-semibold text-sm";
    genBtn.textContent = "Anahtar üret";
    genBtn.setAttribute("data-admin-license-generate", "1");
    genRow.appendChild(genBtn);
    box.appendChild(genRow);

    var txtRow = document.createElement("div");
    txtRow.className = "flex flex-wrap gap-2 items-center mb-4";
    var txtLast = document.createElement("button");
    txtLast.type = "button";
    txtLast.className = "btn-secondary px-4 py-2 rounded-lg font-semibold text-sm";
    txtLast.textContent = "Son oluşturulanları metin belgesi (.txt) indir";
    txtLast.disabled = !_lastGeneratedLicenseKeys.length;
    if (txtLast.disabled) txtLast.setAttribute("title", "Önce «Anahtar üret» ile anahtar oluşturun.");
    txtLast.addEventListener("click", function (ev) {
      ev.preventDefault();
      if (!_lastGeneratedLicenseKeys.length) return;
      var ok = downloadHottokLicenseKeysText(
        _lastGeneratedLicenseKeys.slice(),
        "son-uretilen-anahtarlar",
        "HOTTOK — son oluşturulan lisans anahtarları"
      );
      if (!ok) {
        setAdminLicenseFeedback("Metin dosyası oluşturulamadı.", "error");
        renderAdminLicenseBlock();
      }
    });
    txtRow.appendChild(txtLast);
    box.appendChild(txtRow);

    if (!keys.length) {
      var empty = document.createElement("p");
      empty.className = "text-[#64748b] text-sm";
      empty.textContent = "Henüz anahtar yok.";
      box.appendChild(empty);
      return;
    }

    var now = Date.now();
    var listBos = [];
    var listAktif = [];
    var listDiger = [];
    for (var j = 0; j < keys.length; j++) {
      var kj = keys[j];
      var ej = reg.keys[kj];
      if (!ej) continue;
      if (ej.revoked || (ej.activatedAt && ej.expiresAt && now > Number(ej.expiresAt))) {
        listDiger.push(kj);
      } else if (ej.activatedAt) {
        listAktif.push(kj);
      } else {
        listBos.push(kj);
      }
    }

    function appendKeySection(title, list, forceStatusLabel) {
      var sec = document.createElement("div");
      sec.className = "mt-4 rounded-lg border border-[#0a3d59] bg-[rgba(15,30,55,0.35)] p-3";
      var h3 = document.createElement("h3");
      h3.className = "font-bold text-white text-sm mb-2";
      h3.textContent = title + " (" + list.length + ")";
      sec.appendChild(h3);
      if (!list.length) {
        var ph = document.createElement("p");
        ph.className = "text-[#64748b] text-xs";
        ph.textContent = "Bu grupta anahtar yok.";
        sec.appendChild(ph);
        box.appendChild(sec);
        return;
      }
      var tblWrap = document.createElement("div");
      tblWrap.className = "overflow-x-auto";
      var tbl = document.createElement("table");
      tbl.className = "w-full text-left text-xs text-[#94a3b8] border-collapse";
      var thead = document.createElement("thead");
      thead.innerHTML =
        "<tr class='border-b border-[#0a3d59]'><th class='py-2 pr-2'>Anahtar</th><th class='py-2 pr-2'>Uç IP</th><th class='py-2 pr-2'>Süre</th><th class='py-2 pr-2'>Oyun</th><th class='py-2 pr-2'>Durum</th><th class='py-2'></th></tr>";
      tbl.appendChild(thead);
      var tbody = document.createElement("tbody");
      for (var i = 0; i < list.length; i++) {
        var k = list[i];
        var e = reg.keys[k];
        if (!e) continue;
        var tr = document.createElement("tr");
        tr.className = "border-b border-[#0a3d59]/40";
        var td1 = document.createElement("td");
        td1.className = "py-2 pr-2 font-mono text-white whitespace-nowrap";
        td1.textContent = k;
        tr.appendChild(td1);
        var tdIp = document.createElement("td");
        tdIp.className = "py-2 pr-2 font-mono text-cyan-300/90";
        tdIp.textContent = e.clientIp || "—";
        tr.appendChild(tdIp);
        var td2 = document.createElement("td");
        td2.className = "py-2 pr-2";
        td2.textContent = HL && HL.isUnlimitedTier && HL.isUnlimitedTier(e.tier) ? "Sınırsız" : e.tier || "-";
        tr.appendChild(td2);
        var td3 = document.createElement("td");
        td3.className = "py-2 pr-2";
        td3.textContent = e.games && e.games.join ? e.games.join(", ") : "all";
        tr.appendChild(td3);
        var td4 = document.createElement("td");
        td4.className = "py-2 pr-2 text-white";
        var stLabel = "";
        if (forceStatusLabel === "bos") stLabel = "Boş";
        else if (forceStatusLabel === "aktif") stLabel = "Aktif";
        else {
          if (e.revoked) stLabel = "İptal";
          else if (e.expiresAt && now > Number(e.expiresAt)) stLabel = "Süresi doldu";
          else stLabel = "—";
        }
        td4.textContent =
          stLabel +
          (e.expiresAt != null
            ? " · " + new Date(e.expiresAt).toLocaleString("tr-TR")
            : HL && HL.isUnlimitedTier && HL.isUnlimitedTier(e.tier) && e.activatedAt
            ? " · Sınırsız (bitiş yok)"
            : "");
        tr.appendChild(td4);
        var td5 = document.createElement("td");
        td5.className = "py-2";
        var act = document.createElement("div");
        act.className = "flex flex-wrap gap-2 items-center";
        if (!e.revoked) {
          var rb = document.createElement("button");
          rb.type = "button";
          rb.className = "text-amber-300/90 underline text-xs";
          rb.textContent = "İptal";
          rb.setAttribute("data-admin-license-revoke", k);
          act.appendChild(rb);
        }
        var db = document.createElement("button");
        db.type = "button";
        db.className = "text-red-400 underline text-xs";
        db.textContent = "Sil";
        db.setAttribute("data-admin-license-delete", k);
        act.appendChild(db);
        td5.appendChild(act);
        tr.appendChild(td5);
        tbody.appendChild(tr);
      }
      tbl.appendChild(tbody);
      tblWrap.appendChild(tbl);
      sec.appendChild(tblWrap);
      box.appendChild(sec);
    }

    var hint = document.createElement("p");
    hint.className = "text-[#64748b] text-xs mt-3 mb-1";
    hint.textContent =
      "Anahtarlar duruma göre ayrı listelerde: Boş (henüz oyunda kullanılmadı), Aktif (süresi içinde), İptal veya süresi dolmuş. İptal ve sil için aynı düğmeye 8 saniye içinde ikinci kez basın.";
    box.appendChild(hint);
    if (listBos.length) {
      var txtBosRow = document.createElement("div");
      txtBosRow.className = "mb-2";
      var txtBos = document.createElement("button");
      txtBos.type = "button";
      txtBos.className = "btn-secondary px-4 py-2 rounded-lg font-semibold text-sm";
      txtBos.textContent = "Boş anahtarların tamamını metin belgesi (.txt) indir (" + listBos.length + ")";
      txtBos.addEventListener("click", function (ev) {
        ev.preventDefault();
        var ok = downloadHottokLicenseKeysText(
          listBos.slice(),
          "bos-anahtarlar",
          "HOTTOK — kullanılmamış (boş) lisans anahtarları"
        );
        if (!ok) {
          setAdminLicenseFeedback("Metin dosyası oluşturulamadı.", "error");
          renderAdminLicenseBlock();
        }
      });
      txtBosRow.appendChild(txtBos);
      box.appendChild(txtBosRow);
    }
    appendKeySection("Boş anahtarlar", listBos, "bos");
    appendKeySection("Aktif anahtarlar", listAktif, "aktif");
    appendKeySection("İptal veya süresi dolmuş", listDiger, "diger");
  }

  function syncIntegrationsGame() {
    var isIntegrationsPage = isPage(PAGES.integrations);
    var isHomePage = isPage(PAGES.home);
    if (!isIntegrationsPage && !isHomePage) return;
    var cards = Array.prototype.slice.call(document.querySelectorAll(".game-card"));
    if (!cards.length) return;
    var gameItems = [
      {
        href: PAGES.carRace,
        image: PAGES.carRaceImage,
        alt: "Car Race",
        category: "TikTok Live Game",
        title: "Car Race",
        desc: "Neon arcade 5 şeritli TikTok canlı yayın araba yarışı.",
      },
      {
        href: PAGES.warFront,
        image: PAGES.warFrontImage,
        alt: "WarFront Arena",
        category: "TikTok Live Game",
        title: "WarFront Arena",
        desc: "TikTok canlı yayın için iki takımlı savaş arenası.",
      },
      {
        href: arenaBattleHref(),
        image: arenaBattleImageHref(),
        alt: "Arena Battle",
        category: "TikTok Live Game",
        title: "Arena Battle",
        desc: "Dikey TikTok arena; beğeni ve hediye.",
      },
    ];
    for (var i = 0; i < cards.length; i++) {
      var card = cards[i];
      var link = card.closest("a");
      if (i < gameItems.length && (isIntegrationsPage || isHomePage)) {
        var game = gameItems[i];
        if (link) link.setAttribute("href", game.href);
        var img = card.querySelector("img");
        if (img) {
          img.src = game.image;
          img.alt = game.alt;
        }
        var category = card.querySelector(".text-\\[\\#00d4ff\\]");
        if (category) category.textContent = game.category;
        var title = card.querySelector("h3");
        if (title) title.textContent = game.title;
        var desc = card.querySelector(".text-\\[\\#64748b\\]");
        if (desc) desc.textContent = game.desc;
      } else if ((isIntegrationsPage || isHomePage) && link) {
        link.style.display = "none";
      } else if (isIntegrationsPage || isHomePage) {
        card.style.display = "none";
      }
    }
    var buttons = document.querySelectorAll("button");
    for (var b = 0; b < buttons.length; b++) {
      var text = String(buttons[b].textContent || "");
      if (
        text.indexOf("Explore All Games") >= 0 ||
        text.indexOf("Open Car Race") >= 0 ||
        text.indexOf("Oyun Merkezi") >= 0
      ) {
        buttons[b].onclick = function () {
          location.href = PAGES.gameHub;
        };
      }
    }
  }

  function isCarRaceHref(href) {
    if (!href) return false;
    var normalized = decodeURIComponent(String(href)).replace(/\\/g, "/").toLowerCase();
    return (
      normalized.indexOf("game/car race/tiktok-race/index.html") >= 0 ||
      normalized.indexOf("127.0.0.1:21213") >= 0 ||
      normalized.indexOf("localhost:21213") >= 0
    );
  }

  function isGameHref(href) {
    if (!href) return false;
    var normalized = decodeURIComponent(String(href)).replace(/\\/g, "/").toLowerCase();
    return (
      normalized.indexOf("game/car race/tiktok-race/index.html") >= 0 ||
      normalized.indexOf("game/warfront arena/public/index.html") >= 0 ||
      normalized.indexOf("game/warfront%20arena/public/index.html") >= 0 ||
      normalized.indexOf("game/arena battle/dist/index.html") >= 0 ||
      normalized.indexOf("game/arena%20battle/dist/index.html") >= 0 ||
      normalized.indexOf("game/arena battle/index.html") >= 0 ||
      normalized.indexOf("127.0.0.1:21213") >= 0 ||
      normalized.indexOf("localhost:21213") >= 0 ||
      normalized.indexOf("127.0.0.1:3847") >= 0 ||
      normalized.indexOf("localhost:3847") >= 0 ||
      normalized.indexOf("127.0.0.1:5173") >= 0 ||
      normalized.indexOf("localhost:5173") >= 0
    );
  }

  function gameIdFromHref(href) {
    if (!href) return "";
    var n = decodeURIComponent(String(href)).replace(/\\/g, "/").toLowerCase();
    if (n.indexOf("car race") >= 0 || n.indexOf("tiktok-race") >= 0 || n.indexOf("21213") >= 0) return "carRace";
    if (n.indexOf("warfront") >= 0 || n.indexOf("3847") >= 0) return "warFront";
    if (n.indexOf("arena battle") >= 0 || n.indexOf("5173") >= 0) return "arenaBattle";
    return "";
  }

  function ensurePremiumForGame(href) {
    var gid = gameIdFromHref(href);
    try {
      if (window.HottokLicense && window.HottokLicense.isGameAllowedInSession(gid)) return true;
    } catch (e0) {}
    location.href = PAGES.gameHub + (gid ? "?oyun=" + encodeURIComponent(gid) : "");
    return false;
  }

  function wireWelcomeCards() {
    if (!isPage(PAGES.welcome) && !isPage(PAGES.menu)) return;
    var links = document.querySelectorAll("a");
    for (var i = 0; i < links.length; i++) {
      var heading = links[i].querySelector("h2, h3");
      var text = heading ? String(heading.textContent || "").trim().toLowerCase() : String(links[i].textContent || "").toLowerCase();
      if (text.indexOf("classic games") >= 0) {
        links[i].setAttribute("href", PAGES.gameHub);
      } else if (text.indexOf("stream studio") >= 0 || text.indexOf("soundboard") >= 0) {
        links[i].setAttribute("href", "#");
        links[i].setAttribute("data-sira-welcome-action", "coming-soon");
        links[i].style.opacity = "0.42";
        links[i].style.filter = "grayscale(1) brightness(0.65)";
        links[i].style.cursor = "not-allowed";
        links[i].setAttribute("aria-disabled", "true");
      }
    }
  }

  /** HTTrack giriş/kayıt formları: sayfa adı bozulsa bile (#contact_email = giriş, #email + #password_confirm = kayıt). */
  function authFormKind(form) {
    if (!form || form.tagName !== "FORM") return "";
    var hasConfirm = !!(form.querySelector("#password_confirm") || form.querySelector('input[name="password_confirm"]'));
    var hasContact = !!form.querySelector("#contact_email");
    var hasRegEmail = !!form.querySelector("#email");
    var hasPw = !!form.querySelector("#password");
    if (hasConfirm && hasRegEmail && hasPw && isPage(PAGES.register)) return "register";
    if (hasContact && hasPw && !hasConfirm) return "login";
    return "";
  }

  function bindProfileNamePreview() {
    if (!isPage(PAGES.profile)) return;
    var inputs = document.querySelectorAll('input[name="name"], input[id="name"], input[name*="full"]');
    for (var i = 0; i < inputs.length; i++) {
      if (inputs[i].getAttribute("data-sira-name-preview") === "1") continue;
      inputs[i].setAttribute("data-sira-name-preview", "1");
      inputs[i].addEventListener("input", function () {
        syncVisibleDisplayName(this.value);
      });
    }
  }

  function bindActions() {
    document.addEventListener(
      "submit",
      function (ev) {
        var form = ev.target;
        if (!form || form.tagName !== "FORM") return;
        var kind = authFormKind(form);
        if (kind === "login" || kind === "register") {
          ev.preventDefault();
          ev.stopPropagation();
          handleAuthSubmit(form, "password");
        } else if (isPage(PAGES.profile)) {
          ev.preventDefault();
          ev.stopPropagation();
          updateProfileFromForm(form);
        } else if (isPage(PAGES.security)) {
          ev.preventDefault();
          ev.stopPropagation();
          updatePasswordFromForm(form);
        }
      },
      true
    );

    document.addEventListener(
      "click",
      function (ev) {
        var el = ev.target;
        if (el && el.nodeType !== 1) el = el.parentElement;
        var target = el && el.closest ? el.closest("a,button") : null;
        if (!target) return;
        if (target.getAttribute("data-hottok-hub-license") === "1") return;
        if (target.getAttribute("data-hottok-play")) return;
        var text = (target.textContent || "").replace(/\s+/g, " ").trim().toLowerCase();
        var href = target.tagName === "A" ? target.getAttribute("href") : "";
        var welcomeAction = target.getAttribute("data-sira-welcome-action");
        if (welcomeAction === "coming-soon") {
          ev.preventDefault();
          ev.stopPropagation();
          return;
        }
        if (welcomeAction === "integrations") {
          ev.preventDefault();
          ev.stopPropagation();
          location.href = PAGES.gameHub;
          return;
        }
        var saveItemsatis = target.getAttribute("data-admin-save-itemsatis");
        if (saveItemsatis === "1") {
          ev.preventDefault();
          ev.stopPropagation();
          if (!requireAdminSession()) return;
          var inp = document.getElementById("hottok-admin-itemsatis-url");
          if (window.HottokLicense && inp) {
            try {
              var rUrl = window.HottokLicense.setItemsatisUrl(inp.value);
              if (rUrl && rUrl.ok) {
                setAdminLicenseFeedback("ItemSatış adresi kaydedildi.", "ok");
              } else {
                setAdminLicenseFeedback("Geçerli bir https:// adresi girin veya alanı boşaltın.", "error");
              }
            } catch (eUrl) {
              setAdminLicenseFeedback("Adres kaydedilemedi.", "error");
            }
            renderAdminLicenseBlock();
          }
          return;
        }
        var genLic = target.getAttribute("data-admin-license-generate");
        if (genLic === "1") {
          ev.preventDefault();
          ev.stopPropagation();
          if (!requireAdminSession()) return;
          if (!window.HottokLicense) {
            setAdminLicenseFeedback("Lisans modülü yüklenemedi.", "error");
            renderAdminLicenseBlock();
            return;
          }
          try {
            var tierAllowed = { "7d": 1, "30d": 1, "90d": 1, "365d": 1, unl: 1 };
            var tierEl = document.getElementById("hottok-lic-tier");
            var cntEl = document.getElementById("hottok-lic-count");
            var scEl = document.getElementById("hottok-lic-scope");
            var tier = tierEl && tierAllowed[tierEl.value] ? tierEl.value : "7d";
            var n = cntEl ? parseInt(cntEl.value, 10) : 1;
            if (isNaN(n) || n < 1) n = 1;
            if (n > 100) n = 100;
            var scope = scEl ? scEl.value : "all";
            var allowedScope = { all: 1, carRace: 1, warFront: 1, arenaBattle: 1 };
            if (!allowedScope[scope]) scope = "all";
            var created = window.HottokLicense.adminGenerateKeys(tier, n, scope);
            if (!created || !created.length) {
              setAdminLicenseFeedback("Anahtar oluşturulamadı. Tarayıcı depolamasını kontrol edin.", "error");
            } else {
              _lastGeneratedLicenseKeys = created.slice();
              setAdminLicenseFeedback(String(created.length) + " anahtar oluşturuldu.", "ok");
            }
          } catch (eGen) {
            setAdminLicenseFeedback("Anahtar oluşturulamadı.", "error");
          }
          renderAdminLicenseBlock();
          return;
        }
        var revLic = target.getAttribute("data-admin-license-revoke");
        if (revLic) {
          ev.preventDefault();
          ev.stopPropagation();
          if (!requireAdminSession()) return;
          if (!window.HottokLicense) return;
          try {
            if (!tryConsumeLicenseDestructive("revoke", revLic)) {
              setAdminLicenseFeedback("İptal için aynı anahtarın «İptal»ine 8 saniye içinde tekrar basın.", "warn");
              renderAdminLicenseBlock();
              return;
            }
            window.HottokLicense.adminRevokeKey(revLic);
            setAdminLicenseFeedback("Anahtar iptal edildi.", "ok");
          } catch (eRev) {
            setAdminLicenseFeedback("İptal uygulanamadı.", "error");
          }
          renderAdminLicenseBlock();
          return;
        }
        var delLic = target.getAttribute("data-admin-license-delete");
        if (delLic) {
          ev.preventDefault();
          ev.stopPropagation();
          if (!requireAdminSession()) return;
          if (!window.HottokLicense || !window.HottokLicense.adminDeleteKey) return;
          try {
            if (!tryConsumeLicenseDestructive("delete", delLic)) {
              setAdminLicenseFeedback("Silmek için aynı anahtarın «Sil»ine 8 saniye içinde tekrar basın.", "warn");
              renderAdminLicenseBlock();
              return;
            }
            window.HottokLicense.adminDeleteKey(delLic);
            setAdminLicenseFeedback("Anahtar silindi.", "ok");
          } catch (eDel) {
            setAdminLicenseFeedback("Silme uygulanamadı.", "error");
          }
          renderAdminLicenseBlock();
          return;
        }
        if (isGameHref(href)) {
          ev.preventDefault();
          ev.stopPropagation();
          if (ensurePremiumForGame(href)) location.href = href;
          return;
        }
        if (text.indexOf("google") >= 0 && (isPage(PAGES.login) || isPage(PAGES.register) || !!document.querySelector("form #contact_email"))) {
          ev.preventDefault();
          ev.stopPropagation();
          return;
        }
        if (text === "logout" || text === "çıkış" || text.indexOf("logout") >= 0) {
          ev.preventDefault();
          ev.stopPropagation();
          clearSession();
          location.href = PAGES.gameHub + "?admin=1";
          return;
        }
        if (isPage(PAGES.server) && href && href.indexOf("target=") >= 0) {
          ev.preventDefault();
          ev.stopPropagation();
          var targetRegion = href.split("target=")[1].split("&")[0].split("#")[0] || "shared";
          var user = currentUser();
          if (user) {
            var updated = updateAccount(user.email, { serverRegion: targetRegion });
            if (updated) saveSession(updated);
          }
          location.href = PAGES.account;
          return;
        }
        var mapped = mapHottokUrl(href);
        if (mapped && mapped !== href) {
          ev.preventDefault();
          ev.stopPropagation();
          location.href = mapped;
        }
      },
      true
    );
  }

  function applyNavPlatformsCenterRow() {
    try {
      var wide = typeof window.matchMedia !== "function" || window.matchMedia("(min-width: 768px)").matches;
      var rows = queryAllNavBarRows();
      for (var r = 0; r < rows.length; r++) {
        var row = rows[r];
        var mid = row.children[1];
        if (!mid || !mid.querySelector) continue;
        var hasPlatforms = mid.querySelector('a[href*="#platforms"], a.nav-link[href*="ANA SAYFA"]');
        function clearGrid() {
          if (row.getAttribute("data-hottok-nav-grid") !== "1") return;
          var a0 = row.children[0];
          if (a0 && a0.tagName === "A") {
            a0.style.removeProperty("padding-left");
            a0.style.removeProperty("display");
            a0.style.removeProperty("align-items");
            a0.style.removeProperty("margin-left");
            var lg0 = a0.querySelector('img[src*="logo.png"]');
            if (lg0) {
              lg0.style.removeProperty("margin-left");
              lg0.style.removeProperty("transform");
              lg0.style.removeProperty("transform-origin");
              lg0.removeAttribute("data-sira-header-logo-nudge");
            }
          }
          var midClear = row.children[1];
          if (midClear) {
            midClear.style.removeProperty("width");
            midClear.style.removeProperty("max-width");
          }
          row.style.display = "";
          row.style.gridTemplateColumns = "";
          row.style.alignItems = "";
          row.style.columnGap = "";
          row.removeAttribute("data-hottok-nav-grid");
          for (var c = 0; c < row.children.length; c++) {
            row.children[c].style.justifySelf = "";
          }
        }
        if (!hasPlatforms || !wide) {
          clearGrid();
          continue;
        }
        if (row.getAttribute("data-hottok-nav-grid") === "1") continue;
        row.setAttribute("data-hottok-nav-grid", "1");
        row.style.display = "grid";
        /* 1fr yanları min 0 verebiliyor; logo / sağ blok küçülmesin (Oyun Merkezi dahil). */
        row.style.gridTemplateColumns = "minmax(min-content, 1fr) auto minmax(min-content, 1fr)";
        row.style.alignItems = "center";
        row.style.columnGap = "1rem";
        if (row.children[0]) row.children[0].style.justifySelf = "start";
        mid.style.justifySelf = "center";
        mid.style.width = "max-content";
        mid.style.maxWidth = "100%";
        if (row.children[2]) row.children[2].style.justifySelf = "end";
      }
    } catch (e) {}
  }

  /** Üst sabit menü yüksekliği ve iç satır genişliği — sayfa bazlı farklı flex/markup kaynaklı sıçramayı azaltır. */
  function normalizeFixedNavHeight() {
    try {
      var navs = document.querySelectorAll("nav.fixed.top-0.left-0.right-0");
      for (var i = 0; i < navs.length; i++) {
        var nav = navs[i];
        nav.style.setProperty("display", "flex", "important");
        nav.style.setProperty("align-items", "center", "important");
        nav.style.setProperty("min-height", "88px", "important");
        nav.style.setProperty("box-sizing", "border-box", "important");
        var inner = nav.firstElementChild;
        if (inner && inner.nodeType === 1) {
          inner.style.setProperty("width", "100%", "important");
        }
      }
    } catch (eNavH) {}
  }

  /** Üst menü satırında sol (logo) ve sağ aksiyonların flex/grid sıkışmasını engeller. */
  function stabilizeNavHubRow() {
    try {
      var rows = queryAllNavBarRows();
      for (var r = 0; r < rows.length; r++) {
        var row = rows[r];
        var n = row.children.length;
        if (n < 2) continue;
        for (var c = 0; c < n; c++) {
          row.children[c].style.setProperty("flex-shrink", "0");
        }
        var logos = row.querySelectorAll('img[src*="logo.png"]');
        for (var j = 0; j < logos.length; j++) {
          logos[j].style.setProperty("flex-shrink", "0");
        }
      }
    } catch (eStab) {}
  }

  /** Üst menü logosu: çok hafif sağa (translateX), grid/flex uyumlu. */
  function nudgeHeaderLogoRight() {
    try {
      var shiftPx = 12;
      var navs = document.querySelectorAll("nav.fixed");
      for (var n = 0; n < navs.length; n++) {
        var img = navs[n].querySelector('img[src*="logo.png"]');
        if (!img) continue;
        var row =
          img.closest("nav.fixed.top-0.left-0.right-0 > div.flex.items-center.justify-between") ||
          img.closest("div.flex.items-center.justify-between");
        if (!row) continue;
        var wrap = img.parentElement;
        if (wrap && wrap.tagName === "A") {
          wrap.style.removeProperty("padding-left");
          wrap.style.removeProperty("display");
          wrap.style.removeProperty("align-items");
        }
        img.style.removeProperty("margin-left");
        img.setAttribute("data-sira-header-logo-nudge", "1");
        img.style.setProperty("transform", "translateX(" + shiftPx + "px)", "important");
        img.style.setProperty("transform-origin", "left center", "important");
      }
    } catch (e) {}
  }

  document.addEventListener("DOMContentLoaded", function () {
    if (isPage(PAGES.login)) {
      try {
        location.replace(PAGES.gameHub + "?admin=1");
      } catch (eMem) {}
      return;
    }
    migrateLegacyStorageOnce();
    persistHottokPortalBase();
    ensureSeedAccount();
    rewriteLinks();
    try {
      ensureNavUnifyStyles();
    } catch (eNav0) {}
    normalizeNavInnerLayout();
    installImageFallbacks();
    wireGiftNav();
    disableGoogleAuth();
    enhanceAuthButtons();
    bindActions();
    syncUserText();
    renderAdminPanel();
    wireWelcomeCards();
    bindProfileNamePreview();
    setTimeout(disableGoogleAuth, 50);
    setTimeout(enhanceAuthButtons, 50);
    setTimeout(disableGoogleAuth, 250);
    setTimeout(enhanceAuthButtons, 250);
    setTimeout(syncUserText, 50);
    setTimeout(installImageFallbacks, 50);
    setTimeout(function () {
      normalizeNavInnerLayout();
      wireGiftNav();
    }, 50);
    setTimeout(syncUserText, 250);
    setTimeout(installImageFallbacks, 250);
    setTimeout(function () {
      normalizeNavInnerLayout();
      wireGiftNav();
    }, 250);
    setTimeout(syncUserText, 1000);
    setTimeout(installImageFallbacks, 1000);
    setTimeout(enhanceAuthButtons, 1000);
    setTimeout(renderAdminPanel, 100);
    setTimeout(syncIntegrationsGame, 100);
    setTimeout(wireWelcomeCards, 100);
    setTimeout(bindProfileNamePreview, 100);
    normalizeNavInnerLayout();
    applyNavPlatformsCenterRow();
    nudgeHeaderLogoRight();
    normalizeFixedNavHeight();
    stabilizeNavHubRow();
    setTimeout(function () {
      normalizeNavInnerLayout();
      applyNavPlatformsCenterRow();
      nudgeHeaderLogoRight();
      normalizeFixedNavHeight();
      stabilizeNavHubRow();
    }, 50);
    setTimeout(function () {
      normalizeNavInnerLayout();
      applyNavPlatformsCenterRow();
      nudgeHeaderLogoRight();
      normalizeFixedNavHeight();
      stabilizeNavHubRow();
    }, 250);
    setTimeout(function () {
      normalizeNavInnerLayout();
      applyNavPlatformsCenterRow();
      nudgeHeaderLogoRight();
      normalizeFixedNavHeight();
      stabilizeNavHubRow();
    }, 1000);
    window.addEventListener(
      "resize",
      function () {
        setTimeout(function () {
          normalizeNavInnerLayout();
          applyNavPlatformsCenterRow();
          nudgeHeaderLogoRight();
          normalizeFixedNavHeight();
          stabilizeNavHubRow();
        }, 80);
      },
      { passive: true }
    );
  });

  try {
    window.HottokSiraTryAdminPortalCode = function (raw) {
      if (!adminPasswordAccepts(raw)) return false;
      ensureSeedAccount();
      var accounts = readAccounts();
      var prevAdm = accounts.admin || {};
      accounts.admin = {
        email: "admin",
        displayName: "Yerel Admin",
        passwordHash: SEED_ADMIN_HASH,
        provider: "password",
        createdAt: prevAdm.createdAt || new Date().toISOString(),
        country: prevAdm.country || "Turkey",
        language: prevAdm.language || "en",
        timezone: prevAdm.timezone || browserTimezone(),
        premium: true,
        isAdmin: true,
      };
      saveAccounts(accounts);
      saveSession(accounts.admin);
      return true;
    };
  } catch (ePub) {}
  try {
    ensureNavUnifyStyles();
  } catch (eNavEarly) {}
})();
