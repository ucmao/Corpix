export const sources = ['tianyancha', 'qichacha', 'aiqicha', 'shuidi', 'qixinbao'] as const;
export type Source = typeof sources[number];
export type ObjectData = Record<string, unknown>;
export interface Company {
  source: Source;
  id: string;
  name: string;
  creditCode: string | null;
  legalRepresentative: string | null;
  registrationStatus: string | null;
  registeredCapital: string | null;
  establishedAt: string | null;
  address: string | null;
  businessScope: string | null;
  sourceUrl: string;
  basic?: BasicDetails;
  modules?: CompanyModules;
}
export interface BasicDetails {
  companyType: string | null; industry: string | null; registrationNumber: string | null;
  organizationCode: string | null; taxNumber: string | null; paidInCapital: string | null;
  registrationAuthority: string | null; approvedAt: string | null; businessTerm: string | null;
  employeeScale: string | null; insuredEmployees: string | null; formerNames: string[];
  phones: string[]; emails: string[]; websites: string[];
}
export interface Money { text: string; amount: string | null; currency: string | null; unit: string | null }
export interface Shareholder {
  id: string | null; name: string; ownershipRatio: number | null; ownershipRatioText: string | null;
  subscribedCapital: Money | null; paidInCapital: Money | null; subscribedAt: string | null;
  kind: string | null;
}
export interface Person { id: string | null; name: string; positions: string[] }
export interface RelatedCompany { id: string | null; name: string; status: string | null; legalRepresentative: string | null; ownershipRatio: number | null }
export interface ChangeRecord { changedAt: string | null; item: string | null; before: string | null; after: string | null }
export interface AnnualReport { year: string | null; title: string | null; url: string | null }
export type ModuleStatus = 'ok' | 'partial' | 'not_requested' | 'not_returned' | 'unsupported' | 'access_denied' | 'parse_error';
export interface DataModule<T> {
  status: ModuleStatus; items: T[]; total: number | null; returnedCount: number;
  complete: boolean | null; reason?: string;
  sourceVariant?: string | null;
  restriction?: { code: string | null; message: string | null };
}
export interface CompanyModules {
  shareholders: DataModule<Shareholder>; people: DataModule<Person>;
  investments: DataModule<RelatedCompany>; branches: DataModule<RelatedCompany>;
  changes: DataModule<ChangeRecord>; annualReports: DataModule<AnnualReport>;
}
export interface SearchInput { keyword: string; page: number; pageSize: number }
export interface QueryResult {
  source: Source;
  fetchedAt: string;
  companies: Company[];
  pagination?: { page: number; pageSize: number; total: number | null };
  raw: unknown;
}
export interface Provider {
  source: Source;
  search(input: SearchInput): Promise<QueryResult>;
  detail(id: string): Promise<QueryResult>;
}
export function object(value: unknown): ObjectData {
  return value !== null && typeof value === 'object' && !Array.isArray(value) ? value as ObjectData : {};
}
export function text(value: unknown): string | null {
  if (typeof value !== 'string' && typeof value !== 'number') return null;
  const result = String(value).replace(/<[^>]*>/g, '').trim();
  return result || null;
}
// 工商日期按中国本地日历日（UTC+8）统一为 YYYY-MM-DD；无法识别的原文（如"无固定期限"）保持不变。
const CHINA_OFFSET_MS = 8 * 3600 * 1000;
export function date(value: unknown): string | null {
  if (typeof value === 'number') {
    if (value === 0 || !Number.isFinite(value)) return null;
    const result = new Date(value + CHINA_OFFSET_MS);
    return Number.isNaN(result.getTime()) ? null : result.toISOString().slice(0, 10);
  }
  const raw = text(value);
  const m = raw?.match(/^(\d{4})[-/.年](\d{1,2})[-/.月](\d{1,2})日?(?:[ T].*)?$/);
  if (!m) return raw;
  const [, y, mo, d] = m;
  return `${y}-${mo!.padStart(2, '0')}-${d!.padStart(2, '0')}`;
}
export function total(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) && value >= 0 ? value : null;
}
export function result(source: Source, companies: Company[], raw: unknown): QueryResult {
  return { source, fetchedAt: new Date().toISOString(), companies, raw };
}
