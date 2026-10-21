# API 契约

基础路径 `/api`。开发前端代理到3001，生产前后端同源。OpenAPI：登录后GET `/api/openapi.json`，包含共享Zod生成的MeetingConfig/Person与各写入接口结构。

## 通用约定

- 除登录和GET /health外，全部接口要求对应会话Cookie；后台默认session，客户端使用后台Cookie名追加_client，均为8小时，不能互换。
- 写操作要求同源Origin；无Origin的受信本地脚本仍必须提供有效Cookie。
- viewer禁止写入；operator不能修改基础资料；内部审计不向viewer开放。
- 成功HTTP200直接返回实体、数组或查询结果。错误`{message:string}`：400校验/状态条件、401会话、403权限、404不存在、409重复/引用/版本冲突、422研究所同步确认、413文件大小。
- 修改会议、名单、基础资料、系列及资料需要当前version。会议文档绑定也使用会议version。冲突后必须刷新，不能覆盖旧版本。
- 时间使用ISO8601字符串，前端按Asia/Shanghai展示；日期范围from含、to不含。
- 业务字段含义见shared/domain.ts及requirements.md；模拟任务、发送、资料均携带明确模拟语义。

## 接口清单

| 方法 | 路径（省略/api） | 输入 / 返回 |
|---|---|---|
| POST | /auth/login | `{username,password}` → `{username,role}`+Cookie |
| GET / POST | /auth/me /auth/logout | 当前账号 / 清除会话 |
| GET | /references | kind、search → `{id,kind,name,data,version}[]` |
| POST / PATCH / DELETE | /references、/references/:id | kind/name/data；修改加version；删除引用检查 |
| GET | /meetings | search、from、to、page、pageSize、companyCode、liveType、status、releaseFlag、isNetSync、confirmed、recommended → `{total,rows}` |
| POST / PATCH | /meetings、/meetings/:id | `{config:MeetingConfig,version?,confirmFlag?,instituteConfirmed?}` → 完整会议 |
| GET | /meetings/:id | 编辑配置、独立状态、版本、时间 |
| POST | /meetings/:id/action | `{action,version,newStartTime?}` → 完整会议 |
| GET | /meetings/:id/invitation | `{simulated,join,control,shorthand,other}` |
| GET | /meetings/:id/streams | `{simulated,push,pull,expiresAt}` |
| GET / POST | /meetings/:id/people | 名单数组 / Person创建 |
| PATCH / DELETE | /meetings/:id/people/:personId | Person+version / 删除本场成员 |
| POST | /meetings/:id/people/import | `{rows,callMode:all/whitelist/none}` → `{added,failures:[{data,reason}]}`；最多1000行 |
| GET | /meetings/:id/people/failures | 本场持久化失败记录 |
| POST | /meetings/:id/people/replay | `{ids,replayDays}` → ok；ids必须全部属于本场 |
| POST | /files?kind=…&meetingId=… | multipart file → `{id,filename,kind,size,url,...}` |
| GET | /files/:fileId | 受保护附件下载 |
| GET | /meetings/:id/uploads | 本场已上传文件，含未绑定文档 |
| GET / PUT | /meetings/:id/documents | 绑定列表 / `{version,files:[{uploadId,ownerPhone}]}`全量替换，数组顺序即排序 |
| GET / POST | /meetings/:id/tasks | 任务数组 / `{kind,uploadId?,simulateFailure?}` → processing任务 |
| POST | /meetings/:id/tasks/:taskId/retry | 仅failed，状态改processing、attempts+1 |
| GET / POST | /meetings/:id/materials | 资料数组 / `{kind,name,url?,content?,recordStatus?}` → 模拟资料 |
| PATCH / DELETE | /meetings/:id/materials/:materialId | `{version,name,url,content,aiValid,recordStatus?}` / 删除 |
| GET / POST | /meetings/:id/deliveries | 模拟记录 / `{recipients:string[],contents:string[]}` |
| GET | /meetings/:id/attendance | search → `{rows,stats:{count,totalMinutes,source}}` |
| GET / POST | /series | 系列含子会议数组 / `{name,description?}` |
| PATCH / DELETE | /series/:id | `{name,description,version}` / 无子会议可删 |
| POST | /series/:id/meetings | `{templateId,starts:ISO8601[]}` → 新建子会议数组，最多50场，事务全成功或全失败 |
| GET | /audits | 最近200条 `{actor,action,entity,entityId,changes,createdAt}` |

