import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
const dir = mkdtempSync(path.join(tmpdir(), "meeting-admin-test-"));
const file = path.join(dir, "test.db");
writeFileSync(file, "");
const mysql = process.env.TEST_DATABASE_ENGINE === "mysql";
if (mysql) {
  const target = new URL(process.env.MYSQL_DATABASE_URL || "");
  if (
    !["localhost", "127.0.0.1"].includes(target.hostname) ||
    !target.pathname.endsWith("_test")
  )
    throw Error("MariaDB测试只允许本机隔离的_test数据库");
} else process.env.DATABASE_URL = "file:" + file;
process.env.NODE_ENV = "test";
process.env.STORAGE_DIR = path.join(dir, "uploads");
let app: any,
  db: any,
  cookie: string,
  viewer: string,
  operator: string,
  refs: any[],
  base: any,
  meetingId: number;
async function request(
  url: string,
  method = "GET",
  payload?: any,
  auth = cookie,
) {
  return app.inject({
    url: "/api" + url,
    method,
    payload,
    headers: auth ? { cookie: auth } : {},
  });
}
async function config() {
  const company = refs.find((r) => r.kind === "company");
  const industry = refs.find((r) => r.kind === "industry");
  const { defaults } = await import("../shared/domain");
  return {
    ...defaults(),
    title: "测试会议",
    companyCode: company.id,
    companyAbbr: company.name,
    industry: [industry.id],
    hosts: [{ name: "主持", phone: "13800000001", position: "分析师" }],
  };
}
before(async () => {
  const migrate = spawnSync(
    process.execPath,
    [
      "node_modules/prisma/build/index.js",
      "migrate",
      "deploy",
      ...(mysql ? ["--schema", "prisma/mysql/schema.prisma"] : []),
    ],
    { env: process.env, encoding: "utf8" },
  );
  assert.equal(migrate.status, 0, migrate.stderr);
  ({ db } = await import("../server/db"));
  const { seed } = await import("../server/seed");
  await seed();
  const { createApp } = await import("../server/app");
  app = await createApp();
  await app.ready();
  async function login(username: string) {
    const res = await request(
      "/auth/login",
      "POST",
      { username, password: process.env.SEED_PASSWORD || "ChangeMe123!" },
      "",
    );
    assert.equal(res.statusCode, 200, res.body);
    return res.headers["set-cookie"].split(";")[0];
  }
  cookie = await login("admin");
  viewer = await login("viewer");
  operator = await login("operator");
  refs = (await request("/references")).json();
  base = await config();
  const created = await request("/meetings", "POST", { config: base });
  assert.equal(created.statusCode, 200, created.body);
  meetingId = created.json().id;
});
after(async () => {
  await app?.close();
  await db?.$disconnect();
  rmSync(dir, { recursive: true, force: true });
});
test("鉴权、过期、只读权限和运营资料权限", async () => {
  const health = await request("/health", "GET", undefined, "");
  assert.equal(health.statusCode, 200);
  assert.deepEqual(health.json(), { status: "ok" });
  assert.equal(
    (await request("/meetings", "GET", undefined, "")).statusCode,
    401,
  );
  assert.equal(
    (await request("/meetings", "POST", { config: base }, viewer)).statusCode,
    403,
  );
  assert.equal(
    (
      await request(
        "/references",
        "POST",
        { kind: "industry", name: "禁止", data: {} },
        operator,
      )
    ).statusCode,
    403,
  );
  assert.equal(
    (await request("/auth/logout", "POST", {}, viewer)).statusCode,
    200,
  );
  assert.equal(
    (await request("/auth/me", "GET", undefined, viewer)).statusCode,
    401,
  );
  const expired = await db.session.create({
    data: {
      id: "expired",
      userId: (await db.user.findUnique({ where: { username: "admin" } })).id,
      expiresAt: new Date(0),
    },
  });
  assert.equal(
    (await request("/auth/me", "GET", undefined, "session=" + expired.id))
      .statusCode,
    401,
  );
});
test("五类会议保存与回显；反向编码和授权转换", async () => {
  for (let liveType = 1; liveType <= 5; liveType++) {
    const c = {
      ...base,
      title: `类型${liveType}`,
      liveType,
      sipType: liveType === 4 ? 1 : 0,
      isArtificial: liveType === 4 ? 0 : 1,
    };
    const res = await request("/meetings", "POST", { config: c });
    assert.equal(res.statusCode, 200, res.body);
    const saved = (await request("/meetings/" + res.json().id)).json();
    assert.equal(saved.liveType, liveType);
    assert.equal(saved.isNetSync, 0);
    assert.equal(saved.validationType, 2);
    assert.deepEqual(saved.share, [{ code: base.companyCode, type: 13 }]);
  }
});
test("必填、自定义分组、授权、机构归属和时长校验", async () => {
  for (const override of [
    { title: "" },
    { companyCode: 0 },
    { industry: [] },
    { meetTime: 0 },
    { meetTime: 1.5 },
    { shareTypes: [], customerPlatform: false },
    { shareTypes: [19], groupList: [] },
    { industry: [999999] },
    { analystId: [999999] },
  ])
    assert.equal(
      (await request("/meetings", "POST", { config: { ...base, ...override } }))
        .statusCode,
      400,
    );
  const group = refs.find((r) => r.kind === "group");
  const res = await request("/meetings", "POST", {
    config: {
      ...base,
      title: "分组",
      shareTypes: [19],
      groupList: [{ code: group.id, type: group.data.type }],
      customerPlatform: false,
    },
  });
  assert.equal(res.statusCode, 200, res.body);
  assert.equal(res.json().validationType, 0);
});
test("同名确认、研究所同步确认、乐观锁和并发编辑", async () => {
  assert.equal(
    (await request("/meetings", "POST", { config: base })).statusCode,
    409,
  );
  assert.equal(
    (await request("/meetings", "POST", { config: base, confirmFlag: true }))
      .statusCode,
    200,
  );
  assert.equal(
    (
      await request("/meetings", "POST", {
        config: { ...base, title: "机构不匹配", isInstitute: 1 },
      })
    ).statusCode,
    422,
  );
  assert.equal(
    (
      await request("/meetings", "POST", {
        config: { ...base, title: "机构不匹配", isInstitute: 1 },
        instituteConfirmed: true,
      })
    ).statusCode,
    200,
  );
  const m = (await request("/meetings/" + meetingId)).json();
  const payload = {
    config: { ...base, title: "并发编辑" },
    version: m.version,
  };
  const results = await Promise.all([
    request("/meetings/" + meetingId, "PATCH", payload),
    request("/meetings/" + meetingId, "PATCH", payload),
  ]);
  assert.deepEqual(results.map((r) => r.statusCode).sort(), [200, 409]);
});
test("生命周期、上架、推荐条件、恢复和直播编辑限制", async () => {
  const id = (
    await request("/meetings", "POST", {
      config: { ...base, title: "生命周期" },
    })
  ).json().id;
  async function action(a: string, time?: string) {
    const m = (await request("/meetings/" + id)).json();
    return request(`/meetings/${id}/action`, "POST", {
      action: a,
      version: m.version,
      newStartTime: time,
    });
  }
  assert.equal((await action("recommend")).statusCode, 200);
  assert.equal((await action("unshelve")).statusCode, 200);
  assert.equal((await action("recommend")).statusCode, 400);
  assert.equal((await action("shelve")).statusCode, 200);
  assert.equal((await action("cancel")).json().status, -1);
  assert.equal((await action("restore")).statusCode, 400);
  assert.equal(
    (await action("restore", new Date(Date.now() + 100000).toISOString()))
      .statusCode,
    200,
  );
  assert.equal((await action("start")).json().status, 2);
  const live = (await request("/meetings/" + id)).json();
  assert.equal(
    (
      await request("/meetings/" + id, "PATCH", {
        config: base,
        version: live.version,
      })
    ).statusCode,
    400,
  );
  assert.equal((await action("end")).json().status, 4);
  assert.equal(
    (await action("activate", new Date().toISOString())).json().status,
    1,
  );
});
test("名单导入部分失败、重复电话、批量权限及跨会议操作", async () => {
  const res = await request(`/meetings/${meetingId}/people/import`, "POST", {
    rows: [
      { name: "张三", phone: "13812345678" },
      { name: "重复", phone: "13812345678" },
      { name: "坏号码", phone: "123" },
    ],
    callMode: "all",
  });
  assert.equal(res.statusCode, 200, res.body);
  assert.equal(res.json().added, 1);
  assert.equal(res.json().failures.length, 2);
  const p = (await request(`/meetings/${meetingId}/people`)).json()[0];
  assert.equal(p.iscall, 1);
  assert.equal(p.role, 4);
  assert.equal(
    (
      await request(`/meetings/${meetingId}/people/replay`, "POST", {
        ids: [p.id],
        replayDays: 7,
      })
    ).statusCode,
    200,
  );
  assert.equal(
    (
      await request(`/meetings/${meetingId}/people/replay`, "POST", {
        ids: [999999],
        replayDays: 7,
      })
    ).statusCode,
    400,
  );
  assert.equal(
    (
      await request(`/meetings/${meetingId}/people/${p.id}`, "PATCH", {
        ...p,
        version: p.version,
      })
    ).statusCode,
    409,
  );
  assert.equal(
    (await request(`/meetings/${meetingId}/people/failures`)).json().length,
    2,
  );
});
function multipart(name: string, content: Buffer, mime = "application/pdf") {
  const boundary = "test-boundary";
  return {
    body: Buffer.concat([
      Buffer.from(
        `--${boundary}\r\nContent-Disposition: form-data; name="file"; filename="${name}"\r\nContent-Type: ${mime}\r\n\r\n`,
      ),
      content,
      Buffer.from(`\r\n--${boundary}--\r\n`),
    ]),
    type: `multipart/form-data; boundary=${boundary}`,
  };
}
test("文件类型、图片大小、内容及受保护下载", async () => {
  for (const [name, content, kind] of [
    ["bad.exe", Buffer.from("x"), "document"],
    ["fake.png", Buffer.from("not png"), "poster"],
    ["huge.png", Buffer.alloc(5 * 1024 * 1024), "thumbnail"],
  ] as const) {
    const f = multipart(name, content);
    const r = await app.inject({
      method: "POST",
      url: `/api/files?kind=${kind}&meetingId=${meetingId}`,
      payload: f.body,
      headers: { cookie, "content-type": f.type },
    });
    assert.ok([400, 413].includes(r.statusCode), r.body);
  }
  const f = multipart("slides.pdf", Buffer.from("%PDF-demo"));
  const r = await app.inject({
    method: "POST",
    url: `/api/files?kind=document&meetingId=${meetingId}`,
    payload: f.body,
    headers: { cookie, "content-type": f.type },
  });
  assert.equal(r.statusCode, 200, r.body);
  const uploadId = r.json().id;
  assert.equal(
    (await request("/files/" + uploadId, "GET", undefined, "")).statusCode,
    401,
  );
  assert.equal((await request("/files/" + uploadId)).statusCode, 200);
  const t = await request(`/meetings/${meetingId}/tasks`, "POST", {
    kind: "convert",
    uploadId,
    simulateFailure: true,
  });
  assert.equal(t.statusCode, 200, t.body);
  await db.task.update({
    where: { id: t.json().id },
    data: { updatedAt: new Date(0) },
  });
  const { tick } = await import("../server/tasks");
  await tick();
  assert.equal(
    (await db.task.findUnique({ where: { id: t.json().id } })).status,
    "failed",
  );
  assert.equal(
    (
      await request(
        `/meetings/${meetingId}/tasks/${t.json().id}/retry`,
        "POST",
        {},
      )
    ).statusCode,
    200,
  );
  await db.task.update({
    where: { id: t.json().id },
    data: { updatedAt: new Date(0) },
  });
  await tick();
  let m = (await request("/meetings/" + meetingId)).json();
  assert.equal(
    (
      await request(`/meetings/${meetingId}/documents`, "PUT", {
        version: m.version,
        files: [{ uploadId, ownerPhone: "13899999999" }],
      })
    ).statusCode,
    400,
  );
  assert.equal(
    (
      await request(`/meetings/${meetingId}/documents`, "PUT", {
        version: m.version,
        files: [{ uploadId, ownerPhone: "13800000001" }],
      })
    ).statusCode,
    200,
  );
  const another = (
    await request("/meetings", "POST", {
      config: { ...base, title: "文件归属" },
    })
  ).json();
  assert.equal(
    (
      await request(`/meetings/${another.id}/tasks`, "POST", {
        kind: "convert",
        uploadId,
      })
    ).statusCode,
    400,
  );
  await db.upload.deleteMany({
    where: { id: uploadId, documents: { none: {} } },
  });
});
test("持久化模拟任务、会后资料、模拟发送、统计和重复刷新", async () => {
  const { tick } = await import("../server/tasks");
  for (const kind of ["materials", "attendance", "sync"]) {
    const t = (
      await request(`/meetings/${meetingId}/tasks`, "POST", { kind })
    ).json();
    await db.task.update({
      where: { id: t.id },
      data: { updatedAt: new Date(0) },
    });
    await tick();
    assert.equal(
      (await db.task.findUnique({ where: { id: t.id } })).status,
      "finished",
    );
  }
  assert.equal(
    (await request(`/meetings/${meetingId}/materials`)).json().length,
    3,
  );
  const before = (await request(`/meetings/${meetingId}/attendance`)).json();
  assert.equal(before.stats.count, 1);
  assert.equal(before.rows[0].source, "模拟数据");
  const t = (
    await request(`/meetings/${meetingId}/tasks`, "POST", {
      kind: "attendance",
    })
  ).json();
  await db.task.update({
    where: { id: t.id },
    data: { updatedAt: new Date(0) },
  });
  await tick();
  assert.equal(
    (await request(`/meetings/${meetingId}/attendance`)).json().stats.count,
    1,
  );
  assert.equal(
    (
      await request(`/meetings/${meetingId}/deliveries`, "POST", {
        recipients: ["test@example.com"],
        contents: ["replay"],
      })
    ).statusCode,
    400,
  );
  let m = (await request("/meetings/" + meetingId)).json();
  await request(`/meetings/${meetingId}/action`, "POST", {
    action: "start",
    version: m.version,
  });
  m = (await request("/meetings/" + meetingId)).json();
  assert.equal(
    (
      await request(`/meetings/${meetingId}/action`, "POST", {
        action: "end",
        version: m.version,
      })
    ).json().status,
    3,
  );
  const send = await request(`/meetings/${meetingId}/deliveries`, "POST", {
    recipients: ["test@example.com"],
    contents: ["replay", "attendance"],
  });
  assert.equal(send.statusCode, 200, send.body);
  assert.equal(send.json().status, "simulated");
});
test("系列批量创建原子性和单场校验", async () => {
  const s = (await request("/series", "POST", { name: "系列" })).json();
  const starts = [
    new Date(Date.now() + 86400000).toISOString(),
    new Date(Date.now() + 172800000).toISOString(),
  ];
  const res = await request(`/series/${s.id}/meetings`, "POST", {
    templateId: meetingId,
    starts,
  });
  assert.equal(res.statusCode, 200, res.body);
  assert.equal(res.json().length, 2);
  assert.equal(
    (
      await request(`/series/${s.id}/meetings`, "POST", {
        templateId: meetingId,
        starts,
      })
    ).statusCode,
    409,
  );
  assert.equal((await request(`/series/${s.id}`, "DELETE")).statusCode, 409);
});
test("审计、API目录和应用重启后的持久化", async () => {
  assert.ok((await request("/audits")).json().length > 10);
  const spec = (await request("/openapi.json")).json();
  assert.equal(spec.openapi, "3.0.3");
  assert.ok(spec.paths["/api/meetings/{id}/people/import"]);
  const pending = await db.task.create({
    data: { meetingId, kind: "sync", updatedAt: new Date(0) },
  });
  await app.close();
  const { createApp } = await import("../server/app");
  app = await createApp();
  await app.ready();
  const { tick } = await import("../server/tasks");
  await tick();
  assert.equal(
    (await db.task.findUnique({ where: { id: pending.id } })).status,
    "finished",
  );
  assert.equal((await request("/meetings/" + meetingId)).statusCode, 200);
  assert.equal(
    (await request(`/meetings/${meetingId}/deliveries`)).json().length,
    1,
  );
});

