<p align="center">
  <img src="assets/corpix-logo.png" alt="Corpix Logo" width="180" />
</p>

<h1 align="center">Corpix</h1>

<p align="center"><strong>多平台企业信息查询与标准化引擎</strong></p>

> **为企业查询后台、客户管理系统与数据服务提供统一的企业信息接口。**  
> 输入企业名称，查询**天眼查、企查查、爱企查**，将不同平台的工商字段、股东、主要人员、分支机构及年报索引整理成统一 JSON。基于 **TypeScript + Node.js + Fastify**，默认使用 HTTP 请求，企查查无需常驻 Chrome。

<p align="center">
  <a href="LICENSE"><img src="https://img.shields.io/badge/License-MIT-yellow.svg" alt="License: MIT"></a>
  <img src="https://img.shields.io/badge/Node.js-%3E%3D22.0.0-green.svg" alt="Node.js >= 22">
  <img src="https://img.shields.io/badge/TypeScript-5.x-blue.svg" alt="TypeScript">
  <a href="docs/live-verification.md"><img src="https://img.shields.io/badge/Platforms-3%20verified-blue.svg" alt="3 platforms verified"></a>
  <a href="Dockerfile"><img src="https://img.shields.io/badge/Docker-Config%20included-2496ED.svg" alt="Docker configuration included"></a>
</p>

---

## 💡 为什么需要 Corpix？

在 CRM、供应商管理、客户核验或企业信息查询工具中，常见的需求是：

> *“输入一家公司名称，从不同平台查到工商信息和关联记录，再用同一套字段展示、入库，不为每个平台重复写一遍业务代码。”*

直接对接多个平台，会遇到这些问题：

1. **字段命名不同**：同一个统一社会信用代码，可能叫 `creditCode`、`CreditCode` 或 `unifiedCode`。
2. **数据格式不同**：时间戳有秒和毫秒之分，金额包含不同币种与单位，股比可能是百分数字符串。
3. **响应结构不同**：股东、人员等信息可能嵌套在详情对象中，也可能只是计数、空列表或首屏数据。
4. **会话与权限不同**：查询失败可能是登录过期、权限不足、限流或验证页，不能一律解释为“没有这家公司”。

**Corpix 将平台请求、字段映射和业务输出分开处理**：调用方使用统一接口，仍能看到数据来源、模块状态与列表是否完整。

### 核心能力

- **三平台搜索与详情**：天眼查匿名查询已抽样验证；企查查、爱企查支持部署端配置 Cookie。
- **统一工商字段**：9 个基础字段，另提供 15 个工商扩展字段，覆盖行业、实缴资本、登记机关、联系方式等。
- **模块化关联记录**：按实际返回的数据整理股东、主要人员、分支机构及年报索引。
- **保留数据边界**：区分未请求、未返回、受限、结构变化和部分列表，不把空列表默认当作无记录。
- **纯 TypeScript 实现**：HTTP 请求、签名、数字解码、映射与 API 使用同一技术栈，无 Python 运行依赖。
- **便于扩展来源**：Provider、字段映射和来源能力集中管理，可继续添加启信宝、水滴信用等适配器。

**当前版本为 `0.1.0`，处于实验阶段。** 2026-11-19 已通过正式 API 在 4 家公司、3 个平台上完成 12 组搜索与详情验证。该记录不是实时探活或全平台可用性承诺；具体范围见下方验证说明。

---

## 🚀 快速开始

### 方式一：本地 Node.js 运行

要求 **Node.js 22 或更新版本**及 npm。在项目目录中执行：

```bash
# 1. 安装依赖
npm ci

# 2. 创建本地配置
cp .env.example .env

# 3. 按需编辑 .env，配置平台 Cookie 与服务密钥

# 4. 构建并启动
npm run build
npm start

# 或开发模式运行（支持热重载）
# npm run dev
```

默认地址：`http://127.0.0.1:3010`。检查服务和来源配置：

```bash
curl http://127.0.0.1:3010/health
curl http://127.0.0.1:3010/api/v1/sources
```

配置 `API_KEY` 后，访问 `/api/` 接口需增加 `Authorization: Bearer <API_KEY>` 请求头。`/health` 无需鉴权，仅表示服务存活，不检测上游平台。

