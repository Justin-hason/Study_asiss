import { Layout, Menu } from 'antd';
import { Outlet, useNavigate, useLocation } from 'react-router-dom';
import {
  HomeOutlined,
  FileTextOutlined,
  BookOutlined,
  QuestionCircleOutlined,
  SearchOutlined,
  EditOutlined,
  BarChartOutlined,
  SettingOutlined,
} from '@ant-design/icons';

const { Sider, Content } = Layout;

const menuItems = [
  { key: '/', icon: <HomeOutlined />, label: '首页' },
  { key: '/docs', icon: <FileTextOutlined />, label: '文档管理' },
  { key: '/knowledge-base', icon: <BookOutlined />, label: '知识库' },
  { key: '/qa', icon: <QuestionCircleOutlined />, label: '问答' },
  { key: '/search-errors', icon: <SearchOutlined />, label: '搜题错题' },
  { key: '/outline-notes', icon: <EditOutlined />, label: '大纲笔记' },
  { key: '/study-stats', icon: <BarChartOutlined />, label: '学习统计' },
  { key: '/admin', icon: <SettingOutlined />, label: '管理员后台' },
];

export default function LayoutWithSidebar() {
  const navigate = useNavigate();
  const location = useLocation();

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
          items={menuItems}
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
