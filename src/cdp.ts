import { HttpClient, checkHttp, parseJson, MAX_BODY_BYTES } from './http.js';
import { CorpixError, fail } from './errors.js';
import { object } from './types.js';
import { signQcc, type QccTransport } from './providers/qichacha.js';
function localUrl(input: string, protocols: string[]) {
  let url: URL;
  try { url = new URL(input); } catch { fail('NOT_CONFIGURED', 'CDP 地址格式无效', 503); }
  if (!protocols.includes(url.protocol) || !['localhost','127.0.0.1','[::1]'].includes(url.hostname) || url.username || url.password) {
    fail('NOT_CONFIGURED', 'CDP 仅允许连接本机调试端口', 503);
  }
  return url;
}
export class BrowserQccTransport implements QccTransport {
  constructor(private endpoint: string, private timeoutMs: number, private http = new HttpClient(timeoutMs)) {}
  async request(path: string, method: 'GET' | 'POST', body?: unknown, query = ''): Promise<unknown> {
    if (!this.endpoint) fail('NOT_CONFIGURED', '企查查需要设置 QCC_CDP_URL 并登录浏览器', 503);
    if (!['/search/searchMulti','/company/getDetail'].includes(path)) fail('INVALID_INPUT', '不支持的企查查端点', 400);
    const endpoint = localUrl(this.endpoint, ['http:']);
    const targets = await this.http.json(new URL('/json', endpoint).href);
    if (!Array.isArray(targets)) fail('PARSE_ERROR', 'CDP 目标列表无效');
    const target = targets.map(object).find(t => {
      try { return t.type === 'page' && new URL(String(t.url)).origin === 'https://www.qcc.com'; } catch { return false; }
    });
    if (!target) fail('AUTH_REQUIRED', '请在调试浏览器中打开并登录 https://www.qcc.com/', 409);
    const wsUrl = localUrl(String(target.webSocketDebuggerUrl), ['ws:']);
    if (wsUrl.port !== endpoint.port) fail('NOT_CONFIGURED', 'CDP WebSocket 端口与配置不一致', 503);
    const socket = new WebSocket(wsUrl);
    let sequence = 0;
    const pending = new Map<number, { resolve: (v: unknown) => void; reject: (e: Error) => void }>();
    const rejectAll = () => {
      for (const entry of pending.values()) entry.reject(new CorpixError('UPSTREAM_ERROR', '浏览器调试连接中断'));
      pending.clear();
    };
    const onMessage = (event: MessageEvent) => {
      let message;
      try { message = object(JSON.parse(String(event.data))); } catch { return; }
      const entry = pending.get(Number(message.id));
      if (!entry) return;
      pending.delete(Number(message.id));
      const response = object(message.result);
      if (message.error || response.exceptionDetails) entry.reject(new CorpixError('UPSTREAM_ERROR', '浏览器执行查询失败'));
      else entry.resolve(object(response.result).value);
    };
    socket.addEventListener('message', onMessage);
    socket.addEventListener('close', rejectAll);
    socket.addEventListener('error', rejectAll);
    const evaluate = (expression: string) => new Promise<unknown>((resolve, reject) => {
      const id = ++sequence;
      pending.set(id, { resolve, reject });
      socket.send(JSON.stringify({ id, method: 'Runtime.evaluate', params: { expression, awaitPromise: true, returnByValue: true } }));
    });
    let timer: ReturnType<typeof setTimeout> | undefined;
    const timeout = new Promise<never>((_, reject) => {
      timer = setTimeout(() => reject(new CorpixError('UPSTREAM_TIMEOUT', '浏览器查询超时', 504)), this.timeoutMs);
    });
    const work = async () => {
      await new Promise<void>((resolve, reject) => {
        socket.addEventListener('open', () => resolve(), { once: true });
        socket.addEventListener('error', () => reject(new CorpixError('UPSTREAM_ERROR', '无法连接浏览器')), { once: true });
      });
      const context = object(await evaluate('({pid: window.pid, tid: window.tid, origin: location.origin})'));
      if (context.origin !== 'https://www.qcc.com') fail('UPSTREAM_BLOCKED', '浏览器页面已离开企查查');
      if (typeof context.tid !== 'string' || typeof context.pid !== 'string') fail('AUTH_REQUIRED', '企查查页面未准备好，请重新打开并登录', 409);
      const signature = signQcc(path, context.tid, body, query);
      const headers = { 'x-pid': context.pid, 'x-requested-with': 'XMLHttpRequest', [signature.name]: signature.value,
        ...(method === 'POST' ? { 'content-type': 'application/json' } : {}) };
      const options = { method, headers, redirect: 'manual', ...(method === 'POST' ? { body: JSON.stringify(body ?? {}) } : {}) };
      const url = '/api' + path + (query ? '?' + query : '');
      // 页面可能在两次 CDP 调用间导航，必须再次校验来源后才执行请求。
      const response = object(await evaluate(`(async () => {
        if (location.origin !== 'https://www.qcc.com') throw new Error('origin changed');
        const r = await fetch(${JSON.stringify(url)}, { ...${JSON.stringify(options)}, signal: AbortSignal.timeout(${this.timeoutMs}) });
        if (!r.body) return {status:r.status, body:''};
        const reader = r.body.getReader(), chunks = []; let size = 0;
        try { while (true) { const p = await reader.read(); if(p.done) break;
          size += p.value.byteLength; if(size > ${MAX_BODY_BYTES}) return {oversize:true}; chunks.push(p.value); }
        } finally { await reader.cancel().catch(() => {}); }
        const bytes = new Uint8Array(size); let offset = 0;
        for(const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.byteLength; }
        return {status:r.status, body:new TextDecoder().decode(bytes)};
      })()`));
      if (response.oversize) fail('PARSE_ERROR', '上游响应超过大小限制');
      checkHttp(Number(response.status));
      return parseJson(String(response.body));
    };
    try { return await Promise.race([work(), timeout]); }
    finally {
      clearTimeout(timer);
      rejectAll();
      socket.removeEventListener('message', onMessage);
      socket.close();
    }
  }
}
