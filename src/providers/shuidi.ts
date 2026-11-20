import { HttpClient, businessError, checkHttp } from '../http.js';
import { fail } from '../errors.js';
import { object, text, date, result, total, type Company, type Provider, type SearchInput } from '../types.js';
import { basicDetails } from '../mapping.js';
import { companyModules } from '../modules.js';

const BASE = 'https://shuidi.cn';

export function normalizeShuidi(value: unknown, detail = false): Company {
  const p = object(value);
  const id = text(p.digest ?? p.id);
  const name = text(p.company_name ?? p.companyName ?? p.name);
  if (!id || !name) fail('PARSE_ERROR', '水滴信用企业标识或名称缺失');
  return {
    source: 'shuidi',
    id,
    name,
    creditCode: text(p.credit_no ?? p.creditCode),
    legalRepresentative: text(p.legal_person ?? p.legalRepresentative),
    registrationStatus: text(p.company_status ?? p.registrationStatus),
    registeredCapital: text(p.capital ?? p.registeredCapital),
    establishedAt: date(p.establish_date ?? p.establishedAt),
    address: text(p.company_address ?? p.address),
    businessScope: text(p.business_scope ?? p.businessScope),
    sourceUrl: `${BASE}/company-${id}.html`,
    basic: basicDetails('shuidi', p),
    modules: companyModules('shuidi', p, detail)
  };
}

export function parseShuidiCards(html: string): { total: number | null; companies: Company[] } {
  if (/<div class="or_look_none"/i.test(html) || /未找到符合条件的查询结果/i.test(html)) {
    return { total: 0, companies: [] };
  }
  const totalMatch = html.match(/<i>（共(\d+)条记录）<\/i>/);
  const totalCount = totalMatch ? Number(totalMatch[1]) : null;

  const cardRegex = /<div class="or_search_row or_row_w">([\s\S]*?)<\/div>\s*<\/div>\s*<\/div>/g;
  let m: RegExpExecArray | null;
  const companies: Company[] = [];
  while ((m = cardRegex.exec(html)) !== null) {
    const card = m[1]!;
    const nameMatch = card.match(/companyname="([^"]+)"/) || card.match(/<span class="or_look_ne">([\s\S]*?)<a/);
    const name = nameMatch ? nameMatch[1]!.replace(/<[^>]+>/g, '').trim() : null;
    const digestMatch = card.match(/digest=([a-f0-9]{32})/i) || card.match(/\/company-([a-f0-9]{32})\.html/i);
    const digest = digestMatch ? digestMatch[1] : null;
    if (!name || !digest) continue;
    const legalMatch = card.match(/法定代表人：\s*([^<|]+)/);
    const capMatch = card.match(/注册资本：\s*([^<|]+)/);
    const dateMatch = card.match(/注册时间：\s*([^<|]+)/);
    const statusMatch = card.match(/状态：\s*([^<|]+)/);
    companies.push(normalizeShuidi({
      id: digest,
      name,
      legalRepresentative: legalMatch ? legalMatch[1]!.trim() : null,
      registeredCapital: capMatch ? capMatch[1]!.trim() : null,
      establishedAt: dateMatch ? dateMatch[1]!.trim() : null,
      registrationStatus: statusMatch ? statusMatch[1]!.trim() : null
    }, false));
  }
  return { total: totalCount ?? companies.length, companies };
}

export class Shuidi implements Provider {
  readonly source = 'shuidi' as const;
  constructor(private http: HttpClient, private cookie = '') {}

  async search(input: SearchInput) {
    const headers: Record<string, string> = { referer: `${BASE}/b-search` };
    if (this.cookie) headers.cookie = this.cookie;
    const url = `${BASE}/b-search?key=${encodeURIComponent(input.keyword)}&page=${input.page}`;
    const response = await this.http.request(url, { headers });
    checkHttp(response.status);
    const { total: totalCount, companies } = parseShuidiCards(response.body);
    const sliced = input.pageSize && companies.length > input.pageSize ? companies.slice(0, input.pageSize) : companies;
    return {
      ...result(this.source, sliced, { html: response.body }),
      pagination: { page: input.page, pageSize: input.pageSize, total: total(totalCount) }
    };
  }

  async detail(id: string) {
    if (!/^[a-f0-9]{32}$/i.test(id)) fail('INVALID_INPUT', '水滴信用 ID 必须为 32 位十六进制 digest', 400);
    const headers: Record<string, string> = { referer: `${BASE}/company-${id}.html` };
    if (this.cookie) headers.cookie = this.cookie;

    const baseInfoUrl = `${BASE}/webapp/company/base-info?digest=${id}`;
    const [baseRaw, branchesRaw, annualsRaw, phonesRaw, emailsRaw] = await Promise.allSettled([
      this.http.json(baseInfoUrl, { headers }),
      this.http.json(`${BASE}/webapp/company/base-info?action=branches&digest=${id}`, { headers }),
      this.http.json(`${BASE}/annual-reports?action=get_all_year&digest=${id}`, { headers }),
      this.http.json(`${BASE}/phone-new?digest=${id}&type=1`, { headers }),
      this.http.json(`${BASE}/phone-new?digest=${id}&type=2`, { headers })
    ]);

    if (baseRaw.status !== 'fulfilled') throw baseRaw.reason;
    const baseEnvelope = object(baseRaw.value);
    if (baseEnvelope.status !== 0 && baseEnvelope.status !== undefined) businessError(baseEnvelope);
    const data = object(baseEnvelope.data);
    if (!data.company_name) fail('NOT_FOUND', '水滴信用未找到该企业', 404);

    const branchesEnvelope = branchesRaw.status === 'fulfilled' ? object(branchesRaw.value) : {};
    const branches = {
      data: Array.isArray(branchesEnvelope.data) ? branchesEnvelope.data : [],
      total: total(branchesEnvelope.total)
    };

    const annualsEnvelope = annualsRaw.status === 'fulfilled' ? object(annualsRaw.value) : {};
    const annualReports = {
      data: Array.isArray(annualsEnvelope.data) ? annualsEnvelope.data : [],
      total: total(annualsEnvelope.total)
    };

    const phonesEnvelope = phonesRaw.status === 'fulfilled' ? object(phonesRaw.value) : {};
    const phoneList = Array.isArray(object(phonesEnvelope.data).list)
      ? (object(phonesEnvelope.data).list as Array<Record<string, unknown>>).map(p => text(p.phone)).filter(Boolean)
      : [];

    const emailsEnvelope = emailsRaw.status === 'fulfilled' ? object(emailsRaw.value) : {};
    const emailList = Array.isArray(object(emailsEnvelope.data).list)
      ? (object(emailsEnvelope.data).list as Array<Record<string, unknown>>).map(p => text(p.email)).filter(Boolean)
      : [];

    const merged = {
      ...data,
      id,
      branches,
      annualReports,
      phones: phoneList,
      emails: emailList
    };

    return result(this.source, [normalizeShuidi(merged, true)], {
      base: baseRaw.value,
      branches: branchesRaw.status === 'fulfilled' ? branchesRaw.value : null,
      annualReports: annualsRaw.status === 'fulfilled' ? annualsRaw.value : null,
      phones: phonesRaw.status === 'fulfilled' ? phonesRaw.value : null,
      emails: emailsRaw.status === 'fulfilled' ? emailsRaw.value : null
    });
  }
}
