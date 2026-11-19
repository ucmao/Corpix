import { buildApp } from './app.js';
import { loadConfig } from './config.js';
const config = loadConfig();
const app = await buildApp({ config, logger: true });
for (const signal of ['SIGINT','SIGTERM'] as const) process.once(signal, () => {
  app.close().catch(() => { process.exitCode = 1; });
});
try { await app.listen({ host: config.host, port: config.port }); }
catch { app.log.error('Corpix 启动失败，请检查配置和端口'); process.exitCode = 1; }
