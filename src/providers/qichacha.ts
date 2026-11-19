import { createHmac } from 'node:crypto';
import { businessError } from '../http.js';
import { fail } from '../errors.js';
import { object, text, result, total, type Company, type Provider, type SearchInput } from '../types.js';
import { basicDetails, qccDate } from '../mapping.js';
import { companyModules } from '../modules.js';
export function signQcc(path: string, tid: string, data: unknown = {}, query = '') {
  const p = (`/api/${path.replace(/^\/+/, '')}` + (query ? `?${query}` : '')).toLowerCase();
  const alphabet = 'WlkBQgfiirv6AKNk4L18';
  const key = Array.from(p + p, c => alphabet[c.codePointAt(0)! % 20]).join('');
  const dj = JSON.stringify(data ?? {}).toLowerCase();
  const hmac = (s: string) => createHmac('sha512', key).update(s).digest('hex');
  return { name: hmac(p + dj).slice(8,28), value: hmac(p + 'pathString' + dj + tid) };
}
export interface QccTransport { request(path: string, method: 'GET' | 'POST', body?: unknown, query?: string): Promise<unknown> }
export function normalizeQcc(value: unknown, detail = false): Company {
  const p = object(value), id = text(p.KeyNo), name = text(p.Name);
  if (!id || !name) fail('PARSE_ERROR', '企查查企业标识或名称缺失');
  return { source: 'qichacha', id, name, creditCode: text(p.CreditCode), legalRepresentative: text(p.OperName ?? object(p.Oper).Name),
    registrationStatus: text(p.Status), registeredCapital: text(p.RegistCapi), establishedAt: qccDate(p.StartDate),
    address: text(p.Address), businessScope: text(p.Scope), sourceUrl: `https://www.qcc.com/firm/${id}.html`,
    basic: basicDetails('qichacha', p), modules: companyModules('qichacha', p, detail) };
}
function validate(raw: unknown) {
  const p = object(raw);
  const status = p.status ?? (typeof p.Status === 'number' ? p.Status : undefined);
  if (status !== undefined && status !== 200) businessError(p);
  return p;
}
export class Qichacha implements Provider {
  readonly source = 'qichacha' as const;
  constructor(private transport: QccTransport) {}
  async search(input: SearchInput) {
    const raw = await this.transport.request('/search/searchMulti', 'POST', { searchKey: input.keyword, pageIndex: input.page, pageSize: input.pageSize });
    const p = validate(raw);
    if (!Array.isArray(p.Result)) fail('PARSE_ERROR', '企查查搜索列表结构变化');
    return { ...result(this.source, p.Result.map(v => normalizeQcc(v)), raw), pagination: { page: input.page, pageSize: input.pageSize, total: total(object(p.Paging).TotalRecords) } };
  }
  async detail(id: string) {
    if (!/^[a-f0-9]{32}$/i.test(id)) fail('INVALID_INPUT', '企查查 ID 必须为 32 位十六进制 KeyNo', 400);
    const raw = await this.transport.request('/company/getDetail', 'GET', undefined, `keyNo=${id}`);
    const p = validate(raw);
    return result(this.source, [normalizeQcc(p.Result ?? p.result ?? p, true)], raw);
  }
}
