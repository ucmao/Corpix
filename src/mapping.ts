import { date, object, text, type Source, type BasicDetails, type Money } from './types.js';

// 字段清单独立于请求协议；新平台增加自身映射及 Provider，不影响现有调用方。
export const basicFieldMappings = {
  tianyancha: {
    companyType: ['companyOrgType'], industry: ['industry2017', 'industry'], registrationNumber: ['regNumber'],
    organizationCode: ['orgNumber'], taxNumber: ['taxNumber', 'taxCode'], paidInCapital: ['actualCapital'],
    registrationAuthority: ['regInstitute', 'registerInstitute'], approvedAt: ['approvedTime', 'approveDate'],
    businessTerm: ['businessTerm'], employeeScale: ['staffNumRange', 'companyScale'], insuredEmployees: ['socialStaffNum'],
    formerNames: ['historyNames'], phones: ['phoneNumber', 'phone', 'phoneList'], emails: ['emailList', 'email', 'emails'], websites: ['websiteList', 'websites']
  },
  qichacha: {
    companyType: ['EconKind'], industry: ['Industry.SubIndustry', 'Industry.Industry'], registrationNumber: ['No'],
    organizationCode: ['OrgNo'], taxNumber: ['TaxNo'], paidInCapital: ['RecCap'],
    registrationAuthority: ['BelongOrg'], approvedAt: ['CheckDate'], businessTerm: [],
    employeeScale: ['StaffScale', 'Scale'], insuredEmployees: ['Staffs.c'], formerNames: ['OriginalName'],
    phones: ['ContactInfo.PhoneNumber', 'ContactNumber', 'TelList'], emails: ['ContactInfo.Email', 'Email', 'EmailList'],
    websites: ['ContactInfo.WebSite', 'GW']
  },
  aiqicha: {
    companyType: ['entType', 'orgType'], industry: ['industry'], registrationNumber: ['regCode', 'licenseNumber'],
    organizationCode: ['orgNo'], taxNumber: ['taxNo'], paidInCapital: ['paidinCapital', 'realCapital'],
    registrationAuthority: ['authority'], approvedAt: ['annualDate'], businessTerm: ['openTime'],
    employeeScale: ['scale'], insuredEmployees: ['insuranceInfo.insuranceNum'], formerNames: ['prevEntName'],
    phones: ['telephone', 'phoneinfo'], emails: ['email', 'emailinfo'], websites: ['officialweb', 'website']
  },
  shuidi: {
    companyType: ['company_type'], industry: ['industry_l2_name', 'industry_name'], registrationNumber: ['company_no'],
    organizationCode: ['org_code'], taxNumber: ['tax_number', 'credit_no'], paidInCapital: ['real_capital'],
    registrationAuthority: ['authority'], approvedAt: ['issue_date'], businessTerm: ['operation_date'],
    employeeScale: ['employee_no'], insuredEmployees: ['insurance_amount'], formerNames: ['history_names'],
    phones: ['phoneList', 'phones'], emails: ['emailList', 'emails'], websites: ['websiteList', 'websites']
  },
  qixinbao: {
    companyType: ['regInfo.econKind', 'econKind'], industry: ['industryName', 'industry', 'regInfo.industry'],
    registrationNumber: ['regInfo.regNo', 'regNo'], organizationCode: ['regInfo.orgNo', 'orgNo'],
    taxNumber: ['regInfo.creditNo', 'creditNo'], paidInCapital: ['regInfo.actualCapi', 'actualCapi'],
    registrationAuthority: ['regInfo.belongOrg', 'belongOrg'], approvedAt: ['regInfo.checkDate', 'checkDate', 'regInfo.approvedTime'],
    businessTerm: ['regInfo.businessTerm', 'businessTerm'], employeeScale: ['staffNumRange', 'scale'],
    insuredEmployees: ['socialStaffNum', 'insuranceNum'], formerNames: ['historyNames'],
    phones: ['phone', 'phones', 'phoneList'], emails: ['email', 'emails', 'emailList'],
    websites: ['websites', 'websiteList', 'domainList']
  }
} satisfies Record<Source, Record<keyof BasicDetails, string[]>>;

