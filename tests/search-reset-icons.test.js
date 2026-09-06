/* ============================================================
   Sun-Nav 搜索框自动复位 + 图标字段「浏览图标库」测试
   （无第三方依赖：纯源码静态断言 + 轻量 DOM 行为模拟）

   需求 A：设置开启「互联网搜索」时，回车联网搜索后自动清空搜索框
     （否则本地过滤会把无匹配关键词的所有卡片隐藏，用户从结果页
       返回主页会看到空白）。设置项：搜索栏设置 -> 自动复位搜索框。
   需求 B：所有 type:'icon' 字段（收藏图标/站点图标/网站LOGO/分组
     图标）的 label 后增加外链按钮「浏览图标库」指向
     https://icon-sets.iconify.design/

   覆盖：
     A. 服务端 search_reset 设置全链路（config/db/index/api）
     B. 前端复位逻辑 + checkbox hint + icon 字段外链
     C. 行为语义模拟：无关关键词过滤全隐藏 -> 复位后全恢复
  运行: node tests/search-reset-icons.test.js
   ============================================================ */
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const results = [];
function check(name, cond, detail) {
  results.push(!!cond);
  console.log((cond ? 'PASS' : 'FAIL') + '  ' + name + (detail !== undefined ? '  [' + detail + ']' : ''));
}

const appJs = fs.readFileSync(path.join(ROOT, 'assets/app.js'), 'utf8');
const apiPhp = fs.readFileSync(path.join(ROOT, 'api.php'), 'utf8');
const cfgPhp = fs.readFileSync(path.join(ROOT, 'config.php'), 'utf8');
const dbPhp = fs.readFileSync(path.join(ROOT, 'db.php'), 'utf8');
const idxPhp = fs.readFileSync(path.join(ROOT, 'index.php'), 'utf8');
const css = fs.readFileSync(path.join(ROOT, 'assets/style.css'), 'utf8');

/* ============ A. 服务端设置全链路 ============ */
console.log('---- A. 服务端 search_reset 全链路 ----');
check('config.php 定义 DEFAULT_SEARCH_RESET=1', /define\('DEFAULT_SEARCH_RESET',\s*'1'\)/.test(cfgPhp));
check('db.php init_db 种子含 search_reset', /'search_reset'\s*=>\s*DEFAULT_SEARCH_RESET,/.test(dbPhp));
check('index.php 读取 search_reset 设置', /\$searchReset\s*=\s*setting\('search_reset',\s*DEFAULT_SEARCH_RESET\)\s*===\s*'1';/.test(idxPhp));
check('index.php body 注入 data-search-reset', /data-search-reset=/.test(idxPhp));
check('api.php $keys 白名单含 search_reset', /'search_web',\s*'search_reset',\s*'search_hint'/.test(apiPhp));
check('api.php 值清洗 fn 含 search_reset', /'search_reset'\s*=>\s*fn\(\$v\)/.test(apiPhp));

/* ============ B. 前端行为静态断言 ============ */
console.log('---- B. 前端复位逻辑 + 浏览图标库 ----');
check('app.js 存在 SEARCH_RESET 常量', /const\s+SEARCH_RESET\s*=\s*document\.body\.dataset\.searchReset\s*!==\s*'0'/.test(appJs));
// 联网搜索分支：window.open 之后内联清空，而非调用 clearSearch（避免抢回焦点）
check('回车联网搜索后内联复位（value=""+applyFilter("")）', /if \(SEARCH_RESET\) \{\s*search\.value = '';\s*applyFilter\(''\);\s*\}/.test(appJs));
check('复位不调用 clearSearch（不让 search.focus() 抢焦点）', !/if \(SEARCH_RESET\)\s*clearSearch\(\)/.test(appJs) && !/SEARCH_RESET[^{}]*\}[^}]*search\.focus\(\)/.test(appJs));
check('复位块前确实打开新标签页（window.open 引擎结果页）', /window\.open\(eng\.url\.replace\(\/\\\{q\\\}\/g,\s*encodeURIComponent\(kw\)\),\s*'_blank',\s*'noopener'\);/.test(appJs));

