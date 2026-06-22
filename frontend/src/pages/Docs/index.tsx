import { useCallback, useEffect, useState } from 'react';
import { Button, Card, Empty, Popconfirm, Space, Table, Tag, Tooltip, message, Badge, Typography, Row, Col, Statistic } from 'antd';
import { CheckOutlined, CloseOutlined, EyeOutlined, FilePdfOutlined, FileWordOutlined, FilePptOutlined, FileMarkdownOutlined, FileOutlined, ClockCircleOutlined, CheckCircleOutlined, CloseCircleOutlined, InboxOutlined } from '@ant-design/icons';
import DocumentPreviewModal from '../../components/DocumentPreviewModal';
import { listPendingDocuments, previewPendingDocument, reviewDocument, type PendingDocument } from '../../api/admin';

const { Text, Title } = Typography;

function getErrorMessage(error: unknown): string {
  if (typeof error === 'object' && error !== null && 'response' in error) {
    const response = (error as { response?: { data?: { detail?: string; error?: { message?: string } } } }).response;
    return response?.data?.detail || response?.data?.error?.message || '操作失败';
  }
  return error instanceof Error ? error.message : '操作失败';
}

function getFileIcon(mimeType?: string, name?: string) {
  const style = { fontSize: 20 };
  const lowerName = name?.toLowerCase() || '';

  if (mimeType?.includes('pdf') || lowerName.endsWith('.pdf')) {
    return <FilePdfOutlined style={{ ...style, color: '#ff4d4f' }} />;
  }
  if (mimeType?.includes('word') || mimeType?.includes('document') || lowerName.endsWith('.doc') || lowerName.endsWith('.docx')) {
    return <FileWordOutlined style={{ ...style, color: '#1890ff' }} />;
  }
  if (mimeType?.includes('presentation') || mimeType?.includes('powerpoint') || lowerName.endsWith('.ppt') || lowerName.endsWith('.pptx')) {
    return <FilePptOutlined style={{ ...style, color: '#faad14' }} />;
  }
  if (mimeType?.includes('markdown') || lowerName.endsWith('.md') || lowerName.endsWith('.markdown')) {
    return <FileMarkdownOutlined style={{ ...style, color: '#52c41a' }} />;
  }
  return <FileOutlined style={{ ...style, color: '#595959' }} />;
}

function formatFileSize(size: number): string {
  if (size < 1024) return `${size} B`;
  if (size < 1024 * 1024) return `${(size / 1024).toFixed(1)} KB`;
  return `${(size / (1024 * 1024)).toFixed(2)} MB`;
}

