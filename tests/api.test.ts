import { test } from "node:test";
import assert from "node:assert/strict";
import { build } from "esbuild";

test("公共请求仅为JSON请求体设置Content-Type，退出请求不发送空JSON", async (t) => {
  const bundle = await build({
    entryPoints: ["src/api.ts"],
    bundle: true,
    write: false,
    format: "esm",
    define: { "import.meta.env.BASE_URL": '"/mosshqq/meeting-admin/"' },
  });
  const { api } = await import(
    "data:text/javascript;base64," +
      Buffer.from(bundle.outputFiles[0].text).toString("base64")
  );
  const requests: { url: string; options: RequestInit }[] = [];
  t.mock.method(
    globalThis,
    "fetch",
    async (url: string, options: RequestInit) => {
      requests.push({ url, options });
      return new Response(JSON.stringify({ ok: true }));
    },
  );
  for (const url of ["/client/auth/logout", "/auth/logout"]) {
    await api(url, "POST");
    const sent = requests.at(-1)!;
    assert.equal(sent.url, "/mosshqq/meeting-admin/api" + url);
    assert.equal(sent.options.credentials, "include");
    assert.equal(sent.options.body, undefined);
    assert.equal(new Headers(sent.options.headers).has("Content-Type"), false);
  }
  await api("/client/auth/login", "POST", {
    phone: "13800000001",
    code: "1234",
  });
  assert.equal(
    new Headers(requests.at(-1)!.options.headers).get("Content-Type"),
    "application/json",
  );
  assert.deepEqual(JSON.parse(requests.at(-1)!.options.body as string), {
    phone: "13800000001",
    code: "1234",
  });
  const form = new FormData();
  form.append("kind", "document");
  await api("/files", "POST", form);
  assert.equal(requests.at(-1)!.options.body, form);
  assert.equal(
    new Headers(requests.at(-1)!.options.headers).has("Content-Type"),
    false,
  );
});
