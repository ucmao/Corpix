import { buildApp } from './app.js';
import { loadConfig, type Config } from './config.js';
let config: Config;
try { config = loadConfig(); }
catch (error) {
  // 配置错误在启动阶段直接说明原因；消息只包含变量名与约束，不含变量值。
  console.error(`Corpix 配置无效：${error instanceof Error ? error.message : String(error)}`);
  process.exit(1);
}
const app = await buildApp({ config, logger: true });
for (const signal of ['SIGINT','SIGTERM'] as const) process.once(signal, () => {
  app.close().catch(() => { process.exitCode = 1; });
});
try { await app.listen({ host: config.host, port: config.port }); }
catch (error) {
  const e = error as NodeJS.ErrnoException;
  app.log.error({ code: e.code, message: e.message }, `Corpix 启动失败：无法监听 ${config.host}:${config.port}`);
  await app.close().catch(() => {});
  process.exitCode = 1;
}
