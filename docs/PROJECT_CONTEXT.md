# 项目上下文

更新：2026-10-21；测试客户端已提交并部署（6f0e5d1）。接手先读本文 → TODO → ARCHITECTURE，详细接口见 api.md。

## 目标与范围

根据 `会议系统整理/` 的后台预约和管理逻辑，建设独立运行、可持久化的中文会议管理后台。用户所称“mcp版本”已确认是 **MVP**，不是 MCP 服务。

实现后台与独立网页测试客户端（/client）。客户端使用手机号＋固定验证码1234，独立会话；真实保存会议状态、权限与参会操作，发言/禁言仅模拟状态。邀请网络链接和二维码可访问客户端。不建设 Electron、小程序及真实外部服务；转换、推拉流、资料生成、名单同步、邮件仍为模拟。测试准入独立于原有观看授权配置。

## 当前交付

- 已有：登录/三种角色；基础资料及树形行业；五类会议预约、编辑、筛选、授权配置和主要联动；独立生命周期操作；临时名单与CSV/XLSX导入；文档上传和所有人绑定；会后资料管理、模拟发送、参会统计导出；系列子会议；审计和持久化任务。
- 本地存储是真实的；媒体、Office转换页图、外部同步和发送是模拟的。客户端统计按加入/退出区间累计、按轮次隔离；原有固定30分钟演示记录单独查看。
- 仍有配置联动、资料生成/发送条件和原文交互差距，详见 `TODO.md`；不能描述为原文所有功能已经完成。
- 当前部署CI：SQLite/MariaDB各23项领域及集成测试通过，类型检查、前后端生产构建通过。浏览器验证核心预约、名单新增、状态变化、模拟资料发送和统计；没有覆盖所有页面组合。详见 `acceptance.md`。
- 本轮部署已获授权创建公开wahbm/meeting-admin并初始化根Git；原始资料、数据库、上传和凭据排除发布。生产迁移到共享MariaDB，本地SQLite保留；已上线且自动部署验证通过，线上地址与维护契约见DEPLOYMENT.md；运行代码6f0e5d1，发布Actions 39519128016成功。

## 技术栈和目录

TypeScript、React 18、Vite 5、Ant Design 5、React Router、TanStack Query；Fastify 4、Prisma 5.22、本地SQLite/生产MariaDB、Zod；Quill/DOMPurify；ExcelJS按需加载。

| 路径 | 接手用途 |
|---|---|
| `src/App.tsx` | 登录、角色上下文、导航和路由 |
| `src/Meetings.tsx` | 会议列表与预约表单、联动 |
| `src/Detail.tsx` | 邀请、名单、文档、资料、任务、统计 |
| `src/Settings.tsx` | 基础资料、系列、审计 |
| `src/api.ts`、`src/import.ts` | 请求、导出、CSV/XLSX解析 |
| `shared/domain.ts` | 默认值、共享Schema、授权转换、状态机 |
| `server/app.ts`、`server/tasks.ts` | 接口/权限与模拟执行器 |
| `server/{db,security,seed,index,openapi}.ts` | 数据库、登录、种子、进程、API契约 |
| `src/Client.tsx`、`server/client.ts` | 测试客户端、独立会话、准入、轮次/心跳与统计 |
| `prisma/schema.prisma`、`prisma/migrations/` | SQLite源模型、三次迁移 |
| `prisma/mysql/`、`scripts/sync-mysql-schema.mjs` | 派生MySQL模型、独立生产迁移 |
| `shared/public-path.ts` | 公共前缀统一处理 |
| `server/import-data.ts`、`server/smoke.ts` | 一次性业务迁移、生产登录/API检查 |
| `scripts/`、`deploy/`、`.github/workflows/` | 初始化、运行包构建、服务器配置和自动部署 |
| `tests/` | 领域及真实数据库集成测试 |
| `会议系统整理/` | 原始需求证据，保持不变 |

## 运行与验证

建议Node 22（CI与ECS一致），服务编译目标Node 20。首次本地运行：

```sh
npm ci
cp .env.example .env  # 仅在.env不存在时执行
npm run setup
npm run dev
```

`setup` = generate → migrate deploy → seed；重复运行不重置现有数据。前端默认5173，后端3001；不要假设上轮进程还在运行。

```sh
npm test              # 临时SQLite与上传目录，结束后清理
npm run build         # tsc --noEmit + Vite
npm start             # 构建后，3001同时提供页面和API
npm run db:generate
npm run db:migrate
npm run db:seed
npm run build:server  # 服务端及种子/迁移导入/smoke入口
npm run start:production # 需已构建前端/服务端及对应数据库客户端
```

首次种子账号：admin/operator/viewer，角色分别为管理员/运营/只读；初始密码来自 `SEED_PASSWORD`（默认示例值见README）。更改环境变量不改变已有密码。默认会话8小时。

数据库默认 `prisma/meeting.db`；上传默认 `storage/`，可用 `STORAGE_DIR`覆盖。数据库和上传文件须一起备份，均不入版本控制。环境项见 `.env.example`；不要把凭据复制进接手文档。

构建有大包提示；开发富文本存在第三方findDOMNode弃用提示。两者不等于功能测试失败，也不应通过关闭检查掩盖。

## 本轮增量与接手起点

本轮完成部署兼容：公共子路径、Cookie隔离、数据库健康接口、MySQL派生模型和迁移、SQLite业务快照导入、Linux运行包、Actions双数据库验证、systemd/Nginx发布及候选进程清理。部署细节统一查DEPLOYMENT.md，不重复生成服务器或凭据。

Prisma客户端由最后一次generate决定引擎。MariaDB验证只对本机`*_test`库设置MYSQL_DATABASE_URL，再执行`npm run db:generate:mysql`和`TEST_DATABASE_ENGINE=mysql npm test`；本地开发恢复`npm run db:generate`。模型变更同时维护两个引擎的追加迁移，不能仅改派生Schema。

下一步优先处理TODO中的资料生成开关和发送可用性校验，补双数据库测试；部署未补齐这些业务规则。现有main推送会触发生产发布，文档整理与代码上线分开决策。

## 测试客户端增量（2026-10-21，已上线）

- 后台新增allowAnyParticipant，默认关闭；主持/嘉宾/名单人员可进入，开启后其他手机号作为观众。主持优先，名单role=1在本测试客户端映射嘉宾。
- /client首页输入会议编号；/client/meetings/:id支持登录回跳。开始前显示计划时间，开始后显示实际时间；历史实际时间缺失不伪造。
- 后台与客户端共用开始/结束生命周期；新增MeetingRound、ClientSeat、ClientVisit保存轮次、禁言和参会区间。15秒心跳、60秒超时，按最后心跳结算；3秒轮询。
- Cookie为后台Cookie名追加_client，沿用公共前缀和安全属性，客户端身份不能访问后台。固定验证码不代表真实手机所有权验证。
- 邀请网络链接、二维码、会控组织者链接及详情快捷入口指向客户端；其他外部能力保留模拟标识。后台统计默认客户端来源，可选历史轮次与旧演示来源。
- 双数据库追加20261020000000_client迁移，生产迁移已随6f0e5d1发布成功应用；原有迁移与本地演示数据库保持不变。首次本地使用先执行npm run db:generate和npm run db:migrate。
- 最新验证见acceptance.md；既有后台TODO仍未完成，部署版本仍以DEPLOYMENT.md为准。