export default function DocsPage() {
  const [docs, setDocs] = useState<PendingDocument[]>([]);
  const [loading, setLoading] = useState(true);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [previewOpen, setPreviewOpen] = useState(false);
  const [previewBlob, setPreviewBlob] = useState<Blob | null>(null);
  const [previewLoading, setPreviewLoading] = useState(false);
  const [previewError, setPreviewError] = useState<string | null>(null);
  const [previewMimeType, setPreviewMimeType] = useState('');
  const [previewTitle, setPreviewTitle] = useState('待审核文档预览');

  const loadData = useCallback(async (pageNum: number) => {
    setLoading(true);
    try {
      const res = await listPendingDocuments(pageNum, 20);
      setDocs(res.items);
      setTotal(res.total);
      setPage(pageNum);
    } catch {
      message.error('加载文档列表失败');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      void loadData(page);
    }, 0);
    return () => window.clearTimeout(timer);
  }, [loadData, page]);

  const handlePreview = async (record: PendingDocument) => {
    setPreviewOpen(true);
    setPreviewTitle(record.name);
    setPreviewBlob(null);
    setPreviewError(null);
    setPreviewLoading(true);
    setPreviewMimeType(record.file_type || '');

    try {
      const blob = await previewPendingDocument(record.id);
      setPreviewBlob(blob);
      setPreviewMimeType(blob.type || record.file_type || '');
    } catch (error: unknown) {
      setPreviewError(getErrorMessage(error));
    } finally {
      setPreviewLoading(false);
    }
  };

  const handleReview = async (docId: string, action: 'approve' | 'reject') => {
    try {
      await reviewDocument(docId, {
        action,
        reason: action === 'reject' ? '内容不符合要求' : undefined,
      });
      message.success(action === 'approve' ? '已通过' : '已拒绝');
      await loadData(page);
    } catch {
      message.error('操作失败');
    }
  };

  const stats = {
    total: docs.length,
    pending: docs.filter((d) => d.status.toUpperCase() === 'PENDING').length,
    processed: docs.filter((d) => d.status.toUpperCase() === 'PROCESSED').length,
  };

  const columns = [
    {
      title: '文档名称',
      dataIndex: 'name',
      key: 'name',
      ellipsis: true,
      render: (name: string, record: PendingDocument) => (
        <Space>
          {getFileIcon(record.file_type, record.name)}
          <Text strong>{name}</Text>
        </Space>
      ),
    },
    {
      title: '来源',
      dataIndex: 'source',
      key: 'source',
      width: 120,
      render: (value?: string) => (
        <Tag color="default" style={{ borderRadius: 8, fontSize: 12 }}>{value || '文档上传'}</Tag>
      ),
    },
    {
      title: '上传者',
      dataIndex: 'uploader_name',
      key: 'uploader_name',
      width: 140,
      render: (value?: string) => <Text type="secondary">{value || '-'}</Text>,
    },
    {
      title: '文件类型',
      dataIndex: 'file_type',
      key: 'file_type',
      width: 140,
      render: (value?: string) => <Text type="secondary" style={{ fontSize: 12 }}>{value || '-'}</Text>,
    },
    {
      title: '文件大小',
      dataIndex: 'file_size',
      key: 'file_size',
      width: 120,
      render: (size: number) => <Text type="secondary">{size ? formatFileSize(size) : '-'}</Text>,
    },
    {
      title: '状态',
      dataIndex: 'status',
      key: 'status',
      width: 110,
      render: (status: string) => {
        const normalizedStatus = status.toUpperCase();
        const statusMap: Record<string, { color: string; label: string; icon: React.ReactNode }> = {
          PENDING: { color: 'warning', label: '待审核', icon: <ClockCircleOutlined /> },
          PROCESSED: { color: 'success', label: '已通过', icon: <CheckCircleOutlined /> },
          REJECTED: { color: 'error', label: '已拒绝', icon: <CloseCircleOutlined /> },
        };
        const s = statusMap[normalizedStatus] || { color: 'default', label: status, icon: null };
        return <Badge status={s.color as any} text={s.label} />;
      },
    },
    {
      title: '申请时间',
      dataIndex: 'requested_at',
      key: 'requested_at',
      width: 170,
      render: (value?: string) => (
        <Text type="secondary" style={{ fontSize: 13 }}>{value ? new Date(value).toLocaleString('zh-CN') : '-'}</Text>
      ),
    },
    {
      title: '操作',
      key: 'action',
      width: 200,
      fixed: 'right' as const,
      render: (_: unknown, record: PendingDocument) => (
        <Space size="small">
          <Tooltip title="在线预览">
            <Button
              size="small"
              type="text"
              icon={<EyeOutlined />}
              disabled={!record.preview_available}
              onClick={() => handlePreview(record)}
              style={{ color: record.preview_available ? '#1890ff' : '#bfbfbf' }}
            >
              预览
            </Button>
          </Tooltip>
          <Popconfirm title="确认通过该文档？" onConfirm={() => handleReview(record.id, 'approve')}>
            <Button size="small" type="text" icon={<CheckOutlined />} style={{ color: '#52c41a' }}>
              通过
            </Button>
          </Popconfirm>
          <Popconfirm title="确认拒绝该文档？" onConfirm={() => handleReview(record.id, 'reject')}>
            <Button size="small" type="text" danger icon={<CloseOutlined />}>
              拒绝
            </Button>
          </Popconfirm>
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
              title="待审核总数"
              value={stats.total}
              prefix={<InboxOutlined style={{ color: '#1890ff' }} />}
              valueStyle={{ color: '#1890ff', fontWeight: 600 }}
            />
          </Card>
        </Col>
        <Col xs={24} sm={8}>
          <Card style={{ borderRadius: 12, boxShadow: '0 2px 8px rgba(0,0,0,0.06)' }}>
            <Statistic
              title="待审核"
              value={stats.pending}
              prefix={<ClockCircleOutlined style={{ color: '#faad14' }} />}
              valueStyle={{ color: '#faad14', fontWeight: 600 }}
            />
          </Card>
        </Col>
        <Col xs={24} sm={8}>
          <Card style={{ borderRadius: 12, boxShadow: '0 2px 8px rgba(0,0,0,0.06)' }}>
            <Statistic
              title="已处理"
              value={stats.processed}
              prefix={<CheckCircleOutlined style={{ color: '#52c41a' }} />}
              valueStyle={{ color: '#52c41a', fontWeight: 600 }}
            />
          </Card>
        </Col>
      </Row>

      {/* 文档列表 */}
      <Card
        title={<Title level={4} style={{ margin: 0, fontSize: 18 }}>文档审核管理</Title>}
        style={{ borderRadius: 12, boxShadow: '0 2px 8px rgba(0,0,0,0.06)' }}
        bodyStyle={{ padding: '12px 24px 24px' }}
      >
        {docs.length === 0 && !loading ? (
          <Empty description="暂无待审核文档" image={Empty.PRESENTED_IMAGE_SIMPLE} />
        ) : (
          <Table
            columns={columns}
            dataSource={docs}
            rowKey="id"
            loading={loading}
            pagination={{
              current: page,
              total,
              pageSize: 20,
              onChange: setPage,
              showSizeChanger: false,
              showTotal: (total) => `共 ${total} 条`,
            }}
            scroll={{ x: 1200 }}
            style={{ borderRadius: 8 }}
          />
        )}
      </Card>

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
