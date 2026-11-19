import { test } from 'node:test';
import assert from 'node:assert/strict';
import { HttpClient, businessError, readBody, MAX_BODY_BYTES } from '../src/http.js';
import { Tianyancha, tycHeaders } from '../src/providers/tianyancha.js';
import { Aiqicha, decodeDdw } from '../src/providers/aiqicha.js';
import { Qichacha, signQcc } from '../src/providers/qichacha.js';
import { BrowserQccTransport } from '../src/cdp.js';
import { CorpixError } from '../src/errors.js';
const code = (expected: string) => (e: unknown) => e instanceof CorpixError && e.code === expected;
const json = (data: unknown, status = 200) => new Response(JSON.stringify(data), { status });

test('天眼查请求包含查询词、分页及 Cookie 映射，并过滤非企业卡片', async () => {
  const http = new HttpClient(1000, async (url, init) => {
    assert.equal(String(url), 'https://capi.tianyancha.com/cloud-tempest/web/searchCompanyV4');
    assert.equal(init?.redirect, 'manual');
    const body = JSON.parse(String(init?.body));
    assert.equal(JSON.parse(body.filterJson).word.items[0].value, '示例');
    assert.equal(body.pageNum, 1);
    assert.equal(new Headers(init?.headers).get('X-AUTH-TOKEN'), 'test-only');
    return json({ state: 'ok', data: { companyTotal: 1, companyList: [
      { id: null, contentType: 2 }, { id: 123, name: '<em>示例</em>企业', regCapital: '100万元', estiblishTime: 0 }
    ] } });
  });
  const out = await new Tianyancha(http, 'auth_token=test-only').search({ keyword: '示例', page: 1, pageSize: 20 });
  assert.equal(out.companies.length, 1);
  assert.equal(out.companies[0]?.name, '示例企业');
  assert.equal(out.companies[0]?.establishedAt, null);
  assert.equal(out.pagination.total, 1);
  assert.equal(tycHeaders('auth_token=a=b; TYCID=device')['X-AUTH-TOKEN'], 'a=b');
});

test('天眼查登录限制和响应结构变化不会变成空结果', async () => {
  const input = { keyword: '示例', page: 2, pageSize: 20 };
  const blocked = new Tianyancha(new HttpClient(1000, async () => json({ state: 'warn', special: 'mustlogin' })));
  await assert.rejects(blocked.search(input), code('AUTH_REQUIRED'));
  const changed = new Tianyancha(new HttpClient(1000, async () => json({ state: 'ok', data: {} })));
  await assert.rejects(changed.search(input), code('PARSE_ERROR'));
});

test('DDW 递归还原数字，保留键、布尔和空值，拒绝未知编码', () => {
  assert.deepEqual(decodeDdw({ id: '456789', money: -45.67, nested: [true, null, '测试4'] }, 1),
    { id: '547698', money: -54.76, nested: [true, null, '测试5'] });
  assert.equal(decodeDdw('456789', 2), '689457');
  assert.equal(decodeDdw(4e-7, 1), 5e-7);
  assert.equal(decodeDdw(4e-30, 1), 5e-30);
  assert.equal(decodeDdw(4e21, 1), 5e21);
  assert.throws(() => decodeDdw({}, 3), code('PARSE_ERROR'));
});

test('爱企查只解码 data，正常状态码保留，结果不会被截断', async () => {
  const scope = '测试经营范围'.repeat(3000);
  const provider = new Aiqicha(new HttpClient(1000, async (url, init) => {
    assert.ok(String(url).endsWith('?pid=12345'));
    assert.equal(new Headers(init?.headers).get('referer'), 'https://aiqicha.baidu.com/company_detail_12345');
    return json({ status: 0, ddw: 1, data: { basicData: { entName: '示例企业', regCapital: '45万元', scope } } });
  }), 'BAIDUID=synthetic-only');
  const out = await provider.detail('12345');
  assert.equal(out.companies[0]?.id, '12345');
  assert.equal(out.companies[0]?.registeredCapital, '54万元');
  assert.equal(out.companies[0]?.businessScope, scope);
  assert.equal((out.raw as { status: number }).status, 0);
  await assert.rejects(new Aiqicha(new HttpClient()).search({ keyword: '示例', page: 1, pageSize: 20 }), code('NOT_CONFIGURED'));
});

