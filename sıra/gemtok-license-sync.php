<?php
declare(strict_types=1);

header('Content-Type: application/json; charset=utf-8');
header('Cache-Control: no-store, no-cache, must-revalidate');
header('X-Content-Type-Options: nosniff');

$registryPath = __DIR__ . DIRECTORY_SEPARATOR . 'gemtok-license-registry.json';
$lockPath = __DIR__ . DIRECTORY_SEPARATOR . 'gemtok-license-registry.lock';
$adminSecret = hash('sha256', 'BULUTREUS');

function respond(int $code, array $payload): void
{
    http_response_code($code);
    echo json_encode($payload, JSON_UNESCAPED_UNICODE);
    exit;
}

function normalize_key(string $raw): string
{
    return strtoupper(preg_replace('/\s+/', '', trim($raw)));
}

function read_registry(string $path): array
{
    if (!is_file($path)) {
        return ['keys' => []];
    }
    $raw = file_get_contents($path);
    if ($raw === false || $raw === '') {
        return ['keys' => []];
    }
    $data = json_decode($raw, true);
    if (!is_array($data)) {
        return ['keys' => []];
    }
    if (!isset($data['keys']) || !is_array($data['keys'])) {
        $data['keys'] = [];
    }
    return $data;
}

function write_registry(string $path, array $data): bool
{
    $json = json_encode($data, JSON_PRETTY_PRINT | JSON_UNESCAPED_UNICODE);
    if ($json === false) {
        return false;
    }
    $tmp = $path . '.tmp.' . getmypid();
    if (file_put_contents($tmp, $json) === false) {
        return false;
    }
    return rename($tmp, $path);
}

function with_registry_lock(string $lockPath, callable $fn)
{
    $fp = fopen($lockPath, 'c');
    if ($fp === false) {
        respond(500, ['ok' => false, 'message' => 'lock_failed']);
    }
    if (!flock($fp, LOCK_EX)) {
        fclose($fp);
        respond(500, ['ok' => false, 'message' => 'lock_busy']);
    }
    try {
        return $fn();
    } finally {
        flock($fp, LOCK_UN);
        fclose($fp);
    }
}

function verify_admin_token(array $body): void
{
    $token = normalize_key((string)($body['adminToken'] ?? ''));
    if ($token === '' || !hash_equals($adminSecret, hash('sha256', $token))) {
        respond(403, ['ok' => false, 'message' => 'unauthorized']);
    }
}

function tier_ms(string $tier): int
{
    $map = [
        '7d' => 7 * 24 * 60 * 60 * 1000,
        '30d' => 30 * 24 * 60 * 60 * 1000,
        '90d' => 90 * 24 * 60 * 60 * 1000,
        '365d' => 365 * 24 * 60 * 60 * 1000,
    ];
    return $map[$tier] ?? $map['7d'];
}

function is_unlimited_tier(string $tier): bool
{
    $t = strtolower($tier);
    return $t === 'unl' || $t === 'unlimited';
}

function games_allow(array $entryGames, string $gameId): bool
{
    $g = strtolower($gameId);
    if ($g === '') {
        return true;
    }
    if (!$entryGames) {
        return true;
    }
    foreach ($entryGames as $eg) {
        $x = strtolower((string)$eg);
        if ($x === 'all' || $x === $g) {
            return true;
        }
    }
    return false;
}

function allocate_client_ip(array $keys): string
{
    for ($t = 0; $t < 400; $t++) {
        $v = str_pad((string)random_int(0, 9999), 4, '0', STR_PAD_LEFT);
        $clash = false;
        foreach ($keys as $entry) {
            if (is_array($entry) && ($entry['clientIp'] ?? '') === $v) {
                $clash = true;
                break;
            }
        }
        if (!$clash) {
            return $v;
        }
    }
    return str_pad((string)(time() % 10000), 4, '0', STR_PAD_LEFT);
}

if ($_SERVER['REQUEST_METHOD'] === 'GET') {
    respond(200, read_registry($registryPath));
}

if ($_SERVER['REQUEST_METHOD'] !== 'POST') {
    respond(405, ['ok' => false, 'message' => 'method_not_allowed']);
}

