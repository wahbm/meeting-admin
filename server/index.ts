import { createApp } from "./app";
import { tick } from "./tasks";
import { db } from "./db";
const app = await createApp();
await app.listen({
  port: Number(process.env.PORT || 3001),
  host: process.env.HOST || "127.0.0.1",
});
const timer = setInterval(() => tick().catch((e) => app.log.error(e)), 1000);
for (const signal of ["SIGINT", "SIGTERM"])
  process.on(signal, async () => {
    clearInterval(timer);
    await app.close();
    await db.$disconnect();
    process.exit(0);
  });
