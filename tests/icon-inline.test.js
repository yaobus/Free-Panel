/* ============================================================
   Free-Panel 图标内嵌保存测试
   背景：新增/编辑地址卡片与搜索引擎图标时，从 Iconify 图标库选中
   的图标仅保存 iconify:名称，页面每次渲染都要向
   api.iconify.design 发起外网请求加载 SVG —— 内网/弱网下加载慢、
   断网则图标丢失。本次改造：选中图标时抓取 SVG 内容转为
   data:image/svg+xml;utf8,<URL编码> 直接保存到数据库，渲染零外部请求。

   本测试覆盖：
     A. 静态断言（源码结构）：
        - app.js 存在 iconifyNameToDataUri()（fetch SVG → data URI）
        - bindIconFields 选中回调使用转换函数（成功 data URI / 失败回退 iconify:名称）
        - 引擎图标渲染 engineIconHtml 支持 data:image
        - api.php 图标字段长度上限放宽（groups 200→8192、engines 300→8192、
          site_icon/site_logo 300→8192）
     B. happy-dom 行为：
        - 选中图标 → 输入框值为 data URI 且 URL 解码后可还原出 <svg
        - 抓取失败 → 回退 iconify:名称
        - 手动输入 data URI → 实时预览图片
   运行: node tests/icon-inline.test.js
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

const appJs = fs.readFileSync(path.join(ROOT, 'assets/app.js'), 'utf8');
const apiPhp = fs.readFileSync(path.join(ROOT, 'api.php'), 'utf8');

/* ============ A. 静态断言 ============ */
console.log('---- A. 源码结构 ----');

