<?php
/**
 * Free-Panel 管理接口（JSON，全部需要登录 + CSRF）
 */
require_once __DIR__ . '/auth.php';

header('Content-Type: application/json; charset=utf-8');

function fail(string $msg): void
{
    echo json_encode(['ok' => false, 'error' => $msg], JSON_UNESCAPED_UNICODE);
    exit;
}

function ok(array $extra = []): void
{
    echo json_encode(array_merge(['ok' => true], $extra), JSON_UNESCAPED_UNICODE);
    exit;
}

/**
 * 卡片背景颜色清洗：仅允许 空 / transparent / #rrggbb
 */
function sanitize_color($v): string
{
    $v = trim((string) $v);
    if ($v === '' || $v === 'transparent') return $v;
    return preg_match('/^#[0-9a-fA-F]{6}$/', $v) ? strtolower($v) : '';
}

/* ---------- 鉴权 ---------- */
if (!is_logged_in()) {
    fail('未登录或会话已过期');
}

$raw  = file_get_contents('php://input');
$body = json_decode($raw ?: '[]', true);
if (!is_array($body)) {
    fail('请求格式错误');
}

// multipart/form-data 请求（如文件上传）：php://input 为空，改用 PHP 已解析的 $_POST
if (!empty($_POST)) {
    $body = array_merge($body ?: [], $_POST);
}

$action = $body['action'] ?? '';
if (!verify_csrf($body['csrf'] ?? null)) {
    fail('页面会话已过期，请刷新页面后重试');
}

$pdo = db();

