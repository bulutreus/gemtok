let lives = [];
let totalStreamers = 0;
let totalViewers = 0;
const livesContainer = document.getElementById('livesContainer');
const totalStreamersElement = document.getElementById('totalStreamers');
const totalViewersElement = document.getElementById('totalViewers');
const publicModsUrl = 'https://api.streamtoearn.io/apiserver/mods-manager/public-list';
let gameCatalogPromise = null;

function normalizeGameKey(value) {
    return String(value == null ? '' : value).trim().toLowerCase().replace(/\s+/g, ' ');
}

function registerGameIcon(map, lookup, key, image) {
    if (!key || !image) return;
    map[key] = image;
    lookup[normalizeGameKey(key)] = image;
}

function loadGameCatalog() {
    if (gameCatalogPromise) return gameCatalogPromise;

    gameCatalogPromise = fetch(publicModsUrl)
        .then(response => response.ok ? response.json() : [])
        .then(mods => {
            const icons = Object.assign({}, window.__gameIcons || {});
            const lookup = {};

            Object.keys(icons).forEach(name => registerGameIcon(icons, lookup, name, icons[name]));

            if (Array.isArray(mods)) {
                mods.forEach(mod => {
                    if (!mod || !mod.image) return;
                    registerGameIcon(icons, lookup, mod.name, mod.image);
                    registerGameIcon(icons, lookup, mod.title, mod.image);
                });
            }

            window.__gameIcons = icons;
            window.__gameIconLookup = lookup;
            return mods;
        })
        .catch(error => {
            console.error('Error loading game catalog:', error);
            window.__gameIconLookup = window.__gameIconLookup || {};
            return [];
        });

    return gameCatalogPromise;
}

function getGameIcon(gameName) {
    const name = String(gameName == null ? '' : gameName).trim();
    const icons = window.__gameIcons || {};
    if (icons[name]) return icons[name];
    const lookup = window.__gameIconLookup || {};
    return lookup[normalizeGameKey(name)] || null;
}

function formatViewerCount(value) {
    const number = Number(value) || 0;
    return number.toLocaleString('en-US').replace(/,/g, ' ');
}

// Mock fallback data for testing when live-free API fails or ?placeholder=1 is set
function getPlaceholderLives() {
    const games = ['Minecraft', 'GTA5', 'GTAVEnhanced', 'RDR2', 'Witcher 3', 'Elden Ring', 'Palworld', 'Valheim', 'Roblox', 'ARK'];
    const tiers = ['expert', 'expert', 'pro', 'pro', 'pro', 'normal', 'normal', 'normal', 'normal', 'normal'];
    const names = [
        'floreeluv', 'max_games_23', 'mafiplay45', 'alex_interactivemc', 'zero_042614',
        'feitan_vogel', 'vuritooo', 'kaguraaya', 'raito_hibiki', 'raf_yan55',
        'na_blueboo', 'brutal_manu59', 'sandfall', 'niko_x', 'witcher_k',
        'eldenmain', 'palworlds', 'arkrider', 'ckkeeper', 'rafttino',
        'valhalla_b', 'kingrider', 'minegirl', 'alex_007', 'streamqueen',
        'gtv_player', 'rdr_outlaw', 'cyber_mc', 'tnt_lord', 'sand_storm'
    ];
    return names.map((name, i) => {
        const platform = i % 5 === 0 ? 'Kick' : 'TikTok';
        return {
            tiktokUsername: platform === 'TikTok' ? name : null,
            kickChannelSlug: platform === 'Kick' ? name : null,
            platformName: platform,
            game: games[i % games.length],
            viewerCount: Math.floor(Math.random() * 2000) + 5,
            userType: tiers[i % tiers.length],
            avatar: null
        };
    });
}

function isPlaceholderForced() {
    return new URLSearchParams(window.location.search).has('placeholder');
}

document.addEventListener('DOMContentLoaded', function() {
    loadGameCatalog().then(() => {
        const gameFilter = document.getElementById('gameFilter');
        if (gameFilter) rebuildGameOptions(lives, gameFilter.value || 'All');
        displayLives();
    });
    loadData();
    setInterval(loadData, 6500);
});

