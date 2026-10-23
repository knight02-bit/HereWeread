/* 书架视图：搜索 / 筛选 / 排序 */
(function () {
  window.WR = window.WR || {};
  WR.views = WR.views || {};

  const state = {
    books: null,
    counts: null,
    archive: [],
    q: '',
    category: '',
    flag: 'all', // all | finished | reading | secret
    sort: 'recent', // recent | title | author
  };

  function filtered() {
    const books = state.books || [];
    const q = state.q.trim().toLowerCase();
    let list = books.filter((b) => {
      if (state.flag === 'finished' && b.finishReading !== 1) return false;
      if (state.flag === 'reading' && b.finishReading === 1) return false;
      if (state.flag === 'secret' && b.secret !== 1) return false;
      if (state.category && b.category !== state.category) return false;
      if (q) {
        const hay = ((b.title || '') + ' ' + (b.author || '') + ' ' + (b.category || '')).toLowerCase();
        if (!hay.includes(q)) return false;
      }
      return true;
    });
    if (state.sort === 'recent') list.sort((a, b) => (Number(b.readUpdateTime) || 0) - (Number(a.readUpdateTime) || 0));
    if (state.sort === 'title') list.sort((a, b) => String(a.title || '').localeCompare(String(b.title || ''), 'zh-CN'));
    if (state.sort === 'author') list.sort((a, b) => String(a.author || '').localeCompare(String(b.author || ''), 'zh-CN'));
    return list;
  }

  function card(b) {
    return (
      '<div class="book" data-book="' +
      WR.fmt.esc(b.bookId) +
      '">' +
      (b.cover ? '<img class="thumb" loading="lazy" src="' + WR.fmt.esc(b.cover) + '" alt="">' : '') +
      '<div class="title">' + WR.fmt.esc(b.title || '未命名') + '</div>' +
      '<div class="meta">' + WR.fmt.esc(b.author || '—') + '</div>' +
      '<div class="meta">最近阅读 ' + WR.fmt.esc(WR.fmt.date(b.readUpdateTime)) + '</div>' +
      '<div class="badges">' +
      (b.finishReading === 1 ? '<span class="badge ok">已读完</span>' : '<span class="badge">在读</span>') +
      (b.secret === 1 ? '<span class="badge warn">私密</span>' : '') +
      (b.category ? '<span class="badge">' + WR.fmt.esc(WR.fmt.truncate(b.category, 12)) + '</span>' : '<span class="badge">未分类</span>') +
      '</div></div>'
    );
  }

  function renderList(el) {
    const list = filtered();
    const box = el.querySelector('#shelfList');
    const info = el.querySelector('#shelfInfo');
    info.textContent = '显示 ' + list.length + ' / ' + (state.books || []).length + ' 个条目';
    box.innerHTML = list.length ? list.map(card).join('') : '<div class="empty">没有符合条件的书籍</div>';
    box.querySelectorAll('[data-book]').forEach((node) => {
      node.addEventListener('click', () => {
        location.hash = '#/book/' + encodeURIComponent(node.getAttribute('data-book'));
      });
    });
  }

  WR.views.shelf = {
    title: '书架',
    async render(el) {
      el.innerHTML = '<div class="empty">正在读取书架…</div>';
      let shelf;
      try {
        shelf = await WR.api.shelf();
      } catch (err) {
        el.innerHTML = '<div class="empty">书架读取失败：' + WR.fmt.esc(err.message) + '</div>';
        return;
      }
      state.books = shelf.data.books || [];
      state.counts = shelf.data.counts;
      state.archive = shelf.data.archive || [];

      const cats = Array.from(new Set(state.books.map((b) => b.category || '未分类'))).sort((a, b) =>
        String(a).localeCompare(String(b), 'zh-CN')
      );
      const c = state.counts;

      el.innerHTML =
        '<div class="section-head"><h2>我的书架</h2><span class="muted" id="shelfInfo"></span></div>' +
        '<div class="muted" style="margin-bottom:12px">共 <b>' +
        c.total +
        '</b> 个条目：' + c.books + ' 本电子书 · ' + c.albums + ' 个专辑/有声书 · ' + c.mp + ' 个文章收藏入口；公开 ' +
        c.publicCount + ' · 私密 ' + c.secretCount + ' · 已读完 ' + c.finished +
        (shelf.cached ? '（缓存于 ' + WR.fmt.esc(WR.fmt.ago(shelf.savedAt)) + '）' : '') +
        '</div>' +
        '<div class="filters">' +
        '<input type="search" id="fq" placeholder="搜索书名 / 作者 / 分类" style="min-width:220px" value="' + WR.fmt.esc(state.q) + '">' +
        '<select id="fcat"><option value="">全部分类</option>' +
        cats.map((x) => '<option value="' + WR.fmt.esc(x) + '"' + (x === state.category ? ' selected' : '') + '>' + WR.fmt.esc(x) + '</option>').join('') +
        '</select>' +
        '<select id="fflag">' +
        [['all', '全部状态'], ['reading', '在读'], ['finished', '已读完'], ['secret', '私密']]
          .map((o) => '<option value="' + o[0] + '"' + (state.flag === o[0] ? ' selected' : '') + '>' + o[1] + '</option>')
          .join('') +
        '</select>' +
        '<select id="fsort">' +
        [['recent', '按最近阅读'], ['title', '按书名'], ['author', '按作者']]
          .map((o) => '<option value="' + o[0] + '"' + (state.sort === o[0] ? ' selected' : '') + '>' + o[1] + '</option>')
          .join('') +
        '</select>' +
        '<button class="btn ghost sm" id="btnRefresh" type="button">刷新书架</button>' +
        '</div>' +
        (state.archive.length
          ? '<div class="row wrap" style="margin-bottom:14px">' +
            state.archive
              .map((a) => '<span class="badge">' + WR.fmt.esc(a.name) + ' · ' + ((a.bookIds || []).length) + ' 本</span>')
              .join('') +
            '</div>'
          : '') +
        '<div class="books" id="shelfList"></div>';

      renderList(el);

      el.querySelector('#fq').addEventListener('input', (e) => {
        state.q = e.target.value;
        renderList(el);
      });
      el.querySelector('#fcat').addEventListener('change', (e) => {
        state.category = e.target.value;
        renderList(el);
      });
      el.querySelector('#fflag').addEventListener('change', (e) => {
        state.flag = e.target.value;
        renderList(el);
      });
      el.querySelector('#fsort').addEventListener('change', (e) => {
        state.sort = e.target.value;
        renderList(el);
      });
      el.querySelector('#btnRefresh').addEventListener('click', async () => {
        WR.ui.toast('正在刷新书架…');
        await WR.api.shelf(true);
        WR.views.shelf.render(el);
      });
    },
  };
})();
