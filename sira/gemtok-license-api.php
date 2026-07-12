<?php
declare(strict_types=1);

/* GemTok License API v2 - PHP 7.4+ / shared hosting friendly. */
header('Content-Type: application/json; charset=utf-8');
header('Cache-Control: no-store');
header('X-Content-Type-Options: nosniff');
header('X-Frame-Options: DENY');
header('Referrer-Policy: no-referrer');

const TOKEN_TTL = 900; // 15 dakika; istemci açılışta tekrar doğrular.
const ALLOWED_TIERS = ['7d', '30d', '90d', '365d', 'unl'];
const ALLOWED_GAMES = ['all', 'warFront', 'arenaBattle', 'countryBirds', 'vote5', 'arena3', 'arena5gen', 'team20', 'airRace'];

$dataDir = dirname(__DIR__) . DIRECTORY_SEPARATOR . '.gemtok-private';
$dbPath = $dataDir . DIRECTORY_SEPARATOR . 'licenses.json';
$lockPath = $dataDir . DIRECTORY_SEPARATOR . 'licenses.lock';
$ratePath = $dataDir . DIRECTORY_SEPARATOR . 'rate.json';
$legacyPath = __DIR__ . DIRECTORY_SEPARATOR . 'gemtok-license-registry.json';
$privateConfig = is_file($dataDir . DIRECTORY_SEPARATOR . 'config.php')
    ? require $dataDir . DIRECTORY_SEPARATOR . 'config.php'
    : [];
if (!is_array($privateConfig)) $privateConfig = [];
$adminSecret = trim((string)(getenv('GEMTOK_LICENSE_ADMIN_SECRET') ?: ($privateConfig['admin_secret'] ?? '')));
$pepper = trim((string)(getenv('GEMTOK_LICENSE_PEPPER') ?: ($privateConfig['pepper'] ?? '')));
$tokenSecret = trim((string)(getenv('GEMTOK_LICENSE_TOKEN_SECRET') ?: ($privateConfig['token_secret'] ?? '')));

function out(int $status, array $data): void { http_response_code($status); echo json_encode($data, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES); exit; }
function b64e(string $v): string { return rtrim(strtr(base64_encode($v), '+/', '-_'), '='); }
function b64d(string $v): string { $v = strtr($v, '-_', '+/'); return (string)base64_decode($v . str_repeat('=', (4 - strlen($v) % 4) % 4), true); }
function norm(string $v): string { return strtoupper((string)preg_replace('/\s+/', '', trim($v))); }
function now_ms(): int { return (int)round(microtime(true) * 1000); }
function client_ip(): string { return substr((string)($_SERVER['REMOTE_ADDR'] ?? 'unknown'), 0, 64); }
function key_hash(string $key, string $pepper): string { return hash_hmac('sha256', norm($key), $pepper); }
function key_hint(string $key): string { $k = norm($key); return substr($k, 0, 4) . '-••••-' . substr($k, -4); }
function read_json(string $path, array $fallback): array { if (!is_file($path)) return $fallback; $v = json_decode((string)file_get_contents($path), true); return is_array($v) ? $v : $fallback; }
function atomic_write(string $path, array $value): void { $tmp = $path . '.tmp.' . getmypid(); $json = json_encode($value, JSON_PRETTY_PRINT | JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES); if ($json === false || file_put_contents($tmp, $json, LOCK_EX) === false || !rename($tmp, $path)) out(500, ['ok'=>false,'message'=>'storage_error']); }
function locked(string $lockPath, callable $fn) { $fp = fopen($lockPath, 'c'); if (!$fp || !flock($fp, LOCK_EX)) out(503, ['ok'=>false,'message'=>'storage_busy']); try { return $fn(); } finally { flock($fp, LOCK_UN); fclose($fp); } }
function tier_ms(string $tier): int { return ['7d'=>604800000,'30d'=>2592000000,'90d'=>7776000000,'365d'=>31536000000][$tier] ?? 604800000; }
function games_allow(array $games, string $game): bool { if ($game === '') return true; foreach ($games as $g) if (strtolower((string)$g) === 'all' || strtolower((string)$g) === strtolower($game)) return true; return false; }
function public_entry(array $e): array { return ['id'=>$e['id'],'hint'=>$e['hint'],'tier'=>$e['tier'],'games'=>$e['games'],'createdAt'=>$e['createdAt'],'activatedAt'=>$e['activatedAt'],'expiresAt'=>$e['expiresAt'],'revoked'=>(bool)$e['revoked'],'maxDevices'=>$e['maxDevices'],'deviceCount'=>count($e['devices'] ?? [])]; }
function require_admin(array $body, string $secret): void { if ($secret === '') out(503, ['ok'=>false,'message'=>'admin_not_configured']); $given=(string)($body['adminToken'] ?? ($_SERVER['HTTP_X_GEMTOK_ADMIN'] ?? '')); if ($given === '' || !hash_equals($secret, $given)) out(403, ['ok'=>false,'message'=>'unauthorized']); }
function sign_token(array $payload, string $secret): string { $p=b64e((string)json_encode($payload, JSON_UNESCAPED_SLASHES)); return $p . '.' . b64e(hash_hmac('sha256', $p, $secret, true)); }
function verify_token(string $token, string $secret): ?array { $a=explode('.', $token); if (count($a)!==2 || !hash_equals(b64e(hash_hmac('sha256',$a[0],$secret,true)),$a[1])) return null; $p=json_decode(b64d($a[0]),true); if (!is_array($p) || (int)($p['exp']??0)<time()) return null; return $p; }
function device_id(array $body): string { $d=substr(preg_replace('/[^a-zA-Z0-9_-]/','',(string)($body['deviceId']??'')),0,80); return strlen($d)>=16 ? $d : hash('sha256', client_ip() . '|' . (string)($_SERVER['HTTP_USER_AGENT']??'')); }

if (!is_dir($dataDir) && !mkdir($dataDir, 0750, true) && !is_dir($dataDir)) out(500, ['ok'=>false,'message'=>'storage_init_failed']);
if (!is_file($dataDir . DIRECTORY_SEPARATOR . '.htaccess')) @file_put_contents($dataDir . DIRECTORY_SEPARATOR . '.htaccess', "Require all denied\nDeny from all\n");
if ($pepper === '' || $tokenSecret === '') out(503, ['ok'=>false,'message'=>'license_server_not_configured']);

if ($_SERVER['REQUEST_METHOD'] === 'GET') out(200, ['ok'=>true,'service'=>'gemtok-license','version'=>2,'adminConfigured'=>$adminSecret!=='']);
if ($_SERVER['REQUEST_METHOD'] !== 'POST') out(405, ['ok'=>false,'message'=>'method_not_allowed']);
$body=json_decode((string)file_get_contents('php://input'),true); if (!is_array($body)) out(400,['ok'=>false,'message'=>'bad_json']);
$action=(string)($body['action']??'');

// Basit kalıcı brute-force sınırı: IP başına 10 dakikada 30 doğrulama.
if ($action==='redeem') locked($lockPath, function() use($ratePath) { $r=read_json($ratePath,[]); $ip=hash('sha256',client_ip()); $now=time(); $x=$r[$ip]??['start'=>$now,'count'=>0]; if ($now-(int)$x['start']>600) $x=['start'=>$now,'count'=>0]; $x['count']++; $r[$ip]=$x; foreach($r as $k=>$v) if($now-(int)($v['start']??0)>1200) unset($r[$k]); atomic_write($ratePath,$r); if($x['count']>30) out(429,['ok'=>false,'message'=>'Çok fazla deneme. Lütfen daha sonra tekrar deneyin.']); });

if ($action==='merge') {
  require_admin($body,$adminSecret); $incoming=is_array($body['keys']??null)?$body['keys']:[];
  $result=locked($lockPath,function() use($dbPath,$incoming,$pepper){ $db=read_json($dbPath,['version'=>2,'licenses'=>[]]); $added=0;$updated=0; foreach($incoming as $raw=>$src){ if(!is_array($src))continue; $key=norm((string)$raw); if(strlen($key)<12)continue; $h=key_hash($key,$pepper); $old=$db['licenses'][$h]??null; $tier=in_array((string)($src['tier']??'7d'),ALLOWED_TIERS,true)?(string)$src['tier']:'7d'; $games=array_values(array_filter((array)($src['games']??['all']),fn($g)=>in_array((string)$g,ALLOWED_GAMES,true))); if(!$games)$games=['all']; $e=is_array($old)?$old:['id'=>bin2hex(random_bytes(12)),'hint'=>key_hint($key),'createdAt'=>gmdate('c'),'activatedAt'=>null,'expiresAt'=>null,'devices'=>[]]; $e['tier']=$tier;$e['games']=$games;$e['revoked']=(bool)($src['revoked']??false);$e['maxDevices']=max(1,min(10,(int)($src['maxDevices']??5))); if(!empty($src['activatedAt'])){$e['activatedAt']=(int)$src['activatedAt'];$e['expiresAt']=$tier==='unl'?null:(isset($src['expiresAt'])?(int)$src['expiresAt']:$e['activatedAt']+tier_ms($tier));} $db['licenses'][$h]=$e; $old===null?$added++:$updated++; } atomic_write($dbPath,$db); return ['ok'=>true,'added'=>$added,'updated'=>$updated,'total'=>count($db['licenses'])]; }); out(200,$result);
}

