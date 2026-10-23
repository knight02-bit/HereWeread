'use strict';

/**
 * 文件缓存 + 每日快照。
 * 所有数据落在 data/ 下（已 gitignore），可用 /api/cache/clear 清空。
 */
const fs = require('fs');
const path = require('path');

function safeName(key) {
  return String(key).replace(/[^A-Za-z0-9._-]/g, '_').slice(0, 120);
}

class FileStore {
  constructor(baseDir) {
    this.baseDir = baseDir;
    this.cacheDir = path.join(baseDir, 'cache');
    this.snapDir = path.join(baseDir, 'snapshots');
    this._ensure(this.cacheDir);
    this._ensure(this.snapDir);
  }

  _ensure(dir) {
    try {
      fs.mkdirSync(dir, { recursive: true });
    } catch (err) {
      /* 已有的并发创建忽略 */
    }
  }

  _file(key) {
    return path.join(this.cacheDir, safeName(key) + '.json');
  }

  /** @returns {{savedAt:number, data:any}|null} */
  entry(key) {
    try {
      const raw = fs.readFileSync(this._file(key), 'utf8');
      const parsed = JSON.parse(raw);
      if (parsed && typeof parsed === 'object' && 'data' in parsed) return parsed;
      return null;
    } catch (err) {
      return null;
    }
  }

  /** 命中且未过期才返回 data */
  fresh(key, ttlMs) {
    const hit = this.entry(key);
    if (!hit) return null;
    if (ttlMs >= 0 && Date.now() - Number(hit.savedAt || 0) > ttlMs) return null;
    return hit.data;
  }

  /** 不看 TTL，返回最新一次数据（降级展示用） */
  any(key) {
    const hit = this.entry(key);
    return hit ? hit.data : null;
  }

  savedAt(key) {
    const hit = this.entry(key);
    return hit ? Number(hit.savedAt || 0) : 0;
  }

  put(key, data) {
    const file = this._file(key);
    const tmp = file + '.tmp';
    const payload = JSON.stringify({ savedAt: Date.now(), data });
    fs.writeFileSync(tmp, payload, 'utf8');
    fs.renameSync(tmp, file);
    return data;
  }

  keys() {
    try {
      return fs
        .readdirSync(this.cacheDir)
        .filter((f) => f.endsWith('.json'))
        .map((f) => f.slice(0, -5));
    } catch (err) {
      return [];
    }
  }

  /** 按前缀收集全部缓存条目（用于跨书搜索/导出） */
  entriesByPrefix(prefix) {
    const out = [];
    for (const key of this.keys()) {
      if (!key.startsWith(prefix)) continue;
      const hit = this.entry(key);
      if (hit) out.push({ key, savedAt: Number(hit.savedAt || 0), data: hit.data });
    }
    return out;
  }

  clear() {
    let removed = 0;
    try {
      for (const f of fs.readdirSync(this.cacheDir)) {
        if (!f.endsWith('.json') && !f.endsWith('.tmp')) continue;
        fs.unlinkSync(path.join(this.cacheDir, f));
        removed += 1;
      }
    } catch (err) {
      /* ignore */
    }
    return removed;
  }

  /* ---------- 快照（长期趋势） ---------- */

  putSnapshot(name, data) {
    const file = path.join(this.snapDir, safeName(name) + '.json');
    fs.writeFileSync(file, JSON.stringify({ savedAt: Date.now(), data }), 'utf8');
    return file;
  }

  listSnapshots(prefix = '') {
    try {
      return fs
        .readdirSync(this.snapDir)
        .filter((f) => f.endsWith('.json') && f.startsWith(prefix))
        .map((f) => {
          const full = path.join(this.snapDir, f);
          let savedAt = 0;
          let data = null;
          try {
            const parsed = JSON.parse(fs.readFileSync(full, 'utf8'));
            savedAt = Number(parsed.savedAt || 0);
            data = parsed.data;
          } catch (err) {
            /* ignore */
          }
          return { name: f.slice(0, -5), savedAt, data };
        })
        .sort((a, b) => a.savedAt - b.savedAt);
    } catch (err) {
      return [];
    }
  }
}

module.exports = { FileStore };
