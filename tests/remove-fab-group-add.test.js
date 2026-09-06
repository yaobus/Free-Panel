/* ============================================================
   Free-Panel 移除右下角 FAB + 新增分组入口改造集成测试
   需求（需求 18）：
     1. 取消右下角的新增按钮（FAB），.main-scroll 底部预留回退
     2. 「所属分组」下拉框后新增分组按钮（添加收藏/编辑收藏表单内联新增分组，不刷新页面）
     3. 左侧「分组导航」标题：字体大小与右侧分组名称一致（17px）+ 分组图标
     4. 悬停侧栏标题显示「添加分组」按钮，鼠标移开 2 秒自动隐藏
   Part A 静态断言（index.php / style.css / app.js 源码）
   Part B happy-dom（加载真实 app.js 验证交互）
   运行: node tests/remove-fab-group-add.test.js
   ============================================================ */
const fs = require('fs');
const path = require('path');
const { Window } = require('happy-dom');

const ROOT = path.join(__dirname, '..');
const idxSrc = fs.readFileSync(path.join(ROOT, 'index.php'), 'utf8');
const css = fs.readFileSync(path.join(ROOT, 'assets/style.css'), 'utf8');
const appSrc = fs.readFileSync(path.join(ROOT, 'assets/app.js'), 'utf8');

const results = [];
function check(name, cond, detail) {
  results.push(!!cond);
  console.log((cond ? 'PASS' : 'FAIL') + '  ' + name + (detail !== undefined ? '  [' + detail + ']' : ''));
}

function block(src, selectorRe) {
  const m = selectorRe.exec(src);
  return m ? m[1] : '';
}

// ============ Part A 静态断言 ============
console.log('--- Part A 静态断言 ---');

// A. FAB 已整体移除
check('index.php 不含 fabWrap', !/fabWrap/.test(idxSrc));
check('index.php 不含 fab-item', !/fab-item/.test(idxSrc));
check('index.php 不含 id="fab" 主按钮', !/id="fab"/.test(idxSrc));
check('style.css 不含 .fab-wrap 规则', !/\.fab-wrap\s*\{/.test(css));
check('style.css 不含 .fab 主按钮规则', !/\.fab\s*\{/.test(css));
check('app.js 不含 fabWrap 引用', !/fabWrap/.test(appSrc));

// B. .main-scroll 底部预留已回退（不再为 FAB 预留 96px）
const msBody = block(css, /\.main-scroll\s*\{([^}]+)\}/);
const pbMatch = /padding-bottom:\s*([^;]+);/.exec(msBody);
const pb = pbMatch ? parseFloat(pbMatch[1]) : null;
check('.main-scroll padding-bottom 已回退（< 60px）', pb !== null && pb < 60, 'pb=' + pb);

// C. 侧栏标题改造：图标 + 字体一致 + 悬浮添加分组按钮
check('侧栏标题含分组图标（side-title-ico）', /class="side-title-ico"/.test(idxSrc));
check('侧栏标题含「添加分组」按钮（side-add-group / data-act="add-group"）', /class="side-add-group"[^>]*data-act="add-group"/.test(idxSrc));
const stBody = block(css, /\.side-title\s*\{([^}]+)\}/);
check('.side-title font-size 为 17px（与分组名称一致）', /font-size:\s*17px/.test(stBody), stBody.trim().replace(/\n/g, ' ').slice(0, 80));
const gnBody = block(css, /\.group-name\s*\{([^}]*font-size:[^}]*)\}/);
check('.group-name font-size 为 17px（对照基准）', /font-size:\s*17px/.test(gnBody));
const sagBody = block(css, /\.side-add-group\s*\{([^}]+)\}/);
check('.side-add-group 默认隐藏（opacity: 0）', /opacity:\s*0/.test(sagBody));
check('.side-add-group.show 显示规则存在', /\.side-add-group\.show\s*\{[^}]*opacity:\s*1/.test(css));
// C2. 放大不偏移：按钮用 SVG 加号（替代全角文本 ＋，避免字体行高指标致缩放时字形中心偏离按钮中心）
check('侧栏「添加分组」按钮内容为 SVG 加号（非文本 ＋）', /class="side-add-group"[^>]*>\s*<svg/.test(idxSrc) && !/class="side-add-group"[^>]*>\s*＋/.test(idxSrc));
check('分组名「＋」按钮内容为 SVG 加号（非文本 ＋）', /class="add-link-btn"[\s\S]*?>\s*<svg/.test(idxSrc) && !/class="add-link-btn"[\s\S]*?>\s*＋/.test(idxSrc));
check('.side-add-group 显式 transform-origin: center（放大围绕自身中心）', /\.side-add-group\s*\{[^}]*transform-origin:\s*center/.test(css) || /\.side-add-group:hover\s*\{[^}]*transform-origin:\s*center/.test(css));
check('.add-link-btn 显式 transform-origin: center（放大围绕自身中心）', /\.add-link-btn\s*\{[^}]*transform-origin:\s*center/.test(css) || /\.add-link-btn:hover\s*\{[^}]*transform-origin:\s*center/.test(css));

