import { useCallback, useEffect, useMemo, useState } from 'react';
import { Button, Card, Empty, message, Modal, Form, Input, Upload, Table, Popconfirm, Tag, Space, Progress, Typography, Badge, Row, Col, Statistic } from 'antd';
import type { TableProps, UploadProps } from 'antd';
import { UploadOutlined, DeleteOutlined, FileOutlined, ApartmentOutlined, EyeOutlined, FileMarkdownOutlined, FilePdfOutlined, FileWordOutlined, FilePptOutlined, FileTextOutlined, ShareAltOutlined, InboxOutlined } from '@ant-design/icons';
import { useNavigate } from 'react-router-dom';
import DocumentPreviewModal from '../../components/DocumentPreviewModal';
import { listDocuments, deleteDocument, previewDocument, uploadDocument, type Document } from '../../api/documents';
import { requestShare, getMyRequests, cancelRequest, type ShareRequest } from '../../api/share';
import { generateKnowledgeReport } from '../../api/knowledgeReports';

const { Dragger } = Upload;
const { Text, Title } = Typography;
const MAX_REPORT_DOCUMENTS = 3;

function getErrorMessage(error: unknown): string {
  if (typeof error === 'object' && error !== null && 'response' in error) {
    const response = (error as { response?: { data?: { detail?: string; error?: { message?: string } } } }).response;
    return response?.data?.detail || response?.data?.error?.message || '操作失败';
  }
  return error instanceof Error ? error.message : '操作失败';
}

function buildDefaultReportTitle(documents: Document[]): string {
  if (documents.length === 1) {
    return `${documents[0].name} 知识体系报告`;
  }
  return `${documents.map((document) => document.name).join(' + ')} 知识体系报告`;
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
  if (mimeType?.includes('text') || lowerName.endsWith('.txt')) {
    return <FileTextOutlined style={{ ...style, color: '#8c8c8c' }} />;
  }
  return <FileOutlined style={{ ...style, color: '#595959' }} />;
}

function formatFileSize(size: number): string {
  if (size < 1024) return `${size} B`;
  if (size < 1024 * 1024) return `${(size / 1024).toFixed(1)} KB`;
  return `${(size / (1024 * 1024)).toFixed(2)} MB`;
}

