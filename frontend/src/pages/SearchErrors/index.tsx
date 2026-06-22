import { useState, useEffect } from 'react';
import {
  Card,
  Tabs,
  Input,
  Button,
  List,
  Tag,
  Space,
  Modal,
  Form,
  message,
  Empty,
  Spin,
  Pagination,
  Rate,
  Typography,
  Select,
  Popconfirm,
} from 'antd';
import {
  SearchOutlined,
  PlusOutlined,
  DeleteOutlined,
  EditOutlined,
  CheckCircleOutlined,
  ClockCircleOutlined,
  WarningOutlined,
} from '@ant-design/icons';
import {
  getWrongQuestions,
  addWrongQuestion,
  updateWrongQuestion,
  deleteWrongQuestion,
  searchQuestions,
  type WrongQuestion,
} from '../../api/exam';

const { TextArea } = Input;
const { Text, Paragraph } = Typography;
const { TabPane } = Tabs;
const { Option } = Select;

export default function SearchErrorsPage() {
  const [activeTab, setActiveTab] = useState('wrong-book');
  const [wrongQuestions, setWrongQuestions] = useState<WrongQuestion[]>([]);
  const [loading, setLoading] = useState(false);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(20);
  const [statusFilter, setStatusFilter] = useState<string | undefined>();

  // 搜索相关
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState<any[]>([]);
  const [searching, setSearching] = useState(false);

  // 模态框相关
  const [addModalVisible, setAddModalVisible] = useState(false);
  const [editModalVisible, setEditModalVisible] = useState(false);
  const [currentQuestion, setCurrentQuestion] = useState<WrongQuestion | null>(null);
  const [form] = Form.useForm();
  const [editForm] = Form.useForm();

  useEffect(() => {
    loadWrongQuestions();
  }, [page, pageSize, statusFilter]);

  const loadWrongQuestions = async () => {
    setLoading(true);
    try {
      const res = await getWrongQuestions(page, pageSize, statusFilter);
      setWrongQuestions(res.items);
      setTotal(res.total);
    } catch (error) {
      message.error('加载错题失败');
    } finally {
      setLoading(false);
    }
  };

  const handleSearch = async () => {
    if (!searchQuery.trim()) {
      message.warning('请输入搜索内容');
      return;
    }
    setSearching(true);
    try {
      const res = await searchQuestions(searchQuery);
      setSearchResults(res.results || []);
    } catch (error) {
      message.error('搜索失败');
    } finally {
      setSearching(false);
    }
  };

  const handleAddWrongQuestion = async (values: any) => {
    try {
      await addWrongQuestion({
        question_text: values.question_text,
        original_answer: values.original_answer,
        correct_answer: values.correct_answer,
        analysis: values.analysis,
        knowledge_points: values.knowledge_points?.split(',').map((k: string) => k.trim()),
        difficulty: values.difficulty || 1,
      });
      message.success('添加成功');
      setAddModalVisible(false);
      form.resetFields();
      loadWrongQuestions();
    } catch (error) {
      message.error('添加失败');
    }
  };

  const handleEditWrongQuestion = async (values: any) => {
    if (!currentQuestion) return;
    try {
      await updateWrongQuestion(currentQuestion.id, {
        original_answer: values.original_answer,
        correct_answer: values.correct_answer,
        analysis: values.analysis,
        status: values.status,
      });
      message.success('更新成功');
      setEditModalVisible(false);
      editForm.resetFields();
      loadWrongQuestions();
    } catch (error) {
      message.error('更新失败');
    }
  };

  const handleDeleteWrongQuestion = async (id: string) => {
    try {
      await deleteWrongQuestion(id);
      message.success('删除成功');
      loadWrongQuestions();
    } catch (error) {
      message.error('删除失败');
    }
  };

  const openEditModal = (question: WrongQuestion) => {
    setCurrentQuestion(question);
    editForm.setFieldsValue({
      original_answer: question.original_answer,
      correct_answer: question.correct_answer,
      analysis: question.analysis,
      status: question.status,
    });
    setEditModalVisible(true);
  };

  const getStatusTag = (status: string) => {
    switch (status) {
      case 'NEW':
        return <Tag icon={<WarningOutlined />} color="warning">新错题</Tag>;
      case 'REVIEWING':
        return <Tag icon={<ClockCircleOutlined />} color="processing">复习中</Tag>;
      case 'MASTERED':
        return <Tag icon={<CheckCircleOutlined />} color="success">已掌握</Tag>;
      default:
        return <Tag>{status}</Tag>;
    }
  };

  return (
    <div>
      <h2>搜题错题</h2>

      <Tabs activeKey={activeTab} onChange={setActiveTab}>
        <TabPane tab="错题本" key="wrong-book">
          <Card
            title="我的错题"
            extra={
              <Space>
                <Select
                  placeholder="状态筛选"
                  allowClear
                  style={{ width: 120 }}
                  value={statusFilter}
                  onChange={(val) => {
                    setStatusFilter(val);
                    setPage(1);
                  }}
                >
                  <Option value="NEW">新错题</Option>
                  <Option value="REVIEWING">复习中</Option>
                  <Option value="MASTERED">已掌握</Option>
                </Select>
                <Button type="primary" icon={<PlusOutlined />} onClick={() => setAddModalVisible(true)}>
                  添加错题
                </Button>
              </Space>
            }
          >
            <Spin spinning={loading}>
              {wrongQuestions.length === 0 ? (
                <Empty description="暂无错题" />
              ) : (
                <>
                  <List
                    dataSource={wrongQuestions}
                    renderItem={(item) => (
                      <List.Item
                        actions={[
                          <Button
                            type="link"
                            icon={<EditOutlined />}
                            onClick={() => openEditModal(item)}
                          >
                            编辑
                          </Button>,
                          <Popconfirm
                            title="确定删除这道错题吗？"
                            onConfirm={() => handleDeleteWrongQuestion(item.id)}
                            okText="确定"
                            cancelText="取消"
                          >
                            <Button type="link" danger icon={<DeleteOutlined />}>
                              删除
                            </Button>
                          </Popconfirm>,
                        ]}
                      >
                        <List.Item.Meta
                          title={
                            <Space>
                              {getStatusTag(item.status)}
                              <Text strong>{item.question_text}</Text>
                            </Space>
                          }
                          description={
                            <Space direction="vertical" size={4} style={{ width: '100%' }}>
                              {item.original_answer && (
                                <div>
                                  <Text type="secondary">我的答案：</Text>
                                  <Text type="danger">{item.original_answer}</Text>
                                </div>
                              )}
                              {item.correct_answer && (
                                <div>
                                  <Text type="secondary">正确答案：</Text>
                                  <Text type="success">{item.correct_answer}</Text>
                                </div>
                              )}
                              {item.analysis && (
                                <Paragraph ellipsis={{ rows: 2, expandable: true }}>
                                  <Text type="secondary">解析：</Text>
                                  {item.analysis}
                                </Paragraph>
                              )}
                              <Space>
                                <Text type="secondary">难度：</Text>
                                <Rate disabled value={item.difficulty} count={3} />
                                {item.knowledge_points && item.knowledge_points.length > 0 && (
                                  <>
                                    <Text type="secondary">知识点：</Text>
                                    {item.knowledge_points.map((kp, idx) => (
                                      <Tag key={idx} color="blue">
                                        {kp}
                                      </Tag>
                                    ))}
                                  </>
                                )}
                                <Text type="secondary" style={{ fontSize: 12 }}>
                                  创建于 {new Date(item.created_at).toLocaleDateString()}
                                </Text>
                              </Space>
                            </Space>
                          }
                        />
                      </List.Item>
                    )}
                  />
                  <div style={{ textAlign: 'right', marginTop: 16 }}>
                    <Pagination
                      current={page}
                      pageSize={pageSize}
                      total={total}
                      showSizeChanger
                      showTotal={(total) => `共 ${total} 条`}
                      onChange={(p, ps) => {
                        setPage(p);
                        setPageSize(ps);
                      }}
                    />
                  </div>
                </>
              )}
            </Spin>
          </Card>
        </TabPane>

        <TabPane tab="搜题" key="search">
          <Card title="搜索题目">
            <Space.Compact style={{ width: '100%', marginBottom: 16 }}>
              <Input
                placeholder="输入题目关键词搜索..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                onPressEnter={handleSearch}
                size="large"
              />
              <Button
                type="primary"
                icon={<SearchOutlined />}
                size="large"
                loading={searching}
                onClick={handleSearch}
              >
                搜索
              </Button>
            </Space.Compact>

            <Spin spinning={searching}>
              {searchResults.length === 0 ? (
                <Empty description="输入关键词搜索题目" />
              ) : (
                <List
                  dataSource={searchResults}
                  renderItem={(item: any) => (
                    <List.Item
                      actions={[
                        <Button
                          type="primary"
                          size="small"
                          onClick={() => {
                            form.setFieldsValue({ question_text: item.question });
                            setAddModalVisible(true);
                          }}
                        >
                          加入错题本
                        </Button>,
                      ]}
                    >
                      <List.Item.Meta
                        title={item.question}
                        description={
                          <Space>
                            <Tag color="blue">{item.source}</Tag>
                            <Text type="secondary">相似度：{(item.score * 100).toFixed(0)}%</Text>
                          </Space>
                        }
                      />
                    </List.Item>
                  )}
                />
              )}
            </Spin>
          </Card>
        </TabPane>
      </Tabs>

      {/* 添加错题模态框 */}
      <Modal
        title="添加错题"
        open={addModalVisible}
        onCancel={() => {
          setAddModalVisible(false);
          form.resetFields();
        }}
        footer={null}
      >
        <Form form={form} layout="vertical" onFinish={handleAddWrongQuestion}>
          <Form.Item
            name="question_text"
            label="题目内容"
            rules={[{ required: true, message: '请输入题目内容' }]}
          >
            <TextArea rows={4} placeholder="输入题目内容..." />
          </Form.Item>
          <Form.Item name="original_answer" label="我的答案">
            <TextArea rows={2} placeholder="输入你的答案..." />
          </Form.Item>
          <Form.Item name="correct_answer" label="正确答案">
            <TextArea rows={2} placeholder="输入正确答案..." />
          </Form.Item>
          <Form.Item name="analysis" label="解析">
            <TextArea rows={3} placeholder="输入题目解析..." />
          </Form.Item>
          <Form.Item name="knowledge_points" label="知识点">
            <Input placeholder="多个知识点用逗号分隔，如：TCP, 三次握手, 网络协议" />
          </Form.Item>
          <Form.Item name="difficulty" label="难度">
            <Rate count={3} />
          </Form.Item>
          <Form.Item>
            <Space style={{ width: '100%', justifyContent: 'flex-end' }}>
              <Button onClick={() => setAddModalVisible(false)}>取消</Button>
              <Button type="primary" htmlType="submit">
                添加
              </Button>
            </Space>
          </Form.Item>
        </Form>
      </Modal>

      {/* 编辑错题模态框 */}
      <Modal
        title="编辑错题"
        open={editModalVisible}
        onCancel={() => {
          setEditModalVisible(false);
          editForm.resetFields();
        }}
        footer={null}
      >
        <Form form={editForm} layout="vertical" onFinish={handleEditWrongQuestion}>
          <Form.Item name="original_answer" label="我的答案">
            <TextArea rows={2} />
          </Form.Item>
          <Form.Item name="correct_answer" label="正确答案">
            <TextArea rows={2} />
          </Form.Item>
          <Form.Item name="analysis" label="解析">
            <TextArea rows={3} />
          </Form.Item>
          <Form.Item name="status" label="状态">
            <Select>
              <Option value="NEW">新错题</Option>
              <Option value="REVIEWING">复习中</Option>
              <Option value="MASTERED">已掌握</Option>
            </Select>
          </Form.Item>
          <Form.Item>
            <Space style={{ width: '100%', justifyContent: 'flex-end' }}>
              <Button onClick={() => setEditModalVisible(false)}>取消</Button>
              <Button type="primary" htmlType="submit">
                保存
              </Button>
            </Space>
          </Form.Item>
        </Form>
      </Modal>
    </div>
  );
}
