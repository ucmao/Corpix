import { test } from 'node:test';
import assert from 'node:assert/strict';
import { BrowserQccTransport } from '../src/cdp.js';
import { HttpClient } from '../src/http.js';
import { CorpixError } from '../src/errors.js';
const code = (expected: string) => (error: unknown) => error instanceof CorpixError && error.code === expected;
const target = [{ type: 'page', url: 'https://www.qcc.com/', webSocketDebuggerUrl: 'ws://127.0.0.1:9222/devtools/page/test' }];
const http = new HttpClient(1000, async () => new Response(JSON.stringify(target)));

test('CDP 使用现有目标并生成固定业务查询，查询后关闭连接', async t => {
  const original = globalThis.WebSocket;
  const expressions: string[] = [];
  let closed = false;
  class FakeSocket extends EventTarget {
    constructor(url: URL) {
      super(); assert.equal(url.hostname, '127.0.0.1');
      queueMicrotask(() => this.dispatchEvent(new Event('open')));
    }
    send(input: string) {
      const msg = JSON.parse(input);
      expressions.push(msg.params.expression);
      const value = msg.id === 1 ? { pid: 'test-pid', tid: 'test-tid', origin: 'https://www.qcc.com' }
        : { status: 200, body: JSON.stringify({ Status: 200, Result: [] }) };
      queueMicrotask(() => this.dispatchEvent(new MessageEvent('message', { data: JSON.stringify({ id: msg.id, result: { result: { value } } }) })));
    }
    close() { closed = true; this.dispatchEvent(new Event('close')); }
  }
  globalThis.WebSocket = FakeSocket as unknown as typeof WebSocket;
  t.after(() => { globalThis.WebSocket = original; });
  const out = await new BrowserQccTransport('http://127.0.0.1:9222', 1000, http).request('/search/searchMulti', 'POST', { searchKey: '示例' });
  assert.deepEqual(out, { Status: 200, Result: [] });
  assert.equal(closed, true);
  assert.equal(expressions.length, 2);
  assert.match(expressions[1]!, /\/api\/search\/searchMulti/);
  assert.match(expressions[1]!, /location.origin/);
  assert.match(expressions[1]!, /AbortSignal.timeout/);
});

test('CDP 执行异常会收敛为业务错误且清理连接', async t => {
  const original = globalThis.WebSocket;
  let closed = false;
  class FakeSocket extends EventTarget {
    constructor() { super(); queueMicrotask(() => this.dispatchEvent(new Event('open'))); }
    send(input: string) {
      const msg = JSON.parse(input);
      queueMicrotask(() => this.dispatchEvent(new MessageEvent('message', { data: JSON.stringify({ id: msg.id, result: { exceptionDetails: { text: 'sensitive browser details' } } }) })));
    }
    close() { closed = true; this.dispatchEvent(new Event('close')); }
  }
  globalThis.WebSocket = FakeSocket as unknown as typeof WebSocket;
  t.after(() => { globalThis.WebSocket = original; });
  await assert.rejects(new BrowserQccTransport('http://127.0.0.1:9222', 1000, http).request('/company/getDetail', 'GET'), code('UPSTREAM_ERROR'));
  assert.equal(closed, true);
});

test('CDP 无响应会超时并关闭连接', async t => {
  const original = globalThis.WebSocket;
  let closed = false;
  class FakeSocket extends EventTarget {
    constructor() { super(); queueMicrotask(() => this.dispatchEvent(new Event('open'))); }
    send() {}
    close() { closed = true; this.dispatchEvent(new Event('close')); }
  }
  globalThis.WebSocket = FakeSocket as unknown as typeof WebSocket;
  t.after(() => { globalThis.WebSocket = original; });
  await assert.rejects(new BrowserQccTransport('http://127.0.0.1:9222', 20, http).request('/company/getDetail', 'GET'), code('UPSTREAM_TIMEOUT'));
  assert.equal(closed, true);
});
