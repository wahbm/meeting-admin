# 项目上下文

更新：2026-10-12；本轮开发结束。接手先读本文 → TODO → ARCHITECTURE，详细接口见 api.md。

## 目标与范围

根据 `会议系统整理/` 的后台预约和管理逻辑，建设独立运行、可持久化的中文会议管理后台。用户所称“mcp版本”已确认是 **MVP**，不是 MCP 服务。

只实现后台；不建设或对接 Electron、Web会控、小程序及真实外部服务。邀请、会控、转换、推拉流、资料生成、名单同步、邮件均采用明确标记的模拟流程。授权字段可以管理，不执行观看鉴权。

## 当前交付

- 已有：登录/三种角色；基础资料及树形行业；五类会议预约、编辑、筛选、授权配置和主要联动；独立生命周期操作；临时名单与CSV/XLSX导入；文档上传和所有人绑定；会后资料管理、模拟发送、参会统计导出；系列子会议；审计和持久化任务。
- 本地存储是真实的；媒体、Office转换页图、外部同步和发送是模拟的。统计演示记录由名单生成，每人固定30分钟。
- 仍有配置联动、资料生成/发送条件和原文交互差距，详见 `TODO.md`；不能描述为原文所有功能已经完成。
- 本地业务验证：16项领域/SQLite集成测试通过，类型检查及生产构建通过。浏览器验证核心预约、名单新增、状态变化、模拟资料发送和统计；没有覆盖所有页面组合。详见 `acceptance.md`。
- 本轮部署已获授权创建公开wahbm/meeting-admin并初始化根Git；原始资料、数据库、上传和凭据排除发布。生产迁移到共享MariaDB，本地SQLite保留；已上线且自动部署验证通过，线上地址与维护契约见DEPLOYMENT.md；部署CI对SQLite/MariaDB分别通过18项测试。

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
| `prisma/`、`scripts/prepare-db.mjs` | 数据模型、两次迁移、首次SQLite文件准备 |
| `tests/` | 领域及真实数据库集成测试 |
| `会议系统整理/` | 原始需求证据，保持不变 |

## 运行与验证

建议Node 20/22 LTS；上轮使用Node 18.18验证。首次运行：

```sh
npm install
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
```

首次种子账号：admin/operator/viewer，角色分别为管理员/运营/只读；初始密码来自 `SEED_PASSWORD`（默认示例值见README）。更改环境变量不改变已有密码。默认会话8小时。

数据库默认 `prisma/meeting.db`；上传默认 `storage/`，可用 `STORAGE_DIR`覆盖。数据库和上传文件须一起备份，均不入版本控制。环境项见 `.env.example`；不要把凭据复制进接手文档。

构建有大包提示；开发富文本存在第三方findDOMNode弃用提示。两者不等于功能测试失败，也不应通过关闭检查掩盖。
