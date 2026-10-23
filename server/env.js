'use strict';

/**
 * 极简 .env 解析：不引入 dotenv，避免任何第三方依赖。
 * 真实环境变量优先于 .env 中的值（方便临时覆盖或 CI 使用）。
 */
const fs = require('fs');
const path = require('path');

function parseEnvText(text) {
  const out = {};
  for (const rawLine of String(text).split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith('#')) continue;
    const eq = line.indexOf('=');
    if (eq === -1) continue;
    const key = line.slice(0, eq).trim();
    let value = line.slice(eq + 1).trim();
    if (
      (value.startsWith('"') && value.endsWith('"') && value.length > 1) ||
      (value.startsWith("'") && value.endsWith("'") && value.length > 1)
    ) {
      value = value.slice(1, -1);
    }
    if (key) out[key] = value;
  }
  return out;
}

function loadEnv(rootDir) {
  const file = path.join(rootDir, '.env');
  let parsed = {};
  let exists = false;
  try {
    if (fs.existsSync(file)) {
      parsed = parseEnvText(fs.readFileSync(file, 'utf8'));
      exists = true;
    }
  } catch (err) {
    return { file, exists: false, parsed: {}, error: err.message };
  }
  for (const [key, value] of Object.entries(parsed)) {
    if (process.env[key] === undefined || process.env[key] === '') {
      process.env[key] = value;
    }
  }
  return { file, exists, parsed, error: null };
}

module.exports = { loadEnv, parseEnvText };
