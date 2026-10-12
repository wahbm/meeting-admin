# 需求追踪与阶段交付

## 依据与范围

已阅读 README、系统总览、后台预约索引、新人指南、终端、Web、小程序、权限详解，检查 SVG/PNG关系图及绘图脚本。实现仅限管理后台；其他端的信息用于理解配置，不重建或对接客户端。原始资料保持不变。

2026-10-12核对补充：下表列出已建立的功能入口与验证位置，不表示原文全部逻辑已完成。资料生成开关联动、发送可用状态、合作方默认值、识别能力等差距以 [TODO](TODO.md) 为准；模拟能力不能计为真实服务实现。

| ID | 阶段 | 后台需求 | 实现与验证入口 |
|---|---|---|---|
| BASE-01 | 1 | 登录、退出、会话过期、三种角色 | 登录页；server/security；集成测试鉴权 |
| BASE-02 | 1 | 机构、证券、树形行业、人员、分组维护搜索 | 基础资料；管理员维护；引用资料禁止删除 |
| BASE-03 | 1 | SQLite、迁移、幂等种子、文件存储、审计 | setup；prisma/migrations；审计页 |
| MEET-01 | 2 | 列表分页及全部筛选、默认当天 | 会议列表；保存后活动ID定位 |
| MEET-02 | 2 | 五类会议新建、编辑、完整回显 | 预约页；五类型集成测试 |
| MEET-03 | 2 | 机构付费/名单联动、发起人清空、时间同步 | 表单 onValuesChange；API引用校验 |
| MEET-04 | 2 | 主持识别、介绍生成、人员及行业 | 本地机构人员选择识别；富文本模板 |
| MEET-05 | 2 | 必填、分组、授权、时长、同步确认、同名确认 | 共享Schema；API重复/版本冲突测试 |
| AUTH-01 | 2 | 七种share、客户平台0/1/2、七种标签 | 权限配置；serialize及提示 |
| AUTH-02 | 2 | 报名字段、承诺函、回放天数、纪要 | 预约属性；未报名清空承诺函 |
| INV-01 | 2 | 四块邀请、复制、二维码、报名/会控入口 | 邀请页及模拟说明页 |
| STATE-01 | 3 | 发布、上架、确认、推荐独立管理 | 状态操作接口和详情页 |
| STATE-02 | 3 | 取消、结束、恢复、激活与状态限制 | 服务端状态机；模拟开始辅助验收 |
| PEOPLE-01 | 3 | 名单增改删、角色、销售、外呼、个人回放 | 临时白名单页；手机号唯一 |
| PEOPLE-02 | 3 | 文本识别、CSV/XLSX预览、模板、失败记录 | 识别/导入；部分成功测试 |
| PEOPLE-03 | 3 | 批量回放、三种外呼配置、模拟同步 | 名单批量操作及任务状态 |
| SERIES-01 | 3 | 系列维护、模板复用、批量子会议 | 系列页；批量事务与重复测试 |
| FILE-01 | 4 | 图片、视频、承诺函、演示上传校验 | 上传API及受保护下载测试 |
| DOC-01 | 4 | 模拟转换、5秒轮询、失败重试 | 演示页及持久化任务 |
| DOC-02 | 4 | 所有人、排序、删除、保存绑定 | 文档绑定事务、版本校验、归属测试 |
| STREAM-01 | 4 | 只读推拉流地址与到期时间 | 推拉流页；example.invalid模拟地址 |
| AFTER-01 | 4 | 回放、纪要、AI标记及模拟生成 | 会后资料维护和任务 |
| AFTER-02 | 4 | 收件邮箱、内容选择、模拟发送记录 | 回放/结束时允许；不发邮件 |
| STAT-01 | 4 | 参会明细搜索、统计、模拟刷新、导出 | 参会统计；数据库统计/模拟标记 |
| QA-01 | 5 | 权限、并发、任务恢复、完整流程 | tests；docs/acceptance |

## 字段字典

