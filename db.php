<?php
/**
 * Free-Panel 数据库层：SQLite 连接、建表、种子数据、设置读写
 */
require_once __DIR__ . '/config.php';

/**
 * 获取 PDO 单例连接（首次调用时初始化数据库）
 */
function db(): PDO
{
    static $pdo = null;
    if ($pdo === null) {
        $dir = dirname(DB_PATH);
        if (!is_dir($dir) && !@mkdir($dir, 0775, true) && !is_dir($dir)) {
            throw new RuntimeException('无法创建数据目录: ' . $dir);
        }
        $pdo = new PDO('sqlite:' . DB_PATH);
        $pdo->setAttribute(PDO::ATTR_ERRMODE, PDO::ERRMODE_EXCEPTION);
        $pdo->setAttribute(PDO::ATTR_DEFAULT_FETCH_MODE, PDO::FETCH_ASSOC);
        $pdo->exec('PRAGMA journal_mode = WAL;');
        $pdo->exec('PRAGMA foreign_keys = ON;');
        init_db($pdo);
    }
    return $pdo;
}

/**
 * 建表并写入种子数据（幂等，可重复调用）
 */
function init_db(PDO $pdo): void
{
    $pdo->exec("CREATE TABLE IF NOT EXISTS users (
        id            INTEGER PRIMARY KEY AUTOINCREMENT,
        username      TEXT NOT NULL UNIQUE,
        password_hash TEXT NOT NULL,
        created_at    TEXT NOT NULL DEFAULT (datetime('now','localtime'))
    )");

    $pdo->exec("CREATE TABLE IF NOT EXISTS groups (
        id   INTEGER PRIMARY KEY AUTOINCREMENT,
        name TEXT NOT NULL,
        sort INTEGER NOT NULL DEFAULT 0,
        icon TEXT NOT NULL DEFAULT ''
    )");

    $pdo->exec("CREATE TABLE IF NOT EXISTS links (
        id          INTEGER PRIMARY KEY AUTOINCREMENT,
        group_id    INTEGER NOT NULL,
        name        TEXT NOT NULL,
        url         TEXT NOT NULL,
        url_lan     TEXT NOT NULL DEFAULT '',
        url_ipv6    TEXT NOT NULL DEFAULT '',
        description TEXT NOT NULL DEFAULT '',
        icon        TEXT NOT NULL DEFAULT '',
        sort        INTEGER NOT NULL DEFAULT 0,
        FOREIGN KEY (group_id) REFERENCES groups(id) ON DELETE CASCADE
    )");

    // ---- 迁移：老版本数据库补充新列 ----
    $gcols = array_column($pdo->query('PRAGMA table_info(groups)')->fetchAll(), 'name');
    if (!in_array('icon', $gcols, true)) {
        $pdo->exec("ALTER TABLE groups ADD COLUMN icon TEXT NOT NULL DEFAULT ''");
    }

    $cols = array_column($pdo->query('PRAGMA table_info(links)')->fetchAll(), 'name');
    foreach (['url_lan', 'url_ipv6', 'color'] as $c) {
        if (!in_array($c, $cols, true)) {
            $pdo->exec("ALTER TABLE links ADD COLUMN $c TEXT NOT NULL DEFAULT ''");
        }
    }

    $pdo->exec("CREATE TABLE IF NOT EXISTS settings (
        key   TEXT PRIMARY KEY,
        value TEXT NOT NULL DEFAULT ''
    )");

    // ---- 种子：初始管理员 ----
    $cnt = (int) $pdo->query('SELECT COUNT(*) FROM users')->fetchColumn();
    if ($cnt === 0) {
        $pdo->prepare('INSERT INTO users (username, password_hash) VALUES (?, ?)')
            ->execute([DEFAULT_ADMIN_USER, password_hash(DEFAULT_ADMIN_PASS, PASSWORD_DEFAULT)]);
    }

    // ---- 种子：默认设置 ----
    $defaults = [
        'site_title'    => DEFAULT_SITE_TITLE,
        'site_subtitle' => DEFAULT_SITE_SUBTITLE,
        'icp1'          => DEFAULT_ICP1,
        'icp2'          => DEFAULT_ICP2,
        'icp1_url'      => DEFAULT_ICP1_URL,
        'icp2_url'      => DEFAULT_ICP2_URL,
        'open_new_tab'  => DEFAULT_OPEN_NEW_TAB,
        'show_sidebar'  => DEFAULT_SHOW_SIDEBAR,
        'site_icon'     => DEFAULT_SITE_ICON,
        'site_logo'     => DEFAULT_SITE_LOGO,
        'show_group_icon'  => DEFAULT_SHOW_GROUP_ICON,
        'show_group_name'  => DEFAULT_SHOW_GROUP_NAME,
        'show_group_count' => DEFAULT_SHOW_GROUP_COUNT,
        'bg_style'      => DEFAULT_BG_STYLE,
        'bg_color'      => DEFAULT_BG_COLOR,
        'bg_image'      => DEFAULT_BG_IMAGE,
        'bg_mode'       => DEFAULT_BG_MODE,
        'page_margin'   => DEFAULT_PAGE_MARGIN,
        'search_pad'    => DEFAULT_SEARCH_PAD,
        'show_searchbar' => DEFAULT_SHOW_SEARCHBAR,
        'search_local'  => DEFAULT_SEARCH_LOCAL,
        'search_web'    => DEFAULT_SEARCH_WEB,
        'search_hint'   => DEFAULT_SEARCH_HINT,
        'search_reset'  => DEFAULT_SEARCH_RESET,
        // 搜索引擎列表（JSON 数组）。默认空 = 未配置：前端首次加载时
        // 从旧版 localStorage 一次性迁移或使用内置默认，避免覆盖老用户自定义
        'engines'       => '[]',
    ];
    $stmt = $pdo->prepare('INSERT OR IGNORE INTO settings (key, value) VALUES (?, ?)');
    foreach ($defaults as $k => $v) {
        $stmt->execute([$k, $v]);
    }

    // ---- 种子：示例分组与链接（仅首次） ----
    $gc = (int) $pdo->query('SELECT COUNT(*) FROM groups')->fetchColumn();
    if ($gc === 0) {
        $pdo->beginTransaction();
        try {
            $g = $pdo->prepare('INSERT INTO groups (name, sort) VALUES (?, ?)');
            $g->execute(['常用', 0]);
            $gid1 = (int) $pdo->lastInsertId();
            $g->execute(['工具', 1]);
            $gid2 = (int) $pdo->lastInsertId();
            $g->execute(['服务器', 2]);
            $gid3 = (int) $pdo->lastInsertId();

            $l = $pdo->prepare('INSERT INTO links (group_id, name, url, url_lan, url_ipv6, description, icon, sort) VALUES (?,?,?,?,?,?,?,?)');
            $seed = [
                [$gid1, '路由器管理', 'http://192.168.1.1', 'http://192.168.1.1', '', '网关后台', '🛜', 0],
                [$gid1, '网络存储 NAS', 'http://192.168.1.2:5000', 'http://192.168.1.2:5000', 'http://[fd00::1]:5000', '文件备份', '📦', 1],
                [$gid1, '打印机后台', 'http://192.168.1.3:631', 'http://192.168.1.3:631', '', '打印服务', '🖨️', 2],
                [$gid2, '系统管理后台', 'http://192.168.1.100', 'http://192.168.1.100', 'http://[fd00::2]', '运维控制台', '⚙️', 0],
                [$gid2, '文件共享', 'http://192.168.1.101', 'http://192.168.1.101', '', '内部网盘', '📁', 1],
                [$gid2, '监控平台', 'http://192.168.1.102', 'http://192.168.1.102', '', '摄像头监控', '📷', 2],
                [$gid3, 'SSH 终端', 'http://192.168.1.200:7681', 'http://192.168.1.200:7681', '', 'Web SSH', '🖥️', 0],
                [$gid3, '数据库管理', 'http://192.168.1.201', 'http://192.168.1.201', 'http://[fd00::3]:3306', 'SQL 控制台', '🗄️', 1],
            ];
            foreach ($seed as $row) {
                $l->execute($row);
            }
            $pdo->commit();
        } catch (Throwable $e) {
            $pdo->rollBack();
            throw $e;
        }
    }
}

