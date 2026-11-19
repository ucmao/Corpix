import { HttpClient, businessError, checkHttp, parseJson } from '../http.js';
import { fail } from '../errors.js';
import { object, text, date, result, total, type Company, type Provider, type SearchInput } from '../types.js';
import { basicDetails } from '../mapping.js';
import { companyModules } from '../modules.js';
const BASE = 'https://aiqicha.baidu.com';
const maps: Record<number, number[]> = { 1: [0,1,2,3,5,4,7,6,9,8], 2: [0,1,2,3,6,8,9,4,5,7] };
export function decodeDdw(value: unknown, mode: number): unknown {
  const mapping = maps[mode];
  if (!mapping) fail('PARSE_ERROR', '爱企查出现未知数字编码');
  const swap = (s: string) => s.replace(/[0-9]/g, n => String(mapping[Number(n)]));
  if (typeof value === 'string') return swap(value);
  if (typeof value === 'number') {
    // 避免科学计数法中的指数被误当成数据数字替换。
    let expanded = String(value);
    if (/e/i.test(expanded)) {
      const negative = expanded.startsWith('-');
      const [coefficient = '', exponent = '0'] = expanded.replace(/^-/, '').split(/e/i);
      const digits = coefficient.replace('.', '');
      const point = (coefficient.includes('.') ? coefficient.indexOf('.') : coefficient.length) + Number(exponent);
      expanded = (negative ? '-' : '') + (point <= 0 ? '0.' + '0'.repeat(-point) + digits
        : point >= digits.length ? digits + '0'.repeat(point - digits.length)
        : digits.slice(0, point) + '.' + digits.slice(point));
    }
    const decoded = Number(swap(expanded));
    if (!Number.isFinite(decoded)) fail('PARSE_ERROR', '爱企查数字解码超出可表示范围');
    return decoded;
  }
  if (Array.isArray(value)) return value.map(v => decodeDdw(v, mode));
  if (value && typeof value === 'object') return Object.fromEntries(Object.entries(value).map(([k,v]) => [k,decodeDdw(v,mode)]));
  return value;
}
function normalizeAqc(value: unknown, id: string, allData: unknown, detail = true): Company {
  const p = object(value), name = text(p.entName);
  if (!name) fail('PARSE_ERROR', '爱企查企业名称缺失');
  return { source: 'aiqicha', id, name, creditCode: text(p.unifiedCode), legalRepresentative: text(p.legalPerson),
    registrationStatus: text(p.openStatus), registeredCapital: text(p.regCapital), establishedAt: date(p.startDate),
    address: text(p.regAddr), businessScope: text(p.scope), sourceUrl: `${BASE}/company_detail_${id}`,
    basic: basicDetails('aiqicha', p), modules: companyModules('aiqicha', allData, detail) };
}
export class Aiqicha implements Provider {
  readonly source = 'aiqicha' as const;
  constructor(private http: HttpClient, private cookie = '') {}
  async search(input: SearchInput) {
    if (!this.cookie) fail('NOT_CONFIGURED', '请设置有效 AQC_COOKIE', 503);
    const query = new URLSearchParams({ q: input.keyword, t: '', p: String(input.page), s: String(input.pageSize), o: '0', f: '{}' });
    const raw = await this.http.json(`${BASE}/s/advanceFilterAjax?${query}`, { headers: { cookie: this.cookie,
      referer: `${BASE}/s?q=${encodeURIComponent(input.keyword)}&t=0`, 'x-requested-with': 'XMLHttpRequest' } });
    const envelope = object(raw);
    if (envelope.status !== 0) businessError(envelope);
    const data = object(envelope.ddw == null || envelope.ddw === 0 ? envelope.data : decodeDdw(envelope.data, Number(envelope.ddw)));
    if (!Array.isArray(data.resultList)) fail('PARSE_ERROR', '爱企查搜索列表结构变化');
    const companies = data.resultList.map(v => {
      const p = object(v), id = text(p.pid);
      if (!id || !/^\d+$/.test(id)) fail('PARSE_ERROR', '爱企查搜索缺少有效企业 ID');
      return normalizeAqc({ ...p, regCapital: p.regCapital ?? p.regCap, startDate: p.startDate ?? p.validityFrom,
        regAddr: p.regAddr ?? p.domicile }, id, undefined, false);
    });
    return { ...result(this.source, companies, raw), pagination: { page: input.page, pageSize: input.pageSize,
      total: total(data.totalNumFound ?? data.totalNum) } };
  }
  async detail(input: string) {
    if (!this.cookie) fail('NOT_CONFIGURED', '请设置有效 AQC_COOKIE', 503);
    if (!/^[a-zA-Z0-9_-]{1,160}$/.test(input)) fail('INVALID_INPUT', '爱企查 ID 格式无效', 400);
    const headers = { cookie: this.cookie, referer: `${BASE}/company_detail_${input}` };
    let id = input;
    if (!/^\d+$/.test(id)) {
      const response = await this.http.request(`${BASE}/company_detail_${id}`, { headers });
      const location = new URL(response.headers.get('location') || '/', BASE);
      const matched = location.origin === BASE && location.pathname.match(/^\/company_detail_(\d+)$/);
      if ([301,302].includes(response.status) && matched) id = matched[1]!;
      else { checkHttp(response.status); fail('PARSE_ERROR', '无法从爱企查页面跳转解析数字 ID'); }
    }
    const response = await this.http.request(`${BASE}/detail/basicAllDataAjax?pid=${id}`, { headers: { ...headers, referer: `${BASE}/company_detail_${id}` } });
    checkHttp(response.status);
    const raw = parseJson(response.body), envelope = object(raw);
    // 状态码和 ddw 为协议元数据，只对 data 解码，不能修改状态码。
    if (envelope.status !== 0) businessError(envelope);
    const data = envelope.ddw == null || envelope.ddw === 0 ? envelope.data : decodeDdw(envelope.data, Number(envelope.ddw));
    return result(this.source, [normalizeAqc(object(data).basicData, id, data)], raw);
  }
}
