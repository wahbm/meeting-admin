import React, { useEffect, useRef, useState } from "react";
import {
  Alert,
  App,
  Button,
  Card,
  Descriptions,
  Form,
  Input,
  List,
  Modal,
  Space,
  Spin,
  Tag,
  Typography,
} from "antd";
import { Link, useLocation, useNavigate } from "react-router-dom";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { api, downloadCSV } from "./api";
const roles: Record<string, string> = {
  host: "主持人",
  guest: "嘉宾",
  audience: "观众",
};
const time = (v: string | null) =>
  v
    ? new Date(v).toLocaleString("zh-CN", { timeZone: "Asia/Shanghai" })
    : "暂无记录";
const call = (url: string, method = "GET", body?: unknown) =>
  api("/client" + url, method, body);
export default function Client() {
  const [user, setUser] = useState<{ phone: string } | null>(null),
    [ready, setReady] = useState(false);
  const location = useLocation(),
    navigate = useNavigate(),
    qc = useQueryClient();
  const { message } = App.useApp();
  useEffect(() => {
    call("/auth/me")
      .then(setUser)
      .catch(() => {})
      .finally(() => setReady(true));
    const expired = () => {
      setUser(null);
      qc.removeQueries({ queryKey: ["client"] });
    };
    window.addEventListener("client-session-expired", expired);
    return () => window.removeEventListener("client-session-expired", expired);
  }, [qc]);
  const match = location.pathname.match(/^\/client\/meetings\/(\d+)\/?$/);
  if (!ready) return <Spin fullscreen />;
  return (
    <main className="client-shell">
      <header className="client-header">
        <div>
          <Typography.Title level={3}>测试会议室</Typography.Title>
          <Typography.Text type="secondary">
            用于验证会议流程 · 音视频与发言均为模拟
          </Typography.Text>
        </div>
        {user && (
          <Space wrap>
            <Tag>{user.phone}</Tag>
            <Link to="/client">首页</Link>
            <Button
              onClick={async () => {
                try {
                  await call("/auth/logout", "POST");
                  setUser(null);
                  qc.removeQueries({ queryKey: ["client"] });
                } catch (e) {
                  message.error((e as Error).message);
                }
              }}
            >
              退出登录
            </Button>
          </Space>
        )}
      </header>
      {!user ? (
        <Card title="手机号登录" className="client-login">
          <Alert
            type="info"
            showIcon
            message="测试验证码固定为 1234，不发送短信"
          />
          <Form
            layout="vertical"
            onFinish={async (values) => {
              try {
                const u = await call("/auth/login", "POST", values);
                qc.removeQueries({ queryKey: ["client"] });
                setUser(u);
              } catch (e) {
                message.error((e as Error).message);
              }
            }}
          >
            <Form.Item
              name="phone"
              label="手机号"
              rules={[
                { required: true },
                { pattern: /^1\d{10}$/, message: "请输入11位手机号" },
              ]}
            >
              <Input autoComplete="tel" inputMode="tel" maxLength={11} />
            </Form.Item>
            <Form.Item
              name="code"
              label="测试验证码"
              rules={[{ required: true }]}
            >
              <Input
                inputMode="numeric"
                autoComplete="one-time-code"
                maxLength={4}
              />
            </Form.Item>
            <Button block type="primary" htmlType="submit">
              登录
            </Button>
          </Form>
        </Card>
      ) : match ? (
        <Room
          key={`${user.phone}:${match[1]}`}
          id={match[1]}
          phone={user.phone}
        />
      ) : (
        <Card title="进入会议" className="client-login">
          <Form
            layout="vertical"
            onFinish={({ id }) =>
              navigate(`/client/meetings/${String(id).trim()}`)
            }
          >
            <Form.Item
              name="id"
              label="会议编号"
              rules={[
                { required: true },
                { pattern: /^[1-9]\d*$/, message: "请输入有效会议编号" },
              ]}
            >
              <Input inputMode="numeric" placeholder="输入后台会议编号" />
            </Form.Item>
            <Button type="primary" htmlType="submit" block>
              查看会议
            </Button>
          </Form>
        </Card>
      )}
    </main>
  );
}
function Room({ id, phone }: { id: string; phone: string }) {
  const { message } = App.useApp(),
    qc = useQueryClient();
  const key = ["client", "meeting", id, phone];
  const q = useQuery({
    queryKey: key,
    queryFn: () => call(`/meetings/${id}`),
    refetchInterval: 3000,
    retry: false,
  });
  const [busy, setBusy] = useState(false),
    previous = useRef(false),
    deliberateLeave = useRef(false);
  const data = q.data;
  useEffect(() => {
    if (
      previous.current &&
      data &&
      !data.me.joined &&
      data.status === 2 &&
      !deliberateLeave.current
    )
      message.warning("参会连接已结束，请重新加入会议");
    previous.current = !!data?.me.joined;
    deliberateLeave.current = false;
  }, [data?.me.joined, data?.status, message]);
  useEffect(() => {
    if (!data?.me.joined || q.isError) return;
    const timer = setInterval(() => {
      call(`/meetings/${id}/action`, "POST", { action: "heartbeat" }).catch(
        () => qc.invalidateQueries({ queryKey: key }),
      );
    }, 15000);
    return () => clearInterval(timer);
  }, [id, phone, data?.me.joined, q.isError]);
  async function act(action: string, targetId?: number) {
    setBusy(true);
    try {
      if (action === "leave") deliberateLeave.current = true;
      const result = await call(`/meetings/${id}/action`, "POST", {
        action,
        targetId,
        version: data.version,
      });
      qc.setQueryData(key, result);
    } catch (e) {
      message.error((e as Error).message);
      await qc.invalidateQueries({ queryKey: key });
    } finally {
      setBusy(false);
    }
  }
  if (q.isError)
    return (
      <Card>
        <Alert type="error" showIcon message={(q.error as Error).message} />
        <Space style={{ marginTop: 16 }}>
          <Button onClick={() => q.refetch()}>重试</Button>
          <Link to="/client">返回首页</Link>
        </Space>
      </Card>
    );
  if (!data) return <Spin />;
  const c = data.capabilities,
    me = data.me;
  return (
    <Space direction="vertical" size="large" style={{ width: "100%" }}>
      <Card>
        <Space wrap>
          <Tag color={data.status === 2 ? "green" : "blue"}>
            {
              {
                1: "未开始",
                2: "进行中",
                3: "已结束",
                4: "已结束",
                [-1]: "已取消",
              }[data.status as number]
            }
          </Tag>
          {data.round && data.status !== 1 && <Tag>第 {data.round} 轮</Tag>}
        </Space>
        <Typography.Title level={2}>{data.title}</Typography.Title>
        <Descriptions
          column={{ xs: 1, sm: 2 }}
          items={[
            { key: "id", label: "会议编号", children: data.id },
            {
              key: "start",
              label:
                data.status === 1 || data.status === -1
                  ? "计划开始时间"
                  : "实际开始时间",
              children: time(
                data.status === 1 || data.status === -1
                  ? data.plannedStartTime
                  : data.startedAt,
              ),
            },
            {
              key: "host",
              label: "主持人",
              children: data.hosts.join("、") || "—",
            },
            {
              key: "guest",
              label: "嘉宾",
              children: data.guests.join("、") || "—",
            },
            ...([3, 4].includes(data.status)
              ? [
                  {
                    key: "end",
                    label: "实际结束时间",
                    children: time(data.endedAt),
                  },
                  {
                    key: "duration",
                    label: "会议时长",
                    children:
                      data.durationMinutes === null
                        ? "暂无记录"
                        : `${data.durationMinutes} 分钟`,
                  },
                ]
              : []),
          ]}
        />
        <Space wrap style={{ margin: "16px 0" }}>
          <Tag>{roles[me.role]}</Tag>
          <Tag>{me.joined ? "已加入" : "未加入"}</Tag>
          <Tag color={me.muted ? "red" : "default"}>
            {me.muted ? "已被禁言" : "未被禁言"}
          </Tag>
          {me.speaking && <Tag color="green">模拟发言中</Tag>}
        </Space>
        {data.status === -1 && <Alert type="warning" message="会议已取消" />}
        <div>
          <Space wrap>
            {c.start && (
              <Button
                type="primary"
                loading={busy}
                onClick={() => act("start")}
              >
                开始会议
              </Button>
            )}
            {c.join && (
              <Button type="primary" loading={busy} onClick={() => act("join")}>
                加入会议
              </Button>
            )}
            {c.leave && (
              <Button disabled={busy} onClick={() => act("leave")}>
                退出会议
              </Button>
            )}
            {c.speak && !me.speaking && (
              <Button disabled={busy} onClick={() => act("speak")}>
                开始模拟发言
              </Button>
            )}
            {me.speaking && (
              <Button disabled={busy} onClick={() => act("stop")}>
                停止模拟发言
              </Button>
            )}
            {c.end && (
              <Button
                danger
                disabled={busy}
                onClick={() =>
                  Modal.confirm({
                    title: "结束本轮会议？",
                    content: "所有参会人员将退出，本轮参会记录将结算。",
                    okText: "结束会议",
                    cancelText: "取消",
                    onOk: () => act("end"),
                  })
                }
              >
                结束会议
              </Button>
            )}
            {c.export && (
              <Button
                onClick={async () => {
                  try {
                    const result = await call(`/meetings/${id}/attendance`);
                    if (!result.rows.length) {
                      message.info("本轮暂无参会记录");
                      return;
                    }
                    downloadCSV(
                      `会议${id}-第${data.round}轮参会名单.csv`,
                      result.rows.map((r: any) => ({
                        会议编号: id,
                        轮次: r.round,
                        姓名: r.name,
                        手机号: r.phone,
                        身份: roles[r.role],
                        首次加入: time(r.joinedAt),
                        最后退出: time(r.leftAt),
                        累计分钟: r.minutes,
                        来源: r.source,
                      })),
                    );
                  } catch (e) {
                    message.error((e as Error).message);
                  }
                }}
              >
                导出参会名单
              </Button>
            )}
          </Space>
        </div>
      </Card>
      {c.participants && (
        <Card title={`当前参会人员（${data.participants.length}）`}>
          <List
            dataSource={data.participants}
            locale={{ emptyText: "暂无人员加入" }}
            renderItem={(p: any) => (
              <List.Item
                actions={
                  c.mute && p.role === "guest"
                    ? [
                        <Button
                          key="mute"
                          size="small"
                          disabled={busy}
                          onClick={() => act(p.muted ? "unmute" : "mute", p.id)}
                        >
                          {p.muted ? "解除禁言" : "禁言"}
                        </Button>,
                      ]
                    : []
                }
              >
                <List.Item.Meta
                  title={
                    <Space wrap>
                      {p.name}
                      <Tag>{roles[p.role]}</Tag>
                      {p.muted && <Tag color="red">已禁言</Tag>}
                      {p.speaking && <Tag color="green">模拟发言中</Tag>}
                    </Space>
                  }
                  description={p.phone}
                />
              </List.Item>
            )}
          />
        </Card>
      )}
    </Space>
  );
}
