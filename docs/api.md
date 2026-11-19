# API 参考

本文是 Corpix HTTP API 的完整说明。快速上手见 [README](../README.md)；字段映射与转换规则见 [统一模型与映射](field-mapping.md)。

配置 `API_KEY` 后，访问 `/api/` 接口需增加 `Authorization: Bearer <API_KEY>` 请求头；`/health` 无需鉴权，仅表示服务存活，不检测上游平台。

## 接口定义

| 方法 | 路径 | 用途 |
| :--- | :--- | :--- |
| `GET` | `/health` | 服务健康检查，无需鉴权 |
| `GET` | `/api/v1/sources` | 来源能力、模式与配置状态 |
| `POST` | `/api/v1/lookup` | 跨平台统一查询：自动兜底或多平台对比 |
| `POST` | `/api/v1/search` | 按指定平台搜索企业 |
| `GET` | `/api/v1/companies/:source/:id` | 查询企业详情 |

## 企业搜索

```bash
curl http://127.0.0.1:3010/api/v1/search \
  -H 'Content-Type: application/json' \
  -H 'Authorization: Bearer your-api-key' \
  -d '{
    "source": "qichacha",
    "keyword": "深圳市腾讯计算机系统有限公司",
    "page": 1,
    "pageSize": 5
  }'
```

### 请求参数（JSON Body）

| 参数 | 类型 | 必填 | 默认值 | 说明 |
| :--- | :--- | :---: | :--- | :--- |
| `source` | `string` | 是 | — | `tianyancha` / `qichacha` / `aiqicha` |
| `keyword` | `string` | 是 | — | 1–100 字符，自动去除首尾空格 |
| `page` | `number` | 否 | `1` | 整数，范围 1–100；实际分页权限由上游决定 |
| `pageSize` | `number` | 否 | `20` | 整数，范围 1–20；上游可能截断返回数量 |
| `raw` | `boolean` | 否 | `false` | 是否附带本次请求的原始响应 |

未设置 `API_KEY` 的本机开发环境可省略鉴权请求头。搜索结果可能包含名称相关但并非目标主体的公司，应结合名称和统一社会信用代码核对。

## 企业详情

将搜索结果中的 `source` 和 `id` 原样用于详情查询。先将下方占位值替换为搜索结果中的企业 ID：

```bash
COMPANY_ID='your-company-id'
curl "http://127.0.0.1:3010/api/v1/companies/qichacha/${COMPANY_ID}?raw=false" \
  -H 'Authorization: Bearer your-api-key'
```

- 天眼查：数字企业 ID。
- 企查查：32 位十六进制 `KeyNo`。
- 爱企查：数字 `pid`，或可通过同源跳转解析的详情页 slug。