// 图标字段统一分支：label 后附加「浏览图标库」外链
check('icon 字段 label 后含「浏览图标库」外链', /form-row icon-form-row"><span>\$\{f\.label\}<a class="browse-icons-link"/.test(appJs));
check('外链 href/target/rel 正确', /href="https:\/\/icon-sets\.iconify\.design\/"[\s\S]*?target="_blank"[\s\S]*?rel="noopener noreferrer"/.test(appJs));
check('外链可见文本「浏览图标库」', /浏览图标库<\/a>/.test(appJs));
// icon 分支由所有 type:'icon' 字段共用 -> 一处修改即对收藏/站点图标/LOGO/分组生效
const iconFieldCount = (appJs.match(/type:\s*'icon'/g) || []).length;
check('字段定义含 type:icon（收藏/引擎/LOGO/分组等多处）', iconFieldCount >= 3, 'count=' + iconFieldCount);

// checkbox hint 支持（为开关的说明文字准备）
check('checkbox 分支包 .check-wrap 且支持 .check-hint hint', /<div class="check-wrap">[\s\S]*?<span class="hint check-hint">\$\{f\.hint\}/.test(appJs));

// 设置面板搜索栏设置项
check('设置面板含 search_reset 开关', /name: 'search_reset', label: '自动复位搜索框/.test(appJs));
check('设置开关用 !== \'0\' 兜底默认勾选', /value: s\.search_reset !== '0'/.test(appJs));
check('设置开关带 hint 说明', /name: 'search_reset',[^{]*hint: '关闭后回车搜索会保留关键词/.test(appJs));

// 样式
check('style.css 含 .check-wrap 样式', /\.check-wrap\s*\{/.test(css));
check('style.css 含 .browse-icons-link 及暗色适配', /\.browse-icons-link\s*\{/.test(css) && /html\[data-theme="dark"\]\s+\.browse-icons-link\s*\{/.test(css));

/* ============ C. 行为语义模拟 ============ */
console.log('---- C. 复位行为语义 ----');
// 从 app.js 抠出真正的复位三行逻辑文本，逐条断言其语义正确
const resetBlock = /if \(SEARCH_RESET\) \{\s*(search\.value = '';\s*applyFilter\(''\);?)\s*\}/.exec(appJs);
if (resetBlock) {
  const body = resetBlock[1];
  check('复位块先清空 search.value', /search\.value = '';/.test(body));
  check('复位块随后以空串调 applyFilter 重置过滤', /applyFilter\(''\)/.test(body));
  check('复位块只含这两步（无副作用）', /^search\.value = '';\s*applyFilter\(''\);?$/.test(body.trim()), 'body=' + JSON.stringify(body.trim()));
} else {
  check('复位块结构正确', false, '未抠到复位块');
}

// 语义模拟：无关关键词过滤让卡片全隐藏，空串复位后全部恢复
function simApplyFilter(cards, kw) {
  kw = (kw || '').trim().toLowerCase();
  let shown = 0;
  cards.forEach((c) => {
    const hit = kw === '' || c.txt.includes(kw);
    c.hidden = !hit;
    if (hit) shown++;
  });
  return shown;
}
const cards = [{ txt: 'git github' }, { txt: 'docs 文档' }];
const filteredVisible = simApplyFilter(cards, 'no-match-xyz');
check('无关关键词过滤后卡片全隐藏', filteredVisible === 0, 'visible=' + filteredVisible);
const resetVisible = simApplyFilter(cards, '');   // 对应复位后的 applyFilter('')
check('复位后空串过滤 -> 卡片全部可见', resetVisible === 2, 'visible=' + resetVisible);

const pass = results.filter(Boolean).length;
console.log(`\n=== ${pass}/${results.length} 通过 ===`);
process.exit(pass === results.length ? 0 : 1);
