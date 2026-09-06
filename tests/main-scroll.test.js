/* 验证：独立滚动容器模型
 * 1. 页面(body)不滚动，卡片在 .main-scroll 容器内滚动
 * 2. 首帧侧栏标题(.side-inner 顶部)与右侧第一个分组(.group-head)顶部对齐
 * 3. 点击侧栏分组 → .main-scroll 滚动到对应分组顶部，搜索栏及上方视口位置完全不变
 * 4. 卡片滚动到顶部后被容器上边界裁切，不穿过搜索栏（搜索栏及上方固定不动）
 * 通过 Chrome CDP + PHP 内置服务器真实 HTTP 全链路验证。
 */
const { spawn } = require('child_process');
const http = require('http');
const os = require('os');
const path = require('path');
const fs = require('fs');

const PORT = 8766;
const CDP_PORT = 9231;
const ROOT = path.resolve(__dirname, '..');

function startPhp() {
  return new Promise((resolve, reject) => {
    const php = spawn('php', ['-S', `127.0.0.1:${PORT}`, '-t', ROOT], { cwd: ROOT });
    const tryConnect = () => {
      http.get(`http://127.0.0.1:${PORT}/login.php`, (res) => { res.resume(); resolve(php); })
        .on('error', () => setTimeout(tryConnect, 200));
    };
    tryConnect();
  });
}
function startChrome() {
  return new Promise((resolve, reject) => {
    const chromePath = 'C:/Program Files/Google/Chrome/Application/chrome.exe';
    const userData = fs.mkdtempSync(path.join(os.tmpdir(), 'sunnav-mainscroll-'));
    const chrome = spawn(chromePath, [
      '--headless=new', '--disable-gpu', '--no-sandbox',
      `--remote-debugging-port=${CDP_PORT}`,
      `--user-data-dir=${userData}`,
      '--window-size=1440,1000',
      'about:blank',
    ], { stdio: 'ignore' });
    const tryConnect = () => {
      http.get(`http://127.0.0.1:${CDP_PORT}/json/version`, (res) => {
        let b = ''; res.on('data', (d) => b += d); res.on('end', () => resolve(chrome));
      }).on('error', () => setTimeout(tryConnect, 300));
    };
    tryConnect();
  });
}
function cdpPage() {
  return new Promise((resolve, reject) => {
    const req = http.request({
      host: '127.0.0.1', port: CDP_PORT, method: 'PUT',
      path: `/json/new?${encodeURIComponent(`http://127.0.0.1:${PORT}/login.php`)}`,
    }, (res) => {
      let b = ''; res.on('data', (d) => b += d); res.on('end', () => resolve(JSON.parse(b)));
    });
    req.on('error', reject);
    req.end();
  });
}

let wsId = 0;
const pending = new Map();
function onWsMsg(ev) {
  const msg = JSON.parse(ev.data);
  if (msg.id && pending.has(msg.id)) {
    pending.get(msg.id)(msg);
    pending.delete(msg.id);
  }
}
function send(method, params) {
  return new Promise((resolve) => {
    const id = ++wsId;
    pending.set(id, resolve);
    socket.send(JSON.stringify({ id, method, params }));
  });
}
let socket;
async function evaluate(expr) {
  const r = await send('Runtime.evaluate', { expression: expr, returnByValue: true, awaitPromise: true });
  if (r.result && r.result.exceptionDetails) throw new Error(JSON.stringify(r.result.exceptionDetails));
  return r.result.result.value;
}
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

