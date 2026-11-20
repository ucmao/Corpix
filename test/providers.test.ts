import { test } from 'node:test';
import assert from 'node:assert/strict';
import { HttpClient, businessError, readBody, MAX_BODY_BYTES } from '../src/http.js';
import { Tianyancha, tycHeaders } from '../src/providers/tianyancha.js';
import { Aiqicha, decodeDdw } from '../src/providers/aiqicha.js';
import { Qichacha, signQcc } from '../src/providers/qichacha.js';
import { Shuidi, parseShuidiCards } from '../src/providers/shuidi.js';
import { Qixinbao, signQxb, extractQxbState, normalizeQxb } from '../src/providers/qixinbao.js';
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

test('水滴信用搜索解析卡片、分页及高亮标签去除，未命中返回空列表', async () => {
  const html = `
    <div class="sd_company_container">
      <div class="or_search_row or_row_w">
        <div class="or_look_tit">
          <span class="or_look_ne"><em>示例</em><em>科技</em><em>有限</em><em>公司</em> <a href="" companyname="示例科技有限公司"></a></span>
          <a href="/suppinfo?digest=60d384ed1970fb41b06dd0099355183f"></a>
        </div>
        <div class="or-company-all">
          <div class="or_search_row_company">
            <span>法定代表人：张三 </span><i>|</i>
            <span>注册资本：1000万人民币 </span><i>|</i>
            <span>注册时间：2020-01-01</span><i>|</i>
            <span>状态：存续（在营、开业、在册）</span>
          </div>
        </div>
      </div>
    </div>
    <div class="pagination"><div class="page"><p><i>（共15条记录）</i></p></div></div>
  `;
  const parsed = parseShuidiCards(html);
  assert.equal(parsed.total, 15);
  assert.equal(parsed.companies.length, 1);
  assert.equal(parsed.companies[0]?.name, '示例科技有限公司');
  assert.equal(parsed.companies[0]?.id, '60d384ed1970fb41b06dd0099355183f');
  assert.equal(parsed.companies[0]?.legalRepresentative, '张三');
  assert.equal(parsed.companies[0]?.registeredCapital, '1000万人民币');

  const emptyHtml = '<div class="or_look_none"><p>未找到符合条件的查询结果，请更改关键词重新查询！</p></div>';
  const emptyParsed = parseShuidiCards(emptyHtml);
  assert.equal(emptyParsed.total, 0);
  assert.equal(emptyParsed.companies.length, 0);

  const http = new HttpClient(1000, async (url, init) => {
    assert.ok(String(url).includes('/b-search?key=%E7%A4%BA%E4%BE%8B&page=1'));
    assert.equal(new Headers(init?.headers).get('referer'), 'https://shuidi.cn/b-search');
    assert.equal(new Headers(init?.headers).get('cookie'), 'guid=test-guid');
    return new Response(html, { status: 200, headers: { 'content-type': 'text/html' } });
  });
  const provider = new Shuidi(http, 'guid=test-guid');
  const res = await provider.search({ keyword: '示例', page: 1, pageSize: 10 });
  assert.equal(res.companies.length, 1);
  assert.equal(res.pagination?.total, 15);
});

