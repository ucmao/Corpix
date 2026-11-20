import { createHmac } from 'node:crypto';
import { HttpClient, checkHttp } from '../http.js';
import { fail } from '../errors.js';
import { object, text, date, result, total, type Company, type Provider, type SearchInput } from '../types.js';
import { basicDetails } from '../mapping.js';
import { companyModules } from '../modules.js';

const BASE = 'https://m.qixin.com';

const ALPHABET: Record<number, string> = {
  0: 'k', 1: 's', 2: 'X', 3: 'A', 4: 'y', 5: 'v', 6: '1', 7: '2', 8: 'd', 9: 'B',
  10: '6', 11: 'Y', 12: 'q', 13: 't', 14: 'I', 15: 'J', 16: 'g', 17: 'g', 18: 'o', 19: 'L'
};

export function signQxb(url: string, data: unknown = {}) {
  const e = url.toLowerCase();
  const n = e + e;
  let key = '';
  for (let o = 0; o < n.length; ++o) {
    const a = n.charCodeAt(o) % 20;
    key += ALPHABET[a];
  }
  const hmac1 = createHmac('sha512', key).update(e).digest('hex').toLowerCase();
  const headerName = hmac1.slice(10, 30);
  const o = JSON.stringify(data ?? {}).toLowerCase();
  const hmac2 = createHmac('sha512', key).update(e + e + o).digest('hex');
  return { name: headerName, value: hmac2 };
}

export function qxbHeaders(cookie = '', referer = `${BASE}/`): Record<string, string> {
  const headers: Record<string, string> = {
    'user-agent': 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1',
    referer,
    'x-requested-with': 'XMLHttpRequest'
  };
  if (cookie) headers.cookie = cookie;
  return headers;
}

export function extractQxbState(html: string): Record<string, unknown> {
  const match = html.match(/window\.__INITIAL_STATE__\s*=\s*/);
  if (!match || match.index === undefined) fail('PARSE_ERROR', '启信宝页面状态数据缺失');
  const start = match.index + match[0].length;
  let depth = 0, inString = false, strChar = '', end = -1;
  for (let i = start; i < html.length; i++) {
    const c = html[i];
    if (inString) {
      if (c === '\\') { i++; continue; }
      if (c === strChar) inString = false;
      continue;
    }
    if (c === '"' || c === "'") { inString = true; strChar = c; continue; }
    if (c === '{' || c === '[') { depth++; continue; }
    if (c === '}' || c === ']') {
      depth--;
      if (depth === 0) { end = i + 1; break; }
    }
  }
  if (end === -1) fail('PARSE_ERROR', '启信宝页面状态数据解析异常');
  try {
    return object(JSON.parse(html.slice(start, end)));
  } catch {
    fail('PARSE_ERROR', '启信宝页面状态 JSON 格式无效');
  }
}

export function normalizeQxb(value: unknown, detail = false): Company {
  const p = object(value);
  const id = text(p.eid ?? p.id);
  const rawName = text(p.name);
  const name = rawName ? rawName.replace(/<[^>]+>/g, '').trim() : null;
  if (!id || !name) fail('PARSE_ERROR', '启信宝企业标识或名称缺失');

  const regInfo = object(p.regInfo);
  const creditCode = text(regInfo.creditNo ?? p.creditNo ?? p.creditCode);
  const legalRepresentative = text(p.operName ?? p.legalRepresentative);
  const registrationStatus = text(regInfo.status ?? p.status ?? p.registrationStatus);
  const registeredCapital = text(p.regCapiDesc ?? p.regCapi ?? p.registeredCapital);
  const establishedAt = date(p.startDate ?? p.establishedAt);
  const address = text(regInfo.address ?? p.address);
  const businessScope = text(regInfo.scope ?? p.scope ?? p.businessScope);

  return {
    source: 'qixinbao',
    id,
    name,
    creditCode,
    legalRepresentative,
    registrationStatus,
    registeredCapital,
    establishedAt,
    address,
    businessScope,
    sourceUrl: `https://www.qixin.com/company/${id}`,
    basic: basicDetails('qixinbao', p),
    modules: companyModules('qixinbao', p, detail)
  };
}

export class Qixinbao implements Provider {
  readonly source = 'qixinbao' as const;
  constructor(private http: HttpClient, private cookie = '') {}

  async search(input: SearchInput) {
    const pageQuery = input.page > 1 ? `?page=${input.page}` : '';
    const url = `${BASE}/search/${encodeURIComponent(input.keyword)}.html${pageQuery}`;
    const response = await this.http.request(url, { headers: qxbHeaders(this.cookie) });
    checkHttp(response.status);

    const state = extractQxbState(response.body);
    const route = object(state.route);
    if (route.name === 'login' || route.path === '/auth/login') {
      fail('AUTH_REQUIRED', '启信宝搜索要求登录，请在 .env 中配置 QXB_COOKIE', 401);
    }

    const searchObj = object(state.search);
    const searchResult = object(searchObj.searchResult);
    const items = Array.isArray(searchResult.items) ? searchResult.items : [];
    const companies = items.map(item => normalizeQxb(item, false));
    const sliced = input.pageSize && companies.length > input.pageSize ? companies.slice(0, input.pageSize) : companies;
    const totalCount = total(searchResult.total ?? companies.length);

    return {
      ...result(this.source, sliced, state),
      pagination: { page: input.page, pageSize: input.pageSize, total: totalCount }
    };
  }

  async detail(id: string) {
    if (!/^[0-9a-f]{8}-?[0-9a-f]{4}-?[0-9a-f]{4}-?[0-9a-f]{4}-?[0-9a-f]{12}$/i.test(id)) {
      fail('INVALID_INPUT', '启信宝 ID 必须为 UUID 格式的 eid', 400);
    }
    const url = `${BASE}/company/${id}`;
    const response = await this.http.request(url, { headers: qxbHeaders(this.cookie) });
    checkHttp(response.status);

    const state = extractQxbState(response.body);
    const route = object(state.route);
    if (route.name === 'login' || route.path === '/auth/login') {
      fail('AUTH_REQUIRED', '启信宝企业详情要求登录，请在 .env 中配置 QXB_COOKIE', 401);
    }

    const enterprise = object(state.enterprise);
    const mentInfo = object(enterprise.mentInfo);
    if (!mentInfo.name) {
      fail('NOT_FOUND', '启信宝未找到该企业', 404);
    }

    const merged = { ...mentInfo, id };
    return result(this.source, [normalizeQxb(merged, true)], state);
  }
}
