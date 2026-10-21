import { z } from "zod";
export const meetingTypes: Record<number, string> = {
  1: "电话＋网络",
  2: "纯网络",
  3: "纯电话",
  4: "转播",
  5: "回放",
};
export const statuses: Record<number, string> = {
  1: "预告",
  2: "直播",
  3: "回放",
  4: "结束",
  [-1]: "已取消",
};
export const shareOptions = [
  { value: 0, label: "全市场可见" },
  { value: 13, label: "关联白名单" },
  { value: 4, label: "买方" },
  { value: 5, label: "卖方" },
  { value: 19, label: "自定义分组" },
  { value: 21, label: "报名" },
  { value: 22, label: "付费" },
];
export const permissionLabels = [
  "专场",
  "买方",
  "机构",
  "公开",
  "报名",
  "私密",
  "付费",
];
export const phoneSchema = z.string().regex(/^1\d{10}$/, "手机号必须为11位");
const participant = z.object({
  name: z.string().min(1),
  phone: phoneSchema,
  position: z.string().default(""),
  uid: z.number().optional(),
});
export const meetingSchema = z
  .object({
    title: z.string().trim().min(1, "请输入主题").max(200),
    liveType: z.number().int().min(1).max(5),
    startTime: z.string().datetime(),
    meetTime: z.number().int().min(1),
    companyCode: z.number().int().positive(),
    companyAbbr: z.string().min(1),
    secu: z.array(z.number()).default([]),
    assistCompanyList: z.array(z.number()).default([]),
    releaseFlag: z.number().int().min(0).max(1).default(1),
    isNetSync: z.number().int().min(0).max(1).default(0),
    sipType: z.number().int().min(0).max(1).default(0),
    aiFlag: z.number().int().min(0).max(1).default(0),
    isInstitute: z.number().int().min(0).max(1).default(0),
    channelType: z.number().int().min(1).max(3).default(1),
    shareTypes: z
      .array(z.number().refine((v) => [0, 13, 4, 5, 19, 21, 22].includes(v)))
      .default([13]),
    customerPlatform: z.boolean().default(true),
    groupList: z
      .array(
        z.object({
          code: z.number().int().positive(),
          type: z.number().int(),
          name: z.string().optional(),
        }),
      )
      .default([]),
    permissionLabel: z.number().int().min(0).max(6).default(0),
    verifyWhitelistFlag: z.number().int().min(0).max(1).default(0),
    applyFlag: z
      .array(z.number().refine((v) => [0, 1].includes(v)))
      .default([]),
    commitmentLetterUrl: z.string().default(""),
    replayDays: z.number().int().min(-1).default(0),
    isSummary: z.number().int().min(0).max(1).default(0),
    isArtificial: z.number().int().min(0).max(1).default(1),
    largeConference: z.number().int().min(0).max(1).default(0),
    watermarkFlag: z.number().int().min(0).max(1).default(1),
    freeReadPpt: z.number().int().min(0).max(1).default(1),
    isRelay: z.number().int().min(0).max(1).default(1),
    activityPushUrl: z
      .array(
        z.object({ name: z.string().default(""), url: z.string().default("") }),
      )
      .default([]),
    recordType: z.number().int().min(1).max(2).default(1),
    testFlag: z.number().int().min(0).max(1).default(0),
    joinTypeShowFlag: z.number().int().min(0).max(1).default(0),
    broadcastType: z.number().int().min(0).max(1).default(0),
    pullUrl: z.string().default(""),
    pushUrl: z.string().default(""),
    pushName: z.string().default(""),
    flowStartTime: z.string().datetime(),
    analystId: z.array(z.number()).default([]),
    allowAnyParticipant: z.boolean().default(false),
    hosts: z.array(participant).default([]),
    guests: z.array(participant).default([]),
    industry: z.array(z.number()).min(1, "请选择行业"),
    introduction: z.string().default(""),
    agenda: z.string().default(""),
    labels: z.array(z.number()).default([2]),
    showLabels: z.array(z.number()).default([]),
    resourceUrlSmall: z.string().default(""),
    resourceUrl: z.string().default(""),
    managerTips: z.string().default(""),
    syncThirdStatus: z.number().int().min(0).max(1).default(0),
  })
  .superRefine((v, c) => {
    if ([1, 2].includes(v.liveType) && v.isRelay === 0)
      v.activityPushUrl.forEach((entry, index) => {
        if (
          !entry.name.trim() ||
          !z.string().url().safeParse(entry.url).success
        )
          c.addIssue({
            code: "custom",
            path: ["activityPushUrl", index],
            message: "分发渠道需要名称和有效URL",
          });
      });
    if (!v.shareTypes.length && !v.customerPlatform)
      c.addIssue({
        code: "custom",
        path: ["shareTypes"],
        message: "请选择会议授权或客户平台",
      });
    if (v.shareTypes.includes(19) && !v.groupList.length)
      c.addIssue({
        code: "custom",
        path: ["groupList"],
        message: "自定义分组不能为空",
      });
    if (
      [1, 2].includes(v.liveType) &&
      v.isRelay === 0 &&
      !v.activityPushUrl.length
    )
      c.addIssue({
        code: "custom",
        path: ["activityPushUrl"],
        message: "请添加分发渠道",
      });
  });
