import type { FastifyInstance } from "fastify";
import type { Prisma } from "@prisma/client";
import { randomBytes } from "node:crypto";
import { z } from "zod";
import { db } from "./db";
import { phoneSchema, transition } from "../shared/domain";
import { normalizeBasePath } from "../shared/public-path";
type Tx = Prisma.TransactionClient;
const fail = (statusCode: number, message: string) =>
  Object.assign(Error(message), { statusCode });
const mask = (phone: string) => phone.slice(0, 3) + "****" + phone.slice(-4);
export function clientIdentity(config: any, people: any[], phone: string) {
  const host = config.hosts?.find((p: any) => p.phone === phone);
  const guest = config.guests?.find((p: any) => p.phone === phone);
  const person = people.find((p: any) => p.phone === phone);
  const role = host
    ? "host"
    : guest || (person && JSON.parse(person.data).role === 1)
      ? "guest"
      : "audience";
  return {
    allowed: !!(host || guest || person || config.allowAnyParticipant),
    role,
    name: host?.name || guest?.name || person?.name || mask(phone),
  };
}
async function lock(tx: Tx, meetingId: number) {
  // A database row lock serializes client operations across processes without
  // treating heartbeats/polling as edits to the meeting's version or updatedAt.
  const count =
    await tx.$executeRaw`UPDATE Meeting SET clientRevision = clientRevision + 1 WHERE id = ${meetingId}`;
  if (!count) throw fail(404, "会议不存在");
  return tx.meeting.findUniqueOrThrow({
    where: { id: meetingId },
    include: { people: true },
  });
}
async function leave(tx: Tx, roundId: number, phone: string, at: Date) {
  await tx.clientVisit.updateMany({
    where: { roundId, phone, leftAt: null },
    data: { leftAt: at },
  });
  await tx.clientSeat.updateMany({
    where: { roundId, phone },
    data: { joined: false, speaking: false },
  });
}
export async function closeClientRound(
  tx: Tx,
  meetingId: number,
  at = new Date(),
) {
  const rounds = await tx.meetingRound.findMany({
    where: { meetingId, endedAt: null },
  });
  for (const round of rounds) {
    const seats = await tx.clientSeat.findMany({
      where: { roundId: round.id, joined: true },
    });
    for (const seat of seats) {
      const expired =
        seat.lastHeartbeat &&
        at.getTime() - seat.lastHeartbeat.getTime() > 60000;
      await leave(tx, round.id, seat.phone, expired ? seat.lastHeartbeat! : at);
    }
    await tx.clientSeat.updateMany({
      where: { roundId: round.id },
      data: { speaking: false },
    });
    await tx.meetingRound.update({
      where: { id: round.id },
      data: { endedAt: at },
    });
  }
}
export async function startClientRound(
  tx: Tx,
  meetingId: number,
  startedAt: Date | null,
) {
  const last = await tx.meetingRound.findFirst({
    where: { meetingId },
    orderBy: { number: "desc" },
  });
  if (last && !last.endedAt) return last;
  return tx.meetingRound.create({
    data: { meetingId, number: (last?.number || 0) + 1, startedAt },
  });
}
export async function clientLifecycle(
  tx: Tx,
  meetingId: number,
  before: number,
  after: number,
) {
  if (before !== 2 && after === 2)
    await startClientRound(tx, meetingId, new Date());
  if (before === 2 && after !== 2) await closeClientRound(tx, meetingId);
}
async function reconcile(tx: Tx, m: any) {
  let round = await tx.meetingRound.findFirst({
    where: { meetingId: m.id },
    orderBy: { number: "desc" },
  });
  if (m.status === 2 && (!round || round.endedAt))
    round = await startClientRound(tx, m.id, null);
  if (m.status !== 2) {
    await closeClientRound(tx, m.id);
    return round;
  }
  const config = JSON.parse(m.data);
  const seats = await tx.clientSeat.findMany({ where: { roundId: round!.id } });
  const now = new Date();
  for (const seat of seats) {
    const identity = clientIdentity(config, m.people, seat.phone);
    const expired =
      seat.lastHeartbeat &&
      now.getTime() - seat.lastHeartbeat.getTime() > 60000;
    if (seat.joined && (expired || !identity.allowed))
      await leave(
        tx,
        seat.roundId,
        seat.phone,
        expired ? seat.lastHeartbeat! : now,
      );
    if (
      seat.role !== identity.role ||
      seat.name !== identity.name ||
      (!identity.allowed && seat.speaking)
    ) {
      await tx.clientSeat.update({
        where: { id: seat.id },
        data: {
          role: identity.role,
          name: identity.name,
          ...(!identity.allowed || identity.role === "audience"
            ? { speaking: false }
            : {}),
        },
      });
      await tx.clientVisit.updateMany({
        where: { roundId: seat.roundId, phone: seat.phone, leftAt: null },
        data: { role: identity.role, name: identity.name },
      });
    }
  }
  return round;
}
export async function sweepClientMeetings() {
  const meetings = await db.meeting.findMany({
    where: { rounds: { some: { endedAt: null } } },
    select: { id: true },
  });
  for (const m of meetings)
    await db.$transaction(async (tx) => reconcile(tx, await lock(tx, m.id)));
}
export async function clientAttendance(
  tx: Tx,
  meetingId: number,
  number?: number,
  search = "",
) {
  const rounds = await tx.meetingRound.findMany({
    where: { meetingId },
    orderBy: { number: "desc" },
  });
  const round = number ? rounds.find((r) => r.number === number) : rounds[0];
  const visits = round
    ? await tx.clientVisit.findMany({
        where: { roundId: round.id },
        orderBy: { id: "asc" },
      })
    : [];
  const grouped = new Map<string, any>();
  for (const v of visits) {
    const row = grouped.get(v.phone) || {
      id: v.phone,
      round: round!.number,
      phone: v.phone,
      joinedAt: v.joinedAt,
      leftAt: null,
      milliseconds: 0,
      source: "测试客户端参会",
    };
    row.name = v.name;
    row.role = v.role;
    row.leftAt = v.leftAt;
    row.milliseconds += Math.max(
      0,
      (v.leftAt || new Date()).getTime() - v.joinedAt.getTime(),
    );
    grouped.set(v.phone, row);
  }
  const rows = [...grouped.values()]
    .filter((r) => r.name.includes(search) || r.phone.includes(search))
    .map(({ milliseconds, ...r }) => ({
      ...r,
      minutes: Math.round(milliseconds / 600) / 100,
    }));
  return {
    rounds: rounds.map((r) => ({
      number: r.number,
      startedAt: r.startedAt,
      endedAt: r.endedAt,
    })),
    rows,
    stats: {
      count: rows.length,
      totalMinutes: rows.reduce((sum, r) => sum + r.minutes, 0),
      source: "测试客户端参会",
    },
  };
}
async function view(tx: Tx, m: any, phone: string) {
  const c = JSON.parse(m.data),
    identity = clientIdentity(c, m.people, phone);
  const round = await tx.meetingRound.findFirst({
    where: { meetingId: m.id },
    orderBy: { number: "desc" },
  });
  const seat = round
    ? await tx.clientSeat.findUnique({
        where: { roundId_phone: { roundId: round.id, phone } },
      })
    : null;
  const live = m.status === 2,
    host = identity.role === "host",
    joined = live && !!seat?.joined;
  const canSee = host || joined;
  const seats =
    round && canSee && live
      ? await tx.clientSeat.findMany({
          where: { roundId: round.id, joined: true },
        })
      : [];
  return {
    id: m.id,
    title: m.title,
    status: m.status,
    version: m.version,
    plannedStartTime: m.startTime,
    startedAt: m.status === 1 ? null : round?.startedAt,
    endedAt: m.status === 1 ? null : round?.endedAt,
    durationMinutes:
      round?.startedAt && round.endedAt
        ? Math.round(
            (round.endedAt.getTime() - round.startedAt.getTime()) / 600,
          ) / 100
        : null,
    round: round?.number,
    hosts: c.hosts.map((p: any) => p.name),
    guests: c.guests.map((p: any) => p.name),
    me: {
      phone,
      ...identity,
      joined,
      muted: !!seat?.muted,
      speaking: joined && !!seat?.speaking,
    },
    participants: seats.map((p) => ({
      id: p.id,
      name: p.name,
      phone: mask(p.phone),
      role: p.role,
      muted: p.muted,
      speaking: p.speaking,
    })),
    capabilities: {
      start: host && m.status === 1,
      end: host && live,
      join: live && !joined,
      leave: joined,
      speak: joined && identity.role !== "audience" && !seat?.muted,
      mute: host && live,
      participants: canSee && live,
      export: host && [3, 4].includes(m.status),
    },
  };
}
export async function registerClient(
  app: FastifyInstance,
  adminCookieName: string,
) {
  const cookieName = adminCookieName + "_client",
    cookiePath = normalizeBasePath(process.env.PUBLIC_BASE_PATH);
  const attempts = new Map<string, { count: number; since: number }>();
  app.addHook("preHandler", async (r: any) => {
    if (!r.url.startsWith("/api/client/")) return;
    if (r.url === "/api/client/auth/login") return;
    const token = r.cookies[cookieName];
    const session =
      token && (await db.clientSession.findUnique({ where: { id: token } }));
    if (!session || session.expiresAt < new Date())
      throw fail(401, "请重新登录测试客户端");
    r.clientPhone = session.phone;
  });
  app.post("/api/client/auth/login", async (r, reply) => {
    const now = Date.now();
    for (const [key, value] of attempts)
      if (now - value.since > 600000) attempts.delete(key);
    const attempt = attempts.get(r.ip) || { count: 0, since: now };
    if (attempt.count >= 20) throw fail(429, "登录尝试过多，请10分钟后重试");
    attempt.count++;
    attempts.set(r.ip, attempt);
    const b = z.object({ phone: phoneSchema, code: z.string() }).parse(r.body);
    if (b.code !== "1234") throw fail(401, "测试验证码错误");
    attempts.delete(r.ip);
    await db.clientSession.deleteMany({
      where: { expiresAt: { lt: new Date(now) } },
    });
    const token = randomBytes(32).toString("hex");
    await db.clientSession.create({
      data: {
        id: token,
        phone: b.phone,
        expiresAt: new Date(now + 8 * 3600000),
      },
    });
    reply.setCookie(cookieName, token, {
      path: cookiePath,
      httpOnly: true,
      sameSite: "strict",
      secure: process.env.COOKIE_SECURE === "true",
    });
    return { phone: b.phone };
  });
  app.get("/api/client/auth/me", async (r: any) => ({ phone: r.clientPhone }));
  app.post("/api/client/auth/logout", async (r: any, reply) => {
    await db.clientSession.deleteMany({ where: { id: r.cookies[cookieName] } });
    reply.clearCookie(cookieName, { path: cookiePath });
    return { ok: true };
  });
  async function access(
    r: any,
    operation: (tx: Tx, m: any, round: any, identity: any) => Promise<any>,
  ) {
    const meetingId = z.coerce.number().int().positive().parse(r.params.id);
    // Reconciliation commits even when the caller has just lost access.
    await db.$transaction(async (tx) =>
      reconcile(tx, await lock(tx, meetingId)),
    );
    return db.$transaction(async (tx) => {
      const m = await lock(tx, meetingId),
        identity = clientIdentity(JSON.parse(m.data), m.people, r.clientPhone);
      if (!identity.allowed) throw fail(403, "你不在本场会议允许参会人员中");
      const round = await reconcile(tx, m);
      return operation(tx, m, round, identity);
    });
  }
  app.get("/api/client/meetings/:id", (r: any) =>
    access(r, (tx, m) => view(tx, m, r.clientPhone)),
  );
  app.get("/api/client/meetings/:id/attendance", (r: any) =>
    access(r, async (tx, m, _round, identity) => {
      if (identity.role !== "host" || ![3, 4].includes(m.status))
        throw fail(403, "仅主持人可在会议结束后导出");
      return clientAttendance(tx, m.id);
    }),
  );
  app.post("/api/client/meetings/:id/action", (r: any) =>
    access(r, async (tx, m, round, identity) => {
      const b = z
        .object({
          action: z.enum([
            "start",
            "end",
            "join",
            "leave",
            "heartbeat",
            "speak",
            "stop",
            "mute",
            "unmute",
          ]),
          version: z.number().int().optional(),
          targetId: z.number().int().optional(),
        })
        .parse(r.body);
      const phone = r.clientPhone;
      if (["start", "end"].includes(b.action)) {
        if (identity.role !== "host") throw fail(403, "仅主持人可操作");
        if (b.version !== m.version) throw fail(409, "会议已更新，请刷新");
        const c = JSON.parse(m.data);
        const hasReplay =
          c.replayDays !== -1 &&
          (await tx.material.count({
            where: {
              meetingId: m.id,
              kind: "replay",
              recordStatus: "ready",
              OR: [{ url: { not: "" } }, { content: { not: "" } }],
            },
          })) > 0;
        let next;
        try {
          next = transition(
            {
              status: m.status,
              releaseFlag: m.releaseFlag,
              isNetSync: m.isNetSync,
              confirmed: m.confirmed,
              recommended: m.recommended,
            },
            b.action,
            undefined,
            hasReplay,
          );
        } catch (e) {
          throw fail(400, (e as Error).message);
        }
        await tx.meeting.update({
          where: { id: m.id },
          data: { ...next, version: { increment: 1 } },
        });
        await clientLifecycle(tx, m.id, m.status, next.status);
      } else {
        if (m.status !== 2 || !round) throw fail(400, "会议不在进行中");
        let seat = await tx.clientSeat.findUnique({
          where: { roundId_phone: { roundId: round.id, phone } },
        });
        if (b.action === "join") {
          if (!seat?.joined) {
            seat = await tx.clientSeat.upsert({
              where: { roundId_phone: { roundId: round.id, phone } },
              create: {
                roundId: round.id,
                phone,
                name: identity.name,
                role: identity.role,
                joined: true,
                lastHeartbeat: new Date(),
              },
              update: {
                joined: true,
                speaking: false,
                name: identity.name,
                role: identity.role,
                lastHeartbeat: new Date(),
              },
            });
            await tx.clientVisit.create({
              data: {
                roundId: round.id,
                phone,
                name: identity.name,
                role: identity.role,
                joinedAt: new Date(),
              },
            });
          }
        } else if (b.action === "leave")
          await leave(tx, round.id, phone, new Date());
        else if (["mute", "unmute"].includes(b.action)) {
          if (identity.role !== "host") throw fail(403, "仅主持人可禁言");
          const target =
            b.targetId &&
            (await tx.clientSeat.findFirst({
              where: { id: b.targetId, roundId: round.id },
            }));
          if (!target || target.role !== "guest")
            throw fail(400, "只能操作本轮嘉宾");
          await tx.clientSeat.update({
            where: { id: target.id },
            data: { muted: b.action === "mute", speaking: false },
          });
        } else {
          if (!seat?.joined) throw fail(409, "你已离开会议，请重新加入");
          if (b.action === "heartbeat")
            await tx.clientSeat.update({
              where: { id: seat.id },
              data: { lastHeartbeat: new Date() },
            });
          else {
            if (
              b.action === "speak" &&
              (identity.role === "audience" || seat.muted)
            )
              throw fail(403, "当前不可发言");
            await tx.clientSeat.update({
              where: { id: seat.id },
              data: { speaking: b.action === "speak" },
            });
          }
        }
      }
      if (b.action !== "heartbeat")
        await tx.audit.create({
          data: {
            actor: `测试客户端:${phone}`,
            action: `client:${b.action}`,
            entity: "meeting",
            entityId: String(m.id),
            changes: JSON.stringify({
              round: round?.number,
              targetId: b.targetId,
              simulatedMedia: true,
            }),
          },
        });
      const updated = await tx.meeting.findUniqueOrThrow({
        where: { id: m.id },
        include: { people: true },
      });
      return view(tx, updated, phone);
    }),
  );
}