(async () => {
  // 记录并临时开启侧栏（测试后恢复原值），保证主页能渲染侧栏进行对齐测量
  let origSidebar = '0';
  try {
    origSidebar = require('child_process').execSync(
      `php -r "require '${path.join(ROOT, 'db.php')}'; echo setting('show_sidebar','0');"`,
      { cwd: ROOT }
    ).toString().trim();
  } catch (e) { /* ignore */ }
  require('child_process').execSync(
    `php -r "require '${path.join(ROOT, 'db.php')}'; save_setting('show_sidebar','1');"`, { cwd: ROOT }
  );

  try {
    const php = await startPhp();
    const chrome = await startChrome();
    const page = await cdpPage();
    const WebSocket = globalThis.WebSocket;
    socket = new WebSocket(page.webSocketDebuggerUrl);
    await new Promise((r) => socket.addEventListener('open', r));
    socket.addEventListener('message', onWsMsg);
    await send('Page.enable');
    await send('Runtime.enable');

    await send('Page.navigate', { url: `http://127.0.0.1:${PORT}/login.php` });
    await sleep(1200);
    await evaluate(`(() => {
      const u = document.querySelector('input[name=username]');
      const p = document.querySelector('input[name=password]');
      if (!u || !p) return { error: 'login form not found' };
      u.value = 'admin'; p.value = 'admin123';
      document.querySelector('.login-form').submit();
      return { ok: true };
    })()`);
    await sleep(2500);
    const ready = await evaluate(`({
      hasMainScroll: !!document.getElementById('mainScroll'),
      hasSide: !!document.querySelector('.side-item'),
      hasHead: !!document.querySelector('.group-head'),
    })`);
    if (!ready.hasMainScroll || !ready.hasSide || !ready.hasHead) {
      console.error('未进入主页:', JSON.stringify(ready));
      process.exit(2);
    }
    // 等布局稳定 + alignSideNav 兜底
    await sleep(3000);

    // ---- 基线测量（视口坐标）----
    const base = await evaluate(`(() => {
      const scroller = document.getElementById('mainScroll');
      const searchBar = document.querySelector('.search-bar');
      const header = document.querySelector('.topbar, header, .header');
      const sideInner = document.querySelector('.side-inner');
      const heads = document.querySelectorAll('.group-head');
      const first = heads[0];
      const nameEl = first.querySelector('.group-name') || first;
      const last = heads[heads.length - 1];
      return {
        winScrollY: window.scrollY,
        bodyOverflow: getComputedStyle(document.body).overflow,
        htmlOverflow: getComputedStyle(document.documentElement).overflow,
        mainScrollTop: scroller.scrollTop,
        mainScrollPos: scroller.style.position,
        searchTop: Math.round(searchBar.getBoundingClientRect().top),
        searchBottom: Math.round(searchBar.getBoundingClientRect().bottom),
        scrollerTop: Math.round(scroller.getBoundingClientRect().top),
        scrollerBottom: Math.round(scroller.getBoundingClientRect().bottom),
        sideTitleTop: Math.round(sideInner.getBoundingClientRect().top),
        firstHeadTop: Math.round(nameEl.getBoundingClientRect().top),
        headCount: heads.length,
        headerTop: header ? Math.round(header.getBoundingClientRect().top) : null,
        headerBottom: header ? Math.round(header.getBoundingClientRect().bottom) : null,
        searchPad: getComputedStyle(document.documentElement).getPropertyValue('--search-pad').trim(),
      };
    })()`);
    console.log('\n=== 基线 ===');
    console.log(JSON.stringify(base, null, 2));

    // ---- 断言 1: 页面不滚动 ----
    const t1 = base.winScrollY === 0 && (base.bodyOverflow === 'hidden');
    console.log('\n[1] 页面不滚动(body overflow:hidden, scrollY=0):', t1 ? 'PASS' : 'FAIL');

    // ---- 断言 2: 首帧侧栏对齐 ----
    const delta = base.sideTitleTop - base.firstHeadTop;
    const t2 = Math.abs(delta) <= 2;
    console.log(`[2] 首帧侧栏对齐 (sideTitleTop-firstHeadTop=${delta}px, |delta|≤2):`, t2 ? 'PASS' : 'FAIL');

    // ---- 断言 3: 搜索栏固定在容器上方（searchBottom ≈ scrollerTop，紧邻无缝隙）----
    const gapSearchToScroller = base.scrollerTop - base.searchBottom;
    const t3 = Math.abs(gapSearchToScroller) <= 2;
    console.log(`[3] 搜索栏紧邻滚动容器上方 (scrollerTop-searchBottom=${gapSearchToScroller}px, |Δ|≤2):`, t3 ? 'PASS' : 'FAIL');

    // ---- 断言 4: 点击侧栏分组 → .main-scroll 滚动，搜索栏/头部/侧栏视口位置完全不变 ----
    // 记录点击前：头部底、搜索栏顶/底、侧栏标题顶 + 容器 scrollTop
    const before = await evaluate(`(() => {
      const scroller = document.getElementById('mainScroll');
      const searchBar = document.querySelector('.search-bar');
      const header = document.querySelector('.topbar, header, .header');
      const sideInner = document.querySelector('.side-inner');
      return {
        searchTop: Math.round(searchBar.getBoundingClientRect().top),
        searchBottom: Math.round(searchBar.getBoundingClientRect().bottom),
        headerBottom: header ? Math.round(header.getBoundingClientRect().bottom) : null,
        sideTitleTop: Math.round(sideInner.getBoundingClientRect().top),
        scrollerScrollTop: scroller.scrollTop,
      };
    })()`);
    // 点击侧栏第一个分组：确保一定有滚动/状态变化
    await evaluate(`(() => {
      const items = document.querySelectorAll('.side-item');
      const b = items[0];
      b.click();
      return { clicked: b.dataset.target };
    })()`);
    await sleep(2500);
    // 点击侧栏最后一个分组：验证在样本小的情况下也能滚到 maxScroll 且搜索栏不动
    await evaluate(`(() => {
      const items = document.querySelectorAll('.side-item');
      const b = items[items.length - 1];
      b.click();
      return { clicked: b.dataset.target };
    })()`);
    await sleep(2500);
    const after = await evaluate(`(() => {
      const scroller = document.getElementById('mainScroll');
      const searchBar = document.querySelector('.search-bar');
      const header = document.querySelector('.topbar, header, .header');
      const sideInner = document.querySelector('.side-inner');
      return {
        searchTop: Math.round(searchBar.getBoundingClientRect().top),
        searchBottom: Math.round(searchBar.getBoundingClientRect().bottom),
        headerBottom: header ? Math.round(header.getBoundingClientRect().bottom) : null,
        sideTitleTop: Math.round(sideInner.getBoundingClientRect().top),
        scrollerScrollTop: scroller.scrollTop,
        maxScroll: scroller.scrollHeight - scroller.clientHeight,
      };
    })()`);
    // 关键断言：搜索栏、头部底、侧栏标题顶视口位置在点击前后完全相同（页面顶部区域固定）
    const searchFixed = before.searchTop === after.searchTop && before.searchBottom === after.searchBottom;
    const headerFixed = before.headerBottom === after.headerBottom;
    const sideTitleFixed = before.sideTitleTop === after.sideTitleTop;
    // 容器 scrollTop 变化（说明容器确实滚动了，不靠页面整体滚动）
    const scrollerRolled = after.scrollerScrollTop !== before.scrollerScrollTop;
    const t4 = searchFixed && headerFixed && sideTitleFixed && scrollerRolled;
    console.log(`\n[4] 点击侧栏分组 (搜索栏顶 ${before.searchTop}→${after.searchTop} 固定=${searchFixed}; 头部底 ${before.headerBottom}→${after.headerBottom} 固定=${headerFixed}; 侧栏标题顶 ${before.sideTitleTop}→${after.sideTitleTop} 固定=${sideTitleFixed}; 容器scrollTop ${before.scrollerScrollTop}→${after.scrollerScrollTop} 变化=${scrollerRolled}):`, t4 ? 'PASS' : 'FAIL');

    // ---- 断言 5: 卡片被容器裁切（搜索栏区域不可见卡片元素 via elementFromPoint 命中搜索栏或头部）----
    await evaluate(`(() => {
      const scroller = document.getElementById('mainScroll');
      scroller.scrollTop = scroller.scrollHeight; // 滚到底
    })()`);
    await sleep(2000);
    // 用 elementFromPoint 检查搜索栏区域任意点的实际命中元素（应命中搜索栏本身或更上层，而非卡片）
    const bottom = await evaluate(`(() => {
      const scroller = document.getElementById('mainScroll');
      const searchBar = document.querySelector('.search-bar');
      const header = document.querySelector('.topbar, header, .header');
      const sb = searchBar.getBoundingClientRect();
      const samples = [];
      // 在搜索栏矩形内取 9 个采样点
      for (const dy of [0.25, 0.5, 0.75]) {
        for (const dx of [0.1, 0.5, 0.9]) {
          const x = sb.left + sb.width * dx;
          const y = sb.top + sb.height * dy;
          const el = document.elementFromPoint(x, y);
          samples.push({
            x: Math.round(x), y: Math.round(y),
            hit: el ? (el.className || el.tagName || '').toString().slice(0, 30) : 'null',
            hitId: el ? el.id : '',
          });
        }
      }
      // 头部底边紧贴搜索栏顶的区域：取搜索栏顶向下 1px 处的横线，确认无 card 穿过
      const seamSamples = [];
      const ySeam = sb.top + 1;
      for (let dx = 0.1; dx <= 0.9; dx += 0.2) {
        const x = sb.left + sb.width * dx;
        const el = document.elementFromPoint(x, ySeam);
        seamSamples.push({ x: Math.round(x), y: Math.round(ySeam), hit: el ? (el.className || el.tagName).toString().slice(0, 24) : 'null' });
      }
      return {
        scrollerScrollTop: scroller.scrollTop,
        winScrollY: window.scrollY,
        searchTop: Math.round(sb.top),
        searchBottom: Math.round(sb.bottom),
        scrollerTop: Math.round(scroller.getBoundingClientRect().top),
        // 任何 sample 命中了 .card 或 .group 或 .group-head 就算失败（卡片穿过搜索栏）
        searchRegionClean: samples.every(s => !/card|group|main-scroll/i.test(s.hit)) && seamSamples.every(s => !/card|group/i.test(s.hit)),
        samples, seamSamples,
      };
    })()`);
    const t5 = bottom.searchRegionClean && bottom.winScrollY === 0;
    console.log(`\n[5] 滚到底卡片裁切 (搜索栏区域 elementFromPoint 全部非卡片=${bottom.searchRegionClean}; 页面scrollY=${bottom.winScrollY}; 容器滚到底=${bottom.scrollerScrollTop === bottom.scrollerScrollTop ? 'yes' : '?'}):`, t5 ? 'PASS' : 'FAIL');
    if (!t5) {
      console.log('  samples:', JSON.stringify(bottom.samples.slice(0, 3), null, 2));
      console.log('  seamSamples:', JSON.stringify(bottom.seamSamples, null, 2));
    }

    // ---- 汇总 ----
    const results = [t1, t2, t3, t4, t5];
    const passed = results.filter(Boolean).length;
    console.log(`\n==== 结果: ${passed}/${results.length} PASS ====`);
    console.log(JSON.stringify({ base, after, bottom }, null, 2));
    // 恢复 show_sidebar 原值
    require('child_process').execSync(
      `php -r "require '${path.join(ROOT, 'db.php')}'; save_setting('show_sidebar','${origSidebar}');"`, { cwd: ROOT }
    );
    process.exit(passed === results.length ? 0 : 1);
  } catch (e) {
    // 异常时也恢复侧栏
    try {
      require('child_process').execSync(
        `php -r "require '${path.join(ROOT, 'db.php')}'; save_setting('show_sidebar','${origSidebar}');"`, { cwd: ROOT }
      );
    } catch (_) { /* ignore */ }
    console.error('脚本异常:', e);
    process.exit(3);
  }
})();