test('水滴信用详情聚合工商、股东、高管、分支及年报，无效 ID 报错', async () => {
  const digest = '60d384ed1970fb41b06dd0099355183f';
  const http = new HttpClient(1000, async (url) => {
    const u = String(url);
    if (u.includes('/webapp/company/base-info?action=branches')) {
      return json({ status: 0, total: 1, data: [{ branch_name: '示例分公司', digest: '12345678901234567890123456789012', company_status: '存续' }] });
    }
    if (u.includes('/annual-reports?action=get_all_year')) {
      return json({ status: 0, total: 1, data: [{ x: 2024, y: '2025年05月01日' }] });
    }
    if (u.includes('/phone-new') && u.includes('type=1')) {
      return json({ status: 0, data: { list: [{ phone: '010-8888****' }] } });
    }
    if (u.includes('/phone-new') && u.includes('type=2')) {
      return json({ status: 0, data: { list: [{ email: 'info@example.com' }] } });
    }
    if (u.includes('/webapp/company/base-info')) {
      return json({
        status: 0,
        data: {
          company_name: '示例企业',
          credit_no: '91350000000000000X',
          legal_person: '示例法人',
          establish_date: '2020-01-01',
          company_status: '存续',
          capital: '1000万人民币',
          real_capital: '500万人民币',
          company_type: '有限责任公司',
          authority: '市场监督管理局',
          partners: {
            total: 1,
            data: [{ stock: { stock_name: '控股股东', digest: 'a'.repeat(32) }, stock_proportion: '100%', stock_type: '企业法人' }]
          },
          employees: {
            total: 1,
            data: [{ employee_name: '李四', position: '执行董事,总经理' }]
          },
          changes: {
            total: 1,
            data: [{ change_date: '2023-01-01', change_type: '名称变更', content_before: '旧名称', content_after: '新名称' }]
          }
        }
      });
    }
    return json({ status: 0 });
  });

  const provider = new Shuidi(http);
  await assert.rejects(provider.detail('invalid-id'), code('INVALID_INPUT'));

  const res = await provider.detail(digest);
  const c = res.companies[0]!;
  assert.equal(c.name, '示例企业');
  assert.equal(c.creditCode, '91350000000000000X');
  assert.equal(c.legalRepresentative, '示例法人');
  assert.equal(c.basic?.paidInCapital, '500万人民币');
  assert.deepEqual(c.basic?.phones, ['010-8888****']);
  assert.deepEqual(c.basic?.emails, ['info@example.com']);
  assert.equal(c.modules?.shareholders.items.length, 1);
  assert.equal(c.modules?.shareholders.items[0]?.name, '控股股东');
  assert.equal(c.modules?.people.items.length, 1);
  assert.deepEqual(c.modules?.people.items[0]?.positions, ['执行董事', '总经理']);
  assert.equal(c.modules?.branches.items.length, 1);
  assert.equal(c.modules?.branches.items[0]?.name, '示例分公司');
  assert.equal(c.modules?.annualReports.items.length, 1);
  assert.equal(c.modules?.annualReports.items[0]?.year, '2024');
  assert.equal(c.modules?.changes.items.length, 1);
  assert.equal(c.modules?.changes.items[0]?.item, '名称变更');

  const notFoundHttp = new HttpClient(1000, async () => json({ status: 0, data: { company_name: null } }));
  await assert.rejects(new Shuidi(notFoundHttp).detail(digest), code('NOT_FOUND'));
});

test('启信宝签名生成确定性请求头，支持状态提取与搜索卡片归一化', async () => {
  const sign = signQxb('/api/search/advanceSearch2', { keyword: '测试', page: 1 });
  assert.equal(typeof sign.name, 'string');
  assert.equal(sign.name.length, 20);
  assert.equal(typeof sign.value, 'string');
  assert.equal(sign.value.length, 128); // sha512 hex is 128 chars

  const sampleState = {
    route: { name: 'search', path: '/search/测试.html' },
    search: {
      searchResult: {
        total: 1,
        items: [{
          eid: '4c8bd41b-2534-43c0-8643-5bf4dca1991e',
          name: '<em>启信</em><em>科技</em>股份有限公司',
          operName: '张三',
          startDate: '2021-05-20',
          regCapiDesc: '5000万元',
          status: '存续',
          address: '北京市海淀区中关村南大街1号'
        }]
      }
    }
  };
  const html = `<html><head><script>window.__INITIAL_STATE__=${JSON.stringify(sampleState)};(function(){})();</script></head><body></body></html>`;
  const extracted = extractQxbState(html);
  assert.deepEqual(extracted.route, sampleState.route);

  const http = new HttpClient(1000, async (url, init) => {
    assert.ok(String(url).includes('/search/%E6%B5%8B%E8%AF%95.html'));
    assert.equal(new Headers(init?.headers).get('cookie'), 'sid=qxb-token');
    return new Response(html, { status: 200, headers: { 'content-type': 'text/html' } });
  });

  const provider = new Qixinbao(http, 'sid=qxb-token');
  const res = await provider.search({ keyword: '测试', page: 1, pageSize: 10 });
  assert.equal(res.companies.length, 1);
  const c = res.companies[0]!;
  assert.equal(c.id, '4c8bd41b-2534-43c0-8643-5bf4dca1991e');
  assert.equal(c.name, '启信科技股份有限公司');
  assert.equal(c.legalRepresentative, '张三');
  assert.equal(c.establishedAt, '2021-05-20');
  assert.equal(c.registeredCapital, '5000万元');
  assert.equal(c.registrationStatus, '存续');
  assert.equal(res.pagination?.total, 1);

  // 验证登录跳转时抛出 AUTH_REQUIRED
  const loginStateHtml = `<html><script>window.__INITIAL_STATE__=${JSON.stringify({
    route: { name: 'login', path: '/auth/login' }
  })};</script></html>`;
  const loginHttp = new HttpClient(1000, async () => new Response(loginStateHtml, { status: 200 }));
  await assert.rejects(new Qixinbao(loginHttp).search({ keyword: '测试', page: 1, pageSize: 10 }), code('AUTH_REQUIRED'));
});

