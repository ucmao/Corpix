# 统一模型与平台字段映射

## 实现与范围

现有 9 个基础字段及 `source`、`sourceUrl` 保持兼容。每家企业增加 `basic` 工商扩展信息和 `modules` 模块结果，全部由 TypeScript 适配器归一化。三个来源不自动合并、不互换企业 ID，也不用一个来源的值覆盖另一个来源。跨平台兜底与字段对比由 [lookup 接口](api.md#跨平台统一查询lookup) 提供，结果始终标明来源。

- `src/mapping.ts`：可检查的工商字段路径表，以及日期、比例、金额等转换。
- `src/modules.ts`：嵌套列表映射、缺失/受限/截断状态。
- `src/registry.ts`：Provider 工厂、模式、配置状态与来源能力登记。
- `src/providers/`：各平台协议与响应校验。

2026-11-19 已对四家公司、三个来源完成正式 API 搜索与详情抽样，见 [多公司验证元数据](platform-multisample-verification.json)。新增抽样包括深圳市腾讯计算机系统有限公司、杭州海康威视数字技术股份有限公司、北京科莱特信息技术有限公司，以及原有福州科莱特科技有限公司。仅保存字段结构和验证计数，不保存原始网页、真实响应或会话。

## 工商扩展信息 basic

| 统一字段 | 天眼查 | 企查查 | 爱企查 |
| --- | --- | --- | --- |
| `companyType` 企业类型 | companyOrgType | EconKind | entType / orgType |
| `industry` 行业（国标） | industry2017 / industry | Industry.SubIndustry / Industry.Industry | industry |
| `registrationNumber` 注册号 | regNumber | No | regCode / licenseNumber |
| `organizationCode` 组织机构代码 | orgNumber | OrgNo | orgNo |
| `taxNumber` 纳税识别号 | taxNumber / taxCode | TaxNo | taxNo |
| `paidInCapital` 实缴资本 | actualCapital | RecCap | paidinCapital / realCapital |
| `registrationAuthority` 登记机关 | regInstitute / registerInstitute | BelongOrg | authority |
| `approvedAt` 核准日期 | approvedTime / approveDate | CheckDate（未出现则 null） | annualDate |
| `businessTerm` 营业期限 | businessTerm 或 fromTime/toTime | TermStart/TeamEnd | openTime |
| `employeeScale` 人员规模 | staffNumRange / companyScale | StaffScale / Scale | scale |
| `insuredEmployees` 参保人数原文 | socialStaffNum | Staffs.c | insuranceInfo.insuranceNum |
| `formerNames` 曾用名数组 | historyNames | OriginalName[].Name | prevEntName |
| `phones` 电话数组 | phoneNumber / phone / phoneList | ContactInfo.PhoneNumber / ContactNumber / TelList | telephone / phoneinfo |
| `emails` 邮箱数组 | emailList / email / emails | ContactInfo.Email / Email / EmailList | email / emailinfo |
| `websites` 官网数组 | websiteList / websites | ContactInfo.WebSite[].Url / GW | officialweb / website |

路径按顺序选择首个非 null 标量，列表合并去重。整串只由 `-`、`*`、`—`、`/` 等符号组成的占位值（爱企查常见 `"-"`、`"**"`）视为缺失，继续尝试下一路径，最终为 null 或空数组；`0755-2878****` 这类部分掩码原文保留。

映射注意事项（2026-11-19 三平台交叉核对确认）：

- 天眼查 `industry` 对上市公司是平台自有分类（如“汽车 — 乘用车”），未上市企业可能为空；国标门类/大类在 `industry2017`，优先使用。
- 爱企查 `regNo` 实际返回统一社会信用代码，注册号在 `regCode` / `licenseNumber`。
- 企查查 `Staffs.s` 是参保数据年份，人数在 `Staffs.c`。
- 企查查详情未返回 `CheckDate`，爱企查 `annualDate` 在样本中为 `"**"`，两者 `approvedAt` 目前通常为 null；核准日期以天眼查为准。不存在的字段不会根据其他字段猜值。网页掩码、占位原文、原平台类型代码可能仍出现在字符串字段中；不把它们当作已验证的明文或描述。某些兼容路径未在所有四个样本中出现，实际可得性仍以响应为准。

## 模块输出

```json
{
  "shareholders": {
    "status": "not_returned",
    "items": [],
    "total": 12,
    "returnedCount": 0,
    "complete": null
  }
}
```

上例表示上游报告 12 条，但本次没有取得明细，不能当作无记录。每个模块均有 `status`、`items`、`total`、`returnedCount`、`complete`；必要时附 `reason`、`sourceVariant` 和 `restriction`。

| 状态 | 含义 |
| --- | --- |
| `ok` | 上游声明的总数与本次有效记录数相符，包括明确 total=0 的空结果 |
| `partial` | 取得记录但不完整，或没有总数、无法确认完整性 |
| `not_requested` | 搜索结果没有加载详情模块 |
| `not_returned` | 本次未取得明细，不能据此认定企业没有记录 |
| `access_denied` | 上游明确以登录/会员/权限文案拒绝该模块 |
| `parse_error` | 已返回的模块结构不符合已知映射，保留可解析记录并标记错误 |
| `unsupported` | 预留给明确不支持模块的适配器；未观察到数据不能直接标为不支持 |

`complete` 只表示列表相对于上游本次口径与总数是否齐全，**不表示字段没有掩码、数据一定准确、或覆盖企业所有历史**。未提供总数时为 null。上市公司股东栏目可能是十大股东等不同口径；保留爱企查 `nowType` 为 `sourceVariant`、股东类型为 `kind`，不将原始枚举猜成含义，也不跨来源自动拼接股东名单。

在样本中爱企查部分空块返回 `limitForward.limitStatus="2"`；目前仅保留为 `restriction.code`，没有充分依据将未知枚举断言为具体会员等级或验证码原因。它与空列表同时出现时不会当作明确无记录。HTTP/业务级拒绝仍通过统一 API 错误返回。

| 模块 | 天眼查当前详情 | 企查查当前详情 | 爱企查当前详情 |
| --- | --- | --- | --- |
| `shareholders` | 未返回 | Partners | shareholdersData.list |
| `people` | 未返回 | Employees | directorsData.list |
| `branches` | 未返回 | Branches（样本部分仅计数、无明细） | branchsData.list（可能只有前 10 项） |
| `annualReports` | 未返回 | 未返回 | annualReportData.list，仅标题、年份、链接 |
| `investments` | 未返回 | 未返回 | 有计数与限制信息，尚未取得可验证明细 |
| `changes` | 未返回 | 未返回 | 有计数与限制信息，尚未取得可验证明细 |

未额外请求其他平台模块接口，不自动翻页，不自动切换账号或浏览器。投资/变更已预留统一模型并保留状态及来源计数，**尚未完成实际明细字段映射**；需取得成功响应后再实现。天眼查其他模块未接入，不代表其平台不存在对应数据。

## 记录字段与转换

股东：`id`、`name`、`kind`、`ownershipRatio`、`ownershipRatioText`、`subscribedCapital`、`paidInCapital`、`subscribedAt`。

| 统一字段 | 企查查 | 爱企查 |
| --- | --- | --- |
| name | StockName | name |
| ownershipRatio | StockPercent | subRate |
| subscribedCapital | ShouldCapi | subMoney |
| paidInCapital | RealCapi | realMoney（未返回则 null） |
| subscribedAt | ShoudDate | subDate |

比例 `25%` 转为 `0.25`；无单位数值只接受 0–1，不把 `25` 猜成百分数。原文保留在 `ownershipRatioText`。金额保留 `{text, amount, currency, unit}`：`amount` 为不改变原单位的十进制字符串，例如 100 万元是 amount="100"、unit="万"，不是 100 元。无法解析或掩码则 amount=null，原文仍保留。缺失币种不擅自补为人民币。

主要人员：`id`、`name`、`positions`，分别映射企查查 Name/Job 与爱企查 name/title。两个平台都把多个职务写在同一个字符串里（如 `经理,董事`），按 `,`、`，`、`、`、`;`、`；`、`/` 拆成数组并去重，保留平台原始顺序。

分支机构：`id`、`name`、`status`、`legalRepresentative`、`ownershipRatio`；分支未给出股比时该字段为 null。年报：`year`、`title`、`url`，不是年报全文或财务报表。

工商日期（成立、核准、认缴等）统一输出为中国本地日历日 `YYYY-MM-DD`（按 UTC+8 计算）。企查查数值日期按秒/毫秒数量级分别转换，非正日期哨兵返回 null；天眼查按已观察到的毫秒转换，0 视为缺失。`2000/1/5`、`2000年01月05日` 等字符串规范为 `YYYY-MM-DD`，无法识别的原文（如“无固定期限”）保持不变。`fetchedAt` 是查询时刻，仍为 UTC ISO 时间。

## 新增启信宝、水滴信用等来源

尚未接入或联网验证这些来源，不预置假 Provider。新增流程：

1. 使用被授权的请求方式核对搜索、详情与模块响应，只保存脱敏字段结构及验证记录。
2. 在 `src/types.ts` 的 `sources` 添加来源标识，在 `src/providers/` 实现 Provider。来源变更会使 `Record<Source, ...>` 的缺失映射产生类型错误。
3. 在 `basicFieldMappings` 添加字段路径；为模块实现独立转换，优先复用现有公共模型；平台独有且语义未确认的数据不强塞进公共字段。
4. 在 `sourceDefinitions` 登记 Provider 工厂、配置条件、模式、已验证范围与当前模块可得性。不要仅凭配置了凭据便标记 liveVerified。
5. 增加合成响应的字段、日期、金额、权限、截断和结构变化测试。离线测试不得联网或读取个人账号。
6. 以授权会话完成独立端到端验证，记录日期、样本与失败情况，再更新能力标识与文档。

API 请求参数校验和统一返回结构不需要为每个平台复制一份。
