import "dotenv/config";
import { existsSync, mkdirSync, openSync, closeSync } from "node:fs";
import path from "node:path";
const url = process.env.DATABASE_URL || "file:./meeting.db";
if (!url.startsWith("file:")) throw Error("MVP仅支持SQLite file:数据库");
const file = path.resolve("prisma", url.slice(5).split("?")[0]);
mkdirSync(path.dirname(file), { recursive: true });
if (!existsSync(file)) closeSync(openSync(file, "a"));