// 爱企查等平台用 "-"、"**" 等纯符号占位表示未公示或无权限，不能当作真实值。
// 只匹配整串都是占位符号的情况，"0755-2878****" 这类部分掩码原文仍保留。
function placeholder(value: unknown): boolean {
  return typeof value === 'string' && /^[\s\-—–*＊/]+$/.test(value);
}
function at(value: unknown, path: string): unknown {
  return path.split('.').reduce<unknown>((v, key) => object(v)[key], value);
}
export function first(value: unknown, paths: readonly string[]): unknown {
  for (const path of paths) { const v = at(value, path); if (v !== undefined && v !== null && v !== '' && !placeholder(v)) return v; }
  return null;
}
export function stringList(value: unknown): string[] {
  const values = (Array.isArray(value) ? value : value == null ? [] : [value]).filter(v => !placeholder(v));
  return [...new Set(values.map(v => typeof v === 'object'
    ? text(first(v, ['Name', 'name', 'Url', 'url', 'phoneNumber', 'phone', 'email', 'value'])) : text(v)).filter((v): v is string => Boolean(v)))];
}
export function qccDate(value: unknown): string | null {
  if (typeof value === 'number') return value <= 0 ? null : date(value < 100_000_000_000 ? value * 1000 : value);
  return date(value);
}
export function ratio(value: unknown): number | null {
  if (typeof value !== 'number' && typeof value !== 'string') return null;
  const s = String(value).trim(), percent = s.endsWith('%');
  if (!/^\d+(?:\.\d+)?%?$/.test(s)) return null;
  const n = Number(s.replace('%', '')) / (percent ? 100 : 1);
  return Number.isFinite(n) && n >= 0 && n <= 1 ? n : null;
}
export function money(value: unknown): Money | null {
  const raw = text(value);
  if (!raw) return null;
  const match = raw.replace(/,/g, '').match(/^(\d+(?:\.\d+)?)\s*(亿|万)?/);
  const currency = /美元|USD/i.test(raw) ? 'USD' : /港元|港币|HKD/i.test(raw) ? 'HKD' : /人民币|RMB|CNY|(?:^|[万亿(（])元/.test(raw) ? 'CNY' : null;
  return { text: raw, amount: match?.[1] ?? null, currency, unit: match ? match[2] ?? (/元/.test(raw) ? '元' : null) : null };
}
export function basicDetails(source: Source, value: unknown): BasicDetails {
  const map = basicFieldMappings[source];
  const scalar = (key: keyof BasicDetails) => text(first(value, map[key]));
  const list = (key: keyof BasicDetails) => [...new Set(map[key].flatMap(path => {
    const v = at(value, path);
    if (key === 'websites' && Array.isArray(v)) return v.flatMap(item => stringList(typeof item === 'object' ? first(item, ['Url', 'url']) : item));
    return stringList(v);
  }))];
  const result: BasicDetails = {
    companyType: scalar('companyType'), industry: scalar('industry'), registrationNumber: scalar('registrationNumber'),
    organizationCode: scalar('organizationCode'), taxNumber: scalar('taxNumber'), paidInCapital: scalar('paidInCapital'),
    registrationAuthority: scalar('registrationAuthority'), approvedAt: source === 'qichacha' ? qccDate(first(value, map.approvedAt)) : date(first(value, map.approvedAt)),
    businessTerm: scalar('businessTerm'), employeeScale: scalar('employeeScale'), insuredEmployees: scalar('insuredEmployees'),
    formerNames: list('formerNames'), phones: list('phones'), emails: list('emails'), websites: list('websites')
  };
  if (!result.businessTerm) {
    const start = source === 'qichacha' ? qccDate(at(value, 'TermStart')) : date(at(value, 'fromTime'));
    const end = source === 'qichacha' ? qccDate(at(value, 'TeamEnd')) : date(at(value, 'toTime'));
    if (start || end) result.businessTerm = `${start ?? ''} / ${end ?? ''}`;
  }
  return result;
}
