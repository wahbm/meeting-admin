import { readFile } from "node:fs/promises";
import { db } from "./db";
const source = JSON.parse(await readFile(process.argv[2], "utf8"));
if (source.format !== "meeting-admin-sqlite-v1")
  throw Error("Unexpected import format");
const delegates: Record<string, string> = {
  Reference: "reference",
  Series: "series",
  Meeting: "meeting",
  Person: "person",
  Upload: "upload",
  Document: "document",
  Task: "task",
  Material: "material",
  Delivery: "delivery",
  Attendance: "attendance",
  ImportFailure: "importFailure",
  Audit: "audit",
};
const dateFields = ["startTime", "createdAt", "updatedAt", "joinedAt"];
const booleanFields = [
  "confirmed",
  "recommended",
  "simulateFailure",
  "aiValid",
  "simulated",
];
try {
  await db.$transaction(
    async (tx) => {
      for (const name of Object.values(delegates))
        if (await (tx as any)[name].count())
          throw Error("Target contains data; automatic merge is prohibited");
      for (const [table, delegate] of Object.entries(delegates))
        for (const row of source.tables[table] || []) {
          const data = { ...row };
          for (const key of dateFields)
            if (data[key] !== undefined) data[key] = new Date(data[key]);
          for (const key of booleanFields)
            if (data[key] !== undefined) data[key] = Boolean(data[key]);
          await (tx as any)[delegate].create({ data });
        }
    },
    { timeout: 60000 },
  );
  console.log(
    JSON.stringify({
      imported: true,
      counts: Object.fromEntries(
        Object.entries(source.tables).map(([key, value]) => [
          key,
          (value as unknown[]).length,
        ]),
      ),
    }),
  );
} finally {
  await db.$disconnect();
}
