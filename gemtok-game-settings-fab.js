/**
 * GemTok classic oyunları — sağ üst «Ayarlar» düğmesi (dişli FAB).
 * HTML: id="gemtok-open-settings" class="gemtok-game-settings-fab" …
 * Bağlama: GemtokGameSettingsFab.wire(openSettings, { backdropId: "settings-backdrop" })
 */
(function (global) {
  var GEAR_SVG =
    '<svg class="gemtok-game-settings-fab__icon" viewBox="0 0 24 24" width="16" height="16" aria-hidden="true">' +
    '<path fill="currentColor" d="M19.14 12.94c.04-.3.06-.61.06-.94 0-.32-.02-.64-.07-.94l2.03-1.58c.18-.14.23-.41.12-.61l-1.92-3.32a.51.51 0 0 0-.59-.22l-2.39.96c-.5-.38-1.03-.7-1.62-.94l-.36-2.54A.51.51 0 0 0 9.25 2.4H5.41a.51.51 0 0 0-.47.41l-.36 2.54c-.59.24-1.13.57-1.62.94l-2.39-.96a.51.51 0 0 0-.59.22L.06 8.87c-.12.21-.08.47.12.61l2.03 1.58c-.05.31-.09.63-.09.94s.02.63.06.94l-2.03 1.58c-.18.14-.23.41-.12.61l1.92 3.32c.12.22.37.29.59.22l2.39-.96c.5.38 1.03.7 1.62.94l.36 2.54c.05.24.24.41.48.41h3.84c.24 0 .44-.17.47-.41l.36-2.54c.59-.24 1.13-.56 1.62-.94l2.39.96c.22.08.47 0 .59-.22l1.92-3.32c.12-.22.07-.47-.12-.61l-2.01-1.58zM12 15.6a3.6 3.6 0 1 1 0-7.2 3.6 3.6 0 0 1 0 7.2z"/>' +
    "</svg>";

  function fabButtonHtml(opts) {
    opts = opts || {};
    var id = opts.id || "gemtok-open-settings";
    var controls = opts.controls ? ' aria-controls="' + opts.controls + '"' : "";
    var label = opts.label || "Ayarlar";
    return (
      '<button type="button" id="' +
      id +
      '" class="gemtok-game-settings-fab"' +
      controls +
      ' aria-label="' +
      label +
      '" title="' +
      label +
      '" aria-haspopup="dialog">' +
      GEAR_SVG +
      '<span class="gemtok-game-settings-fab__label">' +
      label +
      "</span></button>"
    );
  }

  function wire(openFn, opts) {
    if (typeof openFn !== "function") return;
    opts = opts || {};
    var btnId = opts.buttonId || "gemtok-open-settings";
    var backdropId = opts.backdropId || "settings-backdrop";
    var btn = document.getElementById(btnId);
    var backdrop =
      document.getElementById(backdropId) ||
      document.getElementById("settingsModal") ||
      document.getElementById("settingsOverlay");

    if (!btn) return;

    btn.addEventListener("click", function (e) {
      e.preventDefault();
      e.stopPropagation();
      openFn();
    });

    function syncOpenClass() {
      var open = backdrop && !backdrop.hidden;
      btn.classList.toggle("is-open", !!open);
      btn.setAttribute("aria-expanded", open ? "true" : "false");
    }

    if (backdrop) {
      try {
        new MutationObserver(syncOpenClass).observe(backdrop, {
          attributes: true,
          attributeFilter: ["hidden"],
        });
      } catch (_e) {}
      syncOpenClass();
    }
  }

  global.GemtokGameSettingsFab = {
    buttonHtml: fabButtonHtml,
    wire: wire,
  };
})(typeof globalThis !== "undefined" ? globalThis : window);
