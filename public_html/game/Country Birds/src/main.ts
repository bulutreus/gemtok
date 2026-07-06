import "./style.css";
import "../../../sıra/gemtok-settings-theme.css";
import { resolveTikfinityWsUrl, shouldAutoConnectFromSearch } from "./tikfinity/config";
import { createTikfinityClient } from "./tikfinity/client";
import type { GameAction } from "./tikfinity/actions";
import { AngryGame } from "./game/angryGame";
import { BIRD_URLS, TEAM_COUNT } from "./game/assets";
import { DEFAULT_TEAM_GIFT_IDS, TEAM_SLOT_LABELS } from "./game/teamFromGift";
import { giftById, giftsSortedByName } from "./game/tiktokGiftsCatalog";

const STORAGE_ROUND_MIN = "countrybirds.roundMin";
const STORAGE_HUD_VH = "countrybirds.hudCapVh";
const STORAGE_TEAM_GIFTS = "countrybirds.teamGiftIds";
const STORAGE_TEAM_BIRD_URLS = "countrybirds.teamBirdUrls";
const STORAGE_HIDE_GIFT_VISUALS = "countrybirds.hideGiftVisuals";
const STORAGE_MANUAL_SLING_DISABLED = "countrybirds.manualSlingDisabled";

let activeRoundMinutes = 10;
let roundCycleStartMs = performance.now();
let roundTimerRaf = 0;

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

const HUD_TEAM_CARDS_HTML = Array.from({ length: TEAM_COUNT }, (_, i) => {
  const g = giftById(DEFAULT_TEAM_GIFT_IDS[i]!);
  const title = g ? `${g.name} (${g.diamonds})` : TEAM_SLOT_LABELS[i]!;
  const alt = g?.name ?? TEAM_SLOT_LABELS[i]!;
  const src = g?.icon ?? "";
  return `
        <div class="hud-card" data-team="${i}" title="${escapeHtml(title)}">
          <div class="hud-pair">
            <img class="hud-gift-img" id="hudGiftIcon-${i}" src="${escapeHtml(src)}" alt="${escapeHtml(alt)}" width="32" height="32" loading="lazy" decoding="async" />
            <img class="hud-bird" id="hudBirdImg-${i}" src="${escapeHtml(BIRD_URLS[i])}" alt="${escapeHtml(alt)}" width="32" height="32" loading="lazy" decoding="async" />
          </div>
          <div class="hud-meta">
            <span class="hud-score" id="score-${i}">0</span>
          </div>
        </div>`;
}).join("");

const app = document.querySelector<HTMLDivElement>("#app");
if (!app) throw new Error("#app yok");

