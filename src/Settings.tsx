import React, { useState } from "react";
import {
  App,
  Button,
  Card,
  DatePicker,
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
} from "antd";
import { Link } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { api } from "./api";
import { useUser, useRefs, LoadingError } from "./App";
const kinds: Record<string, string> = {
  company: "机构",
  security: "证券",
  industry: "行业",
  person: "人员",
  group: "授权分组",
};
export function References() {
  const user = useUser(),
    q = useRefs();
  const { message } = App.useApp();
  const [kind, setKind] = useState("company"),
    [search, setSearch] = useState(""),
    [edit, setEdit] = useState<any>();
  const [form] = Form.useForm();
  const companies = (q.data || [])
    .filter((r: any) => r.kind === "company")
    .map((r: any) => ({ value: r.id, label: r.name }));
  function open(r: any) {
    setEdit(r);
    form.resetFields();
    form.setFieldsValue({ name: r.name || "", ...r.data });
  }
  return (
    <>
      <div className="page-heading">
        <div>
          <Typography.Title level={2}>基础资料</Typography.Title>
          <p className="muted">机构、证券、行业与人员数据，为预约提供候选</p>
        </div>
        {user.role === "admin" && (
          <Button type="primary" onClick={() => open({ data: {} })}>
            新增{kinds[kind]}
          </Button>
        )}
      </div>
      <Card>
        <Tabs
          activeKey={kind}
          onChange={setKind}
          items={Object.entries(kinds).map(([key, label]) => ({ key, label }))}
        />
        <Input.Search
          placeholder="搜索名称"
          style={{ width: 300, marginBottom: 20 }}
          onSearch={setSearch}
        />
        <LoadingError query={q} />
        <Table<any>
          rowKey="id"
          dataSource={(q.data || []).filter(
            (r: any) => r.kind === kind && r.name.includes(search),
          )}
          columns={[
            { title: "编号", dataIndex: "id" },
            { title: "名称", dataIndex: "name" },
            {
              title: "属性",
              render: (_, r) => (
                <Space wrap>
                  {Object.entries(r.data).map(([k, v]) => (
                    <Tag key={k}>
                      {(
                        {
                          abbr: "简称",
                          verifyWhitelistFlag: "名单校验",
                          distributionStatus: "付费联动",
                          code: "证券代码",
                          companyCode: "机构编号",
                          phone: "手机号",
                          position: "职位",
                          industry: "行业",
                          groupType: "分组维度",
                          type: "授权类型",
                        } as any
                      )[k] || k}
                      ：{Array.isArray(v) ? v.join("、") : String(v)}
                    </Tag>
                  ))}
                </Space>
              ),
            },
            {
              title: "操作",
              render: (_, r) =>
                user.role === "admin" && (
                  <Space>
                    <Button type="link" onClick={() => open(r)}>
                      编辑
                    </Button>
                    <Button
                      danger
                      type="link"
                      onClick={() =>
                        Modal.confirm({
                          title: "删除基础资料？",
                          content: "已被使用的资料不能删除。",
                          onOk: () =>
                            api("/references/" + r.id, "DELETE")
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
      </Card>
      <Modal
        title={`${edit?.id ? "编辑" : "新增"}${kinds[kind]}`}
        open={!!edit}
        onCancel={() => setEdit(undefined)}
        onOk={() =>
          form.validateFields().then((v) => {
            const { name, ...data } = v;
            return api(
              "/references" + (edit.id ? "/" + edit.id : ""),
              edit.id ? "PATCH" : "POST",
              { kind, name, data, version: edit.version },
            )
              .then(() => {
                q.refetch();
                setEdit(undefined);
              })
              .catch((e) => message.error(e.message));
          })
        }
      >
        <Form
          form={form}
          layout="vertical"
          initialValues={{
            verifyWhitelistFlag: 0,
            distributionStatus: 0,
            position: "",
            industry: [],
            type: 19,
            groupType: 1,
          }}
        >
          <Form.Item name="name" label="名称" rules={[{ required: true }]}>
            <Input />
          </Form.Item>
          {kind === "company" && (
            <>
              <Form.Item
                name="abbr"
                label="机构简称"
                rules={[{ required: true }]}
              >
                <Input />
              </Form.Item>
              {[
                ["verifyWhitelistFlag", "默认名单校验"],
                ["distributionStatus", "付费联动"],
              ].map(([key, label]) => (
                <Form.Item name={key} label={label} key={key}>
                  <Select
                    options={[
                      { value: 0, label: "否" },
                      { value: 1, label: "是" },
                    ]}
                  />
                </Form.Item>
              ))}
            </>
          )}
          {kind === "industry" && (
            <Form.Item name="parentId" label="父级行业">
              <Select
                allowClear
                options={(q.data || [])
                  .filter(
                    (r: any) => r.kind === "industry" && r.id !== edit?.id,
                  )
                  .map((r: any) => ({ value: r.id, label: r.name }))}
              />
            </Form.Item>
          )}
          {kind === "security" && (
            <Form.Item
              name="code"
              label="证券代码"
              rules={[{ required: true }]}
            >
              <Input />
            </Form.Item>
          )}
          {["person", "group"].includes(kind) && (
            <Form.Item
              name="companyCode"
              label="所属机构"
              rules={[{ required: true }]}
            >
              <Select options={companies} />
            </Form.Item>
          )}
          {kind === "person" && (
            <>
              <Form.Item
                name="phone"
                label="手机号"
                rules={[{ required: true }, { pattern: /^1\d{10}$/ }]}
              >
                <Input />
              </Form.Item>
              <Form.Item name="position" label="职位">
                <Input />
              </Form.Item>
              <Form.Item name="industry" label="行业">
                <Select
                  mode="multiple"
                  options={(q.data || [])
                    .filter((r: any) => r.kind === "industry")
                    .map((r: any) => ({ value: r.id, label: r.name }))}
                />
              </Form.Item>
            </>
          )}
          {kind === "group" && (
            <>
              <Form.Item name="groupType" label="分组维度">
                <Select
                  options={[
                    { value: 1, label: "机构名称" },
                    { value: 2, label: "客户类型" },
                    { value: 3, label: "对口销售" },
                    { value: 4, label: "所在区域" },
                  ]}
                />
              </Form.Item>
              <Form.Item name="type" label="授权类型">
                <InputNumber readOnly />
              </Form.Item>
            </>
          )}
        </Form>
      </Modal>
    </>
  );
}
export function SeriesPage() {
  const user = useUser(),
    readonly = user.role === "viewer";
  const q = useQuery({ queryKey: ["series"], queryFn: () => api("/series") });
  const meetings = useQuery({
    queryKey: ["seriesTemplates"],
    queryFn: () => api("/meetings?pageSize=100"),
  });
  const { message } = App.useApp();
  const [edit, setEdit] = useState<any>(),
    [batch, setBatch] = useState<any>();
  const [form] = Form.useForm(),
    [batchForm] = Form.useForm();
  function open(row: any) {
    setEdit(row);
    form.resetFields();
    form.setFieldsValue(row);
  }
  return (
    <>
      <div className="page-heading">
        <div>
          <Typography.Title level={2}>系列会议</Typography.Title>
          <p className="muted">复用单场配置，批量创建指定时间的子会议</p>
        </div>
        {!readonly && (
          <Button type="primary" onClick={() => open({})}>
            新增系列
          </Button>
        )}
      </div>
      <Card>
        <LoadingError query={q} />
        <Table<any>
          rowKey="id"
          dataSource={q.data || []}
          columns={[
            { title: "系列名称", dataIndex: "name" },
            { title: "说明", dataIndex: "description" },
            {
              title: "子会议",
              render: (_, r) => (
                <Space wrap>
                  {r.meetings.map((m: any) => (
                    <Link key={m.id} to={`/meetings/${m.id}`}>
                      #{m.id} {m.title}
                    </Link>
                  ))}
                </Space>
              ),
            },
            {
              title: "操作",
              render: (_, r) =>
                !readonly && (
                  <Space>
                    <Button onClick={() => open(r)}>编辑</Button>
                    <Button
                      onClick={() => {
                        setBatch(r);
                        batchForm.resetFields();
                      }}
                    >
                      批量创建子会议
                    </Button>
                    <Button
                      danger
                      onClick={() =>
                        Modal.confirm({
                          title: "删除系列？",
                          onOk: () =>
                            api(`/series/${r.id}`, "DELETE")
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
      </Card>
      <Modal
        title="系列会议"
        open={!!edit}
        onCancel={() => setEdit(undefined)}
        onOk={() =>
          form.validateFields().then((v) =>
            api(
              "/series" + (edit.id ? "/" + edit.id : ""),
              edit.id ? "PATCH" : "POST",
              { ...v, version: edit.version },
            )
              .then(() => {
                q.refetch();
                setEdit(undefined);
              })
              .catch((e) => message.error(e.message)),
          )
        }
      >
        <Form form={form} layout="vertical" initialValues={{ description: "" }}>
          <Form.Item name="name" label="名称" rules={[{ required: true }]}>
            <Input />
          </Form.Item>
          <Form.Item name="description" label="说明">
            <Input.TextArea />
          </Form.Item>
        </Form>
      </Modal>
      <Modal
        title="批量创建子会议"
        open={!!batch}
        onCancel={() => setBatch(undefined)}
        onOk={() =>
          batchForm.validateFields().then((v) =>
            api(`/series/${batch.id}/meetings`, "POST", {
              templateId: v.templateId,
              starts: v.starts.map((r: any) => r.time.toISOString()),
            })
              .then(() => {
                q.refetch();
                setBatch(undefined);
                message.success("子会议已创建");
              })
              .catch((e) => message.error(e.message)),
          )
        }
      >
        <p className="muted">
          复制预约配置，不复制原会议的文件、邀请口令、名单或会后资料。
        </p>
        <Form form={batchForm} layout="vertical">
          <Form.Item
            name="templateId"
            label="模板会议"
            rules={[{ required: true }]}
          >
            <Select
              showSearch
              optionFilterProp="label"
              options={(meetings.data?.rows || []).map((m: any) => ({
                value: m.id,
                label: `#${m.id} ${m.title}`,
              }))}
            />
          </Form.Item>
          <Form.List
            name="starts"
            rules={[
              {
                validator: async (_, v) => {
                  if (!v?.length) throw Error("至少添加一个时间");
                },
              },
            ]}
          >
            {(fields, { add, remove }, { errors }) => (
              <>
                {fields.map((f) => (
                  <Space key={f.key}>
                    <Form.Item
                      name={[f.name, "time"]}
                      rules={[{ required: true }]}
                    >
                      <DatePicker showTime format="YYYY-MM-DD HH:mm" />
                    </Form.Item>
                    <Button onClick={() => remove(f.name)}>删除</Button>
                  </Space>
                ))}
                <Button onClick={() => add()}>＋ 子会议时间</Button>
                <Form.ErrorList errors={errors} />
              </>
            )}
          </Form.List>
        </Form>
      </Modal>
    </>
  );
}
export function AuditPage() {
  const q = useQuery({ queryKey: ["audits"], queryFn: () => api("/audits") });
  return (
    <>
      <div className="page-heading">
        <div>
          <Typography.Title level={2}>操作审计</Typography.Title>
          <p className="muted">最近200条关键变更记录</p>
        </div>
        <Button onClick={() => q.refetch()}>刷新</Button>
      </div>
      <Card>
        <LoadingError query={q} />
        <Table<any>
          rowKey="id"
          dataSource={q.data || []}
          scroll={{ x: 900 }}
          expandable={{
            expandedRowRender: (r) => (
              <pre className="audit-json">
                {JSON.stringify(JSON.parse(r.changes), null, 2)}
              </pre>
            ),
          }}
          columns={[
            {
              title: "时间",
              dataIndex: "createdAt",
              render: (v) =>
                new Date(v).toLocaleString("zh-CN", {
                  timeZone: "Asia/Shanghai",
                }),
            },
            { title: "操作人", dataIndex: "actor" },
            { title: "操作", dataIndex: "action" },
            { title: "对象", render: (_, r) => `${r.entity} #${r.entityId}` },
          ]}
        />
      </Card>
    </>
  );
}
