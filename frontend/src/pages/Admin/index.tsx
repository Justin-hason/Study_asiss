import { useCallback, useEffect, useState } from 'react';
import { Button, Card, Col, Descriptions, Empty, Form, Input, List, Modal, Popconfirm, Row, Space, Statistic, Table, Tag, Tabs, Typography, Select, message } from 'antd';
import { PlusOutlined, DeleteOutlined, ReloadOutlined, FileProtectOutlined, TeamOutlined, EyeOutlined } from '@ant-design/icons';
import DocumentPreviewModal from '../../components/DocumentPreviewModal';
import MarkdownRenderer from '../../components/MarkdownRenderer';
import {
  getSystemStats,
  rebuildIndex,
  listSensitiveWords,
  addSensitiveWord,
  deleteSensitiveWord,
  listUsers,
  createUser,
  updateUserRole,
  deleteUser,
  previewPendingDocument,
  type SystemStats,
  type User,
} from '../../api/admin';
import { getPendingRequests, approveRequest, rejectRequest, type ShareRequest } from '../../api/share';
import {
  getPendingKnowledgeReportShareRequests,
  approveKnowledgeReportShareRequest,
  rejectKnowledgeReportShareRequest,
  previewPendingKnowledgeReportShareRequest,
  type KnowledgeReport,
  type PendingKnowledgeReportShareRequest,
} from '../../api/knowledgeReports';

const { TabPane } = Tabs;
const { Title, Paragraph, Text } = Typography;

function getErrorMessage(error: unknown): string {
  if (typeof error === 'object' && error !== null && 'response' in error) {
    const response = (error as { response?: { data?: { detail?: string; error?: { message?: string } } } }).response;
    return response?.data?.detail || response?.data?.error?.message || '操作失败';
  }
  return error instanceof Error ? error.message : '操作失败';
}

function renderStringList(items?: string[]) {
  if (!items || items.length === 0) {
    return <Text type="secondary">暂无</Text>;
  }

  return (
    <List
      size="small"
      dataSource={items}
      renderItem={(item) => <List.Item>{item}</List.Item>}
    />
  );
}

