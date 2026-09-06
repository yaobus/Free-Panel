<?php
/**
 * Free-Panel 局域网导航 - 配置文件
 * 这些是初始值/兜底值，安装后可在后台「设置」中修改（修改后以数据库 settings 表为准）。
 */

// 站点名称与副标题（拆开两行布局：site_title=主标题，site_subtitle=副标题；可各自独立维护）
define('DEFAULT_SITE_TITLE',    'Free-Panel');
define('DEFAULT_SITE_SUBTITLE', '更加自由的导航页');

// 应用版本（设置 → 关于 中展示）
define('APP_VERSION', '1.5.0');

// 底部备案信息（两条，可为空字符串表示不显示；默认不预置任何备案，需要时在「设置 → 备案信息」中填写）
define('DEFAULT_ICP1', '');
define('DEFAULT_ICP2', '');

// 备案信息点击跳转链接（可为空表示不跳转）
// 保持先前默认值不变：仅当用户手动修改备案信息时，新地址才会覆盖默认值
// 备案 2 链接支持占位符 {q}：自动替换为备案 2 中的联网备案号（连续数字串）
define('DEFAULT_ICP1_URL', 'https://beian.miit.gov.cn');
define('DEFAULT_ICP2_URL', 'https://beian.mps.gov.cn/#/query/webSearch?code={q}');

// 链接默认打开方式：1 新窗口 / 0 当前窗口
define('DEFAULT_OPEN_NEW_TAB', '1');

// 左侧分组导航：1 显示 / 0 隐藏
define('DEFAULT_SHOW_SIDEBAR', '1');

// 站点图标（favicon）：空 = 使用内置默认 logo；支持 emoji / 图片URL / iconify:名称
define('DEFAULT_SITE_ICON', '');

// 网站 LOGO（登录页图标 + 主页左上角图标）：空 = 使用内置默认 logo；
// 支持本地上传 JPG/PNG/SVG（存 uploads/ 返回路径）或填写图片 URL / iconify:名称 / emoji
define('DEFAULT_SITE_LOGO', '');

// 分组显示开关：1 显示 / 0 隐藏
define('DEFAULT_SHOW_GROUP_ICON', '1');   // 显示分组图标
define('DEFAULT_SHOW_GROUP_NAME', '1');   // 显示分组名称
define('DEFAULT_SHOW_GROUP_COUNT', '1');  // 显示分组标签数量

// 背景样式：default（默认渐变）/ color（自定义纯色）/ image（自定义图片）
define('DEFAULT_BG_STYLE', 'default');
define('DEFAULT_BG_COLOR', '#f3f5f9');
define('DEFAULT_BG_IMAGE', '');
// 背景图片显示模式：fit（适应）/ stretch（拉伸）/ tile（平铺）
define('DEFAULT_BG_MODE', 'fit');

// 页面内容边距（px）
define('DEFAULT_PAGE_MARGIN', '26');

// 搜索框上下空白高度（px）
define('DEFAULT_SEARCH_PAD', '0');

// 搜索栏设置：1 开启 / 0 关闭
define('DEFAULT_SHOW_SEARCHBAR', '1');  // 显示搜索栏
define('DEFAULT_SEARCH_LOCAL',   '1');  // 本地搜索（输入实时过滤收藏夹）
define('DEFAULT_SEARCH_WEB',     '1');  // 互联网搜索（回车调用当前搜索引擎）
define('DEFAULT_SEARCH_HINT',    '1');  // 显示搜索栏中的提示文本
define('DEFAULT_SEARCH_RESET',   '1');  // 自动复位搜索框（联网搜索后清空关键词，避免回主页卡片全被过滤）

// 默认搜索引擎列表（settings.engines 键的前端兜底参考；DB 默认值为 '[]' 空数组，
// 首次加载时由前端从旧版 localStorage 迁移或使用内置默认，保证老用户自定义不丢失）
define('DEFAULT_ENGINES', json_encode([
    ['name' => 'Google', 'url' => 'https://www.google.com/search?q={q}', 'icon' => '🔍'],
    ['name' => 'Bing',   'url' => 'https://www.bing.com/search?q={q}',   'icon' => '🅱'],
    ['name' => '百度',    'url' => 'https://www.baidu.com/s?wd={q}',      'icon' => '度'],
    ['name' => 'GitHub', 'url' => 'https://github.com/search?q={q}',    'icon' => '🐙'],
    ['name' => '知乎',    'url' => 'https://www.zhihu.com/search?type=content&q={q}', 'icon' => '知'],
], JSON_UNESCAPED_UNICODE));

// SQLite 数据库文件路径
define('DB_PATH', __DIR__ . '/data/nav.db');

// 初始管理员账号（仅首次初始化数据库时写入，安装后请立即登录修改密码）
define('DEFAULT_ADMIN_USER', 'admin');
define('DEFAULT_ADMIN_PASS', 'admin123');

// 登录状态保持时长（秒）：默认 30 天
// 同时作用于「浏览器 Cookie 有效期」与「服务端 Session 数据存活期」，两者必须一起设置：
//   - 只设 Cookie：服务端 session 先被 GC 回收，Cookie 还在但仍会掉线
//   - 只设 Session：Cookie 是浏览器会话级，关闭浏览器即失效
// 用户每次访问页面会自动续期（滑动过期），常用用户不会因固定期限而掉线。
define('SESSION_LIFETIME', 30 * 86400);