app.innerHTML = `
  <div class="app-root">
    <div class="game-mount" id="gameMount">
      <div
        class="round-timer-hud"
        id="roundTimerHud"
        role="button"
        tabindex="0"
        aria-pressed="false"
        aria-label="Tur sayacı. Tıklayınca sol skor panelini gizler veya gösterir."
      >0:00</div>
      <div
        class="hud hud--settings-trigger"
        id="teamHud"
        role="button"
        tabindex="0"
        aria-label="Oyun ayarlarını aç"
        aria-haspopup="dialog"
        aria-live="polite"
      >
        ${HUD_TEAM_CARDS_HTML}
      </div>
    </div>
    <button type="button" id="gemtok-open-settings" class="gemtok-game-settings-fab" aria-controls="settingsOverlay" aria-label="Ayarlar" title="Ayarlar" aria-haspopup="dialog" aria-expanded="false">
      <svg class="gemtok-game-settings-fab__icon" viewBox="0 0 24 24" width="16" height="16" aria-hidden="true"><path fill="currentColor" d="M19.14 12.94c.04-.3.06-.61.06-.94 0-.32-.02-.64-.07-.94l2.03-1.58c.18-.14.23-.41.12-.61l-1.92-3.32a.51.51 0 0 0-.59-.22l-2.39.96c-.5-.38-1.03-.7-1.62-.94l-.36-2.54A.51.51 0 0 0 9.25 2.4H5.41a.51.51 0 0 0-.47.41l-.36 2.54c-.59.24-1.13.57-1.62.94l-2.39-.96a.51.51 0 0 0-.59.22L.06 8.87c-.12.21-.08.47.12.61l2.03 1.58c-.05.31-.09.63-.09.94s.02.63.06.94l-2.03 1.58c-.18.14-.23.41-.12.61l1.92 3.32c.12.22.37.29.59.22l2.39-.96c.5.38 1.03.7 1.62.94l.36 2.54c.05.24.24.41.48.41h3.84c.24 0 .44-.17.47-.41l.36-2.54c.59-.24 1.13-.56 1.62-.94l2.39.96c.22.08.47 0 .59-.22l1.92-3.32c.12-.22.07-.47-.12-.61l-2.01-1.58zM12 15.6a3.6 3.6 0 1 1 0-7.2 3.6 3.6 0 0 1 0 7.2z"/></svg>
      <span class="gemtok-game-settings-fab__label">Ayarlar</span>
    </button>

    <div id="settingsOverlay" class="settings-overlay gemtok-settings-theme" hidden>
      <div class="settings-overlay__backdrop" id="settingsBackdrop" aria-hidden="true"></div>
      <div class="settings-panel" role="dialog" aria-modal="true" aria-labelledby="settingsTitle">
        <h2 id="settingsTitle" class="settings-panel__title">Oyun ayarları</h2>
        <div class="settings-panel__timer-wrap">
          <span class="settings-panel__timer-label">Tur sayacı</span>
          <time class="settings-panel__timer" id="roundTimerSettings" datetime="PT0M">0:00</time>
        </div>
        <div class="settings-panel__body">
          <label class="settings-row settings-row--num">
            <span class="settings-label">Tur süresi (dakika)</span>
            <input class="settings-num" type="number" id="setRoundMin" min="1" max="120" step="1" value="10" />
          </label>

          <div class="settings-row">
            <div class="settings-labelrow">
              <span class="settings-label">Arka plan (1–8)</span>
              <span class="settings-value" id="valBg">1</span>
            </div>
            <input class="settings-slider" type="range" id="bgSelect" min="1" max="8" step="1" value="1" />
          </div>

          <label class="settings-row">
            <span class="settings-label">Manuel sapan takımı</span>
            <select class="settings-select" id="teamSelect">
              ${TEAM_SLOT_LABELS.map((label, i) => `<option value="${i}">${label}</option>`).join("")}
            </select>
          </label>

          <label class="settings-row settings-row--check">
            <span class="settings-label">Elle sapan kullanımını kapat</span>
            <input type="checkbox" id="disableManualSling" />
          </label>

          <label class="settings-row settings-row--check">
            <span class="settings-label">Hediye görsellerini gizle</span>
            <input type="checkbox" id="hideGiftVisuals" />
          </label>

          <hr class="settings-sep" />
          <div class="settings-gift-catalog-block">
          <div class="settings-row">
            <span class="settings-label">TikTok hediye listesi (LIVE)</span>
          </div>
          <ul class="settings-gift-catalog" id="giftCatalogList" role="list" aria-label="TikTok hediyeleri"></ul>
          </div>
          <div class="settings-team-gift-grid" id="teamGiftGrid"></div>

          <hr class="settings-sep" />
          <div class="settings-row">
            <span class="settings-label">Takım kuş görselleri</span>
          </div>
          <div class="settings-team-bird-grid" id="teamBirdGrid"></div>

          <div class="settings-row">
            <div class="settings-labelrow">
              <span class="settings-label">Skor paneli yüksekliği (ekran %)</span>
              <span class="settings-value" id="valHud">96%</span>
            </div>
            <input class="settings-slider" type="range" id="hudBandSlider" min="55" max="98" step="1" value="96" />
          </div>

          <hr class="settings-sep" />

          <div class="settings-btnrow">
            <button type="button" class="settings-btn settings-btn--ghost" id="btnTest">Test atışı</button>
          </div>
        </div>
        <div class="settings-panel__actions">
          <button type="button" class="settings-btn settings-btn--ghost" id="btnDefaults">Varsayılan</button>
          <button type="button" class="settings-btn settings-btn--ghost" id="btnSetCancel">İptal</button>
          <button type="button" class="settings-btn settings-btn--primary" id="btnSetSave">Kaydet</button>
        </div>
      </div>
    </div>
  </div>
`;

const streamGiftIconById = new Map<number, string>();

function populateGiftCatalog(): void {
  const ul = document.querySelector<HTMLUListElement>("#giftCatalogList");
  if (!ul) return;
  ul.innerHTML = "";
  for (const g of giftsSortedByName()) {
    const li = document.createElement("li");
    li.className = "settings-gift-catalog__row";
    const img = document.createElement("img");
    img.className = "settings-gift-catalog__img";
    img.src = g.icon;
    img.alt = "";
    img.width = 32;
    img.height = 32;
    img.loading = "lazy";
    img.decoding = "async";
    const name = document.createElement("span");
    name.className = "settings-gift-catalog__name";
    name.textContent = g.name;
    const cost = document.createElement("span");
    cost.className = "settings-gift-catalog__cost";
    cost.textContent = String(g.diamonds);
    li.appendChild(img);
    li.appendChild(name);
    li.appendChild(cost);
    ul.appendChild(li);
  }
}

let giftComboPopover: HTMLDivElement | null = null;
let giftComboPopoverSlot: number | null = null;

function syncGiftComboTrigger(slot: number, giftId: number): void {
  const wrap = document.querySelector<HTMLElement>(`.gift-combo[data-slot="${slot}"]`);
  if (!wrap) return;
  const hidden = wrap.querySelector<HTMLInputElement>(`#teamGiftId-${slot}`);
  const fid = Math.max(1, Math.floor(Number(giftId) || DEFAULT_TEAM_GIFT_IDS[slot]!));
  if (hidden) hidden.value = String(fid);
  const resolved = giftById(fid);
  const streamIcon = streamGiftIconById.get(fid);
  const img = wrap.querySelector<HTMLImageElement>(".gift-combo__trigger-img");
  const label = wrap.querySelector<HTMLElement>(".gift-combo__trigger-label");
  if (resolved) {
    if (img) {
      img.src = streamIcon || resolved.icon;
      img.alt = resolved.name;
    }
    if (label) label.textContent = `${resolved.name} (${resolved.diamonds})`;
  } else {
    if (img) {
      if (streamIcon) img.src = streamIcon;
      else img.removeAttribute("src");
      img.alt = `#${fid}`;
    }
    if (label) label.textContent = `Hediye #${fid}`;
  }
}

