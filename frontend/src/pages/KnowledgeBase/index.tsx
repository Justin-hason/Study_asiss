import { useCallback, useEffect, useState } from 'react';
import { Button, Card, Empty, message, Tabs, Input, Table, Modal, Descriptions, Badge, Space, Tag, Typography, List } from 'antd';
import { BookOutlined, CloudDownloadOutlined, EyeOutlined, ApartmentOutlined } from '@ant-design/icons';
import DocumentPreviewModal from '../../components/DocumentPreviewModal';
import MarkdownRenderer from '../../components/MarkdownRenderer';
import { getPrivateKnowledge, getPublicDocuments, getPublicDocument, previewPublicDocument, recordDownload, type KnowledgeExtraction, type PublicDocument } from '../../api/share';
import { getKnowledgeReport, getKnowledgeReports, getPublicKnowledgeReport, getPublicKnowledgeReports, recordPublicKnowledgeReportDownload, type KnowledgeReport, type PublicKnowledgeReport } from '../../api/knowledgeReports';

const { Search } = Input;
const { Title, Text } = Typography;

function getErrorMessage(error: unknown): string {
  if (typeof error === 'object' && error !== null && 'response' in error) {
    const response = (error as { response?: { data?: { detail?: string; error?: { message?: string } } } }).response;
    return response?.data?.detail || response?.data?.error?.message || '操作失败';
  }
  return error instanceof Error ? error.message : '操作失败';
}

function renderStatus(status: KnowledgeReport['status']) {
  const mapping = {
    COMPLETED: { badge: 'success' as const, text: '已完成' },
    PROCESSING: { badge: 'processing' as const, text: '处理中' },
    FAILED: { badge: 'error' as const, text: '失败' },
    PENDING: { badge: 'warning' as const, text: '待处理' },
  };
  const currentStatus = mapping[status] || mapping.PENDING;
  return <Badge status={currentStatus.badge} text={currentStatus.text} />;
}

