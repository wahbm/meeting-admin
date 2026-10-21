import { registerClient, clientLifecycle, clientAttendance } from "./client";
import { openapi } from "./openapi";
import { normalizeBasePath } from "../shared/public-path";
import Fastify from "fastify";
import cookie from "@fastify/cookie";
import multipart from "@fastify/multipart";
import staticPlugin from "@fastify/static";
import { randomBytes } from "node:crypto";
import { mkdir, writeFile, readFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import path from "node:path";
import { z } from "zod";
import { db } from "./db";
import { verify } from "./security";
import {
  meetingSchema,
  serialize,
  transition,
  personSchema,
} from "../shared/domain";
export const storage = path.resolve(process.env.STORAGE_DIR || "storage");
const fail = (status: number, message: string) =>
  Object.assign(Error(message), { statusCode: status });
const parse = (s: string) => JSON.parse(s);
const meetingView = (m: any) => ({
  ...parse(m.data),
  ...m,
  data: undefined,
  startTime: m.startTime.toISOString(),
});
const refView = (r: any) => ({ ...r, data: parse(r.data) });
const id = (r: any) => z.coerce.number().int().positive().parse(r.params.id);
async function meeting(r: any) {
  const m = await db.meeting.findUnique({ where: { id: id(r) } });
  if (!m) throw fail(404, "会议不存在");
  return m;
}
async function audit(
  r: any,
  action: string,
  entity: string,
  entityId: any,
  changes: any,
) {
  await db.audit.create({
    data: {
      actor: r.user.username,
      action,
      entity,
      entityId: String(entityId),
      changes: JSON.stringify(changes),
    },
  });
}
async function validateReferences(c: any) {
  const refs = await db.reference.findMany();
  const valid = (n: number, k: string) =>
    refs.some((r) => r.id === n && r.kind === k);
  if (!valid(c.companyCode, "company")) throw fail(400, "发布机构不存在");
  for (const [key, kind] of [
    ["industry", "industry"],
    ["secu", "security"],
    ["assistCompanyList", "company"],
    ["analystId", "person"],
  ] as const)
    if (c[key].some((n: number) => !valid(n, kind)))
      throw fail(400, `${key}包含无效资料`);
  if (
    c.analystId.some(
      (n: number) =>
        parse(refs.find((r) => r.id === n)!.data).companyCode !== c.companyCode,
    )
  )
    throw fail(400, "发起人不属于发布机构");
  for (const g of c.groupList) {
    const ref = refs.find((r) => r.id === g.code && r.kind === "group");
    if (
      !ref ||
      parse(ref.data).companyCode !== c.companyCode ||
      parse(ref.data).type !== g.type
    )
      throw fail(400, "授权分组不属于发布机构或类型不匹配");
  }
  c.companyAbbr =
    parse(refs.find((r) => r.id === c.companyCode)!.data).abbr ||
    refs.find((r) => r.id === c.companyCode)!.name;
}
const refData = (kind: string, data: unknown) => {
  const schemas: Record<string, z.ZodTypeAny> = {
    company: z.object({
      abbr: z.string().min(1),
      verifyWhitelistFlag: z.number().int().min(0).max(1),
      distributionStatus: z.number().int().min(0).max(1),
    }),
    security: z.object({ code: z.string().min(1) }),
    industry: z.object({ parentId: z.number().int().positive().optional() }),
    person: z.object({
      companyCode: z.number().int().positive(),
      phone: z.string().regex(/^1\d{10}$/),
      position: z.string(),
      industry: z.array(z.number()).default([]),
    }),
    group: z.object({
      companyCode: z.number().int().positive(),
      groupType: z.number().int().min(1).max(4),
      type: z.literal(19),
    }),
  };
  return schemas[kind].parse(data);
};
async function validateRefLinks(kind: string, data: any, id?: number) {
  if (data.parentId) {
    let n: number | undefined = data.parentId;
    const visited = new Set<number>();
    while (n) {
      if (n === id || visited.has(n)) throw fail(400, "行业父级形成循环");
      visited.add(n);
      const parent = await db.reference.findFirst({
        where: { id: n, kind: "industry" },
      });
      if (!parent) throw fail(400, "行业父级不存在");
      n = parse(parent.data).parentId;
    }
  }
  if (kind === "person")
    for (const n of data.industry)
      if (
        !(await db.reference.findFirst({ where: { id: n, kind: "industry" } }))
      )
        throw fail(400, "人员行业不存在");
}
export async function createApp() {
  const cookieName = process.env.SESSION_COOKIE_NAME || "session";
  const cookiePath = normalizeBasePath(process.env.PUBLIC_BASE_PATH);
  const app = Fastify({
    logger: process.env.NODE_ENV !== "test",
    bodyLimit: 2 * 1024 * 1024,
  });
  await mkdir(storage, { recursive: true });
  await app.register(cookie);
  await app.register(multipart, {
    limits: { fileSize: 50 * 1024 * 1024, files: 1, fields: 5 },
  });
  app.decorateRequest("user", null);
  app.setErrorHandler((e, req, reply) => {
    if (e instanceof z.ZodError)
      return reply.code(400).send({
        message: e.issues
          .map((i) => `${i.path.join(".")}: ${i.message}`)
          .join("；"),
      });
    // Prisma 5 wraps MariaDB 12's ER_CHECKREAD (1020) as an unknown
    // connector error; it still represents a retriable write conflict.
    if (
      (e as any).code === "P2034" ||
      (e.name === "PrismaClientUnknownRequestError" &&
        /MysqlError \{ code: 1020,/.test(e.message))
    )
      return reply
        .code(409)
        .send({ message: "数据正在被其他操作更新，请刷新后重试" });
    if ((e as any).code === "P2002")
      return reply.code(409).send({ message: "记录重复，请检查手机号或名称" });
    req.log.error(e);
    reply
      .code(e.statusCode || 500)
      .send({ message: e.statusCode ? e.message : "服务器错误，请稍后重试" });
  });
  app.addHook("preHandler", async (r: any) => {
    if (!r.url.startsWith("/api/")) return;
    if (r.method === "GET" && r.url === "/api/health") return;
    if (!["GET", "HEAD", "OPTIONS"].includes(r.method) && r.headers.origin) {
      const origin = new URL(r.headers.origin);
      if (origin.host !== r.headers.host) throw fail(403, "不允许跨站写入请求");
    }
    if (r.url === "/api/auth/login" || r.url.startsWith("/api/client/")) return;
    const session =
      r.cookies[cookieName] &&
      (await db.session.findUnique({
        where: { id: r.cookies[cookieName] },
        include: { user: true },
      }));
    if (!session || session.expiresAt < new Date())
      throw fail(401, "请重新登录");
    r.user = {
      id: session.user.id,
      username: session.user.username,
      role: session.user.role,
    };
    if (
      !["GET", "HEAD"].includes(r.method) &&
      r.user.role === "viewer" &&
      r.url !== "/api/auth/logout"
    )
      throw fail(403, "只读账号不能修改数据");
    if (
      r.url.startsWith("/api/references") &&
      !["GET", "HEAD"].includes(r.method) &&
      r.user.role !== "admin"
    )
      throw fail(403, "仅管理员可维护基础资料");
  });
  await registerClient(app, cookieName);
  const attempts = new Map<string, { count: number; since: number }>();
  app.post("/api/auth/login", async (r, reply) => {
    const key = r.ip;
    let a = attempts.get(key);
    if (!a || Date.now() - a.since > 600000) {
      a = { count: 0, since: Date.now() };
      attempts.set(key, a);
    }
    if (a.count >= 20) throw fail(429, "登录尝试过多，请10分钟后重试");
    const b = z
      .object({ username: z.string().max(100), password: z.string().max(200) })
      .parse(r.body);
    const u = await db.user.findUnique({ where: { username: b.username } });
    if (!u || !verify(b.password, u.password)) {
      a.count++;
      throw fail(401, "账号或密码错误");
    }
    attempts.delete(key);
    const token = randomBytes(32).toString("hex");
    await db.session.create({
      data: {
        id: token,
        userId: u.id,
        expiresAt: new Date(
          Date.now() + Number(process.env.SESSION_HOURS || 8) * 3600000,
        ),
      },
    });
    reply.setCookie(cookieName, token, {
      path: cookiePath,
      httpOnly: true,
      sameSite: "strict",
      secure: process.env.COOKIE_SECURE === "true",
    });
    return { username: u.username, role: u.role };
  });
  app.get("/api/auth/me", async (r: any) => r.user);
  app.post("/api/auth/logout", async (r: any, reply) => {
    await db.session.deleteMany({ where: { id: r.cookies[cookieName] } });
    reply.clearCookie(cookieName, { path: cookiePath });
    return { ok: true };
  });
  app.get("/api/health", async (_r, reply) => {
    try {
      await db.$queryRaw`SELECT 1`;
      return { status: "ok" };
    } catch {
      return reply.code(503).send({ status: "unavailable" });
    }
  });
  app.get("/api/references", async (r) => {
    const q = r.query as any;
    return (
      await db.reference.findMany({
        where: {
          ...(q.kind ? { kind: q.kind } : {}),
          ...(q.search ? { name: { contains: q.search } } : {}),
        },
        orderBy: { id: "asc" },
      })
    ).map(refView);
  });
  app.post("/api/references", async (r) => {
    const b = z
      .object({
        kind: z.enum(["company", "security", "industry", "person", "group"]),
        name: z.string().trim().min(1),
        data: z.unknown(),
      })
      .parse(r.body);
    const data = refData(b.kind, b.data);
    await validateRefLinks(b.kind, data);
    if (
      data.companyCode &&
      !(await db.reference.findFirst({
        where: { id: data.companyCode, kind: "company" },
      }))
    )
      throw fail(400, "机构不存在");
    const row = await db.reference.create({
      data: { kind: b.kind, name: b.name, data: JSON.stringify(data) },
    });
    await audit(r, "create", "reference", row.id, b);
    return refView(row);
  });
  app.patch("/api/references/:id", async (r) => {
    const old = await db.reference.findUnique({ where: { id: id(r) } });
    if (!old) throw fail(404, "资料不存在");
    const b = z
      .object({
        name: z.string().trim().min(1),
        data: z.unknown(),
        version: z.number().int(),
      })
      .parse(r.body);
    const data = refData(old.kind, b.data);
    await validateRefLinks(old.kind, data, old.id);
    if (
      data.companyCode &&
      !(await db.reference.findFirst({
        where: { id: data.companyCode, kind: "company" },
      }))
    )
      throw fail(400, "机构不存在");
    const count = await db.reference.updateMany({
      where: { id: old.id, version: b.version },
      data: {
        name: b.name,
        data: JSON.stringify(data),
        version: { increment: 1 },
      },
    });
    if (!count.count) throw fail(409, "资料已更新，请刷新");
    await audit(r, "update", "reference", old.id, {
      before: refView(old),
      after: b,
    });
    return refView(
      await db.reference.findUniqueOrThrow({ where: { id: old.id } }),
    );
  });
  app.delete("/api/references/:id", async (r) => {
    const ref = await db.reference.findUnique({ where: { id: id(r) } });
    if (!ref) throw fail(404, "资料不存在");
    const used = (await db.meeting.findMany()).some((m) => {
      const c = parse(m.data);
      return (
        m.companyCode === ref.id ||
        ["secu", "industry", "assistCompanyList", "analystId"].some((k) =>
          c[k]?.includes(ref.id),
        ) ||
        c.groupList?.some((g: any) => g.code === ref.id)
      );
    });
    const referenced = (await db.reference.findMany()).some(
      (r) =>
        parse(r.data).companyCode === ref.id ||
        parse(r.data).parentId === ref.id ||
        parse(r.data).industry?.includes(ref.id),
    );
    if (used || referenced) throw fail(409, "资料正在被使用，不能删除");
    await db.reference.delete({ where: { id: ref.id } });
    await audit(r, "delete", "reference", ref.id, ref);
    return { ok: true };
  });
  app.get("/api/meetings", async (r) => {
    const q = r.query as any;
    const page = Math.max(1, Number(q.page) || 1),
      size = Math.min(100, Math.max(1, Number(q.pageSize) || 10));
    const where: any = {};
    if (q.search)
      where.OR = [
        { title: { contains: q.search } },
        ...(Number.isInteger(Number(q.search))
          ? [{ id: Number(q.search) }]
          : []),
      ];
    for (const k of [
      "companyCode",
      "liveType",
      "status",
      "releaseFlag",
      "isNetSync",
    ])
      if (q[k] !== undefined && q[k] !== "") where[k] = Number(q[k]);
    for (const k of ["confirmed", "recommended"])
      if (q[k] !== undefined && q[k] !== "") where[k] = q[k] === "true";
    if (q.from || q.to)
      where.startTime = {
        ...(q.from ? { gte: new Date(q.from) } : {}),
        ...(q.to ? { lt: new Date(q.to) } : {}),
      };
    const [total, rows] = await db.$transaction([
      db.meeting.count({ where }),
      db.meeting.findMany({
        where,
        skip: (page - 1) * size,
        take: size,
        orderBy: { startTime: "desc" },
        include: { materials: true, tasks: true },
      }),
    ]);
    return { total, rows: rows.map(meetingView) };
  });
  app.get("/api/meetings/:id", async (r) => meetingView(await meeting(r)));
  async function saveMeeting(r: any, existing?: any) {
    const b = z
      .object({
        config: meetingSchema,
        version: z.number().int().optional(),
        confirmFlag: z.boolean().default(false),
        instituteConfirmed: z.boolean().default(false),
      })
      .parse(r.body);
    const c = serialize(b.config);
    await validateReferences(c);
    if (
      c.isInstitute &&
      !c.title.includes(c.companyAbbr.slice(0, 2)) &&
      !b.instituteConfirmed
    )
      throw fail(422, "主题与机构不一致，请确认同步研究所");
    for (const field of [
      "resourceUrl",
      "resourceUrlSmall",
      "commitmentLetterUrl",
      "pullUrl",
      "pushUrl",
    ])
      if (
        c[field as keyof typeof c] &&
        String(c[field as keyof typeof c]).startsWith("/api/files/")
      ) {
        const f = await db.upload.findUnique({
          where: { id: String(c[field as keyof typeof c]).split("/")[3] },
        });
        const expectedKind = (
          {
            resourceUrl: "poster",
            resourceUrlSmall: "thumbnail",
            commitmentLetterUrl: "commitment",
            pullUrl: "video",
            pushUrl: "video",
          } as any
        )[field];
        if (
          !f ||
          f.kind !== expectedKind ||
          (f.meetingId !== null && f.meetingId !== existing?.id)
        )
          throw fail(400, "文件不存在或属于其他会议");
      }
    if (
      existing &&
      [2, -1].includes(existing.status) &&
      (existing.liveType !== c.liveType ||
        existing.startTime.toISOString() !== c.startTime)
    )
      throw fail(400, "直播或取消会议不能修改类型和时间");
    if (existing?.status === -1 && parse(existing.data).meetTime !== c.meetTime)
      throw fail(400, "取消会议不能修改时长");
    const row = await db.$transaction(async (tx) => {
      const duplicate = await tx.meeting.findFirst({
        where: {
          title: c.title,
          startTime: new Date(c.startTime),
          ...(existing ? { id: { not: existing.id } } : {}),
        },
      });
      if (duplicate && !b.confirmFlag)
        throw fail(409, "同时间已有同名会议，请确认是否继续");
      const data = {
        title: c.title,
        startTime: new Date(c.startTime),
        companyCode: c.companyCode,
        liveType: c.liveType,
        releaseFlag: c.releaseFlag,
        isNetSync: c.isNetSync,
        data: JSON.stringify(c),
        ...(existing && (!c.releaseFlag || c.isNetSync === 1)
          ? { recommended: false }
          : {}),
      };
      let row;
      if (existing) {
        const updated = await tx.meeting.updateMany({
          where: { id: existing.id, version: b.version ?? -1 },
          data: { ...data, version: { increment: 1 } },
        });
        if (!updated.count)
          throw fail(409, "会议已被其他操作更新，请刷新后编辑");
        row = await tx.meeting.findUniqueOrThrow({
          where: { id: existing.id },
        });
      } else row = await tx.meeting.create({ data });
      for (const field of [
        "resourceUrl",
        "resourceUrlSmall",
        "commitmentLetterUrl",
        "pullUrl",
        "pushUrl",
      ])
        if (String(c[field as keyof typeof c]).startsWith("/api/files/")) {
          const fileId = String(c[field as keyof typeof c]).split("/")[3];
          const f = await tx.upload.findUnique({ where: { id: fileId } });
          if (!f || (f.meetingId !== null && f.meetingId !== row.id))
            throw fail(409, "文件已被其他会议绑定");
          await tx.upload.update({
            where: { id: fileId },
            data: { meetingId: row.id },
          });
        }
      await tx.audit.create({
        data: {
          actor: r.user.username,
          action: existing ? "update" : "create",
          entity: "meeting",
          entityId: String(row.id),
          changes: JSON.stringify({
            before: existing ? meetingView(existing) : null,
            after: c,
          }),
        },
      });
      return row;
    });
    return meetingView(row);
  }
  app.post("/api/meetings", (r) => saveMeeting(r));
  app.patch("/api/meetings/:id", async (r) => saveMeeting(r, await meeting(r)));
  app.post("/api/meetings/:id/action", async (r) => {
    const m = await meeting(r);
    const b = z
      .object({
        action: z.string(),
        version: z.number(),
        newStartTime: z.string().datetime().optional(),
      })
      .parse(r.body);
    const c = parse(m.data);
    if (b.newStartTime && !["activate", "restore"].includes(b.action))
      throw fail(400, "仅激活或恢复允许修改开始时间");
    let next;
    try {
      next = transition(
        m,
        b.action,
        b.newStartTime,
        c.replayDays !== -1 &&
          (await db.material.count({
            where: {
              meetingId: m.id,
              kind: "replay",
              recordStatus: "ready",
              OR: [{ url: { not: "" } }, { content: { not: "" } }],
            },
          })) > 0,
      );
    } catch (e) {
      throw fail(400, (e as Error).message);
    }
    if (b.newStartTime) {
      c.startTime = b.newStartTime;
      c.flowStartTime = b.newStartTime;
    }
    c.isNetSync = next.isNetSync;
    await db.$transaction(async (tx) => {
      const updated = await tx.meeting.updateMany({
        where: { id: m.id, version: b.version },
        data: {
          ...next,
          startTime: new Date(c.startTime),
          data: JSON.stringify(c),
          version: { increment: 1 },
        },
      });
      if (!updated.count) throw fail(409, "会议已更新，请刷新");
      await clientLifecycle(tx, m.id, m.status, next.status);
      await tx.audit.create({
        data: {
          actor: (r as any).user.username,
          action: b.action,
          entity: "meeting",
          entityId: String(m.id),
          changes: JSON.stringify({
            before: m.status,
            after: next.status,
            simulated: b.action === "start",
          }),
        },
      });
    });
    return meetingView(
      await db.meeting.findUniqueOrThrow({ where: { id: m.id } }),
    );
  });
  app.get("/api/meetings/:id/invitation", async (r) => {
    const m = await meeting(r),
      c = parse(m.data),
      base = `/simulation/${m.id}`;
    return {
      simulated: true,
      join: {
        活动ID: m.id,
        主题: m.title,
        时间: new Date(m.startTime).toLocaleString("zh-CN", {
          timeZone: "Asia/Shanghai",
        }),
        网络参会: `/client/meetings/${m.id}`,
        电话: "模拟电话：不拨号",
        参会口令: `DEMO-${m.id}-ATTEND`,
        主持口令: `DEMO-${m.id}-HOST`,
        主持: c.hosts.map((p: any) => p.name).join("、"),
        嘉宾: c.guests.map((p: any) => p.name).join("、"),
        监控: `${base}?kind=monitor`,
        二维码内容: `/client/meetings/${m.id}`,
        ...(c.shareTypes.includes(21)
          ? { 报名地址: `${base}?kind=apply`, 代报名: `${base}?kind=proxy` }
          : {}),
      },
      control: {
        组织者链接: `/client/meetings/${m.id}`,
        组织者口令: `DEMO-${m.id}-ORG`,
        参会口令: `DEMO-${m.id}-ATTEND`,
      },
      shorthand: {
        组织者链接: `${base}?kind=shorthand`,
        嘉宾口令: `DEMO-${m.id}-GUEST`,
      },
      other: { 管理员备注: c.managerTips },
    };
  });
  app.get("/api/meetings/:id/streams", async (r) => {
    const m = await meeting(r);
    return {
      simulated: true,
      push: `rtmp://example.invalid/live/${m.id}`,
      pull: `https://example.invalid/live/${m.id}.m3u8`,
      expiresAt: new Date(
        m.startTime.getTime() + parse(m.data).meetTime * 60000,
      ).toISOString(),
    };
  });
  app.get("/api/meetings/:id/people", async (r) => {
    await meeting(r);
    return (await db.person.findMany({ where: { meetingId: id(r) } })).map(
      (p) => ({ ...parse(p.data), id: p.id, version: p.version }),
    );
  });
  app.post("/api/meetings/:id/people", async (r) => {
    await meeting(r);
    const c = personSchema.parse(r.body);
    const row = await db.person.create({
      data: {
        meetingId: id(r),
        name: c.name,
        phone: c.phone,
        data: JSON.stringify(c),
      },
    });
    await audit(r, "create", "person", row.id, c);
    return row;
  });
  app.patch("/api/meetings/:id/people/:personId", async (r: any) => {
    await meeting(r);
    const c = personSchema.parse(r.body),
      v = z.number().int().parse(r.body.version);
    const result = await db.person.updateMany({
      where: { id: Number(r.params.personId), meetingId: id(r), version: v },
      data: {
        name: c.name,
        phone: c.phone,
        data: JSON.stringify(c),
        version: { increment: 1 },
      },
    });
    if (!result.count) throw fail(409, "名单已更新或不存在");
    await audit(r, "update", "person", r.params.personId, c);
    return { ok: true };
  });
  app.delete("/api/meetings/:id/people/:personId", async (r: any) => {
    await meeting(r);
    await db.person.deleteMany({
      where: { id: Number(r.params.personId), meetingId: id(r) },
    });
    await audit(r, "delete", "person", r.params.personId, {});
    return { ok: true };
  });
  app.post("/api/meetings/:id/people/import", async (r) => {
    await meeting(r);
    const b = z
      .object({
        rows: z.array(z.unknown()).max(1000),
        callMode: z.enum(["all", "whitelist", "none"]),
      })
      .parse(r.body);
    let added = 0;
    const failures: any[] = [];
    for (const raw of b.rows) {
      try {
        const c = personSchema.parse(raw);
        c.iscall = b.callMode === "none" ? 0 : 1;
        await db.person.create({
          data: {
            meetingId: id(r),
            name: c.name,
            phone: c.phone,
            data: JSON.stringify(c),
          },
        });
        added++;
      } catch (e) {
        const reason =
          e instanceof z.ZodError
            ? e.issues.map((i) => i.message).join("；")
            : "手机号重复或无法添加";
        failures.push({ data: raw, reason });
        await db.importFailure.create({
          data: { meetingId: id(r), data: JSON.stringify(raw), reason },
        });
      }
    }
    await audit(r, "import", "people", id(r), { added, failures });
    return { added, failures };
  });
  app.get("/api/meetings/:id/people/failures", async (r) => {
    await meeting(r);
    return db.importFailure.findMany({
      where: { meetingId: id(r) },
      orderBy: { id: "desc" },
    });
  });
  app.post("/api/meetings/:id/people/replay", async (r) => {
    await meeting(r);
    const b = z
      .object({
        ids: z.array(z.number()).min(1),
        replayDays: z.number().int().min(-1),
      })
      .parse(r.body);
    await db.$transaction(async (tx) => {
      const people = await tx.person.findMany({
        where: { meetingId: id(r), id: { in: b.ids } },
      });
      if (people.length !== new Set(b.ids).size)
        throw fail(400, "部分名单不属于本场会议");
      for (const p of people)
        await tx.person.update({
          where: { id: p.id },
          data: {
            data: JSON.stringify({
              ...parse(p.data),
              replayDays: b.replayDays,
            }),
            version: { increment: 1 },
          },
        });
    });
    await audit(r, "batchReplay", "people", id(r), b);
    return { ok: true };
  });
  app.post("/api/files", async (r: any) => {
    const q = z
      .object({
        kind: z.enum([
          "document",
          "poster",
          "thumbnail",
          "commitment",
          "video",
        ]),
        meetingId: z.coerce.number().int().positive().optional(),
      })
      .parse(r.query);
    if (
      q.meetingId &&
      !(await db.meeting.findUnique({ where: { id: q.meetingId } }))
    )
      throw fail(404, "会议不存在");
    const f = await r.file();
    if (!f) throw fail(400, "请选择文件");
    const ext = path.extname(f.filename).toLowerCase();
    const allowed: Record<string, string[]> = {
      document: [".ppt", ".pptx", ".pdf", ".doc", ".docx"],
      poster: [".jpg", ".jpeg", ".png"],
      thumbnail: [".jpg", ".jpeg", ".png"],
      commitment: [".pdf", ".doc", ".docx"],
      video: [".mp4", ".mov", ".webm"],
    };
    if (!allowed[q.kind].includes(ext)) throw fail(400, "不支持该文件格式");
    const buffer = await f.toBuffer();
    if (f.file.truncated) throw fail(413, "文件超过50MB");
    if (["poster", "thumbnail"].includes(q.kind)) {
      if (buffer.length >= 5 * 1024 * 1024) throw fail(413, "图片必须小于5MB");
      const png = buffer
        .subarray(0, 8)
        .equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]));
      const jpg = buffer[0] === 255 && buffer[1] === 216;
      if (!png && !jpg) throw fail(400, "图片内容不合法");
    }
    const filename = randomBytes(24).toString("hex") + ext;
    await writeFile(path.join(storage, filename), buffer);
    const row = await db.upload.create({
      data: {
        meetingId: q.meetingId,
        kind: q.kind,
        filename: path.basename(f.filename),
        path: filename,
        mime: f.mimetype,
        size: buffer.length,
      },
    });
    await audit(r, "upload", "file", row.id, {
      kind: q.kind,
      filename: row.filename,
    });
    return { ...row, url: `/api/files/${row.id}` };
  });
  app.get("/api/files/:fileId", async (r: any, reply) => {
    const f = await db.upload.findUnique({ where: { id: r.params.fileId } });
    if (!f) throw fail(404, "文件不存在");
    reply
      .header("Content-Type", f.mime)
      .header(
        "Content-Disposition",
        `attachment; filename*=UTF-8''${encodeURIComponent(f.filename)}`,
      )
      .header("X-Content-Type-Options", "nosniff");
    return reply.send(await readFile(path.join(storage, f.path)));
  });
  app.get("/api/meetings/:id/documents", async (r) => {
    await meeting(r);
    return db.document.findMany({
      where: { meetingId: id(r) },
      include: { upload: true },
      orderBy: { position: "asc" },
    });
  });
  app.put("/api/meetings/:id/documents", async (r) => {
    const m = await meeting(r),
      c = parse(m.data);
    const b = z
      .object({
        version: z.number(),
        files: z.array(
          z.object({
            uploadId: z.string(),
            ownerPhone: z.string().regex(/^1\d{10}$/),
          }),
        ),
      })
      .parse(r.body);
    const analysts = await db.reference.findMany({
      where: { id: { in: c.analystId }, kind: "person" },
    });
    const owners = [
      ...c.hosts,
      ...c.guests,
      ...analysts.map(refView).map((p) => p.data),
    ];
    if (new Set(b.files.map((f) => f.uploadId)).size !== b.files.length)
      throw fail(400, "同一文档不能重复绑定");
    for (const f of b.files) {
      if (!owners.some((o) => o.phone === f.ownerPhone))
        throw fail(400, "文档所有人必须是本场主持、嘉宾或发起人");
      const upload = await db.upload.findUnique({ where: { id: f.uploadId } });
      if (!upload || upload.kind !== "document" || upload.meetingId !== m.id)
        throw fail(400, "文档不属于本场会议");
      if (
        !(await db.task.findFirst({
          where: {
            meetingId: m.id,
            kind: "convert",
            status: "finished",
            input: JSON.stringify({ uploadId: f.uploadId }),
          },
        }))
      )
        throw fail(400, "请等待模拟转换完成");
    }
    await db.$transaction(async (tx) => {
      const updated = await tx.meeting.updateMany({
        where: { id: m.id, version: b.version },
        data: { version: { increment: 1 } },
      });
      if (!updated.count) throw fail(409, "会议已更新，请刷新");
      await tx.document.deleteMany({ where: { meetingId: m.id } });
      for (const [position, f] of b.files.entries())
        await tx.document.create({ data: { meetingId: m.id, ...f, position } });
    });
    await audit(r, "bind", "documents", m.id, b);
    return { ok: true };
  });
  app.get("/api/meetings/:id/uploads", async (r) => {
    await meeting(r);
    return db.upload.findMany({ where: { meetingId: id(r) } });
  });
  app.post("/api/meetings/:id/tasks", async (r) => {
    await meeting(r);
    const b = z
      .object({
        kind: z.enum(["convert", "sync", "materials", "attendance"]),
        uploadId: z.string().optional(),
        simulateFailure: z.boolean().default(false),
      })
      .parse(r.body);
    if (b.kind === "convert") {
      const f = await db.upload.findUnique({ where: { id: b.uploadId || "" } });
      if (!f || f.kind !== "document" || f.meetingId !== id(r))
        throw fail(400, "转换文件不属于本场会议");
    }
    const task = await db.task.create({
      data: {
        meetingId: id(r),
        kind: b.kind,
        input: JSON.stringify(
          b.kind === "convert" ? { uploadId: b.uploadId } : {},
        ),
        simulateFailure: b.simulateFailure,
      },
    });
    await audit(r, "simulateTask", "task", task.id, b);
    return task;
  });
  app.get("/api/meetings/:id/tasks", async (r) => {
    await meeting(r);
    return db.task.findMany({
      where: { meetingId: id(r) },
      orderBy: { id: "desc" },
    });
  });
  app.post("/api/meetings/:id/tasks/:taskId/retry", async (r: any) => {
    await meeting(r);
    const task = await db.task.findFirst({
      where: {
        id: Number(r.params.taskId),
        meetingId: id(r),
        status: "failed",
      },
    });
    if (!task) throw fail(400, "仅失败任务可以重试");
    const t = await db.task.update({
      where: { id: task.id },
      data: {
        status: "processing",
        simulateFailure: false,
        attempts: { increment: 1 },
        result: "{}",
      },
    });
    await audit(r, "retry", "task", task.id, {});
    return t;
  });
  app.get("/api/meetings/:id/materials", async (r) => {
    await meeting(r);
    return db.material.findMany({ where: { meetingId: id(r) } });
  });
  app.post("/api/meetings/:id/materials", async (r) => {
    await meeting(r);
    const b = z
      .object({
        kind: z.enum(["replay", "summary", "ai"]),
        recordStatus: z
          .enum(["pending", "processing", "ready", "failed"])
          .default("pending"),
        name: z.string().min(1),
        url: z.string().default(""),
        content: z.string().default(""),
      })
      .parse(r.body);
    if (
      b.url &&
      !b.url.startsWith("/simulation/") &&
      !/^https?:\/\//.test(b.url)
    )
      throw fail(400, "链接必须为HTTP地址");
    const row = await db.material.create({
      data: { meetingId: id(r), ...b, simulated: true },
    });
    await audit(r, "create", "material", row.id, b);
    return row;
  });
  app.patch("/api/meetings/:id/materials/:materialId", async (r: any) => {
    await meeting(r);
    const b = z
      .object({
        version: z.number(),
        name: z.string().min(1),
        url: z.string(),
        content: z.string(),
        aiValid: z.boolean(),
        recordStatus: z
          .enum(["pending", "processing", "ready", "failed"])
          .default("pending"),
      })
      .parse(r.body);
    if (
      b.url &&
      !b.url.startsWith("/simulation/") &&
      !/^https?:\/\//.test(b.url)
    )
      throw fail(400, "链接必须为HTTP地址");
    const { version, ...data } = b;
    const update = await db.material.updateMany({
      where: { id: Number(r.params.materialId), meetingId: id(r), version },
      data: { ...data, version: { increment: 1 } },
    });
    if (!update.count) throw fail(409, "资料已更新，请刷新");
    await audit(r, "update", "material", r.params.materialId, b);
    return { ok: true };
  });
  app.delete("/api/meetings/:id/materials/:materialId", async (r: any) => {
    await meeting(r);
    await db.material.deleteMany({
      where: { id: Number(r.params.materialId), meetingId: id(r) },
    });
    await audit(r, "delete", "material", r.params.materialId, {});
    return { ok: true };
  });
  app.get("/api/meetings/:id/deliveries", async (r) => {
    await meeting(r);
    return db.delivery.findMany({
      where: { meetingId: id(r) },
      orderBy: { id: "desc" },
    });
  });
  app.post("/api/meetings/:id/deliveries", async (r) => {
    const m = await meeting(r);
    if (![3, 4].includes(m.status))
      throw fail(400, "仅回放或结束会议可发送会后资料");
    const b = z
      .object({
        recipients: z.array(z.string().email()).min(1),
        contents: z
          .array(z.enum(["replay", "attendance", "summary", "ai"]))
          .min(1),
      })
      .parse(r.body);
    for (const kind of b.contents)
      if (
        kind !== "attendance" &&
        !(await db.material.count({ where: { meetingId: m.id, kind } }))
      )
        throw fail(400, "所选资料尚未生成");
    const row = await db.delivery.create({
      data: {
        meetingId: m.id,
        recipients: JSON.stringify(b.recipients),
        contents: JSON.stringify(b.contents),
      },
    });
    await audit(r, "simulateSend", "delivery", row.id, b);
    return row;
  });
  app.get("/api/meetings/:id/attendance", async (r) => {
    await meeting(r);
    const q = z
      .object({
        source: z.enum(["client", "simulated"]).default("client"),
        round: z.coerce.number().int().positive().optional(),
        search: z.string().default(""),
      })
      .parse(r.query);
    if (q.source === "client")
      return db.$transaction((tx) =>
        clientAttendance(tx, id(r), q.round, q.search),
      );
    const rows = await db.attendance.findMany({
      where: {
        meetingId: id(r),
        ...(q.search
          ? {
              OR: [
                { name: { contains: q.search } },
                { phone: { contains: q.search } },
              ],
            }
          : {}),
      },
      orderBy: { id: "asc" },
    });
    return {
      rows,
      stats: {
        count: rows.length,
        totalMinutes: rows.reduce((s, p) => s + p.minutes, 0),
        source: "仅数据库记录，含明确标记的模拟数据",
      },
    };
  });
  app.get("/api/series", async () =>
    db.series.findMany({
      include: {
        meetings: { select: { id: true, title: true, startTime: true } },
      },
    }),
  );
  app.post("/api/series", async (r) => {
    const b = z
      .object({ name: z.string().min(1), description: z.string().default("") })
      .parse(r.body);
    const row = await db.series.create({ data: b });
    await audit(r, "create", "series", row.id, b);
    return row;
  });
  app.patch("/api/series/:id", async (r) => {
    const b = z
      .object({
        name: z.string().min(1),
        description: z.string(),
        version: z.number(),
      })
      .parse(r.body);
    const updated = await db.series.updateMany({
      where: { id: id(r), version: b.version },
      data: {
        name: b.name,
        description: b.description,
        version: { increment: 1 },
      },
    });
    if (!updated.count) throw fail(409, "系列已更新");
    await audit(r, "update", "series", id(r), b);
    return { ok: true };
  });
  app.delete("/api/series/:id", async (r) => {
    if (await db.meeting.count({ where: { seriesId: id(r) } }))
      throw fail(409, "系列存在子会议，不能删除");
    await db.series.delete({ where: { id: id(r) } });
    await audit(r, "delete", "series", id(r), {});
    return { ok: true };
  });
  app.post("/api/series/:id/meetings", async (r) => {
    if (!(await db.series.findUnique({ where: { id: id(r) } })))
      throw fail(404, "系列不存在");
    const b = z
      .object({
        templateId: z.number().int().positive(),
        starts: z.array(z.string().datetime()).min(1).max(50),
      })
      .parse(r.body);
    const template = await db.meeting.findUnique({
      where: { id: b.templateId },
    });
    if (!template) throw fail(404, "模板会议不存在");
    const config = meetingSchema.parse(parse(template.data));
    await validateReferences(config);
    if (new Set(b.starts).size !== b.starts.length)
      throw fail(400, "子会议时间重复");
    const rows = await db.$transaction(async (tx) => {
      const out = [];
      for (const time of b.starts) {
        const c = serialize({
          ...config,
          startTime: time,
          flowStartTime: time,
          commitmentLetterUrl: "",
          resourceUrl: "",
          resourceUrlSmall: "",
          pullUrl: "",
          pushUrl: "",
        });
        if (
          await tx.meeting.findFirst({
            where: { title: c.title, startTime: new Date(time) },
          })
        )
          throw fail(409, "存在同时间同名会议，批量创建已取消");
        out.push(
          await tx.meeting.create({
            data: {
              seriesId: id(r),
              title: c.title,
              startTime: new Date(time),
              companyCode: c.companyCode,
              liveType: c.liveType,
              releaseFlag: c.releaseFlag,
              isNetSync: c.isNetSync,
              data: JSON.stringify(c),
            },
          }),
        );
      }
      return out;
    });
    await audit(r, "batchCreate", "series", id(r), {
      ids: rows.map((m) => m.id),
    });
    return rows;
  });
  app.get("/api/audits", async (r: any) => {
    if (r.user.role === "viewer") throw fail(403, "只读角色不能查看内部审计");
    return db.audit.findMany({ orderBy: { id: "desc" }, take: 200 });
  });
  app.get("/api/openapi.json", async () => openapi(routes));
  if (existsSync(path.resolve("dist"))) {
    await app.register(staticPlugin, {
      root: path.resolve("dist"),
      prefix: "/",
    });
    app.setNotFoundHandler((r, reply) =>
      r.url.startsWith("/api/")
        ? reply.code(404).send({ message: "接口不存在" })
        : reply.sendFile("index.html"),
    );
  }
  return app;
}
const routes: [string, string][] = [
  ["/api/health", "get"],
  ["/api/client/auth/login", "post"],
  ["/api/client/auth/me", "get"],
  ["/api/client/auth/logout", "post"],
  ["/api/client/meetings/{id}", "get"],
  ["/api/client/meetings/{id}/action", "post"],
  ["/api/client/meetings/{id}/attendance", "get"],
  ["/api/auth/login", "post"],
  ["/api/auth/me", "get"],
  ["/api/auth/logout", "post"],
  ["/api/references", "get,post"],
  ["/api/references/{id}", "patch,delete"],
  ["/api/meetings", "get,post"],
  ["/api/meetings/{id}", "get,patch"],
  ["/api/meetings/{id}/action", "post"],
  ...[
    "invitation",
    "streams",
    "uploads",
    "deliveries",
    "materials",
    "tasks",
    "people",
    "documents",
    "attendance",
  ].map(
    (p) =>
      [
        `/api/meetings/{id}/${p}`,
        p === "documents"
          ? "get,put"
          : ["people", "materials", "tasks", "deliveries"].includes(p)
            ? "get,post"
            : "get",
      ] as [string, string],
  ),
  ["/api/files", "post"],
  ["/api/files/{fileId}", "get"],
  ["/api/meetings/{id}/people/{personId}", "patch,delete"],
  ["/api/meetings/{id}/people/import", "post"],
  ["/api/meetings/{id}/people/failures", "get"],
  ["/api/meetings/{id}/people/replay", "post"],
  ["/api/meetings/{id}/tasks/{taskId}/retry", "post"],
  ["/api/meetings/{id}/materials/{materialId}", "patch,delete"],
  ["/api/series", "get,post"],
  ["/api/series/{id}", "patch,delete"],
  ["/api/series/{id}/meetings", "post"],
  ["/api/audits", "get"],
];
