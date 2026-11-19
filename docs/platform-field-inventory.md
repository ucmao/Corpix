# 三平台字段实测清单

日期：2026-11-19。查询对象：福州科莱特科技有限公司。

天眼查使用匿名请求；企查查、爱企查使用用户授权会话。仅请求指定企业的首屏搜索与基础详情，未额外请求股东分页、年报全文、司法或知识产权接口。企查查详情来自 HTTP 页面初始数据；其余详情来自对应 HTTP JSON 接口。

本文及配套 JSON 只保存字段名称、类型、结构和条目计数，不保存字段值、Cookie 或原始响应。字段数量统计的是指定企业对象的直接子字段，包含 null、空列表、展示配置和权限标记，不等于有效业务字段数量；不同平台的对象边界也不完全相同，不宜据此直接排名。嵌套数组结构仅采样首个元素。

## 直接字段数量

| 来源 | 对象 | 路径 | 顶层字段数 |
| --- | --- | --- | --- |
| 天眼查 | 搜索中的指定企业 | `data.companyList[exact]` | 186 |
| 企查查 | 搜索中的指定企业 | `Result[exact]` | 57 |
| 天眼查 | 企业详情对象 | `data` | 116 |
| 企查查 | 企业详情对象 | `company.companyDetail` | 135 |
| 爱企查 | 搜索中的指定企业 | `data.resultList[exact]` | 44 |
| 爱企查 | 企业详情对象 | `data.basicData` | 50 |

## 本次确实返回的额外内容

- 天眼查详情包含实缴资本、行业、人员规模、参保人数、登记机关、核准时间、营业期限、曾用名及联系方式等字段。详情的 emailList 有 2 项，但 phoneList 为空、websiteList 为 null；字段存在不表示内容可用。本次详情对象未包含名为股东/主要人员明细的直接列表，不代表平台没有对应接口。
- 企查查详情的 Partners 返回 5 项，Employees 返回 2 项；ContactInfo 包含电话、邮箱及 1 项官网记录。股东首项结构包含 StockName、StockPercent、ShouldCapi、RealCapi 等键，人员首项结构包含 Name、Job 等键；存在的字段值是否完整或掩码不在本清单的验证范围内。Branches、StockChange 等列表本次为空，不能断言对应业务不存在。
- 爱企查详情在 basicData 之外同时返回 shareholdersData.list（5 项）、directorsData.list（2 项）、annualReportData.list（5 项）。股东首项含 name、subRate、subMoney、subDate；人员首项含 name、title；年报索引首项只有 name、link，未取得年报全文。riskInsight 返回摘要结构；变更、投资、财务等块有结构或权限相关字段，但本次 list 为空。

## 爱企查外层 14 个数据块

| 数据块 | 本次明细列表长度 | 说明 |
| --- | --- | --- |
| `annualReportData` | 5 | 年报索引，非全文 |
| `authPerson` | 0 | 认证相关 |
| `basicData` | — | 基本信息，50 个直接字段 |
| `benefitPersonData` | 0 | 受益人；包含 limitForward |
| `branchsData` | 0 | 分支机构 |
| `changeRecordData` | 0 | 变更；包含 limitForward |
| `directorsData` | 2 | 主要人员 |
| `entIndirectHolds` | 0 | 间接持股；包含 limitForward |
| `financialData` | 0 | 财务；包含 limitForward |
| `headCompany` | 0 | 总公司 |
| `holdsData` | 0 | 控股；包含 limitForward |
| `investRecordData` | 0 | 投资；包含 limitForward |
| `riskInsight` | — | 风险摘要，非全部风险明细 |
| `shareholdersData` | 5 | 股东 |

空列表可能与本次接口、账号权限、延迟加载或实际无数据有关，不能仅凭本清单判断原因。

## 每个平台实际字段名

### 天眼查：搜索中的指定企业

路径：`data.companyList[exact]`。186 个直接字段：