function buildGiftComboPopover(): HTMLDivElement {
  const pop = document.createElement("div");
  pop.className = "gift-combo-popover";
  pop.setAttribute("role", "listbox");
  pop.hidden = true;
  const scroll = document.createElement("div");
  scroll.className = "gift-combo-popover__scroll";
  for (const g of giftsSortedByName()) {
    const row = document.createElement("button");
    row.type = "button";
    row.className = "gift-combo-option";
    row.setAttribute("role", "option");
    row.dataset.giftId = String(g.id);
    const im = document.createElement("img");
    im.className = "gift-combo-option__img";
    im.src = g.icon;
    im.alt = "";
    im.width = 28;
    im.height = 28;
    im.loading = "lazy";
    im.decoding = "async";
    const name = document.createElement("span");
    name.className = "gift-combo-option__name";
    name.textContent = g.name;
    const dm = document.createElement("span");
    dm.className = "gift-combo-option__diamonds";
    dm.textContent = String(g.diamonds);
    row.append(im, name, dm);
    scroll.appendChild(row);
  }
  pop.appendChild(scroll);
  return pop;
}

function closeGiftComboPopover(): void {
  if (!giftComboPopover || giftComboPopover.hidden) {
    giftComboPopoverSlot = null;
    return;
  }
  giftComboPopover.hidden = true;
  if (giftComboPopoverSlot != null) {
    document
      .querySelector<HTMLButtonElement>(`.gift-combo[data-slot="${giftComboPopoverSlot}"] .gift-combo__trigger`)
      ?.setAttribute("aria-expanded", "false");
  }
  giftComboPopoverSlot = null;
}

function isGiftComboPopoverOpen(): boolean {
  return !!(giftComboPopover && !giftComboPopover.hidden);
}

function ensureGiftComboPopover(): HTMLDivElement {
  if (giftComboPopover) return giftComboPopover;
  giftComboPopover = buildGiftComboPopover();
  document.body.appendChild(giftComboPopover);

  return giftComboPopover;
}

function openGiftComboPopover(slot: number): void {
  const pop = ensureGiftComboPopover();
  wireGiftComboPopoverActions();
  const trig = document.querySelector<HTMLButtonElement>(`.gift-combo[data-slot="${slot}"] .gift-combo__trigger`);
  if (!trig) return;
  if (giftComboPopoverSlot === slot && !pop.hidden) {
    closeGiftComboPopover();
    return;
  }
  if (!pop.hidden && giftComboPopoverSlot != null && giftComboPopoverSlot !== slot) {
    document
      .querySelector<HTMLButtonElement>(`.gift-combo[data-slot="${giftComboPopoverSlot}"] .gift-combo__trigger`)
      ?.setAttribute("aria-expanded", "false");
  }
  giftComboPopoverSlot = slot;
  trig.setAttribute("aria-expanded", "true");
  const r = trig.getBoundingClientRect();
  const maxH = Math.min(360, Math.max(160, window.innerHeight - r.bottom - 16));
  const w = Math.max(260, Math.min(Math.max(r.width, 280), window.innerWidth - 16));
  pop.style.left = `${Math.max(8, Math.min(r.left, window.innerWidth - w - 8))}px`;
  pop.style.top = `${r.bottom + 4}px`;
  pop.style.width = `${w}px`;
  const sc = pop.querySelector<HTMLElement>(".gift-combo-popover__scroll");
  if (sc) sc.style.maxHeight = `${maxH}px`;
  pop.hidden = false;
  const cur = Math.floor(Number(document.querySelector<HTMLInputElement>(`#teamGiftId-${slot}`)?.value));
  const row = pop.querySelector<HTMLButtonElement>(`.gift-combo-option[data-gift-id="${cur}"]`);
  row?.scrollIntoView({ block: "nearest" });
}

function populateTeamGiftSelectors(): void {
  const grid = document.querySelector<HTMLDivElement>("#teamGiftGrid");
  if (!grid) return;
  grid.innerHTML = "";
  for (let i = 0; i < TEAM_COUNT; i++) {
    const lab = document.createElement("label");
    lab.className = "settings-row settings-team-gift-row";

    const cap = document.createElement("span");
    cap.className = "settings-label";
    cap.textContent = `${TEAM_SLOT_LABELS[i]!} → hediye`;

    const wrap = document.createElement("div");
    wrap.className = "gift-combo";
    wrap.dataset.slot = String(i);

    const hidden = document.createElement("input");
    hidden.type = "hidden";
    hidden.id = `teamGiftId-${i}`;
    hidden.value = String(DEFAULT_TEAM_GIFT_IDS[i]!);

    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = "gift-combo__trigger";
    btn.setAttribute("aria-haspopup", "listbox");
    btn.setAttribute("aria-expanded", "false");
    btn.setAttribute("aria-label", "Hediye seç");

    const img = document.createElement("img");
    img.className = "gift-combo__trigger-img";
    img.width = 28;
    img.height = 28;
    img.decoding = "async";

    const label = document.createElement("span");
    label.className = "gift-combo__trigger-label";

    const chev = document.createElement("span");
    chev.className = "gift-combo__chevron";
    chev.setAttribute("aria-hidden", "true");
    chev.textContent = "▾";

    btn.append(img, label, chev);
    wrap.append(hidden, btn);
    lab.append(cap, wrap);
    grid.appendChild(lab);

    syncGiftComboTrigger(i, DEFAULT_TEAM_GIFT_IDS[i]!);

    btn.addEventListener("click", (ev) => {
      ev.preventDefault();
      ev.stopPropagation();
      openGiftComboPopover(i);
    });
  }
}

