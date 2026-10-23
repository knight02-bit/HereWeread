/* 通用格式化工具：全局命名空间 WR */
window.WR = window.WR || {};

(function () {
  function toMs(ts) {
    const n = Number(ts) || 0;
    if (!n) return 0;
    return n > 1e12 ? n : n * 1000;
  }

  function pad(x) {
    return String(x).padStart(2, '0');
  }

  const fmt = {
    /** 秒 → X小时Y分钟 */
    duration(sec) {
      const s = Math.max(0, Math.round(Number(sec) || 0));
      if (s === 0) return '0分钟';
      if (s < 60) return s + '秒';
      const h = Math.floor(s / 3600);
      const m = Math.round((s % 3600) / 60);
      if (h === 0) return m + '分钟';
      return m === 0 ? h + '小时' : h + '小时' + m + '分钟';
    },
    hours(sec) {
      return (Math.round(((Number(sec) || 0) / 3600) * 10) / 10).toFixed(1) + ' 小时';
    },
    date(ts) {
      const ms = toMs(ts);
      if (!ms) return '—';
      const d = new Date(ms);
      return d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate());
    },
    dateTime(ts) {
      const ms = toMs(ts);
      if (!ms) return '—';
      const d = new Date(ms);
      return fmt.date(ts) + ' ' + pad(d.getHours()) + ':' + pad(d.getMinutes());
    },
    /** 时间戳（秒）→ 用于图表标签的 M月D日 */
    md(ts) {
      const ms = toMs(ts);
      if (!ms) return '';
      const d = new Date(ms);
      return d.getMonth() + 1 + '/' + d.getDate();
    },
    num(n) {
      const v = Number(n) || 0;
      return v.toLocaleString('zh-CN');
    },
    pct(v) {
      const n = Number(v) || 0;
      return Math.round(n * 10) / 10 + '%';
    },
    /** 0-100 分 → 星级（20=1星） */
    star(score) {
      const s = Number(score) || 0;
      if (s <= 0) return '';
      const stars = Math.max(0, Math.min(5, Math.round(s / 20)));
      return '★'.repeat(stars) + '☆'.repeat(5 - stars);
    },
    compare(v) {
      const n = Number(v);
      if (!isFinite(n) || n === 0) return { text: '与上期持平', cls: 'muted' };
      const pctText = Math.abs(Math.round(n * 1000) / 10) + '%';
      return n > 0 ? { text: '较上期 +' + pctText, cls: 'ok' } : { text: '较上期 -' + pctText, cls: 'warn' };
    },
    esc(s) {
      return String(s === null || s === undefined ? '' : s)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;');
    },
    /** 纯文本换行 → <br> */
    nl2br(s) {
      return fmt.esc(s).replace(/\n/g, '<br>');
    },
    truncate(s, n) {
      const t = String(s || '');
      return t.length > n ? t.slice(0, n) + '…' : t;
    },
    fileSize(bytes) {
      const b = Number(bytes) || 0;
      if (b < 1024) return b + ' B';
      if (b < 1024 * 1024) return (b / 1024).toFixed(1) + ' KB';
      return (b / 1024 / 1024).toFixed(2) + ' MB';
    },
    ago(ts) {
      const ms = toMs(ts);
      if (!ms) return '';
      const diff = Date.now() - ms;
      if (diff < 60e3) return '刚刚';
      if (diff < 3600e3) return Math.floor(diff / 60e3) + ' 分钟前';
      if (diff < 86400e3) return Math.floor(diff / 3600e3) + ' 小时前';
      return Math.floor(diff / 86400e3) + ' 天前';
    },
  };

  WR.fmt = fmt;

  WR.ui = {
    escape: fmt.esc,
    toast(message, ms) {
      const el = document.getElementById('toast');
      if (!el) return;
      el.textContent = message;
      el.hidden = false;
      clearTimeout(WR.ui._toastTimer);
      WR.ui._toastTimer = setTimeout(() => {
        el.hidden = true;
      }, ms || 2600);
    },
    banner(message, kind) {
      const el = document.getElementById('banner');
      if (!el) return;
      if (!message) {
        el.hidden = true;
        el.innerHTML = '';
        return;
      }
      el.className = 'banner' + (kind === 'error' ? ' error' : '');
      el.innerHTML = message;
      el.hidden = false;
    },
  };
})();
