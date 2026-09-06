<?php
/**
 * Free-Panel 收藏夹主页（需登录）
 * 布局参考 Sun-Panel：侧栏分组导航 + 图标卡片网格 + 顶部搜索
 * 交互：卡片/分组均支持鼠标拖拽排序（无需管理模式）、右键菜单、
 *       分组名悬浮「＋」添加（2 秒未点击自动隐藏）、默认/内网/IPv6 三模式地址
 */
require_once __DIR__ . '/auth.php';
require_login();

$title       = setting('site_title', DEFAULT_SITE_TITLE);
$subtitle    = setting('site_subtitle', DEFAULT_SITE_SUBTITLE);
$openNew     = setting('open_new_tab', DEFAULT_OPEN_NEW_TAB) === '1';
$showSidebar = setting('show_sidebar', DEFAULT_SHOW_SIDEBAR) === '1';
$siteIcon    = trim(setting('site_icon', DEFAULT_SITE_ICON));
$siteLogo    = trim(setting('site_logo', DEFAULT_SITE_LOGO));
// 分组显示开关
$showGIcon  = setting('show_group_icon', DEFAULT_SHOW_GROUP_ICON) === '1';
$showGName  = setting('show_group_name', DEFAULT_SHOW_GROUP_NAME) === '1';
$showGCount = setting('show_group_count', DEFAULT_SHOW_GROUP_COUNT) === '1';

// 搜索栏设置
$showSearchbar = setting('show_searchbar', DEFAULT_SHOW_SEARCHBAR) === '1';
$searchLocal   = setting('search_local', DEFAULT_SEARCH_LOCAL) === '1';
$searchWeb     = setting('search_web', DEFAULT_SEARCH_WEB) === '1';
$searchHint    = setting('search_hint', DEFAULT_SEARCH_HINT) === '1';
$searchReset   = setting('search_reset', DEFAULT_SEARCH_RESET) === '1';
// 搜索引擎列表（JSON 字符串，body data-engines 注入给前端；空数组由前端迁移/兜底）
$enginesJson   = setting('engines', '[]');

$pdo    = db();
$groups = $pdo->query('SELECT * FROM groups ORDER BY sort ASC, id ASC')->fetchAll();
$links  = $pdo->query('SELECT * FROM links ORDER BY sort ASC, id ASC')->fetchAll();

$linksByGroup = [];
foreach ($links as $l) {
    $linksByGroup[$l['group_id']][] = $l;
}

/**
 * 渲染链接图标：
 * 1) 图片 URL  -> <img>（加载失败自动降级为首字头像）
 * 2) iconify:前缀 -> 从 Iconify 在线图标库加载（https://api.iconify.design/{name}.svg）
 * 3) emoji/文本 -> emoji 块
 * 4) 留空      -> 自动尝试目标站点 /favicon.ico
 */
function render_icon(array $l): string
{
    $icon = trim($l['icon'] ?? '');
    $hue  = (crc32($l['name'] ?? '') % 360 + 360) % 360;
    $name = e($l['name'] ?? '');
    $first = e(mb_substr($l['name'] ?? '?', 0, 1, 'UTF-8'));

    if ($icon !== '' && preg_match('#^(https?://|data:image/)#i', $icon)) {
        return '<img class="ico img" src="' . e($icon) . '" alt="" loading="lazy"
                    data-name="' . $name . '" data-hue="' . $hue . '">';
    }
    if ($icon !== '' && preg_match('#^iconify:(.+)$#i', $icon, $m)) {
        // Iconify 图标：iconify:集合名:图标名
        $iconName = trim($m[1]);
        return '<img class="ico img" src="https://api.iconify.design/' . e($iconName) . '.svg"
                    alt="" loading="lazy" data-name="' . $name . '" data-hue="' . $hue . '">';
    }
    if ($icon !== '') { // emoji 或自定义文本
        return '<span class="ico emoji" style="--h:' . $hue . '">' . e($icon) . '</span>';
    }
    // 自动 favicon
    $u = preg_match('#^https?://#i', $l['url']) ? $l['url'] : 'http://' . ltrim($l['url'], '/');
    $host = parse_url($u, PHP_URL_HOST);
    $scheme = parse_url($u, PHP_URL_SCHEME) ?: 'http';
    if ($host) {
        return '<img class="ico img" src="' . e($scheme . '://' . $host . '/favicon.ico') . '" alt=""
                    data-name="' . $name . '" data-hue="' . $hue . '">';
    }
    return '<span class="ico letter" style="--h:' . $hue . '">' . $first . '</span>';
}