- `id`：number
- `name`：string
- `type`：number
- `matchType`：null，空值或空结构
- `base`：string
- `legalPersonName`：string
- `estiblishTime`：string
- `regCapital`：string
- `regStatus`：string
- `score`：string
- `orginalScore`：string
- `bonusScore`：string
- `companyScore`：string
- `historyNames`：string
- `categoryCode`：string
- `industry`：null，空值或空结构
- `humanNames`：null，空值或空结构
- `trademarks`：null，空值或空结构
- `tmList`：null，空值或空结构
- `productList`：null，空值或空结构
- `usedBondName`：null，空值或空结构
- `bondName`：null，空值或空结构
- `bondNum`：null，空值或空结构
- `bondType`：null，空值或空结构
- `newtestName`：null，空值或空结构
- `regNumber`：string
- `orgNumber`：string
- `creditCode`：string
- `businessScope`：string
- `regLocation`：string
- `phone`：null，空值或空结构
- `phoneList`：array，本次 0 项，空值或空结构
- `phoneInfoList`：null，空值或空结构
- `businessItemList`：null，空值或空结构
- `phoneNum`：null，空值或空结构
- `logo`：string
- `city`：string
- `district`：null，空值或空结构
- `emails`：null，空值或空结构
- `emailList`：array，本次 2 项
- `websites`：null，空值或空结构
- `hiddenPhones`：null，空值或空结构
- `abbr`：null，空值或空结构
- `tagList`：null，空值或空结构
- `companyType`：number
- `companyOrgType`：null，空值或空结构
- `labelList`：null，空值或空结构
- `matchField`：null，空值或空结构
- `latitude`：null，空值或空结构
- `longitude`：null，空值或空结构
- `legalPersonId`：string
- `legalPersonType`：string
- `distance`：null，空值或空结构
- `categoryStr`：null，空值或空结构
- `isClaimed`：number
- `claimPkgType`：null，空值或空结构
- `realClaimPkgType`：null，空值或空结构
- `baiduUrl`：null，空值或空结构
- `isBranch`：number
- `alias`：string
- `claimInfo`：null，空值或空结构
- `hidden`：number
- `legalPersonShowStr`：string
- `regCapitalShowStr`：string
- `estiblishTimeShowStr`：string
- `multiMatchField`：array，本次 0 项，空值或空结构
- `labelListV2`：null，空值或空结构
- `labelJsonList`：null，空值或空结构
- `taxCode`：string
- `categoryCodeStd`：null，空值或空结构
- `hasMorePhone`：null，空值或空结构
- `hasVideo`：null，空值或空结构
- `videoId`：null，空值或空结构
- `isRecommend`：null，空值或空结构
- `englishName`：null，空值或空结构
- `firstPositionShowStr`：string
- `secondPositionShowStr`：string
- `firstPositionValue`：string
- `secondPositionValue`：string
- `bizType`：string
- `docFeature`：string
- `companyNum`：null，空值或空结构
- `department`：string，空值或空结构
- `illegalType`：string
- `targetGid`：string，空值或空结构
- `targetName`：string，空值或空结构
- `changeTime`：string，空值或空结构
- `isIn`：string，空值或空结构
- `mainId`：string，空值或空结构
- `targetRegCapitalAmount`：string，空值或空结构
- `targetRegCapitalCurrency`：string，空值或空结构
- `legalPerson`：string，空值或空结构
- `gidForB`：string
- `geoLocation`：null，空值或空结构
- `websiteFilingCount`：number
- `repCurrency`：null，空值或空结构
- `province`：null，空值或空结构
- `areaCodes`：null，空值或空结构
- `address`：null，空值或空结构
- `establishmentTime`：string
- `icps`：null，空值或空结构
- `icp`：string，空值或空结构
- `changeRatio`：string，空值或空结构
- `afterRatio`：string，空值或空结构
- `changeAmt`：string，空值或空结构
- `registerInstitute`：string
- `companyScale`：null，空值或空结构
- `abstractsBaseInfo`：string
- `financingRound`：string
- `staffNumReportYear`：number
- `categoryCode2017List`：null，空值或空结构
- `institutionTypeList`：null，空值或空结构
- `companyBrandInfo`：null，空值或空结构
- `companyGroupInfo`：null，空值或空结构
- `contantMap`：null，空值或空结构
- `companyPhoneBook`：null，空值或空结构
- `companyQuestions`：null，空值或空结构
- `selfRiskCount`：number
- `legalPersonLogo`：null，空值或空结构
- `legalPersonAlias`：null，空值或空结构
- `relatedRiskCount`：number
- `historyRiskCount`：number
- `followLabel`：null，空值或空结构
- `contentType`：number
- `normalWord`：null，空值或空结构
- `suggestWordList`：null，空值或空结构
- `companyHumanInfo`：null，空值或空结构
- `phoneType`：null，空值或空结构
- `phoneTips`：null，空值或空结构
- `publicSentimentNewsInfo`：null，空值或空结构
- `qfLabels`：null，空值或空结构
- `productShowMore`：null，空值或空结构
- `isBrandArea`：number
- `areaType`：number
- `customizedImagePath`：string，空值或空结构
- `isBrandAreaControlGroup`：number
- `adsFlag`：null，空值或空结构
- `isCooperationShow`：null，空值或空结构
- `cooperationUrl`：string，空值或空结构
- `albumHeadImgPath`：null，空值或空结构
- `albumCount`：null，空值或空结构
- `websiteUrl`：null，空值或空结构
- `websiteRiskType`：null，空值或空结构
- `hotMsg`：null，空值或空结构
- `hotType`：null，空值或空结构
- `competitorName`：null，空值或空结构
- `brandInstitutionGroupCard`：null，空值或空结构
- `appDynamicCompanyCard`：null，空值或空结构
- `emptyRecommendTextCard`：null，空值或空结构
- `emptyRecommendCompanyCard`：null，空值或空结构
- `recommendScene`：null，空值或空结构
- `companyBrand`：object
- `companyGroup`：object
- `institutionCard`：null，空值或空结构
- `verticalCard`：null，空值或空结构
- `phoneTagType`：null，空值或空结构
- `aladdinCompanyCard`：null，空值或空结构
- `illegalSocialOrganization`：null，空值或空结构
- `labelListV3`：array，本次 2 项
- `regStatusLabel`：array，本次 1 项
- `newlyCompanyCard`：null，空值或空结构
- `deepSearchCard`：null，空值或空结构
- `legalPersonForList`：string
- `regCapitalForList`：string
- `provinceName`：null，空值或空结构
- `cityName`：null，空值或空结构
- `districtName`：null，空值或空结构
- `categoryNameLv1`：null，空值或空结构
- `categoryNameLv2`：null，空值或空结构
- `categoryNameLv3`：null，空值或空结构
- `categoryNameLv4`：null，空值或空结构
- `orgType`：null，空值或空结构
- `approveDate`：null，空值或空结构
- `businessTerm`：null，空值或空结构
- `companyScaleInfo`：null，空值或空结构
- `followInfo`：object
- `legalPersonList`：array，本次 1 项
- `englishNameForTab`：string
- `humanInfo`：object
- `dimNavigationList`：array，本次 7 项
- `noActualCapital`：null，空值或空结构
- `threeMonthsLawsuit`：null，空值或空结构
- `residentialBuilding`：null，空值或空结构
- `executive`：null，空值或空结构
- `qualifiedFinancialProduct`：null，空值或空结构
- `socialSecurityStaffNum`：string