export type MeetingConfig = z.infer<typeof meetingSchema>;
export function defaults(): MeetingConfig {
  const d = new Date();
  d.setMinutes(0, 0, 0);
  d.setHours(d.getHours() + 1);
  return {
    title: "",
    liveType: 1,
    startTime: d.toISOString(),
    flowStartTime: d.toISOString(),
    meetTime: 120,
    companyCode: 0,
    companyAbbr: "",
    secu: [],
    assistCompanyList: [],
    releaseFlag: 1,
    isNetSync: 0,
    sipType: 0,
    aiFlag: 0,
    isInstitute: 0,
    channelType: 1,
    shareTypes: [13],
    customerPlatform: true,
    groupList: [],
    permissionLabel: 0,
    verifyWhitelistFlag: 0,
    applyFlag: [],
    commitmentLetterUrl: "",
    replayDays: 0,
    isSummary: 0,
    isArtificial: 1,
    largeConference: 0,
    watermarkFlag: 1,
    freeReadPpt: 1,
    isRelay: 1,
    activityPushUrl: [],
    recordType: 1,
    testFlag: 0,
    joinTypeShowFlag: 0,
    broadcastType: 0,
    pullUrl: "",
    pushUrl: "",
    pushName: "",
    analystId: [],
    allowAnyParticipant: false,
    hosts: [],
    guests: [],
    industry: [],
    introduction: "",
    agenda: "",
    labels: [2],
    showLabels: [],
    resourceUrlSmall: "",
    resourceUrl: "",
    managerTips: "",
    syncThirdStatus: 0,
  };
}
export function serialize(v: MeetingConfig) {
  return {
    ...v,
    sipType: v.liveType === 4 ? 1 : v.sipType,
    isArtificial: v.liveType === 4 ? 0 : v.isArtificial,
    commitmentLetterUrl: v.shareTypes.includes(21) ? v.commitmentLetterUrl : "",
    share: v.shareTypes.flatMap((type) =>
      type === 19
        ? v.groupList.map((g) => ({ code: g.code, type: g.type }))
        : [{ code: type === 13 ? v.companyCode : 0, type }],
    ),
    validationType: v.customerPlatform ? (v.shareTypes.length ? 2 : 1) : 0,
  };
}
export function labelWarning(v: MeetingConfig) {
  const expected = v.shareTypes.includes(22)
    ? 6
    : v.shareTypes.includes(0)
      ? 3
      : v.shareTypes.includes(21)
        ? 4
        : v.shareTypes.includes(4)
          ? v.shareTypes.includes(5)
            ? 2
            : 1
          : 0;
  return expected !== v.permissionLabel
    ? "权限标签与授权配置可能不一致，请确认申请提示是否符合业务意图。"
    : "";
}
export const personSchema = z.object({
  name: z.string().trim().min(1),
  phone: phoneSchema,
  company: z.string().default(""),
  email: z.union([z.literal(""), z.string().email()]).default(""),
  sales: z.string().default(""),
  iscall: z.number().int().min(0).max(1).default(0),
  role: z.union([z.literal(1), z.literal(4)]).default(4),
  replayDays: z.number().int().min(-1).default(0),
});
export function transition(
  current: {
    status: number;
    releaseFlag: number;
    isNetSync: number;
    confirmed: boolean;
    recommended: boolean;
  },
  action: string,
  newStartTime?: string,
  hasReplay = false,
) {
  const v = { ...current };
  switch (action) {
    case "cancel":
      if (v.status !== 1) throw Error("仅预告会议可取消");
      v.status = -1;
      v.recommended = false;
      break;
    case "start":
      if (v.status !== 1) throw Error("仅预告会议可模拟开始");
      v.status = 2;
      break;
    case "end":
      if (v.status !== 2) throw Error("仅直播会议可结束");
      v.status = hasReplay ? 3 : 4;
      v.recommended = false;
      break;
    case "activate":
    case "restore":
      if (action === "activate" ? ![3, 4].includes(v.status) : v.status !== -1)
        throw Error("当前状态不允许该操作");
      if (!newStartTime || !Number.isFinite(Date.parse(newStartTime)))
        throw Error("请填写新开始时间");
      v.status = 1;
      v.confirmed = false;
      break;
    case "shelve":
      if (v.isNetSync === 0) throw Error("会议已上架");
      v.isNetSync = 0;
      break;
    case "unshelve":
      if (v.isNetSync === 1) throw Error("会议已下架");
      v.isNetSync = 1;
      v.recommended = false;
      break;
    case "confirm":
      v.confirmed = true;
      break;
    case "recommend":
      if (!v.releaseFlag || v.isNetSync !== 0 || ![1, 2].includes(v.status))
        throw Error("推荐需要发布、上架且处于预告或直播");
      v.recommended = true;
      break;
    case "unrecommend":
      if (!v.recommended) throw Error("会议未推荐");
      v.recommended = false;
      break;
    default:
      throw Error("未知操作");
  }
  return v;
}