const MAX_TEAM_BIRD_FILE_BYTES = 2 * 1024 * 1024;

function loadTeamBirdUrlsFromStorage(): string[] {
  try {
    const raw = localStorage.getItem(STORAGE_TEAM_BIRD_URLS);
    if (!raw) return Array.from({ length: TEAM_COUNT }, () => "");
    const arr = JSON.parse(raw) as unknown;
    if (!Array.isArray(arr)) return Array.from({ length: TEAM_COUNT }, () => "");
    return Array.from({ length: TEAM_COUNT }, (_, i) => (typeof arr[i] === "string" ? arr[i] : ""));
  } catch {
    return Array.from({ length: TEAM_COUNT }, () => "");
  }
}

let committedTeamBirdUrls: string[] = loadTeamBirdUrlsFromStorage();

function loadHideGiftVisualsFromStorage(): boolean {
  try {
    return localStorage.getItem(STORAGE_HIDE_GIFT_VISUALS) === "1";
  } catch {
    return false;
  }
}

let committedHideGiftVisuals = loadHideGiftVisualsFromStorage();

function loadManualSlingDisabledFromStorage(): boolean {
  try {
    return localStorage.getItem(STORAGE_MANUAL_SLING_DISABLED) === "1";
  } catch {
    return false;
  }
}

let committedManualSlingDisabled = loadManualSlingDisabledFromStorage();

function applyHideGiftVisuals(hidden: boolean): void {
  document.documentElement.classList.toggle("hide-gift-visuals", hidden);
}