if ($action==='redeem') {
  $key=norm((string)($body['key']??''));$game=(string)($body['gameId']??'');$device=device_id($body); if(strlen($key)<12)out(400,['ok'=>false,'message'=>'Geçersiz anahtar.']);
  $result=locked($lockPath,function() use($dbPath,$key,$game,$device,$pepper,$tokenSecret){$db=read_json($dbPath,['version'=>2,'licenses'=>[]]);$h=key_hash($key,$pepper);$e=$db['licenses'][$h]??null;if(!is_array($e))return ['status'=>404,'data'=>['ok'=>false,'message'=>'Bu anahtar kayıtlı değil.']];if(!empty($e['revoked']))return ['status'=>403,'data'=>['ok'=>false,'message'=>'Bu anahtar iptal edilmiş.']];if(!games_allow((array)$e['games'],$game))return ['status'=>403,'data'=>['ok'=>false,'message'=>'Bu anahtar seçilen oyun için geçerli değil.']];$now=now_ms();if(empty($e['activatedAt'])){$e['activatedAt']=$now;$e['expiresAt']=$e['tier']==='unl'?null:$now+tier_ms($e['tier']);}if($e['expiresAt']!==null&&$now>(int)$e['expiresAt'])return ['status'=>410,'data'=>['ok'=>false,'message'=>'Anahtarın süresi dolmuş.']];$devices=(array)($e['devices']??[]);if(!isset($devices[$device])&&count($devices)>=(int)$e['maxDevices'])return ['status'=>409,'data'=>['ok'=>false,'message'=>'Bu anahtar cihaz limitine ulaştı.']];$devices[$device]=['firstSeen'=>$devices[$device]['firstSeen']??gmdate('c'),'lastSeen'=>gmdate('c')];$e['devices']=$devices;$db['licenses'][$h]=$e;atomic_write($dbPath,$db);$payload=['v'=>2,'lid'=>$e['id'],'kh'=>$h,'did'=>$device,'iat'=>time(),'exp'=>time()+TOKEN_TTL];return ['status'=>200,'data'=>['ok'=>true,'entry'=>public_entry($e),'token'=>sign_token($payload,$tokenSecret),'deviceId'=>$device]];});out($result['status'],$result['data']);
}

if ($action==='validate') {
  $p=verify_token((string)($body['token']??''),$tokenSecret);if(!$p)out(401,['ok'=>false,'message'=>'Oturum yenilenmeli.']);$game=(string)($body['gameId']??'');$db=read_json($dbPath,['licenses'=>[]]);$e=$db['licenses'][$p['kh']]??null;if(!is_array($e)||$e['id']!==$p['lid']||!isset($e['devices'][$p['did']])||!empty($e['revoked']))out(403,['ok'=>false,'message'=>'Lisans artık geçerli değil.']);if($e['expiresAt']!==null&&now_ms()>(int)$e['expiresAt'])out(410,['ok'=>false,'message'=>'Lisansın süresi dolmuş.']);if(!games_allow((array)$e['games'],$game))out(403,['ok'=>false,'message'=>'Bu oyun lisans kapsamında değil.']);$p['iat']=time();$p['exp']=time()+TOKEN_TTL;out(200,['ok'=>true,'entry'=>public_entry($e),'token'=>sign_token($p,$tokenSecret)]);
}

if ($action==='delete') { require_admin($body,$adminSecret);$key=norm((string)($body['key']??''));locked($lockPath,function()use($dbPath,$key,$pepper){$db=read_json($dbPath,['version'=>2,'licenses'=>[]]);$h=key_hash($key,$pepper);if(!isset($db['licenses'][$h]))out(404,['ok'=>false,'message'=>'not_found']);unset($db['licenses'][$h]);atomic_write($dbPath,$db);});out(200,['ok'=>true]); }
out(400,['ok'=>false,'message'=>'unknown_action']);
