# 会议管理后台 MVP

独立运行的中文管理后台，依据 `会议系统整理/` 文档建设。React + Ant Design + Fastify + Prisma + SQLite，真实数据库持久化；邀请、会控、电话、转换、回放、AI、名单同步与邮件全部模拟，不调用外部服务。

## 本地启动

建议 Node.js 20 或 22 LTS。当前也已在 Node.js 18.18 上验证。

```sh
npm install
cp .env.example .env
npm run setup
npm run dev
```

前端：http://127.0.0.1:5173 ，后端：http://127.0.0.1:3001 。`setup` 自动生成 Prisma 客户端、创建 SQLite 文件、应用迁移并初始化演示数据；重复执行不会重置已有数据。

首次种子账号：

| 账号 | 权限 |
|---|---|
| admin | 管理员：全部业务及基础资料维护 |
| operator | 运营：会议业务维护、审计查看；基础资料只读 |
| viewer | 只读：会议和基础资料查询；不能修改或查看内部审计 |

三个账号初始密码均为 `.env` 的 `SEED_PASSWORD`，默认 `ChangeMe123!`。种子只在账号首次创建时设置密码；修改环境变量不会覆盖已有密码。登录会话默认8小时，Cookie 为 HttpOnly 和 SameSite Strict。

## 构建和验证

```sh
npm test
npm run build
npm start
```

生产构建后 `npm start` 在3001端口同时提供前端和接口。开发模式使用 Vite 代理并保留原始 Host，以通过同源写入校验。测试使用临时 SQLite 数据库，不修改本地演示数据。

支持流程：登录 → 预约五类会议 → 邀请 → 发布/上架/确认/推荐及状态管理 → 名单识别导入 → 文档上传模拟转换与所有人绑定 → 会后资料模拟生成 → 模拟发送 → 统计导出。

“模拟开始”是为后台状态验收提供的入口，只将预告改为直播；预约时间到达不会自动开始。结束时有回放资料且允许回放进入回放，否则进入结束。

## 目录与资料

- `src/`：后台页面、接口调用和中文样式。
- `server/`：认证、业务接口、持久化模拟任务及种子。
- `shared/domain.ts`：共享类型、Zod校验、默认值、授权转换和状态机。
- `prisma/`：数据模型及版本化迁移。
- `tests/`：领域和真实数据库集成测试。
- AI接手先读 [项目上下文](docs/PROJECT_CONTEXT.md)、[待完成任务](docs/TODO.md)、[架构与阶段结果](docs/ARCHITECTURE.md)，遵守根目录 AGENTS.md。
- [需求追踪](docs/requirements.md)、[接口契约](docs/api.md)、[验收记录](docs/acceptance.md)。

## 存储与恢复

数据库默认 `prisma/meeting.db`，上传文件默认 `storage/`；均不进入版本控制。自定义 `DATABASE_URL` 使用 `file:`，相对路径以 `prisma/` 为基准。备份时先停止服务，再同时备份数据库及 `storage/`。不能仅恢复数据库而丢失对应文件。

模拟任务存储于数据库。后台执行器每秒检查任务；任务延迟约2.5秒完成，页面每5秒查询。中断时保持 processing，重启后继续；失败任务可人工重试。刷新参会演示记录和资料生成具有去重行为。

文件类型：演示文档 PPT/PPTX/PDF/DOC/DOCX；承诺函 PDF/DOC/DOCX；视频 MP4/MOV/WebM；图片 JPG/PNG且小于5MB。其他文件上限50MB。全部下载要求登录；上传后未绑定的演示文档可从本场上传列表恢复。

本MVP没有外部观看鉴权、真实媒体播放、真实邮件、计费、会员支付或会控。文档未定义的混合授权与回放0天含义仅保存配置，不推断为实际准入策略。所有管理账号管理同一个工作空间，没有多租户隔离。

公开部署需要自行配置 HTTPS、初始密码、备份和反向代理。`.env` 中 `HOST` 默认仅本机，HTTPS部署可设置 `COOKIE_SECURE=true`；代理应保留客户端 Host。

## 阿里云发布

生产采用共享MariaDB独立数据库，本地SQLite保留。部署及首次密码交接见 [部署说明](docs/DEPLOYMENT.md)。源码仓库不包含原始业务资料、凭据、数据库或上传内容。

PUBLIC_BASE_PATH设置构建与运行公共前缀；CI负责双数据库验证及Linux运行包，ECS使用systemd，不安装开发依赖。生产启动使用npm run start:production。本地从MySQL客户端切回SQLite需重新执行npm run db:generate。
