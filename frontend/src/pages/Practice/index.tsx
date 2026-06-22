import { useState, useEffect } from 'react';
import {
  Card, Button, Radio, Checkbox, Typography, Space, Tag, Progress,
  Result, Table, message, Spin, Empty, Row, Col, Statistic, Input
} from 'antd';
import {
  CheckCircleOutlined, CloseCircleOutlined, TrophyOutlined,
  HistoryOutlined, BookOutlined
} from '@ant-design/icons';
import {
  startPractice, submitAnswer, completePractice, getPracticeHistory,
  type StartPracticeResponse, type PracticeQuestion, type SubmitAnswerResponse,
  type PracticeSession
} from '../../api/exam';

const { Title, Text, Paragraph } = Typography;

type PracticeState = 'idle' | 'loading' | 'practicing' | 'reviewing' | 'completed';

export default function PracticePage() {
  const [state, setState] = useState<PracticeState>('idle');
  const [session, setSession] = useState<StartPracticeResponse | null>(null);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [userAnswer, setUserAnswer] = useState('');
  const [result, setResult] = useState<SubmitAnswerResponse | null>(null);
  const [answers, setAnswers] = useState<Record<string, SubmitAnswerResponse>>({});
  const [history, setHistory] = useState<PracticeSession[]>([]);
  const [historyLoading, setHistoryLoading] = useState(false);
  const [startTime, setStartTime] = useState<number>(0);

  useEffect(() => {
    loadHistory();
  }, []);

  const loadHistory = async () => {
    setHistoryLoading(true);
    try {
      const res = await getPracticeHistory(1, 10);
      setHistory(res.items);
    } catch {
      message.error('加载练习历史失败');
    } finally {
      setHistoryLoading(false);
    }
  };

  const handleStart = async () => {
    setState('loading');
    try {
      const res = await startPractice({ question_count: 5, title: '文档练习' });
      setSession(res);
      setCurrentIndex(0);
      setAnswers({});
      setUserAnswer('');
      setResult(null);
      setStartTime(Date.now());
      setState('practicing');
    } catch {
      message.error('生成题目失败，请确保已有处理完成的文档');
      setState('idle');
    }
  };

  const handleSubmit = async () => {
    if (!session || !userAnswer) return;
    const question = session.questions[currentIndex];
    const timeSpent = Math.floor((Date.now() - startTime) / 1000);

    try {
      const res = await submitAnswer({
        session_id: session.session_id,
        question_id: question.id,
        user_answer: userAnswer,
        time_spent: timeSpent,
      });
      setResult(res);
      setAnswers(prev => ({ ...prev, [question.id]: res }));
      setState('reviewing');
    } catch {
      message.error('提交答案失败');
    }
  };

  const handleNext = () => {
    if (!session) return;
    if (currentIndex < session.questions.length - 1) {
      setCurrentIndex(prev => prev + 1);
      setUserAnswer('');
      setResult(null);
      setStartTime(Date.now());
      setState('practicing');
    } else {
      handleComplete();
    }
  };

  const handleComplete = async () => {
    if (!session) return;
    try {
      await completePractice(session.session_id);
      message.success('练习完成！');
      setState('completed');
      loadHistory();
    } catch {
      message.error('完成练习失败');
    }
  };

  const renderQuestionOptions = (question: PracticeQuestion) => {
    if (question.question_type === 'fill_blank') {
      return (
        <div style={{ marginTop: 16 }}>
          <Text type="secondary">请在下方输入答案：</Text>
          <Input
            size="large"
            placeholder="请输入答案"
            value={userAnswer}
            onChange={e => setUserAnswer(e.target.value)}
            style={{ marginTop: 8 }}
            onPressEnter={() => {
              if (userAnswer.trim()) {
                handleSubmit();
              }
            }}
          />
        </div>
      );
    }

    if (question.question_type === 'judgment') {
      return (
        <Radio.Group
          value={userAnswer}
          onChange={e => setUserAnswer(e.target.value)}
          style={{ display: 'flex', flexDirection: 'column', gap: 12 }}
        >
          <Radio value="正确">正确</Radio>
          <Radio value="错误">错误</Radio>
        </Radio.Group>
      );
    }

    if (question.question_type === 'multiple_choice') {
      return (
        <Checkbox.Group
          value={userAnswer.split('')}
          onChange={vals => setUserAnswer((vals as string[]).sort().join(''))}
          style={{ display: 'flex', flexDirection: 'column', gap: 12 }}
        >
          {question.options?.map(opt => (
            <Checkbox key={opt.label} value={opt.label}>
              <Text>{opt.label}. {opt.text}</Text>
            </Checkbox>
          ))}
        </Checkbox.Group>
      );
    }

    return (
      <Radio.Group
        value={userAnswer}
        onChange={e => setUserAnswer(e.target.value)}
        style={{ display: 'flex', flexDirection: 'column', gap: 12 }}
      >
        {question.options?.map(opt => (
          <Radio key={opt.label} value={opt.label}>
            <Text>{opt.label}. {opt.text}</Text>
          </Radio>
        ))}
      </Radio.Group>
    );
  };

  const getDifficultyColor = (d: number) => {
    if (d <= 2) return 'green';
    if (d <= 3) return 'orange';
    return 'red';
  };

  const getDifficultyText = (d: number) => {
    if (d <= 2) return '简单';
    if (d <= 3) return '中等';
    return '困难';
  };

  if (state === 'loading') {
    return (
      <div style={{ textAlign: 'center', padding: 80 }}>
        <Spin size="large" tip="正在生成题目..." />
      </div>
    );
  }

  if (state === 'practicing' && session) {
    const question = session.questions[currentIndex];
    const progress = ((currentIndex) / session.questions.length) * 100;

    return (
      <div style={{ maxWidth: 800, margin: '0 auto' }}>
        <Card
          title={
            <Space>
              <BookOutlined style={{ color: '#1890ff' }} />
              <Title level={4} style={{ margin: 0, fontSize: 18 }}>{session.title}</Title>
            </Space>
          }
          style={{ borderRadius: 12, boxShadow: '0 2px 8px rgba(0,0,0,0.06)' }}
        >
          <div style={{ marginBottom: 24 }}>
            <Progress percent={progress} showInfo={false} strokeColor="#1890ff" />
            <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 8 }}>
              <Text type="secondary">题目 {currentIndex + 1} / {session.questions.length}</Text>
              <Space>
                <Tag color={getDifficultyColor(question.difficulty)}>{getDifficultyText(question.difficulty)}</Tag>
                {question.knowledge_point && <Tag color="blue">{question.knowledge_point}</Tag>}
              </Space>
            </div>
          </div>

          <Paragraph style={{ fontSize: 16, fontWeight: 500, marginBottom: 24, color: '#1f1f1f' }}>
            {question.question_text}
          </Paragraph>

          {renderQuestionOptions(question)}

          <div style={{ marginTop: 32, display: 'flex', justifyContent: 'flex-end' }}>
            <Button
              type="primary"
              size="large"
              onClick={handleSubmit}
              disabled={!userAnswer}
              style={{ borderRadius: 8, minWidth: 120 }}
            >
              提交答案
            </Button>
          </div>
        </Card>
      </div>
    );
  }

  if (state === 'reviewing' && result && session) {
    return (
      <div style={{ maxWidth: 800, margin: '0 auto' }}>
        <Card
          style={{
            borderRadius: 12,
            boxShadow: '0 2px 8px rgba(0,0,0,0.06)',
            borderColor: result.is_correct ? '#52c41a' : '#ff4d4f',
          }}
        >
          <Result
            status={result.is_correct ? 'success' : 'error'}
            icon={result.is_correct ? <CheckCircleOutlined /> : <CloseCircleOutlined />}
            title={result.is_correct ? '回答正确！' : '回答错误'}
            subTitle={`正确答案：${result.correct_answer}`}
          />

          <div style={{ background: '#f6ffed', padding: 16, borderRadius: 8, marginBottom: 16 }}>
            <Text strong style={{ color: '#52c41a' }}>解析：</Text>
            <Paragraph style={{ marginTop: 8, marginBottom: 0, color: '#333' }}>
              {result.analysis || '暂无解析'}
            </Paragraph>
          </div>

          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <Space>
              <Tag color={result.is_correct ? 'green' : 'red'}>
                {result.is_correct ? '+1分' : '+0分'}
              </Tag>
              <Text type="secondary">
                进度：{result.session_progress.answered_count} / {result.session_progress.question_count}
              </Text>
            </Space>
            <Button type="primary" onClick={handleNext} style={{ borderRadius: 8 }}>
              {currentIndex < session.questions.length - 1 ? '下一题' : '完成练习'}
            </Button>
          </div>
        </Card>
      </div>
    );
  }

  if (state === 'completed') {
    const total = Object.keys(answers).length;
    const correct = Object.values(answers).filter(a => a.is_correct).length;
    const accuracy = total > 0 ? Math.round((correct / total) * 100) : 0;

    return (
      <div style={{ maxWidth: 800, margin: '0 auto' }}>
        <Result
          icon={<TrophyOutlined style={{ color: '#faad14' }} />}
          title="练习完成！"
          subTitle={`共 ${total} 题，答对 ${correct} 题，正确率 ${accuracy}%`}
          extra={[
            <Button type="primary" key="again" onClick={handleStart} style={{ borderRadius: 8 }}>
              再练一次
            </Button>,
            <Button key="back" onClick={() => setState('idle')} style={{ borderRadius: 8 }}>
              返回首页
            </Button>,
          ]}
        />

        <Card title="答题回顾" style={{ borderRadius: 12, marginTop: 24 }}>
          {session?.questions.map((q, idx) => {
            const ans = answers[q.id];
            return (
              <div key={q.id} style={{
                padding: 16,
                borderBottom: '1px solid #f0f0f0',
                background: ans?.is_correct ? '#f6ffed' : '#fff2f0',
                borderRadius: 8,
                marginBottom: 8,
              }}>
                <Space style={{ marginBottom: 8 }}>
                  <Tag color={ans?.is_correct ? 'green' : 'red'}>
                    {ans?.is_correct ? '正确' : '错误'}
                  </Tag>
                  <Text type="secondary">第 {idx + 1} 题</Text>
                </Space>
                <Paragraph style={{ color: '#333' }}>{q.question_text}</Paragraph>
                <div style={{ marginTop: 8 }}>
                  <Text type="secondary">你的答案：{ans?.user_answer || '-'}</Text>
                  <br />
                  <Text type="secondary">正确答案：{ans?.correct_answer}</Text>
                </div>
              </div>
            );
          })}
        </Card>
      </div>
    );
  }

  // idle state
  return (
    <div style={{ maxWidth: 1200, margin: '0 auto' }}>
      <Title level={3} style={{ marginBottom: 24 }}>练习中心</Title>

      <Row gutter={[16, 16]} style={{ marginBottom: 24 }}>
        <Col xs={24} sm={8}>
          <Card style={{ borderRadius: 12, boxShadow: '0 2px 8px rgba(0,0,0,0.06)' }}>
            <Statistic
              title="总练习次数"
              value={history.length}
              prefix={<BookOutlined style={{ color: '#1890ff' }} />}
              valueStyle={{ color: '#1890ff', fontWeight: 600 }}
            />
          </Card>
        </Col>
        <Col xs={24} sm={8}>
          <Card style={{ borderRadius: 12, boxShadow: '0 2px 8px rgba(0,0,0,0.06)' }}>
            <Statistic
              title="平均正确率"
              value={history.length > 0
                ? Math.round(history.reduce((sum, h) => sum + h.accuracy, 0) / history.length)
                : 0}
              suffix="%"
              prefix={<TrophyOutlined style={{ color: '#52c41a' }} />}
              valueStyle={{ color: '#52c41a', fontWeight: 600 }}
            />
          </Card>
        </Col>
        <Col xs={24} sm={8}>
          <Card style={{ borderRadius: 12, boxShadow: '0 2px 8px rgba(0,0,0,0.06)' }}>
            <Statistic
              title="错题数量"
              value={history.reduce((sum, h) => sum + (h.question_count - h.correct_count), 0)}
              prefix={<CloseCircleOutlined style={{ color: '#ff4d4f' }} />}
              valueStyle={{ color: '#ff4d4f', fontWeight: 600 }}
            />
          </Card>
        </Col>
      </Row>

      <Card
        style={{
          borderRadius: 12,
          boxShadow: '0 2px 8px rgba(0,0,0,0.06)',
          marginBottom: 24,
          textAlign: 'center',
          padding: '48px 24px',
        }}
      >
        <BookOutlined style={{ fontSize: 64, color: '#1890ff', marginBottom: 24 }} />
        <Title level={4} style={{ marginBottom: 16 }}>开始练习</Title>
        <Paragraph type="secondary" style={{ marginBottom: 32, maxWidth: 500, margin: '0 auto 32px' }}>
          基于你的文档内容生成练习题，检验知识掌握程度。每次练习包含5道题目，答错的题目会自动加入错题本。
        </Paragraph>
        <Button type="primary" size="large" onClick={handleStart} style={{ borderRadius: 8, minWidth: 160, height: 48, fontSize: 16 }}>
          开始练习
        </Button>
      </Card>

      <Card
        title={
          <Space>
            <HistoryOutlined />
            <span>练习历史</span>
          </Space>
        }
        style={{ borderRadius: 12, boxShadow: '0 2px 8px rgba(0,0,0,0.06)' }}
      >
        {historyLoading ? (
          <div style={{ textAlign: 'center', padding: 40 }}><Spin /></div>
        ) : history.length === 0 ? (
          <Empty description="暂无练习记录" />
        ) : (
          <Table
            dataSource={history}
            rowKey="id"
            pagination={false}
            columns={[
              { title: '练习名称', dataIndex: 'title', key: 'title' },
              { title: '题目数', dataIndex: 'question_count', key: 'question_count', width: 100 },
              { title: '正确数', dataIndex: 'correct_count', key: 'correct_count', width: 100 },
              {
                title: '正确率',
                dataIndex: 'accuracy',
                key: 'accuracy',
                width: 120,
                render: (v: number) => (
                  <Tag color={v >= 80 ? 'green' : v >= 50 ? 'orange' : 'red'}>{v}%</Tag>
                ),
              },
              {
                title: '完成时间',
                dataIndex: 'completed_at',
                key: 'completed_at',
                width: 180,
                render: (v: string) => <Text type="secondary">{new Date(v).toLocaleString('zh-CN')}</Text>,
              },
            ]}
          />
        )}
      </Card>
    </div>
  );
}