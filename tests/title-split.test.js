/* ============================================================
   Free-Panel 站点标题拆分为「主+副」两行布局测试
   需求（参考图1/图2）：
     - 登录页（图1）：大号主标题「Free-Panel」+ 灰色小字副标题「更加自由的导航页」垂直两行布局
     - 主页（图2）：顶栏小 LOGO + 主标题「Free-Panel」+ 副标题「更加自由的导航页」两行布局
     - 配置拆开：site_title=Free-Panel、site_subtitle=更加自由的导航页（不再合并为一个串）
   覆盖：
     Part A（静态断言）：
       - config.php DEFAULT_SITE_TITLE 为 'Free-Panel'（拆开，不再含副标题串）
       - config.php DEFAULT_SITE_SUBTITLE 为 '更加自由的导航页'（拆开，非空）
       - login.php 登录卡片渲染拆开的标题（h1.login-title 含站点名，p.login-sub 含副标题）
       - login.php 不再含合并串渲染到 .login-title
       - index.php 主页 .brand-name / .brand-sub 站点名/副标题分两行（已是 flex column）
       - style.css .login-title 字号 22px（用户回归指定：font-weight 800 + letter-spacing .5px，原 28px 调小）
       - style.css .login-sub 显示（非空时不隐藏）
       - 主页 LOGO 维持 34px / 登录页 LOGO 维持 104px（回归保护）
       - 副标题空值时仍能隐藏（条件渲染回归保护）
   运行: node tests/title-split.test.js
   ============================================================ */
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const results = [];
function check(name, cond, detail) {
  results.push(!!cond);
  console.log((cond ? 'PASS' : 'FAIL') + '  ' + name + (detail !== undefined ? '  [' + detail + ']' : ''));
}

const configSrc = fs.readFileSync(path.join(ROOT, 'config.php'), 'utf8');
const loginSrc  = fs.readFileSync(path.join(ROOT, 'login.php'), 'utf8');
const indexSrc  = fs.readFileSync(path.join(ROOT, 'index.php'), 'utf8');
const cssSrc    = fs.readFileSync(path.join(ROOT, 'assets/style.css'), 'utf8');

/* ================= config.php：标题/副标题拆开 ================= */
check('config.php DEFAULT_SITE_TITLE 已拆为纯主标题「Free-Panel」',
  /define\(\s*'DEFAULT_SITE_TITLE'\s*,\s*'Free-Panel'\s*\)/.test(configSrc));
check('config.php DEFAULT_SITE_TITLE 不再含副标题串',
  !/define\(\s*'DEFAULT_SITE_TITLE'\s*,\s*'Free-Panel[^']*更加自由的导航页[^']*'\s*\)/.test(configSrc));
check('config.php DEFAULT_SITE_SUBTITLE 已填「更加自由的导航页」（非空）',
  /define\(\s*'DEFAULT_SITE_SUBTITLE'\s*,\s*'更加自由的导航页'\s*\)/.test(configSrc));

/* ================= login.php：登录卡片渲染拆开的标题 ================= */
const loginTitleLine = loginSrc.split('\n').find((l) => l.includes('class="login-title"'));
check('login.php 登录卡片标题元素存在', !!loginTitleLine, loginTitleLine ? loginTitleLine.trim() : 'missing');
check('login.php 标题改为单独渲染站点名（不含合并串）',
  /class="login-title">\s*<\?=\s*e\(\s*\$title\s*\)\s*\?>\s*<\/h1>/.test(loginTitleLine));
check('login.php 副标题在标题下方独立渲染（p.login-sub）',
  /if \(setting\('site_subtitle', DEFAULT_SITE_SUBTITLE\) !== ''\):[\s\S]*?class="login-sub"/.test(loginSrc) && /<\/p>/.test(loginSrc));
check('login.php 不再含「Free-Panel · 更加自由的导航页」合并串硬编码',
  !loginSrc.includes('Free-Panel · 更加自由的导航页'));

/* ================= index.php：主页顶栏两行布局 ================= */
check('index.php 顶栏 .brand-name 渲染站点名（拆开后仅主标题）',
  /class="brand-name">\s*<\?=\s*e\(\s*\$title\s*\)\s*\?>\s*<\/span>/.test(indexSrc));
check('index.php 顶栏 .brand-sub 渲染副标题（条件渲染）',
  /if \(\$subtitle !== ''\):\s*\?><span class="brand-sub">\s*<\?=\s*e\(\s*\$subtitle\s*\)\s*\?>\s*<\/span>/.test(indexSrc));
check('index.php 不再含「Free-Panel · 更加自由的导航页」合并串硬编码到顶栏',
  !indexSrc.includes('Free-Panel · 更加自由的导航页'));
check('index.php .brand-text 维持 flex-column 两行布局（保留容器，不合并到 brand-name）',
  /\.brand-text\s*\{[^}]*flex-direction\s*:\s*column/.test(cssSrc));

/* ================= style.css：登录页字号与显示调整 ================= */
const loginTitleRule = cssSrc.match(/\.login-title\s*\{([^}]*)\}/);
check('style.css .login-title 规则存在', !!loginTitleRule);
check('login-title 字号为 22px（用户回归指定：font-size 22px）',
  loginTitleRule && /font-size\s*:\s*22px/.test(loginTitleRule[1]));
check('login-title 字重保持粗体（800）', loginTitleRule && /font-weight\s*:\s*800/.test(loginTitleRule[1]));
check('login-title 字距为 .5px（用户回归指定）', loginTitleRule && /letter-spacing\s*:\s*\.5px/.test(loginTitleRule[1]));
check('style.css .login-sub 仍允许显示（非 display:none 强制隐藏）',
  !/\.login-sub\s*\{[^}]*display\s*:\s*none/.test(cssSrc));

/* ================= 回归：LOGO 尺寸政策不变 ================= */
check('login.php logo_markup 调用尺寸仍为 104（2 倍基线保持）',
  /logo_markup\(\$siteLogo,\s*104\)/.test(loginSrc));
check('login.php 空值回退默认 SVG 尺寸仍为 104',
  /<svg viewBox="0 0 48 48" width="104" height="104"/.test(loginSrc));
check('index.php logo_markup 仍调 34（主页 LOGO 不变）',
  /logo_markup\(\$siteLogo,\s*34\)/.test(indexSrc));
check('index.php 空值回退默认 SVG 尺寸仍为 34',
  /<svg viewBox="0 0 48 48" width="34" height="34"/.test(indexSrc));

/* ================= 回归：副标题空值时仍能条件隐藏 ================= */
check('login.php 副标题非空时条件渲染（避免为空渲染出空元素）',
  /if \(setting\('site_subtitle', DEFAULT_SITE_SUBTITLE\) !== ''\):[\s\S]*?login-sub/.test(loginSrc));
check('index.php 副标题空值时隐藏 .brand-sub',
  /if \(\$subtitle !== ''\):[\s\S]*?brand-sub/.test(indexSrc));

/* ================= 汇总 ================= */
const pass = results.filter(Boolean).length;
const fail = results.length - pass;
console.log('----------------------------------------');
console.log('title-split: ' + pass + '/' + results.length + ' passed' + (fail ? ' (' + fail + ' FAILED)' : ''));
process.exit(fail ? 1 : 0);
