import { object, text, date, total, type Source, type CompanyModules, type DataModule, type ModuleStatus,
  type Shareholder, type Person, type RelatedCompany, type ChangeRecord, type AnnualReport } from './types.js';
import { first, money, qccDate, ratio, stringList } from './mapping.js';

function missing<T>(status: ModuleStatus = 'not_returned', reason = '本次响应未返回此模块明细'): DataModule<T> {
  return { status, items: [], total: null, returnedCount: 0, complete: null, reason };
}
function moduleOf<T>(value: unknown, count: unknown, convert: (v: unknown) => T | null, restricted = false): DataModule<T> {
  const expected = total(count);
  if (restricted) {
    const items = Array.isArray(value) ? value.map(convert).filter((v): v is T => v !== null) : [];
    return { status: 'access_denied', items, total: expected, returnedCount: items.length, complete: false, reason: '上游明确返回访问限制' };
  }
  if (value == null) return missing();
  if (!Array.isArray(value)) return missing('parse_error', '上游模块列表结构变化');
  const items = value.map(convert).filter((v): v is T => v !== null);
  if (items.length !== value.length) return { status: 'parse_error', items, total: expected, returnedCount: items.length, complete: false, reason: '部分记录缺少必需字段' };
  if (!items.length && expected !== 0) return { ...missing<T>(), total: expected };
  const complete = expected === null ? null : expected === items.length;
  return { status: complete ? 'ok' : 'partial', items, total: expected, returnedCount: items.length, complete };
}
function shareholder(source: Source, v: unknown): Shareholder | null {
  const p = object(v);
  if (source === 'shuidi') {
    const stock = object(p.stock);
    const name = text(stock.stock_name ?? p.name);
    if (!name) return null;
    const rawRatio = text(p.stock_proportion ?? p.ownershipRatioText);
    const pays = Array.isArray(p.pays) ? p.pays : [];
    const firstPay = object(pays[0]);
    const subMoney = firstPay.stock_capital ? `${firstPay.stock_capital}${firstPay.stock_unit ?? '万元'}` : (p.stock_capital_num ? `${p.stock_capital_num}万元` : p.subMoney);
    const realMoney = p.stock_realcapital_num && p.stock_realcapital_num !== '-' ? p.stock_realcapital_num : p.realMoney;
    return { id: text(stock.digest ?? p.id), name, ownershipRatio: ratio(rawRatio), ownershipRatioText: rawRatio,
      subscribedCapital: money(subMoney), paidInCapital: money(realMoney),
      subscribedAt: date(firstPay.stock_date ?? p.stock_date ?? p.subscribedAt), kind: text(p.stock_type ?? p.kind) };
  }
  if (source === 'qixinbao') {
    const name = text(p.stockName ?? p.name);
    if (!name) return null;
    const rawRatio = text(p.percent ?? p.stock_proportion ?? p.ownershipRatioText);
    return { id: text(p.eid || p.pid || p.id), name, ownershipRatio: ratio(rawRatio), ownershipRatioText: rawRatio,
      subscribedCapital: money(p.shouldCapi ?? p.subMoney ?? p.subscribedCapital),
      paidInCapital: money(p.realCapi ?? p.realMoney ?? p.paidInCapital),
      subscribedAt: date(p.shoudDate ?? p.subDate ?? p.subscribedAt), kind: text(p.stockType ?? p.kind) };
  }
  const qcc = source === 'qichacha';
  const name = text(qcc ? p.StockName : p.name);
  if (!name) return null;
  const rawRatio = qcc ? p.StockPercent : p.subRate;
  return { id: text(qcc ? p.KeyNo : p.stockId ?? p.pid), name, ownershipRatio: ratio(rawRatio), ownershipRatioText: text(rawRatio),
    subscribedCapital: money(qcc ? p.ShouldCapi : p.subMoney), paidInCapital: money(qcc ? p.RealCapi : p.realMoney),
    subscribedAt: qccDate(qcc ? p.ShoudDate : p.subDate), kind: text(qcc ? p.StockType : p.shareholderType) };
}
// 两个平台都把多个职务合在一个字符串里（如 "经理,董事"），按常见分隔符拆分并去重。
function positions(value: unknown): string[] {
  return [...new Set(stringList(value).flatMap(v => v.split(/[,，、;；/]/)).map(v => v.trim()).filter(Boolean))];
}
function person(source: Source, v: unknown): Person | null {
  const p = object(v);
  const name = text(source === 'qichacha' ? p.Name : source === 'shuidi' ? p.employee_name ?? p.name : p.name);
  return name ? { id: text(source === 'qichacha' ? p.KeyNo : source === 'shuidi' ? p.name_id ?? p.id : p.pid ?? p.personId ?? p.id), name,
    positions: positions(source === 'qichacha' ? p.Job : source === 'shuidi' ? p.position : p.title ?? p.job ?? p.position) } : null;
}
function related(source: Source, v: unknown): RelatedCompany | null {
  const p = object(v);
  if (source === 'shuidi') {
    const name = text(p.branch_name ?? p.company_name ?? p.name);
    return name ? { id: text(p.digest ?? p.id), name, status: text(p.company_status ?? p.status),
      legalRepresentative: text(p.legal_person ?? p.legalRepresentative), ownershipRatio: ratio(p.ownershipRatio) } : null;
  }
  if (source === 'qixinbao') {
    const name = text(p.name);
    return name ? { id: text(p.eid ?? p.id), name, status: text(p.status),
      legalRepresentative: text(p.operName ?? p.legalRepresentative), ownershipRatio: ratio(p.stock_percentage ?? p.percent ?? p.ownershipRatio) } : null;
  }
  const qcc = source === 'qichacha', name = text(qcc ? p.Name : p.entName);
  return name ? { id: text(qcc ? p.KeyNo : p.pid), name, status: text(qcc ? p.Status : p.openStatus),
    legalRepresentative: text(qcc ? p.OperName : p.legalPerson), ownershipRatio: ratio(qcc ? p.StockPercent : p.subRate) } : null;
}
function annual(v: unknown): AnnualReport | null {
  const p = object(v);
  if (p.x !== undefined) {
    const year = String(p.x);
    return { year, title: `${year}年度报告`, url: null };
  }
  const title = text(p.reportYear ?? p.name ?? p.title);
  if (!title) return null;
  let url: string | null = null;
  if (typeof p.link === 'string') {
    try { const parsed = new URL(p.link, 'https://aiqicha.baidu.com'); if (parsed.origin === 'https://aiqicha.baidu.com' && !parsed.username && !parsed.password) url = parsed.href; } catch { /* 无效链接不传播 */ }
  }
  return { year: title.match(/(?:19|20)\d{2}/)?.[0] ?? null, title, url };
}
function changeRecord(v: unknown): ChangeRecord | null {
  const p = object(v);
  return { changedAt: date(p.date ?? p.change_date ?? p.changedAt), item: text(p.item ?? p.change_type ?? p.change_field),
    before: text(p.before ?? p.content_before), after: text(p.after ?? p.content_after) };
}
export function companyModules(source: Source, raw: unknown, detail: boolean): CompanyModules {
  const notRequested = <T>() => missing<T>('not_requested', '搜索结果不加载此模块');
  const absent = <T>() => detail ? missing<T>() : notRequested<T>();
  const result: CompanyModules = { shareholders: absent<Shareholder>(), people: absent<Person>(), investments: absent<RelatedCompany>(),
    branches: absent<RelatedCompany>(), changes: absent<ChangeRecord>(), annualReports: absent<AnnualReport>() };
  if (!detail || source === 'tianyancha') return result;
  const p = object(raw);
  if (source === 'qichacha') {
    const counts = object(p.CountInfo);
    result.shareholders = moduleOf(p.Partners, counts.PartnersCount, v => shareholder(source, v));
    result.people = moduleOf(p.Employees, counts.EmployeesCount, v => person(source, v));
    result.branches = moduleOf(p.Branches, counts.BranchCount, v => related(source, v));
    return result;
  }
  if (source === 'shuidi') {
    const partners = object(p.partners), employees = object(p.employees);
    const branches = object(p.branches), annualReports = object(p.annualReports), changes = object(p.changes);
    result.shareholders = moduleOf(partners.data ?? p.partnersList, partners.total ?? p.partnersCount, v => shareholder(source, v));
    result.people = moduleOf(employees.data ?? p.employeesList, employees.total ?? p.employeesCount, v => person(source, v));
    result.branches = moduleOf(branches.data ?? p.branchesList, branches.total ?? p.branchesCount, v => related(source, v));
    result.annualReports = moduleOf(annualReports.data ?? p.annualReportsList, annualReports.total ?? p.annualReportsCount, annual);
    result.changes = moduleOf(changes.data ?? p.changesList, changes.total ?? p.changesCount, changeRecord);
    return result;
  }
  if (source === 'qixinbao') {
    const partnerInfo = object(p.partnerInfo);
    const employeeInfo = object(p.employeeInfo);
    const branchInfo = object(p.branchInfo);
    const changeRecordInfo = object(p.changeRecordInfo);
    const yearReport = object(p.yearReport);
    const investInfo = object(p.investInfo);

    result.shareholders = moduleOf(partnerInfo.items ?? p.shareholders, partnerInfo.total ?? p.shareholdersCount, v => shareholder(source, v));
    result.people = moduleOf(employeeInfo.items ?? p.employees, employeeInfo.total ?? p.employeesCount, v => person(source, v));
    result.branches = moduleOf(branchInfo.items ?? p.branches, branchInfo.total ?? p.branchesCount, v => related(source, v));
    result.annualReports = moduleOf(yearReport.items ?? p.annualReports, yearReport.total ?? p.annualReportsCount, annual);
    result.changes = moduleOf(changeRecordInfo.items ?? p.changes, changeRecordInfo.total ?? p.changesCount, changeRecord);
    result.investments = moduleOf(investInfo.items ?? p.investments, investInfo.total ?? p.investmentsCount, v => related(source, v));
    return result;
  }
  const block = <T>(key: string, mapper: (v: unknown) => T | null): DataModule<T> => {
    const b = object(p[key]);
    const limit = object(b.limitForward);
    // 不推测未知枚举。明示登录/权限错误才标记拒绝，其余空列表保持 not_returned。
    const denied = /会员|权限|登录|vip|login/i.test(String(first(limit, ['message', 'msg']) ?? ''));
    let value = moduleOf(b.list, b.total, mapper, denied);
    if (!denied && Object.keys(limit).length && (!Array.isArray(b.list) || b.list.length === 0)) {
      value = { ...missing<T>(), total: total(b.total), reason: '上游附带权限控制信息且未返回明细，未将其判断为无记录' };
    }
    if (Object.keys(limit).length) value.restriction = { code: text(limit.limitStatus), message: text(first(limit, ['message', 'msg'])) };
    value.sourceVariant = text(b.nowType);
    return value;
  };
  result.shareholders = block('shareholdersData', v => shareholder(source, v));
  result.people = block('directorsData', v => person(source, v));
  result.branches = block('branchsData', v => related(source, v));
  result.annualReports = block('annualReportData', annual);
  // 投资/变更块在全部实测样本中没有明细，未确认字段语义时不臆造映射。
  const pending = <T>(key: string, label: string): DataModule<T> => {
    const b = object(p[key]), limit = object(b.limitForward);
    const message = text(first(limit, ['message', 'msg']));
    const denied = /会员|权限|登录|vip|login/i.test(message ?? '');
    return { ...missing<T>(), total: total(b.total), reason: `${label}明细映射尚未通过联网验证`,
      ...(denied ? { status: 'access_denied' as const, complete: false, reason: '上游明确返回访问限制' } : {}),
      ...(Object.keys(limit).length ? { restriction: { code: text(limit.limitStatus), message: text(first(limit, ['message', 'msg'])) } } : {}) };
  };
  result.investments = pending<RelatedCompany>('investRecordData', '投资');
  result.changes = pending<ChangeRecord>('changeRecordData', '变更');
  return result;
}
