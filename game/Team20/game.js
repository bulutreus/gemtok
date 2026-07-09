const COUNTRIES = [
  { name: 'turkey',      code: 'tr', emoji: '🇹🇷', shirt: '#3b82f6' },
  { name: 'palestine',   code: 'ps', emoji: '🇵🇸', shirt: '#fbbf24' },
  { name: 'kurdistan',   code: 'kurdistan', emoji: '☀️', shirt: '#ef4444' },
  { name: 'afghanistan', code: 'af', emoji: '🇦🇫', shirt: '#22c55e' },
  { name: 'syria',       code: 'sy', emoji: '🇸🇾', shirt: '#a855f7' },
  { name: 'israel',      code: 'il', emoji: '🇮🇱', shirt: '#06b6d4' },
  { name: 'azerbaijan',  code: 'az', emoji: '🇦🇿', shirt: '#f97316' },
  { name: 'turkmenistan',code: 'tm', emoji: '🇹🇲', shirt: '#ec4899' },
  { name: 'germany',     code: 'de', emoji: '🇩🇪', shirt: '#ffffff' },
  { name: 'iraq',        code: 'iq', emoji: '🇮🇶', shirt: '#84cc16' },
  { name: 'brasil',      code: 'br', emoji: '🇧🇷', shirt: '#eab308' },
  { name: 'malaysia',    code: 'my', emoji: '🇲🇾', shirt: '#14b8a6' },
  { name: 'thailand',    code: 'th', emoji: '🇹🇭', shirt: '#6366f1' },
  { name: 'vietnam',     code: 'vn', emoji: '🇻🇳', shirt: '#f43f5e' },
  { name: 'philippines', code: 'ph', emoji: '🇵🇭', shirt: '#0ea5e9' },
  { name: 'singapore',   code: 'sg', emoji: '🇸🇬', shirt: '#d946ef' },
  { name: 'myanmar',     code: 'mm', emoji: '🇲🇲', shirt: '#10b981' },
  { name: 'cambodia',    code: 'kh', emoji: '🇰🇭', shirt: '#fb923c' },
  { name: 'laos',        code: 'la', emoji: '🇱🇦', shirt: '#8b5cf6' },
  { name: 'brunei',      code: 'bn', emoji: '🇧🇳', shirt: '#facc15' },
];

const TEAM_CHAT_ALIASES = COUNTRIES.map((c) => {
  const aliases = new Set([c.name, c.code]);
  const extras = {
    turkey: ['türkiye', 'turkiye', 'turk', 'türk'],
    palestine: ['filistin', 'filistin'],
    kurdistan: ['kürdistan', 'kurd', 'kurdish'],
    afghanistan: ['afganistan'],
    syria: ['suriye'],
    israel: ['israil'],
    azerbaijan: ['azerbaycan'],
    turkmenistan: ['türkmenistan', 'turkmen'],
    germany: ['almanya', 'deutschland'],
    iraq: ['irak'],
    brasil: ['brazil', 'brezilya'],
    malaysia: ['malezya'],
    thailand: ['tayland'],
    vietnam: ['viet nam'],
    philippines: ['filipinler'],
    singapore: ['singapur'],
    myanmar: ['burma', 'birmanya'],
    cambodia: ['kamboçya', 'kambocya'],
    laos: ['laos'],
    brunei: ['brunei'],
  };
  (extras[c.name] ?? []).forEach((a) => aliases.add(a));
  return [...aliases];
});

const COUNTRY_SPEECH_NAMES = {
  turkey: 'Turkey',
  palestine: 'Palestine',
  kurdistan: 'Kurdistan',
  afghanistan: 'Afghanistan',
  syria: 'Syria',
  israel: 'Israel',
  azerbaijan: 'Azerbaijan',
  turkmenistan: 'Turkmenistan',
  germany: 'Germany',
  iraq: 'Iraq',
  brasil: 'Brazil',
  malaysia: 'Malaysia',
  thailand: 'Thailand',
  vietnam: 'Vietnam',
  philippines: 'Philippines',
  singapore: 'Singapore',
  myanmar: 'Myanmar',
  cambodia: 'Cambodia',
  laos: 'Laos',
  brunei: 'Brunei',
};

const speechQueue = [];
let speechBusy = false;
let speechVoice = null;

const DEEP_VOICE_HINTS = [
  'david', 'mark', 'guy', 'ryan', 'christopher', 'eric', 'daniel', 'james',
  'microsoft david', 'google uk english male', 'english male', 'male',
];

const FEMALE_VOICE_HINTS = [
  'zira', 'samantha', 'victoria', 'karen', 'moira', 'jenny', 'aria', 'female', 'hazel', 'susan',
];

function pickDeepEnglishVoice(voices) {
  const english = voices.filter((v) => v.lang.startsWith('en'));
  if (!english.length) return voices[0] ?? null;

  for (const hint of DEEP_VOICE_HINTS) {
    const match = english.find((v) => v.name.toLowerCase().includes(hint));
    if (match) return match;
  }

  const deeper = english.filter(
    (v) => !FEMALE_VOICE_HINTS.some((hint) => v.name.toLowerCase().includes(hint)),
  );
  return deeper[0] ?? english[0];
}

function initSpeech() {
  if (!('speechSynthesis' in window)) return;

  const pickVoice = () => {
    speechVoice = pickDeepEnglishVoice(speechSynthesis.getVoices());
  };

  pickVoice();
  speechSynthesis.addEventListener('voiceschanged', pickVoice);

  const unlock = () => {
    speechSynthesis.resume?.();
    document.removeEventListener('click', unlock);
    document.removeEventListener('keydown', unlock);
  };
  document.addEventListener('click', unlock, { once: true });
  document.addEventListener('keydown', unlock, { once: true });
}

function getCountrySpeechName(lane) {
  const key = COUNTRIES[lane]?.name;
  if (!key) return '';
  return COUNTRY_SPEECH_NAMES[key] ?? key;
}

function processSpeechQueue() {
  if (speechBusy || !speechQueue.length || !('speechSynthesis' in window)) return;

  speechBusy = true;
  const text = speechQueue.shift();
  const utterance = new SpeechSynthesisUtterance(text);
  utterance.lang = 'en-US';
  utterance.rate = 1.35;
  utterance.pitch = 0.72;
  utterance.volume = 1;
  if (speechVoice) utterance.voice = speechVoice;

  const done = () => {
    speechBusy = false;
    processSpeechQueue();
  };

  utterance.onend = done;
  utterance.onerror = done;
  speechSynthesis.speak(utterance);
}

function speakCountry(lane) {
  const text = getCountrySpeechName(lane);
  if (!text) return;
  speechQueue.push(text);
  processSpeechQueue();
}

const canvas = document.getElementById('gameCanvas');
const ctx = canvas.getContext('2d');

const W = 540;
const H = 960;
const LANE_COUNT = 20;
const FINISH_RATIO = 0.78;
const SCORE_ZONE_W = W * (1 - FINISH_RATIO);

canvas.width = W;
canvas.height = H;

const laneH = H / LANE_COUNT;
const finishX = W * FINISH_RATIO;

const LAYOUT = {
  giftX: 4,
  giftW: 24,
  giftH: 24,
  giftGap: 4,
  flagW: 30,
  flagH: 24,
};