// A1: iconifyNameToDataUri 转换函数
check('app.js 含 iconifyNameToDataUri 函数', /function\s+iconifyNameToDataUri\s*\(/.test(appJs));
check('转换函数输出 data:image/svg+xml;utf8 前缀', /data:image\/svg\+xml;utf8,/.test(appJs));
check('转换函数拼接 Iconify SVG 地址', /api\.iconify\.design\/'\s*\+\s*encodeURIComponent\(iconName\)\s*\+\s*'\.svg'/.test(appJs));
check('转换函数校验 SVG 响应头 <svg', appJs.includes('<svg/i.test(svg)'));
check('转换失败返回 null（回退路径）', /catch\s*\(_\)\s*\{\s*return null;/.test(appJs));

// A2: bindIconFields 选中回调
const onPickRe = /openIconifyPicker\(async \(name\) => \{[\s\S]*?\}\);/;
check('选中回调为 async 且调用转换函数', /openIconifyPicker\(async\s*\(name\)\s*=>[\s\S]*?const dataUri = await iconifyNameToDataUri\(name\);/.test(appJs));
check('成功 data URI / 失败回退名称', /input\.value = dataUri \|\| name;/.test(appJs));

// A3: 引擎图标渲染支持 data:image
const engBlock = /function engineIconHtml\([^)]*\)\s*\{([\s\S]*?)\n  \}/.exec(appJs);
check('engineIconHtml 含 data:image 分支', !!engBlock && /data:image\\\//.test(engBlock[1]));

// A4: api.php 限长放宽
check('api.php groups icon 上限放宽到 8192', (apiPhp.match(/icon.*?0, 8192/g) || []).length >= 2, 'count=' + (apiPhp.match(/icon.*?0, 8192/g) || []).length);
check('api.php engines icon 上限放宽到 8192', /item\['icon'\][\s\S]*?0, 8192/.test(apiPhp));
check('api.php site_icon 上限放宽到 8192', /'site_icon'\s*=>\s*fn\(\$v\) => mb_substr\(strip_tags\(trim\(\(string\) \$v\)\), 0, 8192\)/.test(apiPhp));
check('api.php site_logo 上限放宽到 8192', /'site_logo'\s*=>\s*fn\(\$v\) => mb_substr\(strip_tags\(trim\(\(string\) \$v\)\), 0, 8192\)/.test(apiPhp));

/* ============ B. happy-dom 行为 ============ */
console.log('---- B. 交互行为 ----');
(async () => {

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

const BASE_SETTINGS = {
  site_title: 'Free-Panel', site_subtitle: '更加自由的导航页',
  site_icon: '', open_new_tab: '1', show_sidebar: '1',
  page_margin: '26', search_pad: '0',
  show_searchbar: '1', search_local: '1', search_web: '1', search_hint: '1',
  show_group_icon: '1', show_group_name: '1', show_group_count: '1',
  bg_style: 'default', bg_color: '#f3f5f9', bg_image: '', bg_mode: 'fit',
  icp1: '京ICP备00000000号-1', icp1_url: 'https://beian.miit.gov.cn',
  icp2: '京公网安备 11000000000000号', icp2_url: 'https://beian.mps.gov.cn',
  username: 'admin', version: '1.5.0',
};

const SVG_OK = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24"><path fill="#0af" d="M1 1h22v22H1z"/></svg>';

// fetch stub：iconify 搜索 / iconify SVG 抓取（可配置成败）/ api.php
function buildWindow(svgOk) {
  const window = new Window({ url: 'http://127.0.0.1:8123/index.php', width: 1280, height: 900 });
  const { document } = window;
  document.write(HTML);
  document.close();

  const apiCalls = [];
  window.fetch = async (url, opts) => {
    const u = String(url);
    if (u.includes('api.iconify.design/search')) {
      const query = /query=([^&]+)/.exec(u);
      const kw = query ? decodeURIComponent(query[1]) : '';
      return { ok: true, json: async () => ({ icons: [kw + '-a', kw + '-b'].map((n) => 'mdi:' + n) }) };
    }
    if (u.includes('api.iconify.design/') && u.endsWith('.svg')) {
      return svgOk
        ? { ok: true, text: async () => SVG_OK }
        : { ok: false, status: 404 };
    }
    const body = JSON.parse(opts.body);
    apiCalls.push(body);
    if (body.action === 'get_settings') return { ok: true, json: async () => ({ ok: true, settings: Object.assign({}, BASE_SETTINGS) }) };
    return { ok: true, json: async () => ({ ok: true }) };
  };

  try { window.location.reload = () => {}; } catch (_) {}
  window.eval(appJs);
  return { window, document, apiCalls };
}

const tick = (ms) => new Promise((r) => setTimeout(r, ms || 30));
async function openSettings(ctx) {
  ctx.document.querySelector('#settingsBtn').dispatchEvent(new ctx.window.Event('click', { bubbles: true }));
  await tick();
}
// 打开图标库面板 → 搜索 → 返回第一个图标项
async function pickFirstIcon(ctx, kw) {
  const doc = ctx.document;
  doc.querySelector('[data-icon-pick="iconify"]').dispatchEvent(new ctx.window.Event('click', { bubbles: true }));
  await tick();
  const q = doc.querySelector('#iconifyQuery');
  q.value = kw;
  q.dispatchEvent(new ctx.window.KeyboardEvent('keydown', { bubbles: true, cancelable: true, key: 'Enter' }));
  await tick();
  const first = doc.querySelector('.iconify-grid .ico-item');
  first.dispatchEvent(new ctx.window.Event('click', { bubbles: true }));
  await tick(80); // 等待 async onPick 内 fetch
}

// B1: 选中图标 → 输入框内嵌 data URI（可解码还原 <svg）+ 预览 + 面板关闭
{
  const ctx = buildWindow(true);
  await openSettings(ctx);
  await pickFirstIcon(ctx, 'home');
  const input = ctx.document.querySelector('input[name="site_icon"]');
  const v = input ? input.value : '';
  const okPrefix = v.startsWith('data:image/svg+xml;utf8,');
  check('B1 选中图标后输入框为 data URI', okPrefix, v.slice(0, 40));
  if (okPrefix) {
    const decoded = decodeURIComponent(v.replace(/^data:image\/svg\+xml;utf8,/, ''));
    check('B1 data URI 可解码还原 SVG 内容', decoded.startsWith('<svg') && decoded.includes('viewBox'), decoded.slice(0, 40));
  } else {
    check('B1 data URI 可解码还原 SVG 内容', false, 'skipped');
  }
  const pv = ctx.document.querySelector('[data-icon-preview] img');
  check('B1 预览更新为内嵌图片', pv && pv.src.startsWith('data:image/svg+xml;utf8,'), pv ? pv.src.slice(0, 30) : 'no img');
  check('B1 图标库面板已关闭', !ctx.document.querySelector('.iconify-overlay'));
}

// B2: SVG 抓取失败 → 回退 iconify:名称（保持原行为）
{
  const ctx = buildWindow(false);
  await openSettings(ctx);
  await pickFirstIcon(ctx, 'home');
  const input = ctx.document.querySelector('input[name="site_icon"]');
  check('B2 抓取失败回退 iconify:名称', input && input.value.startsWith('iconify:'), input ? input.value : 'empty');
}

// B3: 手动输入 data URI → 实时预览图片（iconValueHtml 兼容内嵌格式）
{
  const ctx = buildWindow(true);
  await openSettings(ctx);
  const doc = ctx.document;
  const input = doc.querySelector('input[name="site_icon"]');
  const sample = 'data:image/svg+xml;utf8,' + encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg"><path d="M0 0"/></svg>');
  input.value = sample;
  input.dispatchEvent(new ctx.window.Event('input', { bubbles: true }));
  await tick();
  const pv = doc.querySelector('[data-icon-preview] img');
  check('B3 手动 data URI 实时预览', pv && pv.src.startsWith('data:image/svg+xml;utf8,'), pv ? pv.src.slice(0, 30) : 'no img');
}

const passed = results.filter(Boolean).length;
console.log('\n' + passed + '/' + results.length + ' passed');
process.exit(passed === results.length ? 0 : 1);
})().catch((e) => { console.error('ERROR:', e); process.exit(1); });