// D. 表单「所属分组」下拉框后新增分组按钮（不刷新页面）
check('fieldHtml select 分支渲染 group-inline-add 按钮', /group-inline-add/.test(block(appSrc, /function fieldHtml\(f\)\s*\{([\s\S]*?)\n  \}/)));
const addLinkBlock = appSrc.slice(appSrc.indexOf("case 'add-link'"), appSrc.indexOf("case 'edit-link'"));
const editLinkBlock = block(appSrc, /function handleEditLink\(btn, cardOverride\)\s*\{([\s\S]*?)\n  \}/);
check('add-link 的 group_id 字段 groupAddBtn: true', /name: 'group_id'[\s\S]*?groupAddBtn: true/.test(addLinkBlock));
check('add-link 的 group_id options 使用 groupOptions()', /name: 'group_id'[\s\S]*?groupOptions\(\)/.test(addLinkBlock));
check('edit-link 的 group_id 字段 groupAddBtn: true', /name: 'group_id'[\s\S]*?groupAddBtn: true/.test(editLinkBlock));
check('edit-link 的 group_id options 使用 groupOptions()', /name: 'group_id'[\s\S]*?groupOptions\(\)/.test(editLinkBlock));
check('app.js 含 extraGroups 会话缓存', /let extraGroups\s*=\s*\[\]/.test(appSrc));
check('app.js 含 groupOptions()（DOM 分组 + 会话新增合并）', /function groupOptions\(\)/.test(appSrc));
check('app.js 含 openGroupCreateModal（内联新增分组，不刷新页面）', /function openGroupCreateModal/.test(appSrc));

// E. 弹窗叠加支持（内联新增分组弹窗叠加在添加收藏弹窗之上，提交回调按弹窗实例隔离）
check('openModal 提交回调挂在弹窗实例（ov.__onSubmit）', /ov\.__onSubmit/.test(appSrc));
check('closeModal 仅移除最上层弹窗（lastElementChild）', /lastElementChild/.test(block(appSrc, /function closeModal\(\)\s*\{([\s\S]*?)\n  \}/)));

