import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildApp } from '../src/app.js';
import { loadConfig } from '../src/config.js';
import { CorpixError } from '../src/errors.js';
import { compareCompanies } from '../src/lookup.js';
import { sources, result, type Company, type Provider, type SearchInput, type Source } from '../src/types.js';

const NAME = '示例软件有限公司', CODE = '91350100000000000X';
const company = (source: Source, id: string, over: Partial<Company> = {}): Company => ({
  source, id, name: NAME, creditCode: CODE, legalRepresentative: '合成法人', registrationStatus: '存续',
  registeredCapital: '100万人民币', establishedAt: '2020-01-01', address: '合成地址', businessScope: null,
  sourceUrl: `https://example.test/${id}`, ...over });
type Behaviour = { search?: Company[] | Error; detail?: Company | Error };
function setup(behaviour: Partial<Record<Source, Behaviour>>, env: Record<string, string> = { QCC_COOKIE: 'c', AQC_COOKIE: 'c' }) {
  const calls: string[] = [];
  const providers = Object.fromEntries(sources.map(source => [source, { source,
    async search(_input: SearchInput) {
      calls.push(`${source}:search`);
      const b = behaviour[source]?.search ?? [company(source, `${source}-1`)];
      if (b instanceof Error) throw b;
      return result(source, b, {});
    },
    async detail(id: string) {
      calls.push(`${source}:detail:${id}`);
      const b = behaviour[source]?.detail ?? company(source, id, { basic: undefined });
      if (b instanceof Error) throw b;
      return result(source, [b], {});
    }
  } satisfies Provider])) as Record<Source, Provider>;
  return { options: { providers, config: loadConfig(env) }, calls };
}
const post = (payload: object) => ({ method: 'POST' as const, url: '/api/v1/lookup', payload: payload as Record<string, unknown> });

test('fallback 按顺序查询，前一个平台失败或未命中时自动换下一个', async t => {
  const { options, calls } = setup({
    qichacha: { search: new CorpixError('AUTH_REQUIRED', '企查查会话需要重新登录', 409) },
    aiqicha: { search: [company('aiqicha', 'a1', { name: '示例软件有限公司北京分公司' })] }
  });
  const app = await buildApp(options); t.after(() => app.close());
  const r = await app.inject(post({ keyword: NAME }));
  assert.equal(r.statusCode, 200);
  const body = r.json();
  assert.equal(body.source, 'tianyancha');
  assert.equal(body.company.name, NAME);
  assert.equal(body.matchBy, 'name');
  assert.deepEqual(body.attempts.map((a: { status: string }) => a.status), ['error', 'not_found', 'ok']);
  assert.equal(body.attempts[0].error.code, 'AUTH_REQUIRED');
  // 分公司不是精确命中，不应拉取其详情
  assert.ok(!calls.some(c => c.startsWith('aiqicha:detail')));
});

test('fallback 第一个成功即返回，跳过未配置的平台，可自定义顺序', async t => {
  const { options, calls } = setup({}, {});
  const app = await buildApp(options); t.after(() => app.close());
  const body = (await app.inject(post({ keyword: NAME }))).json();
  assert.equal(body.source, 'tianyancha');
  assert.deepEqual(body.attempts.map((a: { status: string }) => a.status), ['skipped', 'skipped', 'ok']);
  assert.equal(body.attempts[0].error.code, 'NOT_CONFIGURED');
  assert.ok(!calls.some(c => c.startsWith('qichacha')));
  const ordered = setup({});
  const app2 = await buildApp(ordered.options); t.after(() => app2.close());
  const b2 = (await app2.inject(post({ keyword: NAME, sources: ['aiqicha', 'qichacha'] }))).json();
  assert.equal(b2.source, 'aiqicha');
  assert.equal(b2.attempts.length, 1);
  assert.ok(!ordered.calls.some(c => c.startsWith('qichacha') || c.startsWith('tianyancha')));
});

test('精确匹配：名称忽略全角半角括号，信用代码在详情阶段二次核对', async t => {
  const { options } = setup({
    qichacha: { search: [company('qichacha', 'q0', { name: '示例（北京）软件有限公司分公司' }), company('qichacha', 'q1', { name: '示例（北京）软件有限公司' })] }
  });
  const app = await buildApp(options); t.after(() => app.close());
  const byName = (await app.inject(post({ keyword: '示例(北京)软件有限公司' }))).json();
  assert.equal(byName.company.id, 'q1');
  const code = setup({
    qichacha: { search: [company('qichacha', 'q1', { creditCode: null })], detail: company('qichacha', 'q1', { creditCode: '91350100000000001X' }) },
    aiqicha: { search: [company('aiqicha', 'a1', { creditCode: CODE.toLowerCase() })] }
  });
  const app2 = await buildApp(code.options); t.after(() => app2.close());
  const byCode = (await app2.inject(post({ keyword: CODE.toLowerCase() }))).json();
  assert.equal(byCode.matchBy, 'creditCode');
  assert.equal(byCode.source, 'aiqicha');
  assert.equal(byCode.attempts[0].status, 'not_found');
});

