/* 验证：登录 Cookie 为持久 Cookie（关闭浏览器后保留），且有效期为 SESSION_LIFETIME(30天)
 * 通过 PHP 内置服务器真实 HTTP 全链路验证 Set-Cookie 头的 expires 属性 */
const { spawn } = require('child_process');
const http = require('http');
const path = require('path');
const PORT = 8771, ROOT = path.resolve('D:/WorkZone/Sun-Nav');

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
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// 发起一次请求并返回响应头
function req(method, urlPath, headers, body) {
  return new Promise((resolve, reject) => {
    const opts = {
      host: '127.0.0.1', port: PORT, method, path: urlPath,
      headers: Object.assign({ 'Content-Type': 'application/x-www-form-urlencoded' }, headers || {}),
    };
    const r = http.request(opts, (res) => {
      let data = '';
      res.on('data', (d) => data += d);
      res.on('end', () => resolve({ status: res.statusCode, headers: res.headers, body: data }));
    });
    r.on('error', reject);
    if (body) r.write(body);
    r.end();
  });
}
// 解析 Set-Cookie
function parseSetCookie(res) {
  const raw = res.headers['set-cookie'] || [];
  const out = {};
  raw.forEach((c) => {
    const parts = c.split(';').map((s) => s.trim());
    const kv = parts[0].split('=');
    const name = kv[0];
    const o = { value: kv[1], expires: null, maxAge: null, httponly: false, samesite: null, path: null };
    parts.slice(1).forEach((p) => {
      const [k, v] = p.split('=');
      const key = k.toLowerCase();
      if (key === 'expires') o.expires = v;
      else if (key === 'max-age') o.maxAge = parseInt(v, 10);
      else if (key === 'httponly') o.httponly = true;
      else if (key === 'samesite') o.samesite = v;
      else if (key === 'path') o.path = v;
    });
    out[name] = o;
  });
  return out;
}

(async () => {
  const php = await startPhp();
  await sleep(300);
  let pass = 0, total = 0;
  const check = (name, cond, extra) => {
    total++;
    if (cond) pass++;
    console.log((cond ? 'PASS  ' : 'FAIL  ') + name + (extra ? '  -> ' + extra : ''));
  };

  const DAY = 86400;
  const EXPECT = 30 * DAY;

  // 1) 登录 POST
  const login = await req('POST', '/login.php', null, 'username=admin&password=admin123');
  check('登录返回 302 跳转 index.php', login.status === 302 && /index\.php/.test(login.headers.location || ''), 'status=' + login.status);
  const cookies = parseSetCookie(login);
  const sid = cookies['sunnav_sid'];
  check('登录响应下发 sunnav_sid Cookie', !!sid);

  if (sid) {
    check('Cookie 为持久 Cookie（带 expires，非浏览器会话级）', !!sid.expires, 'expires=' + sid.expires);
    check('Cookie 带 Max-Age=' + EXPECT, sid.maxAge === EXPECT, 'maxAge=' + sid.maxAge);
    if (sid.expires) {
      const expSec = Math.round((new Date(sid.expires).getTime() - Date.now()) / 1000);
      const days = (expSec / DAY).toFixed(1);
      check('Cookie 有效期约 30 天', Math.abs(expSec - EXPECT) < 120, expSec + 's ≈ ' + days + ' 天');
    }
    check('保留 httponly', sid.httponly === true);
    check('保留 samesite=Lax', (sid.samesite || '').toLowerCase() === 'lax', 'samesite=' + sid.samesite);
    check('保留 path=/', sid.path === '/', 'path=' + sid.path);
  }

  // 2) 用该 Cookie 访问受保护页面（模拟「浏览器带着旧 Cookie 打开页面」= 关闭浏览器后重开）
  const cookieHeader = 'sunnav_sid=' + (sid ? sid.value : '');
  const idx = await req('GET', '/index.php', { Cookie: cookieHeader });
  check('携带 Cookie 访问 index.php 返回 200（无需重新登录）', idx.status === 200, 'status=' + idx.status);
  check('index.php 渲染出分组内容', /class="group"/.test(idx.body), 'has .group=' + /class="group"/.test(idx.body));

  // 3) 未登录访问应跳转登录页（确保没有误放行）
  const anon = await req('GET', '/index.php', { Cookie: 'sunnav_sid=invalid_session_id_xxx' });
  check('无效 Cookie 访问 index.php 被重定向到登录页', anon.status === 302 && /login\.php/.test(anon.headers.location || ''), 'status=' + anon.status + ' loc=' + (anon.headers.location || ''));

  // 4) 未带任何 Cookie 访问也应跳转
  const noCookie = await req('GET', '/index.php', {});
  check('无 Cookie 访问 index.php 被重定向到登录页', noCookie.status === 302 && /login\.php/.test(noCookie.headers.location || ''), 'status=' + noCookie.status);

  console.log('\n==== 结果: ' + pass + '/' + total + ' PASS ====');
  php.kill();
  process.exit(pass === total ? 0 : 1);
})().catch((e) => { console.error('脚本异常:', e); process.exit(3); });
