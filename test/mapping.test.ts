import { test } from 'node:test';
import assert from 'node:assert/strict';
import { basicDetails, money, ratio } from '../src/mapping.js';
import { companyModules } from '../src/modules.js';
import { normalizeQcc } from '../src/providers/qichacha.js';
import { Aiqicha } from '../src/providers/aiqicha.js';
import { HttpQccTransport, parseQccState } from '../src/qcc-http.js';
import { HttpClient } from '../src/http.js';
import { CorpixError } from '../src/errors.js';
import { date } from '../src/types.js';
const code = (expected: string) => (e: unknown) => e instanceof CorpixError && e.code === expected;

test('归一金额保留币种单位和精度，比例不猜测无单位百分数', () => {
  assert.deepEqual(money('1,234.5678万美元'), { text: '1,234.5678万美元', amount: '1234.5678', unit: '万', currency: 'USD' });
  assert.equal(money('未公示')?.amount, null);
  assert.equal(ratio('25%'), 0.25);
  assert.equal(ratio('0.25'), 0.25);
  assert.equal(ratio('25'), null);
  assert.equal(ratio('未知'), null);
});

test('工商映射提取扩展字段与官网 URL，不把网站名称当作链接', () => {
  const basic = basicDetails('qichacha', { RecCap: '20万元', Industry: { SubIndustry: '软件开发' },
    OriginalName: [{ Name: '旧企业名' }], ContactInfo: { WebSite: [{ Name: '示例官网', Url: 'https://example.test' }], Email: 'a@example.test' } });
  assert.equal(basic.paidInCapital, '20万元');
  assert.equal(basic.industry, '软件开发');
  assert.deepEqual(basic.formerNames, ['旧企业名']);
  assert.deepEqual(basic.websites, ['https://example.test']);
});

test('企查查详情的秒时间戳与毫秒时间戳均正确，股东与人员可归一化', () => {
  const data = { KeyNo: 'a'.repeat(32), Name: '示例', StartDate: 1609459200,
    Partners: [{ StockName: '合成股东', StockPercent: '25%', ShouldCapi: '20万元', ShoudDate: 1609459200 }],
    Employees: [{ Name: '合成人员', Job: '董事' }], CountInfo: { PartnersCount: 2, EmployeesCount: 1, BranchCount: 0 }, Branches: [] };
  const a = normalizeQcc(data, true), b = normalizeQcc({ ...data, StartDate: 1609459200000 }, true);
  assert.equal(a.establishedAt, '2021-01-01');
  assert.equal(a.establishedAt, b.establishedAt);
  assert.equal(a.modules?.shareholders.status, 'partial');
  assert.equal(a.modules?.shareholders.complete, false);
  assert.equal(a.modules?.shareholders.items[0]?.ownershipRatio, 0.25);
  assert.equal(a.modules?.shareholders.items[0]?.subscribedAt, a.establishedAt);
  assert.equal(a.modules?.people.status, 'ok');
  assert.equal(a.modules?.branches.status, 'ok');
  assert.equal(a.modules?.branches.total, 0);
});

test('模块区分未请求、未返回、受限、结构变化和明确无记录', () => {
  assert.equal(companyModules('aiqicha', {}, false).people.status, 'not_requested');
  assert.equal(companyModules('tianyancha', {}, true).shareholders.status, 'not_returned');
  const blocked = companyModules('aiqicha', { shareholdersData: { list: [], total: 0, limitForward: { message: '需会员权限' } } }, true);
  assert.equal(blocked.shareholders.status, 'access_denied');
  assert.equal(companyModules('aiqicha', { shareholdersData: { limitForward: { message: '无权限' } } }, true).shareholders.status, 'access_denied');
  const ambiguous = companyModules('aiqicha', { shareholdersData: { list: [], total: 0, limitForward: { limitStatus: 99 } } }, true);
  assert.equal(ambiguous.shareholders.status, 'not_returned');
  assert.equal(ambiguous.shareholders.restriction?.code, '99');
  const broken = companyModules('aiqicha', { shareholdersData: { list: [{ unexpected: true }], total: 1 } }, true);
  assert.equal(broken.shareholders.status, 'parse_error');
  assert.equal(broken.shareholders.returnedCount, 0);
  assert.equal(companyModules('aiqicha', { branchsData: { list: [], total: 0 } }, true).branches.status, 'ok');
});

test('爱企查首屏年报只归一年份索引，并识别分支机构截断', () => {
  const data = companyModules('aiqicha', {
    shareholdersData: { list: [{ name: '合成股东', subRate: '10%', subMoney: '未公示' }], total: 1, nowType: 3 },
    annualReportData: { list: [{ name: '示例企业2024年度报告', link: '/annual_report_test' }], total: 3 },
    branchsData: { list: [{ entName: '示例分公司', pid: '123', legalPerson: '负责人' }], total: 12 }
  }, true);
  assert.equal(data.annualReports.status, 'partial');
  assert.equal(data.annualReports.items[0]?.year, '2024');
  assert.equal(data.annualReports.items[0]?.url, 'https://aiqicha.baidu.com/annual_report_test');
  assert.equal(data.branches.complete, false);
  assert.equal(data.branches.items[0]?.legalRepresentative, '负责人');
  assert.equal(data.shareholders.sourceVariant, '3');
  assert.equal(data.shareholders.items[0]?.subscribedCapital?.amount, null);
});