/**
 * 读取站点设置（带缓存），key 不存在时返回默认值
 */
function setting(string $key, string $default = ''): string
{
    static $cache = null;
    if ($cache === null) {
        $cache = [];
        foreach (db()->query('SELECT key, value FROM settings') as $row) {
            $cache[$row['key']] = $row['value'];
        }
    }
    return array_key_exists($key, $cache) ? (string) $cache[$key] : $default;
}

/**
 * 更新站点设置（存在则更新，不存在则插入）
 */
function save_setting(string $key, string $value): void
{
    $pdo = db();
    $pdo->prepare('INSERT INTO settings (key, value) VALUES (?, ?)
                   ON CONFLICT(key) DO UPDATE SET value = excluded.value')
        ->execute([$key, $value]);
}

/**
 * HTML 转义输出
 */
function e(?string $s): string
{
    return htmlspecialchars((string) $s, ENT_QUOTES, 'UTF-8');
}

/**
 * 网站 LOGO 渲染（登录页图标 + 主页左上角图标）。
 * 支持：图片 URL（http(s) / /uploads/ / data:image）、iconify:名称、emoji / 文本。
 * 返回空字符串表示应使用内置默认 SVG（调用方渲染）。
 */
function logo_markup(string $val, int $size = 34): string
{
    $val = trim($val);
    if ($val === '') return '';
    $style = 'width:' . $size . 'px;height:' . $size . 'px;object-fit:contain';
    if (preg_match('#^(https?://|/uploads/|data:image/)#i', $val)) {
        return '<img class="site-logo-img" src="' . e($val) . '" alt="logo" style="' . $style . '">';
    }
    if (preg_match('#^iconify:(.+)$#i', $val, $m)) {
        $name = trim($m[1]);
        return '<img class="site-logo-img" src="https://api.iconify.design/' . e($name) . '.svg" alt="logo" style="' . $style . '">';
    }
    // emoji / 文本：行高撑起容器高度
    return '<span class="site-logo-emoji" style="font-size:' . (int) round($size * 0.62) . 'px;line-height:' . $size . 'px">' . e($val) . '</span>';
}

/**
 * body 背景样式类（default / color / image）
 */
function body_bg_class(): string
{
    $style = setting('bg_style', DEFAULT_BG_STYLE);
    return in_array($style, ['default', 'color', 'image'], true) ? 'bg-' . $style : 'bg-default';
}

/**
 * body 行内样式：自定义背景色、背景图片、页面边距（CSS 变量）
 */
function body_bg_style(): string
{
    $parts = [];
    $color = trim(setting('bg_color', DEFAULT_BG_COLOR));
    if ($color !== '') {
        $parts[] = '--bg-custom:' . e($color);
    }
    $img = trim(setting('bg_image', DEFAULT_BG_IMAGE));
    if ($img !== '') {
        // CSS 变量中的相对 url() 会按使用它的样式表（assets/style.css）解析，
        // 必须把相对路径补成根绝对路径（/uploads/...），否则背景图 404 不显示
        if (!preg_match('#^(https?:)?//#i', $img) && strpos($img, '/') !== 0) {
            $img = '/' . $img;
        }
        // url() 内引号必须用 &quot; 实体（style 属性本身用双引号包裹，字面 " 会导致属性提前闭合）
        $parts[] = '--bg-image:url(&quot;' . e($img) . '&quot;)';
    }
    // 背景图片显示模式：stretch 拉伸 / tile 平铺 / fit 适应（其余回退 cover）
    $mode = setting('bg_mode', DEFAULT_BG_MODE);
    $sizeMap = ['stretch' => '100% 100%', 'tile' => 'auto', 'fit' => 'contain'];
    $size = $sizeMap[$mode] ?? 'cover';
    $repeat = $mode === 'tile' ? 'repeat' : 'no-repeat';
    $parts[] = '--bg-size:' . $size;
    $parts[] = '--bg-repeat:' . $repeat;
    $margin = max(0, min(80, (int) setting('page_margin', DEFAULT_PAGE_MARGIN)));
    $parts[] = '--page-margin:' . $margin . 'px';
    $spad = max(0, min(80, (int) setting('search_pad', DEFAULT_SEARCH_PAD)));
    $parts[] = '--search-pad:' . $spad . 'px';
    return implode('; ', $parts);
}

/**
 * 侧栏导航首帧对齐偏移（px）。
 * 目标：侧栏标题(.side-title 即 .side-inner 顶部)与右侧第一个分组名称(.group-head)顶部对齐。
 * 页面为独立滚动容器模型：body 不滚动，卡片在 .main-scroll 内滚动；.search-bar 固定在卡片容器上方。
 * 侧栏 .side-inner 不再 sticky，首帧即按文档流定位，此偏移为首帧近似值（搜索栏高≈48）。
 * JS 在布局稳定（load/fonts.ready/resize）后再用 getBoundingClientRect 精确校正。
 */
function side_nav_offset(): int
{
    $spad  = max(0, min(80, (int) setting('search_pad', DEFAULT_SEARCH_PAD)));
    $showSearchbar = setting('show_searchbar', DEFAULT_SHOW_SEARCHBAR) === '1';
    // 显示搜索栏：.search-bar 位于 .main 顶部，margin 上/下各一个 search-pad。
    //   groupHeadTop  = header + page-margin + 2*search-pad + searchBarH   （main-scroll 顶部即搜索栏底，首分组无上方 gap）
    //   sideInnerTop  = header + page-margin                              （.side 与 .main 同在 .layout 内，顶部对齐）
    //   偏移 = 2*search-pad + searchBarH                                  （page-margin 相互抵消）
    if ($showSearchbar) {
        return 2 * $spad + 48;
    }
    // 搜索栏隐藏：.search-bar display:none 不占位；body.searchbar-hidden 将 .layout padding-top 覆写为 20px，
    // .side 与 .main-scroll 顶部均从 header + 20 起，第一个分组标题紧贴容器顶部，故偏移为 0。
    return 0;
}