$body = json_decode(file_get_contents('php://input') ?: '', true);
if (!is_array($body)) {
    respond(400, ['ok' => false, 'message' => 'bad_json']);
}

$action = (string)($body['action'] ?? '');

if ($action === 'merge') {
    verify_admin_token($body);
    $incoming = $body['keys'] ?? [];
    if (!is_array($incoming)) {
        $incoming = [];
    }

    $result = with_registry_lock($lockPath, function () use ($registryPath, $incoming) {
        $reg = read_registry($registryPath);
        $added = 0;
        $updated = 0;

        foreach ($incoming as $k => $entry) {
            if (!is_array($entry)) {
                continue;
            }
            $kn = normalize_key((string)$k);
            if ($kn === '') {
                continue;
            }
            if (!isset($reg['keys'][$kn])) {
                $reg['keys'][$kn] = $entry;
                $added++;
                continue;
            }
            $reg['keys'][$kn] = array_merge($reg['keys'][$kn], $entry);
            $updated++;
        }

        if (!write_registry($registryPath, $reg)) {
            respond(500, ['ok' => false, 'message' => 'write_failed']);
        }

        return ['ok' => true, 'added' => $added, 'updated' => $updated, 'total' => count($reg['keys'])];
    });

    respond(200, $result);
}

if ($action === 'delete') {
    verify_admin_token($body);
    $kn = normalize_key((string)($body['key'] ?? ''));
    if ($kn === '') {
        respond(400, ['ok' => false, 'message' => 'missing_key']);
    }

    with_registry_lock($lockPath, function () use ($registryPath, $kn) {
        $reg = read_registry($registryPath);
        if (!isset($reg['keys'][$kn])) {
            respond(404, ['ok' => false, 'message' => 'not_found']);
        }
        unset($reg['keys'][$kn]);
        if (!write_registry($registryPath, $reg)) {
            respond(500, ['ok' => false, 'message' => 'write_failed']);
        }
        respond(200, ['ok' => true, 'deleted' => $kn]);
    });
}

if ($action === 'redeem') {
    $kn = normalize_key((string)($body['key'] ?? ''));
    $forGame = strtolower((string)($body['gameId'] ?? ''));
    if ($kn === '' || strlen($kn) < 6) {
        respond(400, ['ok' => false, 'message' => 'Geçersiz anahtar.']);
    }

    $result = with_registry_lock($lockPath, function () use ($registryPath, $kn, $forGame) {
        $reg = read_registry($registryPath);
        $entry = $reg['keys'][$kn] ?? null;
        if (!is_array($entry)) {
            return ['ok' => false, 'message' => 'Bu anahtar kayıtlı değil.'];
        }
        if (!empty($entry['revoked'])) {
            return ['ok' => false, 'message' => 'Bu anahtar iptal edilmiş.'];
        }

        $tier = (string)($entry['tier'] ?? '7d');
        $unl = is_unlimited_tier($tier);
        $games = $entry['games'] ?? ['all'];
        if (!is_array($games) || !$games) {
            $games = ['all'];
        }
        if ($forGame !== '' && !games_allow($games, $forGame)) {
            return ['ok' => false, 'message' => 'Bu anahtar seçilen oyun için geçerli değil.'];
        }

        $now = (int)round(microtime(true) * 1000);
        if (($entry['shared'] ?? null) !== true) {
            $entry['shared'] = true;
        }

        if (empty($entry['activatedAt'])) {
            $entry['activatedAt'] = $now;
            $entry['expiresAt'] = $unl ? null : $now + tier_ms($tier);
        } elseif (!$unl && isset($entry['expiresAt']) && $entry['expiresAt'] !== null && $now > (int)$entry['expiresAt']) {
            return ['ok' => false, 'message' => 'Anahtarın süresi dolmuş.'];
        }

        $reg['keys'][$kn] = $entry;
        if (!write_registry($registryPath, $reg)) {
            respond(500, ['ok' => false, 'message' => 'write_failed']);
        }

        return [
            'ok' => true,
            'entry' => $entry,
            'keyNorm' => $kn,
            'expiresAt' => $entry['expiresAt'],
        ];
    });

    respond($result['ok'] ? 200 : 400, $result);
}

respond(400, ['ok' => false, 'message' => 'unknown_action']);
