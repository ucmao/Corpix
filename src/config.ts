import { fail } from './errors.js';
export interface Config {
  host: string; port: number; apiKey: string; rateLimit: number; timeoutMs: number;
  tycCookie: string; aqcCookie: string; qccCookie: string;
}
function integer(name: string, value: string | undefined, fallback: number, min: number, max: number): number {
  const n = value === undefined || value === '' ? fallback : Number(value);
  if (!Number.isInteger(n) || n < min || n > max) fail('NOT_CONFIGURED', `环境变量 ${name} 必须是 ${min}–${max} 之间的整数`, 500);
  return n;
}
export function loadConfig(env: NodeJS.ProcessEnv = process.env): Config {
  const host = env.HOST || '127.0.0.1';
  const apiKey = env.API_KEY?.trim() || '';
  if (!['127.0.0.1', 'localhost', '::1'].includes(host) && !apiKey) {
    fail('NOT_CONFIGURED', '监听外部地址时必须设置 API_KEY', 500);
  }
  return { host, apiKey, port: integer('PORT', env.PORT, 3010, 1, 65535),
    rateLimit: integer('RATE_LIMIT_PER_MINUTE', env.RATE_LIMIT_PER_MINUTE, 30, 1, 10000),
    timeoutMs: integer('UPSTREAM_TIMEOUT_MS', env.UPSTREAM_TIMEOUT_MS, 20000, 100, 120000),
    tycCookie: env.TYC_COOKIE || '', aqcCookie: env.AQC_COOKIE || '', qccCookie: env.QCC_COOKIE || '' };
}
