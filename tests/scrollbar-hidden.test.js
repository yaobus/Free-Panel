/* 验证：右侧卡片区(.main-scroll)滚动条隐藏，但滚动能力保留
 * 检查 scrollbar-width 与 ::-webkit-scrollbar display；并实测容器仍可滚动 */
const { spawn } = require('child_process');
const http = require('http');
const os = require('os');
const path = require('path');
const fs = require('fs');
const PORT = 8769, CDP_PORT = 9234, ROOT = path.resolve(__dirname, '..');
function startPhp(){return new Promise((res)=>{const p=spawn('php',['-S','127.0.0.1:'+PORT,'-t',ROOT],{cwd:ROOT});const tc=()=>{http.get('http://127.0.0.1:'+PORT+'/login.php',(r)=>{r.resume();res(p)}).on('error',()=>setTimeout(tc,200))};tc()})}
function startChrome(){return new Promise((res)=>{const c=spawn('C:/Program Files/Google/Chrome/Application/chrome.exe',['--headless=new','--disable-gpu','--no-sandbox','--remote-debugging-port='+CDP_PORT,'--user-data-dir='+fs.mkdtempSync(path.join(os.tmpdir(),'sbh-')),'--window-size=1440,1000','about:blank'],{stdio:'ignore'});const tc=()=>{http.get('http://127.0.0.1:'+CDP_PORT+'/json/version',(r)=>{let b='';r.on('data',d=>b+=d);r.on('end',()=>res(c))}).on('error',()=>setTimeout(tc,300))};tc()})}
function cdpPage(){return new Promise((res,rej)=>{const q=http.request({host:'127.0.0.1',port:CDP_PORT,method:'PUT',path:'/json/new?'+encodeURIComponent('http://127.0.0.1:'+PORT+'/login.php')},(r)=>{let b='';r.on('data',d=>b+=d);r.on('end',()=>res(JSON.parse(b)))});q.on('error',rej);q.end()})}
let wsId=0;const pending=new Map();let socket;
function onWsMsg(ev){const m=JSON.parse(ev.data);if(m.id&&pending.has(m.id)){pending.get(m.id)(m);pending.delete(m.id)}}
function send(method,params){return new Promise((res)=>{const id=++wsId;pending.set(id,res);socket.send(JSON.stringify({id,method,params}))})}
async function ev(expr){const r=await send('Runtime.evaluate',{expression:expr,returnByValue:true,awaitPromise:true});if(r.result&&r.result.exceptionDetails)throw new Error(JSON.stringify(r.result.exceptionDetails));return r.result.result.value}
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
(async()=>{
  const php=await startPhp();const chrome=await startChrome();const page=await cdpPage();
  socket=new WebSocket(page.webSocketDebuggerUrl);await new Promise(r=>socket.addEventListener('open',r));socket.addEventListener('message',onWsMsg);
  await send('Page.enable');await send('Runtime.enable');
  await send('Page.navigate',{url:'http://127.0.0.1:'+PORT+'/login.php'});await sleep(1200);
  await ev("(()=>{document.querySelector('input[name=username]').value='admin';document.querySelector('input[name=password]').value='admin123';document.querySelector('.login-form').submit()})()");
  await sleep(2500);await sleep(1500);
  const d = await ev(`(()=>{
    const s=document.getElementById('mainScroll');
    const cs=getComputedStyle(s);
    // 是否出现滚动条：比较 clientWidth 与 offsetWidth（含滚动条则 clientWidth < offsetWidth）
    const hasVisibleScrollbar = s.clientWidth < s.offsetWidth;
    // 触发滚动（scroll-behavior:smooth，结果需等待动画后读取）
    s.scrollTop = s.scrollHeight;
    return {
      scrollbarWidth: cs.scrollbarWidth,
      overflowY: cs.overflowY,
      clientW: s.clientWidth, offsetW: s.offsetWidth,
      hasVisibleScrollbar, scrollTopSet: s.scrollTop, maxScroll: s.scrollHeight - s.clientHeight,
      webkitScrollbarDisplay: getComputedStyle(s, '::-webkit-scrollbar').display,
    };
  })()`);
  await sleep(1000); // 等 smooth 滚动完成
  const after = await ev(`(()=>{ const s=document.getElementById('mainScroll'); return { scrollTop: s.scrollTop }; })()`);
  const canScroll = after.scrollTop > 0;
  console.log(JSON.stringify(d,null,2));
  console.log('after-smooth scrollTop=' + after.scrollTop);
  const ok = d.scrollbarWidth === 'none' && !d.hasVisibleScrollbar && canScroll;
  console.log('\n滚动条隐藏=' + (!d.hasVisibleScrollbar) + ' 可滚动=' + canScroll + '  ->  ' + (ok ? 'PASS' : 'FAIL'));
  process.exit(ok ? 0 : 1);
})().catch(e=>{console.error(e);process.exit(1)});