const TIKTOK_GIFTS = window.TIKTOK_GIFTS ?? [];

const GROUP_START_X = LAYOUT.giftX + LAYOUT.giftW + LAYOUT.giftGap;
const TEAM_GIFT_STORAGE_KEY = 'team20-team-gifts';

const LEGACY_GIFT_NAMES = [
  'Rose', 'TikTok', 'Finger Heart', 'GG', 'Doughnut', 'Perfume', 'Lion', 'Cap',
  'Confetti', 'Submarine', 'Hearts', 'Interstellar', 'Mic', 'Sunglasses', 'Swan',
  'Fireworks', 'Panda', 'Carousel', 'Garland', 'Money Gun',
];

const GIFT_NAME_ALIASES = {
  'finger heart': ['corazón con los dedos', 'corazon con los dedos', 'fingerheart', 'parmak kalbi', 'parmak kalp'],
  confetti: ['confeti', 'konfeti'],
  hearts: ['corazones', 'heart me', 'heart', 'kalp', 'kalpler', 'corazón con los dedos'],
  sunglasses: ['gafas de sol', 'güneş gözlüğü', 'gunes gozlugu'],
  mic: ['mike', 'mikrofon'],
  rose: ['rosa', 'gül', 'gul'],
  perfume: ['parfüm', 'parfum'],
  doughnut: ['donut', 'tulumba', 'simit'],
  'money gun': ['moneygun', 'para tabancası', 'para tabancasi'],
  lion: ['aslan'],
  gg: ['iyi oyun', 'iyioyun'],
  tiktok: ['tik tok'],
  'cake slice': ['pasta dilimi', 'pasta'],
  'thumbs up': ['beğeni', 'begeni', 'like'],
};

function normalizeGiftName(name) {
  return (name ?? '').toLowerCase().trim().replace(/\s+/g, ' ');
}

const KNOWN_GIFT_IDS = {
  5655: 'Rose',
  5269: 'TikTok',
  6064: 'GG',
  5827: 'Finger Heart',
  5658: 'Doughnut',
  5659: 'Perfume',
  5660: 'Lion',
};

function findGiftIndexByName(name) {
  const normalized = normalizeGiftName(name);
  if (!normalized) return -1;

  let idx = TIKTOK_GIFTS.findIndex((g) => normalizeGiftName(g.name) === normalized);
  if (idx >= 0) return idx;

  for (const [canonical, aliases] of Object.entries(GIFT_NAME_ALIASES)) {
    const canonicalIdx = TIKTOK_GIFTS.findIndex((g) => normalizeGiftName(g.name) === canonical);
    if (canonicalIdx < 0) continue;
    if (aliases.some((alias) => normalized === alias || normalized.includes(alias) || alias.includes(normalized))) {
      return canonicalIdx;
    }
  }

  idx = TIKTOK_GIFTS.findIndex((g) => {
    const giftName = normalizeGiftName(g.name);
    return giftName.includes(normalized) || normalized.includes(giftName);
  });
  return idx;
}

function findGiftIndexById(giftId) {
  const id = Number(giftId);
  if (!Number.isFinite(id)) return -1;

  let idx = TIKTOK_GIFTS.findIndex((g) => Number(g.id) === id);
  if (idx >= 0) return idx;

  const knownName = KNOWN_GIFT_IDS[id];
  if (knownName) return findGiftIndexByName(knownName);

  return -1;
}

function getDefaultTeamGiftAssignments() {
  return COUNTRIES.map((_, i) => findGiftIndexByName(LEGACY_GIFT_NAMES[i % LEGACY_GIFT_NAMES.length]) ?? (i % TIKTOK_GIFTS.length));
}

function loadTeamGiftAssignments() {
  try {
    const stored = JSON.parse(localStorage.getItem(TEAM_GIFT_STORAGE_KEY));
    if (stored?.v === 2 && Array.isArray(stored.names) && stored.names.length === LANE_COUNT) {
      return stored.names.map((name, i) => {
        const idx = findGiftIndexByName(name);
        return idx >= 0 ? idx : getDefaultTeamGiftAssignments()[i];
      });
    }

    if (Array.isArray(stored) && stored.length === LANE_COUNT) {
      return stored.map((idx, i) => {
        if (Number.isInteger(idx) && idx >= 0 && idx < LEGACY_GIFT_NAMES.length) {
          const migrated = findGiftIndexByName(LEGACY_GIFT_NAMES[idx]);
          if (migrated >= 0) return migrated;
        }
        if (Number.isInteger(idx) && idx >= 0 && idx < TIKTOK_GIFTS.length) return idx;
        return getDefaultTeamGiftAssignments()[i];
      });
    }

    return getDefaultTeamGiftAssignments();
  } catch {
    return getDefaultTeamGiftAssignments();
  }
}

function saveTeamGiftAssignments(assignments) {
  localStorage.setItem(TEAM_GIFT_STORAGE_KEY, JSON.stringify({
    v: 2,
    names: assignments.map((idx) => TIKTOK_GIFTS[idx]?.name ?? LEGACY_GIFT_NAMES[idx % LEGACY_GIFT_NAMES.length]),
  }));
}

function applyTeamGiftAssignments(assignments) {
  assignments.forEach((giftIndex, lane) => {
    if (runners[lane]) runners[lane].giftIndex = giftIndex;
  });
}

function setTeamGift(lane, giftIndex) {
  teamGiftAssignments[lane] = giftIndex;
  runners[lane].giftIndex = giftIndex;
  saveTeamGiftAssignments(teamGiftAssignments);
}

function handleLiveAction(action) {
  if (action.type === 'gift') {
    let giftIdx = findGiftIndexByName(action.meta?.giftName);
    if (giftIdx < 0 && action.meta?.giftId != null) {
      giftIdx = findGiftIndexById(action.meta.giftId);
    }
    if (giftIdx < 0) return;

    let giftLane = null;
    for (let i = 0; i < runners.length; i++) {
      if (runners[i].giftIndex === giftIdx) {
        giftLane = i;
        break;
      }
    }
    if (giftLane === null) return;

    const steps = Math.max(1, Math.round(action.meta?.diamonds ?? 1));
    boostRunner(giftLane, steps);
    speakCountry(giftLane);
    return;
  }

  if (action.type === 'chat' && action.meta?.matchedCountry) {
    boostRunner(action.lane, 1);
    speakCountry(action.lane);
  }
}

function getLaneForGiftName(giftName) {
  let incomingIdx = findGiftIndexByName(giftName);
  if (incomingIdx < 0) return null;

  for (let i = 0; i < runners.length; i++) {
    if (runners[i].giftIndex === incomingIdx) return i;
  }

  return null;
}

let teamGiftAssignments = loadTeamGiftAssignments();

const RACE = {
  startX: GROUP_START_X,
  maxSteps: 28,
  stepPx: (finishX - GROUP_START_X - 55) / 28,
  flagGap: 0,
  approachFrames: 28,
  pushFrames: 18,
};

const ROAD = {
  labelFont: '900 20px "Arial Black", Impact, "Segoe UI", Arial, sans-serif',
  labelColor: 'rgba(210, 210, 215, 0.88)',
  labelShadow: 'rgba(0, 0, 0, 0.55)',
  passIntervalMs: 8000,
  visibleRatio: 0.45,
  laneStaggerMs: 200,
};

