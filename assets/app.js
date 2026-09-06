/* ============================================================
   Free-Panel 前端交互：搜索 / 主题 / 三模式地址 / 拖拽排序（卡片+分组）
                    / 右键菜单 / 增删改弹窗 / 站点设置（含账号与密码）
   说明：无“管理模式”，拖拽与右键管理随时可用
   ============================================================ */
(function () {
  'use strict';

  // 登录 / 刷新后默认显示页面顶部：禁用浏览器原生滚动位置恢复，并强制回到顶部
  try { history.scrollRestoration = 'manual'; } catch (e) {}
  window.scrollTo(0, 0);

  const $  = (s, r) => (r || document).querySelector(s);
  const $$ = (s, r) => Array.from((r || document).querySelectorAll(s));
  const CSRF = $('meta[name="csrf"]').content;

  const URL_KEYS = { default: 'uDefault', lan: 'uLan', ipv6: 'uIpv6' };
  const URL_LABEL = { default: '默认', lan: '内网', ipv6: 'IPv6' };

  /* ---------------- 主题切换 ---------------- */
  const themeBtn = $('#themeBtn');
  const savedTheme = localStorage.getItem('sunnav-theme');
  if (savedTheme) document.documentElement.dataset.theme = savedTheme;
  // 独立函数：顶部按钮与窄屏折叠菜单「切换主题」条目复用
  function toggleTheme() {
    const cur = document.documentElement.dataset.theme === 'dark' ? 'light' : 'dark';
    document.documentElement.dataset.theme = cur;
    localStorage.setItem('sunnav-theme', cur);
  }
  if (themeBtn) themeBtn.addEventListener('click', toggleTheme);

  /* ---------------- 三模式地址切换 ---------------- */
  function currentMode() {
    return localStorage.getItem('sunnav-urlmode') || 'default';
  }
  // 让滑动指示条移动到当前激活按钮位置（首次不带动画，切换时丝滑滑动）
  let modeSliderFirst = true;
  function moveModeSlider() {
    const sw = $('#modeSwitch');
    const slider = $('.mode-slider', sw);
    if (!slider) return;
    const b = $('button.active', sw);
    if (!b) return;
    const sRect = sw.getBoundingClientRect();
    const bRect = b.getBoundingClientRect();
    if (modeSliderFirst) {
      slider.style.transition = 'none';
      modeSliderFirst = false;
    } else {
      slider.style.transition = '';
    }
    slider.style.left = (bRect.left - sRect.left) + 'px';
    slider.style.width = bRect.width + 'px';
    slider.style.opacity = '1';
  }
  function applyMode() {
    const mode = currentMode();
    $$('#modeSwitch button').forEach((b) => b.classList.toggle('active', b.dataset.mode === mode));
    $$('a.card').forEach((c) => {
      const u = c.dataset[URL_KEYS[mode]] || c.dataset.uDefault || c.getAttribute('href');
      c.href = u;
      c.dataset.fallback = (mode !== 'default' && !c.dataset[URL_KEYS[mode]]) ? '1' : '0';
    });
    moveModeSlider();
  }
  $('#modeSwitch').addEventListener('click', (e) => {
    const b = e.target.closest('button[data-mode]');
    if (!b) return;
    localStorage.setItem('sunnav-urlmode', b.dataset.mode);
    applyMode();
  });
  applyMode();
  // 窗口尺寸变化时重新对齐滑块（按钮 padding 随响应式变化）
  let sliderResizeT = null;
  window.addEventListener('resize', () => {
    clearTimeout(sliderResizeT);
    sliderResizeT = setTimeout(moveModeSlider, 150);
  });

  /* 点击卡片：未配置当前模式地址时提示并打开默认地址 */
  document.addEventListener('click', (e) => {
    const a = e.target.closest('a.card');
    if (!a) return;
    if (a.dataset.fallback === '1') {
      toast(`${URL_LABEL[currentMode()]}地址未配置，已打开默认地址`);
    }
  });

  /* ---------------- 搜索引擎配置 + 搜索 ---------------- */
  const DEFAULT_ENGINES = [
    { name: 'Google', url: 'https://www.google.com/search?q={q}', icon: '🔍' },
    { name: 'Bing',   url: 'https://www.bing.com/search?q={q}',   icon: '🅱' },
    { name: '百度',    url: 'https://www.baidu.com/s?wd={q}',      icon: '度' },
    { name: 'GitHub', url: 'https://github.com/search?q={q}',    icon: '🐙' },
    { name: '知乎',    url: 'https://www.zhihu.com/search?type=content&q={q}', icon: '知' },
  ];

  function loadEngines() {
    const parse = (s) => { try { const a = JSON.parse(s); return Array.isArray(a) ? a : []; } catch (_) { return []; } };
    // 数据库配置（服务端渲染进 body data-engines）优先
    const db = parse(document.body.dataset.engines || '[]');
    if (db.length) {
      // DB 已有配置：旧 localStorage 缓存已被取代，迁移标记置位（防止未来清空后回滚复活）
      localStorage.removeItem('sunnav-engines');
      localStorage.setItem('sunnav-engines-migrated', '1');
      return db;
    }
    const ls = parse(localStorage.getItem('sunnav-engines') || '[]');
    const migrated = localStorage.getItem('sunnav-engines-migrated') === '1';
    if (!migrated && ls.length) {
      // 旧版（localStorage 存储）自定义引擎：一次性迁移到数据库
      const arr = ls.slice(0, 50);
      localStorage.setItem('sunnav-engines-migrated', '1');
      localStorage.removeItem('sunnav-engines');
      api('save_settings', { engines: JSON.stringify(arr) }).catch(() => {});
      return arr;
    }
    // 全新安装 → 内置默认；已迁移且 DB 为空 → 尊重用户清空（空列表）
    return migrated ? [] : DEFAULT_ENGINES.slice();
  }
  // 保存引擎列表到数据库（settings.engines）
  function saveEngines() {
    api('save_settings', { engines: JSON.stringify(engines) })
      .catch(() => toast('搜索引擎配置保存失败', true));
  }

  let engines = loadEngines();
  let activeIdx = (() => {
    const i = parseInt(localStorage.getItem('sunnav-engine-idx'), 10);
    return i >= 0 && i < engines.length ? i : 0;
  })();

  const search = $('#search');
  const engineBtn = $('#engineBtn');
  const engineIcon = $('#engineIcon');
  const engineName = $('#engineName');
  const enginePanel = $('#enginePanel');
  const engineList = $('#engineList');

  // 搜索开关（来自服务端设置，body data 属性传入）
  const SEARCH_LOCAL = document.body.dataset.searchLocal !== '0'; // 本地搜索：输入实时过滤收藏夹
  const SEARCH_WEB   = document.body.dataset.searchWeb !== '0';   // 互联网搜索：回车调用搜索引擎
  const SEARCH_RESET = document.body.dataset.searchReset !== '0'; // 自动复位搜索框：联网搜索后清空关键词

  function activeEngine() { return engines[activeIdx] || null; }

  function renderEngine() {
    const e = activeEngine();
    if (!e) { // 引擎列表为空（用户清空）：显示占位
      engineIcon.innerHTML = engineIconHtml('');
      engineName.textContent = '搜索引擎';
      return;
    }
    engineIcon.innerHTML = engineIconHtml(e.icon);
    engineName.textContent = e.name || '搜索引擎';
  }
  // 引擎图标 HTML：iconify: 前缀 → img；图片 URL / data URI → img；否则文本/emoji
  function engineIconHtml(icon) {
    const v = String(icon || '').trim();
    const m = v.match(/^iconify:(.+)$/i);
    if (m) return `<img src="https://api.iconify.design/${encodeURIComponent(m[1].trim())}.svg" alt="">`;
    if (/^(https?:\/\/|\/|data:image\/)/i.test(v)) return `<img src="${escapeHtml(v)}" alt="">`;
    return escapeHtml(v || '🔍');
  }
  function renderEngineList() {
    engineList.innerHTML = engines.map((e, i) => `
      <button class="engine-item${i === activeIdx ? ' active' : ''}" data-idx="${i}">
        <span class="e-ico">${engineIconHtml(e.icon)}</span>
        <span class="e-name">${escapeHtml(e.name || '未命名')}</span>
        <span class="e-edit" data-edit="${i}" title="编辑">✎</span>
        ${engines.length > 1 ? `<span class="e-del" data-del="${i}" title="删除">✕</span>` : ''}
      </button>`).join('');
  }
  function setActive(i) {
    if (i < 0 || i >= engines.length) return;
    activeIdx = i;
    localStorage.setItem('sunnav-engine-idx', String(i));
    renderEngine();
    renderEngineList();
    toast(`已切换搜索引擎：${activeEngine().name}`);
  }

  function togglePanel(force) {
    const show = force !== undefined ? force : enginePanel.hidden;
    enginePanel.hidden = !show;
    engineBtn.classList.toggle('open', show);
    if (show) renderEngineList();
  }

  engineBtn.addEventListener('click', (e) => {
    e.stopPropagation();
    togglePanel();
  });

  enginePanel.addEventListener('click', (e) => {
    const del = e.target.closest('[data-del]');
    if (del) {
      e.stopPropagation();
      const i = parseInt(del.dataset.del, 10);
      openConfirm({
        title: '删除搜索引擎',
        message: `确定要删除搜索引擎「${activeEngineOr(engines[i])}」吗？`,
        confirmText: '删除',
        danger: true,
        onConfirm: () => {
          engines.splice(i, 1);
          if (activeIdx > i) activeIdx--;
          else if (activeIdx === i) activeIdx = 0;
          saveEngines();
          renderEngine();
          renderEngineList();
          toast('搜索引擎已删除');
        },
      });
      return;
    }
    const edit = e.target.closest('[data-edit]');
    if (edit) {
      e.stopPropagation();
      openEngineModal(parseInt(edit.dataset.edit, 10));
      return;
    }
    const item = e.target.closest('.engine-item');
    if (item) {
      e.stopPropagation();
      setActive(parseInt(item.dataset.idx, 10));
      togglePanel(false);
    }
  });

  function activeEngineOr(e) {
    return escapeHtml((e && e.name) || '未命名');
  }

  // 添加 / 编辑搜索引擎（模态框）
  function openEngineModal(idx) {
    const isEdit = idx != null && idx >= 0;
    const eng = isEdit ? engines[idx] : null;
    openModal({
      title: isEdit ? '编辑搜索引擎' : '添加搜索引擎',
      fields: [
        { name: 'name', label: '名称', value: eng ? eng.name : '', required: true, placeholder: '如 必应' },
        { name: 'url', label: '搜索地址', value: eng ? eng.url : '', required: true, placeholder: '用 {q} 占位关键词，如 https://www.bing.com/search?q={q}' },
        { name: 'icon', label: '图标', type: 'icon', value: eng ? (eng.icon || '') : '', placeholder: 'emoji / 图片URL / iconify:图标名' },
      ],
      submitText: '保存',
      onSubmit: (d) => {
        if (!d.name || !d.url) return toast('请填写名称和搜索地址', true);
        if (!d.url.includes('{q}')) return toast('搜索地址需包含 {q} 占位符', true);
        if (isEdit) {
          engines[idx] = { ...engines[idx], name: d.name, url: d.url, icon: d.icon || engines[idx].icon || '' };
        } else {
          engines.push({ name: d.name, url: d.url, icon: d.icon || d.name.charAt(0) });
          idx = engines.length - 1;
          activeIdx = idx;
          localStorage.setItem('sunnav-engine-idx', String(idx));
        }
        saveEngines();
        renderEngine();
        renderEngineList();
        closeModal(); // 保存成功后关闭编辑弹窗
        toast(isEdit ? '搜索引擎已更新' : '搜索引擎已添加');
      },
    });
  }

  $('#engineAddBtn').addEventListener('click', (e) => {
    e.stopPropagation();
    openEngineModal();
  });

  // 关闭浮层：点击外部 / Escape
  document.addEventListener('click', (e) => {
    if (!e.target.closest('#enginePanel') && !e.target.closest('#engineBtn')) togglePanel(false);
  });

  // 本地过滤收藏夹（输入即实时过滤卡片，回车则联网搜索）
  const searchClear = $('#searchClear');

  function applyFilter(kw) {
    // 本地搜索关闭时不做任何过滤（卡片保持全显，输入框仅作为联网搜索输入）
    if (!SEARCH_LOCAL) { searchClear.hidden = !(kw || '').trim(); return false; }
    kw = (kw || '').trim().toLowerCase();
    let any = false;
    $$('.group').forEach((g) => {
      let shown = 0;
      $$('.card', g).forEach((c) => {
        const hit = !kw || c.dataset.k.includes(kw);
        c.style.display = hit ? '' : 'none';
        if (hit) shown++;
      });
      g.style.display = shown ? '' : 'none';
      const count = $('.group-count', g);
      if (count) count.textContent = shown;
      if (shown) any = true;
    });
    searchClear.hidden = !kw;
    return any;
  }

  function clearSearch() {
    if (search.value === '') return;
    search.value = '';
    applyFilter('');
    search.focus();
  }

  search.addEventListener('input', () => applyFilter(search.value));
  searchClear.addEventListener('click', clearSearch);
  search.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') clearSearch();
  });

  // 回车：使用当前搜索引擎联网搜索
  search.addEventListener('keydown', (e) => {
    if (e.key !== 'Enter') return;
    const kw = search.value.trim();
    if (!kw) return;
    if (!SEARCH_WEB) {
      toast('互联网搜索已关闭，可在设置中开启');
      return;
    }
    const eng = activeEngine();
    if (!eng) {
      toast('未配置搜索引擎，点击搜索框左侧按钮添加');
      return;
    }
    window.open(eng.url.replace(/\{q\}/g, encodeURIComponent(kw)), '_blank', 'noopener');
    // 联网搜索后复位搜索框：本地过滤会让无匹配的关键词把所有卡片隐藏，
    // 用户从搜索结果页返回主页时会看到空白，故清掉关键词并重置过滤。
    // 这里内联清空而非调用 clearSearch()：clearSearch 末尾会 search.focus()，
    // 而焦点此时应留给用户刚打开的结果页，抢回焦点会干扰阅读。
    if (SEARCH_RESET) {
      search.value = '';
      applyFilter('');
    }
  });

  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') { hideCtxMenu(); togglePanel(false); }
  });

  renderEngine();
  renderEngineList();
  applyFilter(search.value); // 初始化清空按钮 / 空状态 / 过滤状态

  /* ---------------- 侧栏分组导航 ---------------- */
  const sideItems = $$('.side-item');
  let sideNavLock = 0; // 点击锁定时间戳：此期间 IO 不覆盖点击设置的 active，避免滚动过程中高亮跳变
  if (sideItems.length) {
    // 加载后默认高亮第一个分组，且不自动滚动（登录/刷新均停在页面顶部）
    if (sideItems[0]) {
      sideItems[0].classList.add('active');
    }

    let ioFirst = true; // IO 初始回调（页面加载时触发一次）会按"视口条带内分组"高亮，导致总高亮第二个分组，需跳过
    if ('IntersectionObserver' in window) {
      const targets = sideItems.map((b) => $(b.dataset.target)).filter(Boolean);
      const io = new IntersectionObserver((entries) => {
        if (ioFirst) { ioFirst = false; return; } // 跳过初始回调，避免覆盖恢复/默认高亮
        // 点击锁定期间（smooth 滚动中）跳过 IO 高亮，覆盖会导致"点击没反应"的观感
        if (Date.now() < sideNavLock) return;
        entries.forEach((en) => {
          if (en.isIntersecting) {
            sideItems.forEach((b) => b.classList.toggle('active', b.dataset.target === '#' + en.target.id));
          }
        });
      }, { rootMargin: '-30% 0px -55% 0px' });
      targets.forEach((t) => io.observe(t));
    }

    sideItems.forEach((b) => b.addEventListener('click', () => {
      const t = $(b.dataset.target);
      if (!t) return;
      // 立即手动高亮点击项（不等 IO）→ 用户立刻看到反馈
      sideItems.forEach((x) => x.classList.toggle('active', x === b));
      // 锁定 IO 1.2s，覆盖 smooth 滚动全程 + 余量，防止滚动过程中 IO 看到中间分组 intersecting 而改写高亮
      sideNavLock = Date.now() + 1200;
      // 在卡片滚动容器(.main-scroll)内滚动，让目标分组顶部对齐容器顶部（即搜索栏正下方，不带动整个页面）
      const scroller = $('#mainScroll');
      if (scroller) {
        scroller.scrollTo({ top: t.offsetTop, behavior: 'smooth' });
      } else {
        t.scrollIntoView({ behavior: 'smooth', block: 'start' });
      }
    }));
  }

  /* ---------------- 侧栏标题与右侧第一个分组名称对齐 ---------------- */
  // 目标：侧栏标题(.side-title，即 .side-inner 顶部)与右侧第一个分组名称(.group-head)顶部对齐。
  // PHP 已在渲染时内联一个首帧 margin-top（见 db.php side_nav_offset），避免刷新"先顶后跳"闪烁；
  // 此处用真实布局测量做精确校正（仅小幅微调），并应对字体/图标/图片加载后的布局变化。
  function alignSideNav() {
    const sideInner = $('.side-inner');
    // 对齐目标：第一个分组名称(.group-head，包含图标+名称)
    const firstHead = $('.group-head') || $('.grid');
    if (!sideInner || !firstHead) return;
    // 用 .side-inner 顶部（= .side-title 标题顶部）作为侧栏对齐参照点
    sideInner.style.marginTop = '';
    const headTop = firstHead.getBoundingClientRect().top + window.scrollY;
    const sideTop = sideInner.getBoundingClientRect().top + window.scrollY;
    const delta = Math.round(headTop - sideTop);
    // 页面尚未完整渲染（loading）时 getBoundingClientRect 可能不准，
    // 此时保留 PHP 内联的首帧值，不覆盖。
    if (delta > 0 && document.readyState !== 'loading') sideInner.style.marginTop = delta + 'px';
  }
  let alignTimer = null;
  function scheduleAlign() {
    clearTimeout(alignTimer);
    alignTimer = setTimeout(alignSideNav, 120);
  }
  window.addEventListener('resize', scheduleAlign);
  // 首次精确校正放在布局稳定后执行（load / fonts.ready / 兜底），
  // 首帧依赖 PHP 内联值，避免 loading 阶段测量不准引发"先顶后跳"。
  if (document.readyState === 'complete') {
    scheduleAlign();
  } else {
    window.addEventListener('load', scheduleAlign);
  }
  if (document.fonts && document.fonts.ready) {
    document.fonts.ready.then(() => { scheduleAlign(); scheduleAlign(); });
  }
  // 兜底：等一切加载/渲染完成后再次精确对齐（覆盖 IO 恢复滚动等异步布局）
  setTimeout(scheduleAlign, 350);

  /* ---------------- API 封装 ---------------- */
  async function api(action, data) {
    const res = await fetch('api.php', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(Object.assign({ action, csrf: CSRF }, data || {})),
    });
    let j;
    try { j = await res.json(); } catch (_) { throw new Error('服务器响应异常'); }
    if (!j.ok) throw new Error(j.error || '操作失败');
    return j;
  }

  let toastTimer = null;
  function toast(msg, isErr) {
    const t = $('#toast');
    t.textContent = msg;
    t.classList.toggle('err', !!isErr);
    t.hidden = false;
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => { t.hidden = true; }, 2600);
  }

  /* ---------------- 弹窗系统 ---------------- */
  function openModal(opts) {
    const root = $('#modalRoot');

    const ov = document.createElement('div');
    ov.className = 'modal-overlay';
    // 提交回调挂在弹窗实例上：支持弹窗叠加（如「添加收藏」之上再开「新建分组」），
    // 每个弹窗的提交回调互不覆盖、关闭上层弹窗后下层弹窗仍可正常提交
    ov.__onSubmit = opts.onSubmit || null;
    ov.innerHTML = `
      <div class="modal">
        <div class="modal-head">
          <h3>${opts.title}</h3>
          <button type="button" class="modal-close" title="关闭">✕</button>
        </div>
        <form class="modal-body">
          <div class="modal-scroll">
            ${opts.fields.map(f => fieldHtml(f)).join('')}
          </div>
          <div class="modal-foot">
            <button type="button" class="btn btn-ghost" data-cancel>取消</button>
            <button type="submit" class="btn btn-primary">${opts.submitText || '保存'}</button>
          </div>
        </form>
      </div>`;
    root.appendChild(ov);

    ov.addEventListener('click', (e) => {
      // 仅允许通过 ✕ / 取消按钮关闭；点击遮罩不关闭，防止误触丢失已填内容
      if (e.target.closest('[data-cancel]') || e.target.closest('.modal-close')) closeModal();
    });
    ov.querySelector('form').addEventListener('submit', (e) => {
      e.preventDefault();
      const data = {};
      opts.fields.forEach((f) => {
        if (f.type === 'divider') return;
        const el = ov.querySelector(`[name="${f.name}"]`);
        if (!el) return;
        data[f.name] = f.type === 'checkbox' ? (el.checked ? '1' : '0') : el.value.trim();
      });
      const hook = ov.__onSubmit;
      if (hook) hook(data);
    });
    // 显式设置 select 默认值：规避部分解析环境（如 happy-dom）对 option selected 属性
    // 的解析差异，保证「指定 value」的 select 打开时即处于正确选中态
    opts.fields.filter(f => f.type === 'select' && f.value !== undefined && f.value !== null).forEach((f) => {
      const el = ov.querySelector(`[name="${f.name}"]`);
      if (el && [...el.options].some(o => String(o.value) === String(f.value))) el.value = f.value;
    });
    // 绑定图标字段交互（图标库按钮 + 实时预览）
    bindIconFields(ov, opts.fields);
    // 绑定「所属分组」下拉框旁的内联「＋」新增分组按钮：新建成功不刷新页面，
    // 就地追加选项并选中；新分组同时记入 extraGroups，后续弹窗的分组下拉也可选到
    $$('.group-inline-add', ov).forEach((btn) => {
      btn.addEventListener('click', (e) => {
        e.preventDefault();
        e.stopPropagation();
        const wrap = btn.closest('.select-with-add');
        const sel = wrap ? wrap.querySelector('select') : null;
        openGroupCreateModal(sel);
      });
    });
    // 绑定地址输入框后的「获取图标」按钮（读取网站自身图标，失败则用默认图标）
    $$('.fav-get', ov).forEach((btn) => {
      btn.addEventListener('click', async (e) => {
        e.preventDefault();
        e.stopPropagation();
        if (btn.dataset.loading) return;
        const urlInput = btn.closest('.url-input').querySelector('input');
        const iconInput = ov.querySelector(`[name="${btn.dataset.iconField}"]`);
        if (!iconInput) { toast('未找到图标字段', true); return; }
        const raw = (urlInput ? urlInput.value : '').trim();
        if (!raw) { toast('请先填写该地址', true); return; }
        btn.dataset.loading = '1';
        btn.classList.add('loading');
        const orig = btn.textContent;
        btn.textContent = '获取中…';
        try {
          const fav = await faviconFromUrl(raw);
          iconInput.value = fav;
          const preview = ov.querySelector(`[data-icon-preview]`);
          if (preview) renderIconPreview(iconInput, preview);
          toast(fav === DEFAULT_SITE_ICON ? '未获取到图标，已使用默认图标' : '已从该地址获取网站图标');
        } finally {
          btn.textContent = orig;
          btn.classList.remove('loading');
          delete btn.dataset.loading;
        }
      });
    });
    // 绑定卡片背景色：预设色板点击 + hex 文本框输入（实时预览、同步色板选中态）
    opts.fields.filter(f => f.type === 'cardcolor').forEach((f) => {
      const input = ov.querySelector(`[name="${f.name}"]`);
      const row = input.closest('.cc-input');
      const preview = row.querySelector('[data-cc-preview]');
      const swatches = row.parentElement.querySelectorAll('.cc-swatch');
      const applyHex = () => {
        const hex = normalizeHex(input.value);
        preview.style.background = hex ? '#' + hex : 'transparent';
        swatches.forEach((s) => s.classList.toggle('active', hex && s.dataset.cc === '#' + hex));
      };
      input.addEventListener('input', applyHex);
      swatches.forEach((s) => {
        s.addEventListener('click', (e) => {
          e.preventDefault();
          e.stopPropagation();
          const hex = s.dataset.cc.replace(/^#/, '');
          input.value = hex;
          applyHex();
        });
      });
      applyHex();
    });
    const first = ov.querySelector('input:not([type=hidden])');
    if (first) setTimeout(() => first.focus(), 60);
  }

  function closeModal() {
    const root = $('#modalRoot');
    if (root && root.lastElementChild) root.lastElementChild.remove();
  }

  /* ---------------- 会话内新增分组（表单内联入口，不刷新页面） ---------------- */
  // 本次会话通过「所属分组」下拉框旁按钮新建的分组；页面刷新后由服务端渲染补齐
  let extraGroups = [];
  // 分组下拉选项 = 页面已渲染分组 + 会话内新增分组（按 id 去重）
  function groupOptions() {
    const opts = $$('.group').map((g) => [g.dataset.group, $('.group-name', g).textContent]);
    extraGroups.forEach((g) => {
      if (!opts.some((o) => o[0] === String(g.id))) opts.push([String(g.id), g.name]);
    });
    return opts;
  }
  // 内联新增分组：新建成功后就地追加 option 并选中，保留当前填写中的表单
  function openGroupCreateModal(select) {
    openModal({
      title: '新建分组',
      fields: [
        { name: 'name', label: '分组名称', required: true, placeholder: '例如：开发环境' },
        { name: 'icon', label: '分组图标', type: 'icon', placeholder: 'emoji（如 📁）、图片URL、或 iconify:图标名' },
      ],
      submitText: '创建',
      onSubmit: async (d) => {
        if (!d.name) return toast('请输入分组名称', true);
        try {
          const res = await api('add_group', d);
          extraGroups.push({ id: res.data.id, name: d.name });
          if (select) {
            const opt = document.createElement('option');
            opt.value = String(res.data.id);
            opt.textContent = d.name;
            select.appendChild(opt);
            select.value = String(res.data.id); // 显式选中新分组（兼容部分解析环境不同步 option.selected）
          }
          closeModal(); // 只关闭新建分组弹窗，下层表单保留
          toast('分组已创建');
        } catch (err) {
          toast(err.message || '创建失败', true);
        }
      },
    });
  }

  /* ---------------- 图标字段交互（编辑弹窗与设置弹窗共用） ---------------- */
  // 绑定 icon 类型字段：输入框实时预览 + 「图标库」按钮打开 Iconify 选择面板
  // +（f.upload）「上传图片」按钮：本地上传 JPG/PNG/SVG → api.php(upload_logo) → 回填
  function bindIconFields(container, fields) {
    fields.filter(f => f.type === 'icon').forEach((f) => {
      const input = container.querySelector(`[name="${f.name}"]`);
      if (!input) return;
      const row = input.closest('.icon-input');
      const formRow = row ? row.closest('.icon-form-row') : null;
      // 预览容器取当前字段行内的（弹窗可能同时存在多个 icon 字段，如站点图标 + 网站 LOGO）
      const preview = formRow ? formRow.querySelector('[data-icon-preview]') : container.querySelector('[data-icon-preview]');
      const updatePreview = () => renderIconPreview(input, preview);
      input.addEventListener('input', updatePreview);
      const pick = row ? row.querySelector('[data-icon-pick="iconify"]') : null;
      if (pick) {
        pick.addEventListener('click', (e) => {
          e.preventDefault();
          e.stopPropagation();
          openIconifyPicker(async (name) => {
            // 选中图标时抓取 SVG 内容内嵌为 data URI 直接存库（不再只存 iconify:名称），
            // 页面渲染不再依赖 Iconify 外网 → 加载更快；抓取失败回退名称。
            const dataUri = await iconifyNameToDataUri(name);
            input.value = dataUri || name;
            updatePreview();
            if (dataUri) toast('图标已内嵌保存到数据库，加载更快');
          });
        });
      }
      if (f.upload) {
        const upBtn = row ? row.querySelector('[data-icon-upload]') : null;
        if (upBtn) {
          upBtn.addEventListener('click', (e) => {
            e.preventDefault();
            e.stopPropagation();
            if (upBtn.dataset.loading) return;
            const fileInput = document.createElement('input');
            fileInput.type = 'file';
            fileInput.accept = 'image/jpeg,image/png,image/svg+xml';
            fileInput.onchange = async () => {
              const file = fileInput.files && fileInput.files[0];
              if (!file) return;
              if (file.size > 2 * 1024 * 1024) { toast('图片不能超过 2MB', true); return; }
              const fd = new FormData();
              fd.append('action', 'upload_logo');
              fd.append('csrf', CSRF);
              fd.append('file', file);
              upBtn.dataset.loading = '1';
              upBtn.classList.add('loading');
              const orig = upBtn.textContent;
              upBtn.textContent = '上传中…';
              try {
                const res = await fetch('api.php', { method: 'POST', body: fd });
                const j = await res.json();
                if (!j.ok) throw new Error(j.error || '上传失败');
                input.value = j.url;
                updatePreview();
                toast('LOGO 已上传，保存设置后生效');
              } catch (err) {
                toast(err.message, true);
              } finally {
                upBtn.textContent = orig;
                upBtn.classList.remove('loading');
                delete upBtn.dataset.loading;
              }
            };
            fileInput.click();
          });
        }
      }
      setTimeout(updatePreview, 0);
    });
  }

  /* ---------------- 图标选择辅助（Iconify / 网站图标） ---------------- */
  // 图标内嵌保存：抓取 Iconify SVG 内容 → data:image/svg+xml;utf8,<URL编码>
  // 直接存库后页面渲染零外部请求（内网/离线也能显示），提高加载速度。
  // 抓取失败返回 null（调用方回退保存 iconify:名称，保持原有行为）。
  async function iconifyNameToDataUri(name) {
    const m = String(name || '').match(/^iconify:(.+)$/i);
    if (!m) return null;
    const iconName = m[1].trim();
    if (!iconName) return null;
    try {
      const res = await fetch('https://api.iconify.design/' + encodeURIComponent(iconName) + '.svg');
      if (!res.ok) return null;
      const svg = await res.text();
      if (!/^\s*<svg/i.test(svg)) return null;
      return 'data:image/svg+xml;utf8,' + encodeURIComponent(svg);
    } catch (_) {
      return null;
    }
  }
  // 图标值 → 预览 HTML。支持：iconify:名称、http(s) 图片、/uploads/ 相对图片、data URI、emoji/文本
  function iconValueHtml(val) {
    const v = String(val || '').trim();
    if (!v) return '<span class="ico-preview-ph">未设置</span>';
    const m = v.match(/^iconify:(.+)$/i);
    if (m) return `<img class="ico-pv" src="https://api.iconify.design/${encodeURIComponent(m[1].trim())}.svg" alt="">`;
    if (/^(https?:\/\/|\/|data:image\/)/i.test(v)) return `<img class="ico-pv" src="${escapeHtml(v)}" alt="">`;
    return `<span class="ico-pv emoji">${escapeHtml(v)}</span>`;
  }
  function renderIconPreview(input, preview) {
    if (!preview) return;
    preview.innerHTML = iconValueHtml(input.value);
  }
  // 默认图标（内联 SVG data URI，局域网也能正常显示，不依赖外网）
  const DEFAULT_SITE_ICON = 'data:image/svg+xml;utf8,' + encodeURIComponent(
    '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24">' +
    '<path fill="#94a3b8" d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zM11 19.93c-3.95-.49-7-3.85-7-7.93 0-.62.08-1.21.21-1.79L9 15v1c0 1.1.9 2 2 2v1.93zM17.9 17.39c-.26-.81-1-1.39-1.9-1.39h-1v-3c0-.55-.45-1-1-1H8v-2h2c.55 0 1-.45 1-1V7h2c1.1 0 2-.9 2-2v-.41c2.93 1.19 5 4.06 5 7.41 0 2.08-.8 3.97-2.1 5.39z"/>' +
    '</svg>');

  function resolveUrl(base, ref) {
    try { return new URL(ref, base).href; } catch (_) { return ''; }
  }
  // 探测某个 URL 能否作为图片加载（Image 加载测试，跨源无需 CORS）
  function probeImage(url, timeout) {
    return new Promise((resolve) => {
      const img = new Image();
      const t = setTimeout(() => { img.src = ''; resolve(false); }, timeout);
      img.onload = () => { clearTimeout(t); resolve(true); };
      img.onerror = () => { clearTimeout(t); resolve(false); };
      img.src = url;
    });
  }
  // 尝试从页面 HTML 的 <link rel="icon"> 提取图标地址（需同源或服务器放行 CORS）
  async function linkTagIcon(url) {
    try {
      const ctrl = new AbortController();
      const t = setTimeout(() => ctrl.abort(), 2200);
      const res = await fetch(url, { cache: 'no-store', redirect: 'follow', signal: ctrl.signal });
      clearTimeout(t);
      if (!res.ok) return '';
      const text = await res.text();
      const re = /<link[^>]*rel=["'][^"']*["'][^>]*>/gi;
      let m;
      while ((m = re.exec(text))) {
        const rel = /rel=["']([^"']*)["']/i.exec(m[0]);
        const href = /href=["']([^"']+)["']/i.exec(m[0]);
        if (rel && href && /\b(?:icon|apple-touch-icon|shortcut icon)\b/i.test(rel[1])) {
          return resolveUrl(url, href[1]);
        }
      }
      return '';
    } catch (_) { return ''; }
  }
  // 从地址获取网站自身图标：优先解析 HTML <link rel=icon>，其次探测常见图标路径；
  // 都不存在时返回内置默认图标。不依赖外网搜索引擎，局域网内同样可用。
  async function faviconFromUrl(u) {
    u = (u || '').trim();
    if (!u) return DEFAULT_SITE_ICON;
    const withScheme = /^https?:\/\//i.test(u) ? u : 'http://' + u.replace(/^\/+/, '');
    let base;
    try { base = new URL(withScheme); } catch (_) { return DEFAULT_SITE_ICON; }
    const origin = base.origin;
    const candidates = ['/favicon.ico', '/favicon.png', '/apple-touch-icon.png'];

    const [linkIcon, probes] = await Promise.all([
      linkTagIcon(base.href),
      Promise.all(candidates.map((p) => probeImage(origin + p, 1500))),
    ]);
    if (linkIcon) return linkIcon;
    const idx = probes.indexOf(true);
    if (idx >= 0) return origin + candidates[idx];
    return DEFAULT_SITE_ICON;
  }
  // 卡片背景：存储值（'' / 'transparent' / '#rrggbb'）↔ 表单状态（bg_style + bg_color）
  const DEFAULT_CARD_COLOR = '#4f6ef7';
  const DEFAULT_CARD_PRESETS = [
    '#f8fafc', '#eef2ff', '#e0e7ff', '#dbeafe', '#cffafe', '#ecfdf5',
    '#fefce8', '#fffbeb', '#fff7ed', '#fef2f2', '#f5f3ff', '#e2e8f0',
    '#4f6ef7', '#22c55e', '#eab308', '#f97316', '#ef4444', '#a855f7',
    '#0ea5e9', '#14b8a6', '#64748b', '#334155', '#0f172a', '#000000',
  ];
  function colorState(color) {
    const c = String(color || '');
    if (c === 'transparent') return { bg_style: 'transparent', bg_color: DEFAULT_CARD_COLOR };
    if (/^#[0-9a-fA-F]{6}$/.test(c)) return { bg_style: 'custom', bg_color: c };
    return { bg_style: 'default', bg_color: DEFAULT_CARD_COLOR };
  }
  function colorValue(bgStyle, bgColor) {
    if (bgStyle === 'transparent') return 'transparent';
    if (bgStyle === 'custom') {
      const hex = normalizeHex(bgColor);
      return hex ? '#' + hex : '';
    }
    return '';
  }
  // 规范化 hex：支持「4f6ef7」「#4F6EF7」「4f6」「4f6ef780」→ 输出 6 位小写十六进制（无 #），非法返回空
  function normalizeHex(v) {
    const s = String(v || '').trim().replace(/^#/, '').toLowerCase();
    if (/^[0-9a-f]{6}$/.test(s)) return s;
    if (/^[0-9a-f]{3}$/.test(s)) return s[0] + s[0] + s[1] + s[1] + s[2] + s[2];
    return '';
  }
  // 打开 Iconify 图标库选择面板（叠加在编辑弹窗之上，选中后回填图标字段）
  function openIconifyPicker(onPick) {
    const root = $('#modalRoot');
    // 移除旧的图标选择面板（如有）
    const old = root.querySelector('.iconify-overlay');
    if (old) old.remove();
    const ov = document.createElement('div');
    ov.className = 'modal-overlay iconify-overlay';
    ov.innerHTML = `
      <div class="modal iconify-modal">
        <div class="modal-head">
          <h3>Iconify 图标库</h3>
          <button type="button" class="modal-close" title="关闭">✕</button>
        </div>
        <div class="modal-body">
          <div class="modal-scroll">
            <div class="iconify-search">
              <input type="text" id="iconifyQuery" placeholder="输入关键词搜索图标，如 home / github / chart" autocomplete="off">
              <span class="iconify-tip">也可直接输入完整名称（如 <b>mdi:home</b>）回车获取</span>
            </div>
            <div class="iconify-grid" id="iconifyGrid">
              <div class="iconify-loading">输入关键词后回车搜索…</div>
            </div>
          </div>
        </div>
      </div>`;
    root.appendChild(ov);
    const q = ov.querySelector('#iconifyQuery');
    const grid = ov.querySelector('#iconifyGrid');
    const close = () => ov.remove();
    ov.addEventListener('click', (e) => {
      // 点击遮罩不关闭，仅 ✕ 关闭（选中图标时由 grid 点击自行 close）
      if (e.target.closest('.modal-close')) close();
    });
    // 点击某个图标
    grid.addEventListener('click', (e) => {
      const item = e.target.closest('.ico-item');
      if (!item) return;
      const name = item.dataset.name;
      close();
      if (onPick) onPick(name);
    });
    // 回车搜索 或 输入防抖搜索
    let t = null;
    const doSearch = () => {
      const kw = q.value.trim();
      if (!kw) { grid.innerHTML = '<div class="iconify-loading">输入关键词后回车搜索…</div>'; return; }
      grid.innerHTML = '<div class="iconify-loading">搜索中…</div>';
      fetch('https://api.iconify.design/search?query=' + encodeURIComponent(kw) + '&limit=60')
        .then(r => r.json())
        .then(data => {
          const icons = (data && data.icons) || [];
          if (!icons.length) { grid.innerHTML = '<div class="iconify-loading">未找到匹配图标</div>'; return; }
          grid.innerHTML = icons.map(name =>
            `<button type="button" class="ico-item" data-name="iconify:${name}" title="${name}">
               <img src="https://api.iconify.design/${name}.svg" alt="" loading="lazy">
               <span class="ico-name">${escapeHtml(name)}</span>
             </button>`).join('');
        })
        .catch(() => { grid.innerHTML = '<div class="iconify-loading">搜索失败，请检查网络</div>'; });
    };
    q.addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); doSearch(); } });
    q.addEventListener('input', () => { clearTimeout(t); t = setTimeout(doSearch, 450); });
    setTimeout(() => q.focus(), 60);
  }

  // 通用确认对话框（二次确认）
  function openConfirm({ title, message, confirmText = '确定', danger = false, onConfirm }) {
    const root = $('#modalRoot');
    closeModal();
    const ov = document.createElement('div');
    ov.className = 'modal-overlay';
    ov.innerHTML = `
      <div class="modal confirm-modal">
        <div class="modal-head">
          <h3>${title}</h3>
          <button type="button" class="modal-close" title="关闭">✕</button>
        </div>
        <div class="modal-body">
          <div class="modal-scroll"><p class="confirm-msg">${message}</p></div>
          <div class="modal-foot">
            <button type="button" class="btn btn-ghost" data-cancel>取消</button>
            <button type="button" class="btn ${danger ? 'btn-danger' : 'btn-primary'} confirm-ok">${confirmText}</button>
          </div>
        </div>
      </div>`;
    root.appendChild(ov);
    ov.addEventListener('click', (e) => {
      // 仅允许通过 ✕ / 取消按钮关闭；点击遮罩不关闭，避免误触丢失操作意图
      if (e.target.closest('[data-cancel]') || e.target.closest('.modal-close')) closeModal();
    });
    ov.querySelector('.confirm-ok').addEventListener('click', () => {
      closeModal();
      if (onConfirm) onConfirm();
    });
  }

  function fieldHtml(f) {
    const v = (f.value === undefined || f.value === null) ? '' : String(f.value).replace(/"/g, '&quot;');
    const req = f.required ? ' required' : '';
    if (f.type === 'divider') {
      return `<div class="modal-divider">${f.label}</div>`;
    }
    if (f.type === 'checkbox') {
      return `<div class="check-wrap">
        <label class="check-row">
          <input type="checkbox" name="${f.name}" ${v === '1' || f.value === true ? 'checked' : ''}>
          <span>${f.label}</span>
        </label>
        ${f.hint ? `<span class="hint check-hint">${f.hint}</span>` : ''}
      </div>`;
    }
    if (f.type === 'select') {
      const opts = f.options.map(o => `<option value="${o[0]}" ${String(o[0]) === v ? 'selected' : ''}>${o[1]}</option>`).join('');
      // groupAddBtn：在「所属分组」下拉框后追加内联「＋」新增分组按钮
      const inner = f.groupAddBtn
        ? `<div class="select-with-add"><select name="${f.name}">${opts}</select><button type="button" class="group-inline-add" data-act="group-inline-add" title="新建分组">＋</button></div>`
        : `<select name="${f.name}">${opts}</select>`;
      return `<div class="form-row"><span>${f.label}</span>${inner}${f.hint ? `<span class="hint">${f.hint}</span>` : ''}</div>`;
    }
    if (f.type === 'textarea') {
      return `<div class="form-row"><span>${f.label}</span>
        <textarea name="${f.name}" placeholder="${f.placeholder || ''}"${req}>${v}</textarea>
        ${f.hint ? `<span class="hint">${f.hint}</span>` : ''}</div>`;
    }
    if (f.type === 'color') {
      return `<div class="form-row"><span>${f.label}</span><div class="color-row">
        <input type="color" name="${f.name}" value="${v}"><span class="color-preview">${v}</span>
      </div></div>`;
    }
    if (f.type === 'cardcolor') {
      // 卡片背景色：预设色板 + 可输入的 hex 文本框（实时预览）
      const presets = f.presets || DEFAULT_CARD_PRESETS;
      const cur = /^#[0-9a-fA-F]{6}$/.test(v) ? v : '';
      return `<div class="form-row"><span>${f.label}</span>
        <div class="cardcolor-row">
          <div class="cc-swatches">
            ${presets.map(c => `<button type="button" class="cc-swatch${cur.toLowerCase() === c ? ' active' : ''}" data-cc="${c}" style="background:${c}" title="${c}"></button>`).join('')}
          </div>
          <div class="cc-input">
            <span class="cc-hash">#</span>
            <input name="${f.name}" value="${cur ? cur.slice(1) : ''}" maxlength="6" placeholder="输入 hex，如 4f6ef7" autocomplete="off">
            <span class="cc-preview" data-cc-preview style="background:${cur || 'transparent'}"></span>
          </div>
        </div>
        ${f.hint ? `<span class="hint">${f.hint}</span>` : ''}
      </div>`;
    }
    if (f.type === 'bgimage') {
      // 背景图片字段：URL 输入 + 本地上传按钮 + 已上传图库选择
      return `<div class="form-row"><span>${f.label}</span>
        <div class="url-input">
          <input type="text" name="${f.name}" value="${v}" placeholder="${f.placeholder || 'https://…/bg.jpg 或上传/选择'}"${req}>
          <button type="button" class="bg-upload" data-bg-gallery title="从已上传的图库中选择">图库</button>
          <button type="button" class="bg-upload" data-bg-upload title="从本地上传背景图片">上传</button>
        </div>
        ${f.hint ? `<span class="hint">${f.hint}</span>` : ''}
      </div>`;
    }
    if (f.type === 'icon') {
      // 图标字段：输入框（支持 emoji / 图片URL / iconify:名称）+ 图标库按钮
      // f.upload=true 时额外提供「上传图片」按钮（如网站 LOGO：JPG/PNG/SVG 本地上传）
      // label 后的「浏览图标库」是纯 <a> 外链（新标签页打开 Iconify 官方图标集）：
      // 无 name 属性不参与表单取值，也不会提交表单或关闭弹窗，故无需额外拦截事件。
      return `<div class="form-row icon-form-row"><span>${f.label}<a class="browse-icons-link"
          href="https://icon-sets.iconify.design/" target="_blank" rel="noopener noreferrer"
          title="在新标签页打开 Iconify 图标库，可搜索并复制图标名">浏览图标库</a></span>
        <div class="icon-input">
          <input name="${f.name}" value="${v}" placeholder="${f.placeholder || 'emoji / 图片URL / iconify:图标名'}"${req}>
          <button type="button" class="icon-pick iconify" data-icon-pick="iconify" title="从 Iconify 在线图标库选取">图标库</button>
          ${f.upload ? `<button type="button" class="icon-pick upload" data-icon-upload title="从本地上传 LOGO 图片（JPG / PNG / SVG）">上传图片</button>` : ''}
        </div>
        <span class="icon-preview" data-icon-preview></span>
        ${f.hint ? `<span class="hint">${f.hint}</span>` : ''}
      </div>`;
    }
    if (f.favicon) {
      // 地址输入框 + 右侧「获取图标」按钮（从该地址获取网站图标）
      const type = f.type === 'url' ? 'url' : 'text';
      return `<div class="form-row"><span>${f.label}</span>
        <div class="url-input">
          <input type="${type}" name="${f.name}" value="${v}" placeholder="${f.placeholder || ''}"${req}>
          <button type="button" class="fav-get" data-icon-field="icon" title="从该地址获取网站图标">获取图标</button>
        </div>
        ${f.hint ? `<span class="hint">${f.hint}</span>` : ''}
      </div>`;
    }
    const type = f.type === 'password' ? 'password'
      : f.type === 'url' ? 'url'
      : f.type === 'number' ? 'number' : 'text';
    const extra = f.type === 'number' ? ` min="${f.min || 0}" max="${f.max || 80}" step="1"` : '';
    return `<div class="form-row"><span>${f.label}</span>
      <input type="${type}" name="${f.name}" value="${v}" placeholder="${f.placeholder || ''}"${extra}${req}>
      ${f.hint ? `<span class="hint">${f.hint}</span>` : ''}</div>`;
  }

  /* ---------------- 分组/链接操作（事件委托） ---------------- */
  document.addEventListener('click', (e) => {
    const btn = e.target.closest('[data-act]');
    if (!btn || e.target.closest('#ctxMenu')) return;
    e.preventDefault();
    e.stopPropagation();
    const act = btn.dataset.act;
    const id = btn.dataset.id;
    const gid = btn.dataset.gid;

    switch (act) {
      /* ---- 分组 ---- */
      case 'add-group': {
        openModal({
          title: '新建分组',
          fields: [
            { name: 'name', label: '分组名称', required: true, placeholder: '例如：开发环境' },
            { name: 'icon', label: '分组图标', type: 'icon', placeholder: 'emoji（如 📁）、图片URL、或 iconify:图标名' },
          ],
          submitText: '创建',
          onSubmit: async (d) => {
            if (!d.name) return toast('请输入分组名称', true);
            await api('add_group', d).then(() => location.reload());
          },
        });
        break;
      }
      case 'edit-group': {
        const name = $('.group-name', btn.closest('.group')).textContent;
        const gicon = btn.closest('.group').dataset.icon || '';
        openModal({
          title: '编辑分组',
          fields: [
            { name: 'name', label: '分组名称', value: name, required: true },
            { name: 'icon', label: '分组图标', type: 'icon', value: gicon, placeholder: 'emoji（如 📁）、图片URL、或 iconify:图标名' },
          ],
          submitText: '保存',
          onSubmit: async (d) => {
            if (!d.name) return toast('请输入分组名称', true);
            await api('update_group', { id, ...d }).then(() => location.reload());
          },
        });
        break;
      }
      case 'del-group': {
        openConfirm({
          title: '删除分组',
          message: '确定要删除该分组吗？分组内所有收藏将一并删除，此操作不可撤销。',
          confirmText: '删除',
          danger: true,
          onConfirm: () => api('delete_group', { id }).then(() => location.reload()),
        });
        break;
      }

      /* ---- 链接 ---- */
      case 'add-link': {
        const groups = $$('.group');
        const gidVal = gid || (groups[0] ? groups[0].dataset.group : '');
        openModal({
          title: '添加收藏',
          fields: [
            { name: 'name', label: '名称', required: true, placeholder: '例如：研发 Wiki' },
            { name: 'url', label: '默认地址', type: 'url', favicon: true, required: true, placeholder: 'http://example.com' },
            { name: 'url_lan', label: '内网地址', type: 'url', favicon: true, placeholder: 'http://192.168.1.10:3000', hint: '可选，留空则内网模式回退到默认地址' },
            { name: 'url_ipv6', label: 'IPv6 地址', type: 'url', favicon: true, placeholder: 'http://[fd00::1]:3000', hint: '可选，留空则 IPv6 模式回退到默认地址' },
            { name: 'description', label: '描述', placeholder: '可选，一句话说明' },
            { name: 'icon', label: '图标', type: 'icon', placeholder: 'emoji（如 🔧）、图片URL、或 iconify:图标名' },
            { name: 'bg_style', label: '卡片背景', type: 'select', value: 'custom',
              options: [['default', '默认背景'], ['transparent', '透明背景'], ['custom', '自定义颜色']],
              hint: '选择「自定义颜色」后从下方色板选取或直接输入 hex' },
            { name: 'bg_color', label: '自定义颜色', type: 'cardcolor', value: DEFAULT_CARD_PRESETS[0], hint: '点击色块或输入 6 位 hex 值' },
            {
              name: 'group_id', label: '所属分组', type: 'select', value: gidVal, groupAddBtn: true,
              options: groupOptions().map((o, i) => [o[0], o[1] + (i === 0 ? '（默认）' : '')]),
            },
          ],
          submitText: '添加',
          onSubmit: async (d) => {
            if (!d.name || !d.url) return toast('名称和默认地址为必填项', true);
            await api('add_link', { ...d, color: colorValue(d.bg_style, d.bg_color) }).then(() => location.reload());
          },
        });
        break;
      }
      case 'edit-link': {
        handleEditLink(btn);
        break;
      }
      case 'del-link': {
        openConfirm({
          title: '删除收藏',
          message: '确定要删除该收藏吗？此操作不可撤销。',
          confirmText: '删除',
          danger: true,
          onConfirm: () => api('delete_link', { id }).then(() => location.reload()),
        });
        break;
      }
    }
  });

  /* 独立出的编辑入口（右键菜单与按钮共用） */
  function handleEditLink(btn, cardOverride) {
    const card = cardOverride || btn.closest('.card') || ctxCard;
    if (!card) { toast('未找到要编辑的收藏', true); return; }
    const color = colorState(card.dataset.color);
    openModal({
      title: '编辑收藏',
      fields: [
        { name: 'name', label: '名称', value: card.dataset.name, required: true },
        { name: 'url', label: '默认地址', type: 'url', favicon: true, value: card.dataset.uDefault, required: true },
        { name: 'url_lan', label: '内网地址', type: 'url', favicon: true, value: card.dataset.uLan, placeholder: 'http://192.168.1.10' },
        { name: 'url_ipv6', label: 'IPv6 地址', type: 'url', favicon: true, value: card.dataset.uIpv6, placeholder: 'http://[fd00::1]' },
        { name: 'description', label: '描述', value: $('.card-desc', card) ? $('.card-desc', card).textContent : '' },
        { name: 'icon', label: '图标', type: 'icon', value: card.dataset.icon || '', placeholder: 'emoji / 图片URL / iconify:图标名' },
        { name: 'bg_style', label: '卡片背景', type: 'select', value: color.bg_style,
          options: [['default', '默认背景'], ['transparent', '透明背景'], ['custom', '自定义颜色']],
          hint: '选择「自定义颜色」后从下方色板选取或直接输入 hex' },
        { name: 'bg_color', label: '自定义颜色', type: 'cardcolor', value: color.bg_color, hint: '点击色块或输入 6 位 hex 值' },
        {
          name: 'group_id', label: '所属分组', type: 'select', groupAddBtn: true,
          value: card.closest('.group').dataset.group,
          options: groupOptions(),
        },
      ],
      submitText: '保存',
      onSubmit: async (d) => {
        if (!d.name || !d.url) return toast('名称和默认地址为必填项', true);
        await api('update_link', { id: btn.dataset.id || ctxCard.dataset.lid, ...d, color: colorValue(d.bg_style, d.bg_color) }).then(() => location.reload());
      },
    });
  }

  /* ---------------- 右键菜单（打开默认/内网/IPv6 + 编辑 / 删除） ---------------- */
  const ctxMenu = $('#ctxMenu');
  let ctxCard = null;
  let ctxLeaveTimer = null;

  function showCtxMenu(x, y, card) {
    ctxCard = card;
    clearTimeout(ctxLeaveTimer);
    // 打开地址：仅显示已配置的地址
    const openItems = [
      { label: '🌐  打开默认地址', url: card.dataset.uDefault },
      { label: '🏠  打开内网地址', url: card.dataset.uLan },
      { label: '🔗  打开 IPv6 地址', url: card.dataset.uIpv6 },
    ].filter((it) => it.url);
    const items = [
      ...openItems.map((it) => ({ ...it, act: 'open-url', danger: false })),
      ...(openItems.length ? [{ divider: true }] : []),
      { label: '✎  编辑', act: 'edit-link', id: card.dataset.lid, danger: false },
      { label: '🗑  删除', act: 'del-link', id: card.dataset.lid, danger: true },
    ];
    ctxMenu.innerHTML = items.map((it) =>
      it.divider
        ? '<div class="ctx-sep"></div>'
        : `<button class="ctx-item${it.danger ? ' danger' : ''}" data-act="${it.act}" data-id="${it.id || ''}" data-url="${it.url || ''}">${it.label}</button>`
    ).join('');
    ctxMenu.hidden = false;
    const mw = 190, mh = ctxMenu.offsetHeight;
    const vw = document.documentElement.clientWidth, vh = document.documentElement.clientHeight;
    ctxMenu.style.left = Math.min(x, vw - mw - 8) + 'px';
    ctxMenu.style.top = Math.min(y, vh - mh - 8) + 'px';
  }
  function hideCtxMenu() {
    ctxMenu.hidden = true;
    ctxCard = null;
    clearTimeout(ctxLeaveTimer);
  }

  document.addEventListener('contextmenu', (e) => {
    const card = e.target.closest('a.card');
    if (card) {
      e.preventDefault();
      showCtxMenu(e.clientX, e.clientY, card);
      // 为卡片绑定一次离开监听：鼠标离开卡片 0.5 秒后菜单消失（移回则取消）
      if (!card.dataset.ctxBound) {
        card.dataset.ctxBound = '1';
        card.addEventListener('mouseleave', () => {
          clearTimeout(ctxLeaveTimer);
          ctxLeaveTimer = setTimeout(hideCtxMenu, 500);
        });
        card.addEventListener('mouseenter', () => clearTimeout(ctxLeaveTimer));
      }
    }
  });
  document.addEventListener('click', (e) => {
    if (!e.target.closest('#ctxMenu')) hideCtxMenu();
  });
  window.addEventListener('scroll', hideCtxMenu, true);
  ctxMenu.addEventListener('mouseenter', () => clearTimeout(ctxLeaveTimer));
  ctxMenu.addEventListener('click', (e) => {
    const b = e.target.closest('[data-act]');
    if (!b) return;
    e.preventDefault();
    e.stopPropagation();
    if (b.dataset.act === 'edit-link') {
      // 先捕获当前卡片引用，再隐藏菜单（隐藏会把 ctxCard 置空）
      const card = ctxCard;
      hideCtxMenu();
      if (!card) return;
      const fakeBtn = document.createElement('button');
      fakeBtn.dataset.id = b.dataset.id;
      handleEditLink(fakeBtn, card);
      return;
    }
    hideCtxMenu();
    if (b.dataset.act === 'open-url') {
      window.open(b.dataset.url, '_blank', 'noopener');
    } else if (b.dataset.act === 'del-link') {
      openConfirm({
        title: '删除收藏',
        message: '确定要删除该收藏吗？此操作不可撤销。',
        confirmText: '删除',
        danger: true,
        onConfirm: () => api('delete_link', { id: b.dataset.id }).then(() => location.reload()),
      });
    }
  });

  /* ---------------- 卡片拖拽排序（自定义指针拖拽 + FLIP 让位动画） ----------------
     说明：改为自研指针拖拽（pointerdown/move/up），放弃原生 HTML5 DnD 的卡片分支
     （分组拖拽仍用原生 DnD）。拖拽时在目标槽位插入一个占位格，其余卡片通过
     FLIP 平滑滑动"让位"，视觉上清晰地感知卡片在移动。 */
  const DRAG_THRESHOLD = 5;          // 位移超过该像素才真正开始拖拽（保留单击打开）
  const FLIP_DURATION = 320;         // 让位动画时长(ms)
  let dstate = null;                 // 当前卡片拖拽状态
  let dragJustEnded = 0;             // 拖拽结束时刻（用于抑制误触发 click）
  const dragSlot = document.createElement('div');
  dragSlot.className = 'drag-slot';
  let gdState = null;                // 当前分组拖拽状态（与卡片拖拽互斥）
  const gSlot = document.createElement('div');
  gSlot.className = 'group-slot';

  function gridGap(grid) {
    const g = getComputedStyle(grid).gap || getComputedStyle(grid).columnGap || '12px';
    const n = parseFloat(g);
    return isNaN(n) ? 12 : n;
  }
  // 由光标坐标计算目标插入槽位（基于网格行列几何）
  function targetIndex(grid, cx, cy) {
    const cards = $$('.card', grid).filter((c) => c.style.display !== 'none');
    if (!cards.length) return 0;
    const gap = gridGap(grid);
    const gridR = grid.getBoundingClientRect();
    const c0 = cards[0].getBoundingClientRect();
    const colW = c0.width + gap;
    const rowH = c0.height + gap;
    const cols = Math.max(1, Math.round((gridR.width + gap) / colW));
    // 光标在末行下方 → 追加到末尾
    if (cy > gridR.bottom + rowH / 2) return cards.length;
    const rowRaw = Math.floor((cy - gridR.top) / rowH);
    if (rowRaw >= Math.ceil(cards.length / cols)) return cards.length;
    const row = Math.max(0, rowRaw);
    const col = Math.min(Math.max(Math.floor((cx - gridR.left) / colW), 0), cols - 1);
    let idx = row * cols + col;
    if (idx < 0) idx = 0;
    if (idx > cards.length) idx = cards.length;
    return idx;
  }
  // FLIP 播放：把其它卡片从旧位置平滑滑到新位置（优雅让位，非直来直去）
  function flipCards(cards, first) {
    cards.forEach((c) => {
      const f = first.get(c);
      if (!f) return;
      const last = c.getBoundingClientRect();
      const dx = f.left - last.left, dy = f.top - last.top;
      if (!dx && !dy) return;
      // Invert：禁用过渡，把卡片逆移到视觉旧位置
      c.style.transition = 'none';
      c.style.transform = `translate(${dx}px, ${dy}px)`;
      void c.offsetWidth; // 强制回流
      // Play：启用平滑过渡，清除 transform，卡片滑向新位置
      c.style.transition = `transform ${FLIP_DURATION}ms cubic-bezier(.22,1,.36,1)`;
      c.style.transform = '';
      clearTimeout(c._flipT);
      c._flipT = setTimeout(() => { c.style.transition = ''; c.style.transform = ''; }, FLIP_DURATION + 40);
    });
  }
  // 把占位格移动到目标槽位，并让其它卡片让位
  function applySlot(grid, index) {
    // 排除被拖卡片本身：固定定位后它的 getBoundingClientRect 跟随光标，
    // 参与 FLIP 会算出离谱 dx/dy 干扰让位动画
    const cards = $$('.card', grid).filter((c) => c.style.display !== 'none' && c !== dstate.card);
    const first = new Map(cards.map((c) => [c, c.getBoundingClientRect()]));
    if (index <= 0) grid.insertBefore(dragSlot, cards[0] || null);
    else if (index >= cards.length) grid.appendChild(dragSlot);
    else grid.insertBefore(dragSlot, cards[index]);
    flipCards(cards, first);
  }
  // 光标所在网格（卡片被 pointer-events:none，不会挡住命中检测）
  function gridAt(cx, cy) {
    const el = document.elementFromPoint(cx, cy);
    return el ? el.closest('.grid') : null;
  }
  function moveDragged(cx, cy) {
    dstate.card.style.left = (cx + dstate.offX) + 'px';
    dstate.card.style.top = (cy + dstate.offY) + 'px';
  }
  // 卡片滚动容器边缘自动滚动（拖到容器边缘时让卡片容器跟随滚动，不滚动整个页面）
  function edgeScroll(cx, cy) {
    const m = 54, sp = 12;
    const scroller = $('#mainScroll');
    if (!scroller) return;
    const r = scroller.getBoundingClientRect();
    if (cy < r.top + m) scroller.scrollTop -= sp;
    else if (cy > r.bottom - m) scroller.scrollTop += sp;
  }
  function cancelCardDrag() {
    if (!dstate) return;
    if (dstate.active) {
      // 取消拖拽：把占位格移回源网格，再让卡片回到原位（不做持久化）
      if (dstate.curGrid && dstate.curGrid !== dstate.sourceGrid) {
        dragSlot.remove();
        dstate.sourceGrid.appendChild(dragSlot);
      }
      dragSlot.replaceWith(dstate.card);
      dstate.card.classList.remove('dragging');
      dstate.card.style.cssText = dstate.origStyle || '';
      dstate.curGrid && dstate.curGrid.classList.remove('drag-active');
      dstate.sourceGrid.classList.remove('drag-active');
      dragJustEnded = Date.now();
    }
    document.body.style.userSelect = '';
    dstate = null;
  }
  function finishCardDrag() {
    if (!dstate || !dstate.active) { dstate = null; return; }
    const source = dstate.sourceGrid, target = dstate.curGrid || source;
    // 卡片放入目标网格占位位置，并移除占位格
    target.insertBefore(dstate.card, dragSlot);
    dragSlot.remove();
    dstate.card.classList.remove('dragging');
    dstate.card.style.cssText = dstate.origStyle || '';
    source.classList.remove('drag-active');
    if (target !== source) target.classList.remove('drag-active');
    document.body.style.userSelect = '';
    // 提交排序
    const updates = [{
      group_id: target.dataset.group,
      ids: $$('.card', target).filter((c) => c.style.display !== 'none').map((c) => c.dataset.lid),
    }];
    if (target !== source) {
      updates.push({
        group_id: source.dataset.group,
        ids: $$('.card', source).filter((c) => c.style.display !== 'none').map((c) => c.dataset.lid),
      });
    }
    api('reorder_links', { updates })
      .then(() => {
        if (target !== source) refreshGroupCounts([target.dataset.group, source.dataset.group]);
      })
      .catch((err) => { toast(err.message, true); location.reload(); });
    dragJustEnded = Date.now();
    dstate = null;
  }
  // 刷新分组计数（组内徽标 + 侧栏导航）
  function refreshGroupCounts(gids) {
    gids.forEach((gid) => {
      const grid = $(`.grid[data-group="${gid}"]`);
      const n = grid ? $$('.card', grid).filter((c) => c.style.display !== 'none').length : 0;
      const head = $(`#g${gid} .group-count`);
      if (head) head.textContent = n;
      const side = $(`.side-item[data-target="#g${gid}"] .side-count`);
      if (side) side.textContent = n;
    });
  }

  // 卡片与分组均使用自定义指针拖拽，统一阻止浏览器原生 HTML5 拖拽（避免拖影/文本拖选干扰）
  document.addEventListener('dragstart', (e) => { e.preventDefault(); });

  // 自定义指针拖拽（卡片 + 分组统一入口，二者互斥）
  document.addEventListener('pointerdown', (e) => {
    if (e.button !== 0) return;
    const card = e.target.closest('a.card');
    if (card) {
      const grid = card.closest('.grid');
      if (!grid) return;
      dstate = {
        card, grid, sourceGrid: grid, curGrid: grid,
        startX: e.clientX, startY: e.clientY,
        active: false,
      };
      return;
    }
    // 分组头（避开其上的按钮）：按住分组名称/空白区域拖动分组
    const head = e.target.closest('.group-head');
    if (head && !e.target.closest('button')) {
      const group = head.closest('.group');
      if (!group) return;
      gdState = { group, startX: e.clientX, startY: e.clientY, active: false };
    }
  });
  document.addEventListener('pointermove', (e) => {
    if (dstate) {
      if (!dstate.active) {
        const dx = e.clientX - dstate.startX, dy = e.clientY - dstate.startY;
        if (dx * dx + dy * dy < DRAG_THRESHOLD * DRAG_THRESHOLD) return;
        // 真正开始拖拽
        const r = dstate.card.getBoundingClientRect();
        dstate.card.classList.add('dragging');
        // 保留卡片原有内联样式（尤其自定义背景色），只叠加固定定位样式，避免拖拽时变空白
        dstate.origStyle = dstate.card.style.cssText;
        dstate.card.style.cssText =
          (dstate.origStyle ? dstate.origStyle + ';' : '') +
          `position:fixed;left:${r.left}px;top:${r.top}px;width:${r.width}px;height:${r.height}px;margin:0;z-index:400;`;
        // 把占位格插入到卡片前面（占位格占住卡片原槽位，避免行高塌陷跳变）
        // 注意：不要 remove 卡片！卡片保持 DOM 中、转 fixed 跟随光标；若 remove 则 fixed 定位的卡片不在文档树中渲染，导致"拖拽时空白"
        dragSlot.style.height = r.height + 'px';
        dstate.grid.insertBefore(dragSlot, dstate.card);
        dstate.grid.classList.add('drag-active');
        document.body.style.userSelect = 'none';
        // 记录"按下点相对卡片左上角"的偏移：拖动时让卡片保持鼠标按住的位置，
        // 而不是把左上角直接贴到鼠标处（旧公式用卡片中心-当前鼠标，按下在中心时 offX≈0，导致卡片左上角跳向鼠标）
        dstate.offX = r.left - dstate.startX;
        dstate.offY = r.top - dstate.startY;
        dstate.lastIndex = -1;
        dstate.active = true;
      }
      moveDragged(e.clientX, e.clientY);
      edgeScroll(e.clientX, e.clientY);
      // 目标网格（跨组：进入其它网格时切换占位格）
      const target = gridAt(e.clientX, e.clientY) || dstate.sourceGrid;
      if (target !== dstate.curGrid) {
        dragSlot.remove();
        target.appendChild(dragSlot);
        target.classList.add('drag-active');
        if (dstate.curGrid !== target) dstate.curGrid.classList.remove('drag-active');
        dstate.curGrid = target;
        dstate.lastIndex = -1;
      }
      const idx = targetIndex(target, e.clientX, e.clientY);
      if (idx !== dstate.lastIndex) {
        dstate.lastIndex = idx;
        applySlot(target, idx);
      }
      return;
    }
    if (!gdState) return;
    if (!gdState.active) {
      const dx = e.clientX - gdState.startX, dy = e.clientY - gdState.startY;
      if (dx * dx + dy * dy < DRAG_THRESHOLD * DRAG_THRESHOLD) return;
      startGroupDrag();
    }
    moveGroup(e.clientX, e.clientY);
    edgeScroll(e.clientX, e.clientY);
    const idx = groupTargetIndex(e.clientY);
    if (idx !== gdState.lastIndex) {
      gdState.lastIndex = idx;
      applyGroupSlot(idx);
    }
  });
  document.addEventListener('pointerup', () => { if (dstate) finishCardDrag(); else if (gdState) finishGroupDrag(); });
  document.addEventListener('pointercancel', () => { if (dstate) cancelCardDrag(); else if (gdState) cancelGroupDrag(); });
  window.addEventListener('blur', () => { if (dstate) cancelCardDrag(); else if (gdState) cancelGroupDrag(); });
  document.addEventListener('visibilitychange', () => { if (document.hidden) { if (dstate) cancelCardDrag(); else if (gdState) cancelGroupDrag(); } });
  document.addEventListener('keydown', (e) => {
    if (e.key !== 'Escape') return;
    if (dstate && dstate.active) cancelCardDrag();
    else if (gdState && gdState.active) cancelGroupDrag();
  });

  // 拖拽结束后短暂抑制紧随其后的 click，避免拖放后误触发打开链接（卡片与分组共用）
  document.addEventListener('click', (e) => {
    if (dragJustEnded && Date.now() - dragJustEnded < 300 && e.target.closest('a.card')) {
      e.preventDefault(); e.stopPropagation(); e.stopImmediatePropagation();
    }
  }, true);

  /* ---------------- 分组拖拽排序（自研指针拖拽 + FLIP，与卡片完全一致的丝滑体验） ---------------- */
  // 分组在 .main-scroll 滚动容器内（a70b0f2 起），拖拽 DOM 重排必须基于该容器：
  // 若用 .main 做 insertBefore，referenceNode（.main-scroll 内分组）非其直接子节点会抛 NotFoundError，拖拽即崩
  const mainEl = $('.main-scroll');

  // 由光标 Y 坐标计算目标槽位：与卡片 targetIndex 同理，纵向线性扫描
  function groupTargetIndex(cy) {
    const groups = $$('.group', mainEl).filter((g) => g !== gdState.group);
    for (let i = 0; i < groups.length; i++) {
      const r = groups[i].getBoundingClientRect();
      if (cy < r.top + r.height / 2) return i;
    }
    return groups.length;
  }
  // 把占位格移动到目标槽位，其余分组通过 FLIP 平滑让位
  function applyGroupSlot(index) {
    const groups = $$('.group', mainEl).filter((g) => g !== gdState.group);
    const first = new Map(groups.map((g) => [g, g.getBoundingClientRect()]));
    if (index <= 0) mainEl.insertBefore(gSlot, groups[0] || null);
    else if (index >= groups.length) mainEl.appendChild(gSlot);
    else mainEl.insertBefore(gSlot, groups[index]);
    flipCards(groups, first); // 复用同一套 FLIP 让位动画
  }
  // 被拖分组跟随光标（保留"按住点"偏移，不跳变）
  function moveGroup(cx, cy) {
    gdState.group.style.left = (cx + gdState.offX) + 'px';
    gdState.group.style.top = (cy + gdState.offY) + 'px';
  }
  // 真正开始拖拽：分组转 fixed 跟随光标，插入占位格顶替原槽位
  function startGroupDrag() {
    const r = gdState.group.getBoundingClientRect();
    gdState.group.classList.add('dragging');
    // 保留原有内联样式，只叠加固定定位，避免拖拽时丢背景/圆角等
    gdState.origStyle = gdState.group.style.cssText;
    gdState.group.style.cssText =
      (gdState.origStyle ? gdState.origStyle + ';' : '') +
      `position:fixed;left:${r.left}px;top:${r.top}px;width:${r.width}px;margin:0;z-index:410;`;
    gSlot.style.height = r.height + 'px';
    mainEl.insertBefore(gSlot, gdState.group);
    document.body.style.userSelect = 'none';
    gdState.offX = r.left - gdState.startX;
    gdState.offY = r.top - gdState.startY;
    gdState.lastIndex = -1;
    gdState.active = true;
  }
  // 取消：移除占位格，分组回原位，其余分组 FLIP 滑回
  function cancelGroupDrag() {
    if (!gdState) return;
    if (gdState.active) {
      const groups = $$('.group', mainEl).filter((g) => g !== gdState.group);
      const first = new Map(groups.map((g) => [g, g.getBoundingClientRect()]));
      gSlot.remove();
      gdState.group.classList.remove('dragging');
      gdState.group.style.cssText = gdState.origStyle || '';
      flipCards(groups, first);
      dragJustEnded = Date.now();
    }
    document.body.style.userSelect = '';
    gdState = null;
  }
  // 完成：DOM 重排到目标槽位 + FLIP 从光标处滑入 + 提交新顺序（不刷新页面）
  function finishGroupDrag() {
    if (!gdState || !gdState.active) { gdState = null; return; }
    // 先把分组在 DOM 中移到目标槽位（占位格所在位置），再移除占位格
    mainEl.insertBefore(gdState.group, gSlot);
    gSlot.remove();
    // FLIP：分组从光标所在视觉位置平滑滑入目标槽位
    const last = gdState.group.getBoundingClientRect();
    gdState.group.classList.remove('dragging');
    gdState.group.style.cssText = gdState.origStyle || '';
    const first = gdState.group.getBoundingClientRect();
    const dx = last.left - first.left, dy = last.top - first.top;
    if (dx || dy) {
      gdState.group.style.transition = 'none';
      gdState.group.style.transform = `translate(${dx}px, ${dy}px)`;
      void gdState.group.offsetWidth;
      gdState.group.style.transition = `transform ${FLIP_DURATION}ms cubic-bezier(.22,1,.36,1)`;
      gdState.group.style.transform = '';
      clearTimeout(gdState.group._flipT);
      // 定时器在 FLIP_DURATION+40ms 后才触发，届时 gdState 已置 null——提前缓存分组引用，
      // 回调内不得再访问 gdState.group（否则抛 TypeError: Cannot read properties of null）
      const _g = gdState.group;
      gdState.group._flipT = setTimeout(() => {
        _g.style.transition = '';
        _g.style.transform = '';
      }, FLIP_DURATION + 40);
    }
    document.body.style.userSelect = '';
    // 提交新顺序（成功无需刷新，DOM 已就位；失败刷新回滚）
    const ids = $$('.group', mainEl).map((g) => g.dataset.group);
    api('reorder_groups', { ids })
      .then(() => syncSidebarOrder(ids))
      .catch((err) => { toast(err.message, true); location.reload(); });
    dragJustEnded = Date.now();
    gdState = null;
  }
  // 同步左侧分组导航顺序（DOM 重排，无刷新）
  function syncSidebarOrder(ids) {
    const inner = $('#sideNav .side-inner');
    if (!inner) return;
    ids.forEach((id) => {
      const item = inner.querySelector(`.side-item[data-target="#g${id}"]`);
      if (item) inner.appendChild(item);
    });
  }

  /* ---------------- 分组名悬浮「＋」添加按钮（移开 2 秒未点击自动隐藏） ---------------- */
  $$('.group-head').forEach((head) => {
    const name = $('.group-name', head);
    const btn = $('.add-link-btn', head);
    if (!name || !btn) return;
    let timer = null;
    const cancel = () => clearTimeout(timer);
    const schedule = () => { cancel(); timer = setTimeout(() => btn.classList.remove('show'), 2000); };

    name.addEventListener('mouseenter', () => { cancel(); btn.classList.add('show'); });
    btn.addEventListener('mouseenter', cancel);
    name.addEventListener('mouseleave', schedule);
    btn.addEventListener('mouseleave', schedule);
    btn.addEventListener('click', () => cancel()); // 点击后保持显示，移开后仍按 2 秒隐藏
  });

  /* ---------------- 侧栏「分组导航」标题悬浮「＋」添加分组按钮（移开 2 秒自动隐藏） ---------------- */
  const sideTitleEl = $('.side-title');
  if (sideTitleEl) {
    const sbtn = $('.side-add-group', sideTitleEl);
    if (sbtn) {
      let stTimer = null;
      const sCancel = () => clearTimeout(stTimer);
      const sSchedule = () => { sCancel(); stTimer = setTimeout(() => sbtn.classList.remove('show'), 2000); };
      sideTitleEl.addEventListener('mouseenter', () => { sCancel(); sbtn.classList.add('show'); });
      sbtn.addEventListener('mouseenter', sCancel);
      sideTitleEl.addEventListener('mouseleave', sSchedule);
      sbtn.addEventListener('mouseleave', sSchedule);
      sbtn.addEventListener('click', () => sCancel()); // 点击后保持显示，移开后仍按 2 秒隐藏
    }
  }

  /* ---------------- 站点设置（两栏：左侧分类导航 + 右侧配置项，点击左侧滚动到对应分组） ---------------- */
  function openSettingsModal(s) {
    const root = $('#modalRoot');
    closeModal();
    // 设置项按分类分组：左侧导航 + 右侧分区表单
    const groups = [
      {
        id: 'set-sec-basic', title: '基本设置',
        fields: [
          { name: 'site_title', label: '站点名称', value: s.site_title, required: true },
          { name: 'site_subtitle', label: '副标题', value: s.site_subtitle },
          { name: 'site_icon', label: '站点图标', type: 'icon', value: s.site_icon, placeholder: 'emoji、图片URL、或 iconify:图标名', hint: '浏览器标签页/收藏夹显示的图标，留空使用默认 logo' },
          { name: 'site_logo', label: '网站 LOGO', type: 'icon', upload: true, value: s.site_logo, placeholder: '上传图片或填写图片URL', hint: '登录页与主页左上角显示的 LOGO；支持上传 JPG / PNG / SVG，或填写图片 URL / iconify:名称 / emoji，留空使用默认 logo' },
          { name: 'open_new_tab', label: '链接默认在新窗口打开', type: 'checkbox', value: s.open_new_tab === '1' },
          { name: 'show_sidebar', label: '显示左侧分组导航', type: 'checkbox', value: s.show_sidebar === '1' },
        ],
      },
      {
        id: 'set-sec-layout', title: '页面布局',
        fields: [
          { name: 'page_margin', label: '页面边距（px）', type: 'number', value: s.page_margin, min: 0, max: 80 },
          { name: 'search_pad', label: '搜索框上下空白（px）', type: 'number', value: s.search_pad, min: 0, max: 80, hint: '搜索框与上方顶栏、下方第一个分组之间的空白高度' },
        ],
      },
      {
        id: 'set-sec-search', title: '搜索栏设置',
        fields: [
          { name: 'show_searchbar', label: '显示搜索栏', type: 'checkbox', value: s.show_searchbar === '1' },
          { name: 'search_local', label: '本地搜索（输入实时过滤收藏夹）', type: 'checkbox', value: s.search_local === '1' },
          { name: 'search_web', label: '互联网搜索（回车调用搜索引擎）', type: 'checkbox', value: s.search_web === '1' },
          // 默认开启：老库无此键时 s.search_reset 为 undefined，用 !== '0' 兜底保证勾选态与 PHP 默认值一致
          { name: 'search_reset', label: '自动复位搜索框（联网搜索后清空关键词）', type: 'checkbox', value: s.search_reset !== '0', hint: '关闭后回车搜索会保留关键词，回到主页时卡片仍处于过滤状态' },
          { name: 'search_hint', label: '显示搜索栏提示文本', type: 'checkbox', value: s.search_hint === '1' },
        ],
      },
      {
        id: 'set-sec-groupdisp', title: '分组显示',
        fields: [
          { name: 'show_group_icon', label: '显示分组图标', type: 'checkbox', value: s.show_group_icon === '1' },
          { name: 'show_group_name', label: '显示分组名称', type: 'checkbox', value: s.show_group_name === '1' },
          { name: 'show_group_count', label: '显示分组标签数量', type: 'checkbox', value: s.show_group_count === '1' },
        ],
      },
      {
        id: 'set-sec-appearance', title: '外观背景',
        fields: [
          { name: 'bg_style', label: '网页背景', type: 'select', value: s.bg_style,
            options: [['default', '默认渐变'], ['color', '自定义纯色'], ['image', '自定义图片']] },
          { name: 'bg_color', label: '背景颜色', type: 'color', value: s.bg_color, hint: '选择「自定义纯色」时生效' },
          { name: 'bg_image', label: '背景图片', type: 'bgimage', value: s.bg_image, placeholder: 'https://…/bg.jpg 或上传本地图片', hint: '选择「自定义图片」时生效；可填 URL 或本地上传' },
          { name: 'bg_mode', label: '图片显示模式', type: 'select', value: s.bg_mode,
            options: [['fit', '适应（完整显示，不裁剪）'], ['stretch', '拉伸（铺满全屏）'], ['tile', '平铺（重复排列）']],
            hint: '选择「自定义图片」时生效' },
        ],
      },
      {
        id: 'set-sec-icp', title: '备案信息',
        fields: [
          { name: 'icp1', label: '备案信息 1', value: s.icp1, placeholder: '例如：京ICP备12345678号' },
          { name: 'icp1_url', label: '备案 1 跳转链接', value: s.icp1_url, placeholder: 'https://beian.miit.gov.cn', hint: '点击备案 1 时跳转的网址，留空则不跳转' },
          { name: 'icp2', label: '备案信息 2', value: s.icp2, placeholder: '例如：京公网安备 11000000000000号' },
          { name: 'icp2_url', label: '备案 2 跳转链接', value: s.icp2_url, placeholder: 'https://beian.mps.gov.cn/#/query/webSearch?code={q}', hint: '支持占位符 {q}，保存后自动替换为备案 2 中的联网备案号（连续数字串）' },
        ],
      },
      {
        id: 'set-sec-account', title: '账号设置', divider: '修改用户名或密码（留空则不修改）',
        fields: [
          { name: 'username', label: '用户名', value: s.username || '', hint: '留空则不修改；修改后下次登录请使用新用户名' },
          { name: 'old_password', label: '当前密码', type: 'password', placeholder: '修改用户名或密码时需验证当前密码' },
          { name: 'new_password', label: '新密码', type: 'password', placeholder: '至少 6 位，留空则不修改' },
          { name: 'confirm', label: '确认新密码', type: 'password', placeholder: '再次输入新密码' },
        ],
      },
      {
        id: 'set-sec-about', title: '关于', fields: [],
        // 只读站点信息展示（不参与表单提交）
        html: `<div class="about-box">
          <div class="about-logo">${iconValueHtml(s.site_logo || s.site_icon)}</div>
          <div class="about-title">${escapeHtml(s.site_title || 'Free-Panel')}</div>
          ${s.site_subtitle ? `<div class="about-sub">${escapeHtml(s.site_subtitle)}</div>` : ''}
          <div class="about-meta">版本 v${escapeHtml(s.version || '1.0.0')} · PHP + SQLite</div>
          <div class="about-desc">Free-Panel 更加自由的私有化部署导航页面，支持卡片与分组拖拽排序、默认 / 内网 / IPv6 三模式地址、右键菜单与个性化设置。</div>
          <div class="about-link"><a href="https://github.com/yaobus/Free-Panel" target="_blank" rel="noopener noreferrer" title="GitHub 项目主页" aria-label="GitHub 项目主页"><svg viewBox="0 0 16 16" width="16" height="16" fill="currentColor" aria-hidden="true"><path d="M8 0C3.58 0 0 3.58 0 8c0 3.54 2.29 6.53 5.47 7.59.4.07.55-.17.55-.38 0-.19-.01-.82-.01-1.49-2.01.37-2.53-.49-2.69-.94-.09-.23-.48-.94-.82-1.13-.28-.15-.68-.52-.01-.53.63-.01 1.08.58 1.23.82.72 1.21 1.87.87 2.33.66.07-.52.28-.87.51-1.07-1.78-.2-3.64-.89-3.64-3.95 0-.87.31-1.59.82-2.15-.08-.2-.36-1.02.08-2.12 0 0 .67-.21 2.2.82.64-.18 1.32-.27 2-.27s1.36.09 2 .27c1.53-1.04 2.2-.82 2.2-.82.44 1.1.16 1.92.08 2.12.51.56.82 1.27.82 2.15 0 3.07-1.87 3.75-3.65 3.95.29.25.54.73.54 1.48 0 1.07-.01 1.93-.01 2.2 0 .21.15.46.55.38A8.01 8.01 0 0 0 16 8c0-4.42-3.58-8-8-8z"/></svg></a></div>
          <div class="about-copy">© ${new Date().getFullYear()} ${escapeHtml(s.site_title || 'Free-Panel')}${s.site_subtitle ? ' · ' + escapeHtml(s.site_subtitle) : ''}</div>
        </div>`,
      },
    ];
    const allFields = groups.flatMap((g) => g.fields);

    const ov = document.createElement('div');
    ov.className = 'modal-overlay';
    ov.innerHTML = `
      <div class="modal settings-modal">
        <div class="modal-head">
          <h3>站点设置</h3>
          <button type="button" class="modal-close" title="关闭">✕</button>
        </div>
        <div class="settings-wrap">
          <aside class="settings-nav">
            <div class="settings-nav-title">设置分类</div>
            ${groups.map((g, i) => `<button type="button" class="set-nav-item${i === 0 ? ' active' : ''}" data-target="#${g.id}">${g.title}</button>`).join('')}
          </aside>
          <form class="settings-content">
            <div class="settings-scroll">
              ${groups.map((g) => `
                <section class="set-section" id="${g.id}">
                  <h4 class="set-sec-title">${g.title}</h4>
                  ${g.divider ? `<div class="modal-divider">${g.divider}</div>` : ''}
                  ${g.html ? g.html : g.fields.map(fieldHtml).join('')}
                </section>`).join('')}
            </div>
            <div class="settings-foot">
              <button type="button" class="btn btn-ghost" data-cancel>取消</button>
              <button type="submit" class="btn btn-primary">保存全部</button>
            </div>
          </form>
        </div>
      </div>`;
    root.appendChild(ov);

    // 关闭：仅 ✕ / 取消（与其它弹窗一致，点击遮罩不关闭）
    ov.addEventListener('click', (e) => {
      if (e.target.closest('[data-cancel]') || e.target.closest('.modal-close')) closeModal();
    });

    // 绑定图标字段交互（图标库按钮 + 实时预览，与编辑弹窗共用逻辑）
    bindIconFields(ov, allFields);

    // 左侧分类点击 → 右侧对应分组滚动到顶部
    const scrollBox = ov.querySelector('.settings-scroll');
    const navItems = $$('.set-nav-item', ov);
    const sections = $$('.set-section', ov);
    let navLock = 0; // 点击锁定：滚动完成后只要用户不主动滚动，scroll 监听不覆盖点击高亮（处理 maxScroll 物理限制下目标不到顶时仍保留用户意图）
    navItems.forEach((it) => it.addEventListener('click', () => {
      navItems.forEach((x) => x.classList.toggle('active', x === it));
      navLock = Date.now() + 1500;
      const sec = $(it.dataset.target, ov);
      if (sec) sec.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }));
    // 右侧滚动 → 高亮当前可见分类（取最后一个顶部越过探测线的分区）
    scrollBox.addEventListener('scroll', () => {
      if (Date.now() < navLock) return; // 点击锁定期间不覆盖用户主动选择
      const probe = scrollBox.scrollTop + 30;
      let current = sections[0];
      sections.forEach((sec) => { if (sec.offsetTop <= probe) current = sec; });
      navItems.forEach((it) => it.classList.toggle('active', it.dataset.target === '#' + current.id));
    });

    // 背景图片本地上传：选择文件 → POST api.php(action=upload_bg_image) → 回填路径
    $$('[data-bg-upload]', ov).forEach((btn) => {
      btn.addEventListener('click', (e) => {
        e.preventDefault();
        e.stopPropagation();
        if (btn.dataset.loading) return;
        const input = document.createElement('input');
        input.type = 'file';
        input.accept = 'image/jpeg,image/png,image/gif,image/webp';
        input.onchange = async () => {
          const file = input.files && input.files[0];
          if (!file) return;
          if (file.size > 5 * 1024 * 1024) { toast('图片不能超过 5MB', true); return; }
          const fd = new FormData();
          fd.append('action', 'upload_bg_image');
          fd.append('csrf', CSRF);
          fd.append('file', file);
          btn.dataset.loading = '1';
          btn.classList.add('loading');
          const orig = btn.textContent;
          btn.textContent = '上传中…';
          try {
            const res = await fetch('api.php', { method: 'POST', body: fd });
            const j = await res.json();
            if (!j.ok) throw new Error(j.error || '上传失败');
            const box = btn.closest('.url-input');
            const urlInput = box.querySelector('input');
            urlInput.value = j.url;
            // 上传即视为使用自定义图片背景，自动切换背景模式（用户仍可手动改回）
            const bgStyleSel = ov.querySelector('select[name="bg_style"]');
            if (bgStyleSel) bgStyleSel.value = 'image';
            toast('背景图片已上传');
          } catch (err) {
            toast(err.message, true);
          } finally {
            btn.textContent = orig;
            btn.classList.remove('loading');
            delete btn.dataset.loading;
          }
        };
        input.click();
      });
    });

    // 背景图库选择：列出已上传图片，网格展示供点选
    $$('[data-bg-gallery]', ov).forEach((btn) => {
      btn.addEventListener('click', async (e) => {
        e.preventDefault();
        e.stopPropagation();
        if (btn.dataset.loading) return;
        btn.dataset.loading = '1';
        btn.classList.add('loading');
        const orig = btn.textContent;
        btn.textContent = '加载中…';
        let images = [];
        try {
          const j = await api('list_bg_images');
          images = j.images || [];
        } catch (err) {
          toast(err.message, true);
        } finally {
          btn.textContent = orig;
          btn.classList.remove('loading');
          delete btn.dataset.loading;
        }
        // 打开图库面板
        const gOv = document.createElement('div');
        gOv.className = 'modal-overlay';
        gOv.innerHTML = `
          <div class="modal bg-gallery">
            <div class="modal-head">
              <h3>已上传背景图库</h3>
              <button type="button" class="modal-close" title="关闭">✕</button>
            </div>
            <div class="modal-body">
              ${images.length ? `<div class="bg-grid">
                ${images.map((u) => `<button type="button" class="bg-item" data-bg-url="${u}"><img src="${u}" alt="" loading="lazy"><span class="bg-item-name">${u.split('/').pop()}</span></button>`).join('')}
              </div>` : '<div class="bg-gallery-empty">还没有已上传的图片，请先点击「上传」</div>'}
            </div>
          </div>`;
        root.appendChild(gOv);
        gOv.addEventListener('click', (e) => {
          if (e.target.closest('.modal-close')) gOv.remove();
        });
        gOv.querySelectorAll('.bg-item').forEach((it) => {
          it.addEventListener('click', () => {
            const box = btn.closest('.url-input');
            box.querySelector('input').value = it.dataset.bgUrl;
            // 从图库选择即视为使用自定义图片背景，自动切换背景模式（用户仍可手动改回）
            const bgStyleSel = ov.querySelector('select[name="bg_style"]');
            if (bgStyleSel) bgStyleSel.value = 'image';
            gOv.remove();
            toast('已选择背景图片');
          });
        });
      });
    });

    // 提交保存
    ov.querySelector('form').addEventListener('submit', async (e) => {
      e.preventDefault();
      const data = {};
      allFields.forEach((f) => {
        if (f.type === 'divider') return;
        const el = ov.querySelector(`[name="${f.name}"]`);
        if (!el) return;
        data[f.name] = f.type === 'checkbox' ? (el.checked ? '1' : '0') : el.value.trim();
      });

      // 账号相关字段：不随站点设置保存，单独走专用接口
      const ACCOUNT_KEYS = ['username', 'old_password', 'new_password', 'confirm'];
      const settingsData = {};
      Object.keys(data).forEach((k) => { if (!ACCOUNT_KEYS.includes(k)) settingsData[k] = data[k]; });

      const curName = (s.username || '').trim();
      const newName = data.username && data.username !== curName ? data.username : '';
      const hasPwd  = !!data.new_password;

      // 前端校验前置（任何一项不通过都不发请求，避免“设置已保存但账号没改”的半成功状态）
      if (newName || hasPwd) {
        if (!data.old_password) return toast('修改用户名或密码需先输入当前密码', true);
      }
      if (hasPwd) {
        if (data.new_password.length < 6) return toast('新密码至少 6 位', true);
        if (data.new_password !== data.confirm) return toast('两次输入的新密码不一致', true);
      }

      try {
        await api('save_settings', settingsData);
        if (newName) {
          await api('change_username', { new_username: newName, password: data.old_password });
        }
        if (hasPwd) {
          await api('change_password', { old_password: data.old_password, new_password: data.new_password });
        }
        if (newName && hasPwd) toast('设置已保存，用户名与密码已更新');
        else if (newName) toast('设置已保存，用户名已更新，下次登录请使用新用户名');
        else if (hasPwd) toast('设置已保存，密码已更新，请妥善保管');
        else toast('设置已保存');
        location.reload();
      } catch (err) {
        toast(err.message, true);
      }
    });
  }

  /* 独立函数：顶部按钮与窄屏折叠菜单「站点设置」条目复用 */
  async function openSettings() {
    try {
      const j = await api('get_settings');
      openSettingsModal(j.settings || {});
    } catch (err) {
      toast(err.message, true);
    }
  }
  const settingsBtn = $('#settingsBtn');
  if (settingsBtn) settingsBtn.addEventListener('click', openSettings);

  /* ---------------- 退出登录 ---------------- */
  function doLogout() { location.href = 'logout.php'; }
  const logoutBtn = $('#logoutBtn');
  if (logoutBtn) logoutBtn.addEventListener('click', doLogout);

  /* ---------------- 更多操作折叠菜单（窄屏堆叠主题/设置/退出） ---------------- */
  const moreBtn = $('#moreBtn');
  const moreMenu = $('#moreMenu');
  if (moreBtn && moreMenu) {
    const closeMore = () => {
      moreMenu.hidden = true;
      moreBtn.classList.remove('on');
      moreBtn.setAttribute('aria-expanded', 'false');
    };
    moreBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      const open = moreMenu.hidden;
      moreMenu.hidden = !open;
      moreBtn.classList.toggle('on', open);
      moreBtn.setAttribute('aria-expanded', String(open));
    });
    // 点击面板外部任意位置关闭
    document.addEventListener('click', (e) => {
      if (!moreMenu.hidden && !moreMenu.contains(e.target) && e.target !== moreBtn) closeMore();
    });
    // Esc 关闭
    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape' && !moreMenu.hidden) closeMore();
    });
    // 条目分发：复用顶部按钮同一套动作，点击后面板自动关闭
    moreMenu.addEventListener('click', (e) => {
      const item = e.target.closest('.more-item');
      if (!item) return;
      const act = item.dataset.moreAction;
      closeMore();
      if (act === 'theme') toggleTheme();
      else if (act === 'settings') openSettings();
      else if (act === 'logout') doLogout();
    });
  }

  /* ---------------- 图标加载失败降级为首字头像 ---------------- */
  document.addEventListener('error', (e) => {
    const img = e.target;
    if (!img.classList || !img.classList.contains('ico')) return;
    const name = img.dataset.name || '?';
    const hue = img.dataset.hue || '220';
    img.outerHTML = `<span class="ico letter" style="--h:${hue}">${escapeHtml(name.charAt(0))}</span>`;
  }, true);

  function escapeHtml(s) {
    return s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  }
})();
