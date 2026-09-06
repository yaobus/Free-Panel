<?php
/**
 * Free-Panel 登录认证页面
 * 功能：登录表单、失败次数锁定、底部两条备案信息
 */
require_once __DIR__ . '/auth.php';

if (is_logged_in()) {
    header('Location: index.php');
    exit;
}

$error = '';
$now   = time();

if ($_SERVER['REQUEST_METHOD'] === 'POST') {
    // 暴力破解防护：连续失败 5 次锁定 5 分钟
    if (isset($_SESSION['lock_until']) && $_SESSION['lock_until'] > $now) {
        $mins  = (int) ceil(($_SESSION['lock_until'] - $now) / 60);
        $error = "尝试次数过多，请 {$mins} 分钟后再试";
    } else {
        $username = trim($_POST['username'] ?? '');
        $password = (string) ($_POST['password'] ?? '');

        $stmt = db()->prepare('SELECT id, username, password_hash FROM users WHERE username = ?');
        $stmt->execute([$username]);
        $user = $stmt->fetch();

        if ($user && password_verify($password, $user['password_hash'])) {
            session_regenerate_id(true);
            $_SESSION['uid']    = (int) $user['id'];
            $_SESSION['uname']  = $user['username'];
            unset($_SESSION['fails'], $_SESSION['lock_until']);
            header('Location: index.php');
            exit;
        }

        $_SESSION['fails'] = (int) ($_SESSION['fails'] ?? 0) + 1;
        if ($_SESSION['fails'] >= 5) {
            $_SESSION['lock_until'] = $now + 300;
            $_SESSION['fails']      = 0;
            $error = '失败次数过多，账号已锁定 5 分钟';
        } else {
            $error = '用户名或密码错误（剩余 ' . (5 - $_SESSION['fails']) . ' 次机会）';
        }
    }
}

$title = setting('site_title', DEFAULT_SITE_TITLE);
$icp1  = setting('icp1', DEFAULT_ICP1);
$icp2  = setting('icp2', DEFAULT_ICP2);
$icp1Url = setting('icp1_url', DEFAULT_ICP1_URL);
$icp2Url = setting('icp2_url', DEFAULT_ICP2_URL);
// 备案 2 链接支持占位符 {q}：自动替换为备案 2 中的联网备案号（连续数字串）
if (strpos($icp2Url, '{q}') !== false) {
    $icp2Url = str_replace('{q}', preg_replace('/\D+/', '', $icp2), $icp2Url);
}
// 备案渲染：文本非空且链接为 http(s) 时输出可点击超链接（新窗口打开），否则纯文本
function filing_link(string $text, string $url): string
{
    if (preg_match('#^https?://#i', $url)) {
        return '<a class="filing" href="' . e($url) . '" target="_blank" rel="noopener noreferrer">' . e($text) . '</a>';
    }
    return '<span class="filing">' . e($text) . '</span>';
}
$siteLogo = trim(setting('site_logo', DEFAULT_SITE_LOGO));
// 登录页 LOGO 尺寸：52 → 104（需求：放大为 2 倍）
$logoHtml = logo_markup($siteLogo, 104);
?>
<!DOCTYPE html>
<html lang="zh-CN">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>登录 · <?= e($title) ?></title>
<link rel="stylesheet" href="assets/style.css">
</head>
<body class="login-page <?= body_bg_class() ?>" style="<?= body_bg_style() ?>">
    <main class="login-wrap">
        <div class="login-card">
            <div class="login-logo">
                <?php if ($logoHtml !== ''): ?>
                    <?= $logoHtml ?>
                <?php else: ?>
                <svg viewBox="0 0 48 48" width="104" height="104" aria-hidden="true">
                    <defs>
                        <linearGradient id="lg" x1="0" y1="0" x2="1" y2="1">
                            <stop offset="0" stop-color="#4f6ef7"/>
                            <stop offset="1" stop-color="#a855f7"/>
                        </linearGradient>
                    </defs>
                    <rect x="2" y="2" width="44" height="44" rx="12" fill="url(#lg)"/>
                    <circle cx="24" cy="26" r="10" fill="#fff" opacity=".95"/>
                    <g stroke="#fff" stroke-width="3" stroke-linecap="round">
                        <line x1="24" y1="8"  x2="24" y2="12"/>
                        <line x1="24" y1="40" x2="24" y2="44"/>
                        <line x1="8"  y1="26" x2="12" y2="26"/>
                        <line x1="36" y1="26" x2="40" y2="26"/>
                    </g>
                </svg>
                <?php endif; ?>
            </div>
            <h1 class="login-title"><?= e($title) ?></h1>
            <?php if (setting('site_subtitle', DEFAULT_SITE_SUBTITLE) !== ''): ?><p class="login-sub"><?= e(setting('site_subtitle', DEFAULT_SITE_SUBTITLE)) ?></p><?php endif; ?>

            <?php if ($error !== ''): ?>
                <div class="alert"><?= e($error) ?></div>
            <?php endif; ?>

            <form method="post" action="login.php" autocomplete="off" class="login-form">
                <label class="field">
                    <span>用户名</span>
                    <input type="text" name="username" required autofocus
                           placeholder="请输入用户名" value="<?= e($_POST['username'] ?? '') ?>">
                </label>
                <label class="field">
                    <span>密码</span>
                    <input type="password" name="password" required placeholder="请输入密码">
                </label>
                <button type="submit" class="btn btn-primary btn-block">登 录</button>
            </form>
        </div>
    </main>

    <footer class="site-footer">
        <div class="filings">
            <?php if ($icp1 !== ''): ?><?= filing_link($icp1, $icp1Url) ?><?php endif; ?>
            <?php if ($icp1 !== '' && $icp2 !== ''): ?><span class="sep">|</span><?php endif; ?>
            <?php if ($icp2 !== ''): ?><?= filing_link($icp2, $icp2Url) ?><?php endif; ?>
        </div>
        <div class="copy">© <?= date('Y') ?> <a class="filing" href="https://github.com/yaobus/Free-Panel" target="_blank" rel="noopener noreferrer"><?= e($title) ?></a><?php if (setting('site_subtitle', DEFAULT_SITE_SUBTITLE) !== ''): ?> · <?= e(setting('site_subtitle', DEFAULT_SITE_SUBTITLE)) ?><?php endif; ?></div>
    </footer>
</body>
</html>
