/* 概览视图 */
(function () {
  window.WR = window.WR || {};
  WR.views = WR.views || {};

  const f = () => WR.fmt;
  const C = () => WR.charts;

  function statCard(label, value, sub) {
    return (
      '<div class="card stat"><div class="label">' +
      WR.fmt.esc(label) +
      '</div><div class="value">' +
      WR.fmt.esc(value) +
      '</div><div class="sub">' +
      WR.fmt.esc(sub || '') +
      '</div></div>'
    );
  }

  function recentBooks(books) {
    const list = books
      .slice()
      .sort((a, b) => (Number(b.readUpdateTime) || 0) - (Number(a.readUpdateTime) || 0))
      .slice(0, 6);
    if (!list.length) return '<div class="empty">书架暂无数据</div>';
    return list
      .map(
        (b) =>
          '<div class="book" data-book="' +
          WR.fmt.esc(b.bookId) +
          '">' +
          (b.cover
            ? '<img class="thumb" loading="lazy" src="' + WR.fmt.esc(b.cover) + '" alt="" onerror="this.style.display=\'none\'">'
            : '') +
          '<div class="title">' + WR.fmt.esc(b.title || '未命名') + '</div>' +
          '<div class="meta">' + WR.fmt.esc(b.author || '—') + '</div>' +
          '<div class="meta">最近阅读 ' + WR.fmt.esc(WR.fmt.date(b.readUpdateTime)) + '</div>' +
          '<div class="badges">' +
          (b.finishReading === 1 ? '<span class="badge ok">已读完</span>' : '') +
          (b.secret === 1 ? '<span class="badge warn">私密</span>' : '') +
          (b.category ? '<span class="badge">' + WR.fmt.esc(b.category) + '</span>' : '') +
          '</div></div>'
      )
      .join('');
  }

  WR.views.dashboard = {
    title: '概览',
    async render(el) {
      el.innerHTML = '<div class="empty">正在汇总数据…</div>';
      const [health, shelf, notebooks, overall, monthly, weekly, annually] = await Promise.all([
        WR.api.health(),
        WR.api.shelf(),
        WR.api.notebooks(),
        WR.api.readdata('overall'),
        WR.api.readdata('monthly'),
        WR.api.readdata('weekly'),
        WR.api.readdata('annually'),
      ]);

      const c = shelf.data.counts;
      const sums = notebooks.data.sums;
      const cmp = WR.fmt.compare(monthly.data.compare);

      // 月度趋势：annually 的 readTimes 按月分桶
      const monthlyBuckets = Object.keys(annually.data.readTimes || {})
        .map((k) => ({ ts: Number(k), value: Number(annually.data.readTimes[k]) || 0 }))
        .sort((a, b) => a.ts - b.ts)
        .map((d) => ({ label: new Date(d.ts * 1000).getMonth() + 1 + '月', value: d.value }));
      const year = new Date().getFullYear();

      el.innerHTML =
        '<div class="section-head"><h2>阅读概览</h2><span class="muted">数据更新时间 ' +
        WR.fmt.esc(WR.fmt.ago(Date.now())) +
        '（技能版本 ' +
        WR.fmt.esc(health.skillVersion) +
        '）</span></div>' +
        '<div class="grid cards">' +
        statCard('总计阅读时长', WR.fmt.duration(overall.data.totalReadTime), '累计 ' + WR.fmt.num(overall.data.readDays || 0) + ' 天有阅读') +
        statCard('本月阅读', WR.fmt.duration(monthly.data.totalReadTime), cmp.text + ' · ' + WR.fmt.date(monthly.data.baseTime)) +
        statCard('本周阅读', WR.fmt.duration(weekly.data.totalReadTime), '自 ' + WR.fmt.date(weekly.data.baseTime)) +
        statCard('本月日均', WR.fmt.duration(monthly.data.dayAverageReadTime), '按自然日计算') +
        statCard('书架条目', c.total + ' 个', c.books + ' 电子书 · ' + c.albums + ' 专辑 · ' + c.mp + ' 文章收藏') +
        statCard('读完 / 私密', c.finished + ' / ' + c.secretCount, '书架共 ' + c.publicCount + ' 个公开条目') +
        statCard('有笔记的书', notebooks.data.totalBookCount + ' 本', '笔记合计 ' + WR.fmt.num(notebooks.data.totalNoteCount) + ' 条') +
        statCard('笔记构成', sums.noteCount + ' 划线', sums.reviewCount + ' 想法/点评 · ' + sums.bookmarkCount + ' 书签') +
        '</div>' +

        '<div class="section-head"><h2>' + year + ' 年月度阅读时长</h2></div>' +
        '<div class="card">' +
        WR.charts.bars(monthlyBuckets, { height: 220, format: (v) => WR.fmt.duration(v), emptyText: '暂无数据' }) +
        '</div>' +

        '<div class="grid two" style="margin-top:16px">' +
        '<div class="card"><h3>偏好阅读分类</h3>' +
        (function () {
          const cat = (annually.data.preferCategory || []).map((p) => ({ label: p.categoryTitle, value: p.readingTime || 0 }));
          const d = WR.charts.donut(cat, {
            format: (v) => WR.fmt.duration(v),
            centerLabel: WR.fmt.duration(annually.data.totalReadTime),
            centerSub: '本年合计',
            emptyText: '暂无分类偏好数据',
          });
          return d.svg + d.legend;
        })() +
        '</div>' +
        '<div class="card"><h3>阅读时段分布</h3>' +
        WR.charts.timeOfDay(annually.data.preferTime, { format: (v) => WR.fmt.duration(v) }) +
        '<div class="muted" style="margin-top:8px;font-size:12px">' +
        WR.fmt.esc(annually.data.preferTimeWord || '（从 6 时起按小时统计）') +
        '</div></div>' +
        '</div>' +

        '<div class="grid two" style="margin-top:16px">' +
        '<div class="card"><h3>读得最多的书（本年）</h3>' +
        WR.charts.hbars(
          (annually.data.readLongest || []).map((x) => ({
            label: (x.book && x.book.title) || (x.albumInfo && x.albumInfo.name) || '未知',
            value: x.readTime || 0,
          })),
          { format: (v) => WR.fmt.duration(v), emptyText: '暂无排行数据' }
        ) +
        '</div>' +
        '<div class="card"><h3>偏好作者</h3>' +
        WR.charts.hbars(
          (annually.data.preferAuthor || []).map((a) => ({ label: a.name, value: a.count || 0 })),
          { format: (v) => v + ' 本', emptyText: '暂无作者偏好数据' }
        ) +
        (annually.data.authorCount
          ? '<div class="muted" style="font-size:12px">共涉及 ' + WR.fmt.esc(annually.data.authorCount) + ' 位作者</div>'
          : '') +
        '</div>' +
        '</div>' +

        '<div class="section-head"><h2>最近在读</h2><a href="#/shelf">查看全部书架 →</a></div>' +
        '<div class="books">' +
        recentBooks(shelf.data.books) +
        '</div>' +
        '<div class="muted" style="margin-top:10px;font-size:12px">提示：书架共 ' +
        c.total +
        ' 个条目（含文章收藏入口），完整清单见「书架」。</div>';

      el.querySelectorAll('[data-book]').forEach((node) => {
        node.addEventListener('click', () => {
          location.hash = '#/book/' + encodeURIComponent(node.getAttribute('data-book'));
        });
      });
    },
  };
})();
