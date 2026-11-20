import Fastify, { LogController, type FastifyError } from 'fastify';
import rateLimit from '@fastify/rate-limit';
import { timingSafeEqual } from 'node:crypto';
import { loadConfig, type Config } from './config.js';
import { CorpixError, fail } from './errors.js';
import { sources, type Source, type Provider } from './types.js';
import { HttpClient } from './http.js';
import { createProviders, describeSources, sourceDefinitions } from './registry.js';
import { lookup, defaultLookupOrder, LookupError, type LookupStrategy } from './lookup.js';
export interface AppOptions { config?: Config; providers?: Record<Source, Provider>; logger?: boolean }
export async function buildApp(options: AppOptions = {}) {
  const config = options.config ?? loadConfig();
  const app = Fastify({ logger: options.logger ? { redact: ['req.headers.authorization','req.headers.cookie'] } : false,
    logController: new LogController({ disableRequestLogging: true }), bodyLimit: 16384, ajv: { customOptions: { removeAdditional: false } } });
  const http = new HttpClient(config.timeoutMs);
  const providers = options.providers ?? createProviders(http, config);
  app.setErrorHandler<FastifyError>((error, _request, reply) => {
    if (error instanceof LookupError) return reply.code(error.statusCode).send({ error: { code: error.code, message: error.message }, attempts: error.attempts });
    if (error instanceof CorpixError) return reply.code(error.statusCode).send({ error: { code: error.code, message: error.message } });
    if (error.statusCode === 429) return reply.code(429).send({ error: { code: 'RATE_LIMITED', message: '请求过于频繁' } });
    if (error.validation || (error.statusCode && error.statusCode >= 400 && error.statusCode < 500)) {
      return reply.code(error.statusCode ?? 400).send({ error: { code: 'INVALID_INPUT', message: '请求参数或请求体无效' } });
    }
    app.log.error({ code: 'INTERNAL_ERROR' }, '查询失败');
    return reply.code(500).send({ error: { code: 'INTERNAL_ERROR', message: '服务内部错误' } });
  });
  await app.register(rateLimit, { max: config.rateLimit, timeWindow: '1 minute' });
  app.addHook('onRequest', async (request) => {
    if (!config.apiKey || request.routeOptions.url === '/health') return;
    const supplied = Buffer.from(request.headers.authorization ?? '');
    const expected = Buffer.from(`Bearer ${config.apiKey}`);
    if (supplied.length !== expected.length || !timingSafeEqual(supplied, expected)) fail('UNAUTHORIZED', 'API 密钥无效', 401);
  });
  app.addHook('onSend', async (request, reply, payload) => {
    if (request.url.startsWith('/api/')) reply.header('cache-control', 'no-store');
    return payload;
  });
  app.get('/health', { config: { rateLimit: false } }, async () => ({ status: 'ok', name: 'Corpix', version: '0.1.0' }));
  app.get('/api/v1/sources', async () => ({ sources: describeSources(config) }));
  const raw = { type: 'boolean', default: false };
  app.post<{ Body: { source: Source; keyword: string; page: number; pageSize: number; raw: boolean } }>('/api/v1/search', {
    schema: { body: { type: 'object', additionalProperties: false, required: ['source','keyword'], properties: {
      source: { type: 'string', enum: sources }, keyword: { type: 'string', minLength: 1, maxLength: 100 },
      page: { type: 'integer', minimum: 1, maximum: 100, default: 1 },
      pageSize: { type: 'integer', minimum: 1, maximum: 20, default: 20 }, raw } } }
  }, async (request) => {
    const input = request.body, keyword = input.keyword.trim();
    if (!keyword) fail('INVALID_INPUT', '查询词不能为空', 400);
    const result = await providers[input.source].search({ keyword, page: input.page, pageSize: input.pageSize });
    const { raw: original, ...output } = result;
    return input.raw ? { ...output, raw: original } : output;
  });
  app.post<{ Body: { keyword: string; strategy: LookupStrategy; sources: Source[] } }>('/api/v1/lookup', {
    schema: { body: { type: 'object', additionalProperties: false, required: ['keyword'], properties: {
      keyword: { type: 'string', minLength: 1, maxLength: 100 },
      strategy: { type: 'string', enum: ['fallback', 'all', 'merged'], default: 'fallback' },
      sources: { type: 'array', minItems: 1, maxItems: sources.length, uniqueItems: true,
        items: { type: 'string', enum: sources }, default: [...defaultLookupOrder] } } } }
  }, async (request) => {
    const { keyword, strategy, sources: order } = request.body;
    if (!keyword.trim()) fail('INVALID_INPUT', '查询词不能为空', 400);
    return lookup(providers, s => sourceDefinitions[s].configured(config), { keyword, strategy, sources: order });
  });
  app.get<{ Params: { source: Source; id: string }; Querystring: { raw: boolean } }>('/api/v1/companies/:source/:id', {
    schema: { params: { type: 'object', additionalProperties: false, required: ['source','id'], properties: {
      source: { type: 'string', enum: sources }, id: { type: 'string', minLength: 1, maxLength: 160, pattern: '^[a-zA-Z0-9_-]+$' } } },
      querystring: { type: 'object', additionalProperties: false, properties: { raw } } }
  }, async (request) => {
    const result = await providers[request.params.source].detail(request.params.id);
    const { raw: original, ...output } = result;
    return request.query.raw ? { ...output, raw: original } : output;
  });
  return app;
}
