import { HttpClient, businessError } from '../http.js';
import { fail } from '../errors.js';
import { object, text, date, result, total, type Company, type Provider, type SearchInput } from '../types.js';
import { basicDetails } from '../mapping.js';
import { companyModules } from '../modules.js';
export function tycHeaders(raw: string): Record<string, string> {
  const headers: Record<string, string> = { 'content-type': 'application/json', version: 'TYC-Web',
    origin: 'https://www.tianyancha.com', referer: 'https://www.tianyancha.com/' };
  if (raw) headers.cookie = raw;
  const cookie = Object.fromEntries(raw.split(';').map(s => { const i = s.indexOf('='); return i < 0 ? ['', ''] : [s.slice(0,i).trim(),s.slice(i+1).trim()]; }));
  for (const [key, header] of [['auth_token','X-AUTH-TOKEN'],['X-TOKEN-4C','X-TOKEN'],['TYCID','X-TYCID']]) {
    if (key && header && cookie[key]) headers[header] = cookie[key]!;
  }
  return headers;
}
export function normalizeTyc(value: unknown, detail = false): Company {
  const p = object(value), id = text(p.id), name = text(p.name);
  if (!id || !name) fail('PARSE_ERROR', '天眼查企业标识或名称缺失');
  return { source: 'tianyancha', id, name, creditCode: text(p.creditCode), legalRepresentative: text(p.legalPersonName),
    registrationStatus: text(p.regStatus), registeredCapital: text(p.regCapital), establishedAt: date(p.estiblishTime),
    address: text(p.regLocation), businessScope: text(p.businessScope), sourceUrl: `https://www.tianyancha.com/company/${id}`,
    basic: basicDetails('tianyancha', p), modules: companyModules('tianyancha', p, detail) };
}
function dataOf(raw: unknown) {
  const p = object(raw);
  if (p.state !== 'ok') businessError(p);
  return object(p.data);
}
export class Tianyancha implements Provider {
  readonly source = 'tianyancha' as const;
  constructor(private http: HttpClient, private cookie = '') {}
  async search(input: SearchInput) {
    const raw = await this.http.json('https://capi.tianyancha.com/cloud-tempest/web/searchCompanyV4', {
      method: 'POST', headers: tycHeaders(this.cookie), body: JSON.stringify({
        filterJson: JSON.stringify({ word: { key: 'word', items: [{ value: input.keyword }] } }),
        searchType: 1, pageNum: input.page, pageSize: input.pageSize }) });
    const data = dataOf(raw);
    if (!Array.isArray(data.companyList)) fail('PARSE_ERROR', '天眼查搜索列表结构变化');
    const companies = data.companyList.filter(p => object(p).id != null).map(p => normalizeTyc(p));
    return { ...result(this.source, companies, raw), pagination: { page: input.page, pageSize: input.pageSize, total: total(data.companyTotal) } };
  }
  async detail(id: string) {
    if (!/^\d+$/.test(id)) fail('INVALID_INPUT', '天眼查 ID 必须为数字', 400);
    const raw = await this.http.json(`https://rapi.tianyancha.com/biz-service/cloud-other-information/companyinfo/baseinfo/web?id=${id}`, { headers: tycHeaders(this.cookie) });
    return result(this.source, [normalizeTyc({ ...dataOf(raw), id }, true)], raw);
  }
}
