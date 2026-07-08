/**
 * Hediye kutularına ülke/bölge kodu (data-region-codes) yükler; fiyat + bölge birlikte süzer.
 * Veri: ../gift-regions.json (tools/fetch-streamtoearn-gift-regions.mjs ile üretilir).
 */
(function () {
  var container;
  var regionValueEl;
  var regionsList;

  function normKey(src) {
    var s = String(src || "")
      .trim()
      .split("?")[0];
    try {
      var u = new URL(s, window.location.href);
      return (u.hostname + u.pathname).toLowerCase();
    } catch (e) {
      return s.replace(/^https?:\/\//i, "").toLowerCase();
    }
  }

  function getActiveRegionFromUrl() {
    var r = new URL(window.location.href).searchParams.get("region") || "";
    r = String(r).trim().toUpperCase();
    if (!r) return "all";
    return r;
  }

  function getActivePriceBucket() {
    if (!container) return "all";
    return container.getAttribute("data-active-price") || "all";
  }

  function priceMatch(gift, bucket) {
    if (!bucket || bucket === "all") return true;
    return gift.getAttribute("data-price") === bucket;
  }

  function regionMatch(gift, region) {
    if (!region || region === "all") return true;
    var codes = gift.getAttribute("data-region-codes");
    if (!codes) return true;
    if (codes.indexOf("ALL") !== -1) return true;
    var parts = codes.split(/\s+/);
    for (var i = 0; i < parts.length; i++) {
      if (parts[i] === region) return true;
    }
    return false;
  }

  function refreshVisibility() {
    if (!container) return;
    var reg = getActiveRegionFromUrl();
    var bucket = getActivePriceBucket();
    var gifts = container.querySelectorAll(".gift");
    var visible = 0;
    for (var g = 0; g < gifts.length; g++) {
      var el = gifts[g];
      var ok = priceMatch(el, bucket) && regionMatch(el, reg);
      el.classList.toggle("gemtok-hide-by-region", !ok);
      if (ok) visible++;
    }
    var empty = document.getElementById("giftsEmpty");
    if (empty) empty.hidden = visible > 0;
    container.setAttribute("data-active-region", reg);
  }

  function setRegionLabel(code) {
    if (!regionValueEl || !regionsList) return;
    if (!code || code === "all") {
      regionValueEl.textContent = "Tüm ülkeler";
      return;
    }
    var link = regionsList.querySelector('a[href*="region=' + code + '"]');
    if (link) {
      var t = (link.textContent || "").trim();
      if (t) regionValueEl.textContent = t + " (" + code + ")";
      else regionValueEl.textContent = code;
    } else regionValueEl.textContent = code;
  }

  function syncRegionLinksActive(code) {
    if (!regionsList) return;
    var norm = (code || "all").toUpperCase();
    regionsList.querySelectorAll(".region a").forEach(function (a) {
      a.classList.remove("active-link");
    });
    if (norm === "ALL") {
      var allA = regionsList.querySelector('.region[data-region-name="all regions"] a');
      if (allA) allA.classList.add("active-link");
      return;
    }
    regionsList.querySelectorAll("a[href*='region=']").forEach(function (a) {
      try {
        var u = new URL(a.getAttribute("href"), window.location.href);
        var rc = (u.searchParams.get("region") || "").toUpperCase();
        if (rc === norm) a.classList.add("active-link");
      } catch (e) {
        /* ignore */
      }
    });
  }

  function applyRegionFromUrl() {
    setRegionLabel(getActiveRegionFromUrl());
    syncRegionLinksActive(getActiveRegionFromUrl());
    refreshVisibility();
  }

  function wireRegionNav() {
    if (!regionsList) return;
    regionsList.addEventListener("click", function (e) {
      var a = e.target.closest(".region a");
      if (!a) return;
      var hr = a.getAttribute("href") || "";
      var pageUrl = new URL(window.location.href);
      if (hr === "?" || hr.indexOf("region=") === -1) {
        if (hr === "?" || a.closest('.region[data-region-name="all regions"]')) {
          e.preventDefault();
          pageUrl.searchParams.delete("region");
          history.replaceState({}, "", pageUrl);
          setRegionLabel("all");
          syncRegionLinksActive("all");
          refreshVisibility();
        }
        return;
      }
      e.preventDefault();
      var u = new URL(hr, window.location.href);
      var rc = (u.searchParams.get("region") || "").toUpperCase();
      if (!rc) pageUrl.searchParams.delete("region");
      else pageUrl.searchParams.set("region", rc);
      history.replaceState({}, "", pageUrl);
      setRegionLabel(rc || "all");
      syncRegionLinksActive(rc || "all");
      refreshVisibility();
      var dropdown = regionsList.closest(".gifts-filter-dropdown");
      if (dropdown) {
        dropdown.classList.remove("open");
        var trigger = dropdown.querySelector(".gifts-filter-trigger");
        if (trigger) trigger.setAttribute("aria-expanded", "false");
      }
    });
  }

  function annotateGifts(map) {
    var gifts = container.querySelectorAll(".gift");
    for (var i = 0; i < gifts.length; i++) {
      var gift = gifts[i];
      var img = gift.querySelector("img[src]");
      var src = img ? img.getAttribute("src") : "";
      var k = normKey(src);
      var arr = map && map[k];
      if (arr && arr.length) gift.setAttribute("data-region-codes", arr.join(" "));
      else gift.setAttribute("data-region-codes", "ALL");
    }
  }

  function init() {
    container = document.getElementById("giftsContainer");
    regionValueEl = document.getElementById("regionFilterValue");
    regionsList = document.getElementById("regionsList");
    if (!container) return;

    window.__gemtokS2eRefreshGiftVisibility = refreshVisibility;

    setRegionLabel(getActiveRegionFromUrl());
    syncRegionLinksActive(getActiveRegionFromUrl());

    var jsonUrl = "streamtoearn-gifts-assets/gift-regions.json";
    fetch(jsonUrl, { cache: "no-store" })
      .then(function (r) {
        return r.ok ? r.json() : {};
      })
      .catch(function () {
        return {};
      })
      .then(function (data) {
        annotateGifts(data && typeof data === "object" ? data : {});
        applyRegionFromUrl();
      });

    wireRegionNav();
    window.addEventListener("popstate", function () {
      if (window.__gemtokS2eApplyPriceBucket) {
        try {
          window.__gemtokS2eApplyPriceBucket(new URL(window.location.href).searchParams.get("price") || "all");
        } catch (e1) {}
      }
      applyRegionFromUrl();
    });
  }

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", init);
  else init();
})();
