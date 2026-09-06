/* 验证：侧栏第一个分组名称顶部是否与右侧第一个分组名称(.group-head)顶部对齐
 * 覆盖「页面刷新后对齐」场景：加载页面 → 等待布局稳定 → 测量偏移。
 * 通过 Chrome CDP + PHP 内置服务器真实 HTTP 全链路验证。
 */
const { spawn } = require('child_process');
const http = require('http');
const os = require('os');
const path = require('path');
const fs = require('fs');

const PORT = 8765;
const CDP_PORT = 9230;
const ROOT = path.resolve(__dirname, '..');

// ---------- 启动 PHP 内置服务器 ----------
function startPhp() {
  return new Promise((resolve, reject) => {
    const php = spawn('php', ['-S', `127.0.0.1:${PORT}`, '-t', ROOT], { cwd: ROOT });
    let out = '';
    php.stdout.on('data', (d) => { out += d; });
    php.stderr.on('data', (d) => { out += d; });
    const t = setTimeout(() => { if (!php.exitCode && !out.includes('Development Server')) { } }, 1500);
    // 等待端口就绪
    const tryConnect = () => {
      http.get(`http://127.0.0.1:${PORT}/login.php`, (res) => { res.resume(); clearTimeout(t); resolve(php); })
        .on('error', () => setTimeout(tryConnect, 200));
    };
    tryConnect();
  });
}

