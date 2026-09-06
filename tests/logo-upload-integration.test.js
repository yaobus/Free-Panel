/* ============================================================
   Free-Panel 网站 LOGO 上传功能集成测试
   需求：设置里增加修改网站 LOGO 的选项（登录页图标 + 主页左上角图标），
        支持用户上传图片（jpg / png / svg）。
   本测试覆盖：
     Part A（静态断言，读取源码）：
       - config.php 定义 DEFAULT_SITE_LOGO
       - db.php 默认设置含 site_logo
       - api.php 有 upload_logo action、格式白名单 jpg/png/svg、大小限制、
         get_settings / save_settings 含 site_logo
       - index.php / login.php 渲染 site_logo（图片分支）
     Part B（happy-dom 加载 app.js）：
       - 设置弹窗渲染 site_logo 字段 + 「上传图片」按钮
       - 点击上传创建 file input（accept 含 png/svg）
       - 模拟选择文件 → 上传成功回填输入框 + 预览更新
       - 超大文件（>2MB）前端拦截，不发请求
       - 提交 save_settings 请求体含 site_logo
       - 关于分区 logo 优先 site_logo
   运行: node tests/logo-upload-integration.test.js
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

/* ================= Part A：静态断言 ================= */
const configSrc = fs.readFileSync(path.join(ROOT, 'config.php'), 'utf8');
const dbSrc     = fs.readFileSync(path.join(ROOT, 'db.php'), 'utf8');
const apiSrc    = fs.readFileSync(path.join(ROOT, 'api.php'), 'utf8');
const indexSrc  = fs.readFileSync(path.join(ROOT, 'index.php'), 'utf8');
const loginSrc  = fs.readFileSync(path.join(ROOT, 'login.php'), 'utf8');