test('爱企查 slug 只接受同源数字详情跳转', async () => {
  let calls = 0;
  const provider = new Aiqicha(new HttpClient(1000, async () => {
    calls++;
    return calls === 1 ? new Response('', { status: 301, headers: { location: '/company_detail_123' } })
      : json({ status: 0, data: { basicData: { entName: '示例企业' } } });
  }), 'BAIDUID=test-only');
  assert.equal((await provider.detail('test-slug')).companies[0]?.id, '123');
  const evil = new Aiqicha(new HttpClient(1000, async () => new Response('', { status: 302, headers: { location: 'https://evil.example/company_detail_123' } })), 'BAIDUID=test-only');
  await assert.rejects(evil.detail('test-slug'), code('UPSTREAM_BLOCKED'));
  await assert.rejects(new Aiqicha(new HttpClient()).detail('123'), code('NOT_CONFIGURED'));
});

test('企查查签名匹配研究报告中的独立验证向量', () => {
  assert.equal(signQcc('/sns/getSearchDialogKeys', 'test').name, '36991e726b5e1a2cf6d9');
  assert.equal(signQcc('/auth/qrcode-create', 'test').name, 'f4ec434ded64269e8457');
  assert.notEqual(signQcc('/sns/getSearchDialogKeys', 'a').value, signQcc('/sns/getSearchDialogKeys', 'b').value);
});

test('企查查搜索和裸详情分别归一化，不把工商 Status 当作协议状态', async () => {
  const id = 'a'.repeat(32);
  const provider = new Qichacha({ async request(path, method, body, query) {
    if (method === 'POST') {
      assert.equal(path, '/search/searchMulti');
      assert.deepEqual(body, { searchKey: '示例', pageIndex: 1, pageSize: 10 });
      return { Status: 200, Result: [{ KeyNo: id, Name: '<em>示例</em>企业', OperName: '示例法人' }], Paging: { TotalRecords: 1 } };
    }
    assert.equal(query, `keyNo=${id}`);
    return { KeyNo: id, Name: '示例企业', Status: '存续', Oper: { Name: '示例法人' } };
  } });
  assert.equal((await provider.search({ keyword: '示例', page: 1, pageSize: 10 })).companies[0]?.name, '示例企业');
  const out = await provider.detail(id);
  assert.equal(out.companies[0]?.registrationStatus, '存续');
  assert.equal(out.companies[0]?.legalRepresentative, '示例法人');
  await assert.rejects(provider.detail('invalid'), code('INVALID_INPUT'));
  const login = new Qichacha({ request: async () => ({ status: 409, message: '使用该功能需要用户登录' }) });
  await assert.rejects(login.detail(id), code('AUTH_REQUIRED'));
});

test('HTTP 层处理超时、验证页、限流和超大响应，错误不暴露原始凭据', async () => {
  await assert.rejects(new HttpClient(100, async () => { throw new DOMException('cookie=secret', 'TimeoutError'); }).json('https://test.example'), code('UPSTREAM_TIMEOUT'));
  await assert.rejects(new HttpClient(100, async () => new Response('<html>captcha</html>')).json('https://test.example'), code('UPSTREAM_BLOCKED'));
  await assert.rejects(new HttpClient(100, async () => json({}, 429)).json('https://test.example'), code('RATE_LIMITED'));
  await assert.rejects(readBody(new Response('x'.repeat(MAX_BODY_BYTES + 1))), code('PARSE_ERROR'));
  assert.throws(() => businessError({ msg: '会员权限不足' }), code('ACCESS_DENIED'));
  assert.throws(() => businessError({ message: '请求过于频繁' }), code('RATE_LIMITED'));
});

test('CDP 未配置、非本机地址和错误域名页面均明确失败', async () => {
  await assert.rejects(new BrowserQccTransport('', 100).request('/company/getDetail', 'GET'), code('NOT_CONFIGURED'));
  await assert.rejects(new BrowserQccTransport('http://remote.example:9222', 100).request('/company/getDetail', 'GET'), code('NOT_CONFIGURED'));
  const http = new HttpClient(100, async () => json([{ type: 'page', url: 'https://www.qcc.com.evil.example/' }]));
  await assert.rejects(new BrowserQccTransport('http://127.0.0.1:9222', 100, http).request('/company/getDetail', 'GET'), code('AUTH_REQUIRED'));
});
