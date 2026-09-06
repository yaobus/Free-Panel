/* ============================================================
   Free-Panel 搜索引擎配置落库测试（happy-dom）
   验证引擎列表（name/url/icon）持久化到数据库 settings.engines：
   - DB 有配置 → 优先使用 DB（body data-engines 注入）
   - DB 空 + localStorage 有旧数据（未迁移）→ 一次性迁移并调 API 落库
   - DB 空 + localStorage 空 + 未迁移 → 内置默认 5 个引擎
   - DB 空 + 已迁移 → 尊重用户清空（空列表）
   - 添加/编辑/删除引擎 → 调 api.php save_settings 落库
   - activeIdx 从 localStorage 兜底
   运行: node tests/engine-db.test.js tests/idx-search.html
   ============================================================ */
const fs = require('fs');
const path = require('path');
const { Window } = require('happy-dom');

(async () => {
  const htmlPath = process.argv[2] || 'tests/idx-search.html';
  const base = fs.readFileSync(htmlPath, 'utf8');
  const appJs = fs.readFileSync(path.join(__dirname, '../assets/app.js'), 'utf8');

  // 注入 body data-engines（DB 配置）
  function injectEngines(html, arrJson) {
    return html.replace(/<body[^>]*>/, `<body data-engines='${arrJson}'>`);
  }

  function buildWindow(htmlContent) {
    const window = new Window({ url: 'http://127.0.0.1:8123/index.php', width: 1280, height: 900 });
    const { document } = window;
    document.write(htmlContent);
    document.close();
    // fetch mock：记录 api.php 调用，返回成功
    const calls = [];
    window.fetch = async (url, opts) => {
      calls.push(JSON.parse(opts.body));
      return { ok: true, json: async () => ({ ok: true }) };
    };
    window.eval(appJs);
    return { window, document, calls };
  }

  const results = [];
  function check(name, cond, detail) {
    results.push(!!cond);
    console.log((cond ? 'PASS' : 'FAIL') + '  ' + name + (detail !== undefined ? '  [' + detail + ']' : ''));
  }
  const engineItems = (doc) => Array.from(doc.querySelectorAll('.engine-item'));
  const engineNames = (doc) => engineItems(doc).map((b) => b.querySelector('.e-name').textContent);

  const DB_ONE = JSON.stringify([{ name: 'Bing', url: 'https://www.bing.com/search?q={q}', icon: '🅱' }]);
  const LS_TWO = JSON.stringify([
    { name: '自定A', url: 'http://a.test/s?q={q}', icon: 'A' },
    { name: '自定B', url: 'http://b.test/s?q={q}', icon: 'B' },
  ]);

  // ============ S1: DB 有配置 → 优先使用 DB，且初始化不落库 ============
  {
    const html = injectEngines(base, DB_ONE);
    const { document, calls } = buildWindow(html);
    check('S1: 引擎列表使用 DB 配置（1 项 Bing）', engineNames(document).join() === 'Bing',
      'names=' + engineNames(document).join(','));
    check('S1: 引擎按钮显示 Bing', document.querySelector('#engineName').textContent === 'Bing',
      'text=' + document.querySelector('#engineName').textContent);
    check('S1: 初始化不触发落库 API', calls.length === 0, 'calls=' + calls.length);
  }

  // ============ S2: DB 空 + localStorage 有旧数据（未迁移）→ 迁移并落库 ============
  {
    const w = new Window({ url: 'http://127.0.0.1:8123/index.php', width: 1280, height: 900 });
    w.document.write(base);
    w.document.close();
    w.localStorage.setItem('sunnav-engines', LS_TWO);
    const calls = [];
    w.fetch = async (url, opts) => {
      calls.push(JSON.parse(opts.body));
      return { ok: true, json: async () => ({ ok: true }) };
    };
    w.eval(appJs);
    check('S2: 迁移使用 localStorage 自定义引擎（2 项）', engineNames(w.document).join('|') === '自定A|自定B',
      'names=' + engineNames(w.document).join('|'));
    check('S2: 迁移时调用一次 save_settings 落库', calls.length === 1 && calls[0].action === 'save_settings',
      'calls=' + calls.length + ' action=' + (calls[0] && calls[0].action));
    check('S2: 落库内容为 localStorage 引擎列表', calls.length === 1 && JSON.parse(calls[0].engines).length === 2
      && JSON.parse(calls[0].engines)[0].name === '自定A',
      'engines=' + (calls[0] ? calls[0].engines : ''));
    check('S2: 迁移标记已置位', w.localStorage.getItem('sunnav-engines-migrated') === '1',
      'flag=' + w.localStorage.getItem('sunnav-engines-migrated'));
  }

  // ============ S3: 全空（DB 空 + localStorage 空）→ 内置默认 5 个 ============
  {
    const { document, calls } = buildWindow(base);
    const names = engineNames(document);
    check('S3: 默认引擎 5 个', names.length === 5, 'n=' + names.length);
    check('S3: 含 Google / 百度 / 知乎', names.includes('Google') && names.includes('百度') && names.includes('知乎'),
      'names=' + names.join(','));
    check('S3: 不触发落库', calls.length === 0, 'calls=' + calls.length);
  }

  // ============ S4: DB 空 + 已迁移 → 尊重清空（空列表占位） ============
  {
    const w = new Window({ url: 'http://127.0.0.1:8123/index.php', width: 1280, height: 900 });
    w.document.write(base);
    w.document.close();
    w.localStorage.setItem('sunnav-engines', LS_TWO); // 旧缓存残留
    w.localStorage.setItem('sunnav-engines-migrated', '1'); // 但已迁移过（之后用户清空）
    const calls = [];
    w.fetch = async (url, opts) => {
      calls.push(JSON.parse(opts.body));
      return { ok: true, json: async () => ({ ok: true }) };
    };
    w.eval(appJs);
    check('S4: 已迁移且 DB 空 → 空引擎列表', engineItems(w.document).length === 0, 'n=' + engineItems(w.document).length);
    check('S4: 引擎按钮显示占位「搜索引擎」', w.document.querySelector('#engineName').textContent === '搜索引擎',
      'text=' + w.document.querySelector('#engineName').textContent);
    check('S4: 不再从残留缓存迁移', calls.length === 0, 'calls=' + calls.length);
  }

  // ============ S5: 添加引擎 → 落库 API 调用 + modal 关闭 ============
  {
    const html = injectEngines(base, DB_ONE);
    const { window, document, calls } = buildWindow(html);
    document.querySelector('#engineAddBtn').click();
    const ov = document.querySelector('.modal-overlay');
    check('S5: 添加弹窗已打开', !!ov, 'ov=' + !!ov);
    const nameInput = ov.querySelector('input[name="name"]');
    const urlInput = ov.querySelector('input[name="url"]');
    nameInput.value = '知乎';
    urlInput.value = 'https://www.zhihu.com/search?type=content&q={q}';
    ov.querySelector('form').dispatchEvent(new window.Event('submit', { bubbles: true, cancelable: true }));
    const last = calls[calls.length - 1];
    const saved = last ? JSON.parse(last.engines) : [];
    check('S5: 保存调用 save_settings', last && last.action === 'save_settings', 'action=' + (last && last.action));
    check('S5: 落库引擎列表 2 项且含新引擎', saved.length === 2 && saved[1].name === '知乎',
      'n=' + saved.length + ' names=' + saved.map((e) => e.name).join(','));
    check('S5: 新引擎为当前激活', document.querySelector('#engineName').textContent === '知乎',
      'text=' + document.querySelector('#engineName').textContent);
    check('S5: 保存后弹窗关闭', !document.querySelector('.modal-overlay'), '');
  }

  // ============ S6: 添加引擎 URL 不含 {q} → 拒绝且不落库 ============
  {
    const html = injectEngines(base, DB_ONE);
    const { window, document, calls } = buildWindow(html);
    document.querySelector('#engineAddBtn').click();
    const ov = document.querySelector('.modal-overlay');
    ov.querySelector('input[name="name"]').value = '坏地址';
    ov.querySelector('input[name="url"]').value = 'https://example.com/no-placeholder';
    ov.querySelector('form').dispatchEvent(new window.Event('submit', { bubbles: true, cancelable: true }));
    check('S6: 无 {q} 占位符 → 不落库', calls.length === 0, 'calls=' + calls.length);
    check('S6: 弹窗保持打开', !!document.querySelector('.modal-overlay'), '');
  }

  // ============ S7: activeIdx 从 localStorage 兜底 ============
  {
    const html = injectEngines(base, DB_ONE);
    const w = new Window({ url: 'http://127.0.0.1:8123/index.php', width: 1280, height: 900 });
    w.document.write(html);
    w.document.close();
    w.localStorage.setItem('sunnav-engine-idx', '0');
    const calls = [];
    w.fetch = async (url, opts) => {
      calls.push(JSON.parse(opts.body));
      return { ok: true, json: async () => ({ ok: true }) };
    };
    w.eval(appJs);
    check('S7: 单引擎时 activeIdx 兜底为 0，按钮显示 Bing', w.document.querySelector('#engineName').textContent === 'Bing',
      'text=' + w.document.querySelector('#engineName').textContent);
  }

  const passed = results.filter(Boolean).length;
  console.log(`\n===== 结果: ${passed}/${results.length} 通过 =====`);
  process.exit(passed === results.length ? 0 : 1);
})();