### 平台配置

在 `.env` 中按需填写：

```dotenv
# 默认 HTTP 模式，无需启动 Chrome
QCC_MODE=http
QCC_COOKIE=your-qcc-cookie

# 爱企查登录会话
AQC_COOKIE=your-aiqicha-cookie

# 天眼查按需配置；本次基础搜索和详情已验证匿名可用
TYC_COOKIE=

# 本机开发可留空；对外监听时必须设置
API_KEY=
```

Cookie 只由服务部署者设置，客户端不能通过 API 提交。Cookie 对应账号的现有权限，不能增加会员权益；会话失效后需更新。项目不自动登录、处理验证码或轮换账号。

### 方式二：Docker & Docker Compose

创建 `.env`，设置非空 `API_KEY`，并按需配置 `QCC_COOKIE`、`AQC_COOKIE` 后运行：

```bash
docker compose up -d --build

# 查看运行日志
docker compose logs -f
```

Compose 将服务映射到宿主机 `127.0.0.1:3010`，使用三平台 HTTP 适配器。**当前版本的 Docker 构建与容器运行尚未完成端到端验证。** 可选的企查查浏览器模式建议在本机运行。

---

## 🔌 API 接口与使用规范

### 接口定义

| 方法 | 路径 | 用途 |
| :--- | :--- | :--- |
| `GET` | `/health` | 服务健康检查，无需鉴权 |
| `GET` | `/api/v1/sources` | 来源能力、模式与配置状态 |
| `POST` | `/api/v1/search` | 按指定平台搜索企业 |
| `GET` | `/api/v1/companies/:source/:id` | 查询企业详情 |

### 企业搜索

```bash
curl http://127.0.0.1:3010/api/v1/search \
  -H 'Content-Type: application/json' \
  -H 'Authorization: Bearer your-api-key' \
  -d '{
    "source": "qichacha",
    "keyword": "福州科莱特科技有限公司",
    "page": 1,
    "pageSize": 5
  }'
```

#### 请求参数（JSON Body）

| 参数 | 类型 | 必填 | 默认值 | 说明 |
| :--- | :--- | :---: | :--- | :--- |
| `source` | `string` | 是 | — | `tianyancha` / `qichacha` / `aiqicha` |
| `keyword` | `string` | 是 | — | 1–100 字符，自动去除首尾空格 |
| `page` | `number` | 否 | `1` | 整数，范围 1–100；实际分页权限由上游决定 |
| `pageSize` | `number` | 否 | `20` | 整数，范围 1–20；上游可能截断返回数量 |
| `raw` | `boolean` | 否 | `false` | 是否附带本次请求的原始响应 |

未设置 `API_KEY` 的本机开发环境可省略鉴权请求头。搜索结果可能包含名称相关但并非目标主体的公司，应结合名称和统一社会信用代码核对。

### 企业详情

将搜索结果中的 `source` 和 `id` 原样用于详情查询：

```bash
curl 'http://127.0.0.1:3010/api/v1/companies/qichacha/13ec2b5c04a2be6df49cbebf32216b38?raw=false' \
  -H 'Authorization: Bearer your-api-key'
```

- 天眼查：数字企业 ID。
- 企查查：32 位十六进制 `KeyNo`。
- 爱企查：数字 `pid`，或可通过同源跳转解析的详情页 slug。

**不同平台的企业 ID 不可互换。** 当前不自动合并跨平台结果，也不使用其他平台的数据补齐缺失值。

### 返回结果示例

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

#### 返回字段说明

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

数值时间戳按平台的秒/毫秒格式转换成 UTC ISO 字符串，日期字符串保留原文。爱企查 `raw` 保留未解码的协议响应，标准化字段使用解码后的数据；企查查 HTTP 详情 `raw` 为企业数据的协议封装，不包含 HTML 或用户会话信息。

### 模块状态：不要只判断数组是否为空

