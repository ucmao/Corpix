# 企查查 Cookie + HTTP 接入研究

研究日期：2026-11-19。

## 结论与验证范围

已实现不常驻 Chrome 的 HTTP 模式。初始研究仅完成公开仓库源码核查与 Corpix 本地代码对照；随后使用用户授权会话验证，并正式接入 API，见 [联网验证记录](live-verification.md) 及 [多公司验证元数据](platform-multisample-verification.json)。真实会话过期、搜索后续分页与 CDP 路径仍未验证。下文保留研究时的接入建议，实际实现以 `src/qcc-http.ts` 和 [统一映射说明](field-mapping.md) 为准。

Cookie 标识登录会话，不授予额外账号权益。查询所需的登录、会员及其他权限仍由源站判断；有效登录态也不保证请求通过验证或频率限制。不应把 Cookie 过期、权限不足、验证页或响应结构变化处理成搜索无结果。并非所有基础查询都必然要求付费会员，具体范围需逐项验证，不能将参考仓库记录的分页上限当作源站当前规则。

## 参考仓库核查

参考：[Jing7-Zhang/Qcc_Reverse_Firm-Info_Crawler](https://github.com/Jing7-Zhang/Qcc_Reverse_Firm-Info_Crawler)。以下均为源码所表现的流程，不是本项目的实测成功记录。

1. [搜索模块](https://github.com/Jing7-Zhang/Qcc_Reverse_Firm-Info_Crawler/blob/main/qcc_search_helpers.py)通过 HTTP 获取搜索页，从返回文本解析 `window.pid`、`window.tid`，计算动态请求头，然后 POST 到 `/api/search/searchMulti`。请求需要 Cookie、页面参数、签名和请求体相互一致，不能只追加一个会话字段便宣称可用。
2. 搜索模块引用 `encode_url.py` 和 `02_企查查_header加密逻辑.js`；研究时该仓库根文件列表未包含它们。README 指向的另一个学习仓库包含同名文件。这意味着当前仓库不能直接视为依赖完整的部署包。
3. [详情模块](https://github.com/Jing7-Zhang/Qcc_Reverse_Firm-Info_Crawler/blob/main/qcc_firm_detail_apis.py)主要通过 HTTP 获取 `/firm/{KeyNo}.html`，提取 `window.__INITIAL_STATE__` 下的企业详情。没有取到字段时，代码会尝试用 DrissionPage 启动无头 Chromium。因此整个仓库并非严格的纯 HTTP 实现。
4. 详情源码及搜索脚本存在硬编码 Cookie。研究中未使用、复制到项目或验证这些凭据，不应将其作为可用配置或测试账号。
5. 仓库标注 AGPL-3.0。Corpix 保持自有 TypeScript 实现，本次没有引入其 Python 代码、第三方 JS、原始 HTML 或真实响应文件。

## 对 Corpix 的接入建议

当前 `Qichacha` 已通过 `QccTransport` 隔离传输，并有自有 `signQcc` 签名和字段归一化函数。可增加独立 HTTP 传输层，复用这些边界；签名是否适配当前源站仍需验证。

- 配置方向：新增部署端 `QCC_COOKIE`，根据实际需要允许配置一致的 User-Agent；继续保留现有 `QCC_CDP_URL` 模式，明确选择模式，不静默切换或启动浏览器。
- 搜索方向：同一会话获取页面参数，使用与签名一致的 JSON 请求体查询固定端点。Node.js 原生 fetch 不自动维护浏览器 Cookie 会话，需要明确处理响应更新的 Cookie，限定在企查查源站范围内。
- 详情方向：独立评估页面初始数据解析，不假定参考仓库的 HTML 详情与现有 `/api/company/getDetail` 接口具有相同可用性。仅解析数据，不执行页面脚本。
- 出错处理：区分登录失效、账号权限、限流、验证页和解析错误；HTTP 200 不等于业务成功。页面包含通用 login 字样也不足以单独判断会话过期。
- 验证方向：先用合成页面和模拟 HTTP 响应覆盖参数提取、序列化、Cookie 更新、错误分类及详情解析；随后使用用户自行配置的有效授权会话验证搜索、详情、过期和权限不足。离线通过不设置 `liveVerified=true`。

实际落地前仍待确认：完整 Cookie 的必要字段、会话刷新行为、现行页面参数格式、动态签名、详情数据结构，以及不同账号的查询与分页权限。有效 Cookie 是会话条件，不是稳定成功的充分条件。