## 写入示例

使用共享`defaults()`生成初始配置，补齐主题、发布机构和行业；不能直接提交文档里的虚构请求片段。

```ts
const config = {...defaults(), title:'甲证券｜交流', companyCode:1,
  companyAbbr:'甲证券', industry:[4]};
await api('/meetings', 'POST', {config});
// 编辑时携带GET详情返回的version
await api('/meetings/1', 'PATCH', {config, version:1});
```

接口不会接收房间RTC/RTM token，也没有生成或分配roomId/channelName的逻辑。文档中的旧GET修改接口没有复制到新项目。

资料录制状态recordStatus：pending待提供、processing处理中、ready模拟可用、failed失败。模拟生成资料保存ready。结束会议仅把已标记ready且包含链接或内容的回放视为可用回放。

GET /api/health为匿名数据库健康检查，成功返回{status:"ok"}，不可用返回HTTP503。子路径部署的Cookie名称、路径和OpenAPI servers由服务器配置，不能混用其他项目Cookie。

## 测试客户端（2026-10-21）

以下路径仍以/api为前缀。验证码固定1234，不发送短信。公开登录接口执行Origin检查、手机号格式校验和失败限流（IP维度10分钟20次）。Cookie使用PUBLIC_BASE_PATH、HttpOnly、SameSite=strict及COOKIE_SECURE。

| 方法 | 路径 | 输入 / 返回 |
|---|---|---|
| POST | /client/auth/login | `{phone,code:"1234"}` → `{phone}`及独立Cookie |
| GET / POST | /client/auth/me /client/auth/logout | 当前手机号 / 退出客户端 |
| GET | /client/meetings/:id | 基础信息、计划/实际时间、轮次、me、capabilities、获准可见的当前人员 |
| POST | /client/meetings/:id/action | `{action,version?,targetId?}` → 最新客户端会议视图 |
| GET | /client/meetings/:id/attendance | 仅主持人且状态3/4可用；最新轮次汇总JSON，页面生成CSV |
| GET | /meetings/:id/attendance | 后台会话；`source=client`默认，`source=simulated`查旧演示数据；客户端来源支持`round`正整数及`search` |

动作：start/end要求主持人及当前会议version；join/leave/heartbeat适用于直播状态；speak/stop要求已加入，观众或被禁言者不能speak；mute/unmute要求主持人并提交本轮嘉宾ClientSeat.id作为targetId。禁言跨重进保留，新轮次重置。未加入人员不返回人员列表，主持人例外。列表手机号脱敏，导出包含完整手机号。

身份顺序host > guest（预约嘉宾或名单role=1）> audience。allowAnyParticipant缺省false，开启仅放开测试准入，不执行既有混合观看授权。客户端不能访问后台接口。401会话失效；403准入或权限不足；409旧会议版本、数据库写冲突或心跳对应席位已退出。

时间均ISO，历史startedAt可为空。汇总rows含round/name/phone/role/joinedAt/leftAt/minutes/source，身份取最后一次参会身份，分钟保留两位小数，source为“测试客户端参会”；rounds返回历史轮次时间。模拟来源沿用旧Attendance。CSV包含BOM并转义引号、换行及公式前缀。

邀请接口的网络参会、二维码内容、会控组织者链接返回/client/meetings/:id，前端组合当前origin与公共前缀生成完整地址。电话、报名、监控、速记和演示口令仍为模拟，不授予客户端身份。
