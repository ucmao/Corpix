<p align="center">
  <img src="assets/corpix-logo.png" alt="Corpix Logo" width="180" />
</p>

<h1 align="center">Corpix</h1>

<p align="center"><strong>多平台企业信息查询与标准化引擎</strong></p>

> **为企业查询后台、客户管理系统与数据服务提供统一的企业信息接口。**  
> 输入企业名称，查询**天眼查、企查查、爱企查、水滴信用、启信宝**，将不同平台的工商字段、股东、主要人员、分支机构、变更记录及年报索引整理成统一 JSON。基于 **TypeScript + Node.js + Fastify**，所有平台均使用 HTTP 请求，无需启动浏览器。

<p align="center">
  <a href="LICENSE"><img src="https://img.shields.io/badge/License-MIT-yellow.svg" alt="License: MIT"></a>
  <img src="https://img.shields.io/badge/Node.js-%3E%3D22.0.0-green.svg" alt="Node.js >= 22">
  <img src="https://img.shields.io/badge/TypeScript-5.x-blue.svg" alt="TypeScript">
  <a href="docs/live-verification.md"><img src="https://img.shields.io/badge/Platforms-5%20verified-blue.svg" alt="5 platforms verified"></a>
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

- **五平台搜索与详情**：天眼查、水滴信用、启信宝支持基础查询已验证；企查查、爱企查支持部署端配置 Cookie。
- **统一工商字段**：9 个基础字段，另提供 15 个工商扩展字段，覆盖行业、实缴资本、登记机关、联系方式等。
- **模块化关联记录**：按实际返回的数据整理股东、主要人员、分支机构、变更记录及年报索引。
- **保留数据边界**：区分未请求、未返回、受限、结构变化和部分列表，不把空列表默认当作无记录。
- **纯 TypeScript 实现**：HTTP 请求、签名、数字解码、映射与 API 使用同一技术栈，无 Python 运行依赖。
- **便于扩展来源**：Provider、字段映射和来源能力集中管理。

**当前版本为 `0.1.0`，处于实验阶段。** 已完成五平台搜索与详情的联网抽样验证；实际可用性受会话、账号权限及源站变化影响，具体范围见 [联网验证记录](docs/live-verification.md)。

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
# 企查查登录会话
QCC_COOKIE=your-qcc-cookie

# 爱企查登录会话
AQC_COOKIE=your-aiqicha-cookie

# 天眼查按需配置；本次基础搜索和详情已验证匿名可用
TYC_COOKIE=

# 水滴信用按需配置；基础搜索和详情默认支持匿名使用
SHUIDI_COOKIE=

# 启信宝按需配置；企业详情默认支持匿名使用，搜索和高频调用建议配置
QXB_COOKIE=

# 本机开发可留空；对外监听时必须设置
API_KEY=
```

Cookie 只由部署者配置，客户端不能通过 API 提交，也不会提升账号权限。全部环境变量见 [配置说明](docs/configuration.md)。

### 方式二：Docker & Docker Compose

创建 `.env`，设置非空 `API_KEY`，并按需配置 `QCC_COOKIE`、`AQC_COOKIE` 后运行：

```bash
docker compose up -d --build

# 查看运行日志
docker compose logs -f
```

Compose 将服务映射到宿主机 `127.0.0.1:3010`，使用各平台 HTTP 适配器。**当前版本的 Docker 构建与容器运行尚未完成端到端验证。**

---

## 🔌 基本用法

| 方法 | 路径 | 用途 |
| :--- | :--- | :--- |
| `GET` | `/health` | 服务健康检查，无需鉴权 |
| `GET` | `/api/v1/sources` | 来源能力、模式与配置状态 |
| `POST` | `/api/v1/lookup` | 跨平台统一查询：自动兜底、多平台比对或智能拼图融合 |
| `POST` | `/api/v1/search` | 按指定平台搜索企业 |
| `GET` | `/api/v1/companies/:source/:id` | 查询企业详情 |

**最简单的用法**：直接传入企业全称或信用代码，**无需指定策略参数，默认即为 `merged` 拼图融合**——并发查询所有已配置平台，自动按“非空字段互补、联系方式并集去重、关联模块质量择优”融合成唯一一份最全企业档案。如果需要顺序容灾可显式传入 `"strategy": "fallback"`，需要全平台原始对照可传入 `"strategy": "all"`：

```bash
curl http://127.0.0.1:3010/api/v1/lookup \
  -H 'Content-Type: application/json' \
  -H 'Authorization: Bearer your-api-key' \
  -d '{"keyword": "福建顶点软件股份有限公司"}'
