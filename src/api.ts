import { withBasePath } from "../shared/public-path";

export const publicUrl = (path: string) =>
  withBasePath(import.meta.env.BASE_URL, path);

export async function api(url: string, method = "GET", body?: unknown) {
  const response = await fetch(publicUrl("/api" + url), {
    method,
    credentials: "include",
    headers:
      body instanceof FormData ? {} : { "Content-Type": "application/json" },
    body:
      body === undefined
        ? undefined
        : body instanceof FormData
          ? body
          : JSON.stringify(body),
  });
  const data = await response.json();
  if (!response.ok) {
    const e = Object.assign(Error(data.message || "请求失败"), {
      status: response.status,
    });
    if (response.status === 401 && url !== "/auth/login")
      window.dispatchEvent(new Event("session-expired"));
    throw e;
  }
  return data;
}
export async function upload(file: File, kind: string, meetingId?: number) {
  const form = new FormData();
  form.append("file", file);
  return api(
    `/files?kind=${kind}${meetingId ? `&meetingId=${meetingId}` : ""}`,
    "POST",
    form,
  );
}
export function downloadCSV(name: string, rows: any[]) {
  const keys = Object.keys(rows[0] || {});
  const cell = (v: any) =>
    `"${String(v ?? "")
      .replace(/^[=+@-]/, "'$&")
      .replaceAll('"', '""')}"`;
  const blob = new Blob(
    [
      "\ufeff" +
        [
          keys.map(cell).join(","),
          ...rows.map((r) => keys.map((k) => cell(r[k])).join(",")),
        ].join("\r\n"),
    ],
    { type: "text/csv;charset=utf-8" },
  );
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
}
