# 阿里云部署

状态：2026-10-21，测试客户端已上线并完成本轮部署验收。业务缺项仍见TODO.md，部署成功不等于原始需求全部完成。

- 地址：https://8.130.116.192/mosshqq/meeting-admin/（现有IP HTTPS，未配置新域名）
- 仓库：https://github.com/wahbm/meeting-admin，公开；原始资料、凭据、数据库和上传文件不发布。
- 当前运行代码：6f0e5d1619996e66008ed2d6e0e6cb79d94da947；成功发布：https://github.com/wahbm/meeting-admin/actions/runs/39519128016。
- 用户授权复用ECS、组织Secret访问及共享MariaDB迁移；明确不配置定期备份。

## 运行契约

Nginx → 127.0.0.1:3109 → systemd单进程meeting-admin（非root账号）→ 共享MariaDB独立meeting_admin库。ECS使用Node22；不新增Docker/Redis，不公开数据库或后台端口。公共前缀在Nginx剥离，保留Host；构建资源、路由、API、附件、二维码及Cookie路径使用同一PUBLIC_BASE_PATH。

| 路径 | 用途 |
|---|---|
| /srv/meeting-admin/releases、current | 不可变运行包、原子切换入口 |
| /srv/meeting-admin/.known-good | 最近已验证版本，保留当前和一个上一版本 |
| /srv/meeting-admin/persistent/uploads | 持久上传，独立于代码发布 |
| /etc/meeting-admin.env | 服务器环境及凭据，root:meeting-admin 0640 |
| /etc/meeting-admin.initial-admin-password | 初始密码，root 0600；用户自行读取 |
| /etc/systemd/system/meeting-admin.service | 限制写入目录和内存的应用服务 |
| /usr/local/sbin/meeting-admin-release | root拥有的发布助手，deploy仅有此命令sudo权限 |
| /etc/nginx/snippets/meeting-admin.locations.conf | 项目专属路由，保留其他项目配置 |

生产账号admin/operator/viewer使用服务器随机初始密码，本地账号和会话未迁移。用户可在已授权Workbench执行 `sudo cat /etc/meeting-admin.initial-admin-password`；不要把结果发送到聊天、仓库或日志。种子重复运行不重置密码。

## 数据与发布

本地SQLite仍保留。生产MYSQL_DATABASE_URL只存服务器；prisma/mysql/schema.prisma由根SQLite模型派生，使用独立MySQL迁移。不得对MariaDB运行SQLite迁移或让测试指向生产库。

一次性一致性快照已迁移业务数据：会议2、基础资料12、人员1、资料3、任务2、发送1、参会1、审计9；关联Upload为0。导入文件保存在服务器persistent/import.json，导入标记为.imported；不重复导入非空业务库。数据库与上传应作为同一恢复集合；本次未配置定期备份。

main推送或手动Actions运行测试、构建及发布；PR只验证。使用组织DEPLOY_HOST/PORT/USER/KNOWN_HOSTS和选定仓库SSH_PRIVATE_KEY、仓库DEPLOY_PATH/ECS_READY；不复制组织私钥。CI准备Linux生产依赖，服务器只解包、迁移、初始化、候选验证和切换，不安装开发依赖。

发布助手使用项目锁、候选systemd transient unit（3110）、健康及登录/API检查，成功后更新.known-good。候选整组停止后再切换正式服务；最后验证3110已释放、仅3109监听。失败回到记录的上一可用代码，保留诊断；数据库迁移只能追加兼容变更，代码回滚不回滚数据。未在生产主动注入失败测试回滚。

root发布助手不由普通CI覆盖。以后修改deploy/release.sh，需通过授权Workbench/sudo审阅安装服务器副本；不能只提交源码就认为服务器助手已更新。

## 验证及维护

2026-10-21：Actions 39519128016成功，SQLite/MariaDB 10.11各23项测试、前后端构建通过。生产追加迁移20261020000000_client成功，发布助手确认6f0e5d1运行包健康，后台登录/API冒烟通过。公网严格HTTPS健康、客户端首页/会议深链200；固定验证码错误拒绝、正确登录/me/退出通过，客户端Cookie为独立名称、Secure与公共前缀路径，客户端会话访问后台会议接口返回401。浏览器线上深链显示测试登录页。仅创建并退出测试会话，没有修改生产会议状态或参会记录；完整三身份流程在隔离环境验证，实体手机扫码未验收。

测试入口：https://8.130.116.192/mosshqq/meeting-admin/client

首次部署（2026-10-12）SQLite/MariaDB各18项测试、生产构建和部署均通过。线上数据库健康、实际登录/me/会议列表/OpenAPI/退出通过；严格HTTPS首页及深链200，浏览器登录页正常且无脚本错误。Nginx配置验证通过，服务active，候选已清理。验收时内存可用约863MiB、磁盘可用26GiB，服务内存约27MiB（瞬时值）。附件数据源为空，线上未额外写入业务文件；相关权限与绑定由数据库集成测试覆盖。

只读维护命令：

```sh
sudo systemctl status meeting-admin --no-pager
sudo journalctl -u meeting-admin -n 100 --no-pager
curl --fail https://8.130.116.192/mosshqq/meeting-admin/api/health
sudo readlink -f /srv/meeting-admin/current
```

不要输出环境文件或凭据排查问题。后续文档提交不改变上述运行版本；实际版本以current及成功Actions记录为准。