// F. 侧栏「添加分组」按钮 2 秒自动隐藏
const sagIdx = appSrc.indexOf('.side-add-group');
const sagSeg = sagIdx >= 0 ? appSrc.slice(sagIdx, sagIdx + 900) : '';
check('app.js 侧栏添加分组按钮：悬浮显示 / 移开 2 秒自动隐藏', /2000/.test(sagSeg), sagSeg.slice(0, 60).replace(/\n/g, ' '));

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
  <div class="layout">
    <nav class="side" id="sideNav">
      <div class="side-inner">
        <div class="side-title">
          <svg class="side-title-ico" viewBox="0 0 24 24" width="17" height="17" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v9a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/></svg>
          <span>分组导航</span>
          <button class="side-add-group" data-act="add-group" title="添加分组">＋</button>
        </div>
        <button class="side-item" data-target="#g1"><span class="side-name">常用</span></button>
      </div>
    </nav>
    <main class="main">
      <div class="main-scroll" id="mainScroll">
        <section class="group" id="g1" data-group="1" data-icon="">
          <div class="group-head" title="按住拖动分组名称可调整分组顺序">
            <h2 class="group-name">常用</h2>
            <button class="add-link-btn" data-act="add-link" data-gid="1" title="在本分组添加收藏">＋</button>
            <span class="group-count">0</span>
          </div>
          <div class="grid" data-group="1"></div>
        </section>
      </div>
    </main>
  </div>
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

  // mock fetch：add_group 返回 id=99，其余返回 ok
  const apiCalls = [];
  window.fetch = async (url, opts) => {
    const body = JSON.parse(opts.body);
    apiCalls.push(body);
    if (body.action === 'add_group') return { ok: true, json: async () => ({ ok: true, data: { id: 99 } }) };
    return { ok: true, json: async () => ({ ok: true }) };
  };
  try { window.location.reload = () => {}; } catch (_) { /* 忽略 */ }

  window.eval(appSrc);
  const tick = () => new Promise((r) => setTimeout(r, 20));
  const root = () => document.querySelector('#modalRoot');

  // B1 侧栏「添加分组」按钮 → 新建分组弹窗
  document.querySelector('.side-add-group').dispatchEvent(new window.Event('click', { bubbles: true, cancelable: true }));
  await tick();
  check('B1 点击侧栏「添加分组」打开「新建分组」弹窗', !!root() && !!root().querySelector('h3') && root().querySelector('h3').textContent.includes('新建分组'));

  // B2 关闭弹窗
  root().querySelector('.modal-close').dispatchEvent(new window.Event('click', { bubbles: true, cancelable: true }));
  await tick();
  check('B2 关闭后 modalRoot 为空', !!root() && root().children.length === 0);

  // B3 打开添加收藏弹窗 → 所属分组 select 后存在内联「＋」新增按钮
  document.querySelector('.add-link-btn').dispatchEvent(new window.Event('click', { bubbles: true, cancelable: true }));
  await tick();
  const form1 = root().querySelector('form');
  const sel = form1.querySelector('[name="group_id"]');
  const inlineBtn = form1.querySelector('.group-inline-add');
  check('B3 添加收藏弹窗：select 后存在 group-inline-add 按钮', !!sel && !!inlineBtn && inlineBtn.closest('.form-row').contains(sel));

  // B4 点击内联按钮 → 叠加新建分组弹窗
  inlineBtn.dispatchEvent(new window.Event('click', { bubbles: true, cancelable: true }));
  await tick();
  check('B4 叠加「新建分组」弹窗（modalRoot 内 2 个弹窗）', root().children.length === 2, 'count=' + root().children.length);

  // B5 提交新建分组 → select 就地追加 value=99 并选中
  const overlay2 = root().lastElementChild;
  const form2 = overlay2.querySelector('form');
  form2.querySelector('[name="name"]').value = '新分组';
  form2.dispatchEvent(new window.Event('submit', { bubbles: true, cancelable: true }));
  await tick();
  const opt99 = Array.from(sel.options).find((o) => o.value === '99');
  check('B5 新建分组成功：select 出现 value=99 选项', !!opt99);
  check('B5b 新选项处于选中态', !!opt99 && opt99.selected === true);

  // B6 新建分组弹窗已关闭，添加收藏弹窗保留
  check('B6 新建分组弹窗已关闭（仅剩 1 个弹窗）', root().children.length === 1, 'count=' + root().children.length);
  check('B6b 保留的是「添加收藏」弹窗', root().querySelector('h3').textContent.includes('添加收藏'));

  // B7 提交添加收藏 → 请求体 group_id 为新分组 99
  form1.querySelector('[name="name"]').value = '测试收藏';
  form1.querySelector('[name="url"]').value = 'http://example.com';
  form1.dispatchEvent(new window.Event('submit', { bubbles: true, cancelable: true }));
  await tick();
  const addCall = apiCalls.find((c) => c.action === 'add_link');
  check('B7 提交添加收藏：请求体 group_id=99', !!addCall && addCall.group_id === '99', addCall ? addCall.group_id : 'missing');

  // B8 重新打开添加收藏 → groupOptions() 合并会话新增分组（99 仍在）
  root().querySelector('.modal-close').dispatchEvent(new window.Event('click', { bubbles: true, cancelable: true }));
  await tick();
  document.querySelector('.add-link-btn').dispatchEvent(new window.Event('click', { bubbles: true, cancelable: true }));
  await tick();
  const sel2 = root().querySelector('[name="group_id"]');
  check('B8 重新打开弹窗：分组下拉仍含 value=99（extraGroups 生效）', Array.from(sel2.options).some((o) => o.value === '99'));

  const passed = results.filter((r) => r).length;
  console.log('\n==== 结果: ' + passed + '/' + results.length + ' PASS ====');
  process.exit(passed === results.length ? 0 : 1);
})();
