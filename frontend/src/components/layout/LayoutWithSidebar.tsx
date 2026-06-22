import type { ReactNode } from 'react';
import { Layout, Menu } from 'antd';
import type { MenuProps } from 'antd';
import { Outlet, useNavigate, useLocation } from 'react-router-dom';
import {
  HomeOutlined,
  FileTextOutlined,
  BookOutlined,
  FolderOutlined,
  QuestionCircleOutlined,
  SearchOutlined,
  EditOutlined,
  BarChartOutlined,
  SettingOutlined,
  ApartmentOutlined,
  CarryOutOutlined,
} from '@ant-design/icons';
import { useAuth } from '../../contexts/AuthContext';
import type { UserRole } from '../../api/auth';

const { Sider, Content } = Layout;

interface AppMenuItem {
  key: string;
  icon: ReactNode;
  label: string;
  roles?: UserRole[];
}

const menuItems: AppMenuItem[] = [
  { key: '/', icon: <HomeOutlined />, label: '首页' },
  { key: '/docs', icon: <FileTextOutlined />, label: '文档审核', roles: ['admin', 'auditor'] },
  { key: '/my-docs', icon: <FolderOutlined />, label: '我的文档' },
  { key: '/knowledge-reports', icon: <ApartmentOutlined />, label: '知识报告' },
  { key: '/knowledge-base', icon: <BookOutlined />, label: '知识库' },
  { key: '/qa', icon: <QuestionCircleOutlined />, label: '问答' },
  { key: '/search-errors', icon: <SearchOutlined />, label: '搜题错题' },
  { key: '/outline-notes', icon: <EditOutlined />, label: '大纲笔记' },
  { key: '/practice', icon: <CarryOutOutlined />, label: '练习' },
  { key: '/study-stats', icon: <BarChartOutlined />, label: '学习统计' },
  { key: '/admin', icon: <SettingOutlined />, label: '管理员后台', roles: ['admin'] },
];

export default function LayoutWithSidebar() {
  const navigate = useNavigate();
  const location = useLocation();
  const { role } = useAuth();
  const visibleMenuItems: MenuProps['items'] = menuItems
    .filter(item => !item.roles || (role && item.roles.includes(role)))
    .map(item => ({ key: item.key, icon: item.icon, label: item.label }));

  return (
    <Layout style={{ minHeight: '100vh' }}>
      <Sider collapsible>
        <div style={{ height: 64, display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#fff', fontSize: 18, fontWeight: 'bold' }}>
          学习平台
        </div>
        <Menu
          theme="dark"
          mode="inline"
          selectedKeys={[location.pathname]}
          items={visibleMenuItems}
          onClick={({ key }) => navigate(key)}
        />
      </Sider>
      <Layout>
        <Content style={{ margin: 24, padding: 24, background: '#fff', borderRadius: 8 }}>
          <Outlet />
        </Content>
      </Layout>
    </Layout>
  );
}
