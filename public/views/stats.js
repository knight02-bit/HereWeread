/* 阅读统计视图：周期切换 + 明细图表 */
(function () {
  window.WR = window.WR || {};
  WR.views = WR.views || {};

  const state = { mode: 'monthly', year: new Date().getFullYear() };
  let overallCache = null;

  function modeTabs() {
    const modes = [
      ['weekly', '本周'],
      ['monthly', '本月'],
      ['annually', '本年'],
      ['overall', '总计'],
    ];
    return (
      '<div class="tabs" id="modeTabs">' +
      modes
        .map(
          (m) =>
            '<button class="tab' + (state.mode === m[0] ? ' active' : '') + '" data-mode="' + m[0] + '">' + m[1] + '</button>'
        )
        .join('') +
      '</div>'
    );
  }

  function yearPicker() {
    if (state.mode !== 'annually') return '';
    const y = new Date().getFullYear();
    const years = [];
    for (let i = y; i >= y - 6; i -= 1) years.push(i);
    return (
      '<label class="field">年份 <select id="yearPick">' +
      years
        .map((v) => '<option value="' + v + '"' + (v === state.year ? ' selected' : '') + '>' + v + '</option>')
        .join('') +
      '</select></label>'
    );
  }

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

  function body(d) {
    const cmp = WR.fmt.compare(d.compare);
    const bucketRows = Object.keys(d.readTimes || {})
      .map((k) => ({ ts: Number(k), value: Number(d.readTimes[k]) || 0 }))
      .sort((a, b) => a.ts - b.ts);
    const bucketLabel = (ts) => (state.mode === 'annually' ? new Date(ts * 1000).getMonth() + 1 + '月' : WR.fmt.md(ts));

    const donutData = WR.charts.donut(
      (d.preferCategory || []).map((p) => ({ label: p.categoryTitle, value: p.readingTime || 0 })),
      {
        format: (v) => WR.fmt.duration(v),
        centerLabel: WR.fmt.duration(d.totalReadTime),
        centerSub: '周期合计',
        emptyText: '暂无分类偏好',
      }
    );

    const readRateDonut =
      d.readRate !== undefined && d.readRate !== null
        ? WR.charts.donut(
            [
              { label: '文字阅读', value: d.wrReadTime || 0 },
              { label: '听书 / 朗读', value: d.wrListenTime || 0 },
            ],
            { format: (v) => WR.fmt.duration(v), centerLabel: WR.fmt.pct(d.readRate), centerSub: '文字占比' }
          )
        : null;

    return (
      '<div class="grid cards">' +
      statCard('总阅读时长', WR.fmt.duration(d.totalReadTime), '统计口径 totalReadTime（秒）') +
      statCard('有效阅读天数', (d.readDays || 0) + ' 天', '单日满 1 分钟计入') +
      statCard('日均时长', WR.fmt.duration(d.dayAverageReadTime), '按自然日平均') +
      statCard('环比上期', cmp.text, '来自接口 compare 字段') +
      '</div>' +

      '<div class="section-head"><h2>时长明细</h2><span class="muted">基准日 ' +
      WR.fmt.esc(WR.fmt.date(d.baseTime)) +
      '</span></div>' +
      '<div class="card">' +
      WR.charts.bars(
        bucketRows.map((r) => ({ label: bucketLabel(r.ts), value: r.value })),
        { height: 220, format: (v) => WR.fmt.duration(v), emptyText: '暂无分桶明细' }
      ) +
      '<div class="muted" style="font-size:12px;margin-top:8px">readTimes 仅用于明细展示，总量以 totalReadTime 为准。</div>' +
      '</div>' +

      '<div class="grid two" style="margin-top:16px">' +
      '<div class="card"><h3>偏好分类</h3>' +
      donutData.svg +
      donutData.legend +
      (d.preferCategoryWord ? '<div class="muted" style="font-size:12px">' + WR.fmt.esc(d.preferCategoryWord) + '</div>' : '') +
      '</div>' +
      '<div class="card"><h3>阅读时段</h3>' +
      WR.charts.timeOfDay(d.preferTime, { format: (v) => WR.fmt.duration(v) }) +
      (d.preferTimeWord ? '<div class="muted" style="font-size:12px">' + WR.fmt.esc(d.preferTimeWord) + '</div>' : '') +
      '</div>' +
      '</div>' +

      '<div class="grid two" style="margin-top:16px">' +
      '<div class="card"><h3>阅读排行（时长 Top）</h3>' +
      WR.charts.hbars(
        (d.readLongest || []).map((x) => ({
          label: (x.book && x.book.title) || (x.albumInfo && x.albumInfo.name) || '未知',
          value: x.readTime || 0,
        })),
        { format: (v) => WR.fmt.duration(v), emptyText: '暂无排行（低于 5 分钟会被过滤）' }
      ) +
      '</div>' +
      '<div class="card"><h3>阅读 / 听书占比</h3>' +
      (readRateDonut ? readRateDonut.svg + readRateDonut.legend : '<div class="empty">数据不足 1 小时或占比过高时不返回该项</div>') +
      '</div>' +
      '</div>' +

      '<div class="grid two" style="margin-top:16px">' +
      '<div class="card"><h3>偏好作者</h3>' +
      WR.charts.hbars(
        (d.preferAuthor || []).map((a) => ({ label: a.name, value: a.count || 0 })),
        { format: (v) => v + ' 本', emptyText: '暂无作者数据' }
      ) +
      '</div>' +
      '<div class="card"><h3>偏好出版社</h3>' +
      WR.charts.hbars(
        (d.preferPublisher || []).map((p) => ({ label: p.name, value: p.count || 0 })),
        { format: (v) => v + ' 本', emptyText: '暂无出版社数据' }
      ) +
      '</div>' +
      '</div>' +

      (d.dailyReadTimes && Object.keys(d.dailyReadTimes).length
        ? '<div class="section-head"><h2>' + state.year + ' 年每日阅读热力图</h2></div><div class="card">' +
          WR.charts.heatmap(d.dailyReadTimes, { year: state.year }) +
          '</div>'
        : '') +

      '<div class="grid halves" style="margin-top:16px">' +
      '<div class="card"><h3>统计摘要</h3>' +
      (Array.isArray(d.readStat) && d.readStat.length
        ? '<table><thead><tr><th>项目</th><th>数值</th></tr></thead><tbody>' +
          d.readStat
            .map((s) => '<tr><td>' + WR.fmt.esc(s.stat) + '</td><td>' + WR.fmt.esc(s.counts) + '</td></tr>')
            .join('') +
          '</tbody></table>'
        : '<div class="empty">暂无摘要</div>') +
      (d.rank && d.rank.text ? '<div class="muted" style="margin-top:8px">' + WR.fmt.esc(d.rank.text) + '</div>' : '') +
      '</div>' +
      '<div class="card"><h3>我的记录</h3>' +
      '<div class="kv">' +
      (d.registTime
        ? '<div class="k">注册时间</div><div>' + WR.fmt.esc(WR.fmt.date(d.registTime)) +
          '（' + WR.fmt.esc(Math.round((Date.now() / 1000 - d.registTime) / 86400)) + ' 天）</div>'
        : '') +
      (d.recordReadingTime
        ? '<div class="k">朗读时长</div><div>' + WR.fmt.esc(WR.fmt.duration(d.recordReadingTime)) + '</div>'
        : '') +
      '<div class="k">勋章</div><div>' + (medalsList().length ? medalsList().length + ' 枚' : '—') + '</div>' +
      '</div>' +
      '</div>' +
      '</div>' +

      '<div class="section-head"><h2>勋章</h2><span class="muted">' + medalsNote() + '</span></div>' +
      '<div class="card">' + medalsBody() + '</div>' +

      '<div class="section-head"><h2>历史快照</h2><span class="muted">每次拉取统计时自动记录，用于观察长期变化</span></div>' +
      '<div class="card" id="snapshotBox"><div class="empty">加载中…</div></div>'
    );
  }

  /** 勋章：接口只在 mode=overall 返回，且可展示勋章不少于 3 个时才有 */
  function medalsList() {
    return overallCache && Array.isArray(overallCache.medals) ? overallCache.medals : [];
  }

  function medalsNote() {
    const medals = medalsList();
    if (!medals.length) return '暂无可展示勋章（该账号可展示勋章不足 3 枚，或该口径不返回）';
    return (
      '共 ' + medals.length + ' 枚' +
      (state.mode === 'overall' ? '' : '（来自「总计」口径，接口只在总计返回勋章）') +
      '　·　等级按达成量换算（' + WR.medals.TIERS.map((t) => t.name).join(' / ') + '）' +
      '；图标为本地绘制——接口不提供官方勋章图标资源'
    );
  }

  function medalsBody() {
    const medals = medalsList();
    if (!medals.length) return '<div class="empty">暂无勋章数据</div>';
    return WR.medals.grid(medals);
  }

  function baseTimeFor() {
    if (state.mode !== 'annually') return 0;
    return Math.floor(new Date(state.year, 0, 1).getTime() / 1000);
  }

  async function renderBody(el) {
    const holder = el.querySelector('#statsBody');
    holder.innerHTML = '<div class="empty">加载中…</div>';
    try {
      const res = await WR.api.readdata(state.mode, baseTimeFor());
      if (state.mode === 'overall') {
        overallCache = res.data;
      } else {
        try {
          overallCache = (await WR.api.readdata('overall')).data;
        } catch (err) {
          /* 勋章仅在「总计」口径返回；取不到不影响主流程 */
        }
      }
      holder.innerHTML = body(res.data);
      el.querySelector('#yearPick') &&
        el.querySelector('#yearPick').addEventListener('change', (e) => {
          state.year = Number(e.target.value);
          renderBody(el);
        });
    } catch (err) {
      holder.innerHTML = '<div class="empty">统计获取失败：' + WR.fmt.esc(err.message) + '</div>';
    }
    const snapBox = el.querySelector('#snapshotBox');
    try {
      const snap = await WR.api.snapshots(state.mode === 'overall' ? 'overall' : state.mode);
      const items = snap.data.items || [];
      snapBox.innerHTML = items.length
        ? '<table><thead><tr><th>快照</th><th>记录时间</th><th>总时长</th><th>有效天数</th></tr></thead><tbody>' +
          items
            .slice()
            .reverse()
            .map(
              (s) =>
                '<tr><td>' +
                WR.fmt.esc(s.name) +
                '</td><td>' +
                WR.fmt.esc(WR.fmt.dateTime(s.savedAt)) +
                '</td><td>' +
                WR.fmt.esc(WR.fmt.duration(s.totalReadTime)) +
                '</td><td>' +
                WR.fmt.esc(s.readDays) +
                '</td></tr>'
            )
            .join('') +
          '</tbody></table>'
        : '<div class="empty">暂无历史快照</div>';
    } catch (err) {
      snapBox.innerHTML = '<div class="empty">快照读取失败</div>';
    }
  }

  WR.views.stats = {
    title: '阅读统计',
    async render(el) {
      el.innerHTML =
        '<div class="section-head"><h2>阅读统计</h2><div class="row">' + modeTabs() + yearPicker() + '</div></div>' +
        '<div id="statsBody"></div>';
      el.querySelectorAll('#modeTabs .tab').forEach((btn) => {
        btn.addEventListener('click', () => {
          state.mode = btn.getAttribute('data-mode');
          WR.views.stats.render(el);
        });
      });
      await renderBody(el);
    },
  };
})();