switch ($action) {

    /* ================ 分组 ================ */
    case 'add_group': {
        $name = trim((string) ($body['name'] ?? ''));
        if ($name === '' || mb_strlen($name) > 30) fail('分组名称不能为空且不超过 30 字');
        $icon = mb_substr(strip_tags(trim((string) ($body['icon'] ?? ''))), 0, 8192);
        $max = (int) $pdo->query('SELECT COALESCE(MAX(sort),0) FROM groups')->fetchColumn();
        $pdo->prepare('INSERT INTO groups (name, sort, icon) VALUES (?, ?, ?)')->execute([$name, $max + 1, $icon]);
        ok(['id' => (int) $pdo->lastInsertId()]);
    }

    case 'update_group': {
        $id   = (int) ($body['id'] ?? 0);
        $name = trim((string) ($body['name'] ?? ''));
        if ($id <= 0) fail('参数错误');
        if ($name === '' || mb_strlen($name) > 30) fail('分组名称不能为空且不超过 30 字');
        $icon = mb_substr(strip_tags(trim((string) ($body['icon'] ?? ''))), 0, 8192);
        $pdo->prepare('UPDATE groups SET name = ?, icon = ? WHERE id = ?')->execute([$name, $icon, $id]);
        ok();
    }

    case 'delete_group': {
        $id = (int) ($body['id'] ?? 0);
        if ($id <= 0) fail('参数错误');
        $pdo->prepare('DELETE FROM groups WHERE id = ?')->execute([$id]); // 级联删除组内链接
        ok();
    }

    /* ================ 链接 ================ */
    case 'add_link': {
        $name = trim((string) ($body['name'] ?? ''));
        $url  = trim((string) ($body['url'] ?? ''));
        $gid  = (int) ($body['group_id'] ?? 0);
        if ($name === '' || $url === '') fail('名称和默认地址为必填项');
        if ($gid <= 0 || !$pdo->query("SELECT 1 FROM groups WHERE id=$gid")->fetchColumn()) fail('分组不存在');
        $max = (int) $pdo->query("SELECT COALESCE(MAX(sort),0) FROM links WHERE group_id=$gid")->fetchColumn();
        $color = sanitize_color($body['color'] ?? '');
        $pdo->prepare('INSERT INTO links (group_id, name, url, url_lan, url_ipv6, description, icon, color, sort)
                       VALUES (?,?,?,?,?,?,?,?,?)')->execute([
            $gid, $name, $url,
            trim((string) ($body['url_lan'] ?? '')),
            trim((string) ($body['url_ipv6'] ?? '')),
            trim((string) ($body['description'] ?? '')),
            trim((string) ($body['icon'] ?? '')),
            $color,
            $max + 1,
        ]);
        ok(['id' => (int) $pdo->lastInsertId()]);
    }

    case 'update_link': {
        $id   = (int) ($body['id'] ?? 0);
        $name = trim((string) ($body['name'] ?? ''));
        $url  = trim((string) ($body['url'] ?? ''));
        $gid  = (int) ($body['group_id'] ?? 0);
        if ($id <= 0) fail('参数错误');
        if ($name === '' || $url === '') fail('名称和默认地址为必填项');
        if ($gid > 0 && !$pdo->query("SELECT 1 FROM groups WHERE id=$gid")->fetchColumn()) fail('分组不存在');
        $color = sanitize_color($body['color'] ?? '');
        $pdo->prepare('UPDATE links SET group_id=?, name=?, url=?, url_lan=?, url_ipv6=?, description=?, icon=?, color=? WHERE id=?')
            ->execute([
                $gid > 0 ? $gid : null,
                $name, $url,
                trim((string) ($body['url_lan'] ?? '')),
                trim((string) ($body['url_ipv6'] ?? '')),
                trim((string) ($body['description'] ?? '')),
                trim((string) ($body['icon'] ?? '')),
                $color,
                $id,
            ]);
        ok();
    }

    case 'delete_link': {
        $id = (int) ($body['id'] ?? 0);
        if ($id <= 0) fail('参数错误');
        $pdo->prepare('DELETE FROM links WHERE id = ?')->execute([$id]);
        ok();
    }

    /* ================ 排序（箭头按钮 + 拖拽） ================ */
    case 'move': {
        $type = ($body['type'] ?? '') === 'link' ? 'link' : 'group';
        $id   = (int) ($body['id'] ?? 0);
        $dir  = ($body['dir'] ?? '') === 'up' ? 'up' : 'down';
        if ($id <= 0) fail('参数错误');

        if ($type === 'group') {
            $cur = $pdo->prepare('SELECT * FROM groups WHERE id = ?');
            $cur->execute([$id]);
            $row = $cur->fetch();
            if (!$row) fail('分组不存在');
            $neighbor = $pdo->prepare(
                $dir === 'up'
                    ? 'SELECT * FROM groups WHERE sort < ? ORDER BY sort DESC, id DESC LIMIT 1'
                    : 'SELECT * FROM groups WHERE sort > ? ORDER BY sort ASC, id ASC LIMIT 1'
            );
            $neighbor->execute([$row['sort']]);
        } else {
            $cur = $pdo->prepare('SELECT * FROM links WHERE id = ?');
            $cur->execute([$id]);
            $row = $cur->fetch();
            if (!$row) fail('链接不存在');
            $neighbor = $pdo->prepare(
                $dir === 'up'
                    ? 'SELECT * FROM links WHERE group_id = ? AND sort < ? ORDER BY sort DESC, id DESC LIMIT 1'
                    : 'SELECT * FROM links WHERE group_id = ? AND sort > ? ORDER BY sort ASC, id ASC LIMIT 1'
            );
            $neighbor->execute([$row['group_id'], $row['sort']]);
        }

        $nxt = $neighbor->fetch();
        if (!$nxt) ok(); // 已在边界
        $pdo->prepare('UPDATE ' . $type . 's SET sort = ? WHERE id = ?')->execute([$nxt['sort'], $row['id']]);
        $pdo->prepare('UPDATE ' . $type . 's SET sort = ? WHERE id = ?')->execute([$row['sort'], $nxt['id']]);
        ok();
    }

    /* 拖拽排序：一次提交受影响分组的新顺序 */
    case 'reorder_links': {
        $updates = $body['updates'] ?? null;
        if (!is_array($updates) || count($updates) === 0) fail('参数错误');
        $pdo->beginTransaction();
        try {
            $upd = $pdo->prepare('UPDATE links SET group_id = ?, sort = ? WHERE id = ?');
            foreach ($updates as $u) {
                $gid = (int) ($u['group_id'] ?? 0);
                if ($gid <= 0 || !is_array($u['ids'] ?? null)) { throw new RuntimeException('bad data'); }
                foreach (array_values($u['ids']) as $i => $lid) {
                    $upd->execute([$gid, (int) $i, (int) $lid]);
                }
            }
            $pdo->commit();
            ok();
        } catch (Throwable $e) {
            $pdo->rollBack();
            fail('排序保存失败');
        }
    }

    /* 分组拖拽排序：一次提交新顺序 */
    case 'reorder_groups': {
        $ids = $body['ids'] ?? null;
        if (!is_array($ids) || count($ids) === 0) fail('参数错误');
        $pdo->beginTransaction();
        try {
            $upd = $pdo->prepare('UPDATE groups SET sort = ? WHERE id = ?');
            foreach (array_values($ids) as $i => $gid) {
                $upd->execute([(int) $i, (int) $gid]);
            }
            $pdo->commit();
            ok();
        } catch (Throwable $e) {
            $pdo->rollBack();
            fail('分组排序保存失败');
        }
    }

    /* ================ 站点设置 ================ */
    case 'get_settings': {
        $keys = ['site_title', 'site_subtitle', 'icp1', 'icp2', 'icp1_url', 'icp2_url', 'open_new_tab', 'show_sidebar',
                 'site_icon', 'site_logo', 'show_group_icon', 'show_group_name', 'show_group_count',
                 'bg_style', 'bg_color', 'bg_image', 'bg_mode', 'page_margin', 'search_pad',
                 'show_searchbar', 'search_local', 'search_web', 'search_reset', 'search_hint', 'engines'];
        $settings = [];
        foreach ($keys as $k) {
            $settings[$k] = setting($k, constant('DEFAULT_' . strtoupper($k)));
        }
        // 当前登录用户名（设置弹窗「账号设置」预填用）
        $stmt = $pdo->prepare('SELECT username FROM users WHERE id = ?');
        $stmt->execute([(int) $_SESSION['uid']]);
        $settings['username'] = (string) $stmt->fetchColumn();
        // 应用版本（设置弹窗「关于」分区展示）
        $settings['version'] = APP_VERSION;
        ok(['settings' => $settings]);
    }

    case 'save_settings': {
        $map = [
            'site_title'    => fn($v) => mb_substr(trim((string) $v), 0, 40),
            'site_subtitle' => fn($v) => mb_substr(trim((string) $v), 0, 80),
            'icp1'          => fn($v) => mb_substr(trim((string) $v), 0, 60),
            'icp2'          => fn($v) => mb_substr(trim((string) $v), 0, 60),
            'icp1_url'      => fn($v) => mb_substr(strip_tags(trim((string) $v)), 0, 200),
            'icp2_url'      => fn($v) => mb_substr(strip_tags(trim((string) $v)), 0, 300),
            'open_new_tab'  => fn($v) => $v == '1' || $v === true ? '1' : '0',
            'show_sidebar'  => fn($v) => $v == '1' || $v === true ? '1' : '0',
            'site_icon'     => fn($v) => mb_substr(strip_tags(trim((string) $v)), 0, 8192),
            'site_logo'     => fn($v) => mb_substr(strip_tags(trim((string) $v)), 0, 8192),
            'show_group_icon'  => fn($v) => $v == '1' || $v === true ? '1' : '0',
            'show_group_name'  => fn($v) => $v == '1' || $v === true ? '1' : '0',
            'show_group_count' => fn($v) => $v == '1' || $v === true ? '1' : '0',
            'bg_style'      => fn($v) => in_array((string) $v, ['default', 'color', 'image'], true) ? (string) $v : 'default',
            'bg_color'      => fn($v) => preg_match('/^#[0-9a-fA-F]{6}$/', (string) $v) ? strtolower((string) $v) : DEFAULT_BG_COLOR,
            'bg_image'      => fn($v) => trim((string) $v) === '' ? '' : mb_substr(strip_tags(trim((string) $v)), 0, 500),
            'bg_mode'       => fn($v) => in_array((string) $v, ['stretch', 'tile', 'fit'], true) ? (string) $v : DEFAULT_BG_MODE,
            'page_margin'   => fn($v) => (string) max(0, min(80, (int) $v)),
            'search_pad'    => fn($v) => (string) max(0, min(80, (int) $v)),
            'show_searchbar' => fn($v) => $v == '1' || $v === true ? '1' : '0',
            'search_local'  => fn($v) => $v == '1' || $v === true ? '1' : '0',
            'search_web'    => fn($v) => $v == '1' || $v === true ? '1' : '0',
            'search_reset'  => fn($v) => $v == '1' || $v === true ? '1' : '0',
            'search_hint'   => fn($v) => $v == '1' || $v === true ? '1' : '0',
            // 搜索引擎列表：JSON 数组，逐项清洗（name/url 必填、去标签、限长），非法 JSON 回落空数组
            'engines'       => function ($v) {
                $arr = json_decode((string) $v, true);
                if (!is_array($arr)) return '[]';
                $out = [];
                foreach (array_slice($arr, 0, 50) as $item) {
                    if (!is_array($item)) continue;
                    $name = mb_substr(strip_tags(trim((string) ($item['name'] ?? ''))), 0, 40);
                    $url  = mb_substr(strip_tags(trim((string) ($item['url'] ?? ''))), 0, 500);
                    $icon = mb_substr(strip_tags(trim((string) ($item['icon'] ?? ''))), 0, 8192);
                    if ($name === '' || $url === '') continue;
                    $out[] = ['name' => $name, 'url' => $url, 'icon' => $icon];
                }
                return json_encode($out, JSON_UNESCAPED_UNICODE);
            },
        ];
        foreach ($map as $key => $san) {
            if (array_key_exists($key, $body)) {
                save_setting($key, $san($body[$key]));
            }
        }
        ok();
    }

    /* ================ 背景图片本地上传（multipart/form-data，非 JSON body） ================ */
    case 'upload_bg_image': {
        if (empty($_FILES['file']) || ($_FILES['file']['error'] ?? UPLOAD_ERR_NO_FILE) !== UPLOAD_ERR_OK) {
            fail('未收到文件或上传失败');
        }
        $f = $_FILES['file'];
        $tmp = $f['tmp_name'];
        if ($f['size'] > 5 * 1024 * 1024) fail('图片不能超过 5MB');
        $info = @getimagesize($tmp);
        if ($info === false) fail('仅支持图片文件');
        $mime = $info['mime'];
        $extMap = ['image/jpeg' => 'jpg', 'image/png' => 'png', 'image/gif' => 'gif', 'image/webp' => 'webp'];
        if (!isset($extMap[$mime])) fail('仅支持 JPG / PNG / GIF / WebP 图片');
        $dir = __DIR__ . '/uploads';
        if (!is_dir($dir)) {
            @mkdir($dir, 0775, true);
        }
        if (!is_writable($dir)) fail('上传目录不可写，请检查 uploads/ 权限');
        $name = 'bg_' . date('Ymd_His') . '_' . bin2hex(random_bytes(4)) . '.' . $extMap[$mime];
        $dest = $dir . '/' . $name;
        if (!@move_uploaded_file($tmp, $dest)) fail('保存文件失败');
        // 返回根绝对路径（/uploads/...）：CSS 变量里的相对 url 会相对 assets/style.css 解析，必须绝对
        ok(['url' => '/uploads/' . $name]);
    }

    /* ================ 网站 LOGO 本地上传（multipart/form-data） ================ */
    case 'upload_logo': {
        if (empty($_FILES['file'])) fail('未收到文件或上传失败');
        $err = $_FILES['file']['error'] ?? UPLOAD_ERR_NO_FILE;
        if ($err === UPLOAD_ERR_INI_SIZE || $err === UPLOAD_ERR_FORM_SIZE) fail('图片不能超过 2MB');
        if ($err !== UPLOAD_ERR_OK) fail('上传失败，请重试');
        $f = $_FILES['file'];
        $tmp = $f['tmp_name'];
        if ($f['size'] > 2 * 1024 * 1024) fail('图片不能超过 2MB');

        $name = basename((string) $f['name']);
        $ext  = strtolower(pathinfo($name, PATHINFO_EXTENSION));
        if (!in_array($ext, ['jpg', 'jpeg', 'png', 'svg'], true)) fail('仅支持 JPG / PNG / SVG 图片');

        if ($ext === 'svg') {
            // SVG 无法用 getimagesize 校验，做内容安全检查：必须为纯 SVG（拒绝脚本/事件属性/外链对象）
            $content = (string) @file_get_contents($tmp);
            if (trim($content) === '' || !preg_match('/<\s*svg[\s>]/i', $content)) fail('SVG 文件内容无效');
            if (preg_match('/<script[\s>]/i', $content)
                || preg_match('/on\w+\s*=/i', $content)
                || preg_match('/<(foreignObject|iframe|embed|object|image|a)\b/i', $content)
                || stripos($content, 'javascript:') !== false) {
                fail('SVG 文件包含不允许的内容（脚本 / 事件 / 外链对象）');
            }
            $extOut = 'svg';
        } else {
            $info = @getimagesize($tmp);
            if ($info === false) fail('仅支持图片文件');
            $mimeMap = ['image/jpeg' => 'jpg', 'image/png' => 'png'];
            if (!isset($mimeMap[$info['mime']])) fail('仅支持 JPG / PNG / SVG 图片');
            $extOut = $mimeMap[$info['mime']];
        }

        $dir = __DIR__ . '/uploads';
        if (!is_dir($dir)) {
            @mkdir($dir, 0775, true);
        }
        if (!is_writable($dir)) fail('上传目录不可写，请检查 uploads/ 权限');
        $outName = 'logo_' . date('Ymd_His') . '_' . bin2hex(random_bytes(4)) . '.' . $extOut;
        $dest = $dir . '/' . $outName;
        if (!@move_uploaded_file($tmp, $dest)) fail('保存文件失败');
        ok(['url' => '/uploads/' . $outName]);
    }

    /* ================ 已上传背景图库 ================ */
    case 'list_bg_images': {
        $dir = __DIR__ . '/uploads';
        $list = [];
        if (is_dir($dir)) {
            $okExt = ['jpg', 'jpeg', 'png', 'gif', 'webp'];
            foreach (scandir($dir) as $f) {
                if ($f === '.' || $f === '..') continue;
                $ext = strtolower(pathinfo($f, PATHINFO_EXTENSION));
                if (in_array($ext, $okExt, true)) {
                    $list[] = '/uploads/' . $f;
                }
            }
        }
        sort($list);
        ok(['images' => $list]);
    }

    /* ================ 修改用户名 ================ */
    case 'change_username': {
        $newName  = trim((string) ($body['new_username'] ?? ''));
        $password = (string) ($body['password'] ?? '');
        $len = mb_strlen($newName);
        if ($newName === '' || $len > 30) fail('用户名不能为空且不超过 30 字');
        if (!preg_match('/^[A-Za-z0-9_\-\p{Han}]+$/u', $newName)) {
            fail('用户名仅支持字母、数字、下划线、中划线和中文');
        }
        $stmt = $pdo->prepare('SELECT id, password_hash FROM users WHERE id = ?');
        $stmt->execute([(int) $_SESSION['uid']]);
        $row = $stmt->fetch();
        if (!$row || !password_verify($password, $row['password_hash'])) fail('当前密码不正确');
        $dup = $pdo->prepare('SELECT 1 FROM users WHERE username = ? AND id != ?');
        $dup->execute([$newName, (int) $_SESSION['uid']]);
        if ($dup->fetchColumn()) fail('该用户名已被使用');
        $pdo->prepare('UPDATE users SET username = ? WHERE id = ?')->execute([$newName, (int) $_SESSION['uid']]);
        $_SESSION['uname'] = $newName; // 同步会话中的用户名
        ok(['username' => $newName]);
    }

    /* ================ 修改密码 ================ */
    case 'change_password': {
        $old = (string) ($body['old_password'] ?? '');
        $new = (string) ($body['new_password'] ?? '');
        if (strlen($new) < 6) fail('新密码至少 6 位');
        $stmt = $pdo->prepare('SELECT password_hash FROM users WHERE id = ?');
        $stmt->execute([(int) $_SESSION['uid']]);
        $row = $stmt->fetch();
        if (!$row || !password_verify($old, $row['password_hash'])) fail('当前密码不正确');
        $pdo->prepare('UPDATE users SET password_hash = ? WHERE id = ?')
            ->execute([password_hash($new, PASSWORD_DEFAULT), (int) $_SESSION['uid']]);
        ok();
    }

    default:
        fail('未知操作: ' . $action);
}
