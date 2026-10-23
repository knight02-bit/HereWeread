/* /api 客户端：负责 base 解析、信封拆包、错误中文化 */
window.WR = window.WR || {};

(function () {
  // 通过 http(s) 打开时走同源；用 file:// 直接预览时回退到本地服务
  const BASE = location.protocol === 'file:' ? 'http://127.0.0.1:5177' : '';
  const listeners = [];

  function onEvent(fn) {
    listeners.push(fn);
  }

  function emit(evt) {
    listeners.forEach((fn) => {
      try {
        fn(evt);
      } catch (err) {
        /* 忽略监听器异常 */
      }
    });
  }

  function qs(params) {
    if (!params) return '';
    const parts = Object.keys(params)
      .filter((k) => params[k] !== undefined && params[k] !== null && params[k] !== '')
      .map((k) => encodeURIComponent(k) + '=' + encodeURIComponent(params[k]));
    return parts.length ? '?' + parts.join('&') : '';
  }

  async function request(method, path, params) {
    let res;
    try {
      res = await fetch(BASE + '/api' + path + qs(params), {
        method,
        headers: { Accept: 'application/json' },
      });
    } catch (err) {
      const e = new Error('无法连接本地服务（127.0.0.1:5177），请先运行 start.cmd 启动服务');
      e.code = 'OFFLINE';
      throw e;
    }
    let json = null;
    try {
      json = await res.json();
    } catch (err) {
      json = null;
    }
    if (!json) {
      const e = new Error('服务返回内容无法解析（HTTP ' + res.status + '）');
      e.code = 'BAD_RESPONSE';
      throw e;
    }
    if (json.upgradeInfo) emit({ type: 'upgrade', info: json.upgradeInfo });
    if (json.warning) emit({ type: 'warning', message: json.warning });
    if (!json.ok) {
      const e = new Error((json.error && json.error.message) || '请求失败');
      e.code = (json.error && json.error.code) || 'ERROR';
      throw e;
    }
    return json;
  }

  const api = {
    base: BASE,
    onEvent,
    raw: request,

    health: () => request('GET', '/health'),
    shelf: (refresh) => request('GET', '/shelf', { refresh: refresh ? 1 : '' }),
    notebooks: (refresh) => request('GET', '/notebooks', { refresh: refresh ? 1 : '' }),
    readdata: (mode, baseTime, refresh) =>
      request('GET', '/readdata', { mode: mode || 'monthly', baseTime: baseTime || '', refresh: refresh ? 1 : '' }),
    book: (bookId, refresh) => request('GET', '/book/' + encodeURIComponent(bookId), { refresh: refresh ? 1 : '' }),
    marks: (bookId, refresh) => request('GET', '/book/' + encodeURIComponent(bookId) + '/marks', { refresh: refresh ? 1 : '' }),
    reviews: (bookId, refresh) =>
      request('GET', '/book/' + encodeURIComponent(bookId) + '/reviews', { refresh: refresh ? 1 : '' }),
    best: (bookId) => request('GET', '/book/' + encodeURIComponent(bookId) + '/best'),
    similar: (bookId) => request('GET', '/book/' + encodeURIComponent(bookId) + '/similar'),
    reviewsPublic: (bookId, type, maxIdx) =>
      request('GET', '/book/' + encodeURIComponent(bookId) + '/reviews-public', { type: type || 0, maxIdx: maxIdx || 0 }),
    recommend: (count, maxIdx) => request('GET', '/recommend', { count: count || 12, maxIdx: maxIdx || 0 }),
    discover: (count, maxIdx) => request('GET', '/discover', { count: count || 20, maxIdx: maxIdx || 0 }),
    search: (keyword, scope, maxIdx) =>
      request('GET', '/search', { keyword, scope: scope === undefined ? 0 : scope, maxIdx: maxIdx || 0 }),
    notesSearch: (keyword, limit) => request('GET', '/notes/search', { keyword, limit: limit || 200 }),
    syncStatus: () => request('GET', '/sync/status'),
    syncStart: () => request('POST', '/sync'),
    clearCache: () => request('POST', '/cache/clear'),
    snapshots: (mode) => request('GET', '/snapshots', { mode: mode || 'overall' }),

    exportUrl(bookId, format, all) {
      const params = all ? { all: 1 } : { bookId };
      return BASE + '/api/export/notes.' + (format === 'csv' ? 'csv' : 'md') + qs(params);
    },
  };

  WR.api = api;
})();