export default function AdminPage() {
  const [stats, setStats] = useState<SystemStats | null>(null);
  const [words, setWords] = useState<string[]>([]);
  const [newWord, setNewWord] = useState('');
  const [wordModal, setWordModal] = useState(false);
  const [loading, setLoading] = useState(true);

  const [users, setUsers] = useState<User[]>([]);
  const [userLoading, setUserLoading] = useState(false);
  const [userTotal, setUserTotal] = useState(0);
  const [userPage, setUserPage] = useState(1);
  const [userModal, setUserModal] = useState(false);
  const [createUserForm] = Form.useForm();

  const [pendingRequests, setPendingRequests] = useState<ShareRequest[]>([]);
  const [requestTotal, setRequestTotal] = useState(0);
  const [requestPage, setRequestPage] = useState(1);
  const [pendingReportRequests, setPendingReportRequests] = useState<PendingKnowledgeReportShareRequest[]>([]);
  const [reportRequestTotal, setReportRequestTotal] = useState(0);
  const [reportRequestPage, setReportRequestPage] = useState(1);

  const [docPreviewOpen, setDocPreviewOpen] = useState(false);
  const [docPreviewBlob, setDocPreviewBlob] = useState<Blob | null>(null);
  const [docPreviewLoading, setDocPreviewLoading] = useState(false);
  const [docPreviewError, setDocPreviewError] = useState<string | null>(null);
  const [docPreviewMimeType, setDocPreviewMimeType] = useState('');
  const [docPreviewTitle, setDocPreviewTitle] = useState('文档预览');

  const [reportPreviewOpen, setReportPreviewOpen] = useState(false);
  const [reportPreviewLoading, setReportPreviewLoading] = useState(false);
  const [reportPreviewError, setReportPreviewError] = useState<string | null>(null);
  const [selectedReportPreview, setSelectedReportPreview] = useState<KnowledgeReport | null>(null);

  const loadData = useCallback(async () => {
    try {
      const [systemStats, sensitiveWords] = await Promise.all([getSystemStats(), listSensitiveWords()]);
      setStats(systemStats);
      setWords(sensitiveWords.words);
    } catch {
      message.error('加载数据失败');
    } finally {
      setLoading(false);
    }
  }, []);

  const loadUsers = useCallback(async (page = 1) => {
    setUserLoading(true);
    try {
      const res = await listUsers(page, 20);
      setUsers(res.items);
      setUserTotal(res.total);
      setUserPage(page);
    } catch {
      message.error('加载用户列表失败');
    } finally {
      setUserLoading(false);
    }
  }, []);

  const loadPendingRequests = useCallback(async (page = 1) => {
    try {
      const res = await getPendingRequests(page, 20);
      setPendingRequests(res.items);
      setRequestTotal(res.total);
      setRequestPage(page);
    } catch {
      message.error('加载待审核列表失败');
    }
  }, []);

  const loadPendingReportRequests = useCallback(async (page = 1) => {
    try {
      const res = await getPendingKnowledgeReportShareRequests(page, 20);
      setPendingReportRequests(res.items);
      setReportRequestTotal(res.total);
      setReportRequestPage(page);
    } catch {
      message.error('加载报告待审核列表失败');
    }
  }, []);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      void loadData();
      void loadUsers();
      void loadPendingRequests();
      void loadPendingReportRequests();
    }, 0);

    return () => window.clearTimeout(timer);
  }, [loadData, loadUsers, loadPendingRequests, loadPendingReportRequests]);

  const handleCreateUser = async (values: { username: string; email: string; password: string; role: string }) => {
    try {
      await createUser(values);
      message.success('创建用户成功');
      setUserModal(false);
      createUserForm.resetFields();
      loadUsers(userPage);
    } catch {
      message.error('创建用户失败');
    }
  };

  const handleDeleteUser = async (userId: string) => {
    try {
      await deleteUser(userId);
      message.success('删除用户成功');
      loadUsers(userPage);
    } catch {
      message.error('删除用户失败');
    }
  };

  const handleChangeRole = async (userId: string, role: string) => {
    try {
      await updateUserRole(userId, role);
      message.success('修改角色成功');
      loadUsers(userPage);
    } catch {
      message.error('修改角色失败');
    }
  };

  const handleRebuild = async () => {
    try {
      await rebuildIndex();
      message.success('重建任务已提交');
    } catch {
      message.error('重建失败');
    }
  };

  const handleApprove = async (requestId: string) => {
    try {
      await approveRequest(requestId);
      message.success('审核通过');
      loadPendingRequests(requestPage);
    } catch {
      message.error('操作失败');
    }
  };

  const handleReject = async (requestId: string) => {
    try {
      await rejectRequest(requestId);
      message.success('已拒绝');
      loadPendingRequests(requestPage);
    } catch {
      message.error('操作失败');
    }
  };

  const handleApproveReport = async (requestId: string) => {
    try {
      await approveKnowledgeReportShareRequest(requestId);
      message.success('报告审核通过');
      loadPendingReportRequests(reportRequestPage);
    } catch {
      message.error('操作失败');
    }
  };

  const handleRejectReport = async (requestId: string) => {
    try {
      await rejectKnowledgeReportShareRequest(requestId);
      message.success('报告已拒绝');
      loadPendingReportRequests(reportRequestPage);
    } catch {
      message.error('操作失败');
    }
  };

  const handlePreviewDocument = async (record: ShareRequest) => {
    if (!record.doc_id) {
      message.warning('缺少文档信息，无法预览');
      return;
    }

    setDocPreviewOpen(true);
    setDocPreviewTitle(record.doc_name || record.title || '待审核文档');
    setDocPreviewBlob(null);
    setDocPreviewError(null);
    setDocPreviewLoading(true);
    setDocPreviewMimeType(record.doc_type || '');

    try {
      const blob = await previewPendingDocument(record.doc_id);
      setDocPreviewBlob(blob);
      setDocPreviewMimeType(blob.type || record.doc_type || '');
    } catch (error: unknown) {
      setDocPreviewError(getErrorMessage(error));
    } finally {
      setDocPreviewLoading(false);
    }
  };

  const handlePreviewReport = async (requestId: string) => {
    setReportPreviewOpen(true);
    setSelectedReportPreview(null);
    setReportPreviewError(null);
    setReportPreviewLoading(true);

    try {
      const report = await previewPendingKnowledgeReportShareRequest(requestId);
      setSelectedReportPreview(report);
    } catch (error: unknown) {
      setReportPreviewError(getErrorMessage(error));
    } finally {
      setReportPreviewLoading(false);
    }
  };

  const userColumns = [
    { title: '用户名', dataIndex: 'username', key: 'username' },
    { title: '邮箱', dataIndex: 'email', key: 'email' },
    {
      title: '角色',
      dataIndex: 'role',
      key: 'role',
      render: (role: string, record: User) => (
        <Select value={role} style={{ width: 100 }} onChange={(value) => handleChangeRole(record.id, value)}>
          <Select.Option value="user">普通用户</Select.Option>
          <Select.Option value="auditor">审核员</Select.Option>
          <Select.Option value="admin">管理员</Select.Option>
        </Select>
      ),
    },
    { title: '注册时间', dataIndex: 'created_at', key: 'created_at', render: (value: string) => new Date(value).toLocaleString('zh-CN') },
    {
      title: '操作',
      key: 'action',
      render: (_: unknown, record: User) => (
        <Popconfirm title="确认删除该用户？" onConfirm={() => handleDeleteUser(record.id)}>
          <Button size="small" danger>删除</Button>
        </Popconfirm>
      ),
    },
  ];

  const requestColumns = [
    { title: '分享标题', dataIndex: 'title', key: 'title', ellipsis: true },
    { title: '文档名称', dataIndex: 'doc_name', key: 'doc_name', ellipsis: true },
    { title: '来源', dataIndex: 'source', key: 'source', width: 120, render: (value?: string) => value || '分享申请' },
    { title: '文件大小', dataIndex: 'doc_size', key: 'doc_size', render: (size: number) => (size ? `${(size / 1024).toFixed(1)} KB` : '-') },
    { title: '文件类型', dataIndex: 'doc_type', key: 'doc_type' },
    { title: '描述', dataIndex: 'description', key: 'description', ellipsis: true },
    {
      title: '申请人',
      dataIndex: 'requester',
      key: 'requester',
      render: (requester: { username: string }) => requester?.username || '-',
    },
    {
      title: '申请时间',
      dataIndex: 'requested_at',
      key: 'requested_at',
      render: (value?: string) => new Date(value || '').toLocaleString('zh-CN'),
    },
    {
      title: '操作',
      key: 'action',
      render: (_: unknown, record: ShareRequest) => (
        <Space>
          <Button size="small" icon={<EyeOutlined />} disabled={!record.preview_available} onClick={() => handlePreviewDocument(record)}>
            预览
          </Button>
          <Button size="small" type="primary" onClick={() => handleApprove(record.id)}>通过</Button>
          <Button size="small" danger onClick={() => handleReject(record.id)}>拒绝</Button>
        </Space>
      ),
    },
  ];

  const reportRequestColumns = [
    { title: '报告标题', dataIndex: 'report_title', key: 'report_title', ellipsis: true },
    { title: '来源', dataIndex: 'source', key: 'source', width: 150, render: (value?: string) => value || '知识报告分享申请' },
    { title: '来源文档', dataIndex: 'doc_names', key: 'doc_names', render: (docNames: string[]) => docNames?.join('、') || '-' },
    { title: '摘要', dataIndex: 'summary', key: 'summary', ellipsis: true },
    {
      title: '申请人',
      dataIndex: 'requester',
      key: 'requester',
      render: (requester: { username: string }) => requester?.username || '-',
    },
    {
      title: '申请时间',
      dataIndex: 'requested_at',
      key: 'requested_at',
      render: (value?: string) => new Date(value || '').toLocaleString('zh-CN'),
    },
    {
      title: '操作',
      key: 'action',
      render: (_: unknown, record: PendingKnowledgeReportShareRequest) => (
        <Space>
          <Button size="small" icon={<EyeOutlined />} onClick={() => handlePreviewReport(record.id)}>
            预览
          </Button>
          <Button size="small" type="primary" onClick={() => handleApproveReport(record.id)}>通过</Button>
          <Button size="small" danger onClick={() => handleRejectReport(record.id)}>拒绝</Button>
        </Space>
      ),
    },
  ];

  return (
    <div>
      <h2>管理员后台</h2>

      <Row gutter={[16, 16]} style={{ marginBottom: 24 }}>
        <Col xs={24} sm={12} lg={6}>
          <Card><Statistic title="文档总数" value={stats?.total_documents ?? 0} /></Card>
        </Col>
        <Col xs={24} sm={12} lg={6}>
          <Card><Statistic title="待审核" value={requestTotal + reportRequestTotal} valueStyle={{ color: '#faad14' }} /></Card>
        </Col>
        <Col xs={24} sm={12} lg={6}>
          <Card><Statistic title="活跃用户" value={userTotal} /></Card>
        </Col>
        <Col xs={24} sm={12} lg={6}>
          <Card>
            <Button type="primary" icon={<ReloadOutlined />} onClick={handleRebuild} loading={loading}>
              重建索引
            </Button>
          </Card>
        </Col>
      </Row>

      <Tabs
        defaultActiveKey="users"
        onChange={(key) => {
          if (key === 'users') loadUsers();
          if (key === 'share-review') loadPendingRequests();
          if (key === 'report-share-review') loadPendingReportRequests();
        }}
      >
        <TabPane tab={<span><TeamOutlined />用户管理</span>} key="users">
          <Card title="用户列表" extra={<Button type="primary" icon={<PlusOutlined />} onClick={() => setUserModal(true)}>添加用户</Button>}>
            <Table
              columns={userColumns}
              dataSource={users}
              rowKey="id"
              loading={userLoading}
              pagination={{ current: userPage, total: userTotal, pageSize: 20, onChange: loadUsers }}
            />
          </Card>
        </TabPane>

        <TabPane tab={<span><FileProtectOutlined />文档分享审核</span>} key="share-review">
          <Card title="待审核文档分享请求">
            {pendingRequests.length === 0 ? (
              <Empty description="暂无待审核请求" />
            ) : (
              <Table
                columns={requestColumns}
                dataSource={pendingRequests}
                rowKey="id"
                pagination={{ current: requestPage, total: requestTotal, pageSize: 20, onChange: loadPendingRequests }}
              />
            )}
          </Card>
        </TabPane>

        <TabPane tab={<span><FileProtectOutlined />报告分享审核</span>} key="report-share-review">
          <Card title="待审核报告分享请求">
            {pendingReportRequests.length === 0 ? (
              <Empty description="暂无待审核报告请求" />
            ) : (
              <Table
                columns={reportRequestColumns}
                dataSource={pendingReportRequests}
                rowKey="id"
                pagination={{ current: reportRequestPage, total: reportRequestTotal, pageSize: 20, onChange: loadPendingReportRequests }}
              />
            )}
          </Card>
        </TabPane>

        <TabPane tab={<span><FileProtectOutlined />敏感词管理</span>} key="sensitive">
          <Card title="敏感词列表" extra={<Button type="primary" icon={<PlusOutlined />} onClick={() => setWordModal(true)}>添加敏感词</Button>}>
            {words.length === 0 ? (
              <Empty description="暂无敏感词" />
            ) : (
              <List
                dataSource={words}
                renderItem={(word) => (
                  <List.Item
                    actions={[
                      <Popconfirm key={word} title="确认删除？" onConfirm={() => deleteSensitiveWord(word).then(() => loadData())}>
                        <Button size="small" danger icon={<DeleteOutlined />} />
                      </Popconfirm>,
                    ]}
                  >
                    <Tag color="red">{word}</Tag>
                  </List.Item>
                )}
              />
            )}
          </Card>
        </TabPane>
      </Tabs>

      <Modal title="添加用户" open={userModal} onCancel={() => setUserModal(false)} footer={null}>
        <Form form={createUserForm} onFinish={handleCreateUser} layout="vertical">
          <Form.Item name="username" label="用户名" rules={[{ required: true, message: '请输入用户名' }]}>
            <Input />
          </Form.Item>
          <Form.Item name="email" label="邮箱" rules={[{ required: true, message: '请输入邮箱' }]}>
            <Input type="email" />
          </Form.Item>
          <Form.Item name="password" label="密码" rules={[{ required: true, message: '请输入密码' }]}>
            <Input.Password />
          </Form.Item>
          <Form.Item name="role" label="角色" initialValue="user">
            <Select>
              <Select.Option value="user">普通用户</Select.Option>
              <Select.Option value="auditor">审核员</Select.Option>
              <Select.Option value="admin">管理员</Select.Option>
            </Select>
          </Form.Item>
          <Button type="primary" htmlType="submit" block>创建</Button>
        </Form>
      </Modal>

      <Modal
        title="报告预览"
        open={reportPreviewOpen}
        onCancel={() => {
          setReportPreviewOpen(false);
          setReportPreviewError(null);
          setSelectedReportPreview(null);
        }}
        footer={null}
        width={860}
      >
        {reportPreviewLoading ? <Paragraph>正在加载报告内容…</Paragraph> : null}
        {!reportPreviewLoading && reportPreviewError ? <Paragraph type="danger">{reportPreviewError}</Paragraph> : null}
        {!reportPreviewLoading && !reportPreviewError && selectedReportPreview ? (
          <Space direction="vertical" size="large" style={{ width: '100%' }}>
            <Descriptions bordered column={2}>
              <Descriptions.Item label="标题" span={2}>{selectedReportPreview.title}</Descriptions.Item>
              <Descriptions.Item label="来源文档" span={2}>
                <Space wrap>
                  {selectedReportPreview.doc_names.map((docName) => <Tag key={docName}>{docName}</Tag>)}
                </Space>
              </Descriptions.Item>
              <Descriptions.Item label="创建时间" span={2}>{new Date(selectedReportPreview.created_at).toLocaleString('zh-CN')}</Descriptions.Item>
              <Descriptions.Item label="摘要" span={2}>{selectedReportPreview.summary || '暂无摘要'}</Descriptions.Item>
            </Descriptions>

            {selectedReportPreview.content ? (
              <Space direction="vertical" size="middle" style={{ width: '100%' }}>
                <div>
                  <Title level={5}>总体概览</Title>
                  <Paragraph>{selectedReportPreview.content.overview || '暂无'}</Paragraph>
                </div>
                <div>
                  <Title level={5}>共同概念</Title>
                  {renderStringList(selectedReportPreview.content.common_concepts)}
                </div>
                <div>
                  <Title level={5}>学习路径</Title>
                  {renderStringList(selectedReportPreview.content.learning_path)}
                </div>
              </Space>
            ) : null}

            {selectedReportPreview.markdown_content ? (
              <div>
                <Title level={5}>报告内容（Markdown渲染）</Title>
                <MarkdownRenderer content={selectedReportPreview.markdown_content} />
              </div>
            ) : null}
          </Space>
        ) : null}
      </Modal>

      <DocumentPreviewModal
        open={docPreviewOpen}
        title={docPreviewTitle}
        blob={docPreviewBlob}
        mimeType={docPreviewMimeType}
        loading={docPreviewLoading}
        error={docPreviewError}
        onClose={() => {
          setDocPreviewOpen(false);
          setDocPreviewBlob(null);
          setDocPreviewError(null);
          setDocPreviewMimeType('');
        }}
      />

      <Modal title="添加敏感词" open={wordModal} onOk={() => { addSensitiveWord(newWord).then(() => { setWordModal(false); setNewWord(''); loadData(); }); }} onCancel={() => setWordModal(false)}>
        <Input placeholder="敏感词" value={newWord} onChange={(e) => setNewWord(e.target.value)} />
      </Modal>
    </div>
  );
}
