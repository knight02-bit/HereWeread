/* 手写 SVG 图表（零依赖、零 CDN），全部返回 HTML 字符串 */
window.WR = window.WR || {};

(function () {
  const PALETTE = [
    '#4c8dff',
    '#7b5cff',
    '#35c46a',
    '#ffb020',
    '#ff5d5d',
    '#20c8d8',
    '#e879f9',
    '#f97316',
    '#94a3b8',
    '#22d3ee',
  ];

  const esc = (s) => WR.fmt.esc(s);
  const color = (i) => PALETTE[i % PALETTE.length];

  function emptyBox(text) {
    return '<div class="empty">' + esc(text || '暂无数据') + '</div>';
  }

  /** 柱状图 */
  function bars(items, opts) {
    const list = (items || []).filter(Boolean);
    if (!list.length) return emptyBox(opts && opts.emptyText);
    const o = Object.assign({ width: 720, height: 200, format: (v) => String(v), color: '#4c8dff' }, opts || {});
    const max = Math.max.apply(null, list.map((d) => Number(d.value) || 0)) || 1;
    const padL = 8;
    const padR = 8;
    const padT = 16;
    const padB = 30;
    const innerW = o.width - padL - padR;
    const innerH = o.height - padT - padB;
    const gap = Math.min(10, Math.max(2, innerW / list.length / 5));
    const barW = Math.max(2, (innerW - gap * (list.length - 1)) / list.length);
    const showLabel = list.length <= 32;
    const parts = [];
    parts.push('<svg viewBox="0 0 ' + o.width + ' ' + o.height + '" role="img">');
    parts.push('<line x1="0" y1="' + (padT + innerH) + '" x2="' + o.width + '" y2="' + (padT + innerH) + '" stroke="rgba(140,150,170,.35)" stroke-width="1"/>');
    list.forEach((d, i) => {
      const v = Number(d.value) || 0;
      const h = Math.max(v > 0 ? 2 : 0, (v / max) * innerH);
      const x = padL + i * (barW + gap);
      const y = padT + innerH - h;
      const c = d.color || o.color;
      parts.push(
        '<g class="bar"><title>' +
          esc(d.label) +
          '：' +
          esc(o.format(v)) +
          '</title><rect x="' +
          x.toFixed(1) +
          '" y="' +
          y.toFixed(1) +
          '" width="' +
          barW.toFixed(1) +
          '" height="' +
          h.toFixed(1) +
          '" rx="' +
          Math.min(4, barW / 2).toFixed(1) +
          '" fill="' +
          c +
          '"/></g>'
      );
      if (showLabel) {
        parts.push(
          '<text x="' +
            (x + barW / 2).toFixed(1) +
            '" y="' +
            (o.height - 10) +
            '" text-anchor="middle" font-size="11" fill="currentColor" opacity="0.65">' +
            esc(d.label) +
            '</text>'
        );
      }
    });
    parts.push('</svg>');
    return '<div class="chart">' + parts.join('') + '</div>';
  }

  /** 横向条形图（用于排行） */
  function hbars(items, opts) {
    const list = (items || []).filter(Boolean);
    if (!list.length) return emptyBox(opts && opts.emptyText);
    const o = Object.assign({ format: (v) => String(v) }, opts || {});
    const max = Math.max.apply(null, list.map((d) => Number(d.value) || 0)) || 1;
    const rows = list
      .map((d, i) => {
        const v = Number(d.value) || 0;
        const w = Math.max(1, (v / max) * 100);
        return (
          '<div class="row" style="margin-bottom:8px;gap:10px">' +
          '<div style="flex:0 1 42%;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap" title="' +
          esc(d.label) +
          '">' +
          esc(WR.fmt.truncate(d.label, 22)) +
          '</div>' +
          '<div style="flex:1;background:var(--border);border-radius:6px;height:12px;overflow:hidden">' +
          '<div style="width:' +
          w.toFixed(1) +
          '%;height:100%;background:' +
          color(i) +
          '"></div></div>' +
          '<div style="flex:0 0 92px;text-align:right;color:var(--muted);font-size:12px">' +
          esc(o.format(v)) +
          '</div>' +
          '</div>'
        );
      })
      .join('');
    return '<div>' + rows + '</div>';
  }

  /** 环形图（返回 {svg, legend}） */
  function donut(items, opts) {
    const list = (items || []).filter((d) => d && (Number(d.value) || 0) > 0);
    if (!list.length) return { svg: emptyBox(opts && opts.emptyText), legend: '' };
    const o = Object.assign({ size: 200, thickness: 26, format: (v) => String(v) }, opts || {});
    const total = list.reduce((s, d) => s + (Number(d.value) || 0), 0) || 1;
    const cx = o.size / 2;
    const cy = o.size / 2;
    const r = o.size / 2 - 4;
    const inner = r - o.thickness;
    let angle = -Math.PI / 2;
    const parts = [];
    parts.push('<svg viewBox="0 0 ' + o.size + ' ' + o.size + '" role="img">');
    list.forEach((d, i) => {
      const v = Number(d.value) || 0;
      const sweep = (v / total) * Math.PI * 2;
      const a0 = angle;
      const a1 = angle + sweep;
      angle = a1;
      const x0 = cx + r * Math.cos(a0);
      const y0 = cy + r * Math.sin(a0);
      const x1 = cx + r * Math.cos(a1);
      const y1 = cy + r * Math.sin(a1);
      const xi1 = cx + inner * Math.cos(a1);
      const yi1 = cy + inner * Math.sin(a1);
      const xi0 = cx + inner * Math.cos(a0);
      const yi0 = cy + inner * Math.sin(a0);
      const large = sweep > Math.PI ? 1 : 0;
      const d2 =
        'M' + x0.toFixed(2) + ' ' + y0.toFixed(2) +
        ' A' + r + ' ' + r + ' 0 ' + large + ' 1 ' + x1.toFixed(2) + ' ' + y1.toFixed(2) +
        ' L' + xi1.toFixed(2) + ' ' + yi1.toFixed(2) +
        ' A' + inner + ' ' + inner + ' 0 ' + large + ' 0 ' + xi0.toFixed(2) + ' ' + yi0.toFixed(2) +
        ' Z';
      parts.push(
        '<path d="' + d2 + '" fill="' + (d.color || color(i)) + '"><title>' +
          esc(d.label) + '：' + esc(o.format(v)) + '（' + ((v / total) * 100).toFixed(1) + '%）</title></path>'
      );
    });
    parts.push(
      '<text x="' + cx + '" y="' + (cy - 2) + '" text-anchor="middle" font-size="15" font-weight="700" fill="currentColor">' +
        esc(o.centerLabel || '') +
        '</text>'
    );
    parts.push(
      '<text x="' + cx + '" y="' + (cy + 16) + '" text-anchor="middle" font-size="11" fill="currentColor" opacity="0.6">' +
        esc(o.centerSub || '') +
        '</text>'
    );
    parts.push('</svg>');
    const legend =
      '<div class="chart-legend">' +
      list
        .map(
          (d, i) =>
            '<span><span class="dot" style="background:' +
            (d.color || color(i)) +
            '"></span>' +
            esc(WR.fmt.truncate(d.label, 14)) +
            ' · ' +
            esc(o.format(d.value)) +
            '</span>'
        )
        .join('') +
      '</div>';
    return { svg: '<div class="chart">' + parts.join('') + '</div>', legend };
  }

  /** 24 小时时段分布（服务端顺序从 6 点开始） */
  function timeOfDay(values, opts) {
    const arr = values || [];
    if (!arr.length) return emptyBox('暂无时段数据');
    const labels = [];
    for (let i = 0; i < arr.length; i += 1) {
      labels.push(((6 + i) % 24) + '时');
    }
    return bars(
      arr.map((v, i) => ({ label: labels[i], value: v, color: 'rgba(76,141,255,.85)' })),
      Object.assign({ height: 180, format: (v) => WR.fmt.duration(v) }, opts || {})
    );
  }

  /** 年度热力图（GitHub 风格） */
  function heatmap(values, opts) {
    const o = Object.assign({ year: new Date().getFullYear() }, opts || {});
    const map = new Map();
    Object.keys(values || {}).forEach((k) => {
      const ts = Number(k) * 1000;
      if (!ts) return;
      const d = new Date(ts);
      map.set(d.getFullYear() + '-' + (d.getMonth() + 1) + '-' + d.getDate(), Number(values[k]) || 0);
    });
    if (!map.size) return emptyBox('暂无每日明细数据');
    const start = new Date(o.year, 0, 1);
    const end = new Date(o.year, 11, 31);
    const days = [];
    for (let d = new Date(start); d <= end; d.setDate(d.getDate() + 1)) {
      const key = d.getFullYear() + '-' + (d.getMonth() + 1) + '-' + d.getDate();
      days.push({ key, date: new Date(d), value: map.get(key) || 0 });
    }
    const max = Math.max.apply(null, days.map((d) => d.value)) || 1;
    const cell = 12;
    const gap = 3;
    const weeks = Math.ceil((days.length + days[0].date.getDay()) / 7);
    const width = weeks * (cell + gap) + 34;
    const height = 7 * (cell + gap) + 18;
    const parts = [];
    parts.push('<svg viewBox="0 0 ' + width + ' ' + height + '" role="img">');
    const level = (v) => {
      if (!v) return 0;
      const r = v / max;
      if (r < 0.25) return 1;
      if (r < 0.5) return 2;
      if (r < 0.75) return 3;
      return 4;
    };
    const fills = [
      'rgba(140,150,170,.18)',
      'rgba(76,141,255,.30)',
      'rgba(76,141,255,.52)',
      'rgba(76,141,255,.74)',
      'rgba(76,141,255,1)',
    ];
    let monthLabel = -1;
    days.forEach((d) => {
      const week = Math.floor((d.date.getDay() + Math.floor((d.date - start) / 86400000)) / 7);
      const row = d.date.getDay();
      const x = 30 + week * (cell + gap);
      const y = 14 + row * (cell + gap);
      if (d.date.getMonth() !== monthLabel && d.date.getDate() <= 7) {
        monthLabel = d.date.getMonth();
        parts.push(
          '<text x="' + x + '" y="10" font-size="10" fill="currentColor" opacity="0.6">' + (monthLabel + 1) + '月</text>'
        );
      }
      parts.push(
        '<rect x="' + x + '" y="' + y + '" width="' + cell + '" height="' + cell + '" rx="2" fill="' +
          fills[level(d.value)] + '"><title>' + esc(WR.fmt.date(d.date.getTime() / 1000)) + '：' +
          esc(WR.fmt.duration(d.value)) + '</title></rect>'
      );
    });
    parts.push('</svg>');
    return (
      '<div class="chart">' + parts.join('') +
      '<div class="chart-legend"><span>颜色越深表示当天阅读越久（最深 = ' +
      esc(WR.fmt.duration(max)) + '）</span></div></div>'
    );
  }

  WR.charts = { bars, hbars, donut, timeOfDay, heatmap, PALETTE, color, emptyBox };
})();