### 企查查：搜索中的指定企业

路径：`Result[exact]`。57 个直接字段：

- `KeyNo`：string
- `Name`：string
- `Type`：number
- `No`：string
- `CreditCode`：string
- `OperName`：string
- `Status`：string
- `StartDate`：number
- `Address`：string
- `RegistCapi`：string
- `ContactNumber`：string
- `Email`：string
- `ImageUrl`：string
- `TelList`：string
- `IsAuth`：boolean
- `OperInfo`：string
- `TagsInfo`：null，空值或空结构
- `Flag`：string
- `Tag`：string
- `EmailList`：array，本次 3 项
- `AuthLevel`：number
- `IsHide`：boolean
- `AreaCode`：string
- `QccCode`：string，空值或空结构
- `GW`：string
- `CountInfo`：array，本次 32 项
- `Industry`：object
- `EconKind`：string
- `TagsInfoV2`：array，本次 3 项
- `NewRegNo`：string，空值或空结构
- `OfcAddress`：array，本次 0 项，空值或空结构
- `IsCert`：boolean
- `StandardCode`：array，本次 3 项
- `AiIntro`：string
- `QccIndustry`：object
- `ShortStatus`：string
- `FlagToB`：null，空值或空结构
- `HideReason`：string，空值或空结构
- `Introduction`：string
- `IsIndividual`：boolean
- `Scale`：string
- `TermStart`：number
- `TermEnd`：number
- `InsuredYear`：string
- `OperType`：number
- `EntType`：string
- `HitReason`：object
- `HitReasons`：array，本次 1 项
- `Area`：object
- `X`：number
- `Y`：number
- `Score`：number
- `MoreTelCnt`：number
- `MoreEmailCnt`：number
- `ApiError`：boolean
- `ApiScore`：number
- `Reason`：string