function applyFiltersAndRender(rawLives) {
    const platformFilter = document.getElementById('platformFilter').value;
    const gameFilter = document.getElementById('gameFilter').value;

    // Rebuild dropdowns from unfiltered data to show total counts
    rebuildPlatformOptions(rawLives, platformFilter);
    rebuildGameOptions(rawLives, gameFilter);

    let filtered = rawLives;
    if (platformFilter !== 'All') {
        filtered = filtered.filter(live => live.platformName === platformFilter);
    }
    if (gameFilter !== 'All') {
        filtered = filtered.filter(live => live.game === gameFilter);
    }

    filtered.sort((a, b) => {
        const typeOrder = { 'expert': 1, 'pro': 2, 'normal': 3 };
        const aOrder = typeOrder[a.userType] || 3;
        const bOrder = typeOrder[b.userType] || 3;
        return aOrder - bOrder;
    });

    lives = filtered;
    displayLives();
}

function loadData() {
    if (isPlaceholderForced()) {
        loadGameCatalog().then(() => applyFiltersAndRender(getPlaceholderLives()));
        return;
    }
    Promise.all([
        loadGameCatalog(),
        fetch('https://api.streamtoearn.io/apiserver/users/live-free')
            .then(response => response.json())
            .catch(error => {
                console.error('Error loading the data:', error);
                return null;
            })
    ]).then(([, data]) => {
        const safe = Array.isArray(data) && data.length > 0 ? data : getPlaceholderLives();
        applyFiltersAndRender(safe);
    });
}

function fixAvatar(url) {
    if(!url) return url;
    url = url.replace("-sign-", "-");
    url = url.replace("-sign.", ".");
    return url.split("?")[0];
}

// Rebuilds dropdown options on each poll cycle unless currently open

function _esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, c => ({
        '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'
    }[c]));
}

function rebuildDropdown(selectId, options, selectedValue) {
    const select = document.getElementById(selectId);
    const dd = document.querySelector('[data-dropdown][data-target="' + selectId + '"]');
    if (!select || !dd) return;
    if (dd.classList.contains('open')) return;

    const menu = dd.querySelector('.s2e-dropdown-menu');
    const label = dd.querySelector('.s2e-dropdown-label');

    menu.innerHTML = options.map(opt => {
        const isSelected = String(opt.value) === String(selectedValue);
        // Hide image on error to avoid broken-image placeholder
        const icon = opt.image
            ? '<img class="s2e-dropdown-opt-icon" src="' + _esc(opt.image) + '" alt="" loading="lazy" onerror="this.onerror=null; this.style.display=\'none\';">'
            : '';
        const count = (opt.count !== undefined && opt.count !== null)
            ? '<span class="s2e-dropdown-count">' + _esc(opt.count) + '</span>'
            : '';
        return '<li><button type="button" class="s2e-dropdown-option' + (isSelected ? ' selected' : '') +
               '" role="option" data-value="' + _esc(opt.value) + '">' +
               icon +
               '<span class="s2e-dropdown-opt-label">' + _esc(opt.label) + '</span>' +
               count +
               '</button></li>';
    }).join('');

    const selected = options.find(o => String(o.value) === String(selectedValue));
    if (selected) label.textContent = selected.label;

    select.innerHTML = options.map(opt =>
        '<option value="' + _esc(opt.value) + '">' + _esc(opt.label) + '</option>'
    ).join('');
    select.value = selectedValue;
}

function rebuildPlatformOptions(rawLives, selectedValue) {
    const counts = { TikTok: 0, Kick: 0 };
    rawLives.forEach(l => {
        const p = l.platformName || 'TikTok';
        if (counts[p] !== undefined) counts[p]++;
    });
    const options = [
        { value: 'All',    label: 'All Platforms', count: rawLives.length },
        { value: 'TikTok', label: 'TikTok',        count: counts.TikTok },
        { value: 'Kick',   label: 'Kick',          count: counts.Kick }
    ];
    rebuildDropdown('platformFilter', options, selectedValue);
}

function rebuildGameOptions(rawLives, selectedValue) {
    const counts = {};
    rawLives.forEach(l => {
        const g = (l.game || '').trim() || 'Unknown';
        counts[g] = (counts[g] || 0) + 1;
    });
    // Keep selected filter visible even if stream count drops to 0
    if (selectedValue && selectedValue !== 'All' && counts[selectedValue] === undefined) {
        counts[selectedValue] = 0;
    }
    const gameEntries = Object.keys(counts)
        .map(name => ({ value: name, label: name, count: counts[name], image: getGameIcon(name) }))
        .sort((a, b) => (b.count - a.count) || a.label.localeCompare(b.label));
    const options = [{ value: 'All', label: 'All Games', count: rawLives.length }].concat(gameEntries);
    rebuildDropdown('gameFilter', options, selectedValue);
}

