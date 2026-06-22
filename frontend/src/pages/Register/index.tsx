import { Button, Card, Form, Input, Typography, message } from 'antd';
import { useNavigate } from 'react-router-dom';
import { register } from '../../api/auth';
import { useAuth } from '../../contexts/AuthContext';

const { Title } = Typography;

function getErrorMessage(error: unknown): string {
  if (typeof error === 'object' && error !== null && 'response' in error) {
    const response = (error as { response?: { data?: { error?: { message?: string }; detail?: string } } }).response;
    return response?.data?.error?.message || response?.data?.detail || '注册失败';
  }
  return error instanceof Error ? error.message : '注册失败';
}

export default function RegisterPage() {
  const navigate = useNavigate();
  const { loginWithToken } = useAuth();

  const handleSubmit = async (values: { username: string; password: string; email?: string }) => {
    try {
      const result = await register(values);
      await loginWithToken(result.token, result.user);
      message.success('注册成功');
      navigate('/');
    } catch (error: unknown) {
      message.error(getErrorMessage(error));
    }
  };

  return (
    <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: '100%' }}>
      <Card style={{ width: 400 }}>
        <Title level={3} style={{ textAlign: 'center' }}>注册</Title>
        <Form onFinish={handleSubmit} layout="vertical">
          <Form.Item label="用户名" name="username" rules={[{ required: true }]}>
            <Input />
          </Form.Item>
          <Form.Item label="邮箱" name="email">
            <Input type="email" />
          </Form.Item>
          <Form.Item label="密码" name="password" rules={[{ required: true, min: 6 }]}>
            <Input.Password />
          </Form.Item>
          <Form.Item>
            <Button type="primary" htmlType="submit" block>注册</Button>
          </Form.Item>
          <Form.Item style={{ textAlign: 'center' }}>
            <a onClick={() => navigate('/login')}>已有账号？立即登录</a>
          </Form.Item>
        </Form>
      </Card>
    </div>
  );
}
