import { db } from "./db";
import { hash } from "./security";
import { defaults, serialize } from "../shared/domain";
export async function seed() {
  if (
    process.env.NODE_ENV === "production" &&
    (!process.env.SEED_PASSWORD || process.env.SEED_PASSWORD === "ChangeMe123!")
  ) {
    throw new Error("生产初始化需要独立 SEED_PASSWORD，不能使用示例密码");
  }
  const password = process.env.SEED_PASSWORD || "ChangeMe123!";
  for (const [username, role] of [
    ["admin", "admin"],
    ["operator", "operator"],
    ["viewer", "viewer"],
  ])
    await db.user.upsert({
      where: { username },
      update: {},
      create: { username, role, password: hash(password) },
    });
  if ((await db.reference.count()) === 0) {
    const rows = [
      {
        kind: "company",
        name: "甲证券",
        data: { abbr: "甲证券", verifyWhitelistFlag: 1, distributionStatus: 0 },
      },
      {
        kind: "company",
        name: "乙研究所",
        data: {
          abbr: "乙研究所",
          verifyWhitelistFlag: 0,
          distributionStatus: 1,
        },
      },
      { kind: "security", name: "示例上市公司", data: { code: "600001" } },
      { kind: "industry", name: "金融", data: {} },
      { kind: "industry", name: "科技", data: {} },
    ];
    for (const r of rows)
      await db.reference.create({
        data: { ...r, data: JSON.stringify(r.data) },
      });
    const company = await db.reference.findFirstOrThrow({
        where: { kind: "company" },
      }),
      industry = await db.reference.findFirstOrThrow({
        where: { kind: "industry" },
      });
    for (const [i, name] of ["张分析师", "李主持", "王嘉宾"].entries())
      await db.reference.create({
        data: {
          kind: "person",
          name,
          data: JSON.stringify({
            companyCode: company.id,
            phone: `1380000000${i}`,
            position: i === 2 ? "专家" : "分析师",
            industry: [industry.id],
          }),
        },
      });
    for (const [i, name] of [
      "核心客户",
      "买方客户",
      "华东客户",
      "销售一组",
    ].entries())
      await db.reference.create({
        data: {
          kind: "group",
          name,
          data: JSON.stringify({
            companyCode: company.id,
            groupType: i + 1,
            type: 19,
          }),
        },
      });
    const c = defaults();
    c.title = "甲证券｜行业交流（演示会议）";
    c.companyCode = company.id;
    c.companyAbbr = company.name;
    c.industry = [industry.id];
    c.hosts = [{ name: "李主持", phone: "13800000001", position: "分析师" }];
    c.guests = [{ name: "王嘉宾", phone: "13800000002", position: "专家" }];
    await db.meeting.create({
      data: {
        title: c.title,
        startTime: new Date(c.startTime),
        liveType: 1,
        companyCode: company.id,
        data: JSON.stringify(serialize(c)),
      },
    });
  }
}
if (/(^|[\/\\])seed\.(ts|js|mjs)$/.test(process.argv[1] || ""))
  seed()
    .then(() => {
      console.log(
        "演示数据已初始化，默认账号 admin / operator / viewer；密码见 README。",
      );
    })
    .finally(() => db.$disconnect());
