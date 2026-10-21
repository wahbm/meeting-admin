import DOMPurify from "dompurify";
import React, { useState, useEffect } from "react";
import {
  Alert,
  App,
  Button,
  Card,
  Checkbox,
  DatePicker,
  Descriptions,
  Form,
  Input,
  InputNumber,
  Modal,
  Select,
  Space,
  Table,
  Tabs,
  Tag,
  Typography,
  Upload,
} from "antd";
import { Link, useParams, useSearchParams } from "react-router-dom";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import dayjs from "dayjs";
import { parseImport } from "./import";
import { api, upload, downloadCSV, publicUrl } from "./api";
import { useUser, useRefs, LoadingError } from "./App";
import { meetingTypes, statuses, personSchema } from "../shared/domain";
const stamp = (v: string) =>
  dayjs(v).tz("Asia/Shanghai").format("YYYY-MM-DD HH:mm");
const taskNames: Record<string, string> = {
  convert: "文档转换",
  sync: "名单同步",
  materials: "资料生成",
  attendance: "统计刷新",
};
export function MeetingDetail() {
  const { id } = useParams();
  const [params, setParams] = useSearchParams();
  const q = useQuery({
    queryKey: ["meeting", id],
    queryFn: () => api("/meetings/" + id),
    refetchInterval: 3000,
  });
  const user = useUser(),
    qc = useQueryClient();
  const { message, modal } = App.useApp();
  const [newStart, setNewStart] = useState<any>();
  const [actionModal, setActionModal] = useState("");
  const readonly = user.role === "viewer";
  async function act(action: string, time?: string) {
    try {
      await api(`/meetings/${id}/action`, "POST", {
        action,
        version: q.data.version,
        newStartTime: time,
      });
      qc.invalidateQueries({ queryKey: ["meeting", id] });
      message.success("操作已记录");
      setActionModal("");
    } catch (e: any) {
      message.error(e.message);
    }
  }
  if (!q.data) return <LoadingError query={q} />;
  const m = q.data;
  return (
    <>
      <div className="page-heading">
        <div>
          <Space>
            <Typography.Title level={2}>{m.title}</Typography.Title>
            <Tag color="blue">{statuses[m.status]}</Tag>
          </Space>
          <p className="muted">
            活动 #{id} · {m.companyAbbr} · {stamp(m.startTime)} · {m.meetTime}{" "}
            分钟
          </p>
        </div>
        <Space>
          <a
            href={publicUrl(`/client/meetings/${id}`)}
            target="_blank"
            rel="noreferrer"
          >
            <Button>测试会议客户端</Button>
          </a>
          <Link to={`/?id=${id}`}>
            <Button>列表定位</Button>
          </Link>
          {!readonly && (
            <Link to={`/meetings/${id}/edit`}>
              <Button type="primary">编辑会议</Button>
            </Link>
          )}
        </Space>
      </div>
      <Card>
        <Descriptions
          column={4}
          items={[
            {
              key: "type",
              label: "会议类型",
              children: meetingTypes[m.liveType],
            },
            {
              key: "published",
              label: "发布 / 上架",
              children: `${m.releaseFlag ? "已发布" : "未发布"} / ${m.isNetSync === 0 ? "已上架" : "已下架"}`,
            },
            {
              key: "confirmed",
              label: "确认",
              children: m.confirmed ? "已确认" : "未确认",
            },
            {
              key: "recommended",
              label: "推荐",
              children: m.recommended ? "已推荐" : "未推荐",
            },
          ]}
        />
        {!readonly && (
          <Space wrap style={{ marginTop: 16 }}>
            {[
              ["confirm", m.confirmed ? "重新确认" : "确认"],
              [
                m.isNetSync === 0 ? "unshelve" : "shelve",
                m.isNetSync === 0 ? "下架" : "上架",
              ],
              ...(m.status === 1
                ? [
                    ["cancel", "取消会议"],
                    ["start", "模拟开始"],
                  ]
                : []),
              ...(m.status === 2 ? [["end", "结束会议"]] : []),
              ...([3, 4].includes(m.status) ? [["activate", "重新激活"]] : []),
              ...(m.status === -1 ? [["restore", "恢复会议"]] : []),
              ...(m.recommended
                ? [["unrecommend", "取消推荐"]]
                : m.releaseFlag &&
                    m.isNetSync === 0 &&
                    [1, 2].includes(m.status)
                  ? [["recommend", "推到首页"]]
                  : []),
            ].map(([action, label]) => (
              <Button
                key={action}
                danger={["cancel", "end"].includes(action)}
                onClick={() => {
                  if (["activate", "restore"].includes(action)) {
                    setNewStart(dayjs().tz("Asia/Shanghai").add(1, "hour"));
                    setActionModal(action);
                  } else
                    modal.confirm({
                      title: label,
                      content:
                        action === "start"
                          ? "仅模拟状态变化，不启动直播或创建房间。"
                          : "确认执行此操作？",
                      onOk: () => act(action),
                    });
                }}
              >
                {label}
              </Button>
            ))}
          </Space>
        )}
      </Card>
      <Tabs
        activeKey={params.get("tab") || "invitation"}
        onChange={(tab) => setParams({ tab })}
        style={{ marginTop: 20 }}
        items={[
          {
            key: "invitation",
            label: "邀请信息",
            children: <Invitation id={id!} />,
          },
          { key: "people", label: "临时白名单", children: <People id={id!} /> },
          {
            key: "documents",
            label: "演示文档",
            children: <Documents id={id!} meeting={m} />,
          },
          {
            key: "materials",
            label: "会后资料",
            children: <Materials id={id!} meeting={m} />,
          },
          {
            key: "attendance",
            label: "参会统计",
            children: <Attendance id={id!} />,
          },
          {
            key: "streams",
            label: "推拉流地址",
            children: <Streams id={id!} />,
          },
          {
            key: "config",
            label: "配置详情",
            children: (
              <Card>
                <Typography.Title level={5}>会议介绍预览</Typography.Title>
                <div
                  dangerouslySetInnerHTML={{
                    __html: DOMPurify.sanitize(m.introduction || ""),
                  }}
                />
                <Descriptions
                  column={1}
                  items={Object.entries(m)
                    .filter(
                      ([k]) => !["data", "materials", "tasks"].includes(k),
                    )
                    .map(([key, v]) => ({
                      key,
                      label: key,
                      children: (
                        <pre className="json-value">
                          {typeof v === "object"
                            ? JSON.stringify(v, null, 2)
                            : String(v)}
                        </pre>
                      ),
                    }))}
                />
              </Card>
            ),
          },
        ]}
      />
      <Modal
        title={actionModal === "restore" ? "恢复会议" : "重新激活"}
        open={!!actionModal}
        onCancel={() => setActionModal("")}
        onOk={() =>
          newStart
            ? act(actionModal, newStart.toISOString())
            : message.error("请选择开始时间")
        }
      >
        <p>填写新的会议开始时间</p>
        <DatePicker showTime value={newStart} onChange={setNewStart} />
      </Modal>
    </>
  );
}
function Invitation({ id }: { id: string }) {
  const q = useQuery({
    queryKey: ["invitation", id],
    queryFn: () => api(`/meetings/${id}/invitation`),
  });
  const { message } = App.useApp();
  if (!q.data) return <LoadingError query={q} />;
  return (
    <>
      <Alert
        showIcon
        type="info"
        message="测试会议客户端入口"
        description="网络参会、参会二维码和会控组织者链接可打开测试客户端，权限由登录手机号决定。音视频、电话、口令、监控、报名和速记仍为模拟。"
        style={{ marginBottom: 16 }}
      />
      <div className="invitation-grid">
        {[
          ["join", "约会信息"],
          ["control", "会控信息"],
          ["shorthand", "速记信息"],
          ["other", "备注信息"],
        ].map(([key, label]) => (
          <Card
            title={label}
            key={key}
            extra={
              <Button
                onClick={() =>
                  navigator.clipboard
                    .writeText(
                      "[测试会议邀请；音视频及其他外部能力为模拟]\n" +
                        Object.entries(q.data[key])
                          .map(
                            ([k, v]) =>
                              `${k}：${String(v).startsWith("/client/") ? location.origin + publicUrl(String(v)) : v}`,
                          )
                          .join("\n"),
                    )
                    .then(() => message.success("已复制"))
                    .catch(() =>
                      message.error("浏览器不支持复制，请手动选择文本"),
                    )
                }
              >
                复制
              </Button>
            }
          >
            <Descriptions
              column={1}
              items={Object.entries(q.data[key]).map(([k, v]) => ({
                key: k,
                label: k,
                children: String(v).startsWith("/client/") ? (
                  <a
                    href={publicUrl(String(v))}
                    target="_blank"
                    rel="noreferrer"
                  >
                    {location.origin + publicUrl(String(v))}
                  </a>
                ) : String(v).startsWith("/simulation/") ? (
                  <Link to={String(v)}>查看模拟入口</Link>
                ) : (
                  String(v)
                ),
              }))}
            />
            {key === "join" && (
              <Space wrap>
                {["二维码内容", "报名地址"]
                  .filter((k) => q.data.join[k])
                  .map((k) => (
                    <div key={k}>
                      <Typography.Paragraph>
                        {k}
                        {String(q.data.join[k]).startsWith("/client/")
                          ? "（测试客户端）"
                          : "（模拟）"}
                      </Typography.Paragraph>
                      <QRCodeLink
                        value={location.origin + publicUrl(q.data.join[k])}
                      />
                    </div>
                  ))}
              </Space>
            )}
          </Card>
        ))}
      </div>
    </>
  );
}
import { QRCode } from "antd";
function QRCodeLink({ value }: { value: string }) {
  return <QRCode value={value} size={128} />;
}
function Streams({ id }: { id: string }) {
  const q = useQuery({
    queryKey: ["streams", id],
    queryFn: () => api(`/meetings/${id}/streams`),
  });
  return (
    <Card title="推拉流信息">
      <Alert type="info" message="模拟地址，不能用于实际推流或播放" />
      {q.data && (
        <Descriptions
          column={1}
          style={{ marginTop: 20 }}
          items={Object.entries(q.data)
            .filter(([k]) => k !== "simulated")
            .map(([key, value]) => ({
              key,
              label: (
                {
                  push: "推流地址",
                  pull: "拉流地址",
                  expiresAt: "到期时间",
                } as any
              )[key],
              children: (
                <Input
                  readOnly
                  value={
                    key === "expiresAt" ? stamp(String(value)) : String(value)
                  }
                />
              ),
            }))}
        />
      )}
      <LoadingError query={q} />
    </Card>
  );
}
function useMeetingPart(id: string, part: string, poll = false) {
  return useQuery({
    queryKey: [part, id],
    queryFn: () => api(`/meetings/${id}/${part}`),
    refetchInterval: poll ? 5000 : false,
  });
}
function Tasks({ id }: { id: string }) {
  const q = useMeetingPart(id, "tasks", true);
  const user = useUser(),
    { message } = App.useApp();
  return (
    <Table<any>
      size="small"
      rowKey="id"
      dataSource={q.data || []}
      pagination={{ pageSize: 5 }}
      columns={[
        { title: "任务", render: (_, t) => `${taskNames[t.kind]} #${t.id}` },
        {
          title: "状态",
          render: (_, t) => (
            <Tag
              color={
                t.status === "failed"
                  ? "red"
                  : t.status === "finished"
                    ? "green"
                    : "blue"
              }
            >
              {
                (
                  {
                    processing: "处理中",
                    finished: "模拟完成",
                    failed: "模拟失败",
                  } as any
                )[t.status]
              }
            </Tag>
          ),
        },
        {
          title: "结果",
          render: (_, t) => JSON.parse(t.result).message || "等待模拟执行器",
        },
        { title: "次数", dataIndex: "attempts" },
        {
          title: "操作",
          render: (_, t) =>
            t.status === "failed" && user.role !== "viewer" ? (
              <Button
                onClick={() =>
                  api(`/meetings/${id}/tasks/${t.id}/retry`, "POST", {})
                    .then(() => q.refetch())
                    .catch((e) => message.error(e.message))
                }
              >
                重试
              </Button>
            ) : null,
        },
      ]}
    />
  );
}
function People({ id }: { id: string }) {
  const user = useUser(),
    readonly = user.role === "viewer";
  const q = useMeetingPart(id, "people"),
    failures = useMeetingPart(id, "people/failures");
  const { message } = App.useApp();
  const [form] = Form.useForm();
  const [editing, setEditing] = useState<any>();
  const [selected, setSelected] = useState<React.Key[]>([]);
  const [text, setText] = useState("");
  const [preview, setPreview] = useState<any[]>([]);
  const [importing, setImporting] = useState(false);
  const [mode, setMode] = useState("none");
  const [replay, setReplay] = useState(0);
  const [search, setSearch] = useState("");
  const [simulateFailure, setSimulateFailure] = useState(false);
  const headers: Record<string, string> = {
    姓名: "name",
    手机号: "phone",
    机构: "company",
    邮箱: "email",
    销售: "sales",
    是否外呼: "iscall",
    身份: "role",
    回放天数: "replayDays",
  };
  function normalize(rows: any[]) {
    return rows.map((row) => {
      const out: any = {};
      for (const [k, v] of Object.entries(row)) out[headers[k] || k] = v;
      return {
        ...out,
        phone: String(out.phone || ""),
        iscall: Number(out.iscall || 0),
        role: Number(out.role || 4),
        replayDays: Number(out.replayDays || 0),
      };
    });
  }
  function textParse() {
    setPreview(
      normalize(
        text
          .split("\n")
          .filter(Boolean)
          .map((line) => {
            const p = line.trim().split(/[,，\t\s]+/);
            return {
              name: p[0],
              phone: p.find((s) => /^1\d{10}$/.test(s)) || "",
              company: p[2] || "",
            };
          }),
      ),
    );
    setImporting(true);
  }
  async function commit() {
    try {
      const result = await api(`/meetings/${id}/people/import`, "POST", {
        rows: preview,
        callMode: mode,
      });
      message.info(
        `添加 ${result.added} 人，失败 ${result.failures.length} 条`,
      );
      setImporting(false);
      setPreview([]);
      q.refetch();
      failures.refetch();
    } catch (e: any) {
      message.error(e.message);
    }
  }
  const columns: any[] = [
    { title: "姓名", dataIndex: "name" },
    { title: "机构", dataIndex: "company" },
    { title: "手机号", dataIndex: "phone" },
    { title: "邮箱", dataIndex: "email" },
    { title: "销售", dataIndex: "sales" },
    {
      title: "身份",
      render: (_: any, p: any) => (p.role === 1 ? "嘉宾" : "观众"),
    },
    { title: "外呼", render: (_: any, p: any) => (p.iscall ? "是" : "否") },
    { title: "回放天数", dataIndex: "replayDays" },
    ...(!readonly
      ? [
          {
            title: "操作",
            render: (_: any, p: any) => (
              <Space>
                <Button
                  type="link"
                  onClick={() => {
                    setEditing(p);
                    form.setFieldsValue(p);
                  }}
                >
                  编辑
                </Button>
                <Button
                  danger
                  type="link"
                  onClick={() =>
                    Modal.confirm({
                      title: "删除名单成员？",
                      onOk: () =>
                        api(`/meetings/${id}/people/${p.id}`, "DELETE")
                          .then(() => q.refetch())
                          .catch((e) => message.error(e.message)),
                    })
                  }
                >
                  删除
                </Button>
              </Space>
            ),
          },
        ]
      : []),
  ];
  return (
    <Card
      title="本场临时白名单"
      extra={
        <Space>
          <Button
            onClick={() =>
              downloadCSV("名单模板.csv", [
                {
                  姓名: "张三",
                  手机号: "13800000000",
                  机构: "甲证券",
                  邮箱: "",
                  销售: "",
                  是否外呼: 0,
                  身份: 4,
                  回放天数: 0,
                },
              ])
            }
          >
            下载模板
          </Button>
          <Button
            onClick={() =>
              downloadCSV(
                "临时名单.csv",
                (q.data || []).map((p: any) => ({
                  姓名: p.name,
                  手机号: p.phone,
                  机构: p.company,
                  邮箱: p.email,
                  销售: p.sales,
                  是否外呼: p.iscall,
                  身份:
                    (
                      {
                        host: "主持人",
                        guest: "嘉宾",
                        audience: "观众",
                      } as Record<string, string>
                    )[p.role] || "",
                  回放天数: p.replayDays,
                })),
              )
            }
          >
            导出
          </Button>
          {!readonly && (
            <Button
              type="primary"
              onClick={() => {
                setEditing({});
                form.resetFields();
              }}
            >
              新增
            </Button>
          )}
        </Space>
      }
    >
      <Input.Search
        style={{ width: 280, marginBottom: 16 }}
        placeholder="姓名、电话、机构搜索"
        onSearch={setSearch}
      />
      <LoadingError query={q} />
      <Table<any>
        scroll={{ x: 1000 }}
        rowKey="id"
        dataSource={(q.data || []).filter((p: any) =>
          [p.name, p.phone, p.company].join(" ").includes(search),
        )}
        columns={columns}
        rowSelection={
          !readonly
            ? { selectedRowKeys: selected, onChange: setSelected }
            : undefined
        }
      />
      {!readonly && (
        <>
          <Space wrap>
            <InputNumber
              min={-1}
              precision={0}
              value={replay}
              onChange={(n) => setReplay(n ?? 0)}
            />
            <Button
              disabled={!selected.length}
              onClick={() =>
                api(`/meetings/${id}/people/replay`, "POST", {
                  ids: selected,
                  replayDays: replay,
                })
                  .then(() => {
                    q.refetch();
                    message.success("已修改回放天数");
                  })
                  .catch((e) => message.error(e.message))
              }
            >
              批量修改回放天数
            </Button>
            <Button
              onClick={() =>
                api(`/meetings/${id}/tasks`, "POST", {
                  kind: "sync",
                  simulateFailure,
                })
                  .then(() => message.success("模拟同步任务已创建"))
                  .catch((e) => message.error(e.message))
              }
            >
              模拟同步名单
            </Button>
            <Checkbox
              checked={simulateFailure}
              onChange={(e) => setSimulateFailure(e.target.checked)}
            >
              模拟失败
            </Checkbox>
          </Space>
          <Card size="small" title="批量识别 / 导入" style={{ marginTop: 20 }}>
            <Input.TextArea
              rows={3}
              value={text}
              onChange={(e) => setText(e.target.value)}
              placeholder="每行：姓名 手机号 机构；也可上传 CSV/XLSX"
            />
            <Space style={{ marginTop: 12 }}>
              <Button onClick={textParse} disabled={!text.trim()}>
                识别并预览
              </Button>
              <Upload
                accept=".csv,.xlsx"
                showUploadList={false}
                beforeUpload={async (file) => {
                  try {
                    setPreview(normalize(await parseImport(file)));
                    setImporting(true);
                  } catch {
                    message.error("无法解析文件");
                  }
                  return false;
                }}
              >
                <Button>上传导入文件</Button>
              </Upload>
            </Space>
          </Card>
        </>
      )}
      <Typography.Title level={5}>添加失败记录</Typography.Title>
      <Table<any>
        size="small"
        rowKey="id"
        dataSource={failures.data || []}
        pagination={{ pageSize: 5 }}
        columns={[
          { title: "原数据", render: (_, r) => <code>{r.data}</code> },
          { title: "原因", dataIndex: "reason" },
        ]}
      />
      <Typography.Title level={5}>模拟任务</Typography.Title>
      <Tasks id={id} />
      <Modal
        title={editing?.id ? "编辑成员" : "新增成员"}
        open={!!editing}
        onCancel={() => setEditing(undefined)}
        onOk={() =>
          form.validateFields().then(async (v) => {
            try {
              await api(
                `/meetings/${id}/people${editing.id ? "/" + editing.id : ""}`,
                editing.id ? "PATCH" : "POST",
                { ...v, ...(editing.id ? { version: editing.version } : {}) },
              );
              setEditing(undefined);
              q.refetch();
            } catch (e: any) {
              message.error(e.message);
            }
          })
        }
      >
        <Form
          form={form}
          layout="vertical"
          initialValues={{ iscall: 0, role: 4, replayDays: 0, email: "" }}
        >
          {[
            ["name", "姓名"],
            ["phone", "手机号"],
            ["company", "机构"],
            ["email", "邮箱"],
            ["sales", "对口销售"],
          ].map(([key, label]) => (
            <Form.Item
              name={key}
              label={label}
              key={key}
              rules={
                key === "name" || key === "phone" ? [{ required: true }] : []
              }
            >
              <Input />
            </Form.Item>
          ))}
          <Form.Item name="iscall" label="是否外呼">
            <Select
              options={[
                { value: 0, label: "否" },
                { value: 1, label: "是" },
              ]}
            />
          </Form.Item>
          <Form.Item name="role" label="名单身份">
            <Select
              options={[
                { value: 1, label: "嘉宾" },
                { value: 4, label: "观众" },
              ]}
            />
          </Form.Item>
          <Form.Item name="replayDays" label="个人回放天数">
            <InputNumber min={-1} precision={0} />
          </Form.Item>
        </Form>
      </Modal>
      <Modal
        width={900}
        title="导入预览"
        open={importing}
        onCancel={() => setImporting(false)}
        onOk={commit}
      >
        <Select
          value={mode}
          onChange={setMode}
          options={[
            { value: "all", label: "全部外呼" },
            { value: "whitelist", label: "白名单外呼（本场临时白名单）" },
            { value: "none", label: "全部不外呼" },
          ]}
        />
        <Table<any>
          size="small"
          dataSource={preview.map((p, i) => ({ ...p, _key: i }))}
          rowKey="_key"
          pagination={{ pageSize: 10 }}
          columns={[
            ...columns.filter((c) => c.title !== "操作"),
            {
              title: "校验",
              render: (_, r) => {
                const result = personSchema.safeParse(r);
                return result.success ? (
                  <Tag color="green">有效</Tag>
                ) : (
                  <Tag color="red">
                    {result.error.issues.map((i) => i.message).join("；")}
                  </Tag>
                );
              },
            },
          ]}
        />
      </Modal>
    </Card>
  );
}
function Documents({ id, meeting }: { id: string; meeting: any }) {
  const readonly = useUser().role === "viewer";
  const refs = useRefs();
  const q = useMeetingPart(id, "documents"),
    uploads = useMeetingPart(id, "uploads"),
    tasks = useMeetingPart(id, "tasks", true);
  const [files, setFiles] = useState<any[]>([]),
    [dirty, setDirty] = useState(false),
    [simulateFailure, setSimulateFailure] = useState(false);
  const { message, modal } = App.useApp();
  const qc = useQueryClient();
  useEffect(() => {
    if (q.data && !dirty)
      setFiles(
        q.data.map((d: any) => ({
          uploadId: d.uploadId,
          filename: d.upload.filename,
          ownerPhone: d.ownerPhone,
        })),
      );
  }, [q.data, dirty]);
  const owners = [
    ...meeting.hosts,
    ...meeting.guests,
    ...(refs.data || [])
      .filter(
        (r: any) => r.kind === "person" && meeting.analystId.includes(r.id),
      )
      .map((r: any) => ({ name: r.name, ...r.data })),
  ];
  const finished = (uploadId: string) =>
    (tasks.data || []).some(
      (t: any) =>
        t.kind === "convert" &&
        JSON.parse(t.input).uploadId === uploadId &&
        t.status === "finished",
    );
  function change(next: any[]) {
    setFiles(next);
    setDirty(true);
  }
  return (
    <Card
      title="演示文档"
      extra={
        !readonly && (
          <Space>
            <Checkbox
              checked={simulateFailure}
              onChange={(e) => setSimulateFailure(e.target.checked)}
            >
              模拟转换失败
            </Checkbox>
            <Upload
              accept=".ppt,.pptx,.pdf,.doc,.docx"
              showUploadList={false}
              beforeUpload={(file) => {
                upload(file, "document", Number(id))
                  .then(async (f) => {
                    change([
                      ...files,
                      { uploadId: f.id, filename: f.filename, ownerPhone: "" },
                    ]);
                    await api(`/meetings/${id}/tasks`, "POST", {
                      kind: "convert",
                      uploadId: f.id,
                      simulateFailure,
                    });
                    uploads.refetch();
                    tasks.refetch();
                    message.success("上传成功，模拟转换任务已创建");
                  })
                  .catch((e) => message.error(e.message));
                return false;
              }}
            >
              <Button>上传文档</Button>
            </Upload>
            <Button
              type="primary"
              disabled={!dirty}
              onClick={async () => {
                try {
                  await api(`/meetings/${id}/documents`, "PUT", {
                    version: meeting.version,
                    files: files.map(({ uploadId, ownerPhone }) => ({
                      uploadId,
                      ownerPhone,
                    })),
                  });
                  setDirty(false);
                  q.refetch();
                  qc.invalidateQueries({ queryKey: ["meeting", id] });
                  message.success("已绑定本场会议");
                } catch (e: any) {
                  message.error(e.message);
                }
              }}
            >
              保存绑定
            </Button>
          </Space>
        )
      }
    >
      <Alert
        showIcon
        type="info"
        message="模拟转换不解析文件；上传完成后还需选择所有人并保存绑定。"
      />
      <Table<any>
        rowKey="uploadId"
        style={{ marginTop: 16 }}
        dataSource={files}
        columns={[
          { title: "文档", dataIndex: "filename" },
          {
            title: "转换",
            render: (_, f) =>
              finished(f.uploadId) ? (
                <Tag color="green">模拟完成</Tag>
              ) : (
                <Tag>处理中 / 未完成</Tag>
              ),
          },
          {
            title: "所有人",
            render: (_, f, i) => (
              <Select
                disabled={readonly}
                style={{ width: 220 }}
                value={f.ownerPhone || undefined}
                placeholder="选择本场人员"
                options={owners
                  .filter(
                    (o: any, i: number, a: any[]) =>
                      a.findIndex((p) => p.phone === o.phone) === i,
                  )
                  .map((o: any) => ({
                    value: o.phone,
                    label: `${o.name} ${o.phone}`,
                  }))}
                onChange={(phone) =>
                  change(
                    files.map((v, j) =>
                      j === i ? { ...v, ownerPhone: phone } : v,
                    ),
                  )
                }
              />
            ),
          },
          {
            title: "操作",
            render: (_, f, i) => (
              <Space>
                <a href={publicUrl(`/api/files/${f.uploadId}`)}>下载</a>
                <Button
                  disabled={!finished(f.uploadId)}
                  onClick={() =>
                    modal.info({
                      title: "模拟预览",
                      content: (
                        <Alert
                          message="示例第1页"
                          description="此为模拟文档预览，不是原始文件转换结果。"
                        />
                      ),
                    })
                  }
                >
                  预览
                </Button>
                {!readonly && (
                  <>
                    <Button
                      disabled={i === 0}
                      onClick={() => {
                        const next = [...files];
                        [next[i - 1], next[i]] = [next[i], next[i - 1]];
                        change(next);
                      }}
                    >
                      上移
                    </Button>
                    <Button
                      danger
                      onClick={() => change(files.filter((_, j) => j !== i))}
                    >
                      删除
                    </Button>
                  </>
                )}
              </Space>
            ),
          },
        ]}
      />
      {!readonly && (
        <Select
          style={{ width: 320 }}
          placeholder="恢复已上传但尚未绑定的文档"
          value={undefined}
          options={(uploads.data || [])
            .filter(
              (f: any) =>
                f.kind === "document" &&
                !files.some((p) => p.uploadId === f.id),
            )
            .map((f: any) => ({ value: f.id, label: f.filename }))}
          onChange={(uploadId) => {
            const f = uploads.data.find((f: any) => f.id === uploadId);
            change([
              ...files,
              { uploadId, filename: f.filename, ownerPhone: "" },
            ]);
          }}
        />
      )}
      <Typography.Title level={5}>转换任务（每5秒刷新）</Typography.Title>
      <Tasks id={id} />
    </Card>
  );
}
function Materials({ id, meeting }: { id: string; meeting: any }) {
  const q = useMeetingPart(id, "materials", true),
    deliveries = useMeetingPart(id, "deliveries");
  const readonly = useUser().role === "viewer";
  const { message } = App.useApp();
  const [form] = Form.useForm(),
    [sendForm] = Form.useForm();
  const [editing, setEditing] = useState<any>(),
    [simulateFailure, setSimulateFailure] = useState(false);
  return (
    <Card
      title="会后资料"
      extra={
        !readonly && (
          <Space>
            <Checkbox
              checked={simulateFailure}
              onChange={(e) => setSimulateFailure(e.target.checked)}
            >
              模拟失败
            </Checkbox>
            <Button
              onClick={() =>
                api(`/meetings/${id}/tasks`, "POST", {
                  kind: "materials",
                  simulateFailure,
                })
                  .then(() => message.success("模拟生成任务已创建"))
                  .catch((e) => message.error(e.message))
              }
            >
              模拟生成资料
            </Button>
            <Button
              onClick={() => {
                setEditing({});
                form.resetFields();
              }}
            >
              新增资料
            </Button>
          </Space>
        )
      }
    >
      <Alert
        type="info"
        showIcon
        message="回放、纪要和AI资料均为模拟；邮件仅生成模拟发送记录。"
      />
      <Table<any>
        style={{ marginTop: 16 }}
        rowKey="id"
        dataSource={q.data || []}
        columns={[
          { title: "名称", dataIndex: "name" },
          { title: "类型", dataIndex: "kind" },
          {
            title: "录制状态",
            dataIndex: "recordStatus",
            render: (v: string) =>
              ({
                pending: "待提供",
                processing: "处理中",
                ready: "模拟可用",
                failed: "失败",
              })[v],
          },
          { title: "来源", render: () => <Tag>模拟资料</Tag> },
          {
            title: "AI有效标记",
            render: (_, r) => (r.aiValid ? "有效" : "未标记"),
          },
          {
            title: "链接",
            render: (_, r) =>
              r.url.startsWith("/simulation/") ? (
                <Link to={r.url}>查看模拟内容</Link>
              ) : r.url ? (
                <a href={r.url} target="_blank" rel="noreferrer">
                  已录入地址
                </a>
              ) : (
                "—"
              ),
          },
          {
            title: "操作",
            render: (_, r) =>
              !readonly && (
                <Space>
                  <Button
                    onClick={() => {
                      setEditing(r);
                      form.setFieldsValue(r);
                    }}
                  >
                    编辑
                  </Button>
                  <Button
                    danger
                    onClick={() =>
                      Modal.confirm({
                        title: "删除资料？",
                        onOk: () =>
                          api(`/meetings/${id}/materials/${r.id}`, "DELETE")
                            .then(() => q.refetch())
                            .catch((e) => message.error(e.message)),
                      })
                    }
                  >
                    删除
                  </Button>
                </Space>
              ),
          },
        ]}
      />
      {!readonly && (
        <Card size="small" title="模拟发送会后资料">
          <Form
            form={sendForm}
            layout="vertical"
            onFinish={(v) =>
              api(`/meetings/${id}/deliveries`, "POST", v)
                .then(() => {
                  deliveries.refetch();
                  message.success("已生成模拟发送记录，未发送邮件");
                })
                .catch((e) => message.error(e.message))
            }
          >
            <Form.Item
              name="recipients"
              label="收件邮箱"
              rules={[{ required: true }]}
            >
              <Select
                mode="tags"
                tokenSeparators={[",", ";"]}
                placeholder="输入邮箱后回车"
              />
            </Form.Item>
            <Form.Item
              name="contents"
              label="发送内容"
              rules={[{ required: true }]}
            >
              <Checkbox.Group
                options={[
                  { value: "replay", label: "回放" },
                  { value: "attendance", label: "参会记录" },
                  { value: "summary", label: "纪要" },
                  { value: "ai", label: "AI纪要" },
                ]}
              />
            </Form.Item>
            <Button
              htmlType="submit"
              type="primary"
              disabled={![3, 4].includes(meeting.status)}
            >
              生成模拟发送记录
            </Button>
            {![3, 4].includes(meeting.status) && (
              <span className="muted">　需会议结束或进入回放状态</span>
            )}
          </Form>
        </Card>
      )}
      <Typography.Title level={5}>发送记录</Typography.Title>
      <Table<any>
        rowKey="id"
        dataSource={deliveries.data || []}
        columns={[
          { title: "收件人", dataIndex: "recipients" },
          { title: "内容", dataIndex: "contents" },
          { title: "状态", render: () => <Tag>模拟发送，未发送邮件</Tag> },
          { title: "时间", dataIndex: "createdAt", render: stamp },
        ]}
      />
      <Typography.Title level={5}>生成任务</Typography.Title>
      <Tasks id={id} />
      <Modal
        title={editing?.id ? "编辑资料" : "新增模拟资料"}
        open={!!editing}
        onCancel={() => setEditing(undefined)}
        onOk={() =>
          form.validateFields().then((v) =>
            api(
              `/meetings/${id}/materials${editing.id ? "/" + editing.id : ""}`,
              editing.id ? "PATCH" : "POST",
              { ...v, ...(editing.id ? { version: editing.version } : {}) },
            )
              .then(() => {
                q.refetch();
                setEditing(undefined);
              })
              .catch((e) => message.error(e.message)),
          )
        }
      >
        <Form
          form={form}
          layout="vertical"
          initialValues={{
            kind: "replay",
            url: "",
            content: "",
            aiValid: false,
            recordStatus: "pending",
          }}
        >
          <Form.Item name="kind" label="类型">
            <Select
              disabled={!!editing?.id}
              options={[
                { value: "replay", label: "回放" },
                { value: "summary", label: "纪要" },
                { value: "ai", label: "AI纪要" },
              ]}
            />
          </Form.Item>
          <Form.Item name="name" label="文件名称" rules={[{ required: true }]}>
            <Input />
          </Form.Item>
          <Form.Item name="recordStatus" label="录制 / 资料状态">
            <Select
              options={[
                { value: "pending", label: "待提供" },
                { value: "processing", label: "处理中" },
                { value: "ready", label: "模拟可用" },
                { value: "failed", label: "失败" },
              ]}
            />
          </Form.Item>
          <Form.Item name="url" label="链接">
            <Input />
          </Form.Item>
          <Form.Item name="content" label="纪要 / 说明">
            <Input.TextArea rows={5} />
          </Form.Item>
          <Form.Item
            name="aiValid"
            label="AI文件有效标记"
            valuePropName="checked"
          >
            <Checkbox>有效</Checkbox>
          </Form.Item>
        </Form>
      </Modal>
    </Card>
  );
}
function Attendance({ id }: { id: string }) {
  const [source, setSource] = useState("client");
  const [round, setRound] = useState<number | undefined>();
  const [search, setSearch] = useState(""),
    [simulateFailure, setSimulateFailure] = useState(false);
  const q = useQuery({
    queryKey: ["attendance", id, search, source, round],
    queryFn: () =>
      api(
        `/meetings/${id}/attendance?search=${encodeURIComponent(search)}&source=${source}${round ? `&round=${round}` : ""}`,
      ),
    refetchInterval: 5000,
  });
  const readonly = useUser().role === "viewer";
  const { message } = App.useApp();
  return (
    <Card
      title="参会明细与统计"
      extra={
        <Space>
          <Button
            onClick={() =>
              downloadCSV(
                "参会记录.csv",
                (q.data?.rows || []).map((p: any) => ({
                  轮次: p.round,
                  身份:
                    (
                      {
                        host: "主持人",
                        guest: "嘉宾",
                        audience: "观众",
                      } as Record<string, string>
                    )[p.role] || "",
                  退出时间: p.leftAt ? stamp(p.leftAt) : "",
                  姓名: p.name,
                  电话: p.phone,
                  时长分钟: p.minutes,
                  入会时间: stamp(p.joinedAt),
                  来源: p.source,
                })),
              )
            }
          >
            导出
          </Button>
          {!readonly && source === "simulated" && (
            <>
              <Checkbox
                checked={simulateFailure}
                onChange={(e) => setSimulateFailure(e.target.checked)}
              >
                模拟失败
              </Checkbox>
              <Button
                onClick={() =>
                  api(`/meetings/${id}/tasks`, "POST", {
                    kind: "attendance",
                    simulateFailure,
                  })
                    .then(() => message.success("模拟刷新任务已创建"))
                    .catch((e) => message.error(e.message))
                }
              >
                模拟刷新统计
              </Button>
            </>
          )}
        </Space>
      }
    >
      <Alert
        type="info"
        message="客户端记录反映测试页面加入/退出操作，不表示真实音视频参会。演示数据单独查看。"
      />
      <Space style={{ margin: "20px 0" }}>
        <Select
          value={source}
          onChange={(v) => {
            setSource(v);
            setRound(undefined);
          }}
          options={[
            { value: "client", label: "测试客户端参会" },
            { value: "simulated", label: "模拟演示数据" },
          ]}
        />
        {source === "client" && (
          <Select
            style={{ width: 160 }}
            allowClear
            placeholder="最新轮次"
            value={round}
            onChange={setRound}
            options={(q.data?.rounds || []).map((r: any) => ({
              value: r.number,
              label: `第 ${r.number} 轮`,
            }))}
          />
        )}
        <Tag color="blue">记录数 {q.data?.stats.count || 0}</Tag>
        <Tag>总时长 {q.data?.stats.totalMinutes || 0} 分钟</Tag>
        <Input.Search placeholder="姓名 / 电话" onSearch={setSearch} />
      </Space>
      <Table<any>
        rowKey="id"
        dataSource={q.data?.rows || []}
        columns={[
          { title: "姓名", dataIndex: "name" },
          { title: "电话", dataIndex: "phone" },
          { title: "轮次", dataIndex: "round" },
          {
            title: "身份",
            dataIndex: "role",
            render: (v: string) =>
              (
                ({ host: "主持人", guest: "嘉宾", audience: "观众" }) as Record<
                  string,
                  string
                >
              )[v] || "—",
          },
          { title: "入会时间", dataIndex: "joinedAt", render: stamp },
          {
            title: "退出时间",
            dataIndex: "leftAt",
            render: (v: any) => (v ? stamp(v) : "—"),
          },
          { title: "时长（分钟）", dataIndex: "minutes" },
          { title: "来源", dataIndex: "source", render: (v) => <Tag>{v}</Tag> },
        ]}
      />
      <Tasks id={id} />
    </Card>
  );
}