function resolveTeamBirdUrl(slot: number, raw: string | undefined): string {
  const t = (raw ?? "").trim();
  if (!t) return BIRD_URLS[slot]!;
  if (/^https?:\/\//i.test(t) || t.startsWith("/") || t.startsWith("data:image/")) return t;
  return BIRD_URLS[slot]!;
}

function resolveTeamBirdUrlsAll(raw: readonly string[]): string[] {
  return Array.from({ length: TEAM_COUNT }, (_, i) => resolveTeamBirdUrl(i, raw[i]));
}

function readTeamBirdUrlsFromForm(): string[] {
  return Array.from({ length: TEAM_COUNT }, (_, i) => {
    const el = document.querySelector<HTMLInputElement>(`#teamBirdUrl-${i}`);
    return (el?.value ?? "").trim();
  });
}

function setTeamBirdUrlInputs(urls: readonly string[]): void {
  for (let i = 0; i < TEAM_COUNT; i++) {
    const el = document.querySelector<HTMLInputElement>(`#teamBirdUrl-${i}`);
    if (el) el.value = String(urls[i] ?? "");
    syncTeamBirdPreview(i);
  }
}

function syncTeamBirdPreview(slot: number): void {
  const raw = document.querySelector<HTMLInputElement>(`#teamBirdUrl-${slot}`)?.value ?? "";
  const img = document.querySelector<HTMLImageElement>(`#teamBirdPreview-${slot}`);
  if (img) {
    img.src = resolveTeamBirdUrl(slot, raw);
    img.alt = TEAM_SLOT_LABELS[slot] ?? "";
  }
}

function refreshHudBirdImgs(raw?: readonly string[]): void {
  const srcs = raw ?? committedTeamBirdUrls;
  for (let i = 0; i < TEAM_COUNT; i++) {
    const el = document.querySelector<HTMLImageElement>(`#hudBirdImg-${i}`);
    if (el) el.src = resolveTeamBirdUrl(i, srcs[i]);
  }
}

function populateTeamBirdRows(): void {
  const grid = document.querySelector<HTMLDivElement>("#teamBirdGrid");
  if (!grid) return;
  grid.innerHTML = "";
  for (let i = 0; i < TEAM_COUNT; i++) {
    const row = document.createElement("div");
    row.className = "settings-team-bird-row";

    const label = document.createElement("span");
    label.className = "settings-label settings-team-bird-row__label";
    label.textContent = `${TEAM_SLOT_LABELS[i]!} kuş`;

    const preview = document.createElement("img");
    preview.className = "settings-team-bird-row__preview";
    preview.id = `teamBirdPreview-${i}`;
    preview.width = 40;
    preview.height = 40;
    preview.decoding = "async";

    const urlInput = document.createElement("input");
    urlInput.type = "text";
    urlInput.className = "settings-input settings-team-bird-row__url";
    urlInput.id = `teamBirdUrl-${i}`;
    urlInput.placeholder = "Boş = varsayılan";
    urlInput.setAttribute("spellcheck", "false");
    urlInput.autocomplete = "off";

    const fileInp = document.createElement("input");
    fileInp.type = "file";
    fileInp.className = "settings-team-bird-row__file";
    fileInp.id = `teamBirdFile-${i}`;
    fileInp.accept = "image/*";

    const fileLbl = document.createElement("label");
    fileLbl.className = "settings-btn settings-btn--ghost settings-team-bird-row__filebtn";
    fileLbl.htmlFor = `teamBirdFile-${i}`;
    fileLbl.textContent = "Dosya";

    const resetBtn = document.createElement("button");
    resetBtn.type = "button";
    resetBtn.className = "settings-btn settings-btn--ghost settings-team-bird-row__reset";
    resetBtn.textContent = "Sıfırla";

    resetBtn.addEventListener("click", (ev) => {
      ev.preventDefault();
      urlInput.value = "";
      fileInp.value = "";
      syncTeamBirdPreview(i);
      if (isSettingsOpen()) refreshHudBirdImgs(readTeamBirdUrlsFromForm());
    });

    fileInp.addEventListener("change", () => {
      const f = fileInp.files?.[0];
      if (!f) return;
      if (f.size > MAX_TEAM_BIRD_FILE_BYTES) {
        window.alert("Dosya 2 MB'dan küçük olmalı.");
        fileInp.value = "";
        return;
      }
      const reader = new FileReader();
      reader.onload = () => {
        urlInput.value = String(reader.result ?? "");
        syncTeamBirdPreview(i);
        if (isSettingsOpen()) refreshHudBirdImgs(readTeamBirdUrlsFromForm());
      };
      reader.readAsDataURL(f);
      fileInp.value = "";
    });

    row.append(label, preview, urlInput, fileLbl, fileInp, resetBtn);
    grid.appendChild(row);
  }
}

document.addEventListener(
  "pointerdown",
  (e) => {
    if (!giftComboPopover || giftComboPopover.hidden) return;
    const t = e.target;
    if (!(t instanceof Node)) return;
    if (giftComboPopover.contains(t)) return;
    if (t instanceof Element && t.closest(".gift-combo__trigger")) return;
    closeGiftComboPopover();
  },
  true,
);

populateGiftCatalog();
populateTeamGiftSelectors();
populateTeamBirdRows();
setTeamBirdUrlInputs(committedTeamBirdUrls);
refreshHudBirdImgs();

const gameMount = document.querySelector<HTMLDivElement>("#gameMount")!;
const teamHud = document.querySelector<HTMLElement>("#teamHud")!;
const roundTimerHudEl = document.querySelector<HTMLDivElement>("#roundTimerHud")!;
const settingsOverlay = document.querySelector<HTMLDivElement>("#settingsOverlay")!;
const settingsBackdrop = document.querySelector<HTMLElement>("#settingsBackdrop")!;
const settingsPanel = document.querySelector<HTMLElement>(".settings-panel")!;

const bgSelect = document.querySelector<HTMLInputElement>("#bgSelect")!;
const teamSelect = document.querySelector<HTMLSelectElement>("#teamSelect")!;
const btnTest = document.querySelector<HTMLButtonElement>("#btnTest")!;
const setRoundMin = document.querySelector<HTMLInputElement>("#setRoundMin")!;
const hudBandSlider = document.querySelector<HTMLInputElement>("#hudBandSlider")!;
const valBg = document.querySelector<HTMLSpanElement>("#valBg")!;
const valHud = document.querySelector<HTMLSpanElement>("#valHud")!;
const btnDefaults = document.querySelector<HTMLButtonElement>("#btnDefaults")!;
const btnSetCancel = document.querySelector<HTMLButtonElement>("#btnSetCancel")!;
const btnSetSave = document.querySelector<HTMLButtonElement>("#btnSetSave")!;
const hideGiftVisualsCheckbox = document.querySelector<HTMLInputElement>("#hideGiftVisuals")!;
const disableManualSlingCheckbox = document.querySelector<HTMLInputElement>("#disableManualSling")!;

hideGiftVisualsCheckbox.checked = committedHideGiftVisuals;
applyHideGiftVisuals(committedHideGiftVisuals);
disableManualSlingCheckbox.checked = committedManualSlingDisabled;

function syncActiveRoundMinutesFromForm(): void {
  activeRoundMinutes = Math.max(1, Math.min(120, Number(setRoundMin.value) || 10));
}

function resetRoundCycle(): void {
  roundCycleStartMs = performance.now();
}

function getRoundDurationMs(): number {
  return Math.max(60_000, activeRoundMinutes * 60_000);
}

function getRemainingRoundMs(): number {
  const d = getRoundDurationMs();
  const elapsed = performance.now() - roundCycleStartMs;
  const mod = elapsed % d;
  return mod === 0 ? d : d - mod;
}

function formatRoundCountdown(ms: number): string {
  const sec = Math.max(0, Math.floor(ms / 1000));
  const m = Math.floor(sec / 60);
  const s = sec % 60;
  return `${m}:${String(s).padStart(2, "0")}`;
}

function roundTimerFrame(): void {
  const ms = getRemainingRoundMs();
  const txt = formatRoundCountdown(ms);
  roundTimerHudEl.textContent = txt;
  const st = document.querySelector("#roundTimerSettings");
  if (st) {
    st.textContent = txt;
    const totalSec = Math.floor(ms / 1000);
    st.setAttribute("datetime", `PT${Math.floor(totalSec / 60)}M${totalSec % 60}S`);
  }
  roundTimerRaf = requestAnimationFrame(roundTimerFrame);
}

function loadHudCapFromStorage(): void {
  try {
    const v = localStorage.getItem(STORAGE_HUD_VH);
    if (v != null && v !== "") {
      const n = Math.max(55, Math.min(98, Number(v)));
      document.documentElement.style.setProperty("--hud-cap-vh", String(n));
      hudBandSlider.value = String(n);
      valHud.textContent = `${n}%`;
      syncHudSliderFill();
    }
  } catch {
    /* ignore */
  }
}

function loadRoundMinFromStorage(): void {
  try {
    const v = localStorage.getItem(STORAGE_ROUND_MIN);
    if (v != null && v !== "") {
      const n = Math.max(1, Math.min(120, Number(v)));
      setRoundMin.value = String(n);
    }
  } catch {
    /* ignore */
  }
  syncActiveRoundMinutesFromForm();
}

function loadTeamGiftIdsFromStorage(): number[] {
  try {
    const raw = localStorage.getItem(STORAGE_TEAM_GIFTS);
    if (!raw) return [...DEFAULT_TEAM_GIFT_IDS];
    const arr = JSON.parse(raw) as unknown;
    if (!Array.isArray(arr)) return [...DEFAULT_TEAM_GIFT_IDS];
    return Array.from({ length: TEAM_COUNT }, (_, i) => {
      const v = arr[i];
      const id = typeof v === "number" ? v : Number(v);
      if (Number.isFinite(id) && Math.floor(id) > 0) return Math.floor(id);
      return DEFAULT_TEAM_GIFT_IDS[i]!;
    });
  } catch {
    return [...DEFAULT_TEAM_GIFT_IDS];
  }
}

function readTeamGiftIdsFromForm(): number[] {
  return Array.from({ length: TEAM_COUNT }, (_, i) => {
    const el = document.querySelector<HTMLInputElement>(`#teamGiftId-${i}`);
    const id = Math.floor(Number(el?.value));
    if (Number.isFinite(id) && id > 0) return id;
    return DEFAULT_TEAM_GIFT_IDS[i]!;
  });
}

function setTeamGiftSelectValues(ids: readonly number[]): void {
  for (let i = 0; i < TEAM_COUNT; i++) {
    const raw = ids[i] ?? DEFAULT_TEAM_GIFT_IDS[i]!;
    const el = document.querySelector<HTMLInputElement>(`#teamGiftId-${i}`);
    if (el) el.value = String(raw);
    syncGiftComboTrigger(i, Math.floor(Number(raw)));
  }
}

loadHudCapFromStorage();
loadRoundMinFromStorage();
resetRoundCycle();

function renderScores(scores: readonly number[]): void {
  let leading = 0;
  for (let i = 1; i < scores.length; i++) {
    if (scores[i]! > scores[leading]!) leading = i;
  }
  for (let i = 0; i < scores.length; i++) {
    const el = document.querySelector<HTMLSpanElement>(`#score-${i}`);
    if (el) el.textContent = String(scores[i]);
    const card = document.querySelector<HTMLElement>(`.hud-card[data-team="${i}"]`);
    if (card) card.classList.toggle("hud-card--leading", i === leading && scores[i]! > 0);
  }
}

const game = new AngryGame(gameMount, {
  onScore: () => renderScores(game.getScores()),
});

function refreshHudGiftIcons(ids?: readonly number[]): void {
  const list = ids ?? [...game.getTeamGiftIds()];
  for (let i = 0; i < TEAM_COUNT; i++) {
    const gid = list[i]!;
    const img = document.querySelector<HTMLImageElement>(`#hudGiftIcon-${i}`);
    const card = document.querySelector<HTMLElement>(`.hud-card[data-team="${i}"]`);
    const g = giftById(gid);
    const url = streamGiftIconById.get(gid) ?? g?.icon ?? "";
    if (img) {
      img.src = url;
      img.alt = g?.name ?? TEAM_SLOT_LABELS[i] ?? "";
    }
    if (card) {
      card.title = g ? `${g.name} (${g.diamonds})` : TEAM_SLOT_LABELS[i]!;
    }
  }
}

function wireGiftComboPopoverActions(): void {
  const pop = giftComboPopover;
  if (!pop || pop.dataset.wired === "1") return;
  pop.dataset.wired = "1";
  pop.addEventListener("click", (e) => {
    const opt = (e.target as HTMLElement).closest("button.gift-combo-option") as HTMLButtonElement | null;
    if (!opt || giftComboPopoverSlot == null) return;
    const id = Math.floor(Number(opt.dataset.giftId));
    if (!Number.isFinite(id) || id <= 0) return;
    const slot = giftComboPopoverSlot;
    closeGiftComboPopover();
    const hidden = document.querySelector<HTMLInputElement>(`#teamGiftId-${slot}`);
    if (hidden) hidden.value = String(id);
    syncGiftComboTrigger(slot, id);
    if (isSettingsOpen()) {
      game.setTeamGiftIds(readTeamGiftIdsFromForm());
      refreshHudGiftIcons();
    }
  });
}

game.setTeamGiftIds(loadTeamGiftIdsFromStorage());

type SettingsSnap = {
  bg: number;
  team: number;
  roundMin: number;
  hudVh: number;
  teamGiftIds: number[];
  teamBirdUrls: string[];
  hideGiftVisuals: boolean;
  disableManualSling: boolean;
};

let settingsSnap: SettingsSnap | null = null;

function isSettingsOpen(): boolean {
  return !settingsOverlay.hidden;
}

function syncBgSliderFill(): void {
  const v = Number(bgSelect.value);
  const pct = ((Math.max(1, Math.min(8, v)) - 1) / 7) * 100;
  bgSelect.style.setProperty("--slider-fill", `${pct}%`);
}

function syncHudSliderFill(): void {
  const v = Number(hudBandSlider.value);
  const lo = 55;
  const hi = 98;
  const pct = ((Math.max(lo, Math.min(hi, v)) - lo) / (hi - lo)) * 100;
  hudBandSlider.style.setProperty("--slider-fill", `${pct}%`);
}

function readFormSnap(): SettingsSnap {
  return {
    bg: Number(bgSelect.value),
    team: Number(teamSelect.value) || 0,
    roundMin: Math.max(1, Math.min(120, Number(setRoundMin.value) || 10)),
    hudVh: Math.max(55, Math.min(98, Number(hudBandSlider.value) || 96)),
    teamGiftIds: readTeamGiftIdsFromForm(),
    teamBirdUrls: readTeamBirdUrlsFromForm(),
    hideGiftVisuals: hideGiftVisualsCheckbox.checked,
    disableManualSling: disableManualSlingCheckbox.checked,
  };
}

function applySnapToForm(s: SettingsSnap): void {
  bgSelect.value = String(s.bg);
  valBg.textContent = String(s.bg);
  teamSelect.value = String(Math.max(0, Math.min(TEAM_COUNT - 1, s.team)));
  setRoundMin.value = String(s.roundMin);
  hudBandSlider.value = String(s.hudVh);
  valHud.textContent = `${s.hudVh}%`;
  setTeamGiftSelectValues(s.teamGiftIds);
  setTeamBirdUrlInputs(s.teamBirdUrls);
  hideGiftVisualsCheckbox.checked = s.hideGiftVisuals;
  disableManualSlingCheckbox.checked = s.disableManualSling;
  syncBgSliderFill();
  syncHudSliderFill();
}

function applySnapToGame(s: SettingsSnap): void {
  game.setBackgroundIndex(s.bg);
  game.manualTeamId = Math.max(0, Math.min(TEAM_COUNT - 1, s.team));
  game.setTeamGiftIds(s.teamGiftIds);
  refreshHudGiftIcons(s.teamGiftIds);
  void game.setTeamBirdUrls(resolveTeamBirdUrlsAll(s.teamBirdUrls));
  refreshHudBirdImgs(s.teamBirdUrls);
  applyHideGiftVisuals(s.hideGiftVisuals);
  game.setManualSlingEnabled(!s.disableManualSling);
}

function applyHudCap(vh: number): void {
  document.documentElement.style.setProperty("--hud-cap-vh", String(vh));
}

function openSettings(): void {
  if (!game.isReady()) return;
  closeGiftComboPopover();
  settingsSnap = {
    bg: game.getBackgroundIndex(),
    team: game.manualTeamId,
    roundMin: Math.max(1, Math.min(120, Number(setRoundMin.value) || 10)),
    hudVh: Math.max(55, Math.min(98, Number(hudBandSlider.value) || 96)),
    teamGiftIds: [...game.getTeamGiftIds()],
    teamBirdUrls: [...committedTeamBirdUrls],
    hideGiftVisuals: committedHideGiftVisuals,
    disableManualSling: committedManualSlingDisabled,
  };
  applySnapToForm(settingsSnap);
  refreshHudBirdImgs(settingsSnap.teamBirdUrls);
  settingsOverlay.hidden = false;
  syncBgSliderFill();
  syncHudSliderFill();
}

function closeSettings(): void {
  closeGiftComboPopover();
  settingsOverlay.hidden = true;
  settingsSnap = null;
}

function cancelSettings(): void {
  if (settingsSnap) {
    applySnapToForm(settingsSnap);
    applySnapToGame(settingsSnap);
    const vh = settingsSnap.hudVh;
    applyHudCap(vh);
    valHud.textContent = `${vh}%`;
  }
  closeSettings();
}

function saveSettings(): void {
  closeGiftComboPopover();
  const s = readFormSnap();
  applySnapToGame(s);
  applyHudCap(s.hudVh);
  try {
    localStorage.setItem(STORAGE_ROUND_MIN, String(s.roundMin));
    localStorage.setItem(STORAGE_HUD_VH, String(s.hudVh));
    localStorage.setItem(STORAGE_TEAM_GIFTS, JSON.stringify(s.teamGiftIds));
    localStorage.setItem(STORAGE_TEAM_BIRD_URLS, JSON.stringify(s.teamBirdUrls));
    localStorage.setItem(STORAGE_HIDE_GIFT_VISUALS, s.hideGiftVisuals ? "1" : "0");
    localStorage.setItem(STORAGE_MANUAL_SLING_DISABLED, s.disableManualSling ? "1" : "0");
  } catch {
    /* ignore */
  }
  activeRoundMinutes = s.roundMin;
  resetRoundCycle();
  committedTeamBirdUrls = [...s.teamBirdUrls];
  committedHideGiftVisuals = s.hideGiftVisuals;
  committedManualSlingDisabled = s.disableManualSling;
  closeSettings();
}

function defaultsToForm(): void {
  closeGiftComboPopover();
  bgSelect.value = "1";
  valBg.textContent = "1";
  teamSelect.value = "0";
  setRoundMin.value = "10";
  hudBandSlider.value = "96";
  valHud.textContent = "96%";
  setTeamGiftSelectValues([...DEFAULT_TEAM_GIFT_IDS]);
  setTeamBirdUrlInputs(Array.from({ length: TEAM_COUNT }, () => ""));
  hideGiftVisualsCheckbox.checked = false;
  applyHideGiftVisuals(false);
  disableManualSlingCheckbox.checked = false;
  if (game.isReady()) game.setManualSlingEnabled(true);
  syncBgSliderFill();
  syncHudSliderFill();
  refreshHudBirdImgs(readTeamBirdUrlsFromForm());
}

void game
  .init()
  .then(() => {
    game.bindSlingInput();
    game.setManualSlingEnabled(!committedManualSlingDisabled);
    renderScores(game.getScores());
    bgSelect.value = String(game.getBackgroundIndex());
    valBg.textContent = bgSelect.value;
    teamSelect.value = String(game.manualTeamId);
    setTeamGiftSelectValues(game.getTeamGiftIds());
    refreshHudGiftIcons();
    void game.setTeamBirdUrls(resolveTeamBirdUrlsAll(committedTeamBirdUrls));
    refreshHudBirdImgs();
    syncBgSliderFill();
    syncHudSliderFill();
  })
  .catch((err) => {
    console.error("Oyun yüklenemedi:", err);
  });

function toggleScoreHudFromTimer(): void {
  const hidden = gameMount.classList.toggle("game-mount--hud-hidden");
  roundTimerHudEl.setAttribute("aria-pressed", hidden ? "true" : "false");
  teamHud.toggleAttribute("inert", hidden);
  if (hidden) teamHud.setAttribute("aria-hidden", "true");
  else teamHud.removeAttribute("aria-hidden");
}

roundTimerHudEl.addEventListener("click", (e) => {
  e.preventDefault();
  e.stopPropagation();
  toggleScoreHudFromTimer();
});
roundTimerHudEl.addEventListener("keydown", (e) => {
  if (e.key === "Enter" || e.key === " ") {
    e.preventDefault();
    toggleScoreHudFromTimer();
  }
});

teamHud.addEventListener("click", (e) => {
  e.preventDefault();
  openSettings();
});
teamHud.addEventListener("keydown", (e) => {
  if (e.key === "Enter" || e.key === " ") {
    e.preventDefault();
    openSettings();
  }
});

const fabApi = (window as Window & { GemtokGameSettingsFab?: { wire: (fn: () => void, opts?: { backdropId?: string }) => void } }).GemtokGameSettingsFab;
if (fabApi) {
  fabApi.wire(openSettings, { backdropId: "settingsOverlay" });
} else {
  document.getElementById("gemtok-open-settings")?.addEventListener("click", (e) => {
    e.preventDefault();
    e.stopPropagation();
    openSettings();
  });
}

settingsPanel.addEventListener("click", (e) => e.stopPropagation());
settingsBackdrop.addEventListener("click", () => cancelSettings());

btnSetCancel.addEventListener("click", () => cancelSettings());
btnSetSave.addEventListener("click", () => saveSettings());
btnDefaults.addEventListener("click", () => defaultsToForm());

document.addEventListener("keydown", (e) => {
  if (e.key === "Escape" && isSettingsOpen()) {
    e.preventDefault();
    if (isGiftComboPopoverOpen()) {
      closeGiftComboPopover();
      return;
    }
    cancelSettings();
  }
});

bgSelect.addEventListener("input", () => {
  valBg.textContent = bgSelect.value;
  syncBgSliderFill();
  if (isSettingsOpen()) {
    game.setBackgroundIndex(Number(bgSelect.value));
  }
});

teamSelect.addEventListener("change", () => {
  if (isSettingsOpen()) {
    game.manualTeamId = Number(teamSelect.value) || 0;
  }
});

hideGiftVisualsCheckbox.addEventListener("change", () => {
  if (isSettingsOpen()) applyHideGiftVisuals(hideGiftVisualsCheckbox.checked);
});

disableManualSlingCheckbox.addEventListener("change", () => {
  if (isSettingsOpen() && game.isReady()) {
    game.setManualSlingEnabled(!disableManualSlingCheckbox.checked);
  }
});

document.querySelector("#teamBirdGrid")?.addEventListener("input", (e) => {
  if (!isSettingsOpen()) return;
  const t = e.target;
  if (!(t instanceof HTMLInputElement) || !t.id.startsWith("teamBirdUrl-")) return;
  const slot = Number(t.id.slice("teamBirdUrl-".length));
  if (!Number.isFinite(slot)) return;
  syncTeamBirdPreview(slot);
  refreshHudBirdImgs(readTeamBirdUrlsFromForm());
});

hudBandSlider.addEventListener("input", () => {
  const v = Math.max(55, Math.min(98, Number(hudBandSlider.value) || 96));
  valHud.textContent = `${v}%`;
  syncHudSliderFill();
  if (isSettingsOpen()) {
    applyHudCap(v);
  }
});

btnTest.addEventListener("click", () => {
  const tid = Number(teamSelect.value) || 0;
  game.testLaunch(tid);
});

function routeActionToGame(action: GameAction): void {
  if (!game.isReady()) return;
  switch (action.type) {
    case "spawnGiftBurst": {
      const tokens = action.tokenCount ?? action.diamondCount ?? 1;
      if (action.skip || tokens <= 0) break;
      const ids = game.getTeamGiftIds();
      if (action.giftId != null && action.giftPictureUrl) {
        streamGiftIconById.set(action.giftId, action.giftPictureUrl);
        refreshHudGiftIcons(ids);
      }
      game.enqueueGiftLaunch(action.giftName, tokens, action.user, action.giftId);
      break;
    }
    default:
      break;
  }
}

const client = createTikfinityClient({
  getUrl: () => resolveTikfinityWsUrl(),
  maxPerFrame: 6,
  onAction(action) {
    routeActionToGame(action);
  },
});

const auto = shouldAutoConnectFromSearch(window.location.search);
if (auto) {
  client.connect();
}

window.addEventListener("beforeunload", () => {
  cancelAnimationFrame(roundTimerRaf);
  client.disconnect();
  game.destroy();
});

roundTimerRaf = requestAnimationFrame(roundTimerFrame);
