import React, { useState, useEffect, createContext, useContext } from "react";
import {
  Layout,
  Menu,
  Button,
  Space,
  Tag,
  Form,
  Input,
  Select,
  Card,
  Typography,
  App as AntApp,
  Spin,
  Alert,
} from "antd";
import {
  Routes,
  Route,
  Link,
  useNavigate,
  useLocation,
} from "react-router-dom";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "./api";
import { MeetingList, MeetingEditor } from "./Meetings";
import { MeetingDetail } from "./Detail";
import { References, SeriesPage, AuditPage } from "./Settings";
export const UserContext = createContext<any>(null);
export const useUser = () => useContext(UserContext);
export default function App() {
  const [user, setUser] = useState<any>(null),
    [ready, setReady] = useState(false);
  const nav = useNavigate(),
    location = useLocation();
  const qc = useQueryClient();
  const { message } = AntApp.useApp();
  useEffect(() => {
    api("/auth/me")
      .then(setUser)
      .catch(() => {})
      .finally(() => setReady(true));
    const expired = () => {
      setUser(null);
      qc.clear();
    };
    window.addEventListener("session-expired", expired);
    return () => window.removeEventListener("session-expired", expired);
  }, []);
  if (!ready) return <Spin fullscreen />;
  if (!user)
    return (
      <div className="login">
        <div className="login-story">
          <span className="brand-icon">M</span>
          <Typography.Title>会议管理中心</Typography.Title>
          <p>让每一场会议，井然有序。</p>
          <div className="login-lines">
            <p>01　预约与授权配置</p>
            <p>02　人员与资料管理</p>
            <p>03　会后处理与统计</p>
          </div>
          <small>独立后台 · 数据持久化 · 外部能力模拟</small>
        </div>
        <Card className="login-card">
          <Typography.Title level={3}>欢迎回来</Typography.Title>
          <p className="muted">登录你的管理账号</p>
          <Form
            layout="vertical"
            initialValues={{ username: "admin" }}
            onFinish={async (values) => {
              try {
                setUser(await api("/auth/login", "POST", values));
                nav("/");
              } catch (e) {
                message.error((e as Error).message);
              }
            }}
          >
            <Form.Item
              name="username"
              label="账号"
              rules={[{ required: true }]}
            >
              <Input autoComplete="username" size="large" />
            </Form.Item>
            <Form.Item
              name="password"
              label="密码"
              rules={[{ required: true }]}
            >
              <Input.Password autoComplete="current-password" size="large" />
            </Form.Item>
            <Button type="primary" htmlType="submit" size="large" block>
              登录管理后台
            </Button>
          </Form>
          <p className="muted">首次使用请参阅项目 README 中的本地演示账号。</p>
        </Card>
      </div>
    );
  const readonly = user.role === "viewer";
  return (
    <UserContext.Provider value={user}>
      <Layout style={{ minHeight: "100vh" }}>
        <Layout.Sider width={228} theme="light" className="sidebar">
          <Link to="/" className="brand">
            <span className="brand-icon">M</span>
            <div>
              会议管理中心<small>MEETING CONSOLE</small>
            </div>
          </Link>
          <div className="nav-label">工作空间</div>
          <Menu
            selectedKeys={[
              location.pathname.startsWith("/references")
                ? "/references"
                : location.pathname.startsWith("/series")
                  ? "/series"
                  : location.pathname === "/audits"
                    ? "/audits"
                    : "/",
            ]}
            items={[
              { key: "/", label: <Link to="/">▦　会议管理</Link> },
              { key: "/series", label: <Link to="/series">▤　系列会议</Link> },
              {
                key: "/references",
                label: <Link to="/references">◇　基础资料</Link>,
              },
              ...(!readonly
                ? [
                    {
                      key: "/audits",
                      label: <Link to="/audits">◷　操作审计</Link>,
                    },
                  ]
                : []),
            ]}
          />
          <div className="sidebar-note">
            <Tag color="blue">MVP</Tag>
            <p>
              外部服务均为模拟
              <br />
              不创建真实会议房间
            </p>
          </div>
        </Layout.Sider>
        <Layout>
          <Layout.Header className="header">
            <span>
              <Select
                className="mobile-nav"
                value={
                  location.pathname.startsWith("/references")
                    ? "/references"
                    : location.pathname.startsWith("/series")
                      ? "/series"
                      : location.pathname === "/audits"
                        ? "/audits"
                        : "/"
                }
                style={{ width: 140, marginRight: 10 }}
                onChange={(v) => nav(v)}
                options={[
                  { value: "/", label: "会议管理" },
                  { value: "/series", label: "系列会议" },
                  { value: "/references", label: "基础资料" },
                  ...(!readonly
                    ? [{ value: "/audits", label: "操作审计" }]
                    : []),
                ]}
              />
              运营工作台{" "}
              <span className="muted">
                / {location.pathname.includes("new") ? "预约会议" : "会议管理"}
              </span>
            </span>
            <Space>
              <Tag>
                {
                  (
                    { admin: "管理员", operator: "运营", viewer: "只读" } as any
                  )[user.role]
                }
              </Tag>
              {user.username}
              <Button
                type="text"
                onClick={async () => {
                  await api("/auth/logout", "POST");
                  qc.clear();
                  setUser(null);
                }}
              >
                退出
              </Button>
            </Space>
          </Layout.Header>
          <Layout.Content className="content">
            <Routes>
              <Route path="/" element={<MeetingList />} />
              <Route path="/meetings/new" element={<MeetingEditor />} />
              <Route path="/meetings/:id/edit" element={<MeetingEditor />} />
              <Route path="/meetings/:id" element={<MeetingDetail />} />
              <Route path="/references" element={<References />} />
              <Route path="/series" element={<SeriesPage />} />
              <Route path="/audits" element={<AuditPage />} />
              <Route
                path="/simulation/:id"
                element={
                  <Card title="模拟服务说明">
                    <Alert
                      type="info"
                      showIcon
                      message="这是模拟入口"
                      description="本项目仅实现管理后台。此链接不创建房间、不拨打电话、不播放媒体，也不调用第三方服务。"
                    />
                    <Button style={{ marginTop: 20 }} onClick={() => nav(-1)}>
                      返回
                    </Button>
                  </Card>
                }
              />
              <Route
                path="*"
                element={<Alert type="warning" message="页面不存在" />}
              />
            </Routes>
          </Layout.Content>
        </Layout>
      </Layout>
    </UserContext.Provider>
  );
}
export function useRefs() {
  return useQuery({ queryKey: ["refs"], queryFn: () => api("/references") });
}
export function LoadingError({ query }: any) {
  if (query.isLoading) return <Spin />;
  if (query.error)
    return (
      <Alert
        type="error"
        message={query.error.message}
        action={<Button onClick={() => query.refetch()}>重试</Button>}
      />
    );
  return null;
}
