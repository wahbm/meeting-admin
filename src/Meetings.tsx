import ReactQuill from "react-quill";
import "react-quill/dist/quill.snow.css";
import React, { useState, useEffect } from "react";
import {
  Alert,
  App,
  Button,
  Card,
  Checkbox,
  Collapse,
  DatePicker,
  Divider,
  Form,
  Input,
  InputNumber,
  Modal,
  Select,
  Space,
  TreeSelect,
  Table,
  Tag,
  Typography,
  Upload,
  Row,
  Col,
} from "antd";
import {
  Link,
  useNavigate,
  useParams,
  useSearchParams,
} from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import dayjs from "dayjs";
import { api, upload } from "./api";
import {
  defaults,
  meetingTypes,
  statuses,
  shareOptions,
  permissionLabels,
  meetingSchema,
  labelWarning,
} from "../shared/domain";
import { useUser, useRefs, LoadingError } from "./App";
const options = (dict: Record<number, string>) =>
  Object.entries(dict).map(([value, label]) => ({
    value: Number(value),
    label,
  }));
const dateText = (value: string) =>
  dayjs(value).tz("Asia/Shanghai").format("YYYY-MM-DD HH:mm");
export function MeetingList() {
  const nav = useNavigate(),
    user = useUser();
  const [searchParams] = useSearchParams();
  const today = dayjs().tz("Asia/Shanghai");
  const [filter, setFilter] = useState<any>(
    searchParams.get("id")
      ? { search: searchParams.get("id") }
      : {
          from: today.startOf("day").toISOString(),
          to: today.add(1, "day").startOf("day").toISOString(),
        },
  );
  const [page, setPage] = useState(1);
  const [filterForm] = Form.useForm();
  const refs = useRefs();
  const query = useQuery({
    queryKey: ["meetings", filter, page],
    queryFn: () =>
      api(
        "/meetings?" +
          new URLSearchParams({
            ...filter,
            page: String(page),
            pageSize: "10",
          }),
      ),
  });
  const rows = query.data?.rows || [];
  return (
    <>
      <div className="page-heading">
        <div>
          <Typography.Title level={2}>会议管理</Typography.Title>
          <p className="muted">统一管理预约、授权、名单与会后资料</p>
        </div>
        {user.role !== "viewer" && (
          <Button
            size="large"
            type="primary"
            onClick={() => nav("/meetings/new")}
          >
            ＋ 预约会议
          </Button>
        )}
      </div>
      <Row gutter={16} className="metrics">
        {[
          ["当前查询", query.data?.total || 0, "场会议"],
          ["预告会议", rows.filter((r: any) => r.status === 1).length, "本页"],
          ["已确认", rows.filter((r: any) => r.confirmed).length, "本页"],
          ["已推荐", rows.filter((r: any) => r.recommended).length, "本页"],
        ].map(([label, value, note]) => (
          <Col span={6} key={label}>
            <Card>
              <span className="muted">{label}</span>
              <strong>{value}</strong>
              <small>{note}</small>
            </Card>
          </Col>
        ))}
      </Row>
      <Card className="filter-card">
        <Form
          layout="inline"
          form={filterForm}
          key={searchParams.toString()}
          initialValues={{
            ...filter,
            range: filter.from
              ? [
                  dayjs(filter.from).tz("Asia/Shanghai"),
                  dayjs(filter.to).tz("Asia/Shanghai").subtract(1, "day"),
                ]
              : undefined,
          }}
          onFinish={(v) => {
            const { range, ...rest } = v;
            setFilter({
              ...Object.fromEntries(
                Object.entries(rest).filter(
                  ([, v]) => v !== undefined && v !== "",
                ),
              ),
              ...(range
                ? {
                    from: range[0].startOf("day").toISOString(),
                    to: range[1].add(1, "day").startOf("day").toISOString(),
                  }
                : {}),
            });
            setPage(1);
          }}
        >
          <Form.Item name="search">
            <Input placeholder="主题 / 活动 ID" allowClear />
          </Form.Item>
          <Form.Item name="range">
            <DatePicker.RangePicker />
          </Form.Item>
          {[
            [
              "companyCode",
              "发布机构",
              (refs.data || [])
                .filter((r: any) => r.kind === "company")
                .map((r: any) => ({ value: r.id, label: r.name })),
            ],
            ["liveType", "会议类型", options(meetingTypes)],
            ["status", "会议状态", options(statuses)],
            [
              "releaseFlag",
              "发布状态",
              [
                { value: 1, label: "已发布" },
                { value: 0, label: "未发布" },
              ],
            ],
            [
              "isNetSync",
              "上架状态",
              [
                { value: 0, label: "已上架" },
                { value: 1, label: "已下架" },
              ],
            ],
            [
              "confirmed",
              "确认状态",
              [
                { value: "true", label: "已确认" },
                { value: "false", label: "未确认" },
              ],
            ],
            [
              "recommended",
              "推荐状态",
              [
                { value: "true", label: "已推荐" },
                { value: "false", label: "未推荐" },
              ],
            ],
          ].map(([name, label, opts]) => (
            <Form.Item name={name as string} key={name as string}>
              <Select
                allowClear
                placeholder={label}
                style={{ width: 130 }}
                options={opts as any}
              />
            </Form.Item>
          ))}
          <Form.Item>
            <Space>
              <Button type="primary" htmlType="submit">
                查询
              </Button>
              <Button
                onClick={() => {
                  setFilter({});
                  filterForm.setFieldsValue({
                    search: undefined,
                    range: undefined,
                    companyCode: undefined,
                    liveType: undefined,
                    status: undefined,
                    releaseFlag: undefined,
                    isNetSync: undefined,
                    confirmed: undefined,
                    recommended: undefined,
                  });
                  setPage(1);
                  nav("/");
                }}
              >
                全部日期
              </Button>
            </Space>
          </Form.Item>
        </Form>
      </Card>
      <Card
        title="会议列表"
        extra={<span className="muted">共 {query.data?.total || 0} 场</span>}
      >
        <LoadingError query={query} />
        <Table<any>
          rowKey="id"
          dataSource={rows}
          scroll={{ x: 1100 }}
          pagination={{
            current: page,
            pageSize: 10,
            total: query.data?.total,
            onChange: setPage,
          }}
          columns={[
            {
              title: "会议主题 / ID",
              dataIndex: "title",
              render: (t, r) => (
                <>
                  <Link to={`/meetings/${r.id}`}>{t}</Link>
                  <div className="muted">
                    #{r.id} · {r.companyAbbr}
                  </div>
                </>
              ),
            },
            {
              title: "时间 / 时长",
              render: (_, r) => (
                <>
                  {dateText(r.startTime)}
                  <div className="muted">{r.meetTime} 分钟</div>
                </>
              ),
            },
            {
              title: "类型",
              dataIndex: "liveType",
              render: (v) => meetingTypes[v],
            },
            {
              title: "状态",
              dataIndex: "status",
              render: (v) => (
                <Tag color={v === 2 ? "green" : v === 1 ? "blue" : "default"}>
                  {statuses[v]}
                </Tag>
              ),
            },
            {
              title: "发布 / 上架",
              render: (_, r) => (
                <>
                  {r.releaseFlag ? "已发布" : "未发布"} /{" "}
                  {r.isNetSync === 0 ? "已上架" : "已下架"}
                </>
              ),
            },
            {
              title: "确认 / 推荐",
              render: (_, r) => (
                <>
                  {r.confirmed ? "已确认" : "未确认"}
                  {r.recommended && <Tag color="gold">推荐</Tag>}
                </>
              ),
            },
            {
              title: "资料",
              render: (_, r) => (
                <>
                  {r.materials?.length || 0} 份
                  {r.tasks?.some((t: any) => t.status === "processing") && (
                    <Tag>处理中</Tag>
                  )}
                </>
              ),
            },
            {
              title: "操作",
              fixed: "right",
              render: (_, r) => (
                <Space>
                  <Link to={`/meetings/${r.id}`}>查看</Link>
                  {user.role !== "viewer" && (
                    <Link to={`/meetings/${r.id}/edit`}>编辑</Link>
                  )}
                </Space>
              ),
            },
          ]}
        />
      </Card>
    </>
  );
}
export function MeetingEditor() {
  const { id } = useParams(),
    nav = useNavigate(),
    user = useUser();
  const { message, modal } = App.useApp();
  const [form] = Form.useForm();
  const refs = useRefs();
  const query = useQuery({
    queryKey: ["meeting", id],
    queryFn: () => api("/meetings/" + id),
    enabled: !!id,
  });
  const [saving, setSaving] = useState(false);
  const values = Form.useWatch([], form) || {};
  const liveType = values.liveType || 1,
    network = liveType !== 3;
  const companies = (refs.data || []).filter((r: any) => r.kind === "company");
  const company = companies.find((r: any) => r.id === values.companyCode);
  const personRefs = (refs.data || []).filter(
    (r: any) =>
      r.kind === "person" && r.data.companyCode === values.companyCode,
  );
  const restricted = id && [2, -1].includes(query.data?.status);
  useEffect(() => {
    if (!id || query.data) {
      const c = id ? query.data : defaults();
      form.setFieldsValue({
        ...c,
        companyCode: c.companyCode || undefined,
        startTime: dayjs(c.startTime).tz("Asia/Shanghai"),
        flowStartTime: dayjs(c.flowStartTime).tz("Asia/Shanghai"),
      });
    }
  }, [id, query.data, form]);
  const refOpts = (kind: string) =>
    (refs.data || [])
      .filter((r: any) => r.kind === kind)
      .map((r: any) => ({ value: r.id, label: r.name }));
  const field = (
    name: string,
    label: string,
    node: React.ReactNode,
    required = false,
  ) => (
    <Form.Item
      name={name}
      label={label}
      rules={required ? [{ required: true, message: `请填写${label}` }] : []}
      key={name}
    >
      {node}
    </Form.Item>
  );
  const toggle = (name: string, label: string, on = 1, off = 0) =>
    field(
      name,
      label,
      <Select
        options={[
          { value: on, label: "是" },
          { value: off, label: "否" },
        ]}
      />,
    );
  const uploader = (
    name: string,
    label: string,
    kind: string,
    accept: string,
  ) => (
    <Form.Item label={label} key={name}>
      <Space direction="vertical">
        <Form.Item name={name} noStyle>
          <Input placeholder="上传文件后自动填入，也可填写已有地址" />
        </Form.Item>
        <Upload
          accept={accept}
          showUploadList={false}
          beforeUpload={(file) => {
            upload(file, kind, id ? Number(id) : undefined)
              .then((f) => {
                form.setFieldValue(name, f.url);
                message.success("已上传");
              })
              .catch((e) => message.error(e.message));
            return false;
          }}
        >
          <Button>上传{label}</Button>
        </Upload>
        {kind === "thumbnail" || kind === "poster" ? (
          <small className="muted">
            JPG/PNG，小于5MB；建议{kind === "thumbnail" ? "4:3" : "16:9"}
          </small>
        ) : null}
      </Space>
    </Form.Item>
  );
  const participants = (name: string, label: string) => (
    <div className="span-all" key={name}>
      <Divider orientation="left">{label}</Divider>
      <Form.List name={name}>
        {(fields, { add, remove }) => (
          <>
            {fields.map((f) => (
              <Space key={f.key} align="baseline" wrap>
                <Form.Item name={[f.name, "name"]} rules={[{ required: true }]}>
                  <Input placeholder="姓名" />
                </Form.Item>
                <Form.Item name={[f.name, "position"]}>
                  <Input placeholder="职位" />
                </Form.Item>
                <Form.Item
                  name={[f.name, "phone"]}
                  rules={[
                    { pattern: /^1\d{10}$/, message: "请输入11位手机号" },
                    { required: true },
                  ]}
                >
                  <Input placeholder="手机号" />
                </Form.Item>
                <Button danger onClick={() => remove(f.name)}>
                  删除
                </Button>
              </Space>
            ))}
            <Button onClick={() => add({ name: "", position: "", phone: "" })}>
              ＋ 添加{label}
            </Button>
          </>
        )}
      </Form.List>
      {name === "hosts" && (
        <Space style={{ marginTop: 12 }}>
          <Select
            placeholder="选择姓名识别"
            style={{ width: 220 }}
            options={personRefs.map((p: any) => ({
              value: p.id,
              label: p.name,
            }))}
            disabled={!company}
            onChange={(n) => {
              const p = personRefs.find((p: any) => p.id === n);
              const hosts = form.getFieldValue("hosts") || [];
              if (!hosts.some((h: any) => h.phone === p.data.phone))
                form.setFieldsValue({
                  hosts: [
                    ...hosts,
                    {
                      name: p.name,
                      phone: p.data.phone,
                      position: p.data.position,
                      uid: p.id,
                    },
                  ],
                  industry: [
                    ...new Set([
                      ...(form.getFieldValue("industry") || []),
                      ...(p.data.industry || []),
                    ]),
                  ],
                });
            }}
          />
          <span className="muted">识别本地机构人员并追加行业</span>
        </Space>
      )}
    </div>
  );
  async function submit(
    v: any,
    confirmFlag = false,
    instituteConfirmed = false,
  ) {
    const config = {
      ...v,
      startTime: v.startTime.toISOString(),
      flowStartTime: v.flowStartTime.toISOString(),
    };
    const parsed = meetingSchema.safeParse(config);
    if (!parsed.success) {
      message.error(parsed.error.issues.map((i) => i.message).join("；"));
      return;
    }
    if (
      config.isInstitute &&
      !config.title.includes(config.companyAbbr.slice(0, 2)) &&
      !instituteConfirmed
    ) {
      modal.confirm({
        title: "主题与机构不一致",
        content: "仍要同步到研究所吗？",
        onOk: () => submit(v, confirmFlag, true),
      });
      return;
    }
    setSaving(true);
    try {
      const saved = await api(
        id ? `/meetings/${id}` : "/meetings",
        id ? "PATCH" : "POST",
        {
          config: parsed.data,
          version: query.data?.version,
          confirmFlag,
          instituteConfirmed,
        },
      );
      message.success("会议已保存");
      nav(`/meetings/${saved.id}?tab=invitation`);
    } catch (e: any) {
      if (e.status === 409 && e.message.includes("同名"))
        modal.confirm({
          title: "同时间已有同名会议",
          content: "确认继续创建？",
          onOk: () => submit(v, true, instituteConfirmed),
        });
      else message.error(e.message);
    } finally {
      setSaving(false);
    }
  }
  if (user.role === "viewer")
    return <Alert type="warning" message="只读账号不能编辑" />;
  if (id && !query.data) return <LoadingError query={query} />;
  const warn = values.shareTypes ? labelWarning(values) : "";
  return (
    <>
      <div className="page-heading">
        <div>
          <Typography.Title level={2}>
            {id ? "编辑会议" : "预约会议"}
          </Typography.Title>
          <p className="muted">
            配置会议信息、授权和对外内容 · 所有外部服务均为模拟
          </p>
        </div>
        <Button onClick={() => nav(-1)}>返回</Button>
      </div>
      <Form
        form={form}
        layout="vertical"
        onFinish={submit}
        onValuesChange={(changed, all) => {
          if (changed.companyCode !== undefined) {
            const c = companies.find((c: any) => c.id === changed.companyCode);
            if (c) {
              const shares = [...(all.shareTypes || [])];
              if (c.data.distributionStatus === 1 && !shares.includes(22))
                shares.push(22);
              form.setFieldsValue({
                companyAbbr: c.data.abbr || c.name,
                analystId: [],
                groupList: [],
                verifyWhitelistFlag: c.data.verifyWhitelistFlag || 0,
                shareTypes: shares,
                ...(c.data.distributionStatus === 1
                  ? { permissionLabel: 6 }
                  : {}),
              });
            }
          }
          if (changed.startTime)
            form.setFieldValue("flowStartTime", changed.startTime);
          if (changed.liveType === 4)
            form.setFieldsValue({ sipType: 1, isArtificial: 0 });
          if (
            changed.shareTypes?.includes(22) &&
            !(values.shareTypes || []).includes(22)
          )
            form.setFieldValue("permissionLabel", 6);
        }}
      >
        <Form.Item name="_groupType" hidden>
          <InputNumber />
        </Form.Item>
        <Form.Item name="companyAbbr" hidden>
          <Input />
        </Form.Item>
        <Card title="01　基本信息">
          <div className="form-grid">
            {field(
              "liveType",
              "会议类型",
              <Select
                disabled={!!restricted}
                options={options(meetingTypes)}
              />,
              true,
            )}
            {field(
              "title",
              "会议主题",
              <Input placeholder="例如：甲证券｜行业交流" />,
              true,
            )}
            {field(
              "startTime",
              "会议时间",
              <DatePicker
                showTime={{ format: "HH:mm", minuteStep: 5 }}
                format="YYYY-MM-DD HH:mm"
                disabled={!!restricted}
              />,
              true,
            )}
            {field(
              "meetTime",
              "预计时长（分钟）",
              <InputNumber
                min={1}
                precision={0}
                disabled={query.data?.status === -1}
              />,
              true,
            )}
            {field(
              "companyCode",
              "发布机构",
              <Select
                showSearch
                optionFilterProp="label"
                options={refOpts("company")}
              />,
              true,
            )}
            {field(
              "secu",
              "上市公司",
              <Select
                mode="multiple"
                showSearch
                optionFilterProp="label"
                options={refOpts("security")}
              />,
            )}
            {field(
              "assistCompanyList",
              "协办机构",
              <Select mode="multiple" options={refOpts("company")} />,
            )}
            {![2, 5].includes(liveType) &&
              field(
                "channelType",
                "会议服务商",
                <Select
                  options={options({ 1: "263", 2: "全时", 3: "证通" })}
                />,
              )}
            {toggle("releaseFlag", "是否发布")}
            {values.releaseFlag === 1 && toggle("isNetSync", "是否上架", 0, 1)}
            {toggle("sipType", "融合服务", 0, 1)}
            {values.releaseFlag === 1 && toggle("aiFlag", "AI转纪要")}
            {toggle("isInstitute", "同步到研究所")}
          </div>
        </Card>
        <Card title="02　会议授权与属性" style={{ marginTop: 20 }}>
          {field(
            "shareTypes",
            "会议授权",
            <Checkbox.Group options={shareOptions} />,
          )}
          {field(
            "customerPlatform",
            "客户平台",
            <Select
              options={[
                { value: true, label: "启用" },
                { value: false, label: "关闭" },
              ]}
            />,
          )}
          {(values.shareTypes || []).includes(19) && (
            <Space wrap>
              <Select
                placeholder="分组维度"
                options={options({
                  1: "机构名称",
                  2: "客户类型",
                  3: "对口销售",
                  4: "所在区域",
                })}
                onChange={(n) => form.setFieldValue("_groupType", n)}
                style={{ width: 160 }}
              />
              <Form.Item
                name="groupList"
                label="授权分组"
                getValueProps={(v) => ({
                  value: (v || []).map((g: any) => g.code),
                })}
                getValueFromEvent={(ids) =>
                  ids.map((id: number) => {
                    const r = refs.data.find((r: any) => r.id === id);
                    return { code: id, type: r.data.type, name: r.name };
                  })
                }
              >
                <Select
                  mode="multiple"
                  showSearch
                  optionFilterProp="label"
                  style={{ minWidth: 280 }}
                  options={(refs.data || [])
                    .filter(
                      (r: any) =>
                        r.kind === "group" &&
                        r.data.companyCode === values.companyCode &&
                        (!values._groupType ||
                          r.data.groupType === values._groupType),
                    )
                    .map((r: any) => ({ value: r.id, label: r.name }))}
                />
              </Form.Item>
            </Space>
          )}
          {warn && network && (
            <Alert
              style={{ marginBottom: 16 }}
              type="warning"
              showIcon
              message={warn}
            />
          )}
          <div className="form-grid">
            {network &&
              field(
                "permissionLabel",
                "权限标签",
                <Select
                  options={permissionLabels.map((label, value) => ({
                    value,
                    label,
                  }))}
                />,
              )}
            {toggle("verifyWhitelistFlag", "参会名单校验白名单")}
            {network &&
              field(
                "replayDays",
                "回放天数（-1不回放，0待业务解释）",
                <InputNumber min={-1} precision={0} />,
              )}
            {toggle("isSummary", "需要会议纪要")}
            {(values.shareTypes || []).includes(21) &&
              field(
                "applyFlag",
                "报名字段",
                <Checkbox.Group
                  options={[
                    { value: 0, label: "上传名片" },
                    { value: 1, label: "是否外呼" },
                  ]}
                />,
              )}
            {(values.shareTypes || []).includes(21) &&
              uploader(
                "commitmentLetterUrl",
                "承诺函",
                "commitment",
                ".pdf,.doc,.docx",
              )}
          </div>
        </Card>
        <Card title="03　其他设置" style={{ marginTop: 20 }}>
          <Collapse
            items={[
              {
                key: "settings",
                label: "展开服务、回放、分发与转播设置",
                children: (
                  <div className="form-grid">
                    {liveType !== 5 && toggle("isArtificial", "人工会议")}
                    {liveType !== 5 && toggle("largeConference", "大型会议")}
                    {toggle("watermarkFlag", "直播水印")}
                    {liveType !== 5 && toggle("freeReadPpt", "允许自助翻PPT")}
                    {[1, 2].includes(liveType) &&
                      toggle("isRelay", "对外分发", 0, 1)}
                    {network &&
                      field(
                        "recordType",
                        "回放类型",
                        <Select options={options({ 1: "音频", 2: "视频" })} />,
                      )}
                    {toggle("testFlag", "测试会议")}
                    {toggle("joinTypeShowFlag", "展示参会方式")}
                    {liveType === 4 &&
                      field(
                        "broadcastType",
                        "转播方式",
                        <Select options={options({ 0: "人工", 1: "拉流" })} />,
                      )}
                    {liveType === 1 &&
                      uploader(
                        "pullUrl",
                        "视频文件 / 来源地址",
                        "video",
                        ".mp4,.mov,.webm",
                      )}
                    {liveType === 4 &&
                      uploader(
                        "pushUrl",
                        "转播来源地址",
                        "video",
                        ".mp4,.mov,.webm",
                      )}
                    {liveType === 4 &&
                      field("pushName", "转播来源名称", <Input />)}
                    {field(
                      "flowStartTime",
                      "推拉流时间",
                      <DatePicker
                        showTime={{ format: "HH:mm" }}
                        format="YYYY-MM-DD HH:mm"
                      />,
                    )}
                    {[1, 2].includes(liveType) && values.isRelay === 0 && (
                      <div className="span-all">
                        <Form.List name="activityPushUrl">
                          {(fields, { add, remove }) => (
                            <>
                              {fields.map((f) => (
                                <Space key={f.key}>
                                  <Form.Item
                                    name={[f.name, "name"]}
                                    rules={[{ required: true }]}
                                  >
                                    <Input placeholder="渠道名称" />
                                  </Form.Item>
                                  <Form.Item
                                    name={[f.name, "url"]}
                                    rules={[
                                      { required: true },
                                      { type: "url" },
                                    ]}
                                  >
                                    <Input placeholder="分发地址" />
                                  </Form.Item>
                                  <Button onClick={() => remove(f.name)}>
                                    删除
                                  </Button>
                                </Space>
                              ))}
                              <Button onClick={() => add()}>＋ 分发渠道</Button>
                            </>
                          )}
                        </Form.List>
                      </div>
                    )}
                  </div>
                ),
              },
            ]}
          />
        </Card>
        <Card title="04　人员与内容" style={{ marginTop: 20 }}>
          <div className="form-grid">
            {field(
              "analystId",
              "会议发起人",
              <Select
                mode="multiple"
                options={personRefs.map((r: any) => ({
                  value: r.id,
                  label: r.name,
                }))}
              />,
            )}
            {field(
              "industry",
              "所属行业",
              <TreeSelect
                multiple
                treeData={(refs.data || [])
                  .filter((r: any) => r.kind === "industry")
                  .map((r: any) => ({
                    id: r.id,
                    pId: r.data.parentId || 0,
                    value: r.id,
                    title: r.name,
                  }))}
                treeDataSimpleMode
                treeCheckable
                showCheckedStrategy={TreeSelect.SHOW_ALL}
              />,
              true,
            )}
            {participants("hosts", "主持")}
            {participants("guests", "嘉宾")}
            {network && (
              <div className="span-all">
                <Form.Item name="introduction" label="会议介绍">
                  <ReactQuill theme="snow" />
                </Form.Item>
                <Button
                  onClick={() => {
                    const v = form.getFieldsValue(true);
                    form.setFieldValue(
                      "introduction",
                      `<h2>${v.title || "会议主题"}</h2><p>时间：${v.startTime?.format("YYYY-MM-DD HH:mm")}</p><p>主持：${(v.hosts || []).map((p: any) => p.name).join("、")}</p><p>嘉宾：${(v.guests || []).map((p: any) => p.name).join("、")}</p>`,
                    );
                  }}
                >
                  生成介绍模板
                </Button>
              </div>
            )}
            {network &&
              field("agenda", "会议内容 / 议程", <Input.TextArea rows={4} />)}
            {field(
              "labels",
              "会议标签",
              <Checkbox.Group
                options={[
                  { value: 1, label: "金股" },
                  { value: 2, label: "分析师路演" },
                  { value: 3, label: "上市公司交流" },
                  { value: 4, label: "专家交流" },
                ]}
              />,
            )}
            {field(
              "showLabels",
              "展示标签",
              <Checkbox.Group
                options={[
                  { value: 1, label: "独家" },
                  { value: 2, label: "董事长出席" },
                  { value: 3, label: "专家出席" },
                ]}
              />,
            )}
            {network &&
              uploader(
                "resourceUrlSmall",
                "列表图",
                "thumbnail",
                ".jpg,.jpeg,.png",
              )}
            {network &&
              uploader("resourceUrl", "海报图", "poster", ".jpg,.jpeg,.png")}
            {field("managerTips", "管理员备注", <Input.TextArea rows={3} />)}
            {toggle("syncThirdStatus", "同步给合作方")}
          </div>
        </Card>
        <div className="sticky-actions">
          <Space>
            <Button onClick={() => nav(-1)}>取消</Button>
            <Button
              type="primary"
              loading={saving}
              onClick={() =>
                form
                  .validateFields()
                  .then(() => submit(form.getFieldsValue(true)))
                  .catch(() => {})
              }
            >
              {id ? "保存修改" : "提交预约"}
            </Button>
          </Space>
        </div>
      </Form>
    </>
  );
}
