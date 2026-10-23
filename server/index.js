'use strict';

/**
 * 本地服务：静态文件 + /api 路由。
 * 只绑定 127.0.0.1，Key 仅存在于服务端进程内，绝不写入任何响应。
 */
const http = require('http');
const fs = require('fs');
const path = require('path');

const { loadEnv } = require('./env');
const { WereadClient } = require('./weread');
const { FileStore } = require('./cache');
const { createApi } = require('./routes');

const ROOT = path.resolve(__dirname, '..');
const PUBLIC_DIR = path.join(ROOT, 'public');
const DATA_DIR = path.join(ROOT, 'data');

const envInfo = loadEnv(ROOT);

const config = {
  host: process.env.HOST || '127.0.0.1',
  port: Number(process.env.PORT || 5177),
  syncOnStart: (process.env.SYNC_ON_START || '1') !== '0',
  envFile: envInfo.file,
  envFileExists: envInfo.exists,
};

const client = new WereadClient({ apiKey: process.env.WEREAD_API_KEY || '' });
const store = new FileStore(DATA_DIR);
const api = createApi({ client, store, config });

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.webp': 'image/webp',
  '.ico': 'image/x-icon',
  '.woff2': 'font/woff2',
  '.txt': 'text/plain; charset=utf-8',
};

function setCommonHeaders(res, contentType) {
  res.setHeader('Content-Type', contentType);
  // 仅本机服务：放开 CORS 以便 file:// 预览或多端口调试
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  res.setHeader('Access-Control-Allow-Methods', 'GET,POST,OPTIONS');
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('Referrer-Policy', 'no-referrer');
}

function sendJson(res, status, payload) {
  setCommonHeaders(res, 'application/json; charset=utf-8');
  res.writeHead(status);
  res.end(JSON.stringify(payload));
}

function sendDownload(res, result) {
  setCommonHeaders(res, result.contentType);
  res.setHeader(
    'Content-Disposition',
    `attachment; filename="${result.filename}"; filename*=UTF-8''${encodeURIComponent(result.filename)}`
  );
  res.writeHead(result.status || 200);
  res.end(result.content);
}

function serveStatic(req, res, url) {
  let rel = decodeURIComponent(url.pathname);
  if (rel === '/' || rel === '') rel = '/index.html';
  const target = path.join(PUBLIC_DIR, rel);
  if (!target.startsWith(PUBLIC_DIR)) {
    setCommonHeaders(res, 'text/plain; charset=utf-8');
    res.writeHead(403);
    res.end('Forbidden');
    return;
  }
  fs.stat(target, (err, stat) => {
    if (err || !stat.isFile()) {
      setCommonHeaders(res, 'text/plain; charset=utf-8');
      res.writeHead(404);
      res.end('Not Found');
      return;
    }
    const ext = path.extname(target).toLowerCase();
    setCommonHeaders(res, MIME[ext] || 'application/octet-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.writeHead(200);
    fs.createReadStream(target).pipe(res);
  });
}

const server = http.createServer(async (req, res) => {
  let url;
  try {
    url = new URL(req.url, `http://${req.headers.host || '127.0.0.1'}`);
  } catch (err) {
    sendJson(res, 400, { ok: false, error: { code: 'BAD_URL', message: '非法请求地址' } });
    return;
  }

  if (req.method === 'OPTIONS') {
    setCommonHeaders(res, 'text/plain');
    res.writeHead(204);
    res.end();
    return;
  }

  if (url.pathname.startsWith('/api/')) {
    try {
      const result = await api.route(req, url);
      if (result.type === 'json') return sendJson(res, result.status || 200, result.payload);
      if (result.type === 'download') return sendDownload(res, result);
      return sendJson(res, 404, { ok: false, error: { code: 'NOT_FOUND', message: '未找到该接口' } });
    } catch (err) {
      return sendJson(res, 500, {
        ok: false,
        error: { code: 'INTERNAL', message: err && err.message ? err.message : '服务内部错误' },
      });
    }
  }

  return serveStatic(req, res, url);
});

server.listen(config.port, config.host, () => {
  const url = `http://${config.host}:${config.port}/`;
  console.log('──────────────────────────────────────────────');
  console.log('  微信读书个人数据看板');
  console.log(`  地址：${url}`);
  console.log(`  配置：${config.envFileExists ? config.envFile : '（未找到 .env，使用系统环境变量）'}`);
  console.log(`  API Key：${client.configured ? '已加载' : '未配置'}`);
  console.log(`  数据目录：${DATA_DIR}`);
  console.log('──────────────────────────────────────────────');

  if (!client.configured) {
    console.warn('[提示] 未检测到 WEREAD_API_KEY，页面会显示配置引导；填入 .env 后重启即可。');
    return;
  }
  if (!client.keyLooksValid()) {
    console.warn('[提示] WEREAD_API_KEY 格式不像是 wrk- 开头的有效 Key，请确认。');
  }
  if (config.syncOnStart) {
    setTimeout(() => {
      console.log('[同步] 后台静默同步书架 / 统计 / 笔记本…');
      api
        .getShelf(false)
        .catch((err) => console.warn('[同步] 书架失败：' + err.message));
      api
        .getNotebooks(false)
        .then((res) => console.log(`[同步] 笔记本完成，共 ${(res.data && res.data.books.length) || 0} 本有笔记的书`))
        .catch((err) => console.warn('[同步] 笔记本失败：' + err.message));
    }, 400);
  }
});

process.on('SIGINT', () => {
  console.log('\n服务已停止。');
  process.exit(0);
});
