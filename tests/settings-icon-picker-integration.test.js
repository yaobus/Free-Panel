/* ============================================================
   Free-Panel 站点图标选择器集成测试（设置弹窗）
   背景：设置弹窗「基本设置」中的站点图标字段带「图标库」按钮，
   此前该按钮在设置弹窗中未绑定事件（编辑弹窗有绑定），点击无反应。
   本测试覆盖：
     - site_icon 字段渲染出输入框 + 「图标库」按钮 + 预览容器
     - 点击「图标库」打开 Iconify 图标选择面板
     - 面板中关键词搜索 → 网格渲染图标项
     - 点击图标 → 回填输入框 + 面板关闭 + 预览更新
     - 手动输入 iconify:名称 / URL / emoji → 实时预览
   运行: node tests/settings-icon-picker-integration.test.js
   ============================================================ */
const fs = require('fs');
const path = require('path');
const { Window } = require('happy-dom');

const ROOT = path.join(__dirname, '..');
const results = [];
function check(name, cond, detail) {
  results.push(!!cond);
  console.log((cond ? 'PASS' : 'FAIL') + '  ' + name + (detail !== undefined ? '  [' + detail + ']' : ''));
}

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
      <button id="themeBtn" class="ibtn" title="切换明暗主题"></button>
      <button id="settingsBtn" class="ibtn" title="站点设置">&#9881;</button>
      <button id="logoutBtn" class="btn btn-ghost btn-sm">退出</button>
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
      <div class="group-head" title="按住拖动分组名称可调整分组顺序">
        <h2 class="group-name">常用</h2>
        <button class="add-link-btn" data-act="add-link" data-gid="1" title="在本分组添加收藏">＋</button>
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
    icp1: '京ICP备00000000号-1', icp1_url: 'https://beian.miit.gov.cn',
    icp2: '京公网安备 11000000000000号', icp2_url: 'https://beian.mps.gov.cn',
    username: 'admin', version: '1.4.0',
  };

  function buildWindow(settings) {
    const window = new Window({ url: 'http://127.0.0.1:8123/index.php', width: 1280, height: 900 });
    const { document } = window;
    document.write(HTML);
    document.close();

    const apiCalls = [];
    window.fetch = async (url, opts) => {
      const u = String(url);
      // Iconify 在线搜索（GET，无 opts.body）
      if (u.includes('api.iconify.design/search')) {
        const query = /query=([^&]+)/.exec(u);
        const kw = query ? decodeURIComponent(query[1]) : '';
        return { ok: true, json: async () => ({ icons: [kw + '-a', kw + '-b'].map((n) => 'mdi:' + n) }) };
      }
      // 图标内嵌保存：抓取 Iconify SVG 内容（改造后选中即转为 data URI 存库）
      if (u.includes('api.iconify.design/') && u.endsWith('.svg')) {
        return { ok: true, text: async () => '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24"><path d="M1 1h22v22H1z"/></svg>' };
      }
      const body = JSON.parse(opts.body);
      apiCalls.push(body);
      if (body.action === 'get_settings') return { ok: true, json: async () => ({ ok: true, settings: Object.assign({}, BASE_SETTINGS, settings || {}) }) };
      return { ok: true, json: async () => ({ ok: true }) };
    };

    let reloadCalls = 0;
    try { window.location.reload = () => { reloadCalls++; }; } catch (_) { /* 忽略 */ }

    window.eval(appJs);
    return { window, document, apiCalls, reload: () => reloadCalls };
  }

  const tick = (ms) => new Promise((r) => setTimeout(r, ms || 30));
  async function openSettings(ctx) {
    ctx.document.querySelector('#settingsBtn').dispatchEvent(new ctx.window.Event('click', { bubbles: true }));
    await tick();
  }

  // 用例 1：设置弹窗渲染站点图标字段（输入框 + 图标库按钮 + 预览容器）
  {
    const ctx = buildWindow();
    await openSettings(ctx);
    const doc = ctx.document;
    const input = doc.querySelector('input[name="site_icon"]');
    check('设置弹窗渲染 site_icon 输入框', !!input, input ? input.value : 'missing');
    check('site_icon 输入框预填当前图标值', input && input.value === '');
    const pick = doc.querySelector('[data-icon-pick="iconify"]');
    check('渲染「图标库」按钮', !!pick, pick ? pick.textContent : 'missing');
    check('渲染图标预览容器 [data-icon-preview]', !!doc.querySelector('[data-icon-preview]'));
  }

  // 用例 2：点击「图标库」打开 Iconify 选择面板
  {
    const ctx = buildWindow();
    await openSettings(ctx);
    const doc = ctx.document;
    doc.querySelector('[data-icon-pick="iconify"]').dispatchEvent(new ctx.window.Event('click', { bubbles: true }));
    await tick();
    const ov = doc.querySelector('.iconify-overlay');
    check('点击图标库后出现 Iconify 面板', !!ov);
    check('面板含搜索输入框 #iconifyQuery', ov && !!ov.querySelector('#iconifyQuery'));
    check('面板含图标网格 #iconifyGrid', ov && !!ov.querySelector('#iconifyGrid'));
  }

  // 用例 3：面板中回车搜索 → 网格渲染图标项
  {
    const ctx = buildWindow();
    await openSettings(ctx);
    const doc = ctx.document;
    doc.querySelector('[data-icon-pick="iconify"]').dispatchEvent(new ctx.window.Event('click', { bubbles: true }));
    await tick();
    const q = doc.querySelector('#iconifyQuery');
    q.value = 'home';
    q.dispatchEvent(new ctx.window.KeyboardEvent('keydown', { bubbles: true, cancelable: true, key: 'Enter' }));
    await tick();
    const items = doc.querySelectorAll('.iconify-grid .ico-item');
    check('回车搜索后网格渲染图标项', items.length >= 2, 'count=' + items.length);
    check('图标项带 data-name 前缀 iconify:', items.length > 0 && items[0].dataset.name.startsWith('iconify:'), items.length > 0 ? items[0].dataset.name : 'none');
  }

  // 用例 4：点击图标 → 回填输入框 + 面板关闭 + 预览更新
  {
    const ctx = buildWindow();
    await openSettings(ctx);
    const doc = ctx.document;
    doc.querySelector('[data-icon-pick="iconify"]').dispatchEvent(new ctx.window.Event('click', { bubbles: true }));
    await tick();
    const q = doc.querySelector('#iconifyQuery');
    q.value = 'home';
    q.dispatchEvent(new ctx.window.KeyboardEvent('keydown', { bubbles: true, cancelable: true, key: 'Enter' }));
    await tick();
    const first = doc.querySelector('.iconify-grid .ico-item');
    first.dispatchEvent(new ctx.window.Event('click', { bubbles: true }));
    await tick();
    const input = doc.querySelector('input[name="site_icon"]');
    check('选中图标后回填内嵌 data URI（图标内容直接存库）', input && input.value.startsWith('data:image/svg+xml;utf8,'), input ? input.value.slice(0, 40) : 'empty');
    check('选中后面板已关闭', !doc.querySelector('.iconify-overlay'));
    const pv = doc.querySelector('[data-icon-preview] img');
    check('预览更新为内嵌图片', pv && /^data:image\//.test(pv.src), pv ? pv.src.slice(0, 30) : 'no img');
  }

  // 用例 5：手动输入 iconify:名称 → 实时预览
  {
    const ctx = buildWindow();
    await openSettings(ctx);
    const doc = ctx.document;
    const input = doc.querySelector('input[name="site_icon"]');
    input.value = 'iconify:mdi:home';
    input.dispatchEvent(new ctx.window.Event('input', { bubbles: true }));
    await tick();
    const pv = doc.querySelector('[data-icon-preview] img');
    check('输入 iconify: 名称实时预览图片', pv && pv.src.includes('mdi%3Ahome'), pv ? pv.src : 'no img');
  }

  // 用例 6：手动输入 URL → 实时预览
  {
    const ctx = buildWindow();
    await openSettings(ctx);
    const doc = ctx.document;
    const input = doc.querySelector('input[name="site_icon"]');
    input.value = 'https://example.com/favicon.ico';
    input.dispatchEvent(new ctx.window.Event('input', { bubbles: true }));
    await tick();
    const pv = doc.querySelector('[data-icon-preview] img');
    check('输入 URL 实时预览图片', pv && pv.src.includes('example.com'), pv ? pv.src : 'no img');
  }

  // 用例 7：手动输入 emoji → 实时预览文本
  {
    const ctx = buildWindow();
    await openSettings(ctx);
    const doc = ctx.document;
    const input = doc.querySelector('input[name="site_icon"]');
    input.value = '🏠';
    input.dispatchEvent(new ctx.window.Event('input', { bubbles: true }));
    await tick();
    const em = doc.querySelector('[data-icon-preview] .emoji');
    check('输入 emoji 实时预览文本', em && em.textContent === '🏠', em ? em.textContent : 'no emoji');
  }

  const passed = results.filter(Boolean).length;
  console.log('\n' + passed + '/' + results.length + ' passed');
  process.exit(passed === results.length ? 0 : 1);
})().catch((e) => { console.error('ERROR:', e); process.exit(1); });