test('企查查页面解析不执行脚本，正确处理字符串中的括号与转义', () => {
  const value = { company: { companyDetail: { Name: '测试 } \\" 企业', KeyNo: 'a'.repeat(32) } } };
  const page = '<script>window.__INITIAL_STATE__=' + JSON.stringify(value) + ';globalThis.pwned=true</script>';
  assert.deepEqual(parseQccState(page), value);
  assert.equal('pwned' in globalThis, false);
  assert.throws(() => parseQccState('<title>安全验证</title>'), code('UPSTREAM_BLOCKED'));
  assert.throws(() => parseQccState('<title>会员登录</title>'), code('AUTH_REQUIRED'));
  assert.throws(() => parseQccState('<script>window.__INITIAL_STATE__={foo:1}</script>'), code('PARSE_ERROR'));
});

test('企查查 HTTP 会话更新 Cookie，固定源站端点，不跟随跳转或静默回退', async () => {
  let calls = 0;
  const http = new HttpClient(1000, async (url, init) => {
    calls++;
    const headers = new Headers(init?.headers);
    assert.equal(init?.redirect, 'manual');
    assert.equal(new URL(String(url)).origin, 'https://www.qcc.com');
    if (calls === 1) return new Response("<script>window.pid='synthetic-pid';window.tid='synthetic-tid';</script>", { headers: { 'set-cookie': 'session=updated; Domain=.qcc.com; Secure; Path=/' } });
    assert.match(headers.get('cookie') ?? '', /session=updated/);
    assert.equal(headers.get('x-pid'), 'synthetic-pid');
    assert.deepEqual(JSON.parse(String(init?.body)), { searchKey: '示例', pageIndex: 1, pageSize: 10 });
    return Response.json({ Status: 200, Result: [] });
  });
  const transport = new HttpQccTransport(http, 'session=synthetic');
  assert.deepEqual(await transport.request('/search/searchMulti', 'POST', { searchKey: '示例', pageIndex: 1, pageSize: 10 }), { Status: 200, Result: [] });
  await assert.rejects(transport.request('/auth/other', 'GET'), code('INVALID_INPUT'));
  await assert.rejects(new HttpQccTransport(new HttpClient(1000, async () => new Response('', { status: 302, headers: { location: 'https://evil.example' } })), 'session=synthetic')
    .request('/search/searchMulti', 'POST', { searchKey: '示例', pageIndex: 1, pageSize: 10 }), code('UPSTREAM_BLOCKED'));
});

test('企查查 HTTP 详情拒绝企业标识错配和无效 ID', async () => {
  const transport = new HttpQccTransport(new HttpClient(1000, async () => new Response('<script>window.__INITIAL_STATE__=' + JSON.stringify({ company: { companyDetail: { KeyNo: 'b'.repeat(32), Name: '示例' } } }) + '</script>')), 'session=synthetic');
  await assert.rejects(transport.request('/company/getDetail', 'GET', undefined, 'keyNo=' + 'a'.repeat(32)), code('PARSE_ERROR'));
  await assert.rejects(transport.request('/company/getDetail', 'GET', undefined, 'keyNo=../../other'), code('INVALID_INPUT'));
});

test('爱企查搜索解码数据但保留协议状态，处理别名并识别权限错误', async () => {
  const provider = new Aiqicha(new HttpClient(1000, async (url, init) => {
    const parsed = new URL(String(url));
    assert.equal(parsed.pathname, '/s/advanceFilterAjax');
    assert.equal(parsed.searchParams.get('q'), '示例');
    assert.equal(parsed.searchParams.get('p'), '2');
    assert.equal(new Headers(init?.headers).get('cookie'), 'synthetic-only');
    return Response.json({ status: 0, ddw: 1, data: { resultList: [{ pid: '45', entName: '<em>示例</em>', regCap: '45万元', domicile: '测试地址', validityFrom: '2020-01-01' }], totalNumFound: 45 } });
  }), 'synthetic-only');
  const out = await provider.search({ keyword: '示例', page: 2, pageSize: 10 });
  assert.equal(out.companies[0]?.id, '54');
  assert.equal(out.companies[0]?.registeredCapital, '54万元');
  assert.equal(out.companies[0]?.address, '测试地址');
  assert.equal(out.pagination.total, 54);
  assert.equal((out.raw as { status: number }).status, 0);
  const denied = new Aiqicha(new HttpClient(1000, async () => Response.json({ status: 1, msg: '权限不足' })), 'synthetic-only');
  await assert.rejects(denied.search({ keyword: '示例', page: 1, pageSize: 10 }), code('ACCESS_DENIED'));
});

test('工商日期统一为中国本地日历日，字符串日期规范化，无法识别的原文保留', () => {
  // 北京时间 2000-01-01 00:00，UTC 下仍是 1999-12-31。
  assert.equal(date(946656000000), '2000-01-01');
  assert.equal(date(-315648000000), '1960-01-01');
  assert.equal(date(0), null);
  assert.equal(date('2000-1-5'), '2000-01-05');
  assert.equal(date('2000年01月05日'), '2000-01-05');
  assert.equal(date('2000/01/05 00:00:00'), '2000-01-05');
  assert.equal(date('无固定期限'), '无固定期限');
});