| 状态 | 含义 |
| :--- | :--- |
| `ok` | 本次列表条数与上游声明总数相符；包括明确总数为 0 的情况 |
| `partial` | 返回部分记录，或缺少总数、无法确认完整性 |
| `not_requested` | 搜索结果未加载详情模块 |
| `not_returned` | 本次没有取得明细，不能认定企业没有记录 |
| `access_denied` | 上游明确返回该模块的登录或权限限制 |
| `parse_error` | 已返回的模块结构不符合已知映射 |
| `unsupported` | 为明确不支持该模块的适配器预留 |

`complete` 只表示列表相对于上游本次口径是否齐全，不保证字段没有掩码。`sourceVariant` 保留来源栏目类型；`restriction` 保留限制信息。上市公司股东口径可能不同，不应直接拼接不同平台的名单。年报模块目前仅提供索引，未获取年报全文。

完整字段定义与转换规则见 [统一模型与映射](docs/field-mapping.md)。

### 后端集成示例（TypeScript）

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

---

## 🌐 支持平台与数据模块

| 平台 | 标识 | 搜索 / 详情 | 请求方式与条件 |
| :--- | :--- | :--- | :--- |
| 天眼查 | `tianyancha` | 已实现 / 已实现 | HTTP；基础搜索、详情已验证匿名可用，其他权限按源站规则 |
| 企查查 | `qichacha` | 已实现 / 已实现 | 默认 Cookie + HTTP；可显式选择本机 CDP 浏览器模式 |
| 爱企查 | `aiqicha` | 已实现 / 已实现 | HTTP + 有效 Cookie；支持数字 pid 与同源 slug 解析 |

下表表示**当前适配器整理的响应范围**，不是各平台的全部数据能力：

| 模块 | 天眼查 | 企查查 HTTP | 爱企查 |
| :--- | :--- | :--- | :--- |
| 基础信息与工商扩展 | 已接入 | 已接入 | 已接入 |
| 股东 `shareholders` | 当前详情未返回 | 已接入 | 已接入 |
| 主要人员 `people` | 当前详情未返回 | 已接入 | 已接入 |
| 分支机构 `branches` | 当前详情未返回 | 已映射，部分样本只有计数 | 已接入，可能为首屏列表 |
| 年报 `annualReports` | 当前详情未返回 | 当前详情未返回 | 已接入索引 |
| 投资 `investments` | 未接入明细 | 未接入明细 | 返回计数/限制信息，未接入明细 |
| 变更 `changes` | 未接入明细 | 未接入明细 | 返回计数/限制信息，未接入明细 |

