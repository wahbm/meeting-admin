import {
  readFileSync,
  mkdirSync,
  cpSync,
  rmSync,
  writeFileSync,
} from "node:fs";
const lock = JSON.parse(readFileSync("package-lock.json", "utf8"));
const dependencies = Object.fromEntries(
  [
    "@fastify/cookie",
    "@fastify/multipart",
    "@fastify/static",
    "@prisma/client",
    "fastify",
    "dotenv",
    "zod",
    "zod-to-json-schema",
    "prisma",
  ].map((name) => [name, lock.packages["node_modules/" + name].version]),
);
const out = "release-artifact";
rmSync(out, { recursive: true, force: true });
mkdirSync(out, { recursive: true });
for (const name of ["dist", "build-server"])
  cpSync(name, out + "/" + name, { recursive: true });
cpSync("prisma/mysql", out + "/prisma", { recursive: true });
writeFileSync(
  out + "/package.json",
  JSON.stringify(
    {
      name: "meeting-admin-runtime",
      version: "1.0.0",
      private: true,
      type: "module",
      dependencies,
    },
    null,
    2,
  ) + "\n",
);
writeFileSync(
  out + "/release.json",
  JSON.stringify({
    commit: process.env.GITHUB_SHA || "local",
    base: process.env.PUBLIC_BASE_PATH || "/",
  }) + "\n",
);
