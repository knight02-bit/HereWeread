'use strict';

/**
 * 全部 /api 端点实现。
 * 约定：route() 返回 { type:'json'|'download'|'none', ... }，由 index.js 负责发送。
 * 口径遵循 weread-skills 技能文档：
 *   - 书架条目数 = books + albums + mp
 *   - 笔记数 = reviewCount + noteCount + bookmarkCount（不再叠加点评）
 *   - 阅读时长单位秒，用 totalReadTime 作为总量口径，不用 readTimes 求和
 */

const { pickUpgradeInfo } = require('./weread');

const MIN = 60 * 1000;
const HOUR = 60 * MIN;

const TTL = {
  shelf: 30 * MIN,
  notebooks: 6 * HOUR,
  readdata: 30 * MIN,
  bookInfo: 24 * HOUR,
  chapters: 24 * HOUR,
  progress: 30 * MIN,
  marks: 24 * HOUR,
  reviewsMine: 24 * HOUR,
  best: 24 * HOUR,
  similar: 12 * HOUR,
  reviewList: 60 * MIN,
  recommend: 6 * HOUR,
  discover: 60 * MIN,
};

/* ---------------------------------------------------------------- 工具函数 */

function fmtDuration(seconds) {
  const s = Math.max(0, Math.round(Number(seconds) || 0));
  if (s < 60) return `${s}秒`;
  const h = Math.floor(s / 3600);
  const m = Math.round((s % 3600) / 60);
  if (h === 0) return `${m}分钟`;
  return m === 0 ? `${h}小时` : `${h}小时${m}分钟`;
}

function toMillis(ts) {
  const n = Number(ts) || 0;
  if (!n) return 0;
  return n > 1e12 ? n : n * 1000;
}

