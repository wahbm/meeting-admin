const base = process.argv[2] || "http://127.0.0.1:3109";
async function json(path: string, init?: RequestInit) {
  const response = await fetch(base + path, init);
  if (!response.ok)
    throw Error(`Smoke ${path} failed: HTTP ${response.status}`);
  return { response, data: await response.json() };
}
const health = await json("/api/health");
if (health.data.status !== "ok") throw Error("Unhealthy database");
const login = await json("/api/auth/login", {
  method: "POST",
  headers: { "content-type": "application/json" },
  body: JSON.stringify({
    username: "admin",
    password: process.env.SEED_PASSWORD,
  }),
});
const cookie = login.response.headers.get("set-cookie")?.split(";")[0];
if (!cookie) throw Error("No session cookie");
const headers = { cookie };
const me = await json("/api/auth/me", { headers });
if (me.data.role !== "admin") throw Error("Unexpected admin role");
const meetings = await json("/api/meetings", { headers });
if (!Array.isArray(meetings.data.rows)) throw Error("Invalid meeting list");
const api = await json("/api/openapi.json", { headers });
if (!api.data.paths["/api/health"]) throw Error("Missing API health contract");
await json("/api/auth/logout", { method: "POST", headers });
console.log(
  JSON.stringify({
    smoke: "passed",
    database: "reachable",
    login: "passed",
    meetingCount: meetings.data.total,
    api: "passed",
  }),
);
export {};