export default function KnowledgeBasePage() {
  const [privateKnowledge, setPrivateKnowledge] = useState<KnowledgeExtraction[]>([]);
  const [privateTotal, setPrivateTotal] = useState(0);
  const [privatePage, setPrivatePage] = useState(1);
  const [privateReports, setPrivateReports] = useState<KnowledgeReport[]>([]);
  const [privateReportTotal, setPrivateReportTotal] = useState(0);
  const [privateReportPage, setPrivateReportPage] = useState(1);
  const [publicDocs, setPublicDocs] = useState<PublicDocument[]>([]);
  const [publicTotal, setPublicTotal] = useState(0);
  const [publicPage, setPublicPage] = useState(1);
  const [publicReports, setPublicReports] = useState<PublicKnowledgeReport[]>([]);
  const [publicReportTotal, setPublicReportTotal] = useState(0);
  const [publicReportPage, setPublicReportPage] = useState(1);
  const [keyword, setKeyword] = useState('');
  const [detailModal, setDetailModal] = useState(false);
  const [reportDetailModal, setReportDetailModal] = useState(false);
  const [selectedDoc, setSelectedDoc] = useState<PublicDocument | null>(null);
  const [selectedReport, setSelectedReport] = useState<KnowledgeReport | PublicKnowledgeReport | null>(null);
  const [previewOpen, setPreviewOpen] = useState(false);
  const [previewBlob, setPreviewBlob] = useState<Blob | null>(null);
  const [previewLoading, setPreviewLoading] = useState(false);
  const [previewError, setPreviewError] = useState<string | null>(null);
  const [previewTitle, setPreviewTitle] = useState('文档预览');
  const [previewMimeType, setPreviewMimeType] = useState('');

  const loadPrivateKnowledge = useCallback(async (page = 1, kw = keyword) => {
    try {
      const res = await getPrivateKnowledge(kw || undefined, page, 20);
      setPrivateKnowledge(res.items);
      setPrivateTotal(res.total);
      setPrivatePage(page);
    } catch {
      message.error('加载私有知识库失败');
    }
  }, [keyword]);

  const loadPrivateReports = useCallback(async (page = 1, kw = keyword) => {
    try {
      const res = await getKnowledgeReports(true, kw || undefined, page, 20);
      setPrivateReports(res.items);
      setPrivateReportTotal(res.total);
      setPrivateReportPage(page);
    } catch {
      message.error('加载私有报告失败');
    }
  }, [keyword]);

  const loadPublicDocs = useCallback(async (page = 1, kw = keyword) => {
    try {
      const res = await getPublicDocuments(kw || undefined, page, 20);
      setPublicDocs(res.items);
      setPublicTotal(res.total);
      setPublicPage(page);
    } catch {
      message.error('加载公共知识库失败');
    }
  }, [keyword]);

  const loadPublicReports = useCallback(async (page = 1, kw = keyword) => {
    try {
      const res = await getPublicKnowledgeReports(kw || undefined, page, 20);
      setPublicReports(res.items);
      setPublicReportTotal(res.total);
      setPublicReportPage(page);
    } catch {
      message.error('加载公共报告失败');
    }
  }, [keyword]);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      void loadPrivateKnowledge();
      void loadPrivateReports();
      void loadPublicDocs();
      void loadPublicReports();
    }, 0);

    return () => window.clearTimeout(timer);
  }, [loadPrivateKnowledge, loadPrivateReports, loadPublicDocs, loadPublicReports]);

  const handleViewDetail = async (docId: string) => {
    try {
      const doc = await getPublicDocument(docId);
      setSelectedDoc(doc);
      setDetailModal(true);
    } catch {
      message.error('加载详情失败');
    }
  };

  const handlePreviewDocument = async (record: PublicDocument) => {
    setPreviewOpen(true);
    setPreviewTitle(record.title);
    setPreviewBlob(null);
    setPreviewError(null);
    setPreviewLoading(true);
    setPreviewMimeType(record.file_type || '');

    try {
      const blob = await previewPublicDocument(record.id);
      setPreviewBlob(blob);
      setPreviewMimeType(blob.type || record.file_type || '');
    } catch (error: unknown) {
      setPreviewError(getErrorMessage(error));
    } finally {
      setPreviewLoading(false);
    }
  };

  const handleViewPrivateReport = async (reportId: string) => {
    try {
      const report = await getKnowledgeReport(reportId);
      setSelectedReport(report);
      setReportDetailModal(true);
    } catch {
      message.error('加载报告详情失败');
    }
  };

  const handleViewReportDetail = async (reportId: string) => {
    try {
      const report = await getPublicKnowledgeReport(reportId);
      setSelectedReport(report);
      setReportDetailModal(true);
    } catch {
      message.error('加载报告详情失败');
    }
  };

  const handleDownload = async (docId: string) => {
    try {
      await recordDownload(docId);
      message.success('下载已记录');
    } catch {
      message.error('记录失败');
    }
  };

  const handleReportDownload = async (reportId: string) => {
    try {
      await recordPublicKnowledgeReportDownload(reportId);
      message.success('下载已记录');
    } catch {
      message.error('记录失败');
    }
  };

  const privateColumns = [
    { title: '文档名称', dataIndex: 'doc_name', key: 'doc_name', ellipsis: true },
    { title: '摘要', dataIndex: 'summary', key: 'summary', ellipsis: true },
    {
      title: '状态',
      dataIndex: 'status',
      key: 'status',
      render: (statusValue: string) => (
        <Badge status={statusValue === 'COMPLETED' ? 'success' : statusValue === 'PROCESSING' ? 'processing' : 'error'} text={statusValue === 'COMPLETED' ? '已完成' : statusValue === 'PROCESSING' ? '处理中' : '失败'} />
      ),
    },
    { title: '创建时间', dataIndex: 'created_at', key: 'created_at', render: (value: string) => new Date(value).toLocaleString('zh-CN') },
  ];

  const privateReportColumns = [
    { title: '标题', dataIndex: 'title', key: 'title', ellipsis: true },
    { title: '来源文档', dataIndex: 'doc_names', key: 'doc_names', render: (docNames: string[]) => <Space wrap>{docNames.map((docName) => <Tag key={docName}>{docName}</Tag>)}</Space> },
    { title: '状态', dataIndex: 'status', key: 'status', render: renderStatus },
    { title: '加入时间', dataIndex: 'saved_at', key: 'saved_at', render: (value?: string | null) => value ? new Date(value).toLocaleString('zh-CN') : '-' },
    {
      title: '操作',
      key: 'action',
      render: (_: unknown, record: KnowledgeReport) => (
        <Button size="small" icon={<EyeOutlined />} onClick={() => handleViewPrivateReport(record.id)}>
          预览报告
        </Button>
      ),
    },
  ];

  const publicColumns = [
    { title: '标题', dataIndex: 'title', key: 'title', ellipsis: true },
    { title: '描述', dataIndex: 'description', key: 'description', ellipsis: true },
    {
      title: '上传者',
      dataIndex: 'uploader',
      key: 'uploader',
      render: (uploader: { username: string }) => uploader?.username || '-',
    },
    { title: '浏览', dataIndex: 'view_count', key: 'view_count' },
    { title: '下载', dataIndex: 'download_count', key: 'download_count' },
    {
      title: '操作',
      key: 'action',
      render: (_: unknown, record: PublicDocument) => (
        <Space>
          <Button size="small" icon={<EyeOutlined />} onClick={() => handlePreviewDocument(record)} disabled={!record.preview_available}>
            在线预览
          </Button>
          <Button size="small" onClick={() => handleViewDetail(record.id)}>
            查看详情
          </Button>
        </Space>
      ),
    },
  ];

  const publicReportColumns = [
    { title: '标题', dataIndex: 'title', key: 'title', ellipsis: true },
    { title: '摘要', dataIndex: 'summary', key: 'summary', ellipsis: true },
    { title: '来源文档', dataIndex: 'doc_names', key: 'doc_names', render: (docNames: string[]) => <Space wrap>{docNames.map((docName) => <Tag key={docName}>{docName}</Tag>)}</Space> },
    { title: '浏览', dataIndex: 'view_count', key: 'view_count' },
    { title: '下载', dataIndex: 'download_count', key: 'download_count' },
    {
      title: '操作',
      key: 'action',
      render: (_: unknown, record: PublicKnowledgeReport) => (
        <Button size="small" icon={<EyeOutlined />} onClick={() => handleViewReportDetail(record.id)}>
          预览报告
        </Button>
      ),
    },
  ];

  return (
    <div>
      <Card
        title="知识库"
        extra={<Search placeholder="搜索关键词" onSearch={(value) => {
          setKeyword(value);
          loadPublicDocs(1, value);
          loadPublicReports(1, value);
          loadPrivateKnowledge(1, value);
          loadPrivateReports(1, value);
        }} style={{ width: 200 }} />}
      >
        <Tabs
          defaultActiveKey="private-knowledge"
          onChange={(key) => {
            if (key === 'private-knowledge') loadPrivateKnowledge();
            if (key === 'private-report') loadPrivateReports();
            if (key === 'public-docs') loadPublicDocs();
            if (key === 'public-reports') loadPublicReports();
          }}
        >
          <Tabs.TabPane tab={<span><BookOutlined />私有知识提炼</span>} key="private-knowledge">
            {privateKnowledge.length === 0 ? (
              <Empty description="暂无私有知识" />
            ) : (
              <Table
                columns={privateColumns}
                dataSource={privateKnowledge}
                rowKey="id"
                pagination={{ current: privatePage, total: privateTotal, pageSize: 20, onChange: (pageNum) => loadPrivateKnowledge(pageNum) }}
              />
            )}
          </Tabs.TabPane>

          <Tabs.TabPane tab={<span><ApartmentOutlined />私有报告</span>} key="private-report">
            {privateReports.length === 0 ? (
              <Empty description="暂无已加入知识库的报告" />
            ) : (
              <Table
                columns={privateReportColumns}
                dataSource={privateReports}
                rowKey="id"
                pagination={{ current: privateReportPage, total: privateReportTotal, pageSize: 20, onChange: (pageNum) => loadPrivateReports(pageNum) }}
              />
            )}
          </Tabs.TabPane>

          <Tabs.TabPane tab={<span><CloudDownloadOutlined />公共文档</span>} key="public-docs">
            {publicDocs.length === 0 ? (
              <Empty description="暂无公共知识" />
            ) : (
              <Table
                columns={publicColumns}
                dataSource={publicDocs}
                rowKey="id"
                pagination={{ current: publicPage, total: publicTotal, pageSize: 20, onChange: (pageNum) => loadPublicDocs(pageNum) }}
              />
            )}
          </Tabs.TabPane>

          <Tabs.TabPane tab={<span><ApartmentOutlined />公共报告</span>} key="public-reports">
            {publicReports.length === 0 ? (
              <Empty description="暂无公共报告" />
            ) : (
              <Table
                columns={publicReportColumns}
                dataSource={publicReports}
                rowKey="id"
                pagination={{ current: publicReportPage, total: publicReportTotal, pageSize: 20, onChange: (pageNum) => loadPublicReports(pageNum) }}
              />
            )}
          </Tabs.TabPane>
        </Tabs>
      </Card>

      <Modal
        title="文档详情"
        open={detailModal}
        onCancel={() => setDetailModal(false)}
        footer={[
          <Button key="download" type="primary" icon={<CloudDownloadOutlined />} onClick={() => selectedDoc && handleDownload(selectedDoc.id)}>
            记录下载
          </Button>,
        ]}
        width={700}
      >
        {selectedDoc && (
          <Descriptions column={2} bordered>
            <Descriptions.Item label="标题" span={2}>{selectedDoc.title}</Descriptions.Item>
            <Descriptions.Item label="描述" span={2}>{selectedDoc.description || '无'}</Descriptions.Item>
            <Descriptions.Item label="文件类型">{selectedDoc.file_type}</Descriptions.Item>
            <Descriptions.Item label="文件大小">{selectedDoc.file_size ? `${(selectedDoc.file_size / 1024).toFixed(1)} KB` : '-'}</Descriptions.Item>
            <Descriptions.Item label="上传者">{selectedDoc.uploader?.username}</Descriptions.Item>
            <Descriptions.Item label="浏览次数">{selectedDoc.view_count}</Descriptions.Item>
            <Descriptions.Item label="下载次数">{selectedDoc.download_count}</Descriptions.Item>
            <Descriptions.Item label="上传时间" span={2}>{new Date(selectedDoc.created_at).toLocaleString('zh-CN')}</Descriptions.Item>
            <Descriptions.Item label="提炼知识" span={2}>{selectedDoc.extracted_knowledge || '无'}</Descriptions.Item>
          </Descriptions>
        )}
      </Modal>

      <Modal
        title="报告预览"
        open={reportDetailModal}
        onCancel={() => setReportDetailModal(false)}
        footer={('uploader' in (selectedReport || {})) ? [
          <Button key="download" type="primary" icon={<CloudDownloadOutlined />} onClick={() => selectedReport && 'id' in selectedReport && handleReportDownload(selectedReport.id)}>
            记录下载
          </Button>,
        ] : null}
        width={860}
      >
        {selectedReport && (
          <Space direction="vertical" size="large" style={{ width: '100%' }}>
            <Descriptions bordered column={2}>
              <Descriptions.Item label="标题" span={2}>{selectedReport.title}</Descriptions.Item>
              <Descriptions.Item label="来源文档" span={2}>
                <Space wrap>
                  {selectedReport.doc_names.map((docName) => <Tag key={docName}>{docName}</Tag>)}
                </Space>
              </Descriptions.Item>
              {'status' in selectedReport ? <Descriptions.Item label="状态">{renderStatus(selectedReport.status)}</Descriptions.Item> : null}
              {'uploader' in selectedReport ? <Descriptions.Item label="分享者">{selectedReport.uploader?.username || '-'}</Descriptions.Item> : null}
              {'view_count' in selectedReport ? <Descriptions.Item label="浏览次数">{selectedReport.view_count}</Descriptions.Item> : null}
              <Descriptions.Item label="创建时间" span={2}>{new Date(selectedReport.created_at).toLocaleString('zh-CN')}</Descriptions.Item>
              {'summary' in selectedReport ? <Descriptions.Item label="摘要" span={2}>{selectedReport.summary || '暂无摘要'}</Descriptions.Item> : null}
            </Descriptions>

            {'content' in selectedReport && selectedReport.content ? (
              <Space direction="vertical" size="middle" style={{ width: '100%' }}>
                <div>
                  <Title level={5}>总体概览</Title>
                  <Text>{selectedReport.content.overview || '暂无'}</Text>
                </div>
                <div>
                  <Title level={5}>知识体系</Title>
                  {(selectedReport.content.knowledge_system && selectedReport.content.knowledge_system.length > 0) ? (
                    <List
                      bordered
                      dataSource={selectedReport.content.knowledge_system}
                      renderItem={(item) => (
                        <List.Item>
                          <Space direction="vertical" size={4} style={{ width: '100%' }}>
                            <Text strong>{item.topic}</Text>
                            <Text>{item.description || '暂无描述'}</Text>
                            <Space wrap>
                              {(item.subtopics || []).map((subtopic) => <Tag key={`${item.topic}-${subtopic}`}>{subtopic}</Tag>)}
                            </Space>
                          </Space>
                        </List.Item>
                      )}
                    />
                  ) : <Text type="secondary">暂无</Text>}
                </div>
              </Space>
            ) : null}

            {'markdown_content' in selectedReport && selectedReport.markdown_content ? (
              <div>
                <Title level={5}>报告内容（Markdown渲染）</Title>
                <MarkdownRenderer content={selectedReport.markdown_content} />
              </div>
            ) : null}
          </Space>
        )}
      </Modal>

      <DocumentPreviewModal
        open={previewOpen}
        title={previewTitle}
        blob={previewBlob}
        mimeType={previewMimeType}
        loading={previewLoading}
        error={previewError}
        onClose={() => {
          setPreviewOpen(false);
          setPreviewBlob(null);
          setPreviewError(null);
          setPreviewMimeType('');
        }}
      />
    </div>
  );
}