const runners = COUNTRIES.map((c, i) => ({
  ...c,
  index: i,
  giftIndex: teamGiftAssignments[i],
  step: 0,
  queue: 0,
  push: null,
  score: 0,
  animPhase: Math.random() * Math.PI * 2,
  animSpeed: 0.04 + Math.random() * 0.012,
}));

const KURDISTAN_FLAG_SVG = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 90 60">
  <rect width="90" height="20" fill="#EE2A35"/>
  <rect y="20" width="90" height="20" fill="#FFFFFF"/>
  <rect y="40" width="90" height="20" fill="#278E43"/>
  <circle cx="45" cy="30" r="12" fill="#FDB913"/>
  <g stroke="#FDB913" stroke-width="3" stroke-linecap="round">
    <line x1="45" y1="14" x2="45" y2="6"/><line x1="45" y1="46" x2="45" y2="54"/>
    <line x1="29" y1="30" x2="21" y2="30"/><line x1="61" y1="30" x2="69" y2="30"/>
    <line x1="34" y1="19" x2="28" y2="13"/><line x1="56" y1="41" x2="62" y2="47"/>
    <line x1="56" y1="19" x2="62" y2="13"/><line x1="34" y1="41" x2="28" y2="47"/>
  </g>
</svg>`;

const EMOJI_CDN = 'https://fonts.gstatic.com/s/e/notoemoji/latest';
const flagImages = {};
const giftImages = {};

function loadGiftImages() {
  TIKTOK_GIFTS.forEach((gift, index) => {
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.src = gift.url;
    giftImages[index] = img;
  });
}

function drawGiftIcon(runner, cy) {
  const img = giftImages[runner.giftIndex];
  if (!img?.complete || !img.naturalWidth) return;
  ctx.drawImage(
    img,
    LAYOUT.giftX,
    cy - LAYOUT.giftH / 2,
    LAYOUT.giftW,
    LAYOUT.giftH,
  );
}

function emojiToUrl(emoji) {
  const cps = [...emoji].map((ch) => ch.codePointAt(0).toString(16));
  return `${EMOJI_CDN}/${cps.join('_')}/512.png`;
}

function loadEmojiFlags() {
  COUNTRIES.forEach((c) => {
    const img = new Image();
    if (c.code === 'kurdistan') {
      img.src = `data:image/svg+xml,${encodeURIComponent(KURDISTAN_FLAG_SVG)}`;
    } else {
      img.crossOrigin = 'anonymous';
      img.onerror = () => {
        const cps = [...c.emoji].map((ch) => ch.codePointAt(0).toString(16)).filter((cp) => cp !== 'fe0f');
        if (cps.length) img.src = `${EMOJI_CDN}/${cps.join('_')}/512.png`;
      };
      img.src = emojiToUrl(c.emoji);
    }
    flagImages[c.code] = img;
  });
}

function drawFlag(country, x, cy, w = LAYOUT.flagW, h = LAYOUT.flagH) {
  const img = flagImages[country.code];
  if (!img?.complete || !img.naturalWidth) return;
  ctx.drawImage(img, x, cy - h / 2, w, h);
}

const RUNNER_SPRITE_W = 200;
const RUNNER_TARGET_HEIGHT_RATIO = 0.94;
const RUNNER_FOOT_Y_RATIO = 0.5 + LAYOUT.flagH / (2 * laneH);

const CHARACTER_PACKAGES = [
  {
    id: 'character1',
    name: 'Karakter 1',
    videos: [
      'character1/110d21b53a6d828ef3fe2b938eeeb7cb.webm',
      'character1/2225c29a07227c1000b034050f0d6880.webm',
      'character1/bbc58138bb1b33a777193500bd5b4c41.webm',
      'character1/fb31f98bfea4c6cd9c7ca220944d94ea.webm',
    ],
  },
  {
    id: 'character2',
    name: 'Karakter 2',
    videos: [
      'character2/4380c32abddbdc7ff0f54fa199d7b3ef (1).webm',
      'character2/4380c32abddbdc7ff0f54fa199d7b3ef.webm',
      'character2/f8689f28f1cfcc59e10fe6be388f485b.webm',
    ],
  },
  {
    id: 'character3',
    name: 'Karakter 3',
    videos: [
      'character3/66b38d592400327fb0b5d72f4928bdb5.webm',
      'character3/89fa2c8a54cb8c463a5e8a6d587dedda.webm',
      'character3/8b3e7007ca20e710e6448a7a9c376e8e.webm',
    ],
  },
  {
    id: 'character4',
    name: 'Karakter 4',
    videos: [
      'character4/6d39acd1014e5e9b18e3e688d7d8cfe6.webm',
      'character4/9e898dd745fb5c2d710446fdca6a97f3.webm',
      'character4/b9e648f8d3d3960a1501cf5146e7f29b (1).webm',
      'character4/b9e648f8d3d3960a1501cf5146e7f29b.webm',
      'character4/f8d9d6c417ad3abce4a8fd8a560f1574.webm',
    ],
  },
  {
    id: 'character5',
    name: 'Karakter 5',
    videos: [
      'character5/5ce0ace151821b42665ebf2ab9368111.webm',
      'character5/771e91da834ab57a74778f391995bdf5.webm',
      'character5/d1d7f56d835e377ebcdc790449adc0f4 (1).webm',
      'character5/e756f30cf56e3583b914f74b7d7068cb.webm',
    ],
  },
  {
    id: 'character6',
    name: 'Karakter 6',
    videos: [
      'character6/6314434e849291966063d73c2a124851.webm',
      'character6/7b1db30e957fa57e8d62469b43f838cf (1).webm',
      'character6/ac216a11eae4845310e20b1abe8beddb.webm',
    ],
  },
  {
    id: 'character7',
    name: 'Karakter 7',
    videos: ['character7/1d64eed0cd7637418532bfcb1f453af9.webm'],
  },
  {
    id: 'character8',
    name: 'Karakter 8',
    videos: ['character8/7ab79c48cb9f5c2960465eb31f77cad0.webm'],
  },
  {
    id: 'character9',
    name: 'Karakter 9',
    videos: [
      'character9/344a6fdb01e506d7b765b95aae8d833b.webm',
      'character9/3475409b66aeea0def6daa5a561833d6.webm',
      'character9/7ab79c48cb9f5c2960465eb31f77cad0 (1).webm',
      'character9/9a86ec2933221d2706eee6a961a073d7.webm',
    ],
  },
  {
    id: 'character10',
    name: 'Karakter 10',
    videos: ['character10/1d64eed0cd7637418532bfcb1f453af9.webm'],
  },
];

const ALL_CHARACTER_VIDEOS = [...new Set(CHARACTER_PACKAGES.flatMap((pkg) => pkg.videos))];

const CHARACTERS = [
  { id: 'all', name: 'Tüm Karakterler', videos: ALL_CHARACTER_VIDEOS },
  ...CHARACTER_PACKAGES,
];

const CHARACTER_STORAGE_KEY = 'team20-selected-character';

function getStoredCharacterId() {
  const stored = localStorage.getItem(CHARACTER_STORAGE_KEY);
  return CHARACTERS.some((c) => c.id === stored) ? stored : CHARACTERS[0].id;
}

function getCharacterById(id) {
  return CHARACTERS.find((c) => c.id === id) ?? CHARACTERS[0];
}

let selectedCharacterId = getStoredCharacterId();

function toVideoSrc(path) {
  if (!path) return '';
  const slash = path.lastIndexOf('/');
  if (slash === -1) return encodeURI(path);
  return `${path.slice(0, slash + 1)}${encodeURIComponent(path.slice(slash + 1))}`;
}

const VIDEO_FIT_STORAGE_KEY = 'team20-video-fits-v4';
const videoFitCache = new Map();
const videoFitPending = new Map();
let runnerLayerSize = { w: 0, h: 0 };

function loadStoredVideoFits() {
  try {
    return JSON.parse(localStorage.getItem(VIDEO_FIT_STORAGE_KEY)) || {};
  } catch {
    return {};
  }
}

function saveStoredVideoFit(path, fit) {
  const stored = loadStoredVideoFits();
  stored[path] = fit;
  localStorage.setItem(VIDEO_FIT_STORAGE_KEY, JSON.stringify(stored));
}

function getFallbackVideoBounds(vw, vh) {
  const bw = Math.max(1, Math.round(vw * 0.52));
  const bh = Math.max(1, Math.round(vh * 0.76));
  return {
    bx: Math.max(0, Math.round((vw - bw) / 2)),
    by: Math.max(0, Math.round(vh * 0.12)),
    bw,
    bh,
  };
}

function detectContentBounds(imageData, vw, vh) {
  const data = imageData.data;
  const alphaMin = 10;
  let minX = vw;
  let minY = vh;
  let maxX = -1;
  let maxY = -1;

  for (let y = 0; y < vh; y++) {
    for (let x = 0; x < vw; x++) {
      const alpha = data[(y * vw + x) * 4 + 3];
      if (alpha < alphaMin) continue;
      if (x < minX) minX = x;
      if (y < minY) minY = y;
      if (x > maxX) maxX = x;
      if (y > maxY) maxY = y;
    }
  }

  if (maxX >= minX) {
    const alphaBounds = trimEmptyEdges(data, vw, vh, {
      bx: minX,
      by: minY,
      bw: maxX - minX + 1,
      bh: maxY - minY + 1,
    }, alphaMin);
    const coversFrame = alphaBounds.bw >= vw * 0.92 && alphaBounds.bh >= vh * 0.92;
    if (!coversFrame) return alphaBounds;
  }

  const sample = (sx, sy) => {
    const i = (sy * vw + sx) * 4;
    return [data[i], data[i + 1], data[i + 2]];
  };
  const corners = [sample(0, 0), sample(vw - 1, 0), sample(0, vh - 1), sample(vw - 1, vh - 1)];
  const bg = corners.reduce((acc, rgb) => [acc[0] + rgb[0], acc[1] + rgb[1], acc[2] + rgb[2]], [0, 0, 0])
    .map((v) => v / corners.length);
  const diffMin = 20 * 20;

  minX = vw;
  minY = vh;
  maxX = -1;
  maxY = -1;

  for (let y = 0; y < vh; y++) {
    for (let x = 0; x < vw; x++) {
      const i = (y * vw + x) * 4;
      const dr = data[i] - bg[0];
      const dg = data[i + 1] - bg[1];
      const db = data[i + 2] - bg[2];
      if (dr * dr + dg * dg + db * db < diffMin) continue;
      if (x < minX) minX = x;
      if (y < minY) minY = y;
      if (x > maxX) maxX = x;
      if (y > maxY) maxY = y;
    }
  }

  if (maxX < minX) return getFallbackVideoBounds(vw, vh);
  return trimEmptyEdges(data, vw, vh, {
    bx: minX,
    by: minY,
    bw: maxX - minX + 1,
    bh: maxY - minY + 1,
  }, alphaMin, diffMin, bg);
}

function pixelIsContent(data, vw, x, y, alphaMin, diffMin, bg) {
  const i = (y * vw + x) * 4;
  if (data[i + 3] >= alphaMin) return true;
  if (!bg || !diffMin) return false;
  const dr = data[i] - bg[0];
  const dg = data[i + 1] - bg[1];
  const db = data[i + 2] - bg[2];
  return dr * dr + dg * dg + db * db >= diffMin;
}

function trimEmptyEdges(data, vw, vh, bounds, alphaMin = 10, diffMin = 0, bg = null) {
  let { bx, by, bw, bh } = bounds;
  const fillThreshold = 0.025;

  const rowFill = (y) => {
    let count = 0;
    for (let x = bx; x < bx + bw; x++) {
      if (pixelIsContent(data, vw, x, y, alphaMin, diffMin, bg)) count++;
    }
    return count / bw;
  };

  const colFill = (x) => {
    let count = 0;
    for (let y = by; y < by + bh; y++) {
      if (pixelIsContent(data, vw, x, y, alphaMin, diffMin, bg)) count++;
    }
    return count / bh;
  };

  while (bh > 1 && rowFill(by) < fillThreshold) {
    by++;
    bh--;
  }
  while (bh > 1 && rowFill(by + bh - 1) < fillThreshold) {
    bh--;
  }
  while (bw > 1 && colFill(bx) < fillThreshold) {
    bx++;
    bw--;
  }
  while (bw > 1 && colFill(bx + bw - 1) < fillThreshold) {
    bw--;
  }

  return { bx, by, bw: Math.max(1, bw), bh: Math.max(1, bh) };
}

function unionVideoBounds(a, b) {
  if (!a) return b;
  if (!b) return a;
  const bx = Math.min(a.bx, b.bx);
  const by = Math.min(a.by, b.by);
  const right = Math.max(a.bx + a.bw, b.bx + b.bw);
  const bottom = Math.max(a.by + a.bh, b.by + b.bh);
  return { bx, by, bw: right - bx, bh: bottom - by };
}

function captureVideoFrameBounds(video, vw, vh) {
  const maxSampleW = 360;
  const sampleScale = vw > maxSampleW ? maxSampleW / vw : 1;
  const sw = Math.max(1, Math.round(vw * sampleScale));
  const sh = Math.max(1, Math.round(vh * sampleScale));

  const canvas = document.createElement('canvas');
  canvas.width = sw;
  canvas.height = sh;
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  ctx.drawImage(video, 0, 0, sw, sh);

  let bounds;
  try {
    bounds = detectContentBounds(ctx.getImageData(0, 0, sw, sh), sw, sh);
  } catch {
    return getFallbackVideoBounds(vw, vh);
  }

  if (sampleScale === 1) return bounds;

  return {
    bx: Math.round(bounds.bx / sampleScale),
    by: Math.round(bounds.by / sampleScale),
    bw: Math.max(1, Math.round(bounds.bw / sampleScale)),
    bh: Math.max(1, Math.round(bounds.bh / sampleScale)),
  };
}

function seekVideo(video, time) {
  return new Promise((resolve) => {
    let settled = false;
    const done = () => {
      if (settled) return;
      settled = true;
      video.removeEventListener('seeked', done);
      clearTimeout(timer);
      resolve();
    };
    const timer = setTimeout(done, 220);
    video.addEventListener('seeked', done, { once: true });
    try {
      video.currentTime = time;
    } catch {
      done();
    }
  });
}

function analyzeVideoFit(path) {
  return new Promise((resolve) => {
    const video = document.createElement('video');
    video.muted = true;
    video.preload = 'auto';
    video.playsInline = true;

    const finish = (fit) => {
      video.remove();
      resolve(fit);
    };

    video.onerror = () => finish({ vw: 1, vh: 1, bx: 0, by: 0, bw: 1, bh: 1 });

    video.onloadeddata = async () => {
      const vw = video.videoWidth || 1;
      const vh = video.videoHeight || 1;
      const duration = Number.isFinite(video.duration) ? video.duration : 0;
      const sampleTimes = duration > 0
        ? [0.05, 0.14, 0.23, 0.32, 0.41, 0.5, 0.59, 0.68, 0.77, 0.86, 0.95]
          .map((ratio) => Math.min(duration - 0.04, Math.max(0.04, duration * ratio)))
        : [0.08];

      let merged = null;
      for (const time of sampleTimes) {
        await seekVideo(video, time);
        merged = unionVideoBounds(merged, captureVideoFrameBounds(video, vw, vh));
      }

      finish({ vw, vh, ...(merged || getFallbackVideoBounds(vw, vh)) });
    };

    video.src = toVideoSrc(path);
  });
}

async function getVideoFit(path) {
  if (!path) return null;
  if (videoFitCache.has(path)) return videoFitCache.get(path);
  if (videoFitPending.has(path)) return videoFitPending.get(path);

  const stored = loadStoredVideoFits()[path];
  if (stored?.vw && stored?.vh && stored?.bw && stored?.bh) {
    videoFitCache.set(path, stored);
    return stored;
  }

  const promise = analyzeVideoFit(path).then((fit) => {
    videoFitCache.set(path, fit);
    videoFitPending.delete(path);
    saveStoredVideoFit(path, fit);
    return fit;
  });
  videoFitPending.set(path, promise);
  return promise;
}

function getRunnerSlotSize(layerRect) {
  return {
    w: layerRect.width * (RUNNER_SPRITE_W / W),
    h: layerRect.height * (laneH / H),
  };
}

function applyVideoFitToElement(video, fit, slotW, slotH) {
  if (!video || !fit || slotW <= 0 || slotH <= 0) return;

  const { vw, vh, bx, by, bw, bh } = fit;
  const targetHeight = slotH * RUNNER_TARGET_HEIGHT_RATIO;
  const scale = Math.min(targetHeight / bh, slotW / bw);
  const footY = slotH * RUNNER_FOOT_Y_RATIO;
  const tx = -bx * scale;
  const ty = footY - (by + bh) * scale;

  video.style.position = 'absolute';
  video.style.left = '0';
  video.style.top = '0';
  video.style.width = `${vw}px`;
  video.style.height = `${vh}px`;
  video.style.maxWidth = 'none';
  video.style.maxHeight = 'none';
  video.style.objectFit = 'none';
  video.style.transformOrigin = '0 0';
  video.style.transform = `translate(${tx}px, ${ty}px) scale(${scale})`;
  video.style.clipPath = `inset(${by}px ${Math.max(0, vw - bx - bw)}px ${Math.max(0, vh - by - bh)}px ${bx}px)`;
}

function refreshRunnerFit(video) {
  const path = video.dataset.characterSrc;
  const fit = videoFitCache.get(path);
  if (!fit || runnerLayerSize.w <= 0 || runnerLayerSize.h <= 0) return;
  applyVideoFitToElement(video, fit, runnerLayerSize.w, runnerLayerSize.h);
}

function applyFallbackRunnerFit(video) {
  const vw = video.videoWidth || video.naturalWidth || 1;
  const vh = video.videoHeight || video.naturalHeight || 1;
  if (runnerLayerSize.w <= 0 || runnerLayerSize.h <= 0) return;
  applyVideoFitToElement(video, { vw, vh, ...getFallbackVideoBounds(vw, vh) }, runnerLayerSize.w, runnerLayerSize.h);
}

function refreshAllRunnerFits() {
  runnerSprites.forEach((video) => refreshRunnerFit(video));
}

async function preloadAllVideoFits() {
  const stored = loadStoredVideoFits();
  ALL_CHARACTER_VIDEOS.forEach((path) => {
    if (stored[path]?.vw) videoFitCache.set(path, stored[path]);
  });

  await Promise.all(ALL_CHARACTER_VIDEOS.map((path) => getVideoFit(path)));
}

function createRunnerVideo(src) {
  const video = document.createElement('video');
  video.className = 'runner-sprite';
  if (src) video.src = toVideoSrc(src);
  video.muted = true;
  video.loop = true;
  video.autoplay = true;
  video.playsInline = true;
  video.setAttribute('playsinline', '');
  video.preload = 'auto';
  video.draggable = false;
  video.addEventListener('canplay', () => {
    video.play().catch(() => {});
  });
  return video;
}

function playRunnerVideos() {
  runnerSprites.forEach((video) => {
    if (video.paused) video.play().catch(() => {});
  });
}

function shuffleArray(items) {
  const list = [...items];
  for (let i = list.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [list[i], list[j]] = [list[j], list[i]];
  }
  return list;
}

function distributePackageVideos(videos, laneCount) {
  if (videos.length === 1) return Array(laneCount).fill(videos[0]);

  if (videos.length >= laneCount) {
    return shuffleArray(videos).slice(0, laneCount);
  }

  const pool = [];
  while (pool.length < laneCount) pool.push(...videos);
  const assignments = shuffleArray(pool.slice(0, laneCount));

  for (let i = 1; i < assignments.length; i++) {
    if (assignments[i] !== assignments[i - 1]) continue;
    const swapIndex = assignments.findIndex((src, idx) => idx > i && src !== assignments[i - 1]);
    if (swapIndex !== -1) [assignments[i], assignments[swapIndex]] = [assignments[swapIndex], assignments[i]];
  }

  return assignments;
}

function setRunnerVideo(video, src, force = false) {
  if (!force && video.dataset.characterSrc === src) return;
  video.dataset.characterSrc = src;
  video.src = toVideoSrc(src);
  video.load();
  video.play().catch(() => {});

  const applyInitialFit = () => {
    applyFallbackRunnerFit(video);
    video.play().catch(() => {});
  };

  const applyFit = async () => {
    applyInitialFit();
    const fit = await getVideoFit(src);
    if (fit && runnerLayerSize.w > 0 && runnerLayerSize.h > 0) {
      applyVideoFitToElement(video, fit, runnerLayerSize.w, runnerLayerSize.h);
    }
    video.play().catch(() => {});
  };

  if (video.readyState >= 1) applyInitialFit();
  else video.addEventListener('loadedmetadata', applyInitialFit, { once: true });

  if (video.readyState >= 2) applyFit();
  else video.addEventListener('loadeddata', applyFit, { once: true });
}

function preloadAllCharacterVideos() {
  const seen = new Set();
  ALL_CHARACTER_VIDEOS.forEach((path) => {
    if (seen.has(path)) return;
    seen.add(path);
    const video = document.createElement('video');
    video.preload = 'auto';
    video.muted = true;
    video.src = toVideoSrc(path);
  });
}

function applyCharacter(characterId) {
  selectedCharacterId = characterId;
  localStorage.setItem(CHARACTER_STORAGE_KEY, characterId);
  const pkg = getCharacterById(characterId);
  const assignments = distributePackageVideos(pkg.videos, LANE_COUNT);

  runnerSprites.forEach((video, laneIndex) => {
    setRunnerVideo(video, assignments[laneIndex], true);
  });

  document.querySelectorAll('.character-option').forEach((btn) => {
    btn.classList.toggle('selected', btn.dataset.characterId === characterId);
  });
}

function initSettings() {
  const overlay = document.getElementById('settingsOverlay');
  const openBtn = document.getElementById('settingsBtn');
  const closeBtn = document.getElementById('settingsClose');
  const characterGrid = document.getElementById('characterGrid');
  const giftGrid = document.getElementById('giftAssignmentGrid');
  const tabButtons = overlay.querySelectorAll('.settings-tab');
  const tabPanels = {
    characters: document.getElementById('characterPanel'),
    gifts: document.getElementById('giftPanel'),
  };

  function switchSettingsTab(tabId) {
    tabButtons.forEach((btn) => {
      btn.classList.toggle('active', btn.dataset.tab === tabId);
    });
    Object.entries(tabPanels).forEach(([id, panel]) => {
      panel.classList.toggle('settings-hidden', id !== tabId);
    });
  }

  tabButtons.forEach((btn) => {
    btn.addEventListener('click', () => {
      if (btn.dataset.tab !== 'gifts') closeGiftPicker();
      switchSettingsTab(btn.dataset.tab);
    });
  });

  CHARACTERS.forEach((character) => {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'character-option';
    btn.dataset.characterId = character.id;
    if (character.id === selectedCharacterId) btn.classList.add('selected');

    const preview = document.createElement('video');
    preview.className = 'character-preview';
    preview.src = toVideoSrc(character.videos[0]);
    preview.muted = true;
    preview.loop = true;
    preview.autoplay = true;
    preview.playsInline = true;
    preview.setAttribute('playsinline', '');
    preview.preload = 'metadata';

    const label = document.createElement('span');
    label.className = 'character-label';
    label.textContent = character.videos.length > 1
      ? `${character.name} (${character.videos.length} video)`
      : character.name;

    btn.append(preview, label);
    btn.addEventListener('click', () => applyCharacter(character.id));
    characterGrid.appendChild(btn);
  });

  runners.forEach((runner, lane) => {
    const row = document.createElement('div');
    row.className = 'gift-assignment-row';
    row.dataset.teamName = runner.name.toLowerCase();
    row.dataset.lane = String(lane);

    const teamLabel = document.createElement('span');
    teamLabel.className = 'team-label';
    teamLabel.textContent = runner.name;

    const pickBtn = document.createElement('button');
    pickBtn.type = 'button';
    pickBtn.className = 'gift-pick-btn';
    pickBtn.dataset.lane = String(lane);

    const img = document.createElement('img');
    img.alt = '';
    img.src = TIKTOK_GIFTS[runner.giftIndex]?.url ?? '';

    const info = document.createElement('div');
    info.className = 'gift-pick-info';

    const nameEl = document.createElement('span');
    nameEl.className = 'gift-pick-name';
    nameEl.textContent = TIKTOK_GIFTS[runner.giftIndex]?.name ?? 'Hediye seç';

    const costEl = document.createElement('span');
    costEl.className = 'gift-pick-cost';
    const diamonds = TIKTOK_GIFTS[runner.giftIndex]?.diamonds;
    costEl.textContent = diamonds ? `${diamonds} 💎` : '';

    info.append(nameEl, costEl);
    pickBtn.append(img, info);
    pickBtn.addEventListener('click', () => openGiftPicker(lane, runner.name));

    row.dataset.giftName = (TIKTOK_GIFTS[runner.giftIndex]?.name ?? '').toLowerCase();
    row.append(teamLabel, pickBtn);
    giftGrid.appendChild(row);
  });

  const giftTeamView = document.getElementById('giftTeamView');
  const giftPickerView = document.getElementById('giftPickerView');
  const giftPickerGrid = document.getElementById('giftPickerGrid');
  const giftPickerBack = document.getElementById('giftPickerBack');
  const giftPickerTitle = document.getElementById('giftPickerTitle');
  const giftPickerSearch = document.getElementById('giftPickerSearch');
  let giftPickerBuilt = false;
  let activeGiftLane = null;
  const teamGiftPickButtons = new Map();

  giftGrid.querySelectorAll('.gift-pick-btn').forEach((btn) => {
    teamGiftPickButtons.set(Number(btn.dataset.lane), btn);
  });

  function updateTeamGiftButton(lane, giftIndex) {
    const btn = teamGiftPickButtons.get(lane);
    const gift = TIKTOK_GIFTS[giftIndex];
    if (!btn || !gift) return;

    btn.querySelector('img').src = gift.url;
    btn.querySelector('.gift-pick-name').textContent = gift.name;
    btn.querySelector('.gift-pick-cost').textContent = gift.diamonds ? `${gift.diamonds} 💎` : '';

    const row = giftGrid.querySelector(`.gift-assignment-row[data-lane="${lane}"]`);
    if (row) row.dataset.giftName = gift.name.toLowerCase();
  }

  function buildGiftPickerGrid() {
    if (giftPickerBuilt) return;
    giftPickerBuilt = true;

    TIKTOK_GIFTS.forEach((gift, giftIndex) => {
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'gift-option';
      btn.dataset.giftIndex = String(giftIndex);
      btn.dataset.giftName = gift.name.toLowerCase();

      const optionImg = document.createElement('img');
      optionImg.alt = '';
      optionImg.src = gift.url;
      optionImg.loading = 'lazy';

      const optionName = document.createElement('span');
      optionName.className = 'gift-option-name';
      optionName.textContent = gift.name;

      const optionCost = document.createElement('span');
      optionCost.className = 'gift-option-cost';
      optionCost.textContent = gift.diamonds ? `${gift.diamonds} 💎` : '';

      btn.append(optionImg, optionName, optionCost);
      btn.addEventListener('click', () => {
        if (activeGiftLane === null) return;
        setTeamGift(activeGiftLane, giftIndex);
        updateTeamGiftButton(activeGiftLane, giftIndex);
        closeGiftPicker();
      });
      giftPickerGrid.appendChild(btn);
    });
  }

  function highlightSelectedGift(giftIndex) {
    giftPickerGrid.querySelectorAll('.gift-option').forEach((opt) => {
      opt.classList.toggle('selected', Number(opt.dataset.giftIndex) === giftIndex);
    });
  }

  function filterGiftPicker(query) {
    giftPickerGrid.querySelectorAll('.gift-option').forEach((opt) => {
      const name = opt.dataset.giftName ?? '';
      opt.classList.toggle('gift-option-hidden', query && !name.includes(query));
    });
  }

  function openGiftPicker(lane, teamName) {
    buildGiftPickerGrid();
    activeGiftLane = lane;
    giftPickerTitle.textContent = `${teamName} — hediye seç`;
    giftPickerSearch.value = '';
    filterGiftPicker('');
    highlightSelectedGift(runners[lane].giftIndex);
    giftTeamView.classList.add('settings-hidden');
    giftPickerView.classList.remove('settings-hidden');

    const selected = giftPickerGrid.querySelector(`.gift-option[data-gift-index="${runners[lane].giftIndex}"]`);
    selected?.scrollIntoView({ block: 'center', behavior: 'smooth' });
  }

  function closeGiftPicker() {
    activeGiftLane = null;
    giftPickerView.classList.add('settings-hidden');
    giftTeamView.classList.remove('settings-hidden');
    giftPickerSearch.value = '';
    filterGiftPicker('');
  }

  giftPickerBack.addEventListener('click', closeGiftPicker);
  giftPickerSearch.addEventListener('input', () => {
    filterGiftPicker(giftPickerSearch.value.toLowerCase().trim());
  });

  const giftSearch = document.getElementById('giftSearch');
  if (giftSearch) {
    giftSearch.addEventListener('input', () => {
      const query = giftSearch.value.toLowerCase().trim();
      giftGrid.querySelectorAll('.gift-assignment-row').forEach((row) => {
        const teamName = row.dataset.teamName ?? '';
        const giftName = row.dataset.giftName ?? '';
        const visible = !query || teamName.includes(query) || giftName.includes(query);
        row.classList.toggle('gift-row-hidden', !visible);
      });
    });
  }

  const openSettings = () => {
    overlay.classList.remove('settings-hidden');
    overlay.setAttribute('aria-hidden', 'false');
    switchSettingsTab('characters');
    closeGiftPicker();
    characterGrid.querySelectorAll('video').forEach((v) => v.play().catch(() => {}));
  };

  const closeSettings = () => {
    overlay.classList.add('settings-hidden');
    overlay.setAttribute('aria-hidden', 'true');
    playRunnerVideos();
  };

  openBtn.addEventListener('click', openSettings);
  closeBtn.addEventListener('click', closeSettings);
  overlay.addEventListener('click', (e) => {
    if (e.target === overlay) closeSettings();
  });
  document.addEventListener('keydown', (e) => {
    if (e.code === 'Escape' && !overlay.classList.contains('settings-hidden')) {
      closeSettings();
    }
  });
}

const runnersLayer = document.getElementById('runnersLayer');
const runnerSlots = runners.map(() => {
  const slot = document.createElement('div');
  slot.className = 'runner-slot';
  const crop = document.createElement('div');
  crop.className = 'runner-crop';
  const video = createRunnerVideo('');
  crop.appendChild(video);
  slot.appendChild(crop);
  runnersLayer.appendChild(slot);
  return { slot, crop, video };
});
const runnerSprites = runnerSlots.map((entry) => entry.video);

function syncRunnerSprites() {
  const layerRect = runnersLayer.getBoundingClientRect();
  const nextSize = getRunnerSlotSize(layerRect);
  const sizeChanged = nextSize.w !== runnerLayerSize.w || nextSize.h !== runnerLayerSize.h;
  if (sizeChanged) {
    runnerLayerSize = nextSize;
  }

  const laneHeightPct = (laneH / H) * 100;
  const slotWidthPct = (RUNNER_SPRITE_W / W) * 100;

  runners.forEach((r, i) => {
    const { slot, video } = runnerSlots[i];
    const laneTop = i * laneH;
    const runnerX = getGroupX(r) + LAYOUT.flagW + RACE.flagGap;
    const slotX = Math.min(runnerX, finishX - 8);

    slot.style.left = `${(slotX / W) * 100}%`;
    slot.style.top = `${(laneTop / H) * 100}%`;
    slot.style.width = `${slotWidthPct}%`;
    slot.style.height = `${laneHeightPct}%`;
    slot.style.display = 'block';

    if (sizeChanged) refreshRunnerFit(video);
  });
}

const tikfinity = new TikFinity.Client({
  laneCount: LANE_COUNT,
  countryNames: COUNTRIES.map((c) => c.name),
  teamAliases: TEAM_CHAT_ALIASES,
  url: TikFinity.resolveWsUrl(),
  autoConnect: !TikFinity.isAutoConnectDisabled(),
  onStatus() {},
  onAction: handleLiveAction,
});

function drawRoadSurface(x, y, w, h, laneIndex) {
  ctx.fillStyle = laneIndex % 2 === 0 ? '#0d0d0d' : '#111111';
  ctx.fillRect(x, y, w, h);
}

function drawRedZoneLane(x, y, w, h, laneIndex) {
  const pulse = 0.8 + Math.sin(performance.now() * 0.002 + laneIndex * 0.25) * 0.2;

  ctx.save();
  ctx.beginPath();
  ctx.rect(x, y, w, h);
  ctx.clip();

  ctx.fillStyle = laneIndex % 2 === 0
    ? `rgba(110, 10, 10, ${0.16 * pulse})`
    : `rgba(130, 16, 16, ${0.12 * pulse})`;
  ctx.fillRect(x, y, w, h);

  const edgeGrad = ctx.createLinearGradient(x, y, x + 28, y);
  edgeGrad.addColorStop(0, `rgba(255, 34, 68, ${0.28 * pulse})`);
  edgeGrad.addColorStop(1, 'rgba(255, 34, 68, 0)');
  ctx.fillStyle = edgeGrad;
  ctx.fillRect(x, y, 28, h);

  ctx.restore();
}

function drawGlowLine(x1, y1, x2, y2, color, width, blur) {
  ctx.save();
  ctx.strokeStyle = color;
  ctx.lineWidth = width;
  ctx.shadowColor = color;
  ctx.shadowBlur = blur;
  ctx.beginPath();
  ctx.moveTo(x1, y1);
  ctx.lineTo(x2, y2);
  ctx.stroke();
  ctx.restore();
}

function drawGlowBall(x, y, radius, phase = 0) {
  const pulse = 1 + Math.sin(phase * 2) * 0.08;
  const r = radius * pulse;
  ctx.save();
  ctx.translate(Math.sin(phase) * 1, Math.cos(phase * 2) * 0.5);
  const grad = ctx.createRadialGradient(x, y, 0, x, y, r * 3);
  grad.addColorStop(0, 'rgba(255,255,255,1)');
  grad.addColorStop(0.3, 'rgba(255,255,255,0.8)');
  grad.addColorStop(1, 'rgba(255,255,255,0)');
  ctx.fillStyle = grad;
  ctx.beginPath();
  ctx.arc(x, y, r * 3, 0, Math.PI * 2);
  ctx.fill();
  ctx.shadowColor = '#fff';
  ctx.shadowBlur = 16;
  ctx.fillStyle = '#fff';
  ctx.beginPath();
  ctx.arc(x, y, r, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
}

function drawTrophy(x, y, type) {
  ctx.save();
  ctx.translate(x, y);
  const colors = { gold: '#ffd700', silver: '#c0c0c0', bronze: '#cd7f32' };
  ctx.fillStyle = colors[type];
  ctx.shadowColor = colors[type];
  ctx.shadowBlur = 6;
  if (type === 'gold') {
    ctx.beginPath();
    ctx.moveTo(-6, -2);
    ctx.lineTo(-8, 4);
    ctx.quadraticCurveTo(-8, 10, 0, 10);
    ctx.quadraticCurveTo(8, 10, 8, 4);
    ctx.lineTo(6, -2);
    ctx.closePath();
    ctx.fill();
    ctx.fillRect(-2, 10, 4, 3);
    ctx.fillRect(-5, 13, 10, 2);
  } else {
    ctx.beginPath();
    ctx.arc(0, 2, 7, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.restore();
}

function truncateName(name, maxLen = 5) {
  return name.length <= maxLen ? name : `${name.slice(0, maxLen)}...`;
}

function getLeaderboard() {
  return [...runners].sort((a, b) => b.score - a.score).slice(0, 3);
}

function easeOutCubic(t) {
  return 1 - (1 - Math.min(1, Math.max(0, t))) ** 3;
}

function easeInCubic(t) {
  return Math.min(1, Math.max(0, t)) ** 3;
}

function getGroupX(runner) {
  const base = RACE.startX + runner.step * RACE.stepPx;
  const slide = runner.push?.phase === 'push' ? runner.push.slideOffset : 0;
  return base + slide;
}

function startPush(runner) {
  runner.push = { phase: 'approach', frame: 0, ballX: -30, slideOffset: 0 };
}

function finishPush(runner) {
  runner.step++;
  if (runner.step >= RACE.maxSteps) {
    runner.step = 0;
    runner.score++;
  }
  runner.push = null;
}

function updateRunnerPush(runner) {
  if (!runner.push && runner.queue > 0) {
    runner.queue--;
    startPush(runner);
  }
  if (!runner.push) return;

  const p = runner.push;
  const groupBase = RACE.startX + runner.step * RACE.stepPx;
  const hitX = groupBase - 8;

  if (p.phase === 'approach') {
    p.frame++;
    const t = Math.min(1, p.frame / RACE.approachFrames);
    p.ballX = -30 + (hitX + 30) * easeInCubic(t);
    if (p.frame >= RACE.approachFrames) {
      p.phase = 'push';
      p.frame = 0;
      p.ballX = hitX;
    }
  } else if (p.phase === 'push') {
    p.frame++;
    const t = Math.min(1, p.frame / RACE.pushFrames);
    p.slideOffset = RACE.stepPx * easeOutCubic(t);
    p.ballX = hitX + p.slideOffset;
    if (p.frame >= RACE.pushFrames) finishPush(runner);
  }
}

function drawRoadLabel(runner, laneY, cy) {
  const label = runner.name;
  const now = performance.now();
  const phase = (now + runner.index * ROAD.laneStaggerMs) % ROAD.passIntervalMs;
  const progress = phase / ROAD.passIntervalMs;

  if (progress > ROAD.visibleRatio) return;

  const t = progress / ROAD.visibleRatio;
  const runnerShift = getGroupX(runner) * 0.12;

  ctx.save();
  ctx.beginPath();
  ctx.rect(0, laneY, W, laneH);
  ctx.clip();

  ctx.font = ROAD.labelFont;
  ctx.textAlign = 'left';
  ctx.textBaseline = 'middle';

  const labelW = ctx.measureText(label).width;
  const travelDistance = W + labelW + 48;
  const x = W + 24 - t * travelDistance - runnerShift;

  const boldOffsets = [[0, 0], [0.9, 0], [0, 0.9]];
  ctx.fillStyle = ROAD.labelShadow;
  boldOffsets.forEach(([ox, oy]) => {
    ctx.fillText(label, x + ox + 1, cy + oy + 1);
  });
  ctx.fillStyle = ROAD.labelColor;
  boldOffsets.forEach(([ox, oy]) => {
    ctx.fillText(label, x + ox, cy + oy);
  });

  ctx.restore();
}

function drawLane(i) {
  const runner = runners[i];
  const y = i * laneH;
  const cy = y + laneH / 2;

  drawRoadSurface(0, y, W, laneH, i);
  drawRedZoneLane(finishX, y, SCORE_ZONE_W, laneH, i);

  if (i > 0) drawGlowLine(0, y, W, y, '#ff2222', 1.5, 8);

  drawRoadLabel(runner, y, cy);

  const groupX = getGroupX(runner);
  const flagX = groupX;

  if (runner.push) drawGlowBall(runner.push.ballX, cy, 5.5, runner.animPhase);
  drawGiftIcon(runner, cy);
  drawFlag(runner, flagX, cy);
}

function drawScoreZone() {
  const pulse = 0.85 + Math.sin(performance.now() * 0.0018) * 0.15;

  ctx.save();
  const zoneGrad = ctx.createLinearGradient(finishX, 0, W, 0);
  zoneGrad.addColorStop(0, `rgba(255, 34, 68, ${0.12 * pulse})`);
  zoneGrad.addColorStop(0.35, `rgba(180, 20, 30, ${0.08 * pulse})`);
  zoneGrad.addColorStop(1, `rgba(120, 10, 10, ${0.05 * pulse})`);
  ctx.fillStyle = zoneGrad;
  ctx.fillRect(finishX, 0, SCORE_ZONE_W, H);
  ctx.restore();

  drawGlowLine(finishX, 0, finishX, H, '#ff6600', 5, 25);
  drawGlowLine(finishX + 1.5, 0, finishX + 1.5, H, '#ffcc00', 2, 12);
  drawGlowLine(finishX, 0, finishX, H, '#ff2244', 2, 14);

  getLeaderboard().forEach((leader, rank) => {
    const ly = rank * laneH + laneH / 2;
    const lx = finishX + 8;
    drawTrophy(lx + 10, ly, ['gold', 'silver', 'bronze'][rank]);
    drawFlag(leader, lx + 24, ly, 24, 19);
    ctx.fillStyle = '#ffffff';
    ctx.font = '12px Arial, sans-serif';
    ctx.textAlign = 'left';
    ctx.textBaseline = 'middle';
    ctx.fillText(truncateName(leader.name, 5), lx + 54, ly);
    ctx.font = 'bold 15px Arial, sans-serif';
    ctx.textAlign = 'right';
    ctx.fillText(String(leader.score), W - 8, ly);
  });
}

function update() {
  runners.forEach((r) => {
    const intensity = r.push ? 1.5 : 1;
    r.animPhase += r.animSpeed * intensity;
    updateRunnerPush(r);
  });
}

function render() {
  ctx.fillStyle = '#0a0a0a';
  ctx.fillRect(0, 0, W, H);
  for (let i = 0; i < LANE_COUNT; i++) drawLane(i);
  drawScoreZone();
  drawGlowLine(0, H - 1, W, H - 1, '#ff2222', 1.5, 8);
  syncRunnerSprites();
}

function gameLoop() {
  update();
  render();
  requestAnimationFrame(gameLoop);
}

function boostRunner(index, amount = 1) {
  const r = runners[index];
  if (!r) return;
  const steps = Math.max(1, Math.round(amount));
  r.queue += steps;
}

loadEmojiFlags();
loadGiftImages();
initSpeech();
preloadAllCharacterVideos();
preloadAllVideoFits().then(() => {
  applyCharacter(selectedCharacterId);
  const layerRect = runnersLayer.getBoundingClientRect();
  runnerLayerSize = getRunnerSlotSize(layerRect);
  refreshAllRunnerFits();
});
initSettings();
playRunnerVideos();
gameLoop();

if (tikfinity.autoConnect) tikfinity.connect();
globalThis.TikFinityClient = tikfinity;