### 天眼查：企业详情对象

路径：`data`。116 个直接字段：

- `historyNames`：string
- `estiblishTimeTitleName`：string
- `emailList`：array，本次 2 项
- `year4SocialStaffNum`：number
- `orgTypeName`：string
- `institutionType`：object
- `relatedIndustryChainCount`：number
- `type`：number
- `equityUrl`：string
- `showTrendChart`：boolean
- `legalPersonType`：number
- `property3`：string
- `companyShowBizTypeName`：string
- `regCapitalLabel`：string
- `companyTimeTitle`：string
- `industryNationalStdLv3Code`：string
- `industry2017`：string
- `id`：number
- `orgNumber`：string
- `isClaimed`：number
- `listedStatusTypeForSenior`：number
- `taxPhone`：string，空值或空结构
- `enterpriseScaleInfo`：object
- `entityType`：number
- `companyBizOrgType`：string
- `taxNumber`：string
- `shortname`：string
- `tags`：string
- `taxQualification`：string
- `scienceTechnologyInfo`：object
- `extraInfo`：null，空值或空结构
- `baseInfo`：string
- `operatingIncomeInfo`：null，空值或空结构
- `regCapital`：string
- `staffNumRange`：string
- `industry`：string
- `companyAssets`：null，空值或空结构
- `industryInfo`：object
- `emailDetailList`：array，本次 2 项
- `tagListV2`：array，本次 4 项
- `companyProfilePlainText4Copy`：string
- `tagListV3`：array，本次 4 项
- `regNumber`：string
- `addressList`：array，本次 2 项
- `fromTime`：number
- `socialStaffNum`：string
- `companyOrgType`：string
- `year4BranchSocialStaffNum`：null，空值或空结构
- `enNameSource`：string
- `taxAddress`：string
- `email`：string
- `actualCapital`：string
- `companyTimeExplain`：string
- `phoneSourceList`：array，本次 0 项，空值或空结构
- `estiblishTime`：number
- `branchSocialStaffNum`：null，空值或空结构
- `regInstitute`：string
- `listedStatusType`：number
- `parentId`：null，空值或空结构
- `websiteList`：null，空值或空结构
- `safetype`：string
- `legalPersonId`：number
- `complexName`：string
- `companyProfileRichText`：array，本次 2 项
- `staffNumInfo`：object
- `updatetime`：number
- `companyCreditCode`：string
- `regStatus`：string
- `listedPlateList`：array，本次 0 项，空值或空结构
- `showIpoTutor`：boolean
- `historyNameNews`：array，本次 1 项
- `phoneList`：array，本次 0 项，空值或空结构
- `legalPersonPid`：string
- `sensitiveEntityType`：number
- `industryChainList`：array，本次 5 项
- `companyProfilePlainText`：string
- `approvedTime`：number
- `logo`：string
- `originalPercentileScore`：number
- `businessScope`：string
- `portray`：string
- `regCapitalCurrency`：string
- `isBranch`：boolean
- `regCapitalAmount`：string
- `staffNumInfoListThreeYear`：array，本次 3 项
- `phoneNumber`：string，空值或空结构
- `tdkInfo`：object
- `name`：string
- `percentileScore`：number
- `businessStatusInfo`：null，空值或空结构
- `showCapitalReductionNoticeCount`：boolean
- `newCompanyIncome`：null，空值或空结构
- `regLocationTitle`：string
- `wechatCount`：number
- `newCompanyProfit`：null，空值或空结构
- `link`：number
- `coreRelatedIndustryChainCount`：number
- `updateTime4Index`：number
- `legalTitleName`：string
- `regTitleName`：string
- `updateTimes`：number
- `legalPersonName`：string
- `operatingProfitInfo`：null，空值或空结构
- `creditCode`：string
- `alias`：string
- `toTime`：number
- `staffNumInfoList`：object
- `showBranchTrendChart`：boolean
- `companyType`：number
- `companyBizType`：number
- `regLocation`：string
- `regCapitalAmountUnit`：string
- `tagList`：array，本次 6 项
- `regCapitalAmt`：number
- `legalInfo`：object
- `base`：string