// Reconciles card DOM nodes in place to prevent flashing
function displayLives() {
    totalViewers = 0;

    // Map current DOM cards by unique platform:username keys
    const existing = new Map();
    Array.prototype.slice.call(livesContainer.children).forEach(node => {
        const k = node.dataset.streamKey;
        if (k) existing.set(k, node);
    });
    const seen = new Set();

    lives.forEach((live, idx) => {
        if (+live.viewerCount > 0) totalViewers += live.viewerCount;
        const avatar = live.avatar ? fixAvatar(live.avatar) : live.avatar;

        const platform = live.platformName || 'TikTok';
        let streamUrl = '';
        let username = '';
        if (platform === 'Kick' && live.kickChannelSlug) {
            streamUrl = `https://kick.com/${live.kickChannelSlug}`;
            username = live.kickChannelSlug;
        } else if (live.tiktokUsername) {
            streamUrl = `https://www.tiktok.com/@${live.tiktokUsername}/live`;
            username = live.tiktokUsername;
        }
        const key = platform + ':' + (username || ('_' + idx));
        seen.add(key);

        let node = existing.get(key);
        if (!node) {
            const frag = document.importNode(document.getElementById('liveTemplate').content, true);
            node = frag.querySelector('.live');
            node.dataset.streamKey = key;
        }

        // Only update changed fields to avoid layout repaints
        const a = node.querySelector('a');
        if (a.getAttribute('href') !== streamUrl) a.href = streamUrl;

        const avatarEl = node.querySelector('.streamerAvatar');
        const avatarSrc = avatar || '/images/avatar-placeholder.jpg';
        if (avatarEl.getAttribute('src') !== avatarSrc) avatarEl.src = avatarSrc;

        const handle = '@' + username;
        const userEl = node.querySelector('.tiktokUsername');
        if (userEl.textContent !== handle) userEl.textContent = handle;

        const viewerStr = formatViewerCount(live.viewerCount);
        const viewerEl = node.querySelector('.valueNumber');
        if (viewerEl.textContent !== viewerStr) viewerEl.textContent = viewerStr;

        const gameName = (live?.game || '').trim() || 'Unknown';
        const gameIcon = getGameIcon(gameName);
        const iconEl = node.querySelector('.game-icon');
        const nameEl = node.querySelector('.game-name');
        if (gameIcon) {
            if (iconEl.getAttribute('src') !== gameIcon) {
                iconEl.hidden = true;
                iconEl.src = gameIcon;
            }
            if (iconEl.getAttribute('alt') !== gameName) iconEl.alt = gameName;
        } else if (!iconEl.hidden) {
            iconEl.hidden = true;
        }
        if (nameEl.textContent !== gameName) nameEl.textContent = gameName;

        const statusLabel = node.querySelector('.status-label');
        const userType = live.userType || 'normal';
        const tierClass = userType === 'expert' ? 'expert-live'
                        : userType === 'pro'    ? 'pro-live'
                        : userType === 'silver' ? 'silver-live' : '';
        const tierLabel = userType === 'expert' ? 'EXP'
                        : userType === 'pro'    ? 'PRO'
                        : userType === 'silver' ? 'SILVER' : '';
        ['expert-live', 'pro-live', 'silver-live'].forEach(c => {
            if (c !== tierClass && node.classList.contains(c)) node.classList.remove(c);
        });
        if (tierClass && !node.classList.contains(tierClass)) node.classList.add(tierClass);
        ['expert-label', 'pro-label', 'silver-label'].forEach(c => {
            const want = c === tierClass.replace('-live', '-label');
            if (!want && statusLabel.classList.contains(c)) statusLabel.classList.remove(c);
            if (want && !statusLabel.classList.contains(c)) statusLabel.classList.add(c);
        });
        if (statusLabel.textContent !== tierLabel) statusLabel.textContent = tierLabel;

        // Move node to its sorted index position
        const currentAtIdx = livesContainer.children[idx];
        if (currentAtIdx !== node) {
            livesContainer.insertBefore(node, currentAtIdx || null);
        }
    });

    // Remove inactive streams
    existing.forEach((node, key) => {
        if (!seen.has(key)) node.remove();
    });

    totalStreamersElement.textContent = lives.length;
    totalViewersElement.textContent = formatViewerCount(totalViewers);
}
