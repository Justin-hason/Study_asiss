import { useCallback, useEffect, useState } from 'react';
import { Button, Card, Empty, Form, Input, List, message, Modal, Space, Table, Tag, Tooltip, Badge, Typography, Row, Col, Statistic, Divider, Spin } from 'antd';
import { BookOutlined, EyeOutlined, ShareAltOutlined, SaveOutlined, ReloadOutlined, CopyOutlined, CheckCircleOutlined, ClockCircleOutlined, CloseCircleOutlined, InboxOutlined, DeleteOutlined, DownloadOutlined } from '@ant-design/icons';
import MarkdownRenderer from '../../components/MarkdownRenderer';
import {
  getKnowledgeReport,
  getKnowledgeReports,
  getMyKnowledgeReportShareRequests,
  getPublicKnowledgeReport,
  getPublicKnowledgeReports,
  requestKnowledgeReportShare,
  saveKnowledgeReport,
  deleteKnowledgeReport,
  downloadKnowledgeReport,
  downloadPublicReport,
  type KnowledgeReport,
  type KnowledgeReportShareRequest,
  type PublicKnowledgeReport,
} from '../../api/knowledgeReports';

const { Text, Title } = Typography;

function renderStatus(status: KnowledgeReport['status']) {
  const mapping = {
    COMPLETED: { badge: 'success' as const, text: '已完成', icon: <CheckCircleOutlined /> },
    PROCESSING: { badge: 'processing' as const, text: '处理中', icon: <Spin size="small" /> },
    FAILED: { badge: 'error' as const, text: '失败', icon: <CloseCircleOutlined /> },
    PENDING: { badge: 'warning' as const, text: '待处理', icon: <ClockCircleOutlined /> },
  };
  const currentStatus = mapping[status] || mapping.PENDING;
  return (
    <Badge status={currentStatus.badge} text={
      <Space size={4}>
        {currentStatus.icon}
        <Text>{currentStatus.text}</Text>
      </Space>
    } />
  );
}