export default function MyDocsPage() {
  const navigate = useNavigate();
  const [documents, setDocuments] = useState<Document[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(true);
  const [uploadModal, setUploadModal] = useState(false);
  const [shareModal, setShareModal] = useState(false);
  const [reportModal, setReportModal] = useState(false);
  const [myRequests, setMyRequests] = useState<ShareRequest[]>([]);
  const [selectedDoc, setSelectedDoc] = useState<Document | null>(null);
  const [selectedReportIds, setSelectedReportIds] = useState<React.Key[]>([]);
  const [selectedReportDocs, setSelectedReportDocs] = useState<Document[]>([]);
  const [uploading, setUploading] = useState(false);
  const [uploadPercent, setUploadPercent] = useState(0);
  const [uploadStage, setUploadStage] = useState('');
  const [uploadFileName, setUploadFileName] = useState('');
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [generatingReport, setGeneratingReport] = useState(false);
  const [previewOpen, setPreviewOpen] = useState(false);
  const [previewBlob, setPreviewBlob] = useState<Blob | null>(null);
  const [previewLoading, setPreviewLoading] = useState(false);
  const [previewError, setPreviewError] = useState<string | null>(null);
  const [previewTitle, setPreviewTitle] = useState('文档预览');
  const [previewMimeType, setPreviewMimeType] = useState<string>('');
  const [shareForm] = Form.useForm();
  const [reportForm] = Form.useForm();

  const loadDocuments = useCallback(async (pageNum = 1) => {
    setLoading(true);
    try {
      const res = await listDocuments(undefined, pageNum, 20);
      setDocuments(res.items);
      setTotal(res.total);
      setPage(pageNum);
    } catch {
      message.error('加载文档列表失败');
    } finally {
      setLoading(false);
    }
  }, []);

  const loadMyRequests = useCallback(async () => {
    try {
      const res = await getMyRequests();
      setMyRequests(res.items);
    } catch {
      message.error('加载分享记录失败');
    }
  }, []);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      void loadDocuments();
    }, 0);
    return () => window.clearTimeout(timer);
  }, [loadDocuments]);

  const resetUploadState = () => {
    setUploadPercent(0);
    setUploadStage('');
    setUploadFileName('');
    setUploadError(null);
  };

  const handleUpload: UploadProps['customRequest'] = async (options) => {
    const { file, onSuccess, onError, onProgress } = options;
    const uploadFile = file as File;

    setUploading(true);
    setUploadFileName(uploadFile.name);
    setUploadStage('正在上传分片');
    setUploadPercent(0);
    setUploadError(null);

    try {
      const result = await uploadDocument(uploadFile, {
        onProgress: (percent) => {
          const mappedPercent = Math.min(90, Math.round(percent * 0.9));
          setUploadPercent(mappedPercent);
          onProgress?.({ percent: mappedPercent });
        },
        onFinalize: () => {
          setUploadStage('正在合并文件并提交');
          setUploadPercent(95);
          onProgress?.({ percent: 95 });
        },
      });

      setUploadStage(result.preview_available ? '上传完成，可在线预览' : '上传完成');
      setUploadPercent(100);
      onProgress?.({ percent: 100 });
      message.success(result.can_generate_report ? '文件上传成功，可直接生成知识报告' : '文件上传成功');
      await loadDocuments(page);
      window.setTimeout(() => {
        setUploadModal(false);
        resetUploadState();
      }, 400);
      onSuccess?.(result);
    } catch (error: unknown) {
      const detail = getErrorMessage(error);
      setUploadError(detail);
      setUploadStage('上传失败');
      message.error(`上传失败: ${detail}`);
      onError?.(error instanceof Error ? error : new Error(detail));
    } finally {
      setUploading(false);
    }
  };

  const handleDelete = async (docId: string) => {
    try {
      const result = await deleteDocument(docId);
      const cleanupMessages = [
        result.cleanup.share_requests > 0 ? `${result.cleanup.share_requests} 条分享申请` : '',
        result.cleanup.knowledge_extractions > 0 ? `${result.cleanup.knowledge_extractions} 条知识提炼记录` : '',
        result.cleanup.public_documents > 0 ? `${result.cleanup.public_documents} 条公共分享记录` : '',
        result.cleanup.notes > 0 ? `${result.cleanup.notes} 条笔记` : '',
        result.cleanup.outlines > 0 ? `${result.cleanup.outlines} 条大纲` : '',
        result.cleanup.document_versions > 0 ? `${result.cleanup.document_versions} 个历史版本` : '',
        result.cleanup.permissions > 0 ? `${result.cleanup.permissions} 条权限记录` : '',
        result.cleanup.share_links > 0 ? `${result.cleanup.share_links} 条分享链接` : '',
        result.cleanup.tags > 0 ? `${result.cleanup.tags} 个标签关联` : '',
      ].filter(Boolean);

      message.success(cleanupMessages.length > 0 ? `删除成功，同步移除：${cleanupMessages.join('、')}` : '删除成功');
      await loadDocuments(page);
      setSelectedReportIds((currentIds) => currentIds.filter((id) => id !== docId));
      setSelectedReportDocs((currentDocs) => currentDocs.filter((document) => document.id !== docId));
    } catch (error: unknown) {
      message.error(`删除失败: ${getErrorMessage(error)}`);
    }
  };

  const handleOpenPreview = async (document: Document) => {
    setPreviewOpen(true);
    setPreviewTitle(document.name);
    setPreviewMimeType(document.mime_type || '');
    setPreviewBlob(null);
    setPreviewError(null);
    setPreviewLoading(true);

    try {
      const blob = await previewDocument(document.id);
      setPreviewBlob(blob);
      setPreviewMimeType(blob.type || document.mime_type || '');
    } catch (error: unknown) {
      setPreviewError(getErrorMessage(error));
    } finally {
      setPreviewLoading(false);
    }
  };

  const handleShare = async (values: { title: string; description?: string }) => {
    if (!selectedDoc) return;
    try {
      await requestShare(selectedDoc.id, values.title, values.description);
      message.success('分享请求已提交');
      setShareModal(false);
      shareForm.resetFields();
      loadMyRequests();
    } catch {
      message.error('提交失败');
    }
  };

  const handleCancelRequest = async (requestId: string) => {
    try {
      await cancelRequest(requestId);
      message.success('已取消');
      loadMyRequests();
    } catch {
      message.error('取消失败');
    }
  };

  const handleOpenReportModal = () => {
    if (selectedReportDocs.length === 0) {
      message.warning('请先选择文档');
      return;
    }
    reportForm.setFieldsValue({
      title: buildDefaultReportTitle(selectedReportDocs),
      description: '',
    });
    setReportModal(true);
  };

  const handleGenerateReport = async (values: { title?: string; description?: string }) => {
    if (selectedReportIds.length === 0) {
      message.warning('请先选择文档');
      return;
    }

    setGeneratingReport(true);
    try {
      const report = await generateKnowledgeReport({
        doc_ids: selectedReportIds.map(String),
        title: values.title,
        description: values.description,
        model: 'deepseek-chat',
      });
      message.success(report.status === 'COMPLETED' ? '知识体系报告生成成功' : '知识体系报告已创建');
      setReportModal(false);
      reportForm.resetFields();
      setSelectedReportIds([]);
      setSelectedReportDocs([]);
      navigate('/knowledge-reports');
    } catch (error: unknown) {
      message.error(`生成失败: ${getErrorMessage(error)}`);
    } finally {
      setGeneratingReport(false);
    }
  };

  const stats = useMemo(() => {
    const totalDocs = documents.length;
    const processed = documents.filter((d) => d.status === 'PROCESSED').length;
    const canReport = documents.filter((d) => d.can_generate_report).length;
    return { totalDocs, processed, canReport };
  }, [documents]);

  const columns = [
    {
      title: '文档名称',
      dataIndex: 'name',
      key: 'name',
      render: (name: string, record: Document) => (
        <Space>
          {getFileIcon(record.mime_type, record.name)}
          <Text strong>{name}</Text>
        </Space>
      ),
    },
    {
      title: '大小',
      dataIndex: 'size',
      key: 'size',
      width: 120,
      render: (size: number) => <Text type="secondary">{formatFileSize(size)}</Text>,
    },
    {
      title: '状态',
      dataIndex: 'status',
      key: 'status',
      width: 110,
      render: (statusValue: string) => {
        const statusMap: Record<string, { color: string; label: string }> = {
          PROCESSED: { color: 'success', label: '已处理' },
          PROCESSING: { color: 'processing', label: '处理中' },
          FAILED: { color: 'error', label: '失败' },
          PENDING: { color: 'warning', label: '待处理' },
        };
        const status = statusMap[statusValue] || { color: 'default', label: statusValue };
        return <Badge status={status.color as any} text={status.label} />;
      },
    },
    {
      title: '摘要',
      dataIndex: 'summary',
      key: 'summary',
      width: 180,
      ellipsis: true,
      render: (summary?: string) => {
        if (summary) {
          return (
            <Text type="secondary" style={{ fontSize: 12 }} ellipsis={{ tooltip: summary }}>
              {summary.slice(0, 50)}{summary.length > 50 ? '...' : ''}
            </Text>
          );
        }
        return <Text type="secondary" style={{ fontSize: 12 }}>-</Text>;
      },
    },
    {
      title: '报告',
      dataIndex: 'can_generate_report',
      key: 'can_generate_report',
      width: 100,
      render: (canGenerateReport: boolean) => (
        canGenerateReport ? (
          <Tag color="success" style={{ borderRadius: 12, fontSize: 12 }}>可用</Tag>
        ) : (
          <Tag color="default" style={{ borderRadius: 12, fontSize: 12 }}>不可用</Tag>
        )
      ),
    },
    {
      title: '上传时间',
      dataIndex: 'created_at',
      key: 'created_at',
      width: 170,
      render: (value: string) => (
        <Text type="secondary" style={{ fontSize: 13 }}>{new Date(value).toLocaleString('zh-CN')}</Text>
      ),
    },
    {
      title: '操作',
      key: 'action',
      width: 240,
      render: (_: unknown, record: Document) => (
        <Space size="small">
          <Button
            size="small"
            type="text"
            icon={<EyeOutlined />}
            disabled={!record.preview_available}
            onClick={() => handleOpenPreview(record)}
            style={{ color: record.preview_available ? '#1890ff' : '#bfbfbf' }}
          >
            预览
          </Button>
          <Button
            size="small"
            type="text"
            icon={<ShareAltOutlined />}
            onClick={() => { setSelectedDoc(record); setShareModal(true); shareForm.setFieldsValue({ title: record.name }); }}
            style={{ color: '#52c41a' }}
          >
            分享
          </Button>
          <Popconfirm
            title="确认删除该文档？"
            description="删除后会同步清理关联的分享申请、知识提炼和公开分享记录。"
            onConfirm={() => handleDelete(record.id)}
          >
            <Button size="small" type="text" danger icon={<DeleteOutlined />}>
              删除
            </Button>
          </Popconfirm>
        </Space>
      ),
    },
  ];

  const rowSelection = useMemo<NonNullable<TableProps<Document>['rowSelection']>>(
    () => ({
      selectedRowKeys: selectedReportIds,
      onChange: (nextSelectedRowKeys: React.Key[], nextSelectedRows: Document[]) => {
        if (nextSelectedRowKeys.length > MAX_REPORT_DOCUMENTS) {
          message.warning(`最多只能选择 ${MAX_REPORT_DOCUMENTS} 个文档`);
          return;
        }
        setSelectedReportIds(nextSelectedRowKeys);
        setSelectedReportDocs(nextSelectedRows);
      },
      getCheckboxProps: (record: Document) => ({
        disabled: !record.can_generate_report || (selectedReportIds.length >= MAX_REPORT_DOCUMENTS && !selectedReportIds.includes(record.id)),
      }),
    }),
    [selectedReportIds]
  );

  return (
    <div style={{ maxWidth: 1400, margin: '0 auto' }}>
      {/* 统计卡片 */}
      <Row gutter={[16, 16]} style={{ marginBottom: 24 }}>
        <Col xs={24} sm={8}>
          <Card style={{ borderRadius: 12, boxShadow: '0 2px 8px rgba(0,0,0,0.06)' }}>
            <Statistic
              title="文档总数"
              value={stats.totalDocs}
              prefix={<InboxOutlined style={{ color: '#1890ff' }} />}
              valueStyle={{ color: '#1890ff', fontWeight: 600 }}
            />
          </Card>
        </Col>
        <Col xs={24} sm={8}>
          <Card style={{ borderRadius: 12, boxShadow: '0 2px 8px rgba(0,0,0,0.06)' }}>
            <Statistic
              title="已处理"
              value={stats.processed}
              prefix={<FileTextOutlined style={{ color: '#52c41a' }} />}
              valueStyle={{ color: '#52c41a', fontWeight: 600 }}
            />
          </Card>
        </Col>
        <Col xs={24} sm={8}>
          <Card style={{ borderRadius: 12, boxShadow: '0 2px 8px rgba(0,0,0,0.06)' }}>
            <Statistic
              title="可生成报告"
              value={stats.canReport}
              prefix={<ApartmentOutlined style={{ color: '#722ed1' }} />}
              valueStyle={{ color: '#722ed1', fontWeight: 600 }}
            />
          </Card>
        </Col>
      </Row>

      {/* 文档列表 */}
      <Card
        title={
          <Space>
            <Title level={4} style={{ margin: 0, fontSize: 18 }}>我的文档</Title>
            {selectedReportIds.length > 0 && (
              <Tag color="blue" style={{ borderRadius: 12 }}>
                已选 {selectedReportIds.length} 个
              </Tag>
            )}
          </Space>
        }
        extra={
          <Space>
            <Button
              icon={<ApartmentOutlined />}
              disabled={selectedReportIds.length === 0}
              onClick={handleOpenReportModal}
              style={{ borderRadius: 8 }}
            >
              生成知识体系报告
            </Button>
            <Button type="primary" icon={<UploadOutlined />} onClick={() => setUploadModal(true)} style={{ borderRadius: 8 }}>
              上传文档
            </Button>
          </Space>
        }
        style={{ borderRadius: 12, boxShadow: '0 2px 8px rgba(0,0,0,0.06)' }}
        bodyStyle={{ padding: '12px 24px 24px' }}
      >
        <Table
          columns={columns}
          dataSource={documents}
          rowKey="id"
          loading={loading}
          rowSelection={rowSelection}
          pagination={{
            current: page,
            total,
            pageSize: 20,
            onChange: loadDocuments,
            showSizeChanger: false,
            showTotal: (total) => `共 ${total} 条`,
          }}
          style={{ borderRadius: 8 }}
        />
      </Card>

      {/* 分享记录 */}
      <Card
        title={<Title level={4} style={{ margin: 0, fontSize: 18 }}>我的分享记录</Title>}
        style={{ marginTop: 24, borderRadius: 12, boxShadow: '0 2px 8px rgba(0,0,0,0.06)' }}
        extra={<Button type="link" onClick={loadMyRequests} style={{ borderRadius: 8 }}>刷新</Button>}
      >
        {myRequests.length === 0 ? (
          <Empty description="暂无分享记录" image={Empty.PRESENTED_IMAGE_SIMPLE} />
        ) : (
          <Space direction="vertical" style={{ width: '100%' }}>
            {myRequests.map((item) => (
              <Card
                key={item.id}
                size="small"
                style={{
                  borderRadius: 8,
                  border: '1px solid #f0f0f0',
                  transition: 'all 0.3s',
                }}
                bodyStyle={{ padding: '12px 16px' }}
              >
                <Space style={{ width: '100%', justifyContent: 'space-between' }}>
                  <Space direction="vertical" size={2}>
                    <Text strong>{item.title || item.doc_name}</Text>
                    {item.description && <Text type="secondary" style={{ fontSize: 13 }}>{item.description}</Text>}
                  </Space>
                  <Space>
                    <Tag
                      color={item.status === 'APPROVED' ? 'success' : item.status === 'REJECTED' ? 'error' : 'warning'}
                      style={{ borderRadius: 12 }}
                    >
                      {item.status === 'PENDING' ? '待审核' : item.status === 'APPROVED' ? '已通过' : '已拒绝'}
                    </Tag>
                    {item.status === 'PENDING' && (
                      <Popconfirm title="确认取消？" onConfirm={() => handleCancelRequest(item.id)}>
                        <Button size="small" type="text" danger>取消</Button>
                      </Popconfirm>
                    )}
                  </Space>
                </Space>
              </Card>
            ))}
          </Space>
        )}
      </Card>

      {/* 上传模态框 */}
      <Modal
        title={<Title level={4} style={{ margin: 0 }}>上传文档</Title>}
        open={uploadModal}
        onCancel={() => {
          if (!uploading) {
            setUploadModal(false);
            resetUploadState();
          }
        }}
        footer={null}
        destroyOnClose
        width={560}
        styles={{ body: { padding: '24px 32px' } }}
      >
        <Space direction="vertical" size="middle" style={{ width: '100%' }}>
          <Dragger
            accept=".pdf,.doc,.docx,.ppt,.pptx,.md,.txt"
            customRequest={handleUpload}
            showUploadList={false}
            disabled={uploading}
            style={{ borderRadius: 12, padding: '24px 0' }}
          >
            <p className="ant-upload-drag-icon"><UploadOutlined style={{ fontSize: 48, color: '#1890ff' }} /></p>
            <p className="ant-upload-text" style={{ fontSize: 16, fontWeight: 500 }}>点击或拖拽文件上传</p>
            <p className="ant-upload-hint" style={{ color: '#8c8c8c' }}>支持 PDF、Word、PowerPoint、Markdown、TXT 格式</p>
          </Dragger>

          {(uploading || uploadPercent > 0 || uploadError) ? (
            <Space direction="vertical" size="small" style={{ width: '100%', padding: '16px', background: '#fafafa', borderRadius: 8 }}>
              <Text strong>{uploadFileName || '正在准备上传文件'}</Text>
              <Progress
                percent={uploadPercent}
                status={uploadError ? 'exception' : uploading ? 'active' : 'success'}
                strokeColor={{ from: '#108ee9', to: '#87d068' }}
                trailColor="#f0f0f0"
              />
              {uploadStage ? <Text type={uploadError ? 'danger' : 'secondary'}>{uploadStage}</Text> : null}
              {uploadError ? <Text type="danger">{uploadError}</Text> : null}
            </Space>
          ) : null}
        </Space>
      </Modal>

      {/* 分享模态框 */}
      <Modal
        title={<Title level={4} style={{ margin: 0 }}>申请分享</Title>}
        open={shareModal}
        onCancel={() => { setShareModal(false); shareForm.resetFields(); }}
        footer={null}
        destroyOnClose
        width={480}
        styles={{ body: { padding: '24px 32px' } }}
      >
        <Form form={shareForm} onFinish={handleShare} layout="vertical">
          <Form.Item name="title" label="分享标题" rules={[{ required: true, message: '请输入标题' }]}>
            <Input placeholder="请输入分享标题" style={{ borderRadius: 8 }} />
          </Form.Item>
          <Form.Item name="description" label="分享描述">
            <Input.TextArea rows={3} placeholder="请输入分享描述（选填）" style={{ borderRadius: 8 }} />
          </Form.Item>
          <Button type="primary" htmlType="submit" block style={{ borderRadius: 8, height: 40, fontSize: 15 }}>提交申请</Button>
        </Form>
      </Modal>

      {/* 报告模态框 */}
      <Modal
        title={<Title level={4} style={{ margin: 0 }}>生成知识体系报告</Title>}
        open={reportModal}
        onCancel={() => setReportModal(false)}
        footer={null}
        destroyOnClose
        width={560}
        styles={{ body: { padding: '24px 32px' } }}
      >
        <Form form={reportForm} onFinish={handleGenerateReport} layout="vertical">
          <Form.Item label="已选文档">
            <Space wrap>
              {selectedReportDocs.map((document) => (
                <Tag key={document.id} color="blue" style={{ borderRadius: 8, padding: '4px 12px' }}>{document.name}</Tag>
              ))}
            </Space>
          </Form.Item>
          <Form.Item name="title" label="报告标题" rules={[{ required: true, message: '请输入报告标题' }]}>
            <Input maxLength={120} placeholder="请输入报告标题" style={{ borderRadius: 8 }} />
          </Form.Item>
          <Form.Item name="description" label="报告说明">
            <Input.TextArea rows={3} maxLength={300} placeholder="请输入报告说明（选填）" style={{ borderRadius: 8 }} />
          </Form.Item>
          <Button type="primary" htmlType="submit" block loading={generatingReport} style={{ borderRadius: 8, height: 40, fontSize: 15 }}>
            开始生成
          </Button>
        </Form>
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