### 企查查：企业详情对象

路径：`company.companyDetail`。135 个直接字段：

- `_id`：string
- `Name`：string
- `No`：string
- `BelongOrg`：string
- `BelongOrgInfos`：array，本次 1 项
- `Oper`：object
- `MultipleOper`：object
- `StartDate`：number
- `EndDate`：number
- `Status`：string
- `Province`：string
- `ShortStatus`：string
- `CreditCode`：string
- `RegistCapi`：string
- `EconKind`：string
- `Address`：string
- `IsExpired`：boolean
- `Scope`：string
- `ImageUrl`：string
- `OrgNo`：string
- `EnglishName`：string
- `DUNSNo`：string，空值或空结构
- `Type`：number
- `Tag`：null，空值或空结构
- `Financing`：null，空值或空结构
- `TermStart`：number
- `TeamEnd`：number
- `TaxNo`：string
- `CbuItem`：null，空值或空结构
- `AbuItem`：null，空值或空结构
- `OpForm`：null，空值或空结构
- `RecCap`：string
- `Industry`：object
- `IndustryV3`：object
- `IndustryV4`：object
- `OriginalName`：array，本次 1 项
- `Partners`：array，本次 5 项
- `Employees`：array，本次 2 项
- `ContactInfo`：object
- `Area`：object
- `ChangeDiffInfo`：object，空值或空结构
- `HistoryDataList`：array，本次 0 项，空值或空结构
- `Tags`：array，本次 5 项
- `Product`：object
- `HisTelList`：array，本次 2 项
- `CommonList`：array，本次 30 项
- `CompanyStatus`：number
- `ShardHolderTitleType`：string
- `Source`：string，空值或空结构
- `HoldingType`：string
- `RevokeEntity`：null，空值或空结构
- `Assistance`：array，本次 0 项，空值或空结构
- `LicenseStatement`：array，本次 0 项，空值或空结构
- `Enliq`：array，本次 0 项，空值或空结构
- `MPledge`：array，本次 0 项，空值或空结构
- `SpotCheck`：array，本次 0 项，空值或空结构
- `DoubleRandomChecks`：array，本次 0 项，空值或空结构
- `SimpleCancellationList`：array，本次 0 项，空值或空结构
- `SimpleCancellation`：object，空值或空结构
- `Exceptions`：array，本次 0 项，空值或空结构
- `SeriousViolations`：array，本次 0 项，空值或空结构
- `Liquidation`：object，空值或空结构
- `Pledge`：array，本次 0 项，空值或空结构
- `Penalty`：array，本次 0 项，空值或空结构
- `PersonateList`：array，本次 0 项，空值或空结构
- `StockHolders`：array，本次 0 项，空值或空结构
- `StockChange`：array，本次 0 项，空值或空结构
- `Branches`：array，本次 0 项，空值或空结构
- `CompanyLicens`：array，本次 0 项，空值或空结构
- `CountInfo`：object
- `HisCountInfo`：null，空值或空结构
- `KeyNo`：string
- `MoreEmailList`：array，本次 3 项
- `HasEntranceOfShareHolderCorrection`：boolean
- `IsHideCS`：boolean
- `IsStandardAddress`：number
- `AddressList`：array，本次 2 项
- `ShortName`：string
- `IECCode`：string，空值或空结构
- `SameTelAddressList`：array，本次 3 项
- `LatestAnnualReportAddrInfo`：array，本次 0 项，空值或空结构
- `Staffs`：object
- `VTList`：array，本次 2 项
- `ASList`：array，本次 0 项，空值或空结构
- `BankInfo`：object
- `AreaCode`：string
- `RealCapiSource`：object
- `TranslatorCode`：string
- `Scale`：string
- `StandardCode`：array，本次 3 项
- `ARStatus`：string，空值或空结构
- `IsOfficialEnglish`：number
- `Abstract`：string
- `SameEmailList`：array，本次 4 项
- `StaffHisCntInfo`：object
- `StaffHisCntPopUpInfo`：array，本次 1 项
- `MagnifiableImage`：number
- `QccIndustry`：object
- `StaffScale`：string
- `HospitalInfo`：null，空值或空结构
- `QccCode`：string
- `PostalCode`：string
- `IndustryChains`：object
- `RegistCapiTrend`：object
- `SchoolInfo`：object，空值或空结构
- `Filing`：object
- `SwiftCode`：string，空值或空结构
- `BankCodeOfPaymentSystem`：string，空值或空结构
- `BeneficiaryTypeInfo`：array，本次 1 项
- `AIAbstract`：string
- `TaxpayerType`：string
- `QccAbstractPrefix`：string
- `OregInfo`：null，空值或空结构
- `TagsInfoV2`：array，本次 6 项
- `EntType`：string
- `TechRateScoreInfo`：object
- `EntCreditScoreInfo`：object
- `AIIntro`：boolean
- `info`：object
- `type`：string
- `EntCreditScoreInfoVisible`：boolean
- `hidePhone`：boolean
- `isNewRelationChart`：boolean
- `newCert`：boolean
- `isCertified`：boolean
- `banner`：object
- `comInfo`：object
- `hisCountInfo`：object
- `showHistoryShieldDataDesc`：boolean
- `dynamics`：array，本次 10 项
- `pos`：object
- `updatedDate`：string
- `businessCapi`：string
- `seoABpolicy`：object，空值或空结构
- `graphInfo`：object

