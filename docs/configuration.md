# 配置说明

所有配置通过环境变量或项目根目录的 `.env` 文件提供（参考 `.env.example`）。快速上手见 [README](../README.md)。

## 环境变量

| 变量 | 默认值 | 说明 |
| :--- | :--- | :--- |
| `HOST` | `127.0.0.1` | 监听地址；监听外部地址必须配置 `API_KEY` |
| `PORT` | `3010` | 服务端口 |
| `API_KEY` | 空 | `/api/` 路由使用 `Authorization: Bearer <API_KEY>` 鉴权 |
| `RATE_LIMIT_PER_MINUTE` | `30` | 每个客户端 IP 每分钟请求上限，范围 1–10000 |
| `UPSTREAM_TIMEOUT_MS` | `20000` | 单次上游 HTTP 请求超时，毫秒 |
| `TYC_COOKIE` | 空 | 可选天眼查 Cookie 请求头 |
| `QCC_COOKIE` | 空 | 企查查 Cookie 请求头 |
| `AQC_COOKIE` | 空 | 爱企查有效 Cookie 请求头，不强制某个 Cookie 名称 |

内置参数校验、鉴权、限流与错误分类。HTTP 请求校验证书、禁止自动跟随重定向，单次响应上限 4 MiB；单平台接口不自动重试、切换平台或补齐其他来源的数据；跨平台兜底需显式调用 `/api/v1/lookup`。默认未开启 CORS，也不信任代理转发的客户端 IP；反向代理部署时需按实际网络配置限流。

配置无效时（如端口越界、对外监听却未设置 `API_KEY`），服务在启动阶段输出变量名与约束后退出，不会输出变量值。

## 平台 Cookie

Cookie 只由服务部署者设置，客户端不能通过 API 提交。Cookie 对应账号的现有权限，不能增加会员权益；会话失效后需更新。项目不自动登录、处理验证码或轮换账号。

## 已移除：企查查浏览器（CDP）模式

早期版本可通过 `QCC_MODE=browser` 与 `QCC_CDP_URL` 连接本机 Chrome 调试端口查询企查查。该模式从未完成真实会话端到端验证，且 Cookie + HTTP 已通过多公司联网验证，现已删除。旧配置中的 `QCC_MODE`、`QCC_CDP_URL` 不再读取，可直接删除；企查查只需配置 `QCC_COOKIE`。