/** 卡片搜索关键词：名称 + 描述 + 全部地址 */
function card_key(array $l): string
{
    return strtolower(($l['name'] ?? '') . ' ' . ($l['description'] ?? '')
        . ' ' . ($l['url'] ?? '') . ' ' . ($l['url_lan'] ?? '') . ' ' . ($l['url_ipv6'] ?? ''));
}

/**
 * 渲染分组图标（侧栏 + 分组标题）：空返回空串
 * 支持 图片URL / data:image / iconify:名称 / emoji 或文本
 */
function group_icon_html(string $icon): string
{
    $icon = trim($icon);
    if ($icon === '') return '';
    if (preg_match('#^(https?://|data:image/)#i', $icon)) {
        return '<span class="g-ico img"><img src="' . e($icon) . '" alt="" loading="lazy"></span>';
    }
    if (preg_match('#^iconify:(.+)$#i', $icon, $m)) {
        return '<span class="g-ico img"><img src="https://api.iconify.design/' . e(trim($m[1])) . '.svg" alt="" loading="lazy"></span>';
    }
    return '<span class="g-ico emoji">' . e($icon) . '</span>';
}

/** 补全 URL scheme（省略时默认 http） */
function full_url(string $u): string
{
    return preg_match('#^https?://#i', $u) ? $u : 'http://' . ltrim($u, '/');
}
?>
<!DOCTYPE html>
<html lang="zh-CN">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<meta name="csrf" content="<?= e(csrf_token()) ?>">
<title><?= e($title) ?> · 收藏夹</title>
<link rel="stylesheet" href="assets/style.css">
<?php
// 站点图标（favicon）：优先 site_icon；未设置时若 LOGO 为图片则回退使用 LOGO
$faviconHref = '';
$favSource   = $siteIcon !== '' ? $siteIcon : (preg_match('#^(https?://|/uploads/|data:image/)#i', $siteLogo) ? $siteLogo : '');
if ($favSource !== '') {
    if (preg_match('#^(https?://|/uploads/|data:image/)#i', $favSource)) {
        $faviconHref = $favSource;
    } elseif (preg_match('#^iconify:(.+)$#i', $favSource, $m)) {
        $faviconHref = 'https://api.iconify.design/' . e(trim($m[1])) . '.svg';
    } else {
        // emoji → 内联 SVG 文本图标
        $svg = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100"><text y=".9em" font-size="90">' . $favSource . '</text></svg>';
        $faviconHref = 'data:image/svg+xml,' . rawurlencode($svg);
    }
}
// 网站 LOGO（主页左上角）：空 = 内置默认 SVG
$logoHtml = logo_markup($siteLogo, 34);
if ($faviconHref !== ''): ?>
<link rel="icon" href="<?= e($faviconHref) ?>">
<?php endif; ?>
</head>
<body class="<?= body_bg_class() ?><?= $showSearchbar ? '' : ' searchbar-hidden' ?>" style="<?= body_bg_style() ?>"
      data-search-local="<?= $searchLocal ? '1' : '0' ?>" data-search-web="<?= $searchWeb ? '1' : '0' ?>"
      data-search-reset="<?= $searchReset ? '1' : '0' ?>"
      data-engines="<?= e($enginesJson) ?>">
    <header class="topbar">
        <div class="topbar-inner">
            <div class="brand">
                <span class="brand-logo">
                    <?php if ($logoHtml !== ''): ?>
                        <?= $logoHtml ?>
                    <?php else: ?>
                    <svg viewBox="0 0 48 48" width="34" height="34" aria-hidden="true">
                        <rect x="2" y="2" width="44" height="44" rx="12" fill="url(#lg)"/>
                        <circle cx="24" cy="26" r="10" fill="#fff" opacity=".95"/>
                        <g stroke="#fff" stroke-width="3" stroke-linecap="round">
                            <line x1="24" y1="8"  x2="24" y2="12"/>
                            <line x1="24" y1="40" x2="24" y2="44"/>
                            <line x1="8"  y1="26" x2="12" y2="26"/>
                            <line x1="36" y1="26" x2="40" y2="26"/>
                        </g>
                        <defs>
                            <linearGradient id="lg" x1="0" y1="0" x2="1" y2="1">
                                <stop offset="0" stop-color="#4f6ef7"/>
                                <stop offset="1" stop-color="#a855f7"/>
                            </linearGradient>
                        </defs>
                    </svg>
                    <?php endif; ?>
                </span>
                <span class="brand-text">
                    <span class="brand-name"><?= e($title) ?></span>
                    <?php if ($subtitle !== ''): ?><span class="brand-sub"><?= e($subtitle) ?></span><?php endif; ?>
                </span>
            </div>

            <div class="mode-switch" id="modeSwitch" title="点击地址卡片时打开的地址类型">
                <span class="mode-slider" aria-hidden="true"></span>
                <button data-mode="default" class="active">默认</button>
                <button data-mode="lan">内网</button>
                <button data-mode="ipv6">IPv6</button>
            </div>

            <div class="top-actions">
                <button id="moreBtn" class="ibtn more-btn" title="更多操作" aria-haspopup="true" aria-expanded="false">
                    <svg viewBox="0 0 24 24" width="18" height="18" fill="currentColor" aria-hidden="true"><circle cx="5" cy="12" r="1.9"/><circle cx="12" cy="12" r="1.9"/><circle cx="19" cy="12" r="1.9"/></svg>
                </button>
                <button id="themeBtn" class="ibtn" title="切换明暗主题">
                    <svg class="i-sun" viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><circle cx="12" cy="12" r="4.5"/><path d="M12 2.5v2M12 19.5v2M2.5 12h2M19.5 12h2M5 5l1.4 1.4M17.6 17.6 19 19M19 5l-1.4 1.4M6.4 17.6 5 19"/></svg>
                    <svg class="i-moon" viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 12.8A9 9 0 1 1 11.2 3a7 7 0 0 0 9.8 9.8z"/></svg>
                </button>
                <button id="settingsBtn" class="ibtn" title="站点设置（含用户名与密码）">
                    <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="3.2"/><path d="M19.4 15a1.7 1.7 0 0 0 .34 1.87l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.7 1.7 0 0 0-1.87-.34 1.7 1.7 0 0 0-1 1.55V21a2 2 0 1 1-4 0v-.09a1.7 1.7 0 0 0-1-1.55 1.7 1.7 0 0 0-1.87.34l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.7 1.7 0 0 0 .34-1.87 1.7 1.7 0 0 0-1.55-1H3a2 2 0 1 1 0-4h.09a1.7 1.7 0 0 0 1.55-1 1.7 1.7 0 0 0-.34-1.87l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.7 1.7 0 0 0 1.87.34h.01a1.7 1.7 0 0 0 1-1.55V3a2 2 0 1 1 4 0v.09a1.7 1.7 0 0 0 1 1.55 1.7 1.7 0 0 0 1.87-.34l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.7 1.7 0 0 0-.34 1.87v.01a1.7 1.7 0 0 0 1.55 1H21a2 2 0 1 1 0 4h-.09a1.7 1.7 0 0 0-1.55 1z"/></svg>
                </button>
                <button id="logoutBtn" class="btn btn-ghost btn-sm" title="退出登录">退出</button>

                <div class="more-menu" id="moreMenu" role="menu" aria-label="更多操作" hidden>
                    <button class="more-item" data-more-action="theme" role="menuitem">
                        <span class="more-ico">
                            <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true"><circle cx="12" cy="12" r="4.5"/><path d="M12 2.5v2M12 19.5v2M2.5 12h2M19.5 12h2M5 5l1.4 1.4M17.6 17.6 19 19M19 5l-1.4 1.4M6.4 17.6 5 19"/></svg>
                            <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M21 12.8A9 9 0 1 1 11.2 3a7 7 0 0 0 9.8 9.8z"/></svg>
                        </span>
                        <span class="more-label">切换主题</span>
                    </button>
                    <button class="more-item" data-more-action="settings" role="menuitem">
                        <span class="more-ico">
                            <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="12" cy="12" r="3.2"/><path d="M19.4 15a1.7 1.7 0 0 0 .34 1.87l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.7 1.7 0 0 0-1.87-.34 1.7 1.7 0 0 0-1 1.55V21a2 2 0 1 1-4 0v-.09a1.7 1.7 0 0 0-1-1.55 1.7 1.7 0 0 0-1.87.34l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.7 1.7 0 0 0 .34-1.87 1.7 1.7 0 0 0-1.55-1H3a2 2 0 1 1 0-4h.09a1.7 1.7 0 0 0 1.55-1 1.7 1.7 0 0 0-.34-1.87l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.7 1.7 0 0 0 1.87.34h.01a1.7 1.7 0 0 0 1-1.55V3a2 2 0 1 1 4 0v.09a1.7 1.7 0 0 0 1 1.55 1.7 1.7 0 0 0 1.87-.34l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.7 1.7 0 0 0-.34 1.87v.01a1.7 1.7 0 0 0 1.55 1H21a2 2 0 1 1 0 4h-.09a1.7 1.7 0 0 0-1.55 1z"/></svg>
                        </span>
                        <span class="more-label">站点设置</span>
                    </button>
                    <div class="more-divider" role="separator"></div>
                    <button class="more-item more-danger" data-more-action="logout" role="menuitem">
                        <span class="more-ico">
                            <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/><path d="M16 17l5-5-5-5"/><path d="M21 12H9"/></svg>
                        </span>
                        <span class="more-label">退出登录</span>
                    </button>
                </div>
            </div>
        </div>
    </header>

    <div class="layout">
        <?php if ($showSidebar && count($groups) > 0): ?>
        <nav class="side" id="sideNav">
            <div class="side-inner" style="margin-top: <?= (int) side_nav_offset() ?>px">
                <div class="side-title">
                    <svg class="side-title-ico" viewBox="0 0 24 24" width="17" height="17" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v9a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/></svg>
                    <span>分组导航</span>
                    <button class="side-add-group" data-act="add-group" title="添加分组"><svg viewBox="0 0 24 24" width="12" height="12" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg></button>
                </div>
                <?php foreach ($groups as $g): ?>
                    <button class="side-item" data-target="#g<?= (int) $g['id'] ?>">
                        <?php if ($showGIcon): ?><?= group_icon_html($g['icon'] ?? '') ?><?php endif; ?>
                        <span class="side-name"><?= e($g['name']) ?></span>
                        <?php if ($showGCount): ?><span class="side-count"><?= count($linksByGroup[$g['id']] ?? []) ?></span><?php endif; ?>
                    </button>
                <?php endforeach; ?>
            </div>
        </nav>
        <?php endif; ?>

        <main class="main">
            <!-- 搜索栏：左侧搜索引擎切换，回车调用所选搜索引擎 -->
            <div class="search-bar">
                <div class="search-engine" id="engineBtn" title="点击切换 / 管理搜索引擎">
                    <span class="se-ico" id="engineIcon">🔍</span>
                    <span class="se-name" id="engineName">搜索引擎</span>
                    <svg class="se-caret" viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M6 9l6 6 6-6"/></svg>
                </div>
                <div class="search-box">
                    <svg viewBox="0 0 24 24" width="17" height="17" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><circle cx="11" cy="11" r="7"/><line x1="21" y1="21" x2="16.5" y2="16.5"/></svg>
                    <input id="search" type="text" placeholder="<?= $searchHint ? '输入关键词过滤收藏夹，回车用当前引擎联网搜索…' : '' ?>">
                    <button id="searchClear" class="search-clear" type="button" title="清空搜索" hidden>✕</button>
                </div>
                <!-- 搜索引擎配置浮层（作为 search-bar 子节点，实现相对搜索栏定位的悬浮窗） -->
                <div id="enginePanel" class="engine-panel" hidden>
                    <div class="engine-panel-title">选择搜索引擎</div>
                    <div class="engine-list" id="engineList"></div>
                    <div class="engine-panel-divider"></div>
                    <button id="engineAddBtn" class="btn btn-primary btn-sm engine-add-btn" type="button">＋ 添加 / 编辑搜索引擎</button>
                </div>
            </div>

            <!-- 卡片滚动容器：搜索栏固定，卡片在此容器内独立滚动（超出顶部被裁切） -->
            <div class="main-scroll" id="mainScroll">
            <?php foreach ($groups as $g): $gl = $linksByGroup[$g['id']] ?? []; ?>
            <section class="group" id="g<?= (int) $g['id'] ?>" data-group="<?= (int) $g['id'] ?>" data-icon="<?= e($g['icon'] ?? '') ?>">
                <div class="group-head" title="按住拖动分组名称可调整分组顺序">
                    <?php if ($showGIcon): ?><?= group_icon_html($g['icon'] ?? '') ?><?php endif; ?>
                    <?php if ($showGName): ?><h2 class="group-name"><?= e($g['name']) ?></h2><?php endif; ?>
                    <button class="add-link-btn" data-act="add-link" data-gid="<?= (int) $g['id'] ?>" title="在本分组添加收藏"><svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg></button>
                    <?php if ($showGCount): ?><span class="group-count"><?= count($gl) ?></span><?php endif; ?>
                    <div class="group-ops">
                        <span class="group-tools">
                            <button class="ibtn ibtn-sm" data-act="edit-group" data-id="<?= (int) $g['id'] ?>" title="编辑分组">✎</button>
                            <button class="ibtn ibtn-sm danger" data-act="del-group" data-id="<?= (int) $g['id'] ?>" title="删除分组">🗑</button>
                        </span>
                    </div>
                </div>

                <div class="grid" data-group="<?= (int) $g['id'] ?>">
                    <?php if (count($gl) === 0): ?>
                        <div class="grid-empty">该分组暂无收藏，将鼠标移到分组名称上点「＋」添加</div>
                    <?php endif; ?>
                    <?php foreach ($gl as $l): ?>
                        <?php
                        $cColor = trim($l['color'] ?? '');
                        $cStyle = '';
                        if ($cColor === 'transparent') $cStyle = ' style="background:transparent"';
                        elseif ($cColor !== '' && preg_match('/^#[0-9a-fA-F]{6}$/', $cColor)) $cStyle = ' style="background:' . e($cColor) . '"';
                        ?>
                        <a class="card" href="<?= e(full_url($l['url'])) ?>" target="<?= $openNew ? '_blank' : '_self' ?>"
                           rel="noopener" draggable="true" data-lid="<?= (int) $l['id'] ?>"
                           data-k="<?= e(card_key($l)) ?>" data-name="<?= e($l['name']) ?>"
                           data-icon="<?= e($l['icon']) ?>" data-color="<?= e($cColor) ?>"
                           data-u-default="<?= e(full_url($l['url'])) ?>"
                           data-u-lan="<?= $l['url_lan'] !== '' ? e(full_url($l['url_lan'])) : '' ?>"
                           data-u-ipv6="<?= $l['url_ipv6'] !== '' ? e(full_url($l['url_ipv6'])) : '' ?>"<?= $cStyle ?>>
                            <span class="card-icon"><?= render_icon($l) ?></span>
                            <span class="card-name"><?= e($l['name']) ?></span>
                            <?php if (trim($l['description'] ?? '') !== ''): ?>
                                <span class="card-desc"><?= e($l['description']) ?></span>
                            <?php endif; ?>
                        </a>
                    <?php endforeach; ?>
                </div>
            </section>
            <?php endforeach; ?>
            </div><!-- /.main-scroll -->
        </main>
    </div>

    <!-- 弹窗 / 右键菜单 / Toast 容器（由 JS 填充） -->
    <div id="modalRoot"></div>
    <div id="ctxMenu" class="ctx-menu" hidden></div>
    <div id="toast" class="toast" hidden></div>

    <script src="assets/app.js"></script>
</body>
</html>
