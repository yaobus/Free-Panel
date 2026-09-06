/* ============================================================
   Free-Panel 顶栏按钮窄屏折叠集成测试
   需求：屏幕显示空间不足时折叠顶部右侧按钮（主题切换 / 设置 / 退出登录），
        堆叠为「更多」下拉面板，样式美观、操作方便。
   Part A 静态断言（读源文件）：
     - index.php .top-actions 内含 #moreBtn（更多按钮）与 #moreMenu（折叠面板）
     - 面板含 主题/设置/退出 三个条目（data-more-action），带图标；退出条目危险样式
     - style.css 面板样式（absolute + 卡片背景）、.top-actions 定位锚点、
       基础隐藏 #moreBtn、max-width:720px 断点内隐藏原三按钮并显示更多按钮
     - app.js 提取 toggleTheme/openSettings/doLogout 供面板条目复用，
       面板 toggle / 点击外部关闭 / Esc 关闭 / 条目分发；顶部三按钮绑定保留且带存在性保护
   Part B happy-dom（加载真实 app.js）：
     - 初始面板隐藏；点击 moreBtn 打开/再点关闭
     - 打开后点击面板外关闭；Esc 关闭
     - 点击「切换主题」条目 → 面板关闭 + html 主题切换
     - 点击「站点设置」条目 → 面板关闭 + get_settings + 设置弹窗打开
     - 点击「退出登录」条目 → 面板关闭 + 跳转 logout.php
   运行: node tests/top-actions-collapse.test.js
   ============================================================ */
const fs = require('fs');
const path = require('path');
const { Window } = require('happy-dom');

const ROOT = path.join(__dirname, '..');

// ---------- Part A 静态断言 ----------
const results = [];
function check(name, cond, detail) {
  results.push(!!cond);
  console.log((cond ? 'PASS' : 'FAIL') + '  ' + name + (detail !== undefined ? '  [' + detail + ']' : ''));
}

const indexSrc = fs.readFileSync(path.join(ROOT, 'index.php'), 'utf8');
const styleSrc = fs.readFileSync(path.join(ROOT, 'assets/style.css'), 'utf8');
const appSrc = fs.readFileSync(path.join(ROOT, 'assets/app.js'), 'utf8');

// —— index.php 结构 ——
const topActions = indexSrc.split('</header>')[0] || '';
check('index.php 顶栏含更多折叠按钮 #moreBtn', topActions.includes('id="moreBtn"'));
check('index.php 顶栏含折叠面板 #moreMenu', topActions.includes('id="moreMenu"'));
check('折叠面板含「切换主题」条目', /data-more-action="theme"/.test(topActions) && topActions.includes('切换主题'));
check('折叠面板含「站点设置」条目', /data-more-action="settings"/.test(topActions) && topActions.includes('站点设置'));
check('折叠面板含「退出登录」条目', /data-more-action="logout"/.test(topActions) && topActions.includes('退出登录'));
check('面板条目均带图标容器 more-ico', (topActions.match(/class="more-ico"/g) || []).length >= 3);
check('退出条目带危险样式 more-danger', topActions.includes('more-danger'));
check('更多按钮带三点图标 SVG', /<svg[\s\S]*?<circle cx="5"[\s\S]*?<circle cx="12"[\s\S]*?<circle cx="19"/.test(topActions));
check('更多按钮声明可访问属性（aria-expanded）', topActions.includes('aria-expanded="false"') && topActions.includes('aria-haspopup="true"'));

