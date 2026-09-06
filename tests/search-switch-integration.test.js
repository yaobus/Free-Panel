/* ============================================================
   Free-Panel 搜索栏开关集成测试（happy-dom）
   加载真实主页 HTML + app.js，验证 4 个搜索栏设置项：
   - 隐藏搜索栏（body.searchbar-hidden）
   - 本地搜索开关（data-search-local）：输入是否过滤收藏夹
   - 互联网搜索开关（data-search-web）：回车是否调用搜索引擎
   - 搜索提示文本（placeholder 由服务端渲染，此处仅断言 DOM 存在性）
   运行: node tests/search-switch-integration.test.js tests/idx-search.html
   ============================================================ */
const fs = require('fs');
const path = require('path');
const { Window } = require('happy-dom');

(async () => {
  const htmlPath = process.argv[2] || 'tests/idx-search.html';
  const html = fs.readFileSync(htmlPath, 'utf8');
  const appJs = fs.readFileSync(path.join(__dirname, '../assets/app.js'), 'utf8');

  function buildWindow(htmlContent) {
    const window = new Window({ url: 'http://127.0.0.1:8123/index.php', width: 1280, height: 900 });
    const { document } = window;
    document.write(htmlContent);
    document.close();
    // 拦截 window.open 与 fetch，记录调用
    const openCalls = [];
    window.open = (url, target) => { openCalls.push({ url, target }); return null; };
    window.fetch = async () => ({ ok: true, json: async () => ({ ok: true }) });
    window.eval(appJs);
    return { window, document, openCalls };
  }

  const results = [];
  function check(name, cond, detail) {
    results.push(!!cond);
    console.log((cond ? 'PASS' : 'FAIL') + '  ' + name + (detail !== undefined ? '  [' + detail + ']' : ''));
  }
  const cards = (doc) => Array.from(doc.querySelectorAll('.card'));
  const hiddenCards = (doc) => cards(doc).filter((c) => c.style.display === 'none').length;
  const visibleGroups = (doc) => Array.from(doc.querySelectorAll('.group')).filter((g) => g.style.display !== 'none').length;
  function typeInto(input, win, kw) {
    input.value = kw;
    input.dispatchEvent(new win.Event('input', { bubbles: true }));
  }
  function pressEnter(input, win) {
    const ev = new win.KeyboardEvent('keydown', { bubbles: true, cancelable: true });
    Object.defineProperty(ev, 'key', { value: 'Enter' });
    input.dispatchEvent(ev);
  }

  // ============ 场景 A：默认（local=1, web=1, hint=1, show=1） ============
  let { window, document, openCalls } = buildWindow(html);
  const search = document.querySelector('#search');

  check('A1: body data-search-local=1', document.body.dataset.searchLocal === '1', document.body.dataset.searchLocal);
  check('A2: body data-search-web=1', document.body.dataset.searchWeb === '1', document.body.dataset.searchWeb);
  check('A3: 无 searchbar-hidden（搜索栏显示）', !document.body.classList.contains('searchbar-hidden'), '');
  check('A4: 搜索框存在', !!search, '');
  check('A5: 8 张卡片初始全部可见', hiddenCards(document) === 0, 'hidden=' + hiddenCards(document));

  typeInto(search, window, '路由器');
  check('A6: 本地过滤生效（7 张隐藏）', hiddenCards(document) === 7, 'hidden=' + hiddenCards(document));
  check('A7: 过滤后仅 1 个分组可见', visibleGroups(document) === 1, 'groups=' + visibleGroups(document));

  typeInto(search, window, '');
  check('A8: 清空后全部恢复显示', hiddenCards(document) === 0, 'hidden=' + hiddenCards(document));

  typeInto(search, window, 'test');
  pressEnter(search, window);
  check('A9: web=1 回车调用 window.open', openCalls.length === 1, 'calls=' + openCalls.length);
  check('A10: 打开的地址为搜索引擎 URL 且编码关键词',
    openCalls.length === 1 && openCalls[0].url.includes('/search') && openCalls[0].url.includes('test'),
    openCalls.length ? openCalls[0].url : '');

  // ============ 场景 B：关闭本地搜索 + 关闭互联网搜索 ============
  const htmlOff = html
    .replace('data-search-local="1"', 'data-search-local="0"')
    .replace('data-search-web="1"', 'data-search-web="0"');
  ({ window, document, openCalls } = buildWindow(htmlOff));
  const searchB = document.querySelector('#search');

  check('B1: body data-search-local=0', document.body.dataset.searchLocal === '0', document.body.dataset.searchLocal);
  typeInto(searchB, window, '路由器');
  check('B2: local=0 输入不过滤（卡片全显）', hiddenCards(document) === 0, 'hidden=' + hiddenCards(document));
  check('B3: local=0 分组全显', visibleGroups(document) === 3, 'groups=' + visibleGroups(document));

  typeInto(searchB, window, 'test');
  pressEnter(searchB, window);
  check('B4: web=0 回车不打开任何地址', openCalls.length === 0, 'calls=' + openCalls.length);

  // ============ 场景 C：隐藏搜索栏（show=0 → searchbar-hidden） ============
  const htmlHidden = html.replace('class="bg-default"', 'class="bg-default searchbar-hidden"');
  ({ window, document } = buildWindow(htmlHidden));
  check('C1: searchbar-hidden 存在', document.body.classList.contains('searchbar-hidden'), '');
  check('C2: 搜索框仍在 DOM（CSS 隐藏而非移除）', !!document.querySelector('#search'), '');

  const pass = results.filter(Boolean).length;
  console.log(`\n${pass}/${results.length} 通过`);
  process.exit(pass === results.length ? 0 : 1);
})();
