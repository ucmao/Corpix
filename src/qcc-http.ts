import { HttpClient, checkHttp, parseJson } from './http.js';
import { fail } from './errors.js';
import { object } from './types.js';
import { signQcc, type QccTransport } from './providers/qichacha.js';

export function parseQccState(html: string): unknown {
  const marker = /window\.__INITIAL_STATE__\s*=\s*\{/.exec(html);
  if (!marker) { pageFailure(html); fail('PARSE_ERROR', '企查查页面缺少企业初始数据'); }
  const start = marker.index + marker[0].length - 1;
  let depth = 0, quoted = false, escaped = false;
  for (let i = start; i < html.length; i++) {
    const c = html[i];
    if (quoted) { if (escaped) escaped = false; else if (c === '\\') escaped = true; else if (c === '"') quoted = false; }
    else if (c === '"') quoted = true;
    else if (c === '{') depth++;
    else if (c === '}' && --depth === 0) return parseJson(html.slice(start, i + 1));
  }
  fail('PARSE_ERROR', '企查查页面初始数据不完整');
}
function pageFailure(html: string) {
  const title = html.match(/<title[^>]*>([^<]*)/i)?.[1] ?? '';
  if (/验证|captcha|安全校验/i.test(title)) fail('UPSTREAM_BLOCKED', '企查查要求页面验证');
  if (/登录|login/i.test(title)) fail('AUTH_REQUIRED', '企查查会话需要重新登录', 409);
}

export class HttpQccTransport implements QccTransport {
  constructor(private http: HttpClient, private cookie: string) {}
  async request(path: string, method: 'GET' | 'POST', body?: unknown, query = ''): Promise<unknown> {
    if (!this.cookie) fail('NOT_CONFIGURED', '企查查需要配置 QCC_COOKIE', 503);
    // 每次查询独立维护会话，不将响应 Cookie 持久化或跨并发查询共享。
    const jar = new Map(this.cookie.split(';').flatMap(part => {
      const i = part.indexOf('='); return i < 1 ? [] : [[part.slice(0, i).trim(), part.slice(i + 1).trim()] as const];
    }));
    const send = async (url: string, init: RequestInit = {}) => {
      const headers = new Headers(init.headers);
      headers.set('cookie', [...jar].map(([k, v]) => `${k}=${v}`).join('; '));
      const r = await this.http.request(url, { ...init, headers });
      for (const line of r.headers.getSetCookie()) {
        const [pair = '', ...attrs] = line.split(';'), eq = pair.indexOf('=');
        if (eq < 1) continue;
        const domain = attrs.find(a => /^\s*domain=/i.test(a))?.split('=')[1]?.trim().replace(/^\./, '').toLowerCase();
        if (domain && !['qcc.com', 'www.qcc.com'].includes(domain)) continue;
        const name = pair.slice(0, eq).trim();
        const expiry = attrs.find(a => /^\s*expires=/i.test(a))?.replace(/^\s*expires=/i, '');
        if (attrs.some(a => /^\s*max-age=0(?:\s|$)|^\s*max-age=-/i.test(a)) || (expiry && Date.parse(expiry) <= Date.now())) jar.delete(name);
        else jar.set(name, pair.slice(eq + 1).trim());
      }
      checkHttp(r.status);
      return r;
    };
    if (path === '/company/getDetail' && method === 'GET') {
      const params = new URLSearchParams(query), id = params.get('keyNo');
      if (!id || !/^[a-f0-9]{32}$/i.test(id) || [...params.keys()].some(k => k !== 'keyNo')) fail('INVALID_INPUT', '企查查详情参数无效', 400);
      const page = await send(`https://www.qcc.com/firm/${id}.html`, { headers: { referer: 'https://www.qcc.com/' } });
      const detail = object(object(object(parseQccState(page.body)).company).companyDetail);
      if (typeof detail.KeyNo !== 'string' || detail.KeyNo.toLowerCase() !== id.toLowerCase()) fail('PARSE_ERROR', '企查查详情企业标识不匹配');
      return { Status: 200, Result: detail };
    }
    if (path !== '/search/searchMulti' || method !== 'POST' || query) fail('INVALID_INPUT', '不支持的企查查 HTTP 端点', 400);
    const input = object(body);
    if (typeof input.searchKey !== 'string' || !input.searchKey.trim() || input.searchKey.length > 100 ||
      !Number.isInteger(input.pageIndex) || Number(input.pageIndex) < 1 || Number(input.pageIndex) > 100 ||
      !Number.isInteger(input.pageSize) || Number(input.pageSize) < 1 || Number(input.pageSize) > 20) fail('INVALID_INPUT', '企查查搜索参数无效', 400);
    const url = `https://www.qcc.com/web/search?key=${encodeURIComponent(input.searchKey)}`;
    const page = await send(url, { headers: { referer: 'https://www.qcc.com/' } });
    const pid = page.body.match(/window\.pid\s*=\s*['"]([^'"]+)['"]/)?.[1];
    const tid = page.body.match(/window\.tid\s*=\s*['"]([^'"]+)['"]/)?.[1];
    if (!pid || !tid) { pageFailure(page.body); fail('PARSE_ERROR', '企查查页面缺少 pid 或 tid，无法签名'); }
    const payload = { searchKey: input.searchKey, pageIndex: input.pageIndex, pageSize: input.pageSize };
    const signature = signQcc(path, tid, payload);
    const response = await send('https://www.qcc.com/api/search/searchMulti', { method: 'POST',
      headers: { referer: url, origin: 'https://www.qcc.com', 'content-type': 'application/json',
        'x-pid': pid, 'x-requested-with': 'XMLHttpRequest', [signature.name]: signature.value }, body: JSON.stringify(payload) });
    return parseJson(response.body);
  }
}