// —— style.css 样式 ——
const moreMenuRule = styleSrc.match(/\.more-menu\s*\{([^}]*)\}/);
check('style.css 存在 .more-menu 面板样式', !!moreMenuRule);
check('面板为 absolute 定位（相对 .top-actions）', moreMenuRule && /position\s*:\s*absolute/.test(moreMenuRule[1]));
check('面板使用卡片背景与边框（明暗主题适配）', moreMenuRule && /var\(--card\)/.test(moreMenuRule[1]) && /var\(--line\)/.test(moreMenuRule[1]));
check('style.css .top-actions 提供定位锚点（position: relative）', (() => {
  const m = styleSrc.match(/\.top-actions\s*\{([^}]*)\}/);
  return m && /position\s*:\s*relative/.test(m[1]);
})());
check('style.css 存在 .more-item 条目样式', /\.more-item\s*\{/.test(styleSrc));
check('style.css 退出条目为危险色', /\.more-item\.more-danger\s*\{/.test(styleSrc) || /more-danger\s*\{[^}]*var\(--danger\)/.test(styleSrc));
check('style.css 基础隐藏 #moreBtn（宽屏不显示）', (() => {
  const m = styleSrc.match(/#moreBtn\s*\{([^}]*)\}/);
  return m && /display\s*:\s*none/.test(m[1]);
})());

// —— style.css 窄屏断点 ——
check('style.css 存在 720px 窄屏折叠断点', styleSrc.includes('@media (max-width: 720px)'));
const mqIdx = styleSrc.indexOf('@media (max-width: 720px)');
const mqBlock = mqIdx >= 0 ? styleSrc.slice(mqIdx, mqIdx + 800) : '';
check('断点内隐藏主题/设置/退出三个原按钮', /#themeBtn/.test(mqBlock) && /#settingsBtn/.test(mqBlock) && /#logoutBtn/.test(mqBlock) && /display\s*:\s*none/.test(mqBlock));
check('断点内显示 #moreBtn 折叠按钮', /#moreBtn/.test(mqBlock) && /display\s*:\s*inline-flex/.test(mqBlock));

// —— app.js 交互逻辑 ——
check('app.js 提取 toggleTheme 函数', /function toggleTheme\(\)/.test(appSrc));
check('app.js 顶部主题按钮复用 toggleTheme', /themeBtn\.addEventListener\('click', toggleTheme\)/.test(appSrc));
check('app.js 提取 openSettings 函数', /async function openSettings\(\)/.test(appSrc));
check('app.js 顶部设置按钮复用 openSettings', /settingsBtn\.addEventListener\('click', openSettings\)/.test(appSrc));
check('app.js 提取 doLogout 函数并跳转 logout.php', /function doLogout\(\)[\s\S]*?logout\.php/.test(appSrc));
check('app.js 顶部退出按钮复用 doLogout', /logoutBtn\.addEventListener\('click', doLogout\)/.test(appSrc));
check('app.js 面板条目按 data-more-action 分发动作', /item\.dataset\.moreAction/.test(appSrc) && /act === 'theme'/.test(appSrc) && /act === 'settings'/.test(appSrc) && /act === 'logout'/.test(appSrc));
check('app.js 更多按钮点击切换面板', /moreBtn\.addEventListener\('click'/.test(appSrc) && /moreMenu\.hidden\s*=\s*!/.test(appSrc));
check('app.js 点击面板外部关闭', /document\.addEventListener\('click'/.test(appSrc) && /closeMore\(\)/.test(appSrc));
check('app.js Esc 键关闭面板', /key === 'Escape'/.test(appSrc));
check('app.js 条目点击后面板自动关闭', /closeMore\(\);/.test(appSrc));
check('app.js 折叠逻辑带元素存在性保护（无 moreBtn 的页面不崩）', /if\s*\(\s*moreBtn\s*&&\s*moreMenu\s*\)/.test(appSrc) || /if\s*\(moreBtn\s*&&\s*moreMenu\)/.test(appSrc));

// ---------- Part B happy-dom ----------
const HTML = `<!DOCTYPE html>
<html lang="zh-CN">
<head>
<meta charset="UTF-8">
<meta name="csrf" content="testcsrf123">
<title>Free-Panel · 收藏夹</title>
</head>
<body class="bg-default" data-search-local="1" data-search-web="1">
  <header class="topbar">
    <div class="brand"><span class="brand-logo"></span></div>
    <div class="mode-switch" id="modeSwitch">
      <span class="mode-slider"></span>
      <button data-mode="default" class="active">默认</button>
      <button data-mode="lan">内网</button>
      <button data-mode="ipv6">IPv6</button>
    </div>
    <div class="top-actions">
      <button id="moreBtn" class="ibtn more-btn" title="更多操作" aria-haspopup="true" aria-expanded="false">
        <svg viewBox="0 0 24 24" width="18" height="18" fill="currentColor"><circle cx="5" cy="12" r="1.9"/><circle cx="12" cy="12" r="1.9"/><circle cx="19" cy="12" r="1.9"/></svg>
      </button>
      <button id="themeBtn" class="ibtn" title="切换明暗主题"></button>
      <button id="settingsBtn" class="ibtn" title="站点设置">&#9881;</button>
      <button id="logoutBtn" class="btn btn-ghost btn-sm">退出</button>
      <div class="more-menu" id="moreMenu" role="menu" hidden>
        <button class="more-item" data-more-action="theme" role="menuitem">
          <span class="more-ico">&#9728;</span><span class="more-label">切换主题</span>
        </button>
        <button class="more-item" data-more-action="settings" role="menuitem">
          <span class="more-ico">&#9881;</span><span class="more-label">站点设置</span>
        </button>
        <div class="more-divider" role="separator"></div>
        <button class="more-item more-danger" data-more-action="logout" role="menuitem">
          <span class="more-ico">&#8611;</span><span class="more-label">退出登录</span>
        </button>
      </div>
    </div>
  </header>
  <div class="search-bar">
    <div class="search-engine" id="engineBtn"><span class="se-ico" id="engineIcon">&#128269;</span><span class="se-name" id="engineName">搜索引擎</span></div>
    <div class="search-box">
      <input id="search" type="text">
      <button id="searchClear" class="search-clear" hidden>&#10005;</button>
    </div>
    <div id="enginePanel" hidden>
      <div class="engine-panel-title">选择搜索引擎</div>
      <div class="engine-list" id="engineList"></div>
      <button id="engineAddBtn" type="button">＋ 添加 / 编辑搜索引擎</button>
    </div>
  </div>
  <main class="main">
    <section class="group" id="g1" data-group="1" data-icon="">
      <div class="group-head">
        <h2 class="group-name">常用</h2>
        <button class="add-link-btn" data-act="add-link" data-gid="1">＋</button>
        <span class="group-count">0</span>
      </div>
      <div class="grid" data-group="1"></div>
    </section>
  </main>
  <div id="modalRoot"></div>
  <div id="ctxMenu" class="ctx-menu" hidden></div>
  <div id="toast" class="toast" hidden></div>
</body>
</html>`;

(async () => {
  const appJs = fs.readFileSync(path.join(ROOT, 'assets/app.js'), 'utf8');

  const BASE_SETTINGS = {
    site_title: 'Free-Panel', site_subtitle: '更加自由的导航页',
    site_icon: '', open_new_tab: '1', show_sidebar: '1',
    page_margin: '26', search_pad: '0',
    show_searchbar: '1', search_local: '1', search_web: '1', search_hint: '1',
    show_group_icon: '1', show_group_name: '1', show_group_count: '1',
    bg_style: 'default', bg_color: '#f3f5f9', bg_image: '', bg_mode: 'fit',
    icp1: '', icp1_url: 'https://beian.miit.gov.cn',
    icp2: '', icp2_url: 'https://beian.mps.gov.cn',
    engines: '[]', username: 'admin', version: '1.5.0',
  };

  function buildWindow() {
    const window = new Window({ url: 'http://127.0.0.1:8123/index.php', width: 1280, height: 900 });
    const { document } = window;
    document.write(HTML);
    document.close();

    const apiCalls = [];
    window.fetch = async (url, opts) => {
      const body = JSON.parse(opts.body);
      apiCalls.push(body);
      if (body.action === 'get_settings') return { ok: true, json: async () => ({ ok: true, settings: Object.assign({}, BASE_SETTINGS) }) };
      return { ok: true, json: async () => ({ ok: true }) };
    };

    // mock 导航：记录退出登录跳转目标
    let lastNav = null;
    try {
      Object.defineProperty(window.location, 'href', {
        configurable: true,
        get: () => 'http://127.0.0.1:8123/index.php',
        set: (v) => { lastNav = v; },
      });
    } catch (_) { /* 忽略 */ }
    try { window.location.reload = () => {}; } catch (_) { /* 忽略 */ }

    window.eval(appJs);
    return { window, document, apiCalls, nav: () => lastNav };
  }

  const tick = () => new Promise((r) => setTimeout(r, 20));
  const more = (doc) => doc.querySelector('#moreBtn');
  const menu = (doc) => doc.querySelector('#moreMenu');

  // 用例 1：开关面板
  {
    const ctx = buildWindow();
    const doc = ctx.document;
    const btn = more(doc);
    const m = menu(doc);

    check('初始面板隐藏', m.hidden === true);

    btn.dispatchEvent(new ctx.window.Event('click', { bubbles: true }));
    check('点击更多按钮后面板打开', m.hidden === false);
    check('打开后按钮标记 aria-expanded=true', btn.getAttribute('aria-expanded') === 'true');

    btn.dispatchEvent(new ctx.window.Event('click', { bubbles: true }));
    check('再次点击更多按钮后面板关闭', m.hidden === true);
  }

  // 用例 2：点击面板外关闭 / Esc 关闭
  {
    const ctx = buildWindow();
    const doc = ctx.document;
    more(doc).dispatchEvent(new ctx.window.Event('click', { bubbles: true }));
    check('打开后点击面板外（document）关闭', (() => {
      doc.dispatchEvent(new ctx.window.Event('click', { bubbles: true }));
      return menu(doc).hidden === true;
    })());

    more(doc).dispatchEvent(new ctx.window.Event('click', { bubbles: true }));
    check('打开后按 Esc 关闭', (() => {
      doc.dispatchEvent(new ctx.window.KeyboardEvent('keydown', { key: 'Escape' }));
      return menu(doc).hidden === true;
    })());
  }

  // 用例 3：切换主题条目
  {
    const ctx = buildWindow();
    const doc = ctx.document;
    doc.documentElement.dataset.theme = 'light';
    more(doc).dispatchEvent(new ctx.window.Event('click', { bubbles: true }));
    const item = doc.querySelector('.more-item[data-more-action="theme"]');
    item.dispatchEvent(new ctx.window.Event('click', { bubbles: true }));
    await tick();
    check('点击「切换主题」后面板关闭', menu(doc).hidden === true);
    check('点击「切换主题」后主题切换为 dark', doc.documentElement.dataset.theme === 'dark');
  }

  // 用例 4：站点设置条目
  {
    const ctx = buildWindow();
    const doc = ctx.document;
    more(doc).dispatchEvent(new ctx.window.Event('click', { bubbles: true }));
    const item = doc.querySelector('.more-item[data-more-action="settings"]');
    item.dispatchEvent(new ctx.window.Event('click', { bubbles: true }));
    await tick();
    check('点击「站点设置」后面板关闭', menu(doc).hidden === true);
    check('点击「站点设置」后发起 get_settings', ctx.apiCalls.some((c) => c.action === 'get_settings'));
    check('点击「站点设置」后设置弹窗打开', !!doc.querySelector('.settings-modal'));
  }

  // 用例 5：退出登录条目
  {
    const ctx = buildWindow();
    const doc = ctx.document;
    more(doc).dispatchEvent(new ctx.window.Event('click', { bubbles: true }));
    const item = doc.querySelector('.more-item[data-more-action="logout"]');
    item.dispatchEvent(new ctx.window.Event('click', { bubbles: true }));
    await tick();
    check('点击「退出登录」后面板关闭', menu(doc).hidden === true);
    check('点击「退出登录」后跳转 logout.php', ctx.nav() === 'logout.php');
  }

  const failed = results.filter((r) => !r).length;
  console.log('\n' + (failed === 0 ? 'ALL PASS' : failed + ' FAILED') + '  (' + results.length + ' checks)');
  process.exit(failed === 0 ? 0 : 1);
})();
