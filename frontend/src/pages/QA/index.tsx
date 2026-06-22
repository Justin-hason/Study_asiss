import { useEffect, useRef, useState } from 'react';
import { Avatar, Button, Card, Input, List, Space, Spin, Tag, Typography, message, Row, Col } from 'antd';
import { SendOutlined, UserOutlined, RobotOutlined, ClockCircleOutlined } from '@ant-design/icons';
import MarkdownRenderer from '../../components/MarkdownRenderer';
import { askQuestion, type AskResponse, type ChatMessage } from '../../api/generate';
import { searchQA } from '../../api/search';

function getErrorMessage(error: unknown): string {
  if (typeof error === 'object' && error !== null && 'response' in error) {
    const response = (error as { response?: { data?: { detail?: string; error?: { message?: string } } } }).response;
    return response?.data?.detail || response?.data?.error?.message || '请求失败';
  }
  return error instanceof Error ? error.message : '请求失败';
}

const { TextArea } = Input;
const { Title, Text } = Typography;

interface SourcePreview {
  source: string;
  page: number;
  score?: number;
}

interface QAConversationMessage extends ChatMessage {
  sources?: SourcePreview[];
}

export default function QAPage() {
  const [messages, setMessages] = useState<QAConversationMessage[]>([]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [sessionId, setSessionId] = useState('');
  const [messageCount, setMessageCount] = useState(0);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages]);

  useEffect(() => {
    setMessageCount(messages.length);
  }, [messages]);

  const handleSend = async () => {
    if (!input.trim() || loading) return;

    const query = input;
    const userMsg: QAConversationMessage = { role: 'user', content: query, timestamp: new Date().toISOString() };
    setMessages((prev) => [...prev, userMsg]);
    setInput('');
    setLoading(true);

    try {
      const searchResult = await searchQA(query);
      const res: AskResponse = await askQuestion({
        query,
        session_id: sessionId || undefined,
        contexts: searchResult.contexts,
      });
      if (!sessionId && res.session_id) setSessionId(res.session_id);

      const botMsg: QAConversationMessage = {
        role: 'assistant',
        content: res.answer.answer,
        timestamp: new Date().toISOString(),
        sources: res.answer.sources,
      };
      setMessages((prev) => [...prev, botMsg]);
    } catch (error: unknown) {
      message.error(`请求失败: ${getErrorMessage(error)}`);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: 'calc(100vh - 120px)', maxWidth: 1200, margin: '0 auto', width: '100%' }}>
      {/* 标题区域 */}
      <div style={{ marginBottom: 24 }}>
        <Title level={3} style={{ margin: 0 }}>智能问答</Title>
        <Text type="secondary" style={{ fontSize: 14 }}>
          系统会先从你的文档中检索相关内容，再基于检索结果回答问题
        </Text>
      </div>

      {/* 统计卡片 */}
      <Row gutter={[16, 16]} style={{ marginBottom: 16 }}>
        <Col xs={24} sm={12} lg={6}>
          <Card size="small" style={{ borderRadius: 8, boxShadow: '0 2px 8px rgba(0,0,0,0.04)' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <div style={{ width: 36, height: 36, borderRadius: 8, background: '#e6f7ff', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                <ClockCircleOutlined style={{ color: '#1890ff', fontSize: 18 }} />
              </div>
              <div>
                <div style={{ fontSize: 12, color: '#8c8c8c' }}>对话次数</div>
                <div style={{ fontSize: 20, fontWeight: 600, color: '#1890ff' }}>{messageCount}</div>
              </div>
            </div>
          </Card>
        </Col>
      </Row>

      {/* 对话区域 */}
      <Card
        style={{
          flex: 1,
          overflow: 'auto',
          marginBottom: 16,
          borderRadius: 12,
          boxShadow: '0 2px 8px rgba(0,0,0,0.04)',
        }}
        bodyStyle={{ padding: '16px 24px' }}
      >
        {messages.length === 0 ? (
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', height: '100%', minHeight: 300 }}>
            <div style={{ width: 100, height: 100, borderRadius: 50, background: '#f6ffed', display: 'flex', alignItems: 'center', justifyContent: 'center', marginBottom: 16 }}>
              <RobotOutlined style={{ fontSize: 48, color: '#52c41a' }} />
            </div>
            <Title level={4} style={{ margin: 0, fontSize: 18 }}>欢迎使用智能问答</Title>
            <Text type="secondary" style={{ marginTop: 8, fontSize: 14 }}>输入你的问题，系统会基于文档内容为你解答</Text>
          </div>
        ) : (
          <List
            dataSource={messages}
            renderItem={(msg) => (
              <List.Item style={{ justifyContent: msg.role === 'user' ? 'flex-end' : 'flex-start', border: 'none', padding: '12px 0' }}>
                <Space align="start" size={12}>
                  {msg.role === 'assistant' && (
                    <Avatar icon={<RobotOutlined />} style={{ backgroundColor: '#1677ff', width: 40, height: 40 }} />
                  )}
                  <div
                    style={{
                      maxWidth: msg.role === 'user' ? '60%' : '75%',
                      minWidth: msg.role === 'user' ? 'auto' : 'none',
                      width: msg.role === 'user' ? 'fit-content' : 'auto',
                      padding: '12px 16px',
                      borderRadius: msg.role === 'user' ? '12px 12px 0 12px' : '12px 12px 12px 0',
                      backgroundColor: msg.role === 'user' ? '#1890ff' : '#f5f5f5',
                      maxHeight: msg.role === 'user' ? 'auto' : 500,
                      overflow: msg.role === 'user' ? 'visible' : 'auto',
                    }}
                  >
                    {msg.role === 'assistant' ? (
                      <MarkdownRenderer
                        content={msg.content}
                        style={{
                          padding: 0,
                          border: 'none',
                          boxShadow: 'none',
                          background: 'transparent',
                          maxHeight: 500,
                          fontSize: 14,
                          color: '#333',
                        }}
                      />
                    ) : (
                      <Text 
                        style={{ 
                          color: '#ffffff', 
                          fontSize: 14, 
                          lineHeight: 1.6,
                          whiteSpace: 'nowrap',
                          maxWidth: '420px',
                          overflow: 'hidden',
                          textOverflow: 'ellipsis',
                          display: 'block',
                        }}
                        ellipsis={{ tooltip: msg.content }}
                      >{msg.content}</Text>
                    )}
                    {msg.role === 'assistant' && msg.sources && msg.sources.length > 0 ? (
                      <Space direction="vertical" size={8} style={{ marginTop: 12, width: '100%' }}>
                        <Text type="secondary" style={{ fontSize: 12 }}>参考来源</Text>
                        <Space wrap>
                          {msg.sources.map((source, index) => (
                            <Tag key={`${source.source}-${source.page}-${index}`} color="blue" style={{ borderRadius: 6, fontSize: 12 }}>
                              {source.source} · 第 {source.page} 段
                            </Tag>
                          ))}
                        </Space>
                      </Space>
                    ) : null}
                  </div>
                  {msg.role === 'user' && (
                    <Avatar icon={<UserOutlined />} style={{ backgroundColor: '#8c8c8c', width: 40, height: 40 }} />
                  )}
                </Space>
              </List.Item>
            )}
          />
        )}
        <div ref={messagesEndRef} />
        {loading && (
          <div style={{ textAlign: 'center', padding: 16 }}>
            <Spin size="default" />
          </div>
        )}
      </Card>

      {/* 输入区域 */}
      <Card
        style={{
          borderRadius: 12,
          boxShadow: '0 2px 8px rgba(0,0,0,0.04)',
        }}
        bodyStyle={{ padding: '16px 20px' }}
      >
        <Space.Compact style={{ width: '100%' }}>
          <TextArea
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder="输入你的问题..."
            autoSize={{ minRows: 2, maxRows: 4 }}
            onPressEnter={(e) => {
              if (!e.shiftKey) {
                e.preventDefault();
                handleSend();
              }
            }}
            style={{ borderRadius: 8 }}
          />
          <Button
            type="primary"
            icon={<SendOutlined />}
            onClick={handleSend}
            loading={loading}
            style={{ borderRadius: 8, height: 'auto', padding: '0 24px' }}
          >
            发送
          </Button>
        </Space.Compact>
      </Card>
    </div>
  );
}