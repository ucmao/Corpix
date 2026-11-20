import { CorpixError, type ErrorCode } from './errors.js';
import { money } from './mapping.js';
import type { Company, CompanyModules, DataModule, Provider, Source } from './types.js';

// 跨平台统一查询：按企业全称或统一社会信用代码定位同一家企业，再取详情。
// merged（默认推荐）：并行查所有可用平台并拼图融合成唯一一份最全企业档案；fallback：按顺序查，第一个成功即返回；all：并行查所有平台，附字段一致性对比。
// 只接受名称或信用代码精确命中，不会把模糊搜索的第一条当作目标企业。
export type LookupStrategy = 'merged' | 'fallback' | 'all';
export const defaultLookupOrder: readonly Source[] = ['qichacha', 'aiqicha', 'tianyancha', 'shuidi', 'qixinbao'];
export interface LookupInput { keyword: string; strategy?: LookupStrategy; sources?: readonly Source[] }
export interface LookupAttempt {
  source: Source; status: 'ok' | 'not_found' | 'skipped' | 'error'; durationMs: number;
  error?: { code: ErrorCode; message: string };
}
export interface FieldComparison { consistent: boolean; values: Partial<Record<Source, unknown>> }
export interface LookupResult {
  strategy: LookupStrategy; keyword: string; matchBy: 'name' | 'creditCode'; fetchedAt: string;
  source?: Source; company?: Company;
  results?: Partial<Record<Source, Company>>;
  comparison?: { consistentFields: string[]; differingFields: string[]; fields: Record<string, FieldComparison> };
  sourcesUsed?: Source[];
  attempts: LookupAttempt[];
}

const CREDIT_CODE = /^[0-9A-HJ-NPQRTUWXY]{2}\d{6}[0-9A-HJ-NPQRTUWXY]{10}$/;
const isCreditCode = (value: string) => CREDIT_CODE.test(value.toUpperCase());
// 只用于判断是否同名：统一全角/半角括号并去掉空白，不改动返回值。
const sameName = (a: string, b: string) => {
  const canon = (s: string) => s.replace(/（/g, '(').replace(/）/g, ')').replace(/\s+/g, '');
  return canon(a) === canon(b);
};

async function lookupOne(provider: Provider, keyword: string, byCode: boolean): Promise<Company | null> {
  const found = await provider.search({ keyword, page: 1, pageSize: 10 });
  const code = keyword.toUpperCase();
  const candidate = byCode
    ? found.companies.find(c => c.creditCode?.toUpperCase() === code) ?? found.companies.find(c => !c.creditCode)
    : found.companies.find(c => sameName(c.name, keyword));
  if (!candidate) return null;
  const detail = (await provider.detail(candidate.id)).companies[0];
  if (!detail) return null;
  // 搜索卡片可能缺信用代码，详情阶段再核对一次，避免取错企业。
  if (byCode && detail.creditCode?.toUpperCase() !== code) return null;
  return detail;
}

async function attempt(source: Source, provider: Provider, configured: boolean, keyword: string, byCode: boolean) {
  const started = Date.now();
  const done = (status: LookupAttempt['status'], extra: Partial<LookupAttempt> = {}): LookupAttempt =>
    ({ source, status, durationMs: Date.now() - started, ...extra });
  if (!configured) return { attempt: done('skipped', { error: { code: 'NOT_CONFIGURED', message: '该平台未配置凭据' } }) };
  try {
    const company = await lookupOne(provider, keyword, byCode);
    return company ? { attempt: done('ok'), company } : { attempt: done('not_found') };
  } catch (e) {
    const error = e instanceof CorpixError ? { code: e.code, message: e.message } : { code: 'INTERNAL_ERROR' as const, message: '查询失败' };
    return { attempt: done('error', { error }) };
  }
}

// 对比时做轻量规范化（括号、千分位、"人"后缀、金额拆成数值+单位），避免纯格式差异被报成不一致；
// 返回的 values 仍是各平台归一化后的原值。
const comparedFields: Array<[string, (c: Company) => unknown]> = [
  ['name', c => c.name], ['creditCode', c => c.creditCode], ['legalRepresentative', c => c.legalRepresentative],
  ['registrationStatus', c => c.registrationStatus], ['registeredCapital', c => c.registeredCapital],
  ['establishedAt', c => c.establishedAt], ['address', c => c.address],
  ...(['companyType', 'industry', 'registrationNumber', 'organizationCode', 'taxNumber', 'paidInCapital',
    'registrationAuthority', 'approvedAt', 'employeeScale', 'insuredEmployees'] as const)
    .map(k => [`basic.${k}`, (c: Company) => c.basic?.[k] ?? null] as [string, (c: Company) => unknown])
];
function canonical(field: string, value: unknown): string | null {
  if (value == null) return null;
  const s = String(value).replace(/（/g, '(').replace(/）/g, ')').replace(/\s+/g, '');
  if (field === 'registeredCapital' || field === 'basic.paidInCapital') {
    const m = money(s);
    return m?.amount ? `${Number(m.amount)}${m.unit ?? ''}` : s;
  }
  if (field === 'basic.insuredEmployees') return s.replace(/,/g, '').replace(/人$/, '');
  return s.replace(/[,，、]/g, ',');
}
export function compareCompanies(results: Partial<Record<Source, Company>>) {
  const entries = Object.entries(results) as Array<[Source, Company]>;
  const fields: Record<string, FieldComparison> = {};
  for (const [field, get] of comparedFields) {
    const values = Object.fromEntries(entries.map(([s, c]) => [s, get(c)])) as Partial<Record<Source, unknown>>;
    // 缺失值不参与比较：某平台没返回不算矛盾，至少两个平台都有值才判断。
    const present = new Set(entries.map(([, c]) => canonical(field, get(c))).filter(v => v !== null));
    fields[field] = { consistent: present.size <= 1, values };
  }
  const names = Object.keys(fields);
  return { consistentFields: names.filter(f => fields[f]!.consistent), differingFields: names.filter(f => !fields[f]!.consistent), fields };
}

function scoreModule(m: DataModule<unknown> | undefined): number {
  if (!m) return -1000;
  if (m.status === 'ok') return 1000 + (m.items?.length || 0);
  if (m.status === 'partial') return 500 + (m.items?.length || 0);
  if (m.status === 'not_returned') return (m.items?.length || 0);
  return -100;
}

export function mergeCompanies(results: Partial<Record<Source, Company>>, order: readonly Source[]): { company: Company; sourcesUsed: Source[] } {
  const entries = order.filter(s => results[s] != null).map(s => [s, results[s]!] as const);
  if (entries.length === 0) {
    throw new CorpixError('INTERNAL_ERROR', '没有可用于合并的企业数据');
  }
  const sourcesUsed = entries.map(([s]) => s);
  const primary = entries[0]![1];

  const firstNonNull = <T>(fn: (c: Company) => T | null | undefined): T | null => {
    for (const [, c] of entries) {
      const v = fn(c);
      if (v !== undefined && v !== null && v !== '') return v;
    }
    return null;
  };

  const pickBestModule = <K extends keyof CompanyModules>(key: K): CompanyModules[K] => {
    let best = entries[0]![1].modules?.[key];
    let bestScore = scoreModule(best);
    for (let i = 1; i < entries.length; i++) {
      const m = entries[i]![1].modules?.[key];
      const sc = scoreModule(m);
      if (sc > bestScore) {
        bestScore = sc;
        best = m;
      }
    }
    return (best ?? { status: 'not_returned', items: [], total: null, returnedCount: 0, complete: null, reason: '未获取到此模块数据' }) as CompanyModules[K];
  };

  const longestScope = entries.map(([, c]) => c.businessScope).filter((s): s is string => Boolean(s)).sort((a, b) => b.length - a.length)[0] ?? null;

  const company: Company = {
    source: primary.source,
    id: primary.id,
    name: firstNonNull(c => c.name) ?? primary.name,
    creditCode: firstNonNull(c => c.creditCode),
    legalRepresentative: firstNonNull(c => c.legalRepresentative),
    registrationStatus: firstNonNull(c => c.registrationStatus),
    registeredCapital: firstNonNull(c => c.registeredCapital),
    establishedAt: firstNonNull(c => c.establishedAt),
    address: firstNonNull(c => c.address),
    businessScope: longestScope,
    sourceUrl: primary.sourceUrl,
    basic: {
      companyType: firstNonNull(c => c.basic?.companyType),
      industry: firstNonNull(c => c.basic?.industry),
      registrationNumber: firstNonNull(c => c.basic?.registrationNumber),
      organizationCode: firstNonNull(c => c.basic?.organizationCode),
      taxNumber: firstNonNull(c => c.basic?.taxNumber),
      paidInCapital: firstNonNull(c => c.basic?.paidInCapital),
      registrationAuthority: firstNonNull(c => c.basic?.registrationAuthority),
      approvedAt: firstNonNull(c => c.basic?.approvedAt),
      businessTerm: firstNonNull(c => c.basic?.businessTerm),
      employeeScale: firstNonNull(c => c.basic?.employeeScale),
      insuredEmployees: firstNonNull(c => c.basic?.insuredEmployees),
      formerNames: [...new Set(entries.flatMap(([, c]) => c.basic?.formerNames ?? []))],
      phones: [...new Set(entries.flatMap(([, c]) => c.basic?.phones ?? []))],
      emails: [...new Set(entries.flatMap(([, c]) => c.basic?.emails ?? []))],
      websites: [...new Set(entries.flatMap(([, c]) => c.basic?.websites ?? []))]
    },
    modules: {
      shareholders: pickBestModule('shareholders'),
      people: pickBestModule('people'),
      branches: pickBestModule('branches'),
      annualReports: pickBestModule('annualReports'),
      changes: pickBestModule('changes'),
      investments: pickBestModule('investments')
    }
  };

  return { company, sourcesUsed };
}

export async function lookup(providers: Record<Source, Provider>, configured: (s: Source) => boolean, input: LookupInput): Promise<LookupResult> {
  const keyword = input.keyword.trim(), byCode = isCreditCode(keyword);
  const strategy = input.strategy ?? 'merged';
  const sources = input.sources ?? defaultLookupOrder;
  const base = { strategy, keyword, matchBy: byCode ? 'creditCode' as const : 'name' as const };
  const attempts: LookupAttempt[] = [];
  if (strategy === 'fallback') {
    for (const source of sources) {
      const r = await attempt(source, providers[source], configured(source), keyword, byCode);
      attempts.push(r.attempt);
      if (r.company) return { ...base, fetchedAt: new Date().toISOString(), source, company: r.company, attempts };
    }
    throw lookupFailure(attempts);
  }
  const all = await Promise.all(sources.map(s => attempt(s, providers[s], configured(s), keyword, byCode)));
  const results: Partial<Record<Source, Company>> = {};
  for (const r of all) { attempts.push(r.attempt); if (r.company) results[r.attempt.source] = r.company; }
  if (!Object.keys(results).length) throw lookupFailure(attempts);
  if (strategy === 'merged') {
    const { company, sourcesUsed } = mergeCompanies(results, sources);
    return { ...base, fetchedAt: new Date().toISOString(), company, sourcesUsed, attempts };
  }
  return { ...base, fetchedAt: new Date().toISOString(), results, comparison: compareCompanies(results), attempts };
}

export class LookupError extends CorpixError {
  constructor(code: ErrorCode, message: string, status: number, public attempts: LookupAttempt[]) { super(code, message, status); }
}
function lookupFailure(attempts: LookupAttempt[]): LookupError {
  if (attempts.every(a => a.status === 'skipped')) return new LookupError('NOT_CONFIGURED', '所选平台均未配置凭据', 503, attempts);
  if (attempts.every(a => a.status === 'not_found' || a.status === 'skipped')) return new LookupError('NOT_FOUND', '所选平台均未精确匹配到该企业', 404, attempts);
  return new LookupError('UPSTREAM_ERROR', '所选平台均未能返回企业详情', 502, attempts);
}