**不同平台的企业 ID 不可互换。** 单平台接口不合并跨平台结果，也不使用其他平台的数据补齐缺失值；需要兜底或对比时使用 [lookup](#跨平台统一查询lookup)。

## 跨平台统一查询（lookup）

按企业**全称**或**统一社会信用代码**查询，由 Corpix 负责搜索、精确匹配和拉取详情，调用方不需要指定平台或处理平台 ID。

```bash
curl http://127.0.0.1:3010/api/v1/lookup \
  -H 'Content-Type: application/json' \
  -H 'Authorization: Bearer your-api-key' \
  -d '{ "keyword": "福建正孚软件有限公司", "strategy": "fallback" }'
```

| 参数 | 类型 | 必填 | 默认值 | 说明 |
| :--- | :--- | :---: | :--- | :--- |
| `keyword` | `string` | 是 | — | 企业全称，或 18 位统一社会信用代码（自动识别） |
| `strategy` | `string` | 否 | `fallback` | `fallback`：按顺序查，第一个成功即返回；`all`：并行查所有平台并对比字段 |
| `sources` | `string[]` | 否 | `["qichacha","aiqicha","tianyancha"]` | 参与查询的平台及顺序，不可重复 |

**用途：**

- `fallback`：保证可用性。某平台 Cookie 过期、触发风控或权限不足时自动换下一个平台，返回格式不变。
- `all`：互补与核验。各平台结果分别放在 `results.<平台>`，`comparison` 列出一致与不一致的字段，可据此按模块选用来源或发现数据矛盾。

**匹配规则：** 只接受精确命中。名称比较忽略全角/半角括号和空白；按信用代码查询时，在详情阶段再次核对信用代码。分公司、简称等模糊结果不会被当作目标企业，所有平台都未精确命中时返回 `404 NOT_FOUND`。

**fallback 返回（节选）：**

```json
{
  "strategy": "fallback",
  "keyword": "福建正孚软件有限公司",
  "matchBy": "name",
  "source": "aiqicha",
  "company": { "source": "aiqicha", "id": "...", "name": "福建正孚软件有限公司", "...": "与企业详情相同" },
  "attempts": [
    { "source": "qichacha", "status": "error", "durationMs": 463, "error": { "code": "UPSTREAM_BLOCKED", "message": "上游重定向或触发风控" } },
    { "source": "aiqicha", "status": "ok", "durationMs": 2568 }
  ]
}
```

**all 返回（节选）：**

```json
{
  "strategy": "all",
  "results": { "qichacha": { "...": "..." }, "aiqicha": { "...": "..." }, "tianyancha": { "...": "..." } },
  "comparison": {
    "consistentFields": ["name", "creditCode", "legalRepresentative", "..."],
    "differingFields": ["registrationStatus", "basic.industry", "basic.employeeScale"],
    "fields": {
      "registrationStatus": { "consistent": false, "values": { "qichacha": "存续（在营、开业、在册）", "aiqicha": "开业", "tianyancha": "存续" } }
    }
  },
  "attempts": [ "..." ]
}
```

`attempts[].status`：`ok` 成功；`not_found` 该平台未精确命中；`skipped` 未配置凭据（附 `NOT_CONFIGURED`），不会发起请求；`error` 查询失败（附统一错误码）。

`comparison` 规则：至少两个平台有值才判断，某平台缺失不算矛盾；对比时忽略括号全/半角、千分位、金额单位写法（`100万人民币` 与 `100万(元)` 视为一致）和参保人数的“人”字。`values` 保留各平台归一化后的原值。行业、人员规模、经营状态等字段平台口径本就不同，出现在 `differingFields` 属正常。**结果不会跨平台合并**，使用某个值时应同时记录其 `source`。

全部平台都没有成功时，返回统一错误格式并附 `attempts`：全部未配置为 `503 NOT_CONFIGURED`，全部未命中为 `404 NOT_FOUND`，其余为 `502 UPSTREAM_ERROR`。lookup 不支持 `raw`，需要某个平台的完整原始响应时，用 `attempts` 或 `company.id` 调用对应平台的详情接口并加 `raw=true`。

## 来源能力

`GET /api/v1/sources` 可查看当前模式和能力。`configured` 仅表示已提供配置，`liveVerified` 与 `lastVerifiedAt` 表示历史抽样验证，不保证当前凭据有效或平台实时可用。

## 返回结果示例

以下为合成的详情响应节选，展示基础字段、扩展信息及股东模块；其余扩展字段和模块省略：

```json
{
  "source": "aiqicha",
  "fetchedAt": "2026-11-19T00:00:00.000Z",
  "companies": [
    {
      "source": "aiqicha",
      "id": "123",
      "name": "示例科技有限公司",
      "creditCode": null,
      "legalRepresentative": "示例法人",
      "registrationStatus": "开业",
      "registeredCapital": "100万(元)",
      "establishedAt": "2020-01-01",
      "address": "示例注册地址",
      "businessScope": "软件开发；信息技术咨询服务",
      "sourceUrl": "https://aiqicha.baidu.com/company_detail_123",
      "basic": {
        "companyType": "有限责任公司",
        "industry": "软件和信息技术服务业",
        "paidInCapital": "50万(元)",
        "phones": [],
        "emails": [],
        "websites": []
      },
      "modules": {
        "shareholders": {
          "status": "partial",
          "items": [
            {
              "id": null,
              "name": "示例股东",
              "kind": null,
              "ownershipRatio": 0.5,
              "ownershipRatioText": "50%",
              "subscribedCapital": {
                "text": "50万元",
                "amount": "50",
                "currency": "CNY",
                "unit": "万"
              },
              "paidInCapital": null,
              "subscribedAt": null
            }
          ],
          "total": 2,
          "returnedCount": 1,
          "complete": false
        }
      }
    }
  ]
}
```

### 返回字段说明

| 字段 | 说明 |
| :--- | :--- |
| `source`、`sourceUrl` | 平台标识及企业原网页链接 |
| `id`、`name`、`creditCode` | 企业 ID、名称、统一社会信用代码 |
| `legalRepresentative`、`registrationStatus` | 法定代表人、平台原文登记状态 |
| `registeredCapital`、`establishedAt` | 注册资本、成立日期 |
| `address`、`businessScope` | 注册地址、经营范围 |
| `basic` | 15 个工商扩展字段：类型、行业、注册号、组织机构代码、税号、实缴资本、登记机关、核准日期、营业期限、人员规模、参保人数、曾用名、电话、邮箱、官网 |
| `modules` | 股东、主要人员、投资、分支机构、变更、年报模块结果 |
| `fetchedAt` | 本次查询时间，不是工商信息更新时间 |
| `pagination` | 仅搜索返回，包含 `page`、`pageSize`、`total` |
| `raw` | 仅显式请求时附带；是当前端点的响应，不包含其他未请求模块 |

缺失标量返回 `null`。资本原文保留币种与单位；模块金额的 `amount` 是原单位下的十进制字符串，不统一换算成元。股比 `25%` 转为 `0.25`，无法可靠解析时保留原文、数值返回 `null`。

成立、核准等工商日期统一为中国本地日历日 `YYYY-MM-DD`，无法识别的日期原文保持不变。爱企查 `raw` 保留未解码的协议响应，标准化字段使用解码后的数据；企查查 HTTP 详情 `raw` 为企业数据的协议封装，不包含 HTML 或用户会话信息。

## 模块状态：不要只判断数组是否为空

每个模块均有 `status`、`items`、`total`、`returnedCount`、`complete`。`not_returned` 表示本次没有取得明细，**不能认定企业没有记录**；`partial` 表示列表可能被截断。完整状态表、`complete` 的含义及各平台模块范围见 [统一模型与映射 · 模块输出](field-mapping.md#模块输出)。

## 统一错误格式

```json
{
  "error": {
    "code": "AUTH_REQUIRED",
    "message": "此查询需要有效的上游登录状态"
  }
}
```

| code | HTTP | 含义 |
| :--- | :---: | :--- |
| `INVALID_INPUT` | 400 | 参数或 ID 格式无效 |
| `UNAUTHORIZED` | 401 | Corpix API 密钥无效 |
| `AUTH_REQUIRED` | 409 | 上游需要登录或会话失效 |
| `ACCESS_DENIED` | 403 | 上游拒绝访问或账号权限不足 |
| `RATE_LIMITED` | 429 | 本服务或上游限流 |
| `NOT_CONFIGURED` | 503 | 缺少平台 Cookie 配置 |
| `UNSUPPORTED` | 501 | 尚未支持的能力 |
| `UPSTREAM_BLOCKED` | 502 | 验证页、风控或异常重定向 |
| `PARSE_ERROR` | 502 | 数据结构变化、未知编码或响应过大 |
| `UPSTREAM_TIMEOUT` | 504 | 上游查询超时 |
| `UPSTREAM_ERROR` | 502 | 上游连接或业务错误 |
| `INTERNAL_ERROR` | 500 | 服务内部错误 |

## 后端集成示例（TypeScript）

在服务端保存 Corpix API 密钥，先搜索，再使用命中企业的 ID 获取详情：

```typescript
const base = 'http://127.0.0.1:3010';
const authorization = `Bearer ${process.env.CORPIX_API_KEY}`;

async function queryCompany(keyword: string) {
  const search = await fetch(`${base}/api/v1/search`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: authorization },
    body: JSON.stringify({ source: 'qichacha', keyword, pageSize: 5 })
  });
  if (!search.ok) throw new Error(`企业搜索失败：${search.status}`);

  const { companies } = await search.json();
  const company = companies.find((item: { name: string }) => item.name === keyword);
  if (!company) return null;

  const detail = await fetch(
    `${base}/api/v1/companies/${company.source}/${encodeURIComponent(company.id)}`,
    { headers: { Authorization: authorization } }
  );
  if (!detail.ok) throw new Error(`企业详情查询失败：${detail.status}`);
  return (await detail.json()).companies[0];
}
```
