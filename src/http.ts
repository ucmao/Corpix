import { CorpixError, fail } from './errors.js';
import { object } from './types.js';
export type Fetch = typeof globalThis.fetch;
export const MAX_BODY_BYTES = 4 * 1024 * 1024;
export async function readBody(response: Response): Promise<string> {
  if (!response.body) return '';
  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let size = 0;
  try {
    while (true) {
      const part = await reader.read();
      if (part.done) break;
      size += part.value.byteLength;
      if (size > MAX_BODY_BYTES) fail('PARSE_ERROR', '上游响应超过大小限制');
      chunks.push(part.value);
    }
  } finally { await reader.cancel().catch(() => {}); }
  return Buffer.concat(chunks).toString('utf8');
}
export function parseJson(body: string): unknown {
  try { return JSON.parse(body); } catch {
    if (/captcha|验证|<html|<!doctype/i.test(body)) fail('UPSTREAM_BLOCKED', '上游要求浏览器验证');
    fail('PARSE_ERROR', '上游返回了无效 JSON');
  }
}
export function checkHttp(status: number): void {
  if (status === 401) fail('AUTH_REQUIRED', '上游登录状态失效', 409);
  if (status === 403) fail('ACCESS_DENIED', '上游拒绝访问', 403);
  if (status === 429) fail('RATE_LIMITED', '上游请求过于频繁', 429);
  if ([301, 302, 303, 307, 308, 405, 412, 418, 521].includes(status)) fail('UPSTREAM_BLOCKED', '上游重定向或触发风控');
  if (status < 200 || status >= 300) fail('UPSTREAM_ERROR', '上游 HTTP 请求失败');
}
export function businessError(value: unknown): never {
  const p = object(value);
  const message = String(p.message ?? p.Message ?? p.msg ?? p.special ?? '');
  if (/登录|login|mustlogin/i.test(message) || p.special === 'mustlogin' || [209,409].includes(Number(p.status ?? p.Status))) {
    fail('AUTH_REQUIRED', '此查询需要有效的上游登录状态', 409);
  }
  if (/会员|权限|付费|vip/i.test(message)) fail('ACCESS_DENIED', '当前上游账号无此查询权限', 403);
  if (/频繁|限流/i.test(message)) fail('RATE_LIMITED', '上游请求过于频繁', 429);
  if (/验证|风控|captcha/i.test(message)) fail('UPSTREAM_BLOCKED', '上游要求浏览器验证');
  fail('UPSTREAM_ERROR', '上游返回业务错误');
}
export class HttpClient {
  constructor(private timeoutMs = 20000, private fetcher: Fetch = globalThis.fetch) {}
  async request(url: string, init: RequestInit = {}): Promise<{ status: number; headers: Headers; body: string }> {
    try {
      const headers = new Headers({ accept: 'application/json, text/plain, */*',
        'user-agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/156.0.0.0 Safari/537.36' });
      new Headers(init.headers).forEach((value, key) => headers.set(key, value));
      const response = await this.fetcher(url, { ...init, headers, redirect: 'manual', signal: AbortSignal.timeout(this.timeoutMs) });
      return { status: response.status, headers: response.headers, body: await readBody(response) };
    } catch (error) {
      if (error instanceof CorpixError) throw error;
      if (error instanceof Error && ['AbortError','TimeoutError'].includes(error.name)) fail('UPSTREAM_TIMEOUT', '上游请求超时', 504);
      fail('UPSTREAM_ERROR', '无法连接上游服务');
    }
  }
  async json(url: string, init: RequestInit = {}): Promise<unknown> {
    const response = await this.request(url, init);
    // 企查查使用非标准 HTTP 209 返回业务登录错误。
    checkHttp(response.status);
    return parseJson(response.body);
  }
}
