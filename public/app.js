/* 应用主控：路由、主题、状态、同步进度 */
(function () {
  const viewEl = document.getElementById('view');
  const navEl = document.getElementById('nav');
  const pillEl = document.getElementById('statusPill');
  let syncTimer = null;

  /* ---------------- 路由 ---------------- */
  function parseHash() {
    const raw = location.hash.replace(/^#\/?/, '');
    const [pathPart, queryPart] = raw.split('?');
    const seg = pathPart.split('/').filter(Boolean);
    const params = {};
    new URLSearchParams(queryPart || '').forEach((value, key) => {
      params[key] = value;
    });
    if (!seg.length) return { name: 'dashboard', params };
    if (seg[0] === 'book') params.bookId = decodeURIComponent(seg[1] || '');
    if (seg[0] === 'notes' && seg[1]) params.book = decodeURIComponent(seg[1]);
    return { name: seg[0], params };
  }

  function setActive(name) {
    navEl.querySelectorAll('a').forEach((a) => {
      a.classList.toggle('active', a.getAttribute('data-view') === name);
    });
  }

  function errorHtml(err) {
    const code = err && err.code;
    let tip = '';
    if (code === 'OFFLINE') {
      tip =
        '<p>本地服务没有启动，或端口不是 5177。</p>' +
        '<p>请在项目目录双击 <code>start.cmd</code>，或执行 <code>node server\\index.js</code>，然后刷新页面。</p>';
    } else if (code === 'NO_KEY') {
      tip =
        '<p>未检测到 <code>WEREAD_API_KEY</code>。</p>' +
        '<p>请在项目根目录的 <code>.env</code> 中填写 <code>WEREAD_API_KEY=wrk-...</code>，保存后重启服务。</p>';
    } else if (code === 'UNAUTHORIZED') {
      tip = '<p>API Key 无效或已失效，请到 weread.qq.com/r/weread-skills 重新获取并更新 <code>.env</code>。</p>';
    } else if (code === 'RATE_LIMITED') {
      tip = '<p>触发上游限流，请稍等 1–2 分钟再试。</p>';
    } else {
      tip = '<p>' + WR.fmt.esc((err && err.message) || '未知错误') + '</p>';
    }
    return (
      '<div class="card"><h3>请求失败</h3>' +
      tip +
      '<p class="muted" style="font-size:12px">错误代码：' + WR.fmt.esc(code || 'ERROR') + '</p>' +
      '<button class="btn ghost sm" id="btnRetry" type="button">重试</button></div>'
    );
  }

  async function route() {
    const r = parseHash();
    const def = WR.views[r.name] || WR.views.dashboard;
    setActive(WR.views[r.name] ? r.name : 'dashboard');
    viewEl.innerHTML = '<div class="empty">加载中…</div>';
    try {
      await def.render(viewEl, r.params);
    } catch (err) {
      viewEl.innerHTML = errorHtml(err);
      const retry = viewEl.querySelector('#btnRetry');
      if (retry) retry.addEventListener('click', () => route());
    }
  }

  /* ---------------- 状态 ---------------- */
  async function refreshStatus() {
    try {
      const h = await WR.api.health();
      if (!h.keyLoaded) {
        pillEl.className = 'pill danger';
        pillEl.textContent = '未配置 API Key';
        WR.ui.banner(
          '未检测到 <b>WEREAD_API_KEY</b>：请在项目根目录 .env 中填写后重启服务（当前页面仍可查看本地缓存数据）。',
          'error'
        );
        return h;
      }
      pillEl.className = 'pill ok';
      pillEl.textContent =
        '已连接 · 缓存 ' + h.cacheKeys + ' 项' +
        (h.upstream && h.upstream.calls ? ' · 上游请求 ' + h.upstream.calls : '');
      if (h.upgradeInfo && h.upgradeInfo.message) {
        WR.ui.banner('网关提示需要升级技能版本：' + WR.fmt.esc(h.upgradeInfo.message));
      }
      if (h.sync && h.sync.running) startSyncPolling();
      return h;
    } catch (err) {
      pillEl.className = 'pill danger';
      pillEl.textContent = err.code === 'OFFLINE' ? '服务未启动' : '连接异常';
      WR.ui.banner(
        err.code === 'OFFLINE'
          ? '无法连接本地服务：请双击项目根目录的 <b>start.cmd</b> 启动后刷新页面。'
          : '状态检查失败：' + WR.fmt.esc(err.message),
        'error'
      );
      return null;
    }
  }

  function renderSyncBox(s) {
    const box = document.getElementById('syncBox');
    if (!box) return;
    if (!s || (!s.running && !s.total)) {
      box.hidden = true;
      return;
    }
    box.hidden = false;
    const pct = s.total ? Math.round((s.done / s.total) * 100) : 0;
    box.innerHTML =
      '<div>' +
      (s.running ? '同步中 ' + s.done + '/' + s.total : '同步完成 ' + s.done + '/' + s.total) +
      (s.current ? '：' + WR.fmt.esc(WR.fmt.truncate(s.current, 14)) : '') +
      '</div><div class="bar"><div style="width:' + pct + '%"></div></div>' +
      (s.errors && s.errors.length ? '<div style="color:var(--warn)">' + s.errors.length + ' 项失败</div>' : '');
  }

  function startSyncPolling() {
    if (syncTimer) return;
    const tick = async () => {
      try {
        const s = (await WR.api.syncStatus()).data;
        renderSyncBox(s);
        if (!s.running) {
          clearInterval(syncTimer);
          syncTimer = null;
          WR.ui.toast('笔记同步完成：' + s.done + '/' + s.total + ' 本');
          refreshStatus();
        }
      } catch (err) {
        clearInterval(syncTimer);
        syncTimer = null;
      }
    };
    syncTimer = setInterval(tick, 1500);
    tick();
  }

  /* ---------------- 事件绑定 ---------------- */
  document.getElementById('btnSync').addEventListener('click', async (e) => {
    const btn = e.currentTarget;
    btn.disabled = true;
    try {
      const res = await WR.api.syncStart();
      WR.ui.toast(res.note || '已开始同步');
      startSyncPolling();
    } catch (err) {
      WR.ui.toast('同步失败：' + err.message);
    } finally {
      setTimeout(() => {
        btn.disabled = false;
      }, 1500);
    }
  });

  document.getElementById('btnTheme').addEventListener('click', () => {
    const html = document.documentElement;
    const next = html.getAttribute('data-theme') === 'dark' ? 'light' : 'dark';
    html.setAttribute('data-theme', next);
    try {
      localStorage.setItem('wr-theme', next);
    } catch (err) {
      /* 忽略隐私模式限制 */
    }
  });

  document.getElementById('btnClear').addEventListener('click', async () => {
    if (!window.confirm('确定清空本地缓存吗？（不影响云端数据，重新拉取即可）')) return;
    try {
      const res = await WR.api.clearCache();
      WR.ui.toast('已清空 ' + res.data.removed + ' 个缓存文件');
      route();
    } catch (err) {
      WR.ui.toast('清空失败：' + err.message);
    }
  });

  const searchInput = document.getElementById('globalSearch');
  function runSearch() {
    const kw = searchInput.value.trim();
    if (!kw) {
      WR.ui.toast('请输入搜索关键词');
      return;
    }
    location.hash = '#/notes?q=' + encodeURIComponent(kw);
  }
  document.getElementById('btnSearch').addEventListener('click', runSearch);
  searchInput.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') runSearch();
  });

  WR.api.onEvent((evt) => {
    if (evt.type === 'upgrade' && evt.info && evt.info.message) {
      WR.ui.banner('网关提示需要升级技能版本：' + WR.fmt.esc(evt.info.message));
    } else if (evt.type === 'warning') {
      WR.ui.toast(evt.message);
    }
  });

  /* ---------------- 启动 ---------------- */
  try {
    const saved = localStorage.getItem('wr-theme');
    if (saved) document.documentElement.setAttribute('data-theme', saved);
  } catch (err) {
    /* ignore */
  }

  window.addEventListener('hashchange', route);
  refreshStatus();
  route();
})();
