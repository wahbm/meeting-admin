# 阿里云部署准备

状态：2026-10-12，部署进行中，尚未通过线上验收。不能将本文件当作线上成功记录。

已授权公开仓库wahbm/meeting-admin、组织Secret访问、复用ECS并迁移共享MariaDB；用户不配置定期备份。CLI账号mosshqq；组织网页使用davyluiy完成身份验证及Secret授权，网页已显示Secret updated和9个仓库。组织Variables覆盖公开仓库，目标8.130.116.192:22，部署账号deploy。

计划目录/srv/meeting-admin、服务meeting-admin、端口3109及候选3110、数据库meeting_admin、公网路径/mosshqq/meeting-admin/。Workbench已验证sudo权限、Nginx/MariaDB运行、内存可用约919MiB、磁盘可用26GiB及项目名称无冲突；本地SSH无可用deploy私钥，首次服务器准备使用现有授权Workbench，后续Actions使用组织Secret。

现有SQLite通过一致性快照迁移业务记录，原文件保留；账号和登录会话不导出，生产账号使用服务器生成的独立初始密码。本地现有Upload记录为0，因此没有需迁移的关联文件。迁移JSON不进仓库或公开Actions产物。

## 待确认

- 是否新建公开 `wahbm/meeting-admin`、授权使用组织部署Secret，或用户选择其他发布方式。
- 是否复用现有ECS，目标路由、目录、服务、端口需检查冲突。
- 服务器新建SQLite、迁移现有本地数据，或迁移MariaDB；不自动更换数据库引擎。
- 域名/HTTPS及备份偏好；不默认创建定期备份。

GitHub在提升权限环境已验证登录mosshqq，组织角色admin；目标仓库不存在。组织部署配置API缺少admin:org scope，需要本地CLI授权刷新或组织网页配置，不在聊天中发送Token/私钥。

## 已准备的兼容能力

- 构建时 `PUBLIC_BASE_PATH` 设置Vite base，前端basename、API、附件和二维码随之变化；默认 `/` 保持本地行为。
- Nginx须剥离公共前缀再代理给内部根路径服务，并保留Host，满足Origin校验；同时设置适合上传的body大小。
- 运行时PUBLIC_BASE_PATH须与构建一致，SESSION_COOKIE_NAME使用项目专属名称，Cookie路径限制在公共前缀；HTTPS部署启用COOKIE_SECURE。
- `/api/health`无需登录，检查数据库，不输出配置；迁移完成后才能通过检查。
- `npm run build:server`生成Node20入口；`npm run start:production`启动编译后服务；构建完成后使用 `node build-server/seed.js`初始化。
- NODE_ENV=production时种子要求独立SEED_PASSWORD，拒绝示例密码。凭据只保存在服务器保护的环境文件中。

## 推荐发布模型（未执行）

Nginx + 单进程systemd，不新增Docker/Redis。CI运行测试、构建并准备Linux生产运行依赖；ECS只解包、应用迁移及启动，不安装开发依赖或编译前端。

项目独立releases和current软链接，数据库/上传/环境文件位于独立persistent目录。保留当前与一个已验证版本；切换失败回到已记录的可用版本，数据库迁移只允许兼容旧代码的追加修改。

服务仅监听127.0.0.1，应用使用非root账号。实际内存、磁盘增量需结合ECS现状测量，不在检查前承诺容量。

发布产物排除 `.env`、数据库、storage、原始业务资料及Git元数据。迁移现有数据需单独授权并一致地复制数据库和文件，不能复制运行中的SQLite journal代替备份。

上线验收：服务与数据库健康、Nginx配置校验、公共页面/深链、登录/API、附件下载、二维码前缀、浏览器错误及资源余量。未通过全部验收不能标记部署成功。

## 当前验证与访问配置

首次验证运行38268341950已通过：SQLite和MariaDB分别18项测试，前后端生产构建与Linux运行包生成成功；首次发布运行38268952964进行中。Nginx公共HTTPS证书已用严格curl验证，未跳过证书检查。

独立凭据位于/etc/meeting-admin.env（root:meeting-admin 0640）；初始管理员密码位于/etc/meeting-admin.initial-admin-password（root 0600）。用户在Workbench自行读取，不把结果发到聊天或仓库。账号admin/operator/viewer均初始化为服务器随机密码，既有本地账号和会话不迁移。

运行时共享MariaDB使用MYSQL_DATABASE_URL；根prisma/schema.prisma仍为SQLite。先测试SQLite再生成MySQL客户端，测试引擎TEST_DATABASE_ENGINE=mysql只允许本机_test数据库。生产使用prisma/mysql的独立初始迁移（包含recordStatus），不在MariaDB执行SQLite迁移。

首次发布38268952964成功，随后资源检查发现旧候选进程清理不完整，已停止该候选并将发布帮助脚本改为systemd transient unit，以停止整个进程组；修复发布仍需验证候选端口释放。root拥有的/usr/local/sbin/meeting-admin-release不由普通部署账号自动覆盖，未来修改此帮助脚本须通过授权Workbench/sudo审阅安装。
