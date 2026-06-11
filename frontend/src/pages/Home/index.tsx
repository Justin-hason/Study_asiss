import { Typography } from 'antd';

const { Title, Paragraph } = Typography;

export default function HomePage() {
  return (
    <div>
      <Title level={2}>首页</Title>
      <Paragraph>欢迎使用学习平台（占位页面）</Paragraph>
    </div>
  );
}
