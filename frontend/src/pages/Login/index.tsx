import { Button, Card, Form, Input, Typography, message } from 'antd';
import { useNavigate } from 'react-router-dom';
import { login, type UserRole } from '../../api/auth';
import { useAuth } from '../../contexts/AuthContext';

const { Title } = Typography;

function getRedirectPath(role: UserRole): string {
  if (role === 'admin') return '/admin';
  if (role === 'auditor') return '/docs';
  return '/';
}

function getErrorMessage(error: unknown): string {
  if (typeof error === 'object' && error !== null && 'response' in error) {
    const response = (error as { response?: { data?: { error?: { message?: string }; detail?: string } } }).response;
    return response?.data?.error?.message || response?.data?.detail || '登录失败';
  }
  return error instanceof Error ? error.message : '登录失败';
}

export default function LoginPage() {
  const navigate = useNavigate();
  const { loginWithToken } = useAuth();

  const handleSubmit = async (values: { username: string; password: string }) => {
    try {
      const result = await login(values);
      const user = await loginWithToken(result.token, result.user);
      message.success('登录成功');
      navigate(getRedirectPath(user.role));
    } catch (error: unknown) {
      message.error(getErrorMessage(error));
    }
  };

  return (
    <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: '100%' }}>
      <Card style={{ width: 400 }}>
        <Title level={3} style={{ textAlign: 'center' }}>登录</Title>
        <Form onFinish={handleSubmit} layout="vertical">
          <Form.Item label="用户名" name="username" rules={[{ required: true }]}>
            <Input />
          </Form.Item>
          <Form.Item label="密码" name="password" rules={[{ required: true }]}>
            <Input.Password />
          </Form.Item>
          <Form.Item>
            <Button type="primary" htmlType="submit" block>登录</Button>
          </Form.Item>
          <Form.Item style={{ textAlign: 'center' }}>
            <a onClick={() => navigate('/register')}>还没有账号？立即注册</a>
          </Form.Item>
        </Form>
      </Card>
    </div>
  );
}