### 爱企查：搜索中的指定企业

路径：`data.resultList[exact]`。44 个直接字段：

- `pid`：string
- `entName`：string
- `entType`：string
- `validityFrom`：string
- `domicile`：string
- `entLogo`：string，空值或空结构
- `openStatus`：string
- `legalPerson`：string
- `tags`：object
- `logoWord`：string
- `hkLable`：array，本次 0 项，空值或空结构
- `isHkComp`：number
- `isClaim`：number
- `titleName`：string
- `titleLegal`：string
- `titleDomicile`：string
- `levelAtaxer`：array，本次 2 项
- `regCap`：string
- `scope`：string
- `regNo`：string
- `appJumpUrl`：string
- `directorsPerson`：object
- `hitReason`：array，本次 1 项
- `labels`：object
- `personTitle`：string
- `risk`：object
- `personId`：string
- `personLink`：string
- `isHasResume`：boolean
- `newLabels`：array，本次 8 项
- `phoneinfoCount`：number
- `emailinfoCount`：number
- `suggestPhoneNum`：number
- `suggestEmailNum`：number
- `email`：string
- `officialweb`：number
- `website`：string
- `telephone`：string，空值或空结构
- `hideButton`：number
- `phoneCompCount`：number
- `phoneinfo`：array，本次 0 项，空值或空结构
- `phoneQuanWangCount`：number
- `emailinfo`：array，本次 1 项
- `xyOrder`：number

### 爱企查：企业详情对象

路径：`data.basicData`。50 个直接字段：

- `entLogo`：string
- `shareLogo`：string
- `entName`：string
- `prevEntName`：array，本次 1 项
- `openStatus`：string
- `entType`：string
- `isClaim`：number
- `claimUrl`：string
- `isCollected`：boolean
- `benchMark`：string，空值或空结构
- `unifiedCode`：string
- `regNo`：string
- `orgNo`：string
- `taxNo`：string
- `scope`：string
- `regAddr`：string
- `legalPerson`：string
- `personId`：string
- `compNum`：number
- `compNumLink`：string
- `personLogo`：string，空值或空结构
- `personLogoWord`：string
- `startDate`：string
- `openTime`：string
- `annualDate`：string
- `regCapital`：string
- `industry`：string
- `telephone`：string
- `district`：string
- `authority`：string
- `realCapital`：string
- `paidinCapital`：string
- `orgType`：string
- `scale`：string
- `describe`：string
- `email`：string
- `shares`：array，本次 0 项，空值或空结构
- `hideButton`：number
- `insuranceInfo`：object
- `qualification`：string
- `regCode`：string
- `personTitle`：string
- `personLink`：string
- `isHasResume`：boolean
- `districtCode`：string
- `entScaleRemark`：string
- `prinType`：string
- `licenseNumber`：string
- `entLogoWord`：string
- `authType`：number

## 完整嵌套结构

见 [字段结构 JSON](platform-field-inventory.json)。其中 populated 仅表示结构非空；false、0、占位字符串仍可能被计为非空，不能据此认定数据具有业务意义。

本次没有扩展正式 API 的标准化字段。当前统一的 9 个基础字段只占上游返回内容的一部分。
