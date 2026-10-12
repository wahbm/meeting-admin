import { test } from "node:test";
import { normalizeBasePath, withBasePath } from "../shared/public-path";
import assert from "node:assert/strict";
import {
  defaults,
  serialize,
  labelWarning,
  transition,
  meetingSchema,
} from "../shared/domain";
test("默认值、报名清理与客户平台三种编码", () => {
  const c = defaults();
  assert.equal(c.meetTime, 120);
  assert.equal(c.liveType, 1);
  assert.equal(c.replayDays, 0);
  assert.equal(serialize(c).validationType, 2);
  assert.equal(serialize({ ...c, shareTypes: [] }).validationType, 1);
  assert.equal(serialize({ ...c, customerPlatform: false }).validationType, 0);
  assert.equal(
    serialize({ ...c, commitmentLetterUrl: "unused" }).commitmentLetterUrl,
    "",
  );
  assert.equal(
    serialize({ ...c, shareTypes: [21], commitmentLetterUrl: "kept" })
      .commitmentLetterUrl,
    "kept",
  );
  assert.ok(labelWarning({ ...c, permissionLabel: 3 }));
});
test("状态操作码不等于会议状态；推荐依赖发布和上架", () => {
  const m = {
    status: 1,
    releaseFlag: 1,
    isNetSync: 0,
    confirmed: false,
    recommended: false,
  };
  assert.equal(transition(m, "cancel").status, -1);
  assert.equal(transition(m, "start").status, 2);
  assert.equal(
    transition({ ...m, status: 2 }, "end", undefined, true).status,
    3,
  );
  assert.throws(() => transition({ ...m, releaseFlag: 0 }, "recommend"));
  assert.throws(() => transition({ ...m, isNetSync: 1 }, "recommend"));
  assert.throws(() => transition({ ...m, status: 4 }, "restore"));
});

import { parseCSV } from "../src/import";
test("名单CSV解析支持中文、BOM、引号、换行和空行", () => {
  const rows = parseCSV(
    '\uFEFF姓名,手机号,机构\r\n"张,三",13800000000,"甲\n证券"\r\n\r\n',
  );
  assert.deepEqual(rows, [
    { 姓名: "张,三", 手机号: "13800000000", 机构: "甲\n证券" },
  ]);
  assert.throws(() => parseCSV('姓名\n"未闭合'));
});

import { parseImport } from "../src/import";
test("XLSX名单解析保留表头和手机号文本", async () => {
  const { default: ExcelJS } = await import("exceljs");
  const workbook = new ExcelJS.Workbook();
  const sheet = workbook.addWorksheet("名单");
  sheet.addRow(["姓名", "手机号"]);
  sheet.addRow(["张三", "13800000000"]);
  const buffer = await workbook.xlsx.writeBuffer();
  const rows = await parseImport({
    name: "名单.xlsx",
    size: buffer.byteLength,
    arrayBuffer: async () => buffer,
  } as unknown as File);
  assert.deepEqual(rows, [{ 姓名: "张三", 手机号: "13800000000" }]);
});

test("隐藏分发字段保留且不阻断；转播配置服务端归一化", () => {
  const c = {
    ...defaults(),
    title: "测试",
    companyCode: 1,
    companyAbbr: "机构",
    industry: [1],
    activityPushUrl: [{ name: "", url: "" }],
  };
  assert.equal(
    meetingSchema.safeParse({ ...c, liveType: 3, isRelay: 0 }).success,
    true,
  );
  assert.equal(
    meetingSchema.safeParse({ ...c, liveType: 1, isRelay: 0 }).success,
    false,
  );
  const cast = serialize({ ...c, liveType: 4, sipType: 0, isArtificial: 1 });
  assert.equal(cast.sipType, 1);
  assert.equal(cast.isArtificial, 0);
});
test("部署路径规范化和子路径资源地址", () => {
  assert.equal(normalizeBasePath(), "/");
  assert.equal(
    normalizeBasePath("/mosshqq/meeting-admin"),
    "/mosshqq/meeting-admin/",
  );
  assert.equal(
    withBasePath("/mosshqq/meeting-admin/", "/api/files/1"),
    "/mosshqq/meeting-admin/api/files/1",
  );
  assert.throws(() => normalizeBasePath("//evil.invalid/"));
  assert.throws(() => normalizeBasePath("/../"));
});
