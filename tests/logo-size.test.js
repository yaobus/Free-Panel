/* ============================================================
   Free-Panel LOGO 显示尺寸策略测试
   需求：登录页 LOGO 放大为现在的 2 倍（52 → 104），且登录标题文字
        （Free-Panel · 更加自由的导航页）字号保持不变；
        主页 LOGO 维持原尺寸（34px），不做修改。
   LOGO 渲染链路：login.php / index.php 调 db.php 的 logo_markup($val,$size)，
   由 $size 生成内联 style（width/height/object-fit）；site_logo 为空时
   各页回退到硬编码默认 SVG，尺寸须与传参一致（防两分支显示不一）。
   本测试覆盖：
     Part A（静态断言）：
       - login.php 传 logo_markup 尺寸为 104（2 倍）
       - login.php 空值回退默认 SVG 尺寸为 104（且无残留 52）
       - 登录标题字号已迁移到 tests/title-split.test.js 验证（拆主+副两行布局，字号 22px 由需求迭代回归指定）
       - index.php 主页 LOGO 维持 34px（logo_markup 调用 + 默认 SVG，无残留 51）
       - db.php img 分支内联 style 由传入 $size 生成（宽高一致 + object-fit:contain）
       - db.php emoji 分支按传入 $size 等比缩放字号（0.62）与行高（$size）
   运行: node tests/logo-size.test.js
   ============================================================ */
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const results = [];
function check(name, cond, detail) {
  results.push(!!cond);
  console.log((cond ? 'PASS' : 'FAIL') + '  ' + name + (detail !== undefined ? '  [' + detail + ']' : ''));
}

const loginSrc = fs.readFileSync(path.join(ROOT, 'login.php'), 'utf8');
const indexSrc = fs.readFileSync(path.join(ROOT, 'index.php'), 'utf8');
const dbSrc    = fs.readFileSync(path.join(ROOT, 'db.php'), 'utf8');
const cssSrc   = fs.readFileSync(path.join(ROOT, 'assets/style.css'), 'utf8');

/* ================= 登录页：LOGO 2 倍（52 → 104），文字字号不变 ================= */
check('login.php logo_markup 调用尺寸为 104（2 倍）',
  /logo_markup\(\$siteLogo,\s*104\)/.test(loginSrc));
check('login.php 空值回退默认 SVG 尺寸为 104',
  /<svg viewBox="0 0 48 48" width="104" height="104"/.test(loginSrc));
check('login.php 无残留 52 尺寸的 LOGO 标记',
  !/<svg viewBox="0 0 48 48" width="52" height="52"/.test(loginSrc) && !/logo_markup\(\$siteLogo,\s*52\)/.test(loginSrc));
// 登录标题字号约束已迁移到 tests/title-split.test.js（拆主+副两行布局；字号 22px 为用户回归指定值，参见需求迭代）

/* ================= 主页：LOGO 维持 34px，不做修改 ================= */
check('index.php logo_markup 调用尺寸维持 34（主页不改）',
  /logo_markup\(\$siteLogo,\s*34\)/.test(indexSrc));
check('index.php 空值回退默认 SVG 尺寸维持 34',
  /<svg viewBox="0 0 48 48" width="34" height="34"/.test(indexSrc));
check('index.php 无 51 尺寸的 LOGO 标记（未被误改）',
  !/<svg viewBox="0 0 48 48" width="51" height="51"/.test(indexSrc) && !/logo_markup\(\$siteLogo,\s*51\)/.test(indexSrc));

/* ================= db.php 渲染机制守卫（尺寸由调用方单一驱动） ================= */
check('db.php img 分支内联 style 由传入 $size 生成（含 object-fit:contain）',
  /\$style\s*=\s*'width:'\s*\.\s*\$size\s*\.\s*'px;height:'\s*\.\s*\$size\s*\.\s*'px;object-fit:contain'/.test(dbSrc));
check('db.php emoji 分支字号按 $size*0.62 缩放、行高为 $size',
  /font-size:'\s*\.\s*\(int\) round\(\$size \* 0\.62\)\s*\.\s*'px;line-height:'\s*\.\s*\$size\s*\.\s*'px">'/.test(dbSrc));

/* ================= 汇总 ================= */
const pass = results.filter(Boolean).length;
const fail = results.length - pass;
console.log('----------------------------------------');
console.log('logo-size: ' + pass + '/' + results.length + ' passed' + (fail ? ' (' + fail + ' FAILED)' : ''));
process.exit(fail ? 1 : 0);