test('启信宝详情提取多模块、处理非合法 ID 与企业未找到', async () => {
  const eid = '4c8bd41b-2534-43c0-8643-5bf4dca1991e';
  const detailState = {
    route: { name: 'company', path: `/company/${eid}` },
    enterprise: {
      mentInfo: {
        eid,
        name: '启信科技有限公司',
        operName: '李四',
        startDate: '2018-08-08',
        regCapi: '10000 万元',
        address: '北京市朝阳区建国门外大街1号',
        industry: '科技推广和应用服务业',
        industryName: '科学研究和技术服务业',
        phone: '010-6505****',
        email: 'contact@qixin.test',
        regInfo: {
          regNo: '110000000000000',
          orgNo: 'MA0000000',
          creditNo: '91110000MA0000000X',
          status: '存续',
          econKind: '有限责任公司（自然人独资）',
          scope: '技术开发、技术推广、技术服务。',
          businessTerm: '2018-08-08 至 2038-08-07',
          belongOrg: '朝阳区市场监督管理局'
        },
        partnerInfo: {
          total: 1,
          items: [{ stockName: '股东王五', percent: '100%', shouldCapi: '10000万元', shoudDate: '2018-08-08', stockType: '自然人' }]
        },
        employeeInfo: {
          total: 1,
          items: [{ name: '李四', title: '执行董事,经理' }]
        },
        branchInfo: {
          total: 1,
          items: [{ eid: '5c8bd41b-2534-43c0-8643-5bf4dca1991f', name: '启信科技有限公司上海分公司', operName: '赵六' }]
        },
        changeRecordInfo: {
          total: 1,
          items: [{ date: '2022-01-01', item: '法定代表人变更', before: '张三', after: '李四' }]
        },
        yearReport: {
          total: 1,
          items: [{ reportYear: '2023年度', reportDate: '2024-05-01' }]
        },
        investInfo: {
          total: 1,
          items: [{ eid: '6c8bd41b-2534-43c0-8643-5bf4dca19920', name: '启信全资子公司', stock_percentage: '100%', operName: '李四' }]
        }
      }
    }
  };
  const html = `<html><head><script>window.__INITIAL_STATE__=${JSON.stringify(detailState)};</script></head></html>`;

  const http = new HttpClient(1000, async (url) => {
    assert.ok(String(url).includes(`/company/${eid}`));
    return new Response(html, { status: 200, headers: { 'content-type': 'text/html' } });
  });

  const provider = new Qixinbao(http);
  await assert.rejects(provider.detail('not-a-uuid'), code('INVALID_INPUT'));

  const res = await provider.detail(eid);
  const c = res.companies[0]!;
  assert.equal(c.name, '启信科技有限公司');
  assert.equal(c.creditCode, '91110000MA0000000X');
  assert.equal(c.legalRepresentative, '李四');
  assert.equal(c.basic?.companyType, '有限责任公司（自然人独资）');
  assert.deepEqual(c.basic?.phones, ['010-6505****']);
  assert.deepEqual(c.basic?.emails, ['contact@qixin.test']);
  assert.equal(c.modules?.shareholders.items.length, 1);
  assert.equal(c.modules?.shareholders.items[0]?.name, '股东王五');
  assert.equal(c.modules?.shareholders.items[0]?.ownershipRatio, 1);
  assert.equal(c.modules?.people.items.length, 1);
  assert.deepEqual(c.modules?.people.items[0]?.positions, ['执行董事', '经理']);
  assert.equal(c.modules?.branches.items.length, 1);
  assert.equal(c.modules?.branches.items[0]?.name, '启信科技有限公司上海分公司');
  assert.equal(c.modules?.changes.items.length, 1);
  assert.equal(c.modules?.changes.items[0]?.item, '法定代表人变更');
  assert.equal(c.modules?.annualReports.items.length, 1);
  assert.equal(c.modules?.annualReports.items[0]?.year, '2023');
  assert.equal(c.modules?.investments.items.length, 1);
  assert.equal(c.modules?.investments.items[0]?.name, '启信全资子公司');

  // 验证企业未找到时报 NOT_FOUND
  const notFoundHtml = `<html><script>window.__INITIAL_STATE__=${JSON.stringify({
    route: { name: 'company' },
    enterprise: { mentInfo: {} }
  })};</script></html>`;
  const notFoundHttp = new HttpClient(1000, async () => new Response(notFoundHtml, { status: 200 }));
  await assert.rejects(new Qixinbao(notFoundHttp).detail(eid), code('NOT_FOUND'));
});
