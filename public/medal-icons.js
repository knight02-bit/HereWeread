/*
 * 勋章图标：本地绘制（内联 SVG）。
 * 说明：微信读书 Agent API 的 medals 字段不含任何图标 URL，
 *       官方 CDN 上也没有公开的勋章图资源，因此这里按 type/level 本地生成，
 *       零外部依赖、离线可用、自动适配深色/浅色主题。
 */
window.WR = window.WR || {};

(function () {
  /** 等级由 level 相对该 type 的档位换算而来 */
  const SCALES = {
    1: [7, 21, 30, 60], // 连续阅读（天）
    2: [10, 50, 100, 365], // 阅读时长（小时）
    3: [30, 100, 200, 365], // 阅读天数
    4: [10, 50, 100, 365], // 阅读书籍（本）
    5: [1, 10, 30, 74], // 读完书籍（本）
    7: [1, 5, 10, 50], // 想法发布（条）
    9: [1, 5, 10, 20], // 阅读神作（本）
    12: [0, 1, 2, 9], // 活动挑战
  };

  const TIERS = [
    { name: '青铜', light: '#e2a869', dark: '#8a4b21' },
    { name: '白银', light: '#eef2f8', dark: '#8d9ab1' },
    { name: '黄金', light: '#ffd976', dark: '#a9760c' },
    { name: '钻石', light: '#a5f3fc', dark: '#2f6fd0' },
  ];

  const TYPE_NAME = {
    1: '连续阅读',
    2: '阅读时长',
    3: '阅读天数',
    4: '阅读书籍',
    5: '读完书籍',
    7: '想法发布',
    9: '阅读神作',
    12: '活动挑战',
  };

  const TYPE_COLOR = {
    1: '#f97316',
    2: '#38bdf8',
    3: '#22c55e',
    4: '#a78bfa',
    5: '#34d399',
    7: '#f472b6',
    9: '#fbbf24',
    12: '#e879f9',
  };

  /** 24×24 图形；fill/stroke 用 currentColor，颜色由外层 g 的 color 决定 */
  const GLYPHS = {
    // 连续阅读：火焰
    1:
      '<path d="M12 21c-3.3 0-6-2.7-6-6 0-2.6 1.6-4.1 3-5.8C10.3 7.7 11 6.1 11 4c2.6 1.5 4.2 3.4 5.2 5.4 1.2 2.3 1.8 4 1.8 5.6 0 3.3-2.7 6-6 6z" fill="currentColor"/>' +
      '<path d="M12 18.6c-1.6 0-2.9-1.3-2.9-2.9 0-1.4.9-2.3 1.9-3.3.5-.5 1-1.2 1.2-2 .8 1 1.5 1.9 2.2 2.8.4.6.5 1.3.5 2.1 0 1.6-1.3 2.9-2.9 2.9z" fill="rgba(255,255,255,.5)"/>',
    // 阅读时长：时钟
    2:
      '<circle cx="12" cy="12" r="8.4" fill="none" stroke="currentColor" stroke-width="2.1"/>' +
      '<path d="M12 7.1V12l3.5 2.1" fill="none" stroke="currentColor" stroke-width="2.1" stroke-linecap="round"/>',
    // 阅读天数：日历
    3:
      '<rect x="3.2" y="5.2" width="17.6" height="15.6" rx="2.6" fill="currentColor"/>' +
      '<rect x="3.2" y="5.2" width="17.6" height="4.6" rx="2.2" fill="rgba(0,0,0,.32)"/>' +
      '<rect x="6.6" y="2.6" width="2" height="4.4" rx="1" fill="currentColor"/>' +
      '<rect x="15.4" y="2.6" width="2" height="4.4" rx="1" fill="currentColor"/>' +
      '<circle cx="8.4" cy="13" r="1.4" fill="rgba(255,255,255,.9)"/>' +
      '<circle cx="12" cy="13" r="1.4" fill="rgba(255,255,255,.9)"/>' +
      '<circle cx="15.6" cy="13" r="1.4" fill="rgba(255,255,255,.9)"/>' +
      '<circle cx="8.4" cy="17.2" r="1.4" fill="rgba(255,255,255,.9)"/>' +
      '<circle cx="12" cy="17.2" r="1.4" fill="rgba(255,255,255,.9)"/>',
    // 阅读书籍：书堆
    4:
      '<rect x="3" y="15.6" width="18" height="4.2" rx="1.5" fill="currentColor"/>' +
      '<rect x="4.2" y="10.8" width="15.6" height="4.2" rx="1.5" fill="currentColor" opacity=".82"/>' +
      '<rect x="5.6" y="6" width="12.8" height="4.2" rx="1.5" fill="currentColor" opacity=".64"/>' +
      '<rect x="7.2" y="3" width="1.8" height="4.6" rx=".9" fill="rgba(255,255,255,.55)"/>',
    // 读完书籍：书 + 对勾
    5:
      '<path d="M5.2 4.6h8.4a3 3 0 0 1 3 3v11.8H8.2a3 3 0 0 1-3-3z" fill="currentColor"/>' +
      '<rect x="7" y="7.2" width="6.4" height="1.6" rx=".8" fill="rgba(255,255,255,.55)"/>' +
      '<path d="M15.2 16.8l2.4 2.4 3.8-4.4" fill="none" stroke="rgba(255,255,255,.95)" stroke-width="2.3" stroke-linecap="round" stroke-linejoin="round"/>',
    // 想法发布：笔
    7:
      '<path d="M4 18.4l1-3.7 9.3-9.3 2.7 2.7-9.3 9.3z" fill="currentColor"/>' +
      '<path d="M15.5 4.2l1.6-1.6a1.6 1.6 0 0 1 2.3 0l1.3 1.3a1.6 1.6 0 0 1 0 2.3l-1.6 1.6z" fill="currentColor" opacity=".78"/>' +
      '<path d="M4.4 19.9l2.7-1.1-1-1z" fill="rgba(255,255,255,.6)"/>',
    // 阅读神作：星
    9: '<path d="M12 2.6l2.9 6.1 6.7.9-4.9 4.7 1.2 6.7-5.9-3.3-5.9 3.3 1.2-6.7-4.9-4.7 6.7-.9z" fill="currentColor"/>',
    // 活动挑战：缎带勋章
    12:
      '<circle cx="12" cy="9.8" r="6.1" fill="currentColor"/>' +
      '<path d="M8.6 15.4L6.2 22.4 12 19.4l5.8 3-2.4-7z" fill="currentColor" opacity=".82"/>' +
      '<circle cx="12" cy="9.8" r="2.9" fill="rgba(255,255,255,.5)"/>',
  };

  const FALLBACK =
    '<circle cx="12" cy="12" r="6.2" fill="currentColor"/>' +
    '<circle cx="12" cy="12" r="2.4" fill="rgba(255,255,255,.65)"/>';

  let uid = 0;

  function tierOf(medal) {
    const scale = SCALES[Number(medal && medal.type)] || [1, 5, 10, 20];
    const level = Number((medal && medal.level) || 0);
    let tier = 0;
    for (const step of scale) if (level >= step) tier += 1;
    return Math.min(tier, TIERS.length - 1);
  }

  function icon(medal, opts) {
    const o = opts || {};
    const size = o.size || 64;
    const type = Number((medal && medal.type) || 0);
    const tier = TIERS[tierOf(medal)];
    const color = TYPE_COLOR[type] || '#94a3b8';
    const glyph = GLYPHS[type] || FALLBACK;
    const id = 'mg' + (uid += 1) + '-' + type;
    const label =
      (medal && (medal.styleTitle || medal.displayText || medal.title || medal.name)) || '勋章';
    return (
      '<svg class="medal-svg" width="' + size + '" height="' + size + '" viewBox="0 0 64 64" role="img" aria-label="' +
      WR.fmt.esc(label) +
      '">' +
      '<defs><linearGradient id="' + id + '" x1="0" y1="0" x2="1" y2="1">' +
      '<stop offset="0" stop-color="' + tier.light + '"/><stop offset="1" stop-color="' + tier.dark + '"/>' +
      '</linearGradient></defs>' +
      '<circle cx="32" cy="32" r="30" fill="url(#' + id + ')"/>' +
      '<circle cx="32" cy="32" r="25.4" fill="rgba(10,14,22,.42)"/>' +
      '<circle cx="32" cy="32" r="25.4" fill="none" stroke="rgba(255,255,255,.22)" stroke-width="1"/>' +
      '<g transform="translate(20,20)" style="color:' + color + '">' + glyph + '</g>' +
      '</svg>'
    );
  }

  function card(medal) {
    const f = WR.fmt;
    const tier = TIERS[tierOf(medal)];
    const typeName = TYPE_NAME[Number(medal.type)] || '勋章';
    const name = medal.styleTitle || medal.displayText || medal.title || medal.name || '勋章';
    const desc = medal.hint || medal.availableCond || '';
    const when = medal.ctime ? f.date(medal.ctime) : '';
    const rank = medal.rank ? '第 ' + f.num(medal.rank) + ' 位获得' : '';
    return (
      '<div class="medal-card" title="' + f.esc(medal.rankText || desc) + '">' +
      '<div class="medal-icon-wrap">' + icon(medal) + '</div>' +
      '<div class="medal-name">' + f.esc(f.truncate(name, 16)) + '</div>' +
      '<div class="medal-desc">' + f.esc(f.truncate(desc, 20)) + '</div>' +
      '<div class="medal-tier"><span class="tier-dot" style="background:linear-gradient(135deg,' +
      tier.light + ',' + tier.dark + ')"></span>' + f.esc(tier.name) + ' · ' + f.esc(typeName) + '</div>' +
      '<div class="medal-meta">' + f.esc(when) + (rank ? ' · ' + f.esc(rank) : '') + '</div>' +
      '</div>'
    );
  }

  function grid(medals) {
    const list = (medals || []).filter(Boolean);
    if (!list.length) return '';
    return '<div class="medal-grid">' + list.map(card).join('') + '</div>';
  }

  WR.medals = { icon, card, grid, tierOf, TIERS, TYPE_NAME, TYPE_COLOR };
})();