test('全部失败时返回统一错误格式并附每个平台的尝试记录', async t => {
  const err = () => new CorpixError('UPSTREAM_BLOCKED', '上游要求浏览器验证');
  const failing = setup({ qichacha: { search: err() }, aiqicha: { search: [] }, tianyancha: { detail: err() }, shuidi: { search: err() }, qixinbao: { search: err() } });
  const app = await buildApp(failing.options); t.after(() => app.close());
  const r = await app.inject(post({ keyword: NAME }));
  assert.equal(r.statusCode, 502);
  assert.equal(r.json().error.code, 'UPSTREAM_ERROR');
  assert.equal(r.json().attempts.length, 5);
  const none = setup({ qichacha: { search: [] }, aiqicha: { search: [] }, tianyancha: { search: [] }, shuidi: { search: [] }, qixinbao: { search: [] } });
  const app2 = await buildApp(none.options); t.after(() => app2.close());
  const nf = await app2.inject(post({ keyword: NAME, strategy: 'all' }));
  assert.equal(nf.statusCode, 404);
  assert.equal(nf.json().error.code, 'NOT_FOUND');
  const unconfigured = setup({}, {});
  const app3 = await buildApp(unconfigured.options); t.after(() => app3.close());
  const nc = await app3.inject(post({ keyword: NAME, sources: ['qichacha', 'aiqicha'] }));
  assert.equal(nc.statusCode, 503);
  assert.equal(nc.json().error.code, 'NOT_CONFIGURED');
});

test('all 并行查询，按平台返回并对比字段，格式差异不算不一致', async t => {
  const { options } = setup({
    qichacha: { detail: company('qichacha', 'qichacha-1', { registeredCapital: '100万元', registrationStatus: '存续（在营、开业、在册）' }) },
    aiqicha: { search: new CorpixError('ACCESS_DENIED', '会员权限不足', 403) },
    tianyancha: { detail: company('tianyancha', 'tianyancha-1', { address: null }) },
    shuidi: { search: [] },
    qixinbao: { search: [] }
  });
  const app = await buildApp(options); t.after(() => app.close());
  const body = (await app.inject(post({ keyword: NAME, strategy: 'all' }))).json();
  assert.deepEqual(Object.keys(body.results).sort(), ['qichacha', 'tianyancha']);
  assert.equal(body.attempts.find((a: { source: string }) => a.source === 'aiqicha').error.code, 'ACCESS_DENIED');
  assert.ok(body.comparison.consistentFields.includes('registeredCapital'));
  assert.ok(body.comparison.consistentFields.includes('address'), '一方缺失不算矛盾');
  assert.ok(body.comparison.differingFields.includes('registrationStatus'));
  assert.deepEqual(body.comparison.fields.registrationStatus.values, { qichacha: '存续（在营、开业、在册）', tianyancha: '存续' });
});

test('对比规范化：括号、千分位金额、参保人数"人"后缀', () => {
  const basic = (over: Record<string, unknown>) => ({ companyType: null, industry: null, registrationNumber: null, organizationCode: null,
    taxNumber: null, paidInCapital: null, registrationAuthority: null, approvedAt: null, businessTerm: null, employeeScale: null,
    insuredEmployees: null, formerNames: [], phones: [], emails: [], websites: [], ...over });
  const c = compareCompanies({
    tianyancha: company('tianyancha', '1', { registeredCapital: '4114113.182万人民币', basic: basic({ companyType: '有限责任公司（法人独资）', insuredEmployees: '148', paidInCapital: '20万人民币' }) }),
    aiqicha: company('aiqicha', '2', { registeredCapital: '4,114,113.182万(元)', basic: basic({ companyType: '有限责任公司(法人独资)', insuredEmployees: '148人', paidInCapital: '30万(元)' }) })
  });
  for (const f of ['registeredCapital', 'basic.companyType', 'basic.insuredEmployees']) assert.ok(c.consistentFields.includes(f), f);
  assert.ok(c.differingFields.includes('basic.paidInCapital'));
});

test('lookup 拒绝非法策略、重复平台和额外字段，不调用上游', async t => {
  const { options, calls } = setup({});
  const app = await buildApp(options); t.after(() => app.close());
  for (const payload of [{ keyword: NAME, strategy: 'random' }, { keyword: NAME, sources: ['qichacha', 'qichacha'] },
    { keyword: NAME, sources: [] }, { keyword: '  ' }, { keyword: NAME, cookie: 'x' }]) {
    assert.equal((await app.inject(post(payload))).statusCode, 400, JSON.stringify(payload));
  }
  assert.equal(calls.length, 0);
});