共享Schema是字段类型与校验的唯一来源，`MeetingConfig` 同时用于前后端。会议记录的独立状态/版本/确认/推荐保存在结构化列；其余预约配置存入JSON。授权转换同时保存`shareTypes/groupList/customerPlatform`编辑态与`share/validationType`提交态。

| 分组 | 字段 |
|---|---|
| 基础 | title、liveType、startTime、meetTime、companyCode、companyAbbr、secu、assistCompanyList、channelType |
| 发布及同步 | releaseFlag、isNetSync、sipType、aiFlag、isInstitute、syncThirdStatus |
| 授权 | shareTypes、share、customerPlatform、validationType、groupList、permissionLabel、verifyWhitelistFlag |
| 报名及会后 | applyFlag、commitmentLetterUrl、replayDays、isSummary、recordType |
| 服务配置 | isArtificial、largeConference、watermarkFlag、freeReadPpt、isRelay、activityPushUrl、testFlag、joinTypeShowFlag、broadcastType、pullUrl、pushUrl、pushName、flowStartTime |
| 人员内容 | analystId、hosts、guests、industry、introduction、agenda、labels、showLabels、resourceUrlSmall、resourceUrl、managerTips |

0/1开关均使用整数校验。上架isNetSync=0；融合sipType=0；对外分发isRelay=0。会议、名单身份、权限标签及操作分别定义，不能复用数字含义。

## 类型显隐矩阵

| 字段组 | 电话＋网络 | 网络 | 电话 | 转播 | 回放 |
|---|---|---|---|---|---|
| 机构、人员、行业、授权 | 有 | 有 | 有 | 有 | 有 |
| 服务商 | 有 | 隐藏 | 有 | 有 | 隐藏 |
| 权限标签、回放类型/天数、图片、介绍、议程 | 有 | 有 | 隐藏 | 有 | 有 |
| 人工/自助、大型会议、自助PPT | 有 | 有 | 有 | 有 | 隐藏 |
| 来源视频pullUrl | 有 | 隐藏 | 隐藏 | 隐藏 | 隐藏 |
| 转播方式、pushUrl/pushName | 隐藏 | 隐藏 | 隐藏 | 有 | 隐藏 |
| 对外分发渠道 | 有 | 有 | 隐藏 | 隐藏 | 隐藏 |

隐藏字段保存原值；分发渠道必填仅在类型1/2且启用分发时生效。类型4切换强制关闭融合并设为自助。

## 状态操作矩阵

| 操作 | 可用条件 | 结果 |
|---|---|---|
| cancel | 预告 | 取消并取消推荐 |
| start（模拟） | 预告 | 直播，仅后台状态 |
| end | 直播 | 有回放且允许回放则回放，否则结束 |
| activate | 回放/结束且给新时间 | 预告，重置确认 |
| restore | 取消且给新时间 | 预告，重置确认 |
| shelve/unshelve | 当前相反上架状态 | 上架/下架；下架取消推荐 |
| confirm | 会议存在 | 确认/重新确认 |
| recommend | 发布+上架+预告/直播 | 推荐 |
| unrecommend | 已推荐 | 取消推荐 |

直播/取消不能改类型和开始时间；取消不能改时长；保存未发布或下架会清除推荐。所有会议及文档变更使用版本号阻止旧数据覆盖。

## 明确采用的默认解释

- 暂不实现观看权限、混合授权AND/OR、角色映射及回放截止算法。回放0天保留原值，显示业务未确认提示。
- “白名单外呼”仅作用于本次成功进入会议临时名单的人员，不判定外部机构永久白名单；与“全部外呼”在当前无外部服务的MVP中成功行结果一致。仍保留两种配置选项及审计。
- 所有资料均带模拟来源，即使人工录入地址也不会验证外部媒体。
- 系列复制预约配置，不复制文件、名单、产物或处理状态；不扩展周期调度。
- 机构、行业和基础资料使用本地维护数据，机构联动以其属性为准。
- 全部后台账号共享同一管理空间，未设计多机构租户隔离。
