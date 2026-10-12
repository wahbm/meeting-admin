import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
const source = readFileSync("prisma/schema.prisma", "utf8");
const mysql = source
  .replace('provider = "sqlite"', 'provider = "mysql"')
  .replace('url = env("DATABASE_URL")', 'url = env("MYSQL_DATABASE_URL")')
  .replace(
    /^(\s*)(data|input|result|changes|recipients|contents|content) String(.*)$/gm,
    "$1$2 String$3 @db.LongText",
  )
  .replace(
    /^(\s*)(title|name|description|filename|url) String(.*)$/gm,
    "$1$2 String$3 @db.Text",
  );
mkdirSync("prisma/mysql", { recursive: true });
writeFileSync("prisma/mysql/schema.prisma", mysql);
