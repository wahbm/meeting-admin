# 架构与阶段结果

更新：2026-10-12。接手状态见 `PROJECT_CONTEXT.md`，未完成项见 `TODO.md`；下表表示模块已有实现，不代表所有原文细节完成。本文件由原 `architecture.md` 保留内容并统一命名。

## 分层

浏览器通过同源`/api`调用Fastify；业务Schema位于shared；数据库访问使用Prisma；SQLite保存业务、会话、任务和审计；上传文件存本地目录。

React页面按会议列表/表单、会议详情、基础资料/系列/审计分组。TanStack Query查询缓存与任务轮询；登录退出/会话失效清空缓存。富文本使用Quill编辑、DOMPurify过滤预览。名单CSV解析支持转义和BOM，XLSX使用独立加载的ExcelJS。

模拟执行器只操作本地数据库，不访问第三方。任务的处理状态与生成资料在同一个事务中提交，避免完成状态与资料不同步。processing任务重启后继续；失败可重试，完成和失败都审计。

## 数据模型

| 实体 | 关联和职责 |
|---|---|
| User、Session | 密码scrypt哈希、会话到期、后台角色 |
| Reference | 类型化基础资料，行业parentId可建立树，引用和循环校验 |
| Meeting、Series | 活动ID、结构化状态/版本、完整预约JSON、系列子会议 |
| Person、ImportFailure | 会议临时名单，meetingId+phone唯一；逐行导入结果 |
| Upload、Document | 文件元数据、会议归属、所有人及排序；上传与绑定独立 |
| Task | 持久化模拟任务、输入结果、失败开关、重试次数 |
| Material、Delivery | 模拟资料、AI标记、模拟收件及发送内容记录 |
| Attendance | 参会记录及明确来源，数据库统计 |
| Audit | 操作人、对象、变更前后与模拟执行记录 |

MeetingConfig支持类型化校验；反向字段编码仅用于业务数据转换。roomId、channelName、RTC和RTM凭据没有建模，因为对应系统在本次范围外。

## 阶段交付结果

| 阶段 | 结果 |
|---|---|
| 0 | requirements.md完成需求编号、字段字典、显隐矩阵、状态矩阵与业务缺口定义 |
| 1 | 工程、角色、SQLite迁移、演示数据、基础资料、文件和审计可运行 |
| 2 | 五类预约、授权转换、机构联动、重复/同步确认、编辑、邀请及二维码可运行 |
| 3 | 会议运营、名单导入预览及失败记录、批量权限、系列批量创建可运行 |
| 4 | 上传、模拟转换、绑定、资料生成/发送、统计刷新和导出可运行 |
| 5 | 类型/构建、领域/真实数据库测试及浏览器核心流程完成；见acceptance.md |

## 并发及恢复

会议写入、状态操作、文档全量绑定使用会议version；旧版本返回409。名单、资料、基础资料、系列各有版本。系列批量创建和名单批量回放采用事务；名单导入设计为部分成功并保留失败行。

使用单个进程即可执行MVP模拟任务，无额外消息队列。数据库备份与上传目录必须一同保存。SQLite适合本地及小规模管理，不提供多实例写入协调或多租户隔离。

## 必须保留的契约

- `shared/domain.ts`：五种liveType；会议状态1/2/3/4/-1与action分开；上架isNetSync=0、融合sipType=0、分发isRelay=0。名单role=1嘉宾/4观众，不是房间角色。
- `serialize()`保存编辑态和share/validationType，未报名清空承诺函，转播强制关闭融合并设自助。隐藏字段保留；分发校验仅在对应类型启用时生效。
- 后端检查Cookie会话、角色和Origin/Host；Vite代理保持 `changeOrigin:false`，避免同源写入失败。viewer只读，operator不能维护基础资料，所有账号共用单一空间。
- 上传与绑定分离；文件kind/会议归属、文档转换完成、所有人手机号和会议version都需校验。富文本预览必须经DOMPurify，不直接渲染不可信HTML。
- 执行器每秒检查，约2.5秒后处理；前端任务5秒轮询。finished/ready及Delivery模拟状态不能当作真实服务成功。
- 当前两次迁移分别初始化模型和增加Material.recordStatus；已应用迁移保持不变，后续追加迁移。测试在导入db模块前设置临时DATABASE_URL/STORAGE_DIR。
- 会后发送目前仅校验资料存在，生成任务尚未遵守各开关；这些是TODO，不是设计成允许的完整业务规则。

## 部署扩展（2026-10-12，已上线）

生产使用共享MariaDB独立meeting_admin库与最小权限账号，本地SQLite保留。prisma/mysql/schema.prisma由原模型通过scripts/sync-mysql-schema.mjs派生；CI先验证SQLite，再生成MySQL客户端并验证隔离的meeting_admin_test，最后打包Linux生产依赖。禁止在生成MySQL客户端后把测试误指向生产。

PUBLIC_BASE_PATH统一构建资源、前端路由、API、附件、二维码和Cookie路径；服务器内部仍是根路径，Nginx剥离公共前缀并保留Host。生产凭据留在服务器，不放GitHub变量或源码。
