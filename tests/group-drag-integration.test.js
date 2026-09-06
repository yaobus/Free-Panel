/* ============================================================
   Free-Panel 分组拖拽集成测试（happy-dom）
   加载真实主页 HTML + app.js，模拟完整指针事件链，
   验证：无原生 DnD / 占位格 / DOM 重排不刷新 / API 提交 / 侧栏同步 / FLIP 动画
   运行: node tests/group-drag-integration.test.js
   ============================================================ */
const fs = require('fs');
const path = require('path');
const { Window } = require('happy-dom');

(async () => {
  const htmlPath = process.argv[2] || '/tmp/idx-real.html';
  const html = fs.readFileSync(htmlPath, 'utf8');
  const appJs = fs.readFileSync(path.join(__dirname, '../assets/app.js'), 'utf8');

  const window = new Window({ url: 'http://127.0.0.1:8123/index.php', width: 1280, height: 900 });
  const { document } = window;
  document.write(html);
  document.close();

  // ---- 收集未捕获异常：FLIP 定时器在拖拽结束后 360ms 才触发，若回调引用已置 null 的 gdState 会抛错 ----
  const uncaught = [];
  process.on('uncaughtException', (e) => { uncaught.push(String(e && e.message || e)); });
  process.on('unhandledRejection', (e) => { uncaught.push('rej:' + String(e && e.message || e)); });

  // ---- mock fetch：记录 API 调用 ----
  const apiCalls = [];
  window.fetch = async (url, opts) => {
    const body = JSON.parse(opts.body);
    apiCalls.push(body);
    return { ok: true, json: async () => ({ ok: true }) };
  };

  // ---- mock location.reload：记录是否触发整页刷新 ----
  let reloadCalls = 0;
  try { window.location.reload = () => { reloadCalls++; }; } catch (_) { /* 忽略 */ }

  // ---- mock getBoundingClientRect ----
  // 分组按 DOM 顺序纵向排布（每块高 180、间隔 20）；fixed 元素返回 style 中的视觉位置
  const origGBCR = window.Element.prototype.getBoundingClientRect;
  window.Element.prototype.getBoundingClientRect = function () {
    const cls = typeof this.className === 'string' ? this.className : '';
    // fixed 定位（拖拽中的卡片/分组）：视觉位置来自内联 style
    if (this.style && this.style.position === 'fixed') {
      const t = parseFloat(this.style.top) || 0;
      const l = parseFloat(this.style.left) || 0;
      const w = parseFloat(this.style.width) || 800;
      const h = parseFloat(this.style.height) || 180;
      return { left: l, top: t, width: w, height: h, right: l + w, bottom: t + h };
    }
    if (cls.includes('group') && !cls.includes('group-head') && !cls.includes('side')) {
      // 与真实渲染一致：fixed 定位的元素脱离文档流，不参与兄弟索引（占位格参与，模拟推挤）
      const siblings = Array.from(this.parentElement.children)
        .filter((c) => !(c.style && c.style.position === 'fixed'));
      const idx = siblings.indexOf(this);
      return { left: 0, top: idx * 200, width: 800, height: 180, right: 800, bottom: idx * 200 + 180 };
    }
    return { left: 0, top: 0, width: 0, height: 0, right: 0, bottom: 0 };
  };

  // ---- 执行 app.js ----
  window.eval(appJs);

  // ---- 事件派发辅助 ----
  // target 默认 document；pointerdown 必须派发到分组头元素上，
  // 否则 e.target 是 document，closest('.group-head') 无法命中（document 无 closest 方法）
  function fire(type, x, y, button, target) {
    const ev = new window.Event(type, { bubbles: true, cancelable: true });
    Object.defineProperty(ev, 'clientX', { value: x });
    Object.defineProperty(ev, 'clientY', { value: y });
    Object.defineProperty(ev, 'button', { value: button === undefined ? 0 : button });
    if (type === 'keydown') Object.defineProperty(ev, 'key', { value: 'Escape' });
    (target || document).dispatchEvent(ev);
  }

  const results = [];
  function check(name, cond, detail) {
    results.push(!!cond);
    console.log((cond ? 'PASS' : 'FAIL') + '  ' + name + (detail !== undefined ? '  [' + detail + ']' : ''));
  }
  const order = () => Array.from(document.querySelectorAll('.main-scroll > .group')).map((g) => g.dataset.group);
  const names = (ids) => ids.map((id) => document.querySelector(`.group[data-group="${id}"] .group-name`).textContent.trim());

  // ---------- 0. 前置检查 ----------
  const groups = Array.from(document.querySelectorAll('.main-scroll > .group'));
  check('前置: 3 个分组', groups.length === 3, 'count=' + groups.length);
  check('前置: 分组无 draggable 属性（无原生 HTML5 DnD）',
    groups.every((g) => !g.hasAttribute('draggable')), '');
  const headAttrs = Array.from(document.querySelectorAll('.main .group-head'))
    .map((h) => h.hasAttribute('draggable'));
  check('前置: group-head 无 draggable 属性',
    headAttrs.length === 3 && headAttrs.every((d) => !d), '');
  check('前置: 初始顺序 g3→g1→g2', JSON.stringify(order()) === JSON.stringify(['3', '1', '2']), names(order()).join(' → '));

  // ---------- 1. 按下分组头（服务器 g3） ----------
  const g3 = document.querySelector('.group[data-group="3"]');
  const head1 = g3.querySelector('.group-head');
  fire('pointerdown', 400, 20, 0, head1);
  check('按下后未立即激活', !g3.classList.contains('dragging'), '');

  // ---------- 2. 小位移（低于阈值 5px，不激活） ----------
  fire('pointermove', 402, 22, 0, head1);
  check('小位移仍不激活', !g3.classList.contains('dragging'), '');

  // ---------- 3. 大位移激活拖拽 ----------
  fire('pointermove', 400, 300, 0, head1);
  check('拖拽激活: 分组带 dragging class', g3.classList.contains('dragging'));
  check('拖拽激活: 分组转 fixed 跟随光标', g3.style.position === 'fixed', 'pos=' + g3.style.position);
  check('拖拽激活: 出现 group-slot 占位格', !!document.querySelector('.main-scroll > .group-slot'));

  // ---------- 4. 移动到末尾（cy=700，越过所有分组中线） ----------
  fire('pointermove', 400, 700, 0, head1);
  const slots = Array.from(document.querySelectorAll('.main-scroll > .group, .main-scroll > .group-slot'));
  const slotIdx = slots.indexOf(document.querySelector('.main-scroll > .group-slot'));
  check('占位格移至末尾（第4个位置）', slotIdx === 3, 'slotIdx=' + slotIdx);

  // ---------- 5. 松手完成拖拽 ----------
  fire('pointerup', 400, 700, 0, head1);
  await new Promise((r) => setTimeout(r, 50)); // 等待 API 微任务

  // ---------- 6. 结果断言 ----------
  const after = order();
  check('DOM 重排: g3 移到末尾', JSON.stringify(after) === JSON.stringify(['1', '2', '3']),
    names(after).join(' → '));
  check('占位格已移除', !document.querySelector('.main-scroll > .group-slot'));
  check('无 dragging class 残留', !document.querySelector('.group.dragging'));
  check('分组样式已还原（非 fixed）',
    document.querySelector('.group[data-group="3"]').style.position !== 'fixed');

  check('调用 reorder_groups API', apiCalls.length === 1 && apiCalls[0].action === 'reorder_groups',
    JSON.stringify(apiCalls.map((c) => c.action)));
  if (apiCalls.length) {
    check('提交的 ids 顺序正确', JSON.stringify(apiCalls[0].ids) === JSON.stringify(['1', '2', '3']),
      JSON.stringify(apiCalls[0].ids));
  }
  check('未整页刷新（reload 未被调用）', reloadCalls === 0, 'reloadCalls=' + reloadCalls);

  const sideOrder = Array.from(document.querySelectorAll('#sideNav .side-inner .side-item'))
    .map((i) => i.dataset.target.replace('#g', ''));
  check('侧栏顺序同步为 1→2→3', JSON.stringify(sideOrder) === JSON.stringify(['1', '2', '3']),
    '侧栏: ' + sideOrder.join(' → '));

  // FLIP 动画验证：让位分组应有过渡样式（360ms 后清理，50ms 时仍在）
  const g1 = document.querySelector('.group[data-group="1"]');
  const g2 = document.querySelector('.group[data-group="2"]');
  const g3now = document.querySelector('.group[data-group="3"]');
  check('FLIP: 让位分组 g1 有平滑过渡', g1.style.transition !== '', 'g1.transition=' + g1.style.transition);
  check('FLIP: 被拖分组 g3 有平滑过渡（从光标处滑入）', g3now.style.transition !== '', 'g3.transition=' + g3now.style.transition);
  check('FLIP: 无残留 transform', !g1.style.transform && !g2.style.transform && !g3now.style.transform,
    'g1.t=' + g1.style.transform + ' g2.t=' + g2.style.transform + ' g3.t=' + g3now.style.transform);

  // FLIP 定时器(FLIP_DURATION+40≈360ms)触发后：回调不得引用已置 null 的 gdState（否则抛 TypeError）
  await new Promise((r) => setTimeout(r, 500));
  check('FLIP 定时器触发后无未捕获异常', uncaught.length === 0, 'uncaught=' + uncaught.join(' | '));

  // ---------- 7. 取消路径：再拖一次然后 Esc 取消 ----------
  fire('pointerdown', 400, 20, 0, head1);
  fire('pointermove', 400, 300, 0, head1);
  check('第二次拖拽激活', document.querySelector('.group[data-group="3"]').classList.contains('dragging'));
  fire('keydown', 400, 300, 0); // Escape（fire 会设置 key='Escape'）
  await new Promise((r) => setTimeout(r, 30));
  check('Esc 取消: 无 dragging 残留', !document.querySelector('.group.dragging'));
  check('Esc 取消: 占位格移除', !document.querySelector('.main-scroll > .group-slot'));
  const afterCancel = order();
  check('Esc 取消: 顺序未变', JSON.stringify(afterCancel) === JSON.stringify(['1', '2', '3']),
    names(afterCancel).join(' → '));
  check('Esc 取消: 未提交新 API', apiCalls.length === 1, 'calls=' + apiCalls.length);

  const failed = results.filter((r) => !r).length;
  console.log('\n结果: ' + (results.length - failed) + '/' + results.length + ' 通过');
  process.exit(failed ? 1 : 0);
})().catch((e) => { console.error('TEST_CRASH:', e); process.exit(1); });
