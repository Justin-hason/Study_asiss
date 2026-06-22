import { useEffect, useState } from 'react';
import { Card, Col, Row, Statistic, Typography, Spin, Alert, Progress, message } from 'antd';
import { FileTextOutlined, BookOutlined, TagOutlined, CalendarOutlined, CheckCircleOutlined, TrophyOutlined, CarryOutOutlined } from '@ant-design/icons';
import { useNavigate } from 'react-router-dom';
import { getDashboard, getTrends, type DashboardStats, type TrendData } from '../../api/stats';

const { Title, Text } = Typography;

export default function HomePage() {
  const navigate = useNavigate();
  const [stats, setStats] = useState<DashboardStats | null>(null);
  const [trends, setTrends] = useState<TrendData[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    Promise.all([getDashboard(), getTrends()])
      .then(([s, t]) => { setStats(s); setTrends(t.trends); })
      .catch(() => {
        setError('获取用户数据失败，请确认已登录');
        message.error('获取用户数据失败，请确认已登录');
      })
      .finally(() => setLoading(false));
  }, []);

  if (loading) return <div style={{ textAlign: 'center', padding: 80 }}><Spin size="large" /></div>;
  if (error) return <Alert message={error} type="error" showIcon style={{ margin: 24 }} />;

  const getMasteryColor = (percent: number) => {
    if (percent >= 80) return '#52c41a';
    if (percent >= 50) return '#faad14';
    return '#ff4d4f';
  };

  const getWeeklyEventsColor = (count: number) => {
    if (count >= 10) return '#52c41a';
    if (count >= 5) return '#faad14';
    return '#1890ff';
  };

  return (
    <div style={{ maxWidth: 1400, margin: '0 auto' }}>
      {/* 欢迎区域 */}
      <Card
        style={{
          borderRadius: 16,
          boxShadow: '0 4px 16px rgba(0,0,0,0.08)',
          marginBottom: 24,
          background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
        }}
        bodyStyle={{ padding: '32px' }}
      >
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 16 }}>
          <div>
            <Title level={3} style={{ margin: 0, color: '#ffffff' }}>欢迎回来！</Title>
            <Text style={{ color: 'rgba(255,255,255,0.85)', fontSize: 16, marginTop: 8, display: 'block' }}>
              继续你的学习之旅，智能助手随时为你服务
            </Text>
          </div>
          <div style={{ width: 80, height: 80, borderRadius: 40, background: 'rgba(255,255,255,0.15)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <BookOutlined style={{ fontSize: 40, color: '#ffffff' }} />
          </div>
        </div>
      </Card>

      {/* 统计卡片 */}
      <Row gutter={[16, 16]} style={{ marginBottom: 24 }}>
        <Col xs={24} sm={12} lg={4}>
          <Card style={{ borderRadius: 12, boxShadow: '0 2px 8px rgba(0,0,0,0.06)' }}>
            <Statistic
              title="我的文档"
              value={stats?.total_documents ?? 0}
              prefix={<FileTextOutlined style={{ color: '#1890ff', fontSize: 24 }} />}
              valueStyle={{ color: '#1890ff', fontWeight: 600, fontSize: 28 }}
            />
            <div style={{ marginTop: 8, fontSize: 12, color: '#8c8c8c' }}>已上传的文档数量</div>
          </Card>
        </Col>
        <Col xs={24} sm={12} lg={4}>
          <Card style={{ borderRadius: 12, boxShadow: '0 2px 8px rgba(0,0,0,0.06)' }}>
            <Statistic
              title="学习次数"
              value={stats?.total_learn_events ?? 0}
              prefix={<TagOutlined style={{ color: '#52c41a', fontSize: 24 }} />}
              valueStyle={{ color: '#52c41a', fontWeight: 600, fontSize: 28 }}
            />
            <div style={{ marginTop: 8, fontSize: 12, color: '#8c8c8c' }}>累计学习活动次数</div>
          </Card>
        </Col>
        <Col xs={24} sm={12} lg={4}>
          <Card style={{ borderRadius: 12, boxShadow: '0 2px 8px rgba(0,0,0,0.06)', cursor: 'pointer' }} onClick={() => navigate('/practice')}>
            <Statistic
              title="练习次数"
              value={stats?.total_practice_sessions ?? 0}
              prefix={<CarryOutOutlined style={{ color: '#722ed1', fontSize: 24 }} />}
              valueStyle={{ color: '#722ed1', fontWeight: 600, fontSize: 28 }}
            />
            <div style={{ marginTop: 8, fontSize: 12, color: '#8c8c8c' }}>点击查看练习详情 →</div>
          </Card>
        </Col>
        <Col xs={24} sm={12} lg={4}>
          <Card style={{ borderRadius: 12, boxShadow: '0 2px 8px rgba(0,0,0,0.06)' }}>
            <Statistic
              title="平均正确率"
              value={stats?.total_accuracy ?? 0}
              suffix="%"
              prefix={<TrophyOutlined style={{ color: '#faad14', fontSize: 24 }} />}
              valueStyle={{ color: '#faad14', fontWeight: 600, fontSize: 28 }}
            />
            <div style={{ marginTop: 8, fontSize: 12, color: '#8c8c8c' }}>练习正确率</div>
          </Card>
        </Col>
        <Col xs={24} sm={12} lg={4}>
          <Card style={{ borderRadius: 12, boxShadow: '0 2px 8px rgba(0,0,0,0.06)' }}>
            <Statistic
              title="平均掌握度"
              value={stats?.average_mastery ?? 0}
              suffix="%"
              prefix={<CheckCircleOutlined style={{ color: getMasteryColor(stats?.average_mastery ?? 0), fontSize: 24 }} />}
              valueStyle={{ color: getMasteryColor(stats?.average_mastery ?? 0), fontWeight: 600, fontSize: 28 }}
            />
            <div style={{ marginTop: 8, fontSize: 12, color: '#8c8c8c' }}>知识掌握程度</div>
          </Card>
        </Col>
        <Col xs={24} sm={12} lg={4}>
          <Card style={{ borderRadius: 12, boxShadow: '0 2px 8px rgba(0,0,0,0.06)' }}>
            <Statistic
              title="本周活跃"
              value={stats?.weekly_active_days ?? 0}
              suffix="天"
              prefix={<CalendarOutlined style={{ color: '#f5222d', fontSize: 24 }} />}
              valueStyle={{ color: '#f5222d', fontWeight: 600, fontSize: 28 }}
            />
            <div style={{ marginTop: 8, fontSize: 12, color: '#8c8c8c' }}>本周活跃天数</div>
          </Card>
        </Col>
      </Row>

      {/* 学习进度 */}
      <Card
        title={<Title level={4} style={{ margin: 0, fontSize: 18 }}>学习进度</Title>}
        style={{
          borderRadius: 12,
          boxShadow: '0 2px 8px rgba(0,0,0,0.06)',
          marginBottom: 24,
        }}
        bodyStyle={{ padding: '24px' }}
      >
        <Row gutter={[24, 24]}>
          <Col span={12}>
            <div style={{ marginBottom: 12, display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <span style={{ fontSize: 14, fontWeight: 500, color: '#333' }}>当前掌握度</span>
              <span style={{ fontSize: 16, fontWeight: 600, color: getMasteryColor(stats?.average_mastery ?? 0) }}>
                {stats?.average_mastery ?? 0}%
              </span>
            </div>
            <Progress
              percent={stats?.average_mastery ?? 0}
              strokeColor={{
                from: getMasteryColor(stats?.average_mastery ?? 0),
                to: '#1890ff',
              }}
              strokeWidth={12}
              format={() => ''}
              style={{ borderRadius: 6 }}
            />
            <div style={{ marginTop: 8, display: 'flex', alignItems: 'center', gap: 8 }}>
              <div style={{ width: 8, height: 8, borderRadius: 4, background: '#ff4d4f' }} />
              <span style={{ fontSize: 12, color: '#8c8c8c' }}>待提升</span>
              <div style={{ width: 8, height: 8, borderRadius: 4, background: '#faad14' }} />
              <span style={{ fontSize: 12, color: '#8c8c8c' }}>学习中</span>
              <div style={{ width: 8, height: 8, borderRadius: 4, background: '#52c41a' }} />
              <span style={{ fontSize: 12, color: '#8c8c8c' }}>已掌握</span>
            </div>
          </Col>
          <Col span={12}>
            <div style={{ marginBottom: 12, display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <span style={{ fontSize: 14, fontWeight: 500, color: '#333' }}>本周学习</span>
              <span style={{ fontSize: 16, fontWeight: 600, color: getWeeklyEventsColor(stats?.weekly_events ?? 0) }}>
                {stats?.weekly_events ?? 0} 次
              </span>
            </div>
            <Progress
              percent={Math.min((stats?.weekly_events ?? 0) * 10, 100)}
              strokeColor={{
                from: '#1890ff',
                to: '#52c41a',
              }}
              strokeWidth={12}
              format={() => ''}
              style={{ borderRadius: 6 }}
            />
            <div style={{ marginTop: 8, fontSize: 12, color: '#8c8c8c' }}>
              目标：每周学习 10 次以上
            </div>
          </Col>
        </Row>
      </Card>

      {/* 学习趋势 */}
      <Card
        title={<Title level={4} style={{ margin: 0, fontSize: 18 }}>近7天学习趋势</Title>}
        style={{
          borderRadius: 12,
          boxShadow: '0 2px 8px rgba(0,0,0,0.06)',
        }}
        bodyStyle={{ padding: '24px' }}
      >
        <div style={{ display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between', height: 180, gap: 8 }}>
          {trends.map((item, index) => {
            const maxEvents = Math.max(...trends.map(t => t.events), 1);
            const heightPercent = (item.events / maxEvents) * 100;
            const isToday = index === trends.length - 1;
            const hasActivity = item.events > 0;

            return (
              <div key={item.date} style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
                <div style={{ width: '100%', maxWidth: 50, height: `${Math.max(heightPercent * 1.5, 20)}%`, minHeight: 20, borderRadius: '8px 8px 0 0', marginBottom: 12, background: isToday ? '#1890ff' : (hasActivity ? '#52c41a' : '#f0f0f0'), transition: 'height 0.3s' }} />
                <div style={{ fontSize: 16, fontWeight: 600, color: hasActivity ? '#333' : '#bfbfbf' }}>{item.events}</div>
                <div style={{ fontSize: 12, color: '#8c8c8c', marginTop: 4 }}>{item.date.slice(5)}</div>
              </div>
            );
          })}
        </div>
        <div style={{ marginTop: 24, paddingTop: 16, borderTop: '1px solid #f0f0f0', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 16 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <div style={{ width: 12, height: 12, borderRadius: 4, background: '#1890ff' }} />
            <span style={{ fontSize: 12, color: '#8c8c8c' }}>今天</span>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <div style={{ width: 12, height: 12, borderRadius: 4, background: '#52c41a' }} />
            <span style={{ fontSize: 12, color: '#8c8c8c' }}>有学习活动</span>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <div style={{ width: 12, height: 12, borderRadius: 4, background: '#f0f0f0' }} />
            <span style={{ fontSize: 12, color: '#8c8c8c' }}>无学习活动</span>
          </div>
        </div>
      </Card>
    </div>
  );
}