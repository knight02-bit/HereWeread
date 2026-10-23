/* 笔记与划线视图 */
(function () {
  window.WR = window.WR || {};
  WR.views = WR.views || {};

  const state = { books: null, sums: null, current: '', query: '' };

  function bookListItem(b, activeId) {
    return (
      '<div class="item' +
      (String(b.bookId) === String(activeId) ? ' active' : '') +
      '" data-book="' + WR.fmt.esc(b.bookId) + '">' +
      '<div class="t">' + WR.fmt.esc(WR.fmt.truncate(b.title || '未命名', 24)) + '</div>' +
      '<div class="m">划线 ' + b.noteCount + ' · 想法 ' + b.reviewCount + ' · 书签 ' + b.bookmarkCount +
      (b.markedStatus === 1 ? ' · 已读完' : '') +
      '</div></div>'
    );
  }

  function marksHtml(marks, keywords) {
    if (!marks || !marks.groups || !marks.groups.length) return '<div class="empty">这本书还没有可导出的划线</div>';
    const kw = String(keywords || '').trim();
    return marks.groups
      .map((g) => {
        const items = g.items.filter((it) => !kw || (it.text || '').includes(kw));
        if (!items.length) return '';
        return (
          '<div class="chapter"><h4>' +
          WR.fmt.esc(g.title) + '（' + items.length + ' 条）</h4>' +
          items
            .map(
              (it) =>
                '<div class="mark">' + WR.fmt.nl2br(it.text) + '<div class="when">' + WR.fmt.esc(it.date || '') + '</div></div>'
            )
            .join('') +
          '</div>'
        );
      })
      .join('');
  }

  function reviewsHtml(reviews) {
    if (!reviews || !reviews.items || !reviews.items.length) return '<div class="empty">这本书还没有想法或点评</div>';
    return reviews.items
      .map(
        (r) =>
          '<div class="thought">' +
          (r.abstract ? '<div class="abs">' + WR.fmt.nl2br(r.abstract) + '</div>' : '') +
          '<div class="txt">' + WR.fmt.nl2br(r.content) + '</div>' +
          '<div class="meta">' +
          WR.fmt.esc(r.date || '') +
          (r.chapterName ? ' · ' + WR.fmt.esc(r.chapterName) : '') +
          (r.star ? ' · ' + WR.fmt.star(r.star) : '') +
          (r.likesCount !== null && r.likesCount !== undefined ? ' · 赞 ' + WR.fmt.esc(r.likesCount) : '') +
          '</div></div>'
      )
      .join('');
  }

  function searchResults(data) {
    const marks = (data.markHits || [])
      .map(
        (h) =>
          '<div class="search-hit"><div class="src">划线 · ' +
          WR.fmt.esc(h.title) +
          (h.chapterTitle ? ' · ' + WR.fmt.esc(h.chapterTitle) : '') +
          ' · ' + WR.fmt.esc(h.date || '') + '</div>' +
          '<div>' + WR.fmt.nl2br(h.text) + '</div>' +
          '<a href="#/book/' + encodeURIComponent(h.bookId) + '">打开这本书 →</a></div>'
      )
      .join('');
    const reviews = (data.reviewHits || [])
      .map(
        (h) =>
          '<div class="search-hit"><div class="src">想法 · ' +
          WR.fmt.esc(h.title) +
          (h.chapterName ? ' · ' + WR.fmt.esc(h.chapterName) : '') +
          ' · ' + WR.fmt.esc(h.date || '') + '</div>' +
          (h.abstract ? '<div class="muted" style="font-size:12.5px">' + WR.fmt.nl2br(WR.fmt.truncate(h.abstract, 120)) + '</div>' : '') +
          '<div>' + WR.fmt.nl2br(h.content) + '</div>' +
          '<a href="#/book/' + encodeURIComponent(h.bookId) + '">打开这本书 →</a></div>'
      )
      .join('');
    if (!marks && !reviews) {
      return '<div class="empty">没有命中（仅检索已同步的 ' + WR.fmt.esc(data.scannedBooks || 0) + ' 本书，可先点左侧「同步全部笔记」）</div>';
    }
    return (
      '<div class="muted" style="margin-bottom:10px">关键词「' + WR.fmt.esc(data.keyword) + '」命中 ' +
      WR.fmt.esc(data.hits) + ' 条，已检索 ' + WR.fmt.esc(data.scannedBooks) + ' 本书的本地缓存</div>' +
      (marks ? '<h3>划线（' + (data.markHits || []).length + '）</h3>' + marks : '') +
      (reviews ? '<h3 style="margin-top:16px">想法 / 点评（' + (data.reviewHits || []).length + '）</h3>' + reviews : '')
    );
  }

  async function renderDetail(el, bookId) {
    const pane = el.querySelector('#noteDetail');
    if (!pane) return;
    pane.innerHTML = '<div class="empty">正在读取笔记…</div>';
    let marks;
    let reviews;
    try {
      [marks, reviews] = await Promise.all([WR.api.marks(bookId), WR.api.reviews(bookId)]);
    } catch (err) {
      pane.innerHTML = '<div class="empty">笔记读取失败：' + WR.fmt.esc(err.message) + '</div>';
      return;
    }
    const book = marks.data.book || {};
    const nb = (state.books || []).find((b) => String(b.bookId) === String(bookId)) || {};
    const title = book.title || nb.title || bookId;
    const stats = nb.totalNotes !== undefined
      ? '想法/点评 ' + nb.reviewCount + ' · 划线 ' + nb.noteCount + ' · 书签 ' + nb.bookmarkCount + '（合计 ' + nb.totalNotes + '）'
      : '';

    pane.innerHTML =
      '<div class="section-head" style="margin-top:0"><h2>' + WR.fmt.esc(title) + '</h2>' +
      '<div class="row wrap">' +
      '<a class="btn ghost sm" href="' + WR.api.exportUrl(bookId, 'md') + '">导出 Markdown</a>' +
      '<a class="btn ghost sm" href="' + WR.api.exportUrl(bookId, 'csv') + '">导出 CSV</a>' +
      '<button class="btn ghost sm" id="btnCopy" type="button">复制全部划线</button>' +
      '</div></div>' +
      '<div class="muted" style="margin-bottom:12px">' + WR.fmt.esc(book.author || nb.author || '') +
      (stats ? ' · ' + WR.fmt.esc(stats) : '') +
      ' · <a href="#/book/' + encodeURIComponent(bookId) + '">查看书籍详情</a></div>' +
      '<div class="card"><h3>划线（' + (marks.data.count || 0) + ' 条）</h3>' + marksHtml(marks.data) + '</div>' +
      '<div class="card"><h3>想法与点评（' + (reviews.data.count || 0) + ' 条）</h3>' + reviewsHtml(reviews.data) + '</div>';

    const btn = pane.querySelector('#btnCopy');
    if (btn) {
      btn.addEventListener('click', async () => {
        const text = (marks.data.items || [])
          .map((it) => (it.chapterTitle ? '【' + it.chapterTitle + '】\n' : '') + '“' + it.text + '” — ' + (it.date || ''))
          .join('\n\n');
        try {
          await navigator.clipboard.writeText(text);
          WR.ui.toast('已复制 ' + (marks.data.count || 0) + ' 条划线');
        } catch (err) {
          WR.ui.toast('复制失败，请改用导出');
        }
      });
    }
  }

  WR.views.notes = {
    title: '笔记与划线',
    async render(el, params) {
      const query = (params && params.q) || '';
      state.query = query;

      let notebooks;
      try {
        notebooks = await WR.api.notebooks();
      } catch (err) {
        el.innerHTML =
          '<div class="empty">笔记数据读取失败：' + WR.fmt.esc(err.message) + '</div>' +
          '<div class="center"><button class="btn" id="retry" type="button">重试</button></div>';
        el.querySelector('#retry').addEventListener('click', () => WR.views.notes.render(el, params));
        return;
      }
      state.books = notebooks.data.books || [];
      state.sums = notebooks.data.sums;

      const head =
        '<div class="section-head"><h2>笔记与划线</h2>' +
        '<div class="row wrap">' +
        '<a class="btn ghost sm" href="' + WR.api.exportUrl('', 'md', true) + '">导出全部 Markdown</a>' +
        '<a class="btn ghost sm" href="' + WR.api.exportUrl('', 'csv', true) + '">导出全部 CSV</a>' +
        '</div></div>' +
        '<div class="muted" style="margin-bottom:12px">共 <b>' + (notebooks.data.totalBookCount || 0) + '</b> 本有笔记的书，笔记合计 <b>' +
        WR.fmt.num(notebooks.data.totalNoteCount) + '</b> 条：划线 ' + (state.sums ? state.sums.noteCount : 0) +
        ' · 想法/点评 ' + (state.sums ? state.sums.reviewCount : 0) + ' · 书签 ' + (state.sums ? state.sums.bookmarkCount : 0) +
        '（书签无内容，仅统计数量）</div>';

      if (query) {
        let data;
        try {
          data = (await WR.api.notesSearch(query, 200)).data;
        } catch (err) {
          el.innerHTML = head + '<div class="empty">搜索失败：' + WR.fmt.esc(err.message) + '</div>';
          return;
        }
        el.innerHTML =
          head +
          '<div class="section-head" style="margin-top:0"><h2>搜索结果</h2><a href="#/notes">← 返回书单</a></div>' +
          searchResults(data);
        return;
      }

      if (!state.books.length) {
        el.innerHTML =
          head +
          '<div class="empty">还没有任何笔记数据。先点左下角「同步全部笔记」把划线/想法拉到本地，之后即可离线快速检索。</div>';
        return;
      }

      const activeId = (params && params.book) || state.books[0].bookId;
      state.current = activeId;
      el.innerHTML =
        head +
        '<div class="notes-layout">' +
        '<div class="card"><h3>有笔记的书（' + state.books.length + '）</h3><div class="booklist" id="noteBooks">' +
        state.books.map((b) => bookListItem(b, activeId)).join('') +
        '</div></div>' +
        '<div id="noteDetail"></div>' +
        '</div>';

      el.querySelectorAll('#noteBooks .item').forEach((node) => {
        node.addEventListener('click', () => {
          const id = node.getAttribute('data-book');
          el.querySelectorAll('#noteBooks .item').forEach((n) => n.classList.remove('active'));
          node.classList.add('active');
          state.current = id;
          renderDetail(el, id);
        });
      });

      await renderDetail(el, activeId);
    },
  };

  WR.views._notesHelpers = { marksHtml, reviewsHtml };
})();
