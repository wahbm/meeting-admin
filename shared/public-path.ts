export function normalizeBasePath(value = "/") {
  const path = value.trim();
  if (!path || path === "/") return "/";
  if (!/^\/[A-Za-z0-9_/-]+\/?$/.test(path) || path.includes("//")) {
    throw new Error(
      "PUBLIC_BASE_PATH 必须为绝对路径，不含空格、查询参数或重复斜线",
    );
  }
  return path.replace(/\/$/, "") + "/";
}

export function withBasePath(base: string, path: string) {
  return normalizeBasePath(base) + path.replace(/^\//, "");
}