export default function KnowledgeReportsPage() {
  const [reports, setReports] = useState<KnowledgeReport[]>([]);
  const [reportTotal, setReportTotal] = useState(0);
  const [reportPage, setReportPage] = useState(1);
  const [shareRequests, setShareRequests] = useState<KnowledgeReportShareRequest[]>([]);
  const [publicReports, setPublicReports] = useState<PublicKnowledgeReport[]>([]);
  const [publicTotal, setPublicTotal] = useState(0);
  const [publicPage, setPublicPage] = useState(1);
  const [detailModal, setDetailModal] = useState(false);
  const [selectedReport, setSelectedReport] = useState<KnowledgeReport | PublicKnowledgeReport | null>(null);
  const [selectedPrivateReport, setSelectedPrivateReport] = useState<KnowledgeReport | null>(null);
  const [shareModal, setShareModal] = useState(false);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState('mine');
  const [shareForm] = Form.useForm();

  const loadReports = useCallback(async (page = 1) => {
    setLoading(true);
    try {
      const res = await getKnowledgeReports(false, undefined, page, 20);
      setReports(res.items);
      setReportTotal(res.total);
      setReportPage(page);
    } catch {
      message.error('加载知识报告失败');
    } finally {
      setLoading(false);
    }
  }, []);

  const loadShareRequests = useCallback(async () => {
    try {
      const res = await getMyKnowledgeReportShareRequests();
      setShareRequests(res.items);
    } catch {
      message.error('加载报告分享记录失败');
    }
  }, []);

  const loadPublicReports = useCallback(async (page = 1) => {
    try {
      const res = await getPublicKnowledgeReports(undefined, page, 20);
      setPublicReports(res.items);
      setPublicTotal(res.total);
      setPublicPage(page);
    } catch {
      message.error('加载公共报告失败');
    }
  }, []);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      void loadReports();
      void loadShareRequests();
      void loadPublicReports();
    }, 0);
    return () => window.clearTimeout(timer);
  }, [loadPublicReports, loadReports, loadShareRequests]);

  const handleViewReport = async (reportId: string) => {
    try {
      const report = await getKnowledgeReport(reportId);
      setSelectedReport(report);
      setSelectedPrivateReport(report);
      setDetailModal(true);
    } catch {
      message.error('加载报告详情失败');
    }
  };

  const handleViewPublicReport = async (publicReportId: string) => {
    try {
      const report = await getPublicKnowledgeReport(publicReportId);
      setSelectedReport(report);
      setSelectedPrivateReport(null);
      setDetailModal(true);
    } catch {
      message.error('加载公共报告详情失败');
    }
  };

  const handleSaveReport = async (reportId: string) => {
    try {
      await saveKnowledgeReport(reportId);
      message.success('已加入知识库');
      loadReports(reportPage);
      if (selectedPrivateReport?.id === reportId) {
        const updated = await getKnowledgeReport(reportId);
        setSelectedReport(updated);
        setSelectedPrivateReport(updated);
      }
    } catch {
      message.error('加入知识库失败');
    }
  };

  const handleOpenShareModal = (report: KnowledgeReport) => {
    setSelectedPrivateReport(report);
    shareForm.setFieldsValue({
      title: report.title,
      description: report.summary,
    });
    setShareModal(true);
  };

  const handleShareReport = async (values: { title: string; description?: string }) => {
    if (!selectedPrivateReport) return;
    try {
      await requestKnowledgeReportShare(selectedPrivateReport.id, values.title, values.description);
      message.success('报告分享申请已提交');
      setShareModal(false);
      shareForm.resetFields();
      loadShareRequests();
    } catch {
      message.error('提交分享申请失败');
    }
  };

  const handleCopyMarkdown = () => {
    if (selectedReport?.markdown_content) {
      navigator.clipboard.writeText(selectedReport.markdown_content);
      message.success('Markdown内容已复制');
    }
  };

  const handleDeleteReport = async (reportId: string) => {
    try {
      await deleteKnowledgeReport(reportId);
      message.success('报告已删除');
      loadReports(reportPage);
      if (detailModal) {
        setDetailModal(false);
      }
    } catch {
      message.error('删除报告失败');
    }
  };

  const handleDownloadReport = (reportId: string) => {
    downloadKnowledgeReport(reportId, 'markdown');
    message.success('开始下载报告');
  };

  const handleDownloadPublicReport = (reportId: string) => {
    downloadPublicReport(reportId, 'markdown');
    message.success('开始下载报告');
  };

  const stats = {
    totalReports: reports.length,
    completedReports: reports.filter(r => r.status === 'COMPLETED').length,
    processingReports: reports.filter(r => r.status === 'PROCESSING').length,
    pendingRequests: shareRequests.filter(r => r.status === 'PENDING').length,
    publicCount: publicReports.length,
  };

  const reportColumns = [
    {
      title: '标题',
      dataIndex: 'title',
      key: 'title',
      ellipsis: true,
      render: (title: string) => <Text strong>{title}</Text>,
    },
    {
      title: '来源文档',
      dataIndex: 'doc_names',
      key: 'doc_names',
      width: 200,
      render: (docNames: string[]) => (
        <Space wrap>
          {docNames.map((docName) => (
            <Tag key={docName} color="blue" style={{ borderRadius: 6, fontSize: 12 }}>
              {docName}
            </Tag>
          ))}
        </Space>
      ),
    },
    {
      title: '状态',
      dataIndex: 'status',
      key: 'status',
      width: 120,
      render: renderStatus,
    },
    {
      title: '模型',
      dataIndex: 'model_used',
      key: 'model_used',
      width: 100,
      render: (model?: string) => (
        <Tag color={model ? 'purple' : 'default'} style={{ borderRadius: 6 }}>
          {model || '默认'}
        </Tag>
      ),
    },
    {
      title: '知识库',
      dataIndex: 'is_saved_to_kb',
      key: 'is_saved_to_kb',
      width: 100,
      render: (saved: boolean) => (
        <Badge status={saved ? 'success' : 'default'} text={saved ? '已加入' : '未加入'} />
      ),
    },
    {
      title: '操作',
      key: 'action',
      width: 280,
      render: (_: unknown, record: KnowledgeReport) => (
        <Space size="small">
          <Tooltip title="预览报告">
            <Button size="small" icon={<EyeOutlined />} onClick={() => handleViewReport(record.id)}>
              预览
            </Button>
          </Tooltip>
          <Tooltip title="下载报告">
            <Button
              size="small"
              icon={<DownloadOutlined />}
              disabled={record.status !== 'COMPLETED'}
              onClick={() => handleDownloadReport(record.id)}
            >
              下载
            </Button>
          </Tooltip>
          <Tooltip title="加入知识库">
            <Button
              size="small"
              icon={<SaveOutlined />}
              disabled={record.is_saved_to_kb || record.status !== 'COMPLETED'}
              onClick={() => handleSaveReport(record.id)}
            >
              收藏
            </Button>
          </Tooltip>
          <Tooltip title="申请分享">
            <Button
              size="small"
              icon={<ShareAltOutlined />}
              disabled={record.status !== 'COMPLETED'}
              onClick={() => handleOpenShareModal(record)}
            >
              分享
            </Button>
          </Tooltip>
          <Tooltip title="删除报告">
            <Button
              size="small"
              danger
              icon={<DeleteOutlined />}
              onClick={() => {
                Modal.confirm({
                  title: '确认删除',
                  content: '确定要删除这个报告吗？此操作不可撤销。',
                  okText: '确认删除',
                  okType: 'danger',
                  cancelText: '取消',
                  onOk: () => handleDeleteReport(record.id),
                });
              }}
            >
              删除
            </Button>
          </Tooltip>
        </Space>
      ),
    },
  ];

  const shareRequestColumns = [
    { title: '分享标题', dataIndex: 'title', key: 'title', ellipsis: true },
    { title: '报告', dataIndex: 'report_title', key: 'report_title', ellipsis: true },
    {
      title: '状态',
      dataIndex: 'status',
      key: 'status',
      width: 100,
      render: (statusValue: KnowledgeReportShareRequest['status']) => (
        <Badge
          status={statusValue === 'APPROVED' ? 'success' : statusValue === 'REJECTED' ? 'error' : 'warning'}
          text={
            statusValue === 'PENDING' ? '待审核' :
            statusValue === 'APPROVED' ? '已通过' : '已拒绝'
          }
        />
      ),
    },
    {
      title: '申请时间',
      dataIndex: 'created_at',
      key: 'created_at',
      width: 170,
      render: (value: string) => (
        <Text type="secondary" style={{ fontSize: 13 }}>
          {new Date(value).toLocaleString('zh-CN')}
        </Text>
      ),
    },
  ];

  const publicReportColumns = [
    {
      title: '标题',
      dataIndex: 'title',
      key: 'title',
      ellipsis: true,
      render: (title: string) => <Text strong>{title}</Text>,
    },
    {
      title: '来源文档',
      dataIndex: 'doc_names',
      key: 'doc_names',
      width: 200,
      render: (docNames: string[]) => (
        <Space wrap>
          {docNames.map((docName) => (
            <Tag key={docName} color="blue" style={{ borderRadius: 6, fontSize: 12 }}>
              {docName}
            </Tag>
          ))}
        </Space>
      ),
    },
    {
      title: '分享者',
      dataIndex: ['uploader', 'username'],
      key: 'uploader',
      width: 100,
      render: (username?: string) => <Text type="secondary">{username || '-'}</Text>,
    },
    {
      title: '浏览',
      dataIndex: 'view_count',
      key: 'view_count',
      width: 80,
      render: (count: number) => <Text type="secondary">{count}</Text>,
    },
    {
      title: '下载',
      dataIndex: 'download_count',
      key: 'download_count',
      width: 80,
      render: (count: number) => <Text type="secondary">{count}</Text>,
    },
    {
      title: '操作',
      key: 'action',
      width: 200,
      render: (_: unknown, record: PublicKnowledgeReport) => (
        <Space size="small">
          <Button size="small" icon={<EyeOutlined />} onClick={() => handleViewPublicReport(record.id)}>
            预览
          </Button>
          <Button size="small" icon={<DownloadOutlined />} onClick={() => handleDownloadPublicReport(record.id)}>
            下载
          </Button>
        </Space>
      ),
    },
  ];

  return (
    <div style={{ maxWidth: 1400, margin: '0 auto' }}>
      {/* 统计卡片 */}
      <Row gutter={[16, 16]} style={{ marginBottom: 24 }}>
        <Col xs={24} sm={8}>
          <Card style={{ borderRadius: 12, boxShadow: '0 2px 8px rgba(0,0,0,0.06)' }}>
            <Statistic
              title="报告总数"
              value={stats.totalReports}
              prefix={<BookOutlined style={{ color: '#1890ff' }} />}
              valueStyle={{ color: '#1890ff', fontWeight: 600 }}
            />
          </Card>
        </Col>
        <Col xs={24} sm={8}>
          <Card style={{ borderRadius: 12, boxShadow: '0 2px 8px rgba(0,0,0,0.06)' }}>
            <Statistic
              title="已完成"
              value={stats.completedReports}
              prefix={<CheckCircleOutlined style={{ color: '#52c41a' }} />}
              valueStyle={{ color: '#52c41a', fontWeight: 600 }}
            />
          </Card>
        </Col>
        <Col xs={24} sm={8}>
          <Card style={{ borderRadius: 12, boxShadow: '0 2px 8px rgba(0,0,0,0.06)' }}>
            <Statistic
              title="处理中"
              value={stats.processingReports}
              prefix={<ClockCircleOutlined style={{ color: '#faad14' }} />}
              valueStyle={{ color: '#faad14', fontWeight: 600 }}
            />
          </Card>
        </Col>
      </Row>

      {/* Tab切换 */}
      <Card style={{ borderRadius: 12, boxShadow: '0 2px 8px rgba(0,0,0,0.06)' }}>
        <div style={{ display: 'flex', gap: 8, marginBottom: 24, borderBottom: '1px solid #f0f0f0', paddingBottom: 12 }}>
          {[
            { key: 'mine', label: '我的报告', icon: <BookOutlined /> },
            { key: 'share-requests', label: '分享申请', icon: <ShareAltOutlined /> },
            { key: 'public', label: '公共报告', icon: <InboxOutlined /> },
          ].map((tab) => (
            <Button
              key={tab.key}
              type={activeTab === tab.key ? 'primary' : 'default'}
              onClick={() => setActiveTab(tab.key)}
              icon={tab.icon}
              style={{ borderRadius: 8 }}
            >
              {tab.label}
            </Button>
          ))}
          <div style={{ flex: 1 }} />
          <Button
            icon={<ReloadOutlined />}
            onClick={() => {
              if (activeTab === 'mine') loadReports();
              if (activeTab === 'share-requests') loadShareRequests();
              if (activeTab === 'public') loadPublicReports();
            }}
            style={{ borderRadius: 8 }}
          >
            刷新
          </Button>
        </div>

        {/* 我的报告 */}
        {activeTab === 'mine' && (
          reports.length === 0 ? (
            <Empty description="暂无知识报告" image={Empty.PRESENTED_IMAGE_SIMPLE} />
          ) : (
            <Table
              columns={reportColumns}
              dataSource={reports}
              rowKey="id"
              loading={loading}
              pagination={{
                current: reportPage,
                total: reportTotal,
                pageSize: 20,
                onChange: loadReports,
                showSizeChanger: false,
                showTotal: (total) => `共 ${total} 条`,
              }}
              style={{ borderRadius: 8 }}
            />
          )
        )}

        {/* 分享申请 */}
        {activeTab === 'share-requests' && (
          shareRequests.length === 0 ? (
            <Empty description="暂无报告分享申请" image={Empty.PRESENTED_IMAGE_SIMPLE} />
          ) : (
            <Table
              columns={shareRequestColumns}
              dataSource={shareRequests}
              rowKey="id"
              pagination={false}
              style={{ borderRadius: 8 }}
            />
          )
        )}

        {/* 公共报告 */}
        {activeTab === 'public' && (
          publicReports.length === 0 ? (
            <Empty description="暂无公共报告" image={Empty.PRESENTED_IMAGE_SIMPLE} />
          ) : (
            <Table
              columns={publicReportColumns}
              dataSource={publicReports}
              rowKey="id"
              pagination={{
                current: publicPage,
                total: publicTotal,
                pageSize: 20,
                onChange: loadPublicReports,
                showSizeChanger: false,
                showTotal: (total) => `共 ${total} 条`,
              }}
              style={{ borderRadius: 8 }}
            />
          )
        )}
      </Card>

      {/* 报告详情模态框 */}
      <Modal
        title={selectedReport?.title || '知识报告详情'}
        open={detailModal}
        onCancel={() => setDetailModal(false)}
        footer={selectedPrivateReport ? [
          <Button key="copy" icon={<CopyOutlined />} onClick={handleCopyMarkdown}>
            复制Markdown
          </Button>,
          <Button
            key="save"
            icon={<SaveOutlined />}
            disabled={selectedPrivateReport.is_saved_to_kb || selectedPrivateReport.status !== 'COMPLETED'}
            onClick={() => handleSaveReport(selectedPrivateReport.id)}
          >
            加入知识库
          </Button>,
          <Button
            key="share"
            type="primary"
            icon={<ShareAltOutlined />}
            disabled={selectedPrivateReport.status !== 'COMPLETED'}
            onClick={() => handleOpenShareModal(selectedPrivateReport)}
          >
            申请分享
          </Button>,
        ] : [
          <Button key="copy" icon={<CopyOutlined />} onClick={handleCopyMarkdown}>
            复制Markdown
          </Button>,
        ]}
        width={900}
        bodyStyle={{ padding: 0 }}
      >
        {selectedReport && (
          <div style={{ padding: 24 }}>
            {/* 基本信息 */}
            <div style={{ marginBottom: 24 }}>
              <Row gutter={[16, 12]}>
                <Col span={8}>
                  <Text type="secondary">来源文档</Text>
                  <div style={{ marginTop: 4 }}>
                    <Space wrap>
                      {selectedReport.doc_names.map((docName) => (
                        <Tag key={docName} color="blue">{docName}</Tag>
                      ))}
                    </Space>
                  </div>
                </Col>
                {'status' in selectedReport && (
                  <Col span={8}>
                    <Text type="secondary">状态</Text>
                    <div style={{ marginTop: 4 }}>{renderStatus(selectedReport.status)}</div>
                  </Col>
                )}
                {'model_used' in selectedReport && selectedReport.model_used && (
                  <Col span={8}>
                    <Text type="secondary">使用模型</Text>
                    <div style={{ marginTop: 4 }}>
                      <Tag color="purple">{selectedReport.model_used}</Tag>
                    </div>
                  </Col>
                )}
                {'is_saved_to_kb' in selectedReport && (
                  <Col span={8}>
                    <Text type="secondary">知识库</Text>
                    <div style={{ marginTop: 4 }}>
                      <Badge
                        status={selectedReport.is_saved_to_kb ? 'success' : 'default'}
                        text={selectedReport.is_saved_to_kb ? '已加入' : '未加入'}
                      />
                    </div>
                  </Col>
                )}
                {'uploader' in selectedReport && (
                  <Col span={8}>
                    <Text type="secondary">分享者</Text>
                    <div style={{ marginTop: 4 }}>
                      <Text>{selectedReport.uploader?.username || '-'}</Text>
                    </div>
                  </Col>
                )}
              </Row>
            </div>

            <Divider />

            {/* Markdown报告内容 */}
            {selectedReport.markdown_content ? (
              <div>
                <Title level={4} style={{ marginBottom: 16, fontSize: 16 }}>
                  报告内容（Markdown渲染）
                </Title>
                <MarkdownRenderer content={selectedReport.markdown_content} />
              </div>
            ) : (
              <Empty description="暂无报告内容" />
            )}

            {/* 结构化内容（兼容旧数据） */}
            {selectedReport.content && !selectedReport.markdown_content && (
              <div style={{ marginTop: 24 }}>
                <Title level={4} style={{ marginBottom: 16, fontSize: 16 }}>
                  报告内容（结构化展示）
                </Title>
                <Space direction="vertical" size="middle" style={{ width: '100%' }}>
                  {selectedReport.content.overview && (
                    <Card size="small" title="总体概览" style={{ borderRadius: 8 }}>
                      <Text>{selectedReport.content.overview}</Text>
                    </Card>
                  )}
                  {selectedReport.content.key_points && selectedReport.content.key_points.length > 0 && (
                    <Card size="small" title="关键知识点" style={{ borderRadius: 8 }}>
                      <List
                        dataSource={selectedReport.content.key_points}
                        renderItem={(point, index) => (
                          <List.Item key={index}>
                            <span style={{ color: '#1890ff', marginRight: 8 }}>{index + 1}.</span>
                            {point}
                          </List.Item>
                        )}
                      />
                    </Card>
                  )}
                  {selectedReport.content.learning_path && selectedReport.content.learning_path.length > 0 && (
                    <Card size="small" title="学习路径" style={{ borderRadius: 8 }}>
                      <List
                        dataSource={selectedReport.content.learning_path}
                        renderItem={(step, index) => (
                          <List.Item key={index}>
                            <span style={{ color: '#52c41a', marginRight: 8 }}>步骤 {index + 1}</span>
                            {step}
                          </List.Item>
                        )}
                      />
                    </Card>
                  )}
                </Space>
              </div>
            )}
          </div>
        )}
      </Modal>

      {/* 分享申请模态框 */}
      <Modal
        title="申请分享报告"
        open={shareModal}
        onCancel={() => { setShareModal(false); shareForm.resetFields(); }}
        footer={null}
        destroyOnClose
        width={500}
      >
        <Form form={shareForm} onFinish={handleShareReport} layout="vertical">
          <Form.Item name="title" label="分享标题" rules={[{ required: true, message: '请输入分享标题' }]}>
            <Input placeholder="请输入分享标题" />
          </Form.Item>
          <Form.Item name="description" label="分享描述">
            <Input.TextArea rows={3} placeholder="请输入分享描述" />
          </Form.Item>
          <Button type="primary" htmlType="submit" block style={{ borderRadius: 8 }}>
            提交分享申请
          </Button>
        </Form>
      </Modal>
    </div>
  );
}
