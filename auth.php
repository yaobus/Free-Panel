<?php
/**
 * Free-Panel 认证与会话层
 */
require_once __DIR__ . '/db.php';

if (session_status() === PHP_SESSION_NONE) {
    // config.php 已由 db.php 引入，SESSION_LIFETIME 在此可用
    $lifetime = defined('SESSION_LIFETIME') ? (int) SESSION_LIFETIME : 30 * 86400;

    session_name('sunnav_sid');
    // 服务端 session 数据存活期必须 ≥ Cookie 有效期，否则服务端先被 GC 回收，
    // 会出现「Cookie 还在但已掉线」的情况
    ini_set('session.gc_maxlifetime', (string) $lifetime);
    session_set_cookie_params([
        'lifetime' => $lifetime,   // 非 0 => 持久 Cookie，关闭浏览器后仍保留（0 为浏览器会话级）
        'httponly' => true,
        'samesite' => 'Lax',
        'path'     => '/',
    ]);
    session_start();

    // 滑动续期：已登录用户每次访问都把 Cookie 有效期往后顺延，常用用户不会因固定期限掉线。
    // 必须显式重写 setcookie：session_start() 只在「新建会话」时下发 Cookie，
    // 复用旧会话时不会重发，光靠 session_set_cookie_params 无法续期。
    // 节流：距上次续期超过 1 天才执行，避免每个请求都重复下发 Set-Cookie 头。
    if (!empty($_SESSION['uid'])) {
        $renewAt = (int) ($_SESSION['_renew_at'] ?? 0);
        if ($renewAt < time() - 86400) {
            $_SESSION['_renew_at'] = time();
            $p = session_get_cookie_params();
            setcookie(
                session_name(),
                session_id(),
                [
                    'expires'  => time() + $lifetime,
                    'path'     => $p['path'],
                    'domain'   => $p['domain'],
                    'secure'   => $p['secure'],
                    'httponly' => $p['httponly'],
                    'samesite' => $p['samesite'],
                ]
            );
        }
    }
}

/**
 * 当前是否已登录
 */
function is_logged_in(): bool
{
    return !empty($_SESSION['uid']);
}

/**
 * 未登录则跳转登录页
 */
function require_login(): void
{
    if (!is_logged_in()) {
        header('Location: login.php');
        exit;
    }
}

/**
 * 获取 / 生成 CSRF Token
 */
function csrf_token(): string
{
    if (empty($_SESSION['csrf'])) {
        $_SESSION['csrf'] = bin2hex(random_bytes(16));
    }
    return $_SESSION['csrf'];
}

/**
 * 校验 CSRF Token
 */
function verify_csrf(?string $token): bool
{
    return $token !== null && !empty($_SESSION['csrf'])
        && hash_equals($_SESSION['csrf'], $token);
}
