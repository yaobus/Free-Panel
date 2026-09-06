/* 验证：浏览器层面登录 Cookie 为持久 Cookie（关闭浏览器后仍保留）
 * 判据：CDP Network.getCookies 返回 cookie 的 expires —— 持久 cookie expires>0（已写入磁盘），
 *       会话 cookie expires=-1（仅内存，关闭浏览器即消失）。
 * 同时验证 profile 磁盘上存在 Chrome Cookie 数据库，佐证持久化。 */
const { spawn } = require('child_process');
const http = require('http');
const os = require('os');
const path = require('path');
const fs = require('fs');
const PORT = 8773, CDP_PORT = 9242, ROOT = path.resolve('D:/WorkZone/Sun-Nav');
const USER_DATA = path.join(os.tmpdir(), 'sunnav-cookie-profile');

function startPhp() {
  return new Promise((res) => {
    const p = spawn('php', ['-S', '127.0.0.1:' + PORT, '-t', ROOT], { cwd: ROOT });
    const tc = () => {
      http.get('http://127.0.0.1:' + PORT + '/login.php', (r) => { r.resume(); res(p); })
        .on('error', () => setTimeout(tc, 200));
    };
    tc();
  });
}
function startChrome() {
  return new Promise((res) => {
    const c = spawn('C:/Program Files/Google/Chrome/Application/chrome.exe', [
      '--headless=new', '--disable-gpu', '--no-sandbox',
      '--remote-debugging-port=' + CDP_PORT,
      '--user-data-dir=' + USER_DATA,
      '--window-size=1440,1000', 'about:blank',
    ], { stdio: 'ignore' });
    const tc = () => {
      http.get('http://127.0.0.1:' + CDP_PORT + '/json/version', (r) => {
        let b = ''; r.on('data', (d) => b += d); r.on('end', () => res(c));
      }).on('error', () => setTimeout(tc, 300));
    };
    tc();
  });
}
function cdpPage(url) {
  return new Promise((res, rej) => {
    const q = http.request({
      host: '127.0.0.1', port: CDP_PORT, method: 'PUT',
      path: '/json/new?' + encodeURIComponent(url),
    }, (r) => { let b = ''; r.on('data', (d) => b += d); r.on('end', () => res(JSON.parse(b))); });
    q.on('error', rej); q.end();
  });
}
let wsId = 0; const pending = new Map(); let socket;
function onWsMsg(ev) { const m = JSON.parse(ev.data); if (m.id && pending.has(m.id)) { pending.get(m.id)(m); pending.delete(m.id); } }
function send(method, params) {
  return new Promise((res) => { const id = ++wsId; pending.set(id, res); socket.send(JSON.stringify({ id, method, params })); });
}
async function ev(expr) {
  const r = await send('Runtime.evaluate', { expression: expr, returnByValue: true, awaitPromise: true });
  if (r.result && r.result.exceptionDetails) throw new Error(JSON.stringify(r.result.exceptionDetails));
  return r.result.result.value;
}
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

(async () => {
  if (fs.existsSync(USER_DATA)) fs.rmSync(USER_DATA, { recursive: true, force: true });
  const php = await startPhp();
  await sleep(300);
  const chrome = await startChrome();
  const page = await cdpPage('http://127.0.0.1:' + PORT + '/login.php');
  socket = new WebSocket(page.webSocketDebuggerUrl);
  await new Promise((r) => socket.addEventListener('open', r));
  socket.addEventListener('message', onWsMsg);
  await send('Page.enable'); await send('Runtime.enable'); await send('Network.enable');
  await sleep(1200);

  let pass = 0, total = 0;
  const check = (name, cond, extra) => {
    total++; if (cond) pass++;
    console.log((cond ? 'PASS  ' : 'FAIL  ') + name + (extra ? '  -> ' + extra : ''));
  };

  // 登录
  await ev("(()=>{const u=document.querySelector('input[name=username]');const p=document.querySelector('input[name=password]');if(u&&p){u.value='admin';p.value='admin123';document.querySelector('.login-form').submit();}})()");
  await sleep(2500);
  const after = await ev(`({ url: location.href, hasGroup: !!document.querySelector('.group') })`);
  check('登录成功进入主页', /index\.php/.test(after.url) && after.hasGroup, JSON.stringify(after));

  // 读取浏览器层面的 Cookie（Network.getCookies）
  const ck = await send('Network.getCookies', { urls: ['http://127.0.0.1:' + PORT + '/'] });
  const list = (ck.result && ck.result.cookies) || [];
  const sid = list.find((c) => c.name === 'sunnav_sid');
  check('浏览器已保存 sunnav_sid Cookie', !!sid);

  if (sid) {
    const expSec = sid.expires && sid.expires > 0 ? sid.expires - Math.floor(Date.now() / 1000) : -1;
    const days = expSec > 0 ? (expSec / 86400).toFixed(1) + ' 天' : '会话级(关闭浏览器即失效)';
    check('Cookie 为持久 Cookie（expires>0，会写入磁盘保留）', sid.expires > 0, 'expires=' + sid.expires + ' → 剩余 ' + days);
    check('Cookie 有效期约 30 天', Math.abs(expSec - 30 * 86400) < 300, expSec + 's ≈ ' + (expSec / 86400).toFixed(1) + ' 天');
    check('httpOnly 保留（防 XSS 窃取）', sid.httpOnly === true);
    check('sameSite=Lax 保留（防 CSRF）', sid.sameSite === 'Lax', 'sameSite=' + sid.sameSite);
    // session: false 表示非会话 cookie
    check('非 session Cookie（session=false 即持久）', sid.session === false, 'session=' + sid.session);
  }

  // 佐证：Chrome profile 磁盘上生成了 Cookies 数据库文件
  const cookiesDb = path.join(USER_DATA, 'Default', 'Network', 'Cookies');
  const cookiesDb2 = path.join(USER_DATA, 'Default', 'Cookies');
  const dbExists = fs.existsSync(cookiesDb) || fs.existsSync(cookiesDb2);
  check('Chrome profile 磁盘生成 Cookies 数据库（佐证持久化落盘）', dbExists, dbExists ? 'found: ' + (fs.existsSync(cookiesDb) ? 'Network/Cookies' : 'Cookies') : 'not found');

  console.log('\n==== 结果: ' + pass + '/' + total + ' PASS ====');
  chrome.kill(); php.kill();
  process.exit(pass === total ? 0 : 1);
})().catch((e) => { console.error('脚本异常:', e); process.exit(3); });