check('config.php 定义 DEFAULT_SITE_LOGO', /define\(\s*'DEFAULT_SITE_LOGO'/.test(configSrc));
check('db.php 默认设置含 site_logo', /'site_logo'\s*=>\s*DEFAULT_SITE_LOGO/.test(dbSrc));
check('api.php 含 upload_logo 分支', /case 'upload_logo'/.test(apiSrc));
check('api.php 上传白名单含 jpg/png/svg', /upload_logo[\s\S]{0,800}?(?:jpg|jpeg)[\s\S]{0,200}?png[\s\S]{0,200}?svg/i.test(apiSrc) || /['\"](?:jpg|jpeg)['\"]\s*=>\s*['\"]jpg['\"]/.test(apiSrc));
check('api.php get_settings 含 site_logo', /'site_icon'[\s\S]{0,400}?'site_logo'/.test(apiSrc));
check('api.php save_settings 含 site_logo', /'site_logo'\s*=>\s*fn/.test(apiSrc));
check('index.php 读取 site_logo', /\$siteLogo\s*=\s*trim\(setting\('site_logo'/.test(indexSrc));
check('login.php 读取 site_logo', /\$siteLogo\s*=\s*trim\(setting\('site_logo'/.test(loginSrc));

/* ================= Part B：happy-dom ================= */
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
    site_icon: '', site_logo: '', open_new_tab: '1', show_sidebar: '1',
    page_margin: '26', search_pad: '0',
    show_searchbar: '1', search_local: '1', search_web: '1', search_hint: '1',
    show_group_icon: '1', show_group_name: '1', show_group_count: '1',
    bg_style: 'default', bg_color: '#f3f5f9', bg_image: '', bg_mode: 'fit',
    icp1: '京ICP备00000000号-1', icp1_url: 'https://beian.miit.gov.cn',
    icp2: '京公网安备 11000000000000号', icp2_url: 'https://beian.mps.gov.cn',
    username: 'admin', version: '1.5.0',
  };

  function buildWindow(settings, uploadHandler) {
    const window = new Window({ url: 'http://127.0.0.1:8123/index.php', width: 1280, height: 900 });
    const { document } = window;
    document.write(HTML);
    document.close();

    const apiCalls = [];
    const uploads = [];
    window.fetch = async (url, opts) => {
      const u = String(url);
      if (u.includes('api.iconify.design/search')) {
        const query = /query=([^&]+)/.exec(u);
        const kw = query ? decodeURIComponent(query[1]) : '';
        return { ok: true, json: async () => ({ icons: [kw + '-a', kw + '-b'].map((n) => 'mdi:' + n) }) };
      }
      // 上传请求：FormData，无 JSON body
      if (opts && opts.body && typeof opts.body.append === 'function') {
        uploads.push(opts.body);
        if (uploadHandler) return uploadHandler(opts.body);
        return { ok: true, json: async () => ({ ok: true, url: '/uploads/logo_test.png' }) };
      }
      const body = JSON.parse(opts.body);
      apiCalls.push(body);
      if (body.action === 'get_settings') return { ok: true, json: async () => ({ ok: true, settings: Object.assign({}, BASE_SETTINGS, settings || {}) }) };
      return { ok: true, json: async () => ({ ok: true }) };
    };

    let reloadCalls = 0;
    try { window.location.reload = () => { reloadCalls++; }; } catch (_) { /* 忽略 */ }

    window.eval(appJs);
    return { window, document, apiCalls, uploads, reload: () => reloadCalls };
  }

  const tick = (ms) => new Promise((r) => setTimeout(r, ms || 30));
  async function openSettings(ctx) {
    ctx.document.querySelector('#settingsBtn').dispatchEvent(new ctx.window.Event('click', { bubbles: true }));
    await tick();
  }

  // 模拟选择文件：触发按钮 → 捕获动态创建的 file input → 注入 files → 派发 change
  async function pickFile(ctx, btn, fileObj) {
    if (!btn) return null;
    let createdInput = null;
    const origCreate = ctx.document.createElement.bind(ctx.document);
    ctx.document.createElement = (tag) => {
      const el = origCreate(tag);
      if (tag === 'input') {
        createdInput = el;
        Object.defineProperty(el, 'click', { value: () => {} }); // 阻止真实文件对话框
      }
      return el;
    };
    btn.dispatchEvent(new ctx.window.Event('click', { bubbles: true }));
    await tick();
    ctx.document.createElement = origCreate;
    if (!createdInput) return null;
    Object.defineProperty(createdInput, 'files', { value: [fileObj] });
    createdInput.dispatchEvent(new ctx.window.Event('change', { bubbles: true }));
    await tick(80);
    return createdInput;
  }

  // 用例 1：设置弹窗渲染 site_logo 字段 + 「上传图片」按钮
  {
    const ctx = buildWindow();
    await openSettings(ctx);
    const doc = ctx.document;
    const input = doc.querySelector('input[name="site_logo"]');
    check('设置弹窗渲染 site_logo 输入框', !!input, input ? input.value : 'missing');
    const upBtn = doc.querySelector('[data-icon-upload]');
    check('渲染「上传图片」按钮', !!upBtn, upBtn ? upBtn.textContent : 'missing');
    check('上传按钮位于 site_logo 字段行', upBtn && !!upBtn.closest('.icon-input'));
  }

  // 用例 2：点击上传 → 创建 file input 且 accept 支持 png / svg
  {
    const ctx = buildWindow();
    await openSettings(ctx);
    const upBtn = ctx.document.querySelector('[data-icon-upload]');
    const input = await pickFile(ctx, upBtn, { name: 'logo.png', size: 1024, type: 'image/png' });
    check('点击上传创建 file input', !!input);
    check('accept 支持 JPG/PNG/SVG', input && /image\/(jpeg|png|svg\+xml)/.test(input.accept), input ? input.accept : 'none');
  }

  // 用例 3：选择图片 → 上传成功 → 回填输入框 + 预览更新
  {
    const ctx = buildWindow();
    await openSettings(ctx);
    const upBtn = ctx.document.querySelector('[data-icon-upload]');
    await pickFile(ctx, upBtn, { name: 'logo.png', size: 1024, type: 'image/png' });
    const doc = ctx.document;
    const input = doc.querySelector('input[name="site_logo"]');
    check('上传成功后回填 site_logo 输入框', input && input.value === '/uploads/logo_test.png', input ? input.value : 'empty');
    check('上传请求为 FormData 且 action=upload_logo', ctx.uploads.length === 1 && ctx.uploads[0].get('action') === 'upload_logo', 'count=' + ctx.uploads.length);
    const pv = doc.querySelector('input[name="site_logo"]').closest('.icon-form-row').querySelector('[data-icon-preview] img');
    check('预览更新为上传的图片', pv && pv.src.includes('/uploads/logo_test.png'), pv ? pv.src : 'no img');
  }

  // 用例 4：超过 2MB 前端拦截（不发上传请求）
  {
    const ctx = buildWindow();
    await openSettings(ctx);
    const upBtn = ctx.document.querySelector('[data-icon-upload]');
    await pickFile(ctx, upBtn, { name: 'big.png', size: 3 * 1024 * 1024, type: 'image/png' });
    const input = ctx.document.querySelector('input[name="site_logo"]');
    check('超大文件不上传、不回填', ctx.uploads.length === 0 && (!input || input.value === ''), 'uploads=' + ctx.uploads.length);
    const toast = ctx.document.querySelector('#toast');
    check('给出错误提示', toast && !toast.hidden && toast.textContent.includes('2MB'), toast ? toast.textContent : 'no toast');
  }

  // 用例 5：提交 save_settings 请求体含 site_logo 值
  {
    const ctx = buildWindow();
    await openSettings(ctx);
    const doc = ctx.document;
    const input = doc.querySelector('input[name="site_logo"]');
    input.value = '/uploads/logo_custom.png';
    input.dispatchEvent(new ctx.window.Event('input', { bubbles: true }));
    await tick();
    doc.querySelector('.settings-modal form').dispatchEvent(new ctx.window.Event('submit', { bubbles: true, cancelable: true }));
    await tick(80);
    const save = ctx.apiCalls.find((c) => c.action === 'save_settings');
    check('提交 save_settings 且含 site_logo', save && save.site_logo === '/uploads/logo_custom.png', save ? save.site_logo : 'no call');
  }

  // 用例 6：关于分区 LOGO 优先 site_logo
  {
    const ctx = buildWindow({ site_logo: '/uploads/logo_x.png' });
    await openSettings(ctx);
    const aboutLogo = ctx.document.querySelector('.about-logo');
    const img = aboutLogo && aboutLogo.querySelector('img');
    check('关于分区展示 site_logo 图片', img && img.src.includes('/uploads/logo_x.png'), img ? img.src : 'no img');
  }

  const passed = results.filter(Boolean).length;
  console.log('\n' + passed + '/' + results.length + ' passed');
  process.exit(passed === results.length ? 0 : 1);
})().catch((e) => { console.error('ERROR:', e); process.exit(1); });
