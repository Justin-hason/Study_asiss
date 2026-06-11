import { Layout, Menu, Dropdown, Avatar, Typography } from 'antd';
import { Outlet, useNavigate, useLocation } from 'react-router-dom';
import { UserOutlined, LogoutOutlined } from '@ant-design/icons';
import type { MenuProps } from 'antd';

const { Header, Content } = Layout;

const menuItems = [
  { key: '/', label: '首页' },
  { key: '/docs', label: '文档管理' },
  { key: '/knowledge-base', label: '知识库' },
  { key: '/qa', label: '问答' },
  { key: '/search-errors', label: '搜题错题' },
  { key: '/outline-notes', label: '大纲笔记' },
  { key: '/study-stats', label: '学习统计' },
  { key: '/admin', label: '管理员后台' },
];

export default function LayoutWithHeader() {
  const navigate = useNavigate();
  const location = useLocation();

  const userMenuItems: MenuProps['items'] = [
    { key: 'profile', icon: <UserOutlined />, label: '个人中心' },
    { type: 'divider' },
    {
      key: 'logout',
      icon: <LogoutOutlined />,
      label: '退出登录',
      danger: true,
      onClick: () => {
        localStorage.removeItem('token');
        navigate('/login');
      },
    },
  ];

  return (
    <Layout style={{ minHeight: '100vh' }}>
      <Header style={{ display: 'flex', alignItems: 'center', padding: '0 24px' }}>
        <Typography.Title level={4} style={{ color: '#fff', margin: 0, marginRight: 24, whiteSpace: 'nowrap' }}>
          学习平台
        </Typography.Title>
        <Menu
          theme="dark"
          mode="horizontal"
          selectedKeys={[location.pathname]}
          items={menuItems}
          onClick={({ key }) => navigate(key)}
          style={{ flex: 1, minWidth: 0 }}
        />
        <Dropdown menu={{ items: userMenuItems }} placement="bottomRight">
          <Avatar icon={<UserOutlined />} style={{ cursor: 'pointer', backgroundColor: '#87d068' }} />
        </Dropdown>
      </Header>
      <Layout>
        <Content style={{ margin: 24, padding: 24, background: '#fff', borderRadius: 8 }}>
          <Outlet />
        </Content>
      </Layout>
    </Layout>
  );
}
