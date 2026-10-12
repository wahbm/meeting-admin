import { build } from "esbuild";
await build({
  entryPoints: [
    "server/index.ts",
    "server/seed.ts",
    "server/import-data.ts",
    "server/smoke.ts",
  ],
  bundle: true,
  platform: "node",
  format: "esm",
  target: "node20",
  packages: "external",
  outdir: "build-server",
  sourcemap: true,
});