function fmtDate(ts, withTime = false) {
  const ms = toMillis(ts);
  if (!ms) return '';
  const d = new Date(ms);
  const pad = (x) => String(x).padStart(2, '0');
  const date = `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
  return withTime ? `${date} ${pad(d.getHours())}:${pad(d.getMinutes())}` : date;
}

function csvCell(value) {
  const text = value === null || value === undefined ? '' : String(value);
  return '"' + text.replace(/"/g, '""').replace(/\r?\n/g, ' ') + '"';
}

/* ---------------------------------------------------------------- 归一化 */

function normalizeShelf(payload) {
  const books = Array.isArray(payload.books) ? payload.books : [];
  const albums = Array.isArray(payload.albums) ? payload.albums : [];
  const archive = Array.isArray(payload.archive) ? payload.archive : [];
  const hasMp = Boolean(payload.mp);
  const secretBooks = books.filter((b) => b.secret === 1).length;
  const secretAlbums = albums.filter((a) => a.albumInfoExtra && a.albumInfoExtra.secret === 1).length;
  return {
    books,
    albums,
    mp: payload.mp || null,
    archive,
    counts: {
      books: books.length,
      albums: albums.length,
      mp: hasMp ? 1 : 0,
      total: books.length + albums.length + (hasMp ? 1 : 0),
      publicCount: books.filter((b) => b.secret === 0).length + albums.filter((a) => !a.albumInfoExtra || a.albumInfoExtra.secret === 0).length,
      secretCount: secretBooks + secretAlbums + (hasMp ? 1 : 0),
      finished: books.filter((b) => b.finishReading === 1).length,
    },
  };
}

function normalizeNotebookBook(item) {
  const book = item.book || {};
  const reviewCount = Number(item.reviewCount || 0);
  const noteCount = Number(item.noteCount || 0);
  const bookmarkCount = Number(item.bookmarkCount || 0);
  return {
    bookId: item.bookId || book.bookId || '',
    title: book.title || '',
    author: book.author || '',
    cover: book.cover || '',
    reviewCount,
    noteCount,
    bookmarkCount,
    totalNotes: reviewCount + noteCount + bookmarkCount,
    readingProgress: item.readingProgress === undefined ? null : item.readingProgress,
    markedStatus: item.markedStatus === undefined ? null : item.markedStatus,
    sort: item.sort || 0,
  };
}

function normalizeMarks(payload) {
  const chapters = Array.isArray(payload.chapters) ? payload.chapters : [];
  const chapterMap = new Map();
  for (const c of chapters) chapterMap.set(c.chapterUid, c);
  const items = (Array.isArray(payload.updated) ? payload.updated : [])
    .filter((it) => it && it.markText)
    .map((it) => {
      const ch = chapterMap.get(it.chapterUid) || {};
      return {
        bookmarkId: it.bookmarkId || '',
        bookId: it.bookId || '',
        chapterUid: it.chapterUid,
        chapterIdx: ch.chapterIdx === undefined ? null : ch.chapterIdx,
        chapterTitle: ch.title || '',
        text: it.markText,
        createTime: it.createTime || it.createTimeMs || 0,
        date: fmtDate(it.createTime || it.createTimeMs),
        range: it.range || '',
        colorStyle: it.colorStyle === undefined ? null : it.colorStyle,
      };
    })
    .sort((a, b) => {
      const ai = a.chapterIdx === null ? 1e9 : a.chapterIdx;
      const bi = b.chapterIdx === null ? 1e9 : b.chapterIdx;
      if (ai !== bi) return ai - bi;
      return toMillis(b.createTime) - toMillis(a.createTime);
    });

  const groupMap = new Map();
  for (const item of items) {
    const key = String(item.chapterUid === undefined ? '' : item.chapterUid);
    if (!groupMap.has(key)) {
      groupMap.set(key, {
        chapterUid: item.chapterUid,
        chapterIdx: item.chapterIdx,
        title: item.chapterTitle || '未知章节',
        items: [],
      });
    }
    groupMap.get(key).items.push(item);
  }
  const groups = Array.from(groupMap.values()).sort((a, b) => {
    const ai = a.chapterIdx === null ? 1e9 : a.chapterIdx;
    const bi = b.chapterIdx === null ? 1e9 : b.chapterIdx;
    return ai - bi;
  });

  return {
    book: payload.book || null,
    chapters,
    count: items.length,
    items,
    groups,
    removedCount: Array.isArray(payload.removed) ? payload.removed.length : 0,
  };
}

function normalizeReview(raw) {
  const r = raw && raw.review ? raw.review : raw;
  if (!r) return null;
  return {
    reviewId: r.reviewId || '',
    content: r.content || '',
    abstract: r.abstract || '',
    range: r.range || '',
    chapterUid: r.chapterUid === undefined ? null : r.chapterUid,
    chapterIdx: r.chapterIdx === undefined ? null : r.chapterIdx,
    chapterName: r.chapterName || '',
    createTime: r.createTime || 0,
    date: fmtDate(r.createTime, true),
    star: r.star === undefined ? null : r.star,
    isFinish: r.isFinish === undefined ? null : r.isFinish,
    likesCount: r.likesCount === undefined ? null : r.likesCount,
    commentsCount: r.commentsCount === undefined ? (Array.isArray(r.comments) ? r.comments.length : null) : r.commentsCount,
    author: r.author ? { name: r.author.name || '', avatar: r.author.avatar || '' } : null,
  };
}

/* ---------------------------------------------------------------- 主体 */

function createApi({ client, store, config }) {
  const state = {
    upgradeInfo: null,
    upgradeAt: 0,
    sync: {
      running: false,
      total: 0,
      done: 0,
      current: '',
      startedAt: 0,
      finishedAt: 0,
      errors: [],
      lastMessage: '',
    },
  };

  function noteUpgrade(payload) {
    const info = pickUpgradeInfo(payload);
    if (info) {
      state.upgradeInfo = info;
      state.upgradeAt = Date.now();
    }
  }

  async function cached(key, ttl, loader, refresh) {
    if (!refresh) {
      const hit = store.fresh(key, ttl);
      if (hit !== null && hit !== undefined) {
        return { data: hit, cached: true, savedAt: store.savedAt(key), stale: false, warning: null };
      }
    }
    try {
      const data = await loader();
      noteUpgrade(data);
      store.put(key, data);
      return { data, cached: false, savedAt: Date.now(), stale: false, warning: null };
    } catch (err) {
      const stale = store.any(key);
      if (stale !== null && stale !== undefined) {
        return {
          data: stale,
          cached: true,
          savedAt: store.savedAt(key),
          stale: true,
          warning: `${err.message}（展示上次缓存数据）`,
        };
      }
      throw err;
    }
  }

  /* -------- 数据获取（路由与同步任务共用） -------- */

  async function getShelf(refresh) {
    const res = await cached('shelf', TTL.shelf, () => client.call('/shelf/sync', {}), refresh);
    return { ...res, data: normalizeShelf(res.data) };
  }

  async function fetchAllNotebooks() {
    const books = [];
    let lastSort = null;
    let guard = 0;
    let totalBookCount = 0;
    let totalNoteCount = 0;
    let hasMore = true;
    while (hasMore && guard < 50) {
      guard += 1;
      const params = { count: 100 };
      if (lastSort) params.lastSort = lastSort;
      const page = await client.call('/user/notebooks', params);
      noteUpgrade(page);
      if (page.totalBookCount !== undefined) totalBookCount = page.totalBookCount;
      if (page.totalNoteCount !== undefined) totalNoteCount = page.totalNoteCount;
      const list = Array.isArray(page.books) ? page.books : [];
      for (const item of list) books.push(normalizeNotebookBook(item));
      hasMore = page.hasMore === 1 || page.hasMore === true;
      const last = list[list.length - 1];
      if (!hasMore || !last || !last.sort) break;
      lastSort = last.sort;
    }
    books.sort((a, b) => b.totalNotes - a.totalNotes);
    const sums = books.reduce(
      (acc, b) => {
        acc.review += b.reviewCount;
        acc.note += b.noteCount;
        acc.bookmark += b.bookmarkCount;
        return acc;
      },
      { review: 0, note: 0, bookmark: 0 }
    );
    return {
      totalBookCount: totalBookCount || books.length,
      totalNoteCount: totalNoteCount || sums.review + sums.note + sums.bookmark,
      books,
      sums: {
        reviewCount: sums.review,
        noteCount: sums.note,
        bookmarkCount: sums.bookmark,
        all: sums.review + sums.note + sums.bookmark,
      },
    };
  }

  async function getNotebooks(refresh) {
    const res = await cached('notebooks', TTL.notebooks, fetchAllNotebooks, refresh);
    return res;
  }

  async function getMarks(bookId, refresh) {
    // 缓存归一化后的结果，保证缓存文件与 API / 跨书搜索口径一致
    return cached(
      `marks-${bookId}`,
      TTL.marks,
      async () => normalizeMarks(await client.call('/book/bookmarklist', { bookId })),
      refresh
    );
  }

  async function fetchAllReviewsMine(bookId) {
    const items = [];
    let synckey = 0;
    let guard = 0;
    let totalCount = 0;
    let hasMore = true;
    while (hasMore && guard < 40) {
      guard += 1;
      const page = await client.call('/review/list/mine', { bookid: bookId, count: 50, synckey });
      noteUpgrade(page);
      if (page.totalCount !== undefined) totalCount = page.totalCount;
      const list = Array.isArray(page.reviews) ? page.reviews : [];
      for (const raw of list) {
        const item = normalizeReview(raw);
        if (item) items.push(item);
      }
      hasMore = page.hasMore === 1 || page.hasMore === true;
      if (!hasMore) break;
      const next = page.synckey || 0;
      if (!next || next === synckey) break;
      synckey = next;
    }
    items.sort((a, b) => toMillis(b.createTime) - toMillis(a.createTime));
    return { totalCount: totalCount || items.length, count: items.length, items };
  }

  async function getReviewsMine(bookId, refresh) {
    return cached(`reviews-mine-${bookId}`, TTL.reviewsMine, () => fetchAllReviewsMine(bookId), refresh);
  }

  async function getBookInfo(bookId, refresh) {
    return cached(`bookinfo-${bookId}`, TTL.bookInfo, () => client.call('/book/info', { bookId }), refresh);
  }

  async function getChapters(bookId, refresh) {
    return cached(`chapters-${bookId}`, TTL.chapters, () => client.call('/book/chapterinfo', { bookId }), refresh);
  }

  async function getProgress(bookId, refresh) {
    return cached(`progress-${bookId}`, TTL.progress, () => client.call('/book/getprogress', { bookId }), refresh);
  }

  async function getBest(bookId, refresh) {
    return cached(
      `best-${bookId}`,
      TTL.best,
      () => client.call('/book/bestbookmarks', { bookId, chapterUid: 0, synckey: 0 }),
      refresh
    );
  }

  async function getSimilar(bookId, refresh) {
    return cached(
      `similar-${bookId}`,
      TTL.similar,
      () => client.call('/book/similar', { bookId, count: 12, maxIdx: 0 }),
      refresh
    );
  }

  async function getReaddata(mode, baseTime, refresh) {
    const params = { mode, baseTime: baseTime || 0 };
    const res = await cached(
      `readdata-${mode}-${baseTime || 0}`,
      TTL.readdata,
      () => client.call('/readdata/detail', params),
      refresh
    );
    if (res.data && typeof res.data === 'object') {
      const stamp = new Date().toISOString().slice(0, 10);
      store.putSnapshot(`readdata-${mode}-${stamp}`, {
        mode,
        baseTime: baseTime || 0,
        totalReadTime: res.data.totalReadTime || 0,
        readDays: res.data.readDays || 0,
        dayAverageReadTime: res.data.dayAverageReadTime || 0,
      });
    }
    return res;
  }

  /* -------- 全量同步任务 -------- */

  async function runSync({ force }) {
    const s = state.sync;
    if (s.running) return s;
    s.running = true;
    s.startedAt = Date.now();
    s.finishedAt = 0;
    s.done = 0;
    s.total = 0;
    s.current = '';
    s.errors = [];
    s.lastMessage = '';
    try {
      const notebooks = await getNotebooks(force);
      const books = (notebooks.data && notebooks.data.books) || [];
      s.total = books.length;
      for (const book of books) {
        s.current = book.title || book.bookId;
        try {
          await getMarks(book.bookId, force);
        } catch (err) {
          s.errors.push(`${book.title || book.bookId} 划线：${err.message}`);
        }
        try {
          await getReviewsMine(book.bookId, force);
        } catch (err) {
          s.errors.push(`${book.title || book.bookId} 想法：${err.message}`);
        }
        s.done += 1;
      }
      s.lastMessage = `已同步 ${s.done}/${s.total} 本书`;
    } catch (err) {
      s.errors.push(err.message);
      s.lastMessage = `同步中断：${err.message}`;
    } finally {
      s.running = false;
      s.finishedAt = Date.now();
      s.current = '';
    }
    return s;
  }

  /* -------- 导出 -------- */

  async function buildBookPayload(bookId, refresh) {
    const [info, marks, reviews] = await Promise.all([
      getBookInfo(bookId, refresh).catch(() => ({ data: null })),
      getMarks(bookId, refresh).catch(() => ({ data: null })),
      getReviewsMine(bookId, refresh).catch(() => ({ data: null })),
    ]);
    const notebook = store.any('notebooks');
    const nbBook = notebook && notebook.books ? notebook.books.find((b) => b.bookId === bookId) : null;
    return {
      bookId,
      title: (info.data && info.data.title) || (nbBook && nbBook.title) || bookId,
      author: (info.data && info.data.author) || (nbBook && nbBook.author) || '',
      info: info.data || null,
      notebook: nbBook || null,
      marks: marks.data || { items: [], groups: [], count: 0 },
      reviews: reviews.data || { items: [], count: 0 },
    };
  }

  function bookToMarkdown(payload) {
    const lines = [];
    lines.push(`# ${payload.title}`);
    if (payload.author) lines.push('');
    if (payload.author) lines.push(`作者：${payload.author}`);
    if (payload.notebook) {
      const nb = payload.notebook;
      lines.push('');
      lines.push(
        `笔记统计：想法/点评 ${nb.reviewCount} 条 · 划线 ${nb.noteCount} 条 · 书签 ${nb.bookmarkCount} 条（合计 ${nb.totalNotes} 条）`
      );
    }
    lines.push('');
    lines.push(`## 划线（${payload.marks.count || 0} 条）`);
    for (const group of payload.marks.groups || []) {
      lines.push('');
      lines.push(`### ${group.title}`);
      for (const item of group.items) {
        lines.push('');
        lines.push(`> ${item.text.replace(/\n/g, ' ')}`);
        lines.push(`— ${item.date || '时间未知'}`);
      }
    }
    lines.push('');
    lines.push(`## 想法与点评（${payload.reviews.count || 0} 条）`);
    for (const r of payload.reviews.items || []) {
      lines.push('');
      if (r.abstract) lines.push(`> ${r.abstract.replace(/\n/g, ' ')}`);
      lines.push(`- ${r.content.replace(/\n/g, ' ')}`);
      const meta = [r.date, r.chapterName, r.star && r.star > 0 ? `${r.star / 20}星` : ''].filter(Boolean).join(' · ');
      lines.push(`  ${meta}`);
    }
    lines.push('');
    return lines.join('\n');
  }

  function csvHeader() {
    return ['类型', '书名', '作者', '章节', '内容', '时间', '评分', '点赞数'].join(',') + '\r\n';
  }

  function marksToCsvRows(payload) {
    let out = '';
    for (const item of payload.marks.items || []) {
      out +=
        [
          csvCell('划线'),
          csvCell(payload.title),
          csvCell(payload.author),
          csvCell(item.chapterTitle),
          csvCell(item.text),
          csvCell(item.date),
          csvCell(''),
          csvCell(''),
        ].join(',') + '\r\n';
    }
    for (const r of payload.reviews.items || []) {
      out +=
        [
          csvCell('想法/点评'),
          csvCell(payload.title),
          csvCell(payload.author),
          csvCell(r.chapterName),
          csvCell(r.abstract ? `${r.abstract} ｜ ${r.content}` : r.content),
          csvCell(r.date),
          csvCell(r.star && r.star > 0 ? r.star / 20 : ''),
          csvCell(r.likesCount === null ? '' : r.likesCount),
        ].join(',') + '\r\n';
    }
    return out;
  }

  async function exportNotes({ bookId, all, format, refresh }) {
    const list = [];
    if (all) {
      const notebooks = await getNotebooks(bool(refresh));
      for (const book of (notebooks.data && notebooks.data.books) || []) {
        list.push(book);
      }
    } else if (bookId) {
      list.push({ bookId });
    }
    const payloads = [];
    for (const book of list) {
      const payload = await buildBookPayload(book.bookId, bool(refresh));
      payload.title = payload.title || book.title || book.bookId;
      payload.author = payload.author || book.author || '';
      payloads.push(payload);
    }

    if (format === 'csv') {
      let content = csvHeader();
      for (const payload of payloads) content += marksToCsvRows(payload);
      return content;
    }
    const stamp = new Date().toISOString().slice(0, 10);
    const header = `# 微信读书笔记导出\n\n导出时间：${stamp}\n书籍数：${payloads.length}\n\n---\n\n`;
    return header + payloads.map(bookToMarkdown).join('\n---\n\n');
  }

  /* -------- 跨书搜索（仅在已同步缓存内检索） -------- */

  function searchCachedNotes(keyword, limit) {
    const q = String(keyword || '').toLowerCase();
    if (!q) return { keyword: '', markHits: [], reviewHits: [], scannedBooks: 0, hits: 0 };
    const notebook = store.any('notebooks');
    const titleMap = new Map();
    for (const b of (notebook && notebook.books) || []) titleMap.set(b.bookId, b);

    const markHits = [];
    const reviewHits = [];
    let scannedBooks = 0;

    for (const entry of store.entriesByPrefix('marks-')) {
      scannedBooks += 1;
      const raw = entry.data || {};
      const data = Array.isArray(raw.items) ? raw : normalizeMarks(raw);
      const bookId = (data.book && data.book.bookId) || entry.key.replace(/^marks-/, '');
      const nb = titleMap.get(bookId);
      const title = (data.book && data.book.title) || (nb && nb.title) || bookId;
      const author = (data.book && data.book.author) || (nb && nb.author) || '';
      for (const item of data.items || []) {
        if (String(item.text || '').toLowerCase().includes(q)) {
          markHits.push({ bookId, title, author, chapterTitle: item.chapterTitle, text: item.text, date: item.date });
          if (markHits.length >= limit) break;
        }
      }
    }
    for (const entry of store.entriesByPrefix('reviews-mine-')) {
      const data = entry.data || {};
      const bookId = entry.key.replace(/^reviews-mine-/, '');
      const nb = titleMap.get(bookId);
      const title = (nb && nb.title) || bookId;
      const author = (nb && nb.author) || '';
      for (const item of data.items || []) {
        const haystack = `${item.content || ''} ${item.abstract || ''}`.toLowerCase();
        if (haystack.includes(q)) {
          reviewHits.push({
            bookId,
            title,
            author,
            chapterName: item.chapterName,
            content: item.content,
            abstract: item.abstract,
            date: item.date,
          });
          if (reviewHits.length >= limit) break;
        }
      }
    }
    return {
      keyword,
      scannedBooks,
      markHits,
      reviewHits,
      hits: markHits.length + reviewHits.length,
    };
  }

  /* -------- 路由 -------- */

  function ok(payload, extra = {}) {
    return {
      type: 'json',
      status: 200,
      payload: {
        ok: true,
        data: payload.data,
        cached: Boolean(payload.cached),
        stale: Boolean(payload.stale),
        savedAt: payload.savedAt || 0,
        warning: payload.warning || null,
        upgradeInfo: state.upgradeInfo,
        ...extra,
      },
    };
  }

  function fail(message, code = 'ERROR', status = 200) {
    return { type: 'json', status, payload: { ok: false, error: { code, message } } };
  }
  /** 直接以 data 为载荷构造成功响应（用于非缓存形态的返回） */
  function okData(data, extra = {}) {
    return {
      type: 'json',
      status: 200,
      payload: {
        ok: true,
        data: data === undefined ? null : data,
        cached: false,
        stale: false,
        savedAt: 0,
        warning: null,
        upgradeInfo: state.upgradeInfo,
        ...extra,
      },
    };
  }


  const bool = (v) => v === true || v === '1' || v === 'true';

  async function route(req, url) {
    const seg = url.pathname.split('/').filter(Boolean);
    if (seg[0] !== 'api') return { type: 'none', status: 404 };
    const p = seg.slice(1);
    const q = url.searchParams;
    const refresh = q.get('refresh') === '1';
    const method = (req.method || 'GET').toUpperCase();
    const head = p.join('/');

    try {
      if (head === 'health') {
        return {
          type: 'json',
          status: 200,
          payload: {
            ok: true,
            keyLoaded: client.configured,
            keyLooksValid: client.keyLooksValid(),
            skillVersion: client.skillVersion,
            envFile: config.envFile,
            envFileExists: config.envFileExists,
            host: config.host,
            port: config.port,
            upstream: client.stats,
            upgradeInfo: state.upgradeInfo,
            sync: state.sync,
            cacheKeys: store.keys().length,
            time: Date.now(),
          },
        };
      }

      if (head === 'shelf') return ok(await getShelf(refresh));
      if (head === 'notebooks') return ok(await getNotebooks(refresh));

      if (head === 'readdata') {
        const mode = q.get('mode') || 'monthly';
        if (!['weekly', 'monthly', 'annually', 'overall'].includes(mode)) {
          return fail(`不支持的 mode：${mode}`, 'BAD_PARAM');
        }
        const baseTime = Number(q.get('baseTime') || 0) || 0;
        return ok(await getReaddata(mode, baseTime, refresh));
      }

      if (head === 'recommend') {
        const count = Number(q.get('count') || 12);
        const maxIdx = Number(q.get('maxIdx') || 0);
        return ok(
          await cached(
            `recommend-${count}-${maxIdx}`,
            TTL.recommend,
            () => client.call('/book/recommend', { count, maxIdx }),
            refresh
          )
        );
      }

      if (head === 'discover') {
        const count = Number(q.get('count') || 20);
        const maxIdx = Number(q.get('maxIdx') || 0);
        return ok(
          await cached(
            `discover-${count}-${maxIdx}`,
            TTL.discover,
            () => client.call('/discover/interact/type3', { count, maxIdx, synckey: 0 }),
            refresh
          )
        );
      }

      if (head === 'search') {
        const keyword = (q.get('keyword') || '').trim();
        if (!keyword) return fail('缺少 keyword', 'BAD_PARAM');
        const scope = Number(q.get('scope') || 0);
        const maxIdx = Number(q.get('maxIdx') || 0);
        const count = Number(q.get('count') || 15);
        return okData({ keyword, scope, maxIdx, ...(await client.call('/store/search', { keyword, scope, maxIdx, count })) });
      }

      if (head === 'notes/search') {
        const keyword = (q.get('keyword') || '').trim();
        const limit = Math.min(Number(q.get('limit') || 200), 1000);
        return okData(searchCachedNotes(keyword, limit));
      }

      if (head === 'snapshots') {
        const list = store
          .listSnapshots('readdata-')
          .filter((s) => s.data && s.data.mode === (q.get('mode') || 'overall'));
        return okData({ count: list.length, items: list.map((s) => ({ name: s.name, savedAt: s.savedAt, ...s.data })) });
      }

      if (head === 'sync/status') return okData(state.sync);
      if (head === 'sync' && method === 'POST') {
        if (state.sync.running) return okData(state.sync, { note: '同步已在进行中' });
        runSync({ force: true }); // 后台执行，不阻塞响应
        return okData(state.sync, { note: '已开始同步' });
      }

      if (head === 'cache/clear' && method === 'POST') {
        const removed = store.clear();
        return okData({ removed });
      }

      // /api/export/notes.md|notes.csv
      if (p[0] === 'export') {
        const format = p[1] === 'notes.csv' ? 'csv' : 'md';
        const bookId = q.get('bookId') || '';
        const all = bool(q.get('all'));
        if (!bookId && !all) return fail('需要 bookId 或 all=1', 'BAD_PARAM');
        const content = await exportNotes({ bookId, all, format, refresh });
        const stamp = new Date().toISOString().slice(0, 10);
        const base = all ? `weread-notes-all-${stamp}` : `weread-notes-${bookId}-${stamp}`;
        return {
          type: 'download',
          status: 200,
          filename: format === 'csv' ? base + '.csv' : base + '.md',
          contentType:
            format === 'csv'
              ? 'text/csv; charset=utf-8'
              : 'text/markdown; charset=utf-8',
          content: format === 'csv' ? '\ufeff' + content : content, // BOM 让 Excel 正确识别 UTF-8
        };
      }

      // /api/book/:bookId[/sub]
      if (p[0] === 'book' && p[1]) {
        const bookId = decodeURIComponent(p[1]);
        const sub = p[2] || '';
        if (!sub) {
          const [info, chapters, progress] = await Promise.all([
            getBookInfo(bookId, refresh),
            getChapters(bookId, refresh),
            getProgress(bookId, refresh),
          ]);
          return okData(
            { bookId, info: info.data, chapters: chapters.data, progress: progress.data },
            {
              cached: info.cached && chapters.cached && progress.cached,
              savedAt: Math.min(info.savedAt, chapters.savedAt, progress.savedAt),
            }
          );
        }
        if (sub === 'marks') return ok(await getMarks(bookId, refresh));
        if (sub === 'reviews') return ok(await getReviewsMine(bookId, refresh));
        if (sub === 'best') return ok(await getBest(bookId, refresh));
        if (sub === 'similar') return ok(await getSimilar(bookId, refresh));
        if (sub === 'chapters') return ok(await getChapters(bookId, refresh));
        if (sub === 'progress') return ok(await getProgress(bookId, refresh));
        if (sub === 'reviews-public') {
          const count = Number(q.get('count') || 20);
          const maxIdx = Number(q.get('maxIdx') || 0);
          const type = Number(q.get('type') || 0);
          return ok(
            await cached(
              `reviewlist-${bookId}-${type}-${maxIdx}`,
              TTL.reviewList,
              () => client.call('/review/list', { bookId, reviewListType: type, count, maxIdx, synckey: 0 }),
              refresh
            )
          );
        }
        return { type: 'none', status: 404 };
      }

      return { type: 'none', status: 404 };
    } catch (err) {
      return fail(err && err.message ? err.message : '未知错误', (err && err.code) || 'ERROR');
    }
  }

  return { route, state, runSync, searchCachedNotes, getShelf, getNotebooks };
}

module.exports = { createApi, TTL, fmtDuration, fmtDate };
