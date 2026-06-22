import { useState, useEffect } from 'react';
import {
  Card,
  Row,
  Col,
  Statistic,
  Progress,
  List,
  Tag,
  Space,
  Spin,
  message,
  Empty,
  Typography,
  Select,
} from 'antd';
import {
  BookOutlined,
  ClockCircleOutlined,
  TrophyOutlined,
  FireOutlined,
  RiseOutlined,
  CheckCircleOutlined,
} from '@ant-design/icons';
import { getDashboard, getTrends, getKnowledgeMap, getBehaviorLog } from '../../api/stats';

const { Text, Title } = Typography;
const { Option } = Select;

interface DashboardStats {
  total_documents: number;
  total_learn_events: number;
  total_practice_sessions: number;
  average_mastery: number;
  weekly_active_days: number;
  weekly_events: number;
  weekly_practice: number;
  total_accuracy: number;
}

interface TrendData {
  date: string;
  events: number;
}

interface KnowledgeNode {
  kp_id: string;
  name: string;
  score: number;
  color: string;
}

interface BehaviorEvent {
  id: string;
  kp_id: string;
  event_type: string;
  metadata?: any;
  created_at: string;
}

export default function StudyStatsPage() {
  const [stats, setStats] = useState<DashboardStats | null>(null);
  const [trends, setTrends] = useState<TrendData[]>([]);
  const [knowledgeNodes, setKnowledgeNodes] = useState<KnowledgeNode[]>([]);
  const [behaviorEvents, setBehaviorEvents] = useState<BehaviorEvent[]>([]);
  const [loading, setLoading] = useState(true);
  const [logPage, setLogPage] = useState(1);
  const [logTotal, setLogTotal] = useState(0);
  const [eventTypeFilter, setEventTypeFilter] = useState<string | undefined>();

  useEffect(() => {
    loadStats();
  }, []);

  useEffect(() => {
    loadBehaviorLog();
  }, [logPage, eventTypeFilter]);

  const loadStats = async () => {
    setLoading(true);
    try {
      const [dashboard, trendsData, knowledgeMap] = await Promise.all([
        getDashboard(),
        getTrends(7),
        getKnowledgeMap(),
      ]);
      setStats(dashboard);
      setTrends(trendsData.trends);
      setKnowledgeNodes(knowledgeMap.nodes || []);
    } catch (error) {
      message.error('加载统计数据失败');
    } finally {
      setLoading(false);
    }
  };

  const loadBehaviorLog = async () => {
    try {
      const data = await getBehaviorLog(logPage, 20, eventTypeFilter);
      setBehaviorEvents(data.events || []);
      setLogTotal(data.total || 0);
    } catch (error) {
      console.error('加载行为日志失败', error);
    }
  };

  const getEventTypeTag = (eventType: string) => {
    const typeMap: Record<string, { color: string; label: string }> = {
      SEARCH: { color: 'blue', label: '搜索' },
      VIEW: { color: 'green', label: '查看' },
      COLLECT: { color: 'orange', label: '收藏' },
      ANNOTATE: { color: 'purple', label: '批注' },
      MARK_MASTERY: { color: 'cyan', label: '标记掌握' },
      ANSWER: { color: 'red', label: '答题' },
    };
    const config = typeMap[eventType] || { color: 'default', label: eventType };
    return <Tag color={config.color}>{config.label}</Tag>;
  };

  const getMasteryLevel = (score: number) => {
    if (score >= 0.8) return { color: '#52c41a', text: '已掌握' };
    if (score >= 0.5) return { color: '#faad14', text: '学习中' };
    return { color: '#f5222d', text: '未掌握' };
  };

  if (loading) {
    return (
      <div style={{ textAlign: 'center', padding: 100 }}>
        <Spin size="large" />
      </div>
    );
  }

  return (
    <div>
      <h2>学习统计</h2>

      <Row gutter={[16, 16]} style={{ marginTop: 24 }}>
        <Col xs={24} sm={12} lg={4}>
          <Card>
            <Statistic
              title="文档数量"
              value={stats?.total_documents ?? 0}
              prefix={<BookOutlined />}
              valueStyle={{ color: '#1890ff' }}
            />
          </Card>
        </Col>
        <Col xs={24} sm={12} lg={4}>
          <Card>
            <Statistic
              title="学习次数"
              value={stats?.total_learn_events ?? 0}
              prefix={<ClockCircleOutlined />}
              valueStyle={{ color: '#52c41a' }}
            />
          </Card>
        </Col>
        <Col xs={24} sm={12} lg={4}>
          <Card>
            <Statistic
              title="练习次数"
              value={stats?.total_practice_sessions ?? 0}
              prefix={<CheckCircleOutlined />}
              valueStyle={{ color: '#52c41a' }}
            />
          </Card>
        </Col>
        <Col xs={24} sm={12} lg={4}>
          <Card>
            <Statistic
              title="平均正确率"
              value={stats?.total_accuracy ?? 0}
              suffix="%"
              prefix={<TrophyOutlined />}
              valueStyle={{ color: '#faad14' }}
            />
          </Card>
        </Col>
        <Col xs={24} sm={12} lg={4}>
          <Card>
            <Statistic
              title="平均掌握度"
              value={stats?.average_mastery ?? 0}
              suffix="%"
              prefix={<RiseOutlined />}
              valueStyle={{ color: '#13c2c2' }}
            />
          </Card>
        </Col>
        <Col xs={24} sm={12} lg={4}>
          <Card>
            <Statistic
              title="本周活跃"
              value={stats?.weekly_active_days ?? 0}
              suffix="天"
              prefix={<FireOutlined />}
              valueStyle={{ color: '#f5222d' }}
            />
          </Card>
        </Col>
      </Row>

      <Row gutter={[16, 16]} style={{ marginTop: 24 }}>
        <Col xs={24} lg={12}>
          <Card title="学习进度">
            <Row gutter={16}>
              <Col span={12}>
                <div style={{ marginBottom: 12 }}>
                  <span>当前掌握度</span>
                  <span style={{ float: 'right' }}>{stats?.average_mastery ?? 0}%</span>
                </div>
                <Progress percent={stats?.average_mastery ?? 0} strokeColor="#52c41a" />
              </Col>
              <Col span={12}>
                <div style={{ marginBottom: 12 }}>
                  <span>本周学习</span>
                  <span style={{ float: 'right' }}>{stats?.weekly_events ?? 0} 次</span>
                </div>
                <Progress percent={Math.min((stats?.weekly_events ?? 0) * 10, 100)} strokeColor="#1890ff" />
              </Col>
            </Row>
          </Card>
        </Col>

        <Col xs={24} lg={12}>
          <Card title="近7天学习趋势">
            <Row gutter={8} style={{ marginTop: 16 }}>
              {trends.map((item) => (
                <Col key={item.date} xs={24} sm={12} lg={3}>
                  <div style={{ textAlign: 'center' }}>
                    <div style={{ fontSize: 24, fontWeight: 'bold', marginBottom: 8 }}>{item.events}</div>
                    <div style={{ fontSize: 12, color: '#999' }}>{item.date.slice(5)}</div>
                  </div>
                </Col>
              ))}
            </Row>
          </Card>
        </Col>
      </Row>

      <Row gutter={[16, 16]} style={{ marginTop: 24 }}>
        <Col xs={24} lg={12}>
          <Card title="知识点掌握情况">
            {knowledgeNodes.length === 0 ? (
              <Empty description="暂无知识点数据" />
            ) : (
              <List
                dataSource={knowledgeNodes.slice(0, 10)}
                renderItem={(node) => {
                  const level = getMasteryLevel(node.score);
                  return (
                    <List.Item>
                      <List.Item.Meta
                        title={
                          <Space>
                            <Text>{node.name}</Text>
                            <Tag color={level.color}>{level.text}</Tag>
                          </Space>
                        }
                        description={
                          <Progress
                            percent={Math.round(node.score * 100)}
                            strokeColor={node.color}
                            size="small"
                            style={{ marginTop: 8 }}
                          />
                        }
                      />
                    </List.Item>
                  );
                }}
              />
            )}
          </Card>
        </Col>

        <Col xs={24} lg={12}>
          <Card
            title="学习行为日志"
            extra={
              <Select
                placeholder="事件类型"
                allowClear
                style={{ width: 120 }}
                value={eventTypeFilter}
                onChange={(val) => {
                  setEventTypeFilter(val);
                  setLogPage(1);
                }}
              >
                <Option value="SEARCH">搜索</Option>
                <Option value="VIEW">查看</Option>
                <Option value="COLLECT">收藏</Option>
                <Option value="ANNOTATE">批注</Option>
                <Option value="MARK_MASTERY">标记掌握</Option>
                <Option value="ANSWER">答题</Option>
              </Select>
            }
          >
            {behaviorEvents.length === 0 ? (
              <Empty description="暂无行为记录" />
            ) : (
              <List
                dataSource={behaviorEvents}
                renderItem={(item) => (
                  <List.Item>
                    <List.Item.Meta
                      title={
                        <Space>
                          {getEventTypeTag(item.event_type)}
                          <Text type="secondary" style={{ fontSize: 12 }}>
                            {new Date(item.created_at).toLocaleString()}
                          </Text>
                        </Space>
                      }
                      description={
                        <Text type="secondary">
                          知识点: {item.kp_id.substring(0, 8)}...
                        </Text>
                      }
                    />
                  </List.Item>
                )}
                pagination={{
                  current: logPage,
                  pageSize: 20,
                  total: logTotal,
                  onChange: (page) => setLogPage(page),
                  showTotal: (total) => `共 ${total} 条`,
                }}
              />
            )}
          </Card>
        </Col>
      </Row>

      <Card title="学习建议" style={{ marginTop: 24 }}>
        <Space direction="vertical" size={16} style={{ width: '100%' }}>
          <div>
            <Space>
              <RiseOutlined style={{ color: '#1890ff', fontSize: 20 }} />
              <Title level={5} style={{ margin: 0 }}>持续进步</Title>
            </Space>
            <Text type="secondary" style={{ display: 'block', marginTop: 8 }}>
              你本周学习了 {stats?.weekly_events ?? 0} 次（其中练习 {stats?.weekly_practice ?? 0} 次），继续保持这个节奏！
            </Text>
          </div>

          <div>
            <Space>
              <CheckCircleOutlined style={{ color: '#52c41a', fontSize: 20 }} />
              <Title level={5} style={{ margin: 0 }}>练习情况</Title>
            </Space>
            <Text type="secondary" style={{ display: 'block', marginTop: 8 }}>
              总正确率 {stats?.total_accuracy ?? 0}%，
              {(stats?.total_accuracy ?? 0) < 60
                ? '建议多复习错题，加强薄弱知识点'
                : (stats?.total_accuracy ?? 0) < 80
                ? '表现不错，继续提升！'
                : '表现优秀！'}
            </Text>
          </div>

          <div>
            <Space>
              <CheckCircleOutlined style={{ color: '#13c2c2', fontSize: 20 }} />
              <Title level={5} style={{ margin: 0 }}>掌握情况</Title>
            </Space>
            <Text type="secondary" style={{ display: 'block', marginTop: 8 }}>
              平均掌握度 {stats?.average_mastery ?? 0}%，
              {knowledgeNodes.filter((n) => n.score < 0.5).length > 0
                ? `还有 ${knowledgeNodes.filter((n) => n.score < 0.5).length} 个知识点需要加强`
                : '继续保持！'}
            </Text>
          </div>

          <div>
            <Space>
              <FireOutlined style={{ color: '#f5222d', fontSize: 20 }} />
              <Title level={5} style={{ margin: 0 }}>活跃天数</Title>
            </Space>
            <Text type="secondary" style={{ display: 'block', marginTop: 8 }}>
              本周活跃 {stats?.weekly_active_days ?? 0} 天，
              {stats?.weekly_active_days ?? 0 < 5 ? '建议增加学习频率' : '表现优秀！'}
            </Text>
          </div>
        </Space>
      </Card>
    </div>
  );
}
