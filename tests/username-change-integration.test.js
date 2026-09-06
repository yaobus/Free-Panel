/* ============================================================
   Free-Panel 修改用户名集成测试（happy-dom）
   加载最小主页快照 + 真实 app.js，验证设置弹窗「账号设置」分区：
   - 渲染：分区存在、用户名输入框预填当前用户名、当前密码字段存在
   - 仅改用户名：提交后调用 change_username（含 new_username/password），不调用 change_password
   - 改用户名 + 改密码：两个接口按序调用
   - 前端校验（不发请求）：当前密码缺失 / 用户名未变 / 新密码过短 / 两次新密码不一致
   - save_settings 请求体不含账号字段
   运行: node tests/username-change-integration.test.js
   ============================================================ */
const fs = require('fs');
const path = require('path');
const { Window } = require('happy-dom');

// 最小主页快照（模拟服务端渲染产物，覆盖 app.js 初始化所需全部 DOM）
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
  const appJs = fs.readFileSync(path.join(__dirname, '../assets/app.js'), 'utf8');

  // get_settings 返回完整 settings（含 username），其余 action 返回 ok
  const BASE_SETTINGS = {
    site_title: 'Free-Panel', site_subtitle: '更加自由的导航页',
    site_icon: '', open_new_tab: '1', show_sidebar: '1',
    page_margin: '26', search_pad: '0',
    show_searchbar: '1', search_local: '1', search_web: '1', search_hint: '1',
    show_group_icon: '1', show_group_name: '1', show_group_count: '1',
    bg_style: 'default', bg_color: '#f3f5f9', bg_image: '', bg_mode: 'fit',
    icp1: '京ICP备00000000号-1', icp1_url: 'https://beian.miit.gov.cn',
    icp2: '京公网安备 11000000000000号', icp2_url: 'https://beian.mps.gov.cn',
    username: 'admin',
  };

  function buildWindow(settings) {
    const window = new Window({ url: 'http://127.0.0.1:8123/index.php', width: 1280, height: 900 });
    const { document } = window;
    document.write(HTML);
    document.close();

    // mock fetch：记录全部请求，按 action 返回
    const apiCalls = [];
    window.fetch = async (url, opts) => {
      const body = JSON.parse(opts.body);
      apiCalls.push(body);
      if (body.action === 'get_settings') return { ok: true, json: async () => ({ ok: true, settings: Object.assign({}, BASE_SETTINGS, settings || {}) }) };
      return { ok: true, json: async () => ({ ok: true }) };
    };

    // mock location.reload
    let reloadCalls = 0;
    try { window.location.reload = () => { reloadCalls++; }; } catch (_) { /* 忽略 */ }

    window.eval(appJs);
    return { window, document, apiCalls, reload: () => reloadCalls };
  }

  const results = [];
  function check(name, cond, detail) {
    results.push(!!cond);
    console.log((cond ? 'PASS' : 'FAIL') + '  ' + name + (detail !== undefined ? '  [' + detail + ']' : ''));
  }
  const actions = (calls) => calls.map((c) => c.action);
  const tick = () => new Promise((r) => setTimeout(r, 20));
  async function openSettings(ctx) {
    ctx.document.querySelector('#settingsBtn').dispatchEvent(new ctx.window.Event('click', { bubbles: true }));
    await tick();
  }
  async function submitForm(ctx, patch) {
    const form = ctx.document.querySelector('.settings-modal form');
    if (patch) {
      Object.keys(patch).forEach((k) => {
        const el = form.querySelector(`[name="${k}"]`);
        if (el) el.value = patch[k];
      });
    }
    form.dispatchEvent(new ctx.window.Event('submit', { bubbles: true, cancelable: true }));
    await tick();
  }
  const toastText = (ctx) => ctx.document.querySelector('#toast').textContent;
  const toastErr = (ctx) => ctx.document.querySelector('#toast').classList.contains('err');

  // ============ 场景 A：弹窗渲染 ============
  let ctx = buildWindow();
  await openSettings(ctx);
  check('A1: 点击设置按钮打开设置弹窗', !!ctx.document.querySelector('.settings-modal'), '');
  check('A2: 「账号设置」分区存在', !!ctx.document.querySelector('#set-sec-account'), '');
  check('A3: 用户名输入框预填当前用户名', (() => {
    const el = ctx.document.querySelector('input[name="username"]');
    return !!el && el.value === 'admin';
  })(), '');
  check('A4: 当前密码输入框存在', !!ctx.document.querySelector('input[name="old_password"]'), '');
  check('A5: 新密码 / 确认密码输入框存在',
    !!ctx.document.querySelector('input[name="new_password"]') && !!ctx.document.querySelector('input[name="confirm"]'), '');
  check('A6: 左侧导航含「账号设置」分类按钮', Array.from(ctx.document.querySelectorAll('.set-nav-item'))
    .some((b) => b.textContent.includes('账号设置')), '');

  // ============ 场景 B：仅改用户名（填当前密码，新密码留空） ============
  ctx = buildWindow();
  await openSettings(ctx);
  await submitForm(ctx, { username: 'admin2', old_password: 'secret' });
  const Bcalls = actions(ctx.apiCalls);
  check('B1: 调用了 save_settings（站点设置正常保存）', Bcalls.includes('save_settings'), Bcalls.join(','));
  check('B2: 调用了 change_username', Bcalls.includes('change_username'), Bcalls.join(','));
  const bcu = ctx.apiCalls.find((c) => c.action === 'change_username');
  check('B3: change_username 参数正确（new_username/password）',
    !!bcu && bcu.new_username === 'admin2' && bcu.password === 'secret',
    bcu ? JSON.stringify(bcu) : '');
  check('B4: 未调用 change_password（新密码留空）', !Bcalls.includes('change_password'), Bcalls.join(','));
  const bss = ctx.apiCalls.find((c) => c.action === 'save_settings');
  check('B5: save_settings 请求体不含账号字段',
    !!bss && !('username' in bss) && !('old_password' in bss) && !('new_password' in bss) && !('confirm' in bss),
    bss ? Object.keys(bss).join(',') : '');
  check('B6: 成功后刷新页面', ctx.reload() === 1, 'reload=' + ctx.reload());
  check('B7: 提示包含「用户名已更新」', toastText(ctx).includes('用户名已更新'), toastText(ctx));

  // ============ 场景 C：同时改用户名 + 改密码 ============
  ctx = buildWindow();
  await openSettings(ctx);
  await submitForm(ctx, { username: 'admin3', old_password: 'secret', new_password: 'newpass123', confirm: 'newpass123' });
  const Ccalls = actions(ctx.apiCalls);
  check('C1: 同时调用 change_username 与 change_password',
    Ccalls.includes('change_username') && Ccalls.includes('change_password'), Ccalls.join(','));
  const ccu = ctx.apiCalls.find((c) => c.action === 'change_username');
  const ccp = ctx.apiCalls.find((c) => c.action === 'change_password');
  check('C2: change_username 用新用户名 + 当前密码',
    !!ccu && ccu.new_username === 'admin3' && ccu.password === 'secret', ccu ? JSON.stringify(ccu) : '');
  check('C3: change_password 用当前密码 + 新密码',
    !!ccp && ccp.old_password === 'secret' && ccp.new_password === 'newpass123', ccp ? JSON.stringify(ccp) : '');
  check('C4: 提示包含「用户名与密码已更新」', toastText(ctx).includes('用户名与密码已更新'), toastText(ctx));

  // ============ 场景 D：前端校验（不发账号请求） ============
  ctx = buildWindow();
  await openSettings(ctx);
  await submitForm(ctx, { username: 'admin4' }); // 忘记填当前密码
  check('D1: 改用户名但当前密码为空 → 错误提示', toastErr(ctx) && toastText(ctx).includes('当前密码'), toastText(ctx));
  check('D2: 未发起 change_username / change_password', !actions(ctx.apiCalls).includes('change_username'), actions(ctx.apiCalls).join(','));

  ctx = buildWindow();
  await openSettings(ctx);
  await submitForm(ctx, { old_password: 'secret', new_password: '123', confirm: '123' }); // 新密码过短
  check('D3: 新密码少于 6 位 → 错误提示', toastErr(ctx) && toastText(ctx).includes('至少 6 位'), toastText(ctx));
  check('D4: 未发起任何账号接口调用', !actions(ctx.apiCalls).includes('change_password'), actions(ctx.apiCalls).join(','));

  ctx = buildWindow();
  await openSettings(ctx);
  await submitForm(ctx, { old_password: 'secret', new_password: 'newpass123', confirm: 'diffpass9' }); // 两次不一致
  check('D5: 两次新密码不一致 → 错误提示', toastErr(ctx) && toastText(ctx).includes('不一致'), toastText(ctx));
  check('D6: 未发起 change_password', !actions(ctx.apiCalls).includes('change_password'), actions(ctx.apiCalls).join(','));

  ctx = buildWindow();
  await openSettings(ctx);
  await submitForm(ctx, { username: 'admin', old_password: 'secret' }); // 用户名与当前相同
  check('D7: 用户名未变化 → 不调用 change_username', !actions(ctx.apiCalls).includes('change_username'), actions(ctx.apiCalls).join(','));

  const pass = results.filter(Boolean).length;
  console.log(`\n${pass}/${results.length} 通过`);
  process.exit(pass === results.length ? 0 : 1);
})();