// ---------- 启动 Chrome headless (CDP) ----------
function startChrome() {
  return new Promise((resolve, reject) => {
    const chromePath = 'C:/Program Files/Google/Chrome/Application/chrome.exe';
    const userData = fs.mkdtempSync(path.join(os.tmpdir(), 'sunnav-chrome-'));
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

// ---------- CDP 工具 ----------
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
let origSidebar = null;

// ---------- 辅助 ----------
async function evaluate(expr) {
  const r = await send('Runtime.evaluate', { expression: expr, returnByValue: true, awaitPromise: true });
  if (r.result && r.result.exceptionDetails) throw new Error(JSON.stringify(r.result.exceptionDetails));
  return r.result.result.value;
}
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// 模拟一次「刷新」：location.reload() 并等待再次加载完成
async function reloadAndMeasure(label) {
  await send('Page.enable');
  await send('Runtime.evaluate', { expression: 'location.reload()' });
  // 等待新文档加载完成 + JS 运行
  await sleep(2500);
  // 等待对齐兜底定时器(350ms)执行后布局稳定
  await sleep(500);

  // 测量文档坐标（侧栏标题顶部 vs 右侧第一个分组名称顶部）
  const m = await evaluate(`(() => {
    const heads = document.querySelectorAll('.group-head');
    const sideInner = document.querySelector('.side-inner');
    if (!heads.length || !sideInner) return { error: 'no nodes' };
    // 侧栏标题顶部 = .side-inner 顶部（.side-title 是其第一个子元素）
    const sideTitleTop = sideInner.getBoundingClientRect().top + window.scrollY;
    // 右侧第一个分组名称的顶部（.group-name 存在取它，否则取 head）
    const firstHead = heads[0];
    const nameEl = firstHead.querySelector('.group-name') || firstHead;
    const nameTop = nameEl.getBoundingClientRect().top + window.scrollY;
    return {
      label: ${JSON.stringify(label)},
      nameTop: Math.round(nameTop),
      sideTitleTop: Math.round(sideTitleTop),
      delta: Math.round(sideTitleTop - nameTop),  // 0 = 标题顶部与分组名称顶部对齐
      marginTop: sideInner.style.marginTop,
      sideItemCount: document.querySelectorAll('.side-item').length,
    };
  })()`);
  return m;
}

(async () => {
  // 记录并临时开启侧栏（测试后恢复原值），保证主页能渲染侧栏进行对齐测量
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
    const WebSocket = globalThis.WebSocket; // Node 22 内置（浏览器风格事件）
    socket = new WebSocket(page.webSocketDebuggerUrl);
    await new Promise((r) => socket.addEventListener('open', r));
    socket.addEventListener('message', onWsMsg);
    await send('Page.enable');
    await send('Runtime.enable');

    // 通过浏览器完成登录（admin/admin123），获得可访问主页的 session
    await send('Page.navigate', { url: `http://127.0.0.1:${PORT}/login.php` });
    await sleep(1200);
    await evaluate(`(() => {
      const u = document.querySelector('input[name=username]');
      const p = document.querySelector('input[name=password]');
      if (!u || !p) return { error: 'login form not found' };
      u.value = 'admin';
      p.value = 'admin123';
      document.querySelector('.login-form').submit();
      return { ok: true };
    })()`);
    await sleep(2500);
    // 确认已进入主页（存在侧栏与分组）
    const ready = await evaluate(`({
      hasSide: !!document.querySelector('.side-item'),
      hasHead: !!document.querySelector('.group-head'),
      href: location.href,
    })`);
    if (!ready.hasSide || !ready.hasHead) {
      console.error('未进入主页:', JSON.stringify(ready));
      process.exit(2);
    }

    // 首次加载（约等于刷新场景：脚本一进入就对齐，资源可能未加载完）
    await sleep(3000);
    const first = await evaluate(`(() => {
      const heads = document.querySelectorAll('.group-head');
      const sideInner = document.querySelector('.side-inner');
      const nameEl = heads[0].querySelector('.group-name') || heads[0];
      const sy = window.scrollY;
      const nameTop = nameEl.getBoundingClientRect().top + sy;
      // 侧栏标题顶部 = .side-inner 顶部（.side-title 是其第一个子元素）
      const sideTitleTop = sideInner.getBoundingClientRect().top + sy;
      const cs = getComputedStyle(sideInner);
      return {
        nameTop: Math.round(nameTop),
        sideTitleTop: Math.round(sideTitleTop),
        delta: Math.round(sideTitleTop - nameTop),  // 0 = 标题顶部与分组名称顶部对齐
        marginTopInline: sideInner.style.marginTop,
        marginTopCs: cs.marginTop,
        position: cs.position,
        top: cs.top,
        headerH: getComputedStyle(document.querySelector('header')).height,
        pageMargin: getComputedStyle(document.querySelector('.layout')).paddingTop,
      };
    })()`);

    // 模拟多次刷新，看是否稳定对齐
    const rounds = [];
    for (let i = 0; i < 3; i++) {
      rounds.push(await reloadAndMeasure('refresh#' + (i + 1)));
    }

    console.log('=== 首次加载 ===');
    console.log(JSON.stringify(first));
    console.log('=== 刷新测试 ===');
    rounds.forEach((r) => console.log(JSON.stringify(r)));

    // 像素级对齐（亚像素渲染 + Math.round 允许 ±2px 容差）
    const aligned = (d) => Math.abs(d) <= 2;
    // 无闪烁：刷新后首帧 margin-top 非空（PHP 已内联），不会"先顶后跳"
    const noFlash = (r) => r.marginTop && r.marginTop !== '0px' && r.marginTop !== '';
    const pass = aligned(first.delta) && rounds.every((r) => aligned(r.delta) && noFlash(r));
    console.log(pass ? '\nPASS: 侧栏标题与右侧第一分组名称始终对齐，且无刷新闪烁' : '\nFAIL: 存在错位或闪烁');
    restoreSidebar();
    process.exit(pass ? 0 : 1);
  } catch (e) {
    console.error('ERROR:', e);
    restoreSidebar();
    process.exit(2);
  }
})();

function restoreSidebar() {
  if (origSidebar === null) return;
  try {
    require('child_process').execSync(
      `php -r "require '${path.join(ROOT, 'db.php')}'; save_setting('show_sidebar','${origSidebar}');"`, { cwd: ROOT }
    );
  } catch (e) { /* ignore */ }
}