test("行业树引用校验、跨站写入与非法状态参数", async () => {
  const parent = (
    await request("/references", "POST", {
      kind: "industry",
      name: "父级",
      data: {},
    })
  ).json();
  const child = (
    await request("/references", "POST", {
      kind: "industry",
      name: "子级",
      data: { parentId: parent.id },
    })
  ).json();
  assert.equal(
    (
      await request("/references/" + parent.id, "PATCH", {
        name: parent.name,
        data: { parentId: child.id },
        version: parent.version,
      })
    ).statusCode,
    400,
  );
  assert.equal(
    (await request("/references/" + parent.id, "DELETE")).statusCode,
    409,
  );
  const blocked = await app.inject({
    method: "POST",
    url: "/api/series",
    payload: { name: "跨站" },
    headers: { cookie, origin: "https://evil.invalid" },
  });
  assert.equal(blocked.statusCode, 403);
  const m = (await request("/meetings/" + meetingId)).json();
  assert.equal(
    (
      await request(`/meetings/${meetingId}/action`, "POST", {
        action: "confirm",
        version: m.version,
        newStartTime: new Date().toISOString(),
      })
    ).statusCode,
    400,
  );
});

test("部署Cookie名称与路径一致，退出清除相同Cookie", async () => {
  const previousBase = process.env.PUBLIC_BASE_PATH,
    previousName = process.env.SESSION_COOKIE_NAME;
  let scoped: any;
  try {
    process.env.PUBLIC_BASE_PATH = "/mosshqq/meeting-admin/";
    process.env.SESSION_COOKIE_NAME = "meeting_admin_session";
    const { createApp } = await import("../server/app");
    scoped = await createApp();
    const login = await scoped.inject({
      method: "POST",
      url: "/api/auth/login",
      payload: {
        username: "admin",
        password: process.env.SEED_PASSWORD || "ChangeMe123!",
      },
    });
    assert.equal(login.statusCode, 200, login.body);
    const header = login.headers["set-cookie"];
    assert.ok(header.startsWith("meeting_admin_session="));
    assert.ok(header.includes("Path=/mosshqq/meeting-admin/"));
    const logout = await scoped.inject({
      method: "POST",
      url: "/api/auth/logout",
      headers: { cookie: header.split(";")[0] },
    });
    assert.equal(logout.statusCode, 200);
    assert.ok(
      logout.headers["set-cookie"].includes("Path=/mosshqq/meeting-admin/"),
    );
  } finally {
    await scoped?.close();
    if (previousBase === undefined) delete process.env.PUBLIC_BASE_PATH;
    else process.env.PUBLIC_BASE_PATH = previousBase;
    if (previousName === undefined) delete process.env.SESSION_COOKIE_NAME;
    else process.env.SESSION_COOKIE_NAME = previousName;
  }
});
