import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildApp } from '../src/app.js';
import { loadConfig } from '../src/config.js';
import { CorpixError } from '../src/errors.js';
import { sources, result, type Provider, type Source } from '../src/types.js';
function setup(rate = 100) {
  let calls = 0;
  const providers = Object.fromEntries(sources.map(source => [source, { source,
    async search(input) { calls++; assert.equal(input.keyword, '示例'); return result(source, [], { privateResponse: true }); },
    async detail(id) { calls++; if (id === 'fail') throw new CorpixError('AUTH_REQUIRED', '请登录上游', 409); return result(source, [], { privateResponse: true }); }
  } satisfies Provider])) as Record<Source, Provider>;
  return { providers, config: loadConfig({ API_KEY: 'test-api-key', RATE_LIMIT_PER_MINUTE: String(rate) }), calls: () => calls };
}
const headers = { authorization: 'Bearer test-api-key' };

test('健康检查公开，API 必须鉴权，不匹配时不调用上游', async t => {
  const options = setup(), app = await buildApp(options); t.after(() => app.close());
  assert.equal((await app.inject('/health')).statusCode, 200);
  assert.equal((await app.inject('/api/v1/sources')).statusCode, 401);
  assert.equal((await app.inject({ url: '/api/v1/sources', headers })).statusCode, 200);
  assert.equal(options.calls(), 0);
});

test('API 设置默认分页、修剪查询词，raw 仅显式请求时返回', async t => {
  const app = await buildApp(setup()); t.after(() => app.close());
  const a = await app.inject({ method: 'POST', url: '/api/v1/search', headers, payload: { source: 'tianyancha', keyword: ' 示例 ' } });
  assert.equal(a.statusCode, 200);
  assert.equal(a.json().raw, undefined);
  assert.equal(a.headers['cache-control'], 'no-store');
  const b = await app.inject({ url: '/api/v1/companies/aiqicha/123?raw=true', headers });
  assert.deepEqual(b.json().raw, { privateResponse: true });
  const c = await app.inject({ url: '/api/v1/companies/aiqicha/123?raw=false', headers });
  assert.equal(c.json().raw, undefined);
});

test('拒绝未知平台、空查询、非法分页、额外字段和客户端凭据', async t => {
  const options = setup(), app = await buildApp(options); t.after(() => app.close());
  for (const payload of [
    { source: 'other', keyword: '示例' }, { source: 'tianyancha', keyword: '   ' },
    { source: 'tianyancha', keyword: '示例', page: 0 }, { source: 'tianyancha', keyword: '示例', pageSize: 100 },
    { source: 'tianyancha', keyword: '示例', cookie: 'secret' }
  ]) assert.equal((await app.inject({ method: 'POST', url: '/api/v1/search', headers, payload })).statusCode, 400);
  assert.equal((await app.inject({ url: '/api/v1/companies/other/123', headers })).statusCode, 400);
  assert.equal((await app.inject({ url: '/api/v1/companies/aiqicha/123?raw=maybe', headers })).statusCode, 400);
  assert.equal((await app.inject({ url: '/api/v1/companies/aiqicha/123?cookie=secret', headers })).statusCode, 400);
  assert.equal(options.calls(), 0);
});

test('返回稳定业务错误格式，并对接口限流', async t => {
  const app = await buildApp(setup(2)); t.after(() => app.close());
  const a = await app.inject({ url: '/api/v1/companies/qichacha/fail', headers });
  assert.equal(a.statusCode, 409);
  assert.equal(a.json().error.code, 'AUTH_REQUIRED');
  await app.inject({ url: '/api/v1/companies/aiqicha/123', headers });
  const limited = await app.inject({ url: '/api/v1/companies/aiqicha/123', headers });
  assert.equal(limited.statusCode, 429);
  assert.equal(limited.json().error.code, 'RATE_LIMITED');
  assert.equal((await app.inject('/health')).statusCode, 200);
});

test('对外监听要求密钥，环境变量拒绝非法值', () => {
  assert.throws(() => loadConfig({ HOST: '0.0.0.0' }), /API_KEY/);
  assert.throws(() => loadConfig({ PORT: '-1' }));
  assert.throws(() => loadConfig({ UPSTREAM_TIMEOUT_MS: 'NaN' }));
  assert.equal(loadConfig({ HOST: '0.0.0.0', API_KEY: 'key' }).host, '0.0.0.0');
});

test('来源能力与实际模式一致，配置状态不会泄露 Cookie', async t => {
  for (const cookie of ['synthetic-cookie', ''] as const) {
    const config = loadConfig({ QCC_COOKIE: cookie, AQC_COOKIE: 'synthetic-cookie' });
    const app = await buildApp({ config }); t.after(() => app.close());
    const response = await app.inject('/api/v1/sources');
    const list = response.json().sources;
    const qcc = list.find((s: { source: string }) => s.source === 'qichacha');
    assert.equal(qcc.mode, 'http');
    assert.equal(qcc.configured, Boolean(cookie));
    assert.equal(qcc.liveVerified, true);
    assert.equal(list.find((s: { source: string }) => s.source === 'aiqicha').search, true);
    assert.equal(qcc.modules.investments, 'not_returned');
    assert.doesNotMatch(response.body, /synthetic-cookie/);
  }
});
