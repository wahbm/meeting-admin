import { db } from "./db";
let busy = false;
export async function tick() {
  if (busy) return;
  busy = true;
  try {
    const tasks = await db.task.findMany({
      where: {
        status: "processing",
        updatedAt: { lte: new Date(Date.now() - 2500) },
      },
    });
    for (const t of tasks) {
      await db.$transaction(async (tx) => {
        const claimed = await tx.task.updateMany({
          where: { id: t.id, status: "processing" },
          data: {
            status: t.simulateFailure ? "failed" : "finished",
            result: JSON.stringify({
              simulated: true,
              message: t.simulateFailure
                ? "模拟服务失败，可重试"
                : "模拟任务完成；未调用外部服务",
              ...(t.kind === "convert"
                ? { preview: "模拟文档预览，不是原始文件转换结果" }
                : {}),
            }),
          },
        });
        if (!claimed.count) return;
        if (t.simulateFailure) {
          await tx.audit.create({
            data: {
              actor: "模拟任务执行器",
              action: "taskFailed",
              entity: "task",
              entityId: String(t.id),
              changes: JSON.stringify({ kind: t.kind, simulated: true }),
            },
          });
          return;
        }
        if (t.kind === "materials") {
          for (const [kind, name] of [
            ["replay", "模拟回放"],
            ["summary", "模拟会议纪要"],
            ["ai", "模拟 AI 纪要"],
          ])
            if (
              !(await tx.material.findFirst({
                where: { meetingId: t.meetingId, kind },
              }))
            )
              await tx.material.create({
                data: {
                  meetingId: t.meetingId,
                  kind,
                  name,
                  url: `/simulation/${t.meetingId}?kind=${kind}`,
                  content: "此为模拟产物，不含真实会议内容。",
                  simulated: true,
                  recordStatus: "ready",
                },
              });
        }
        if (t.kind === "attendance") {
          const people = await tx.person.findMany({
            where: { meetingId: t.meetingId },
          });
          for (const p of people)
            if (
              !(await tx.attendance.findFirst({
                where: {
                  meetingId: t.meetingId,
                  phone: p.phone,
                  source: "模拟数据",
                },
              }))
            )
              await tx.attendance.create({
                data: {
                  meetingId: t.meetingId,
                  name: p.name,
                  phone: p.phone,
                  minutes: 30,
                  joinedAt: new Date(),
                  source: "模拟数据",
                },
              });
        }
        await tx.audit.create({
          data: {
            actor: "模拟任务执行器",
            action: "taskFinished",
            entity: "task",
            entityId: String(t.id),
            changes: JSON.stringify({ kind: t.kind, simulated: true }),
          },
        });
      });
    }
  } finally {
    busy = false;
  }
}