启信宝、水滴信用尚未接入或联网验证。扩展时新增来源标识、Provider、字段映射及来源能力登记，并补充合成响应测试与独立联网验证，流程见 [新增平台指南](docs/field-mapping.md#新增启信宝水滴信用等来源)。

`GET /api/v1/sources` 可查看当前模式和能力。`configured` 仅表示已提供配置，`liveVerified` 与 `lastVerifiedAt` 表示历史抽样验证，不保证当前凭据有效或平台实时可用。

---

## 🔐 配置与错误处理

### 环境变量

| 变量 | 默认值 | 说明 |
| :--- | :--- | :--- |
| `HOST` | `127.0.0.1` | 监听地址；监听外部地址必须配置 `API_KEY` |
| `PORT` | `3010` | 服务端口 |
| `API_KEY` | 空 | `/api/` 路由使用 `Authorization: Bearer <API_KEY>` 鉴权 |
| `RATE_LIMIT_PER_MINUTE` | `30` | 每个客户端 IP 每分钟请求上限，范围 1–10000 |
| `UPSTREAM_TIMEOUT_MS` | `20000` | 单次上游 HTTP/CDP 操作超时，毫秒 |
| `TYC_COOKIE` | 空 | 可选天眼查 Cookie 请求头 |
| `QCC_COOKIE` | 空 | 企查查 HTTP 模式 Cookie 请求头 |
| `QCC_MODE` | 自动选择 | `http` / `browser`；未设置时优先 Cookie，仅有 CDP 地址则选择浏览器；`.env.example` 显式使用 `http` |
| `QCC_CDP_URL` | 空 | 浏览器模式使用的本机 Chrome HTTP 调试地址 |
| `AQC_COOKIE` | 空 | 爱企查有效 Cookie 请求头，不强制某个 Cookie 名称 |

内置参数校验、鉴权、限流与错误分类。HTTP 请求校验证书、禁止自动跟随重定向，单次响应上限 4 MiB；不自动重试、切换平台或补齐其他来源的数据。默认未开启 CORS，也不信任代理转发的客户端 IP；反向代理部署时需按实际网络配置限流。

### 统一错误格式

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
| `NOT_CONFIGURED` | 503 | 缺少 Cookie 或浏览器配置 |
| `UNSUPPORTED` | 501 | 尚未支持的能力 |
| `UPSTREAM_BLOCKED` | 502 | 验证页、风控或异常重定向 |
| `PARSE_ERROR` | 502 | 数据结构变化、未知编码或响应过大 |
| `UPSTREAM_TIMEOUT` | 504 | 上游或浏览器查询超时 |
| `UPSTREAM_ERROR` | 502 | 上游连接或业务错误 |
| `INTERNAL_ERROR` | 500 | 服务内部错误 |

### 可选：企查查浏览器模式

默认 HTTP 模式不需要此步骤。使用浏览器模式时，在 `.env` 设置：

```dotenv
QCC_MODE=browser
QCC_CDP_URL=http://127.0.0.1:9222
```

macOS 可使用独立临时目录启动 Chrome 调试实例，再手动打开 `https://www.qcc.com/` 登录：

```bash
"/Applications/Google Chrome.app/Contents/MacOS/Google Chrome" \
  --remote-debugging-port=9222 \
  --user-data-dir="$TMPDIR/corpix-chrome"
```

服务只连接本机调试端口、选择准确域名的现有页面，不负责启动、导航、登录或导出 Cookie。浏览器模式尚未完成真实会话端到端验证，不会在 HTTP 失败时自动启用。容器内的 `127.0.0.1` 无法直接连接宿主机 Chrome。

---

## 🧪 测试与联网验证

| 命令 | 网络 | 说明 |
| :--- | :---: | :--- |
| `npm run typecheck` | 离线 | 检查源码与测试类型 |
| `npm test` | 离线 | 合成数据单元测试与模拟 HTTP/CDP 测试 |
| `npm run build` | 离线 | 编译 TypeScript，生成 `dist/` |
| `npm run check` | 离线 | 依次执行类型检查、测试、构建 |

离线测试不读取个人 Cookie，不请求真实平台。覆盖字段映射、日期单位、金额与股比、模块状态、DDW 解码、请求签名、会话更新、鉴权、限流与错误分类。

**2026-11-19 联网抽样：**

| 企业 | 天眼查搜索 / 详情 | 企查查 HTTP 搜索 / 详情 | 爱企查搜索 / 详情 |
| :--- | :---: | :---: | :---: |
| 福州科莱特科技有限公司 | 通过 / 通过 | 通过 / 通过 | 通过 / 通过 |
| 深圳市腾讯计算机系统有限公司 | 通过 / 通过 | 通过 / 通过 | 通过 / 通过 |
| 杭州海康威视数字技术股份有限公司 | 通过 / 通过 | 通过 / 通过 | 通过 / 通过 |
| 北京科莱特信息技术有限公司 | 通过 / 通过 | 通过 / 通过 | 通过 / 通过 |

通过正式 API 调用链共验证 **12 组搜索与详情**。未覆盖所有关键词、后续搜索分页、会话过期、全部会员字段或长期稳定性；部分嵌套列表只有首屏，投资/变更明细未取得，Docker 与浏览器模式仍待独立验收。

- [联网验证记录](docs/live-verification.md)：验证范围、结果及已知限制。
- [多公司验证元数据](docs/platform-multisample-verification.json)：状态与条目计数，不含凭据或原始响应。
- [字段实测清单](docs/platform-field-inventory.md)：单个样本实际返回的字段与结构。
- [统一模型与映射](docs/field-mapping.md)：字段规则、模块状态与新平台接入方法。
- [架构说明](docs/architecture.md)：调用链、工程结构与迁移记录。

---

## 📄 开源许可证与使用范围

自有代码采用 [MIT 许可证](LICENSE)。许可证不授予第三方平台数据、商标或账号权限，使用者应按平台条款及自身授权使用。仓库不分发真实 Cookie、浏览器用户目录、平台数据集、抓包或第三方脚本副本。