```

需要指定平台时，先搜索，再用结果中的 `source` 和 `id` 查询详情（不同平台的 ID 不可互换）：

```bash
curl http://127.0.0.1:3010/api/v1/search \
  -H 'Content-Type: application/json' \
  -H 'Authorization: Bearer your-api-key' \
  -d '{"source": "qichacha", "keyword": "深圳市腾讯计算机系统有限公司", "pageSize": 5}'
```

```bash
curl http://127.0.0.1:3010/api/v1/companies/qichacha/your-company-id \
  -H 'Authorization: Bearer your-api-key'
```

返回结构节选（合成数据）：

```json
{
  "source": "aiqicha",
  "companies": [{
    "id": "123",
    "name": "示例科技有限公司",
    "legalRepresentative": "示例法人",
    "registeredCapital": "100万(元)",
    "establishedAt": "2020-01-01",
    "basic": { "companyType": "有限责任公司", "industry": "软件和信息技术服务业" },
    "modules": {
      "shareholders": { "status": "partial", "items": [{ "name": "示例股东", "ownershipRatio": 0.5 }],
                         "total": 2, "returnedCount": 1, "complete": false }
    }
  }]
}
```

> **不要只判断数组是否为空。** 模块的 `status` 为 `not_returned` 表示本次没有取得明细，不代表企业没有记录；`partial` 表示列表可能被截断。

请求参数、完整返回字段、模块状态、错误码和 TypeScript 集成示例见 **[API 参考](docs/api.md)**。

---

## 🌐 支持平台

| 平台 | 标识 | 搜索 / 详情 | 请求方式与条件 |
| :--- | :--- | :--- | :--- |
| 天眼查 | `tianyancha` | 已实现 / 已实现 | HTTP；基础搜索、详情已验证匿名可用，其他权限按源站规则 |
| 企查查 | `qichacha` | 已实现 / 已实现 | HTTP + 有效 Cookie |
| 爱企查 | `aiqicha` | 已实现 / 已实现 | HTTP + 有效 Cookie；支持数字 pid 与同源 slug 解析 |
| 水滴信用 | `shuidi` | 已实现 / 已实现 | HTTP；基础搜索、详情已验证匿名可用，可选配置 Cookie |
| 启信宝 | `qixinbao` | 已实现 / 已实现 | HTTP；详情支持匿名可用，搜索支持匿名/Cookie，提取 SSR 状态并生成确定性签名 |

各平台已接入的股东、人员、分支、年报等模块范围见 [统一模型与映射](docs/field-mapping.md#模块输出)。新增数据源指南见 [统一模型与映射](docs/field-mapping.md#新增数据源指南)。

---

## 📚 文档

| 文档 | 内容 |
| :--- | :--- |
| [API 参考](docs/api.md) | 接口参数、返回字段、模块状态、错误码、集成示例 |
| [配置说明](docs/configuration.md) | 环境变量、安全默认值、平台 Cookie |
| [统一模型与映射](docs/field-mapping.md) | 字段规则、日期/金额/股比转换、模块范围、新平台接入 |
| [联网验证记录](docs/live-verification.md) | 验证范围、结果及未覆盖范围 |
| [架构说明](docs/architecture.md) | 调用链、工程结构与迁移记录 |
| [字段实测清单](docs/platform-field-inventory.md) | 样本实际返回的字段与结构 |

## 🧪 开发

```bash
npm run check   # 类型检查 + 离线测试 + 构建
```

离线测试只使用合成数据，不读取个人 Cookie，也不请求真实平台。

---

## 📄 开源许可证与使用范围

自有代码采用 [MIT 许可证](LICENSE)。许可证不授予第三方平台数据、商标或账号权限，使用者应按平台条款及自身授权使用。仓库不分发真实 Cookie、平台数据集、抓包或第三方脚本副本。

**合规提示：** 本项目通过平台网页接口获取数据，可能与相关平台的用户协议不符；批量抓取或商业使用还可能涉及《反不正当竞争法》《个人信息保护法》等法律风险。请仅在获得授权的范围内、以合理频率使用；商业场景建议优先采用平台官方开放接口。
