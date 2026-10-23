'use strict';

/**
 * 可选：手动/计划任务触发的统计快照。
 * 用法：node server\snapshot.js
 * 作用：把 overall / monthly / annually 三个口径的阅读统计写入 data/snapshots/，
 *       便于在「阅读统计」页对比长期变化（与页面自动写快照的格式一致）。
 */
const path = require('path');

const { loadEnv } = require('./env');
const { WereadClient } = require('./weread');
const { FileStore } = require('./cache');

const ROOT = path.resolve(__dirname, '..');
loadEnv(ROOT);

const client = new WereadClient({ apiKey: process.env.WEREAD_API_KEY || '' });
const store = new FileStore(path.join(ROOT, 'data'));

const MODES = ['overall', 'monthly', 'annually'];

(async () => {
  if (!client.configured) {
    console.error('[快照] 未配置 WEREAD_API_KEY，请在项目根目录 .env 中填写后重试。');
    process.exit(1);
  }
  const stamp = new Date().toISOString().slice(0, 10);
  let failed = 0;

  for (const mode of MODES) {
    try {
      const data = await client.call('/readdata/detail', { mode, baseTime: 0 });
      const summary = {
        mode,
        baseTime: 0,
        totalReadTime: data.totalReadTime || 0,
        readDays: data.readDays || 0,
        dayAverageReadTime: data.dayAverageReadTime || 0,
      };
      store.putSnapshot(`readdata-${mode}-${stamp}`, summary);
      store.put(`readdata-${mode}-0`, data);
      const hours = Math.round(((summary.totalReadTime / 3600) * 10)) / 10;
      console.log(`[快照] ${mode.padEnd(8)} 已保存：${hours} 小时 / ${summary.readDays} 天有效阅读`);
    } catch (err) {
      failed += 1;
      console.error(`[快照] ${mode} 失败：${err.message}`);
    }
  }

  console.log(`[快照] 完成，快照目录：${store.snapDir}`);
  process.exit(failed === MODES.length ? 1 : 0);
})();
