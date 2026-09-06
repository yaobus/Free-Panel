/* ============================================================
   Free-Panel 添加收藏默认背景色集成测试（happy-dom）
   需求：添加地址时，默认背景颜色为色板中的第一个颜色卡片
   Part A 静态断言（读 app.js 源码）：
     - DEFAULT_CARD_PRESETS 第一个颜色为 #f8fafc
     - add-link 表单 bg_style 默认值为 'custom'（而非 'default'）
     - add-link 表单 bg_color 默认值引用 DEFAULT_CARD_PRESETS[0]
   Part B happy-dom（加载真实 app.js）：
     - 点击「＋ 添加」打开弹窗：select[name=bg_style] 值为 custom
     - cardcolor 输入框值等于第一个色板颜色；第一个色板 swatch 处于 active
     - 提交后请求体 color 为第一个色板 hex（#f8fafc），bg_style=custom
   运行: node tests/add-link-bgcolor.test.js
   ============================================================ */
const fs = require('fs');
const path = require('path');
const { Window } = require('happy-dom');

const ROOT = path.join(__dirname, '..');
const appSrc = fs.readFileSync(path.join(ROOT, 'assets/app.js'), 'utf8');

const results = [];
function check(name, cond, detail) {
  results.push(!!cond);
  console.log((cond ? 'PASS' : 'FAIL') + '  ' + name + (detail !== undefined ? '  [' + detail + ']' : ''));
}

// ============ Part A 静态断言 ============
console.log('--- Part A 静态断言（app.js 源码） ---');
const presetsMatch = appSrc.match(/const DEFAULT_CARD_PRESETS = \[([\s\S]*?)\];/);
const presets = presetsMatch
  ? presetsMatch[1].split(',').map((s) => s.trim().replace(/'/g, '')).filter(Boolean)
  : [];
const firstColor = presets[0] || '';
check('DEFAULT_CARD_PRESETS 第一个颜色为 #f8fafc', firstColor === '#f8fafc', firstColor);

const addLinkBlock = appSrc.slice(appSrc.indexOf("case 'add-link'"), appSrc.indexOf("case 'edit-link'"));
check('add-link 表单 bg_style 默认值为 custom', /name: 'bg_style'[^}]*value: 'custom'/.test(addLinkBlock));
check('add-link 表单 bg_color 默认值引用 DEFAULT_CARD_PRESETS[0]', /name: 'bg_color'[^}]*value: DEFAULT_CARD_PRESETS\[0\]/.test(addLinkBlock));
check('add-link 不再默认「默认背景」', !/name: 'bg_style'[^}]*value: 'default'/.test(addLinkBlock));

// ============ 最小主页快照 ============
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
  console.log('--- Part B happy-dom 交互 ---');
  const window = new Window({ url: 'http://127.0.0.1:8123/index.php', width: 1280, height: 900 });
  const { document } = window;
  document.write(HTML);
  document.close();

  // mock fetch：记录请求体
  const apiCalls = [];
  window.fetch = async (url, opts) => {
    const body = JSON.parse(opts.body);
    apiCalls.push(body);
    return { ok: true, json: async () => ({ ok: true }) };
  };
  try { window.location.reload = () => {}; } catch (_) { /* 忽略 */ }

  window.eval(appSrc);

  const tick = () => new Promise((r) => setTimeout(r, 20));

  // 打开添加收藏弹窗
  document.querySelector('.add-link-btn').dispatchEvent(new window.Event('click', { bubbles: true, cancelable: true }));
  await tick();

  const form = document.querySelector('#modalRoot form');
  check('弹窗已打开（标题「添加收藏」）', !!form && document.querySelector('#modalRoot h3').textContent.includes('添加收藏'));

  const bgStyle = form ? form.querySelector('[name="bg_style"]') : null;
  const bgColor = form ? form.querySelector('[name="bg_color"]') : null;
  check('bg_style select 默认值为 custom', bgStyle && bgStyle.value === 'custom', bgStyle ? bgStyle.value : 'missing');
  check('bg_color 输入框默认值为第一个色板颜色（f8fafc）', bgColor && bgColor.value === 'f8fafc', bgColor ? bgColor.value : 'missing');

  const swatches = form ? form.querySelectorAll('.cc-swatch') : [];
  check('色板渲染 24 个色块', swatches.length === 24, String(swatches.length));
  const firstSwatch = swatches[0];
  check('第一个色块 data-cc 为 #f8fafc', !!firstSwatch && firstSwatch.dataset.cc === '#f8fafc', firstSwatch ? firstSwatch.dataset.cc : 'missing');
  check('第一个色块处于 active 选中态', !!firstSwatch && firstSwatch.classList.contains('active'));
  check('其余色块未选中', swatches.length > 1 && !swatches[1].classList.contains('active'));

  // 填写必填项并提交
  form.querySelector('[name="name"]').value = '测试收藏';
  form.querySelector('[name="url"]').value = 'http://example.com';
  form.dispatchEvent(new window.Event('submit', { bubbles: true, cancelable: true }));
  await tick();

  const addCall = apiCalls.find((c) => c.action === 'add_link');
  check('提交了 add_link 请求', !!addCall);
  check('请求体 bg_style 为 custom', addCall && addCall.bg_style === 'custom', addCall ? addCall.bg_style : 'missing');
  check('请求体 bg_color 为 f8fafc', addCall && addCall.bg_color === 'f8fafc', addCall ? addCall.bg_color : 'missing');
  check('请求体 color 为 #f8fafc（第一个颜色卡片）', addCall && addCall.color === '#f8fafc', addCall ? addCall.color : 'missing');
  check('请求体含 group_id', addCall && addCall.group_id === '1', addCall ? addCall.group_id : 'missing');

  const failed = results.filter((r) => !r).length;
  console.log('------------------------------------------------');
  console.log(`add-link-bgcolor: ${results.length - failed}/${results.length} passed`);
  process.exit(failed ? 1 : 0);
})();
