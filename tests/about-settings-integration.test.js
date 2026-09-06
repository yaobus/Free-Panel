/* ============================================================
   Free-Panel 关于页 + 底部备案集成测试
   Part A 静态断言（读源文件）：
     - index.php 登录成功后底部不显示任何内容（不含 site-footer / filings）
     - login.php 登录页保留底部备案结构（含 site-footer），备案读取跳转链接并渲染为可点击超链接（含 {q} 占位符替换）
     - config.php 程序名为 Free-Panel、默认副标题为「更加自由的导航页」、默认备案文本为空但跳转链接保留先前默认值
     - app.js 模式切换不再弹出底部提示
   Part B happy-dom（加载真实 app.js）：
     - get_settings 返回 version；设置弹窗左侧导航含「关于」项，右侧存在 set-sec-about 分区
     - 关于分区展示：站点标题、版本号、新简介、GitHub 图标链接、版权
     - 关于分区不含备案信息与「本系统仅限局域网内部使用」文本
     - 关于分区不含表单字段；提交保存时请求体不含 about 字段与 version
   运行: node tests/about-settings-integration.test.js
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
const loginSrc = fs.readFileSync(path.join(ROOT, 'login.php'), 'utf8');
const configSrc = fs.readFileSync(path.join(ROOT, 'config.php'), 'utf8');
const appSrc = fs.readFileSync(path.join(ROOT, 'assets/app.js'), 'utf8');
const styleSrc = fs.readFileSync(path.join(ROOT, 'assets/style.css'), 'utf8');

check('config.php 默认站点主标题为「Free-Panel」（拆主+副两行布局）',
  /define\(\s*'DEFAULT_SITE_TITLE'\s*,\s*'Free-Panel'\s*\)/.test(configSrc));
check('config.php 默认副标题为「更加自由的导航页」（非空，与主标题独立维护）',
  /define\(\s*'DEFAULT_SITE_SUBTITLE'\s*,\s*'更加自由的导航页'\s*\)/.test(configSrc));
check('config.php 不再含旧站点名 Sun-Nav', !configSrc.includes("'Sun-Nav'"));
check('config.php 默认备案 1 文本为空', configSrc.includes("define('DEFAULT_ICP1', '')"));
check('config.php 默认备案 2 文本为空', configSrc.includes("define('DEFAULT_ICP2', '')"));
check('config.php 默认备案 1 链接保持工信部默认值', configSrc.includes("define('DEFAULT_ICP1_URL', 'https://beian.miit.gov.cn')"));
check('config.php 默认备案 2 链接保持公安备案默认值（含 {q} 占位符）', configSrc.includes("define('DEFAULT_ICP2_URL', 'https://beian.mps.gov.cn/#/query/webSearch?code={q}')"));
check('app.js 模式切换不再弹出底部提示', !appSrc.includes('地址模式已切换'));
check('index.php 不含 site-footer（登录后底部无内容）', !indexSrc.includes('site-footer'));
check('index.php 不含 filings 备案容器', !indexSrc.includes('filings'));
check('index.php 不再读取 icp 设置变量', !indexSrc.includes('$icp1') && !indexSrc.includes('$icp2'));
check('login.php 保留 site-footer（登录页显示备案）', loginSrc.includes('site-footer'));
check('login.php 仍渲染备案信息', loginSrc.includes('filing'));
check('login.php 读取备案 1 跳转链接设置', loginSrc.includes("setting('icp1_url'"));
check('login.php 读取备案 2 跳转链接设置', loginSrc.includes("setting('icp2_url'"));
check('login.php 备案 2 链接支持 {q} 占位符替换', loginSrc.includes("str_replace('{q}'"));
check('login.php 备案渲染为可点击超链接', loginSrc.includes('<a class="filing"') && loginSrc.includes('href='));
check('login.php 备案超链接新窗口打开', loginSrc.includes('target="_blank"'));

// 版权行：© 年份 Free-Panel(超链接) · 更加自由的导航页
const copyLine = loginSrc.split('\n').find((l) => l.includes('class="copy"'));
check('login.php 最底部版权行存在', !!copyLine, copyLine ? copyLine.trim() : 'missing');
check('版权行以 © + 动态年份开头', copyLine && /©.*date\('Y'\)/.test(copyLine));
check('版权行不再显示「局域网导航」旧文案', copyLine && !copyLine.includes('局域网导航'));
check('版权行以副标题设置引用结尾（默认输出「更加自由的导航页」）', copyLine && copyLine.includes("setting('site_subtitle', DEFAULT_SITE_SUBTITLE)"));
check('版权行副标题读取 site_subtitle 设置', copyLine && copyLine.includes('site_subtitle'));
check('版权行副标题为空时不输出多余「 · 」分隔符', copyLine && /if \(setting\('site_subtitle', DEFAULT_SITE_SUBTITLE\) !== ''\):[\s\S]*?·/.test(copyLine));
check('index.php 顶栏副标题为空时隐藏 brand-sub', /if \(\$subtitle !== ''\):[\s\S]*?brand-sub/.test(indexSrc));
check('login.php 登录卡片副标题为空时隐藏 login-sub', /if \(setting\('site_subtitle', DEFAULT_SITE_SUBTITLE\) !== ''\):[\s\S]*?login-sub/.test(loginSrc));
check('app.js 关于页副标题为空时隐藏 about-sub 占位', /site_subtitle \?/.test(appSrc));
check('版权行站点名 Free-Panel 为 GitHub 超链接', copyLine && copyLine.includes('<a') && copyLine.includes('https://github.com/yaobus/Free-Panel'));
check('版权行链接新窗口打开', copyLine && copyLine.includes('target="_blank"'));

// 登录按钮间距：按钮与密码输入框的间距放大至与「用户名↔密码」一致（15px gap + 标签行高 12.5*1.5 + 字段内距 6px）
const btnRule = styleSrc.match(/\.login-form\s+\.btn-block\s*\{([^}]*)\}/);
check('style.css 存在登录按钮单独间距规则', !!btnRule);
check('登录按钮设置了 margin-top', btnRule && /margin-top\s*:/.test(btnRule[1]));
check('登录按钮上边距公式 = 标签行高 + 字段内距（≈25px）', btnRule && /margin-top\s*:\s*calc\(12\.5px \* 1\.5 \+ 6px\)/.test(btnRule[1]));
check('登录按钮上边距明显大于默认 15px gap（≥20px）', btnRule && (() => {
  const m = btnRule[1].match(/calc\(12\.5px \* 1\.5 \+ 6px\)/);
  return m && 12.5 * 1.5 + 6 >= 20;
})());

// 搜索引擎下拉浮层：.engine-panel 为 absolute 定位子节点，需 .search-bar 提供定位锚点（position:relative）
// 回归背景：63f6dc1 将 search-bar 改 sticky、a70b0f2 又移除 sticky 但未恢复 relative，导致浮层被定位到视口外弹不出来
const searchBarRule = styleSrc.match(/\.search-bar\s*\{([^}]*)\}/);
check('style.css .search-bar 规则存在', !!searchBarRule);
check('style.css .search-bar 提供定位锚点（position: relative）', searchBarRule && /position\s*:\s*relative/.test(searchBarRule[1]));
check('style.css .engine-panel 存在（搜索引擎配置浮层）', /\.engine-panel\s*\{/.test(styleSrc));
check('style.css .engine-panel 为 absolute 定位（依赖 search-bar 锚点）', (() => {
  const m = styleSrc.match(/\.engine-panel\s*\{([^}]*)\}/);
  return m && /position\s*:\s*absolute/.test(m[1]);
})());

// 分组拖拽：分组在 .main-scroll 滚动容器内，拖拽 DOM 操作必须基于该容器而非 .main
// 回归背景：a70b0f2 将分组包入 .main-scroll，但 app.js 分组拖拽仍用 $('.main') 做 insertBefore，
// 导致 referenceNode 非直接子节点抛 NotFoundError，拖动分组即严重异常
check('app.js 分组拖拽容器引用 .main-scroll（非 .main）', /const mainEl\s*=\s*\$\(['"](?:#mainScroll|\.main-scroll)['"]\)/.test(appSrc));
check('app.js 不再用 .main 作为分组拖拽容器', !appSrc.includes("const mainEl = $('.main')"));

// 搜索引擎配置落库：引擎列表持久化到 settings.engines（DB 优先 + 旧 localStorage 一次性迁移）
const dbSrc = fs.readFileSync(path.join(ROOT, 'db.php'), 'utf8');
const apiSrc = fs.readFileSync(path.join(ROOT, 'api.php'), 'utf8');
check('config.php 定义默认搜索引擎列表 DEFAULT_ENGINES（含 Google/百度）',
  configSrc.includes("define('DEFAULT_ENGINES'") && configSrc.includes('Google') && configSrc.includes('百度'));
check('db.php 默认设置含 engines 键（空数组=未配置，触发前端迁移/兜底）',
  dbSrc.includes("'engines'") && dbSrc.includes("'[]'"));
check('index.php 读取 engines 设置到 $enginesJson', /\$enginesJson\s*=\s*setting\('engines'/.test(indexSrc));
check('index.php body 注入 data-engines（引擎列表服务端渲染）', indexSrc.includes('data-engines='));
check('api.php get_settings 返回 engines 键', apiSrc.includes("'search_hint', 'engines'"));
check('api.php save_settings 清洗 engines（JSON 数组逐项校验）',
  /'engines'\s*=>\s*function/.test(apiSrc) && apiSrc.includes('JSON_UNESCAPED_UNICODE'));
check('app.js 引擎列表从 DB 读取（body data-engines）', /dataset\.engines/.test(appSrc));
check('app.js 保存引擎列表走 API 落库（save_settings）',
  /api\('save_settings',\s*\{\s*engines:\s*JSON\.stringify\(engines\)\s*\}\)/.test(appSrc));

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

  const actions = (calls) => calls.map((c) => c.action);
  const tick = () => new Promise((r) => setTimeout(r, 20));
  async function openSettings(ctx) {
    ctx.document.querySelector('#settingsBtn').dispatchEvent(new ctx.window.Event('click', { bubbles: true }));
    await tick();
  }
  async function submitForm(ctx) {
    const form = ctx.document.querySelector('.settings-modal form');
    form.dispatchEvent(new ctx.window.Event('submit', { bubbles: true, cancelable: true }));
    await tick();
  }

  // 用例 1：关于分区渲染
  {
    const ctx = buildWindow();
    await openSettings(ctx);
    const doc = ctx.document;

    const navAbout = doc.querySelector('.set-nav-item[data-target="#set-sec-about"]');
    check('设置左侧导航含「关于」项', !!navAbout, navAbout ? navAbout.textContent : 'missing');
    check('关于导航文案为「关于」', navAbout && navAbout.textContent.trim() === '关于');

    const sec = doc.querySelector('#set-sec-about');
    check('右侧存在 #set-sec-about 分区', !!sec);
    check('关于分区标题为「关于」', sec && sec.querySelector('.set-sec-title') && sec.querySelector('.set-sec-title').textContent.trim() === '关于');
    check('关于分区展示站点标题 Free-Panel', sec && sec.textContent.includes('Free-Panel'));
    check('关于分区展示副标题「更加自由的导航页」', sec && sec.textContent.includes('更加自由的导航页'));
    check('关于分区展示版本号 v1.4.0', sec && sec.textContent.includes('v1.4.0'));
    check('关于分区展示技术栈 PHP + SQLite', sec && sec.textContent.includes('PHP + SQLite'));
    check('关于分区展示新简介文案', sec && sec.textContent.includes('Free-Panel 更加自由的私有化部署导航页面'));
    check('关于分区简介提及三模式地址', sec && sec.textContent.includes('默认 / 内网 / IPv6 三模式地址'));
    check('关于分区简介提及右键菜单与个性化设置', sec && sec.textContent.includes('右键菜单与个性化设置'));
    const gh = sec ? sec.querySelector('a[href="https://github.com/yaobus/Free-Panel"]') : null;
    check('关于分区存在 GitHub 图标链接', !!gh, gh ? gh.getAttribute('href') : 'missing');
    check('GitHub 链接新窗口打开', gh && gh.getAttribute('target') === '_blank');
    check('GitHub 链接不含文字（仅图标）', gh && !gh.textContent.trim());
    check('GitHub 链接内嵌 SVG 图标', gh && !!gh.querySelector('svg'));
    check('GitHub 链接带可访问标签', gh && !!(gh.getAttribute('aria-label') || gh.getAttribute('title')));
    check('关于分区不含备案信息 1', sec && !sec.textContent.includes('京ICP备'));
    check('关于分区不含备案信息 2', sec && !sec.textContent.includes('京公网安备'));
    check('关于分区不含「本系统仅限局域网内部使用」', sec && !sec.textContent.includes('本系统仅限局域网内部使用'));
    check('关于分区展示版权年份', sec && /\d{4}/.test(sec.textContent));
    check('关于分区不含表单字段', sec && !sec.querySelector('input, select, textarea'));
  }

  // 用例 2：提交时请求体不含关于字段与 version（version 只读展示不保存）
  {
    const ctx = buildWindow();
    await openSettings(ctx);
    await submitForm(ctx);
    const save = ctx.apiCalls.find((c) => c.action === 'save_settings');
    check('提交调用了 save_settings', !!save);
    const keys = save ? Object.keys(save) : [];
    check('save_settings 请求体不含 about 字段', keys.every((k) => !/about/i.test(k)));
    check('save_settings 请求体不含 version', !keys.includes('version'));
    check('请求序列以 get_settings 开头', actions(ctx.apiCalls)[0] === 'get_settings');
  }

  // 用例 3：get_settings 缺失字段时兜底展示默认值
  {
    const ctx = buildWindow({ version: undefined, site_title: undefined });
    await openSettings(ctx);
    const sec = ctx.document.querySelector('#set-sec-about');
    check('version 缺失时兜底展示 v1.0.0', sec && sec.textContent.includes('v1.0.0'));
    const aboutTitle = sec && sec.querySelector('.about-title');
    check('site_title 缺失时主标题兜底展示「Free-Panel」（拆主+副两行后仅主标题）',
      aboutTitle && aboutTitle.textContent.trim() === 'Free-Panel');
    check('site_subtitle 独立展示「更加自由的导航页」于 .about-sub',
      sec && sec.querySelector('.about-sub') && sec.querySelector('.about-sub').textContent.trim() === '更加自由的导航页');
  }

  const passed = results.filter(Boolean).length;
  console.log('\n' + passed + '/' + results.length + ' passed');
  process.exit(passed === results.length ? 0 : 1);
})().catch((e) => { console.error('ERROR:', e); process.exit(1); });
