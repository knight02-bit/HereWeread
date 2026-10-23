/* 发现视图：为你推荐 / 朋友在读 / 搜索 */
(function () {
  window.WR = window.WR || {};
  WR.views = WR.views || {};

  const SCOPES = [
    [0, '全部'],
    [10, '电子书'],
    [16, '网文小说'],
    [14, '听书'],
    [6, '作者'],
    [12, '全文'],
    [13, '书单'],
    [2, '公众号'],
    [4, '文章'],
  ];

  const state = { maxIdx: 0, recommend: [], keyword: '', scope: 10, searchMaxIdx: 0, lastSearchIdx: 0 };

  function bookCard(b, extra) {
    return (
      '<div class="book" data-book="' + WR.fmt.esc(b.bookId || '') + '">' +
      (b.cover ? '<img class="thumb" loading="lazy" src="' + WR.fmt.esc(b.cover) + '" alt="">' : '') +
      '<div class="title">' + WR.fmt.esc(b.title || '未知') + '</div>' +
      '<div class="meta">' + WR.fmt.esc(b.author || '') + '</div>' +
      (b.newRating ? '<div class="meta">' + WR.fmt.star(b.newRating) + ' ' + WR.fmt.esc(b.newRating / 10) + ' 分</div>' : '') +
      (extra ? '<div class="meta">' + WR.fmt.esc(extra) + '</div>' : '') +
      '</div>'
    );
  }

  function bindBooks(el) {
    el.querySelectorAll('[data-book]').forEach((node) => {
      const id = node.getAttribute('data-book');
      if (!id) return;
      node.addEventListener('click', () => {
        location.hash = '#/book/' + encodeURIComponent(id);
      });
    });
  }

  async function loadRecommend(el, reset) {
    const box = el.querySelector('#recBox');
    box.innerHTML = '<div class="empty">正在获取推荐…</div>';
    if (reset) {
      state.maxIdx = 0;
      state.recommend = [];
    }
    try {
      const res = await WR.api.recommend(12, state.maxIdx);
      const books = res.data.books || [];
      state.recommend = state.recommend.concat(books);
      const last = books[books.length - 1];
      if (last && last.searchIdx !== undefined) state.maxIdx = last.searchIdx;
      box.innerHTML = state.recommend.map((b) => bookCard(b, b.reason)).join('') || '<div class="empty">暂时没有找到合适的推荐</div>';
      bindBooks(el);
    } catch (err) {
      box.innerHTML = '<div class="empty">推荐数据获取失败：' + WR.fmt.esc(err.message) + '</div>';
    }
  }

  async function loadFriends(el) {
    const box = el.querySelector('#friendBox');
    box.innerHTML = '<div class="empty">正在获取动态…</div>';
    try {
      const res = await WR.api.discover(20, 0);
      const items = res.data.items || [];
      if (!items.length) {
        box.innerHTML = '<div class="empty">暂时没有好友在读动态</div>';
        return;
      }
      box.innerHTML = items
        .map((it) => {
          const book = it.book || (it.bookInfo && it.bookInfo.bookInfo) || {};
          const who = (it.user && it.user.name) || it.userName || '好友';
          return (
            '<div class="thought"><div class="row"><strong>' + WR.fmt.esc(who) + '</strong>' +
            '<span class="muted">在读</span>' +
            (it.updateTime ? '<span class="muted" style="font-size:12px">' + WR.fmt.esc(WR.fmt.date(it.updateTime)) + '</span>' : '') +
            '</div>' +
            '<div class="txt">《' + WR.fmt.esc(book.title || '未知书名') + '》' + (book.author ? ' — ' + WR.fmt.esc(book.author) : '') + '</div>' +
            (book.bookId ? '<a href="#/book/' + encodeURIComponent(book.bookId) + '">查看详情 →</a>' : '') +
            '</div>'
          );
        })
        .join('');
    } catch (err) {
      box.innerHTML = '<div class="empty">动态获取失败：' + WR.fmt.esc(err.message) + '</div>';
    }
  }

  async function doSearch(el, reset) {
    const box = el.querySelector('#searchBox');
    const input = el.querySelector('#kw');
    const kw = (input && input.value.trim()) || state.keyword;
    if (!kw) {
      box.innerHTML = '<div class="empty">请输入关键词</div>';
      return;
    }
    state.keyword = kw;
    if (reset) {
      state.searchMaxIdx = 0;
      state.lastSearchIdx = 0;
    }
    box.innerHTML = '<div class="empty">搜索中…</div>';
    try {
      const res = await WR.api.search(kw, state.scope, state.searchMaxIdx);
      const groups = res.data.results || [];
      const html = groups
        .map((g) => {
          const books = g.books || [];
          if (!books.length) return '';
          return (
            '<div class="section-head" style="margin-top:0"><h3>' + WR.fmt.esc(g.title || '结果') +
            (g.scopeCount ? ' <span class="muted" style="font-size:12px">（约 ' + WR.fmt.esc(g.scopeCount) + ' 个结果）</span>' : '') +
            '</h3></div><div class="books">' +
            books
              .map((x) => {
                const b = x.bookInfo || x.book || x;
                return bookCard(b, x.reason || '');
              })
              .join('') +
            '</div>'
          );
        })
        .join('');
      box.innerHTML =
        (html || '<div class="empty">没有找到结果，换个关键词试试？</div>') +
        '<div class="muted" style="margin-top:10px;font-size:12px">提示：搜索结果是分页片段，不代表全量结果。</div>';
      bindBooks(el);
    } catch (err) {
      box.innerHTML = '<div class="empty">搜索失败：' + WR.fmt.esc(err.message) + '</div>';
    }
  }

  WR.views.discover = {
    title: '发现',
    async render(el) {
      el.innerHTML =
        '<div class="section-head"><h2>为你推荐</h2><button class="btn ghost sm" id="btnMore" type="button">换一批</button></div>' +
        '<div class="books" id="recBox"></div>' +

        '<div class="section-head"><h2>检索书城</h2></div>' +
        '<div class="card">' +
        '<div class="row wrap" style="margin-bottom:10px">' +
        '<input type="search" id="kw" placeholder="书名 / 作者 / 关键词" style="min-width:240px" value="' + WR.fmt.esc(state.keyword) + '">' +
        '<select id="scope">' +
        SCOPES.map((s) => '<option value="' + s[0] + '"' + (s[0] === state.scope ? ' selected' : '') + '>' + s[1] + '</option>').join('') +
        '</select>' +
        '<button class="btn sm" id="btnSearch" type="button">搜索</button>' +
        '</div>' +
        '<div id="searchBox"><div class="empty">选择范围后输入关键词，会在书城实时搜索（不写入本地缓存）</div></div>' +
        '</div>' +

        '<div class="section-head"><h2>朋友在读</h2></div>' +
        '<div class="card"><div id="friendBox"></div></div>';

      el.querySelector('#btnMore').addEventListener('click', () => loadRecommend(el, false));
      el.querySelector('#btnSearch').addEventListener('click', () => doSearch(el, true));
      el.querySelector('#kw').addEventListener('keydown', (e) => {
        if (e.key === 'Enter') doSearch(el, true);
      });
      el.querySelector('#scope').addEventListener('change', (e) => {
        state.scope = Number(e.target.value);
        if (state.keyword) doSearch(el, true);
      });

      await Promise.all([loadRecommend(el, true), loadFriends(el)]);
    },
  };
})();
