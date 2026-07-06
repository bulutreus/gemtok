/**
 * Playroom SDK TikTok mode: after an interrupted session `window.__playroomjs_mounted`
 * may stay true and the next `insertCoin` becomes a silent no-op. (playroomkit: `fE`)
 *
 * `insertCoin` appends **.bootstrap-wrapper** (full-screen TikTok sign-in UI) to `body`.
 * React may remount that node; hiding by class alone is not reliable.
 * Fix: in `styles.css` `.bootstrap-wrapper` is hidden by default and only shown when
 * `body[data-arena-playroom-ui="active"]` (during the `insertCoin` flow).
 */

/** Allow the `insertCoin` UI to show (Playroom TikTok entry). */
export const PLAYROOM_UI_ATTR = "data-arena-playroom-ui";
export const PLAYROOM_UI_ACTIVE = "active";

/** True only during `insertCoin`; otherwise any re-added shell is removed from the DOM. */
let allowPlayroomBootstrapInDom = false;

export function setAllowPlayroomBootstrapInDom(allowed: boolean): void {
  allowPlayroomBootstrapInDom = allowed;
}

export function isPlayroomBootstrapAllowedInDom(): boolean {
  return allowPlayroomBootstrapInDom;
}

function removeAllBootstrapWrappers(): void {
  for (const el of Array.from(document.querySelectorAll(".bootstrap-wrapper"))) {
    el.remove();
  }
}

/** Remove Playroom shell nodes only (does not touch the mount flag). */
export function removePlayroomBootstrapShellFromDom(): void {
  removeAllBootstrapWrappers();
}

let shellEvictionRaf = 0;

function scheduleBootstrapEvictionIfBlocked(): void {
  if (allowPlayroomBootstrapInDom || shellEvictionRaf !== 0) return;
  shellEvictionRaf = requestAnimationFrame(() => {
    shellEvictionRaf = 0;
    if (allowPlayroomBootstrapInDom) return;
    if (document.querySelector(".bootstrap-wrapper")) {
      removeAllBootstrapWrappers();
    }
  });
}

let shellEvictionObserver: MutationObserver | null = null;

/**
 * Removes `.bootstrap-wrapper` nodes that appear while not in the insertCoin flow (SDK remounts).
 * Only reacts when a node is actually added; avoids churn from frequent HUD innerHTML updates.
 */
export function ensurePlayroomShellEvictionObserver(): void {
  if (shellEvictionObserver != null || typeof MutationObserver === "undefined") return;
  shellEvictionObserver = new MutationObserver((mutations) => {
    if (allowPlayroomBootstrapInDom) return;
    for (const m of mutations) {
      for (const n of m.addedNodes) {
        if (!(n instanceof Element)) continue;
        if (n.classList.contains("bootstrap-wrapper") || n.querySelector(".bootstrap-wrapper")) {
          scheduleBootstrapEvictionIfBlocked();
          return;
        }
      }
    }
  });
  const root = document.documentElement;
  shellEvictionObserver.observe(root, { childList: true, subtree: true });
}

/** Clear Playroom leftovers; call when closing the TikTok listener or before reconnecting. */
export function resetPlayroomTikTokMount(): void {
  setAllowPlayroomBootstrapInDom(false);
  const w = window as Window & { __playroomjs_mounted?: boolean };
  document.body.removeAttribute(PLAYROOM_UI_ATTR);
  removeAllBootstrapWrappers();
  delete w.__playroomjs_mounted;
}

if (typeof window !== "undefined") {
  queueMicrotask(() => ensurePlayroomShellEvictionObserver());
}
