'use strict';

/**
 * 微信读书 Agent API Gateway 客户端。
 * 职责：白名单校验、串行限流、超时重试、错误中文化、upgrade_info 透传。
 * 注意：Key 只在本模块内使用，永不写入响应。
 */

const GATEWAY = 'https://i.weread.qq.com/api/agent/gateway';
const SKILL_VERSION = '1.0.5';

/** 网关全部 17 个接口（均为只读）；不在白名单内的 api_name 一律拒绝转发 */
const API_WHITELIST = new Set([
  '/shelf/sync',
  '/user/notebooks',
  '/book/info',
  '/book/chapterinfo',
  '/book/getprogress',
  '/book/bookmarklist',
  '/book/bestbookmarks',
  '/book/underlines',
  '/book/readreviews',
  '/review/list',
  '/review/list/mine',
  '/review/single',
  '/book/similar',
  '/book/recommend',
  '/discover/interact/type3',
  '/store/search',
  '/readdata/detail',
]);

class WereadError extends Error {
  constructor(message, code = 'WEREAD_ERROR', detail = null) {
    super(message);
    this.name = 'WereadError';
    this.code = code;
    this.detail = detail;
  }
}

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

class WereadClient {
  constructor(options = {}) {
    this.apiKey = options.apiKey || '';
    this.concurrency = options.concurrency || 3;
    this.gapMs = options.gapMs === undefined ? 120 : options.gapMs;
    this.timeoutMs = options.timeoutMs || 20000;
    this.retries = options.retries === undefined ? 2 : options.retries;
    this.skillVersion = SKILL_VERSION;
    this._active = 0;
    this._queue = [];
    this._nextStart = 0;
    this.stats = { calls: 0, errors: 0, retries: 0, lastError: null, lastErrorAt: 0 };
  }

  get configured() {
    return Boolean(this.apiKey);
  }

  /** 仅做格式校验，不发起请求 */
  keyLooksValid() {
    return /^wrk-[A-Za-z0-9_-]{8,}$/.test(this.apiKey);
  }

  isAllowed(apiName) {
    return API_WHITELIST.has(apiName);
  }

  call(apiName, params = {}) {
    if (!this.apiKey) {
      return Promise.reject(
        new WereadError('未配置 WEREAD_API_KEY：请在项目根目录 .env 中填写后重启服务', 'NO_KEY')
      );
    }
    if (!this.isAllowed(apiName)) {
      return Promise.reject(new WereadError(`不支持的接口：${apiName}`, 'NOT_ALLOWED'));
    }
    return this._enqueue(() => this._request(apiName, params));
  }

  _enqueue(task) {
    return new Promise((resolve, reject) => {
      this._queue.push({ task, resolve, reject });
      this._pump();
    });
  }

  _pump() {
    while (this._active < this.concurrency && this._queue.length > 0) {
      const job = this._queue.shift();
      this._active += 1;
      const now = Date.now();
      const wait = Math.max(0, this._nextStart - now);
      this._nextStart = Math.max(now, this._nextStart) + this.gapMs;
      setTimeout(() => {
        job
          .task()
          .then(job.resolve, job.reject)
          .finally(() => {
            this._active -= 1;
            this._pump();
          });
      }, wait);
    }
  }

  async _request(apiName, params) {
    const payload = { api_name: apiName, skill_version: SKILL_VERSION, ...params };
    let lastError = null;

    for (let attempt = 0; attempt <= this.retries; attempt += 1) {
      if (attempt > 0) {
        this.stats.retries += 1;
        await sleep(300 * Math.pow(2, attempt - 1));
      }
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), this.timeoutMs);
      try {
        this.stats.calls += 1;
        const res = await fetch(GATEWAY, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json; charset=utf-8',
            Authorization: `Bearer ${this.apiKey}`,
          },
          body: JSON.stringify(payload),
          signal: controller.signal,
        });
        clearTimeout(timer);
        const text = await res.text();
        let json = null;
        try {
          json = text ? JSON.parse(text) : null;
        } catch (err) {
          json = null;
        }

        if (!res.ok) {
          const retriable = res.status >= 500 || res.status === 429;
          lastError = this._httpError(res.status, json);
          if (retriable && attempt < this.retries) continue;
          break;
        }
        if (!json || typeof json !== 'object') {
          lastError = new WereadError('网关返回内容无法解析', 'BAD_RESPONSE', text.slice(0, 200));
          if (attempt < this.retries) continue;
          break;
        }
        if (json.errcode && json.errcode !== 0) {
          lastError = new WereadError(
            `接口返回错误 errcode=${json.errcode}${json.errmsg ? '：' + json.errmsg : ''}`,
            'UPSTREAM_ERROR',
            json
          );
          break;
        }
        return json;
      } catch (err) {
        clearTimeout(timer);
        if (err && err.name === 'AbortError') {
          lastError = new WereadError('请求超时，请检查网络后重试', 'TIMEOUT');
        } else {
          lastError = new WereadError(`网络请求失败：${err && err.message ? err.message : err}`, 'NETWORK');
        }
        if (attempt < this.retries) continue;
        break;
      }
    }

    this.stats.errors += 1;
    this.stats.lastError = lastError ? lastError.message : null;
    this.stats.lastErrorAt = Date.now();
    throw lastError || new WereadError('未知错误', 'UNKNOWN');
  }

  _httpError(status, json) {
    if (status === 401 || status === 403) {
      return new WereadError('API Key 无效或已失效，请重新获取后更新 .env', 'UNAUTHORIZED', { status });
    }
    if (status === 429) {
      return new WereadError('请求过于频繁，已触发限流，请稍后再试', 'RATE_LIMITED', { status });
    }
    const extra = json && json.errmsg ? `：${json.errmsg}` : '';
    return new WereadError(`网关返回 HTTP ${status}${extra}`, 'HTTP_ERROR', { status });
  }
}

/** 回包若带 upgrade_info，说明技能版本需要升级 */
function pickUpgradeInfo(payload) {
  if (payload && payload.upgrade_info) return payload.upgrade_info;
  return null;
}

module.exports = { WereadClient, WereadError, API_WHITELIST, SKILL_VERSION, GATEWAY, pickUpgradeInfo };
