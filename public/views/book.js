/* 书籍详情视图 */
(function () {
  window.WR = window.WR || {};
  WR.views = WR.views || {};

  const REVIEW_TYPES = [
    [0, '全部'],
    [1, '推荐'],
    [2, '不行'],
    [3, '最新'],
    [4, '一般'],
  ];

  function linkOf(info) {
    if (info && info.readerLink) return '<a class="btn ghost sm" href="' + WR.fmt.esc(info.readerLink) + '" target="_blank" rel="noreferrer">打开阅读</a>';
    if (info && info.deepLink) return '<a class="btn ghost sm" href="' + WR.fmt.esc(info.deepLink) + '" target="_blank" rel="noreferrer">查看详情</a>';
    return '';
  }

  async function renderPublic(el, bookId, type) {
    const box = el.querySelector('#publicBox');
    box.innerHTML = '<div class="empty">正在读取公开点评…</div>';
    try {
      const res = await WR.api.reviewsPublic(bookId, type, 0);
      const d = res.data || {};
      const reviews = d.reviews || [];
      box.innerHTML =
        '<div class="tabs" id="pubTabs">' +
        REVIEW_TYPES.map((t) => '<button class="tab' + (t[0] === type ? ' active' : '') + '" data-type="' + t[0] + '">' + t[1] + '</button>').join('') +
        '</div>' +
        '<div class="muted" style="margin:10px 0">共 ' + WR.fmt.esc(d.reviewsCnt || 0) + ' 条点评' +
        (d.deepVRecommendInfo && d.deepVRecommendInfo.title ? ' · ' + WR.fmt.esc(d.deepVRecommendInfo.title) : '') +
        (d.friendCommentCount ? ' · 好友点评 ' + WR.fmt.esc(d.friendCommentCount) + ' 条' : '') +
        '</div>' +
        (reviews.length
          ? reviews
              .map((item) => {
                const r = (item.review && item.review.review) || {};
                const author = r.author || {};
                return (
                  '<div class="thought">' +
                  '<div class="row" style="margin-bottom:6px"><strong>' + WR.fmt.esc(author.name || '匿名读者') + '</strong>' +
                  '<span class="muted">' + WR.fmt.star(r.star) + '</span>' +
                  (r.isFinish ? '<span class="badge">已读完</span>' : '') +
                  '</div>' +
                  '<div class="txt">' + WR.fmt.nl2br(WR.fmt.truncate(r.content || '', 400)) + '</div>' +
                  '<div class="meta">' + WR.fmt.esc(r.createTime ? WR.fmt.date(r.createTime) : '') +
                  (r.chapterName ? ' · ' + WR.fmt.esc(r.chapterName) : '') + '</div></div>'
                );
              })
              .join('')
          : '<div class="empty">这本书暂时还没有公开点评哦~</div>');

      box.querySelectorAll('#pubTabs .tab').forEach((btn) => {
        btn.addEventListener('click', () => renderPublic(el, bookId, Number(btn.getAttribute('data-type'))));
      });
    } catch (err) {
      box.innerHTML = '<div class="empty">点评数据获取失败：' + WR.fmt.esc(err.message) + '</div>';
    }
  }

  WR.views.book = {
    title: '书籍详情',
    async render(el, params) {
      const bookId = (params && params.bookId) || '';
      if (!bookId) {
        el.innerHTML = '<div class="empty">缺少 bookId</div>';
        return;
      }
      el.innerHTML = '<div class="empty">正在读取书籍信息…</div>';

      const [detail, marks, reviews, best, similar] = await Promise.all([
        WR.api.book(bookId).catch((err) => ({ data: null, error: err })),
        WR.api.marks(bookId).catch((err) => ({ data: null, error: err })),
        WR.api.reviews(bookId).catch((err) => ({ data: null, error: err })),
        WR.api.best(bookId).catch((err) => ({ data: null, error: err })),
        WR.api.similar(bookId).catch((err) => ({ data: null, error: err })),
      ]);

      const info = (detail.data && detail.data.info) || {};
      const chaptersData = (detail.data && detail.data.chapters) || {};
      const progressBook = (detail.data && detail.data.progress && detail.data.progress.book) || {};
      const chapters = chaptersData.chapters || [];
      const progress = Number(progressBook.progress || 0);

      const marksHtml = WR.views._notesHelpers.marksHtml(marks.data, '');
      const reviewsHtml = WR.views._notesHelpers.reviewsHtml(reviews.data);
      const similarBooks = ((similar.data && similar.data.booksimilar && similar.data.booksimilar.books) || [])
        .map((x) => (x.book && x.book.bookInfo) || {})
        .filter((b) => b.bookId);

      el.innerHTML =
        '<div class="section-head" style="margin-top:0"><h2>' + WR.fmt.esc(info.title || bookId) + '</h2>' +
        '<div class="row"><a href="#/notes?book=' + encodeURIComponent(bookId) + '">查看我的笔记 →</a>' + linkOf(info) + '</div></div>' +
        '<div class="card"><div class="book-hero">' +
        (info.cover ? '<img src="' + WR.fmt.esc(info.cover) + '" alt="">' : '<div></div>') +
        '<div>' +
        '<div class="kv">' +
        '<div class="k">作者</div><div>' + WR.fmt.esc(info.author || '—') + '</div>' +
        (info.translator ? '<div class="k">译者</div><div>' + WR.fmt.esc(info.translator) + '</div>' : '') +
        '<div class="k">分类</div><div>' + WR.fmt.esc(info.category || '—') + '</div>' +
        '<div class="k">出版社</div><div>' + WR.fmt.esc(info.publisher || '—') + '</div>' +
        '<div class="k">出版时间</div><div>' + WR.fmt.esc(info.publishTime || '—') + '</div>' +
        '<div class="k">ISBN</div><div>' + WR.fmt.esc(info.isbn || '—') + '</div>' +
        '<div class="k">字数</div><div>' + WR.fmt.esc(info.wordCount ? WR.fmt.num(info.wordCount) + ' 字' : '—') + '</div>' +
        '<div class="k">评分</div><div>' + WR.fmt.star(info.newRating) + ' ' + WR.fmt.esc(info.newRating ? info.newRating / 10 + ' 分' : '—') +
        (info.newRatingCount ? '（' + WR.fmt.num(info.newRatingCount) + ' 人评）' : '') + '</div>' +
        '<div class="k">我的进度</div><div>' + progress + '%' +
        (progressBook.recordReadingTime ? ' · 累计阅读 ' + WR.fmt.duration(progressBook.recordReadingTime) : '') +
        (progressBook.finishTime ? ' · 读完于 ' + WR.fmt.esc(WR.fmt.date(progressBook.finishTime)) : '') +
        '</div>' +
        '</div>' +
        '<div class="progress-bar"><div style="width:' + Math.min(100, progress) + '%"></div></div>' +
        (progress === 0 && !progressBook.isStartReading ? '<div class="muted" style="font-size:12px">尚未开始阅读（接口返回 progress=0）</div>' : '') +
        (info.intro ? '<h4 style="margin-top:14px">简介</h4><div style="font-size:13px">' + WR.fmt.nl2br(WR.fmt.truncate(info.intro, 600)) + '</div>' : '') +
        '</div></div></div>' +

        '<div class="grid halves" style="margin-top:16px">' +
        '<div class="card"><h3>章节目录（' + chapters.length + '）</h3>' +
        (chapters.length
          ? '<div class="chapters">' + chapters.map((c) => '<div class="ch" style="padding-left:' + (4 + ((c.level || 1) - 1) * 14) + 'px">' +
            '<span>' + WR.fmt.esc(c.title || '') + '</span><span class="muted">' +
            WR.fmt.esc(c.wordCount ? WR.fmt.num(c.wordCount) + ' 字' : '') + (c.paid === 0 && c.price > 0 ? ' · 付费' : '') +
            '</span></div>').join('') + '</div>'
          : '<div class="empty">暂无目录数据</div>') +
        '</div>' +
        '<div class="card"><h3>热门划线</h3>' +
        (best.data && Array.isArray(best.data.items) && best.data.items.length
          ? best.data.items.slice(0, 10).map((it) =>
              '<div class="mark">' + WR.fmt.nl2br(it.markText) + '<div class="when">' + WR.fmt.esc(it.totalCount || 0) + ' 人划线</div></div>'
            ).join('')
          : '<div class="empty">暂无热门划线</div>') +
        '</div>' +
        '</div>' +

        '<div class="card" style="margin-top:16px"><h3>我的划线（' + ((marks.data && marks.data.count) || 0) + ' 条）</h3>' +
        (marks.error ? '<div class="empty">读取失败：' + WR.fmt.esc(marks.error.message) + '</div>' : marksHtml) +
        '</div>' +

        '<div class="card"><h3>我的想法与点评（' + ((reviews.data && reviews.data.count) || 0) + ' 条）</h3>' +
        (reviews.error ? '<div class="empty">读取失败：' + WR.fmt.esc(reviews.error.message) + '</div>' : reviewsHtml) +
        '</div>' +

        '<div class="card"><h3>公开点评</h3><div id="publicBox"></div></div>' +

        (similarBooks.length
          ? '<div class="section-head"><h2>相似推荐</h2></div><div class="books">' +
            similarBooks
              .map((b) =>
                '<div class="book" data-book="' + WR.fmt.esc(b.bookId) + '">' +
                (b.cover ? '<img class="thumb" loading="lazy" src="' + WR.fmt.esc(b.cover) + '" alt="">' : '') +
                '<div class="title">' + WR.fmt.esc(b.title || '') + '</div>' +
                '<div class="meta">' + WR.fmt.esc(b.author || '') + '</div></div>'
              )
              .join('') + '</div>'
          : '');

      el.querySelectorAll('[data-book]').forEach((node) => {
        node.addEventListener('click', () => {
          location.hash = '#/book/' + encodeURIComponent(node.getAttribute('data-book'));
        });
      });

      await renderPublic(el, bookId, 0);
    },
  };
})();
