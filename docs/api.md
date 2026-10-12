# API 契约

基础路径 `/api`。开发前端代理到3001，生产前后端同源。OpenAPI：登录后GET `/api/openapi.json`，包含共享Zod生成的MeetingConfig/Person与各写入接口结构。

## 通用约定

- 除登录外，全部接口要求`session` Cookie；登录成功通过Set-Cookie返回，会话8小时。
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
