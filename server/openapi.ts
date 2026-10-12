import { z } from "zod";
import { zodToJsonSchema } from "zod-to-json-schema";
import { meetingSchema, personSchema } from "../shared/domain";
import { normalizeBasePath } from "../shared/public-path";
const error = {
  description: "业务错误",
  content: {
    "application/json": {
      schema: { type: "object", properties: { message: { type: "string" } } },
    },
  },
};
const j = (schema: z.ZodTypeAny) =>
  zodToJsonSchema(schema, { target: "openApi3", effectStrategy: "input" });
const save = z.object({
  config: meetingSchema,
  version: z.number().int().optional(),
  confirmFlag: z.boolean().default(false),
  instituteConfirmed: z.boolean().default(false),
});
const action = z.object({
  action: z.enum([
    "cancel",
    "start",
    "end",
    "activate",
    "restore",
    "shelve",
    "unshelve",
    "confirm",
    "recommend",
    "unrecommend",
  ]),
  version: z.number().int(),
  newStartTime: z.string().datetime().optional(),
});
const payloads: Record<string, any> = {
  "post /api/auth/login": z.object({
    username: z.string(),
    password: z.string(),
  }),
  "post /api/meetings": save,
  "patch /api/meetings/{id}": save,
  "post /api/meetings/{id}/action": action,
  "post /api/references": z.object({
    kind: z.enum(["company", "security", "industry", "person", "group"]),
    name: z.string(),
    data: z.record(z.unknown()),
  }),
  "patch /api/references/{id}": z.object({
    name: z.string(),
    data: z.record(z.unknown()),
    version: z.number().int(),
  }),
  "post /api/meetings/{id}/people": personSchema,
  "patch /api/meetings/{id}/people/{personId}": personSchema.extend({
    version: z.number().int(),
  }),
  "post /api/meetings/{id}/people/import": z.object({
    rows: z.array(personSchema),
    callMode: z.enum(["all", "whitelist", "none"]),
  }),
  "post /api/meetings/{id}/people/replay": z.object({
    ids: z.array(z.number().int()),
    replayDays: z.number().int().min(-1),
  }),
  "put /api/meetings/{id}/documents": z.object({
    version: z.number().int(),
    files: z.array(z.object({ uploadId: z.string(), ownerPhone: z.string() })),
  }),
  "post /api/meetings/{id}/tasks": z.object({
    kind: z.enum(["convert", "sync", "materials", "attendance"]),
    uploadId: z.string().optional(),
    simulateFailure: z.boolean().optional(),
  }),
  "post /api/meetings/{id}/materials": z.object({
    kind: z.enum(["replay", "summary", "ai"]),
    recordStatus: z
      .enum(["pending", "processing", "ready", "failed"])
      .default("pending"),
    name: z.string(),
    url: z.string().optional(),
    content: z.string().optional(),
  }),
  "patch /api/meetings/{id}/materials/{materialId}": z.object({
    version: z.number().int(),
    name: z.string(),
    url: z.string(),
    content: z.string(),
    aiValid: z.boolean(),
    recordStatus: z
      .enum(["pending", "processing", "ready", "failed"])
      .default("pending"),
  }),
  "post /api/meetings/{id}/deliveries": z.object({
    recipients: z.array(z.string().email()),
    contents: z.array(z.enum(["replay", "attendance", "summary", "ai"])),
  }),
  "post /api/series": z.object({
    name: z.string(),
    description: z.string().optional(),
  }),
  "patch /api/series/{id}": z.object({
    name: z.string(),
    description: z.string(),
    version: z.number().int(),
  }),
  "post /api/series/{id}/meetings": z.object({
    templateId: z.number().int(),
    starts: z.array(z.string().datetime()),
  }),
};
export function openapi(routes: [string, string][]) {
  const paths: any = {};
  for (const [p, methods] of routes) {
    paths[p] = {};
    for (const method of methods.split(",")) {
      const parameters: any[] = [...p.matchAll(/\{([^}]+)\}/g)].map((m) => ({
        name: m[1],
        in: "path",
        required: true,
        schema: { type: m[1] === "fileId" ? "string" : "integer" },
      }));
      if (p === "/api/meetings" && method === "get")
        for (const name of [
          "search",
          "from",
          "to",
          "page",
          "pageSize",
          "companyCode",
          "liveType",
          "status",
          "releaseFlag",
          "isNetSync",
          "confirmed",
          "recommended",
        ])
          parameters.push({ name, in: "query", schema: { type: "string" } });
      if (p === "/api/references" && method === "get")
        for (const name of ["kind", "search"])
          parameters.push({ name, in: "query", schema: { type: "string" } });
      if (p.endsWith("/attendance"))
        parameters.push({
          name: "search",
          in: "query",
          schema: { type: "string" },
        });
      const schema = payloads[`${method} ${p}`];
      paths[p][method] = {
        summary: p,
        tags: [p.split("/")[2]],
        parameters,
        ...(["/api/auth/login", "/api/health"].includes(p)
          ? { security: [] }
          : {}),
        ...(schema
          ? {
              requestBody: {
                required: true,
                content: { "application/json": { schema: j(schema) } },
              },
            }
          : {}),
        responses: {
          "200": {
            description: "成功，直接返回实体、数组或查询结果，详见 docs/api.md",
          },
          "400": error,
          "401": error,
          "403": error,
          "409": error,
          "422": error,
        },
      };
    }
  }
  paths["/api/files"].post.parameters = [
    {
      name: "kind",
      in: "query",
      required: true,
      schema: {
        type: "string",
        enum: ["document", "poster", "thumbnail", "commitment", "video"],
      },
    },
    { name: "meetingId", in: "query", schema: { type: "integer" } },
  ];
  paths["/api/files"].post.requestBody = {
    required: true,
    content: {
      "multipart/form-data": {
        schema: {
          type: "object",
          required: ["file"],
          properties: { file: { type: "string", format: "binary" } },
        },
      },
    },
  };
  return {
    openapi: "3.0.3",
    info: {
      title: "会议管理后台 API",
      version: "1.0.0",
      description:
        "单一管理空间；除登录外均要求session cookie；外部能力全部模拟。字段取值与共享Zod保持一致。",
    },
    servers: [{ url: normalizeBasePath(process.env.PUBLIC_BASE_PATH) }],
    components: {
      securitySchemes: {
        session: {
          type: "apiKey",
          in: "cookie",
          name: process.env.SESSION_COOKIE_NAME || "session",
        },
      },
      schemas: { MeetingConfig: j(meetingSchema), Person: j(personSchema) },
    },
    security: [{ session: [] }],
    paths,
  };
}
