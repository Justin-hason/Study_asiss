import { useEffect, useMemo, useState } from 'react';
import { Alert, Button, Empty, Modal, Skeleton, Space } from 'antd';
import { ExportOutlined } from '@ant-design/icons';
import MarkdownRenderer from './MarkdownRenderer';

interface DocumentPreviewModalProps {
  open: boolean;
  title: string;
  blob: Blob | null;
  mimeType?: string;
  loading?: boolean;
  error?: string | null;
  onClose: () => void;
}

interface TextPreviewState {
  signature: string;
  content: string;
}

function isTextPreviewable(mimeType: string): boolean {
  if (!mimeType) return true;
  return mimeType.startsWith('text/') ||
    mimeType.includes('json') ||
    mimeType.includes('xml') ||
    mimeType.includes('markdown') ||
    mimeType.includes('md');
}

function isMarkdownFile(filename: string): boolean {
  const lowerName = filename.toLowerCase();
  return lowerName.endsWith('.md') ||
    lowerName.endsWith('.markdown') ||
    lowerName.endsWith('.mdx');
}

function isMarkdownMimeType(mimeType: string): boolean {
  return mimeType.includes('markdown') ||
    mimeType === 'text/markdown' ||
    mimeType === 'text/x-markdown';
}

function isMarkdownContent(content: string): boolean {
  if (!content || content.length < 10) return false;

  const markdownPatterns = [
    /^#{1,6}\s/m,
    /\*\*[\s\S]+?\*\*/,
    /\*[\s\S]+?\*/,
    /`[\s\S]+?`/,
    /^```[\s\S]*?```/m,
    /^\s*[-*+]\s/m,
    /^\s*\d+\.\s/m,
    /^\[.+?\]\(.+?\)/m,
    /^\|.+?\|.+?\|/m,
    /^>.+/m,
    /^---+$/m,
    /^\[.+?\]:\s*/m,
  ];

  let matchCount = 0;
  for (const pattern of markdownPatterns) {
    if (pattern.test(content) && ++matchCount >= 2) return true;
  }
  return false;
}

function isPdfPreviewable(mimeType: string): boolean {
  return mimeType.includes('pdf');
}

function isImagePreviewable(mimeType: string): boolean {
  return mimeType.startsWith('image/');
}

export default function DocumentPreviewModal({
  open,
  title,
  blob,
  mimeType,
  loading = false,
  error = null,
  onClose,
}: DocumentPreviewModalProps) {
  const [textPreview, setTextPreview] = useState<TextPreviewState | null>(null);
  const [detectedMarkdown, setDetectedMarkdown] = useState(false);

  const resolvedMimeType = useMemo(() => mimeType || blob?.type || '', [blob, mimeType]);
  const textSignature = useMemo(() => (
    blob ? `${title}:${blob.size}:${blob.type || resolvedMimeType}` : ''
  ), [blob, resolvedMimeType, title]);

  const forceMarkdown = useMemo(() =>
    isMarkdownFile(title) || isMarkdownMimeType(resolvedMimeType),
  [title, resolvedMimeType]);

  const objectUrl = useMemo(() => {
    if (!blob || isTextPreviewable(resolvedMimeType)) return null;
    return URL.createObjectURL(blob);
  }, [blob, resolvedMimeType]);

  useEffect(() => {
    if (!blob || !isTextPreviewable(resolvedMimeType) || !open) return undefined;

    let cancelled = false;

    blob.text()
      .then((content) => {
        if (!cancelled) {
          setTextPreview({ signature: textSignature, content });
          if (!forceMarkdown) {
            setDetectedMarkdown(isMarkdownContent(content));
          }
        }
      })
      .catch(() => {
        if (!cancelled) {
          setTextPreview({ signature: textSignature, content: '文件内容读取失败' });
        }
      });

    return () => { cancelled = true; };
  }, [blob, open, resolvedMimeType, textSignature, forceMarkdown]);

  useEffect(() => {
    if (!open) {
      setTextPreview(null);
      setDetectedMarkdown(false);
    }
  }, [open]);

  useEffect(() => () => {
    if (objectUrl) URL.revokeObjectURL(objectUrl);
  }, [objectUrl]);

  const shouldRenderMarkdown = forceMarkdown || detectedMarkdown;
  const canInlineRender = Boolean(blob && (
    isPdfPreviewable(resolvedMimeType)
    || isImagePreviewable(resolvedMimeType)
    || isTextPreviewable(resolvedMimeType)
  ));
  const textContent = textPreview?.signature === textSignature ? textPreview.content : '';
  const textLoading = Boolean(blob && isTextPreviewable(resolvedMimeType) && !textContent && !error && !loading);

  const handleDownload = () => {
    if (!blob) return;
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = title;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  const renderContent = () => {
    if (loading) {
      return <Skeleton active paragraph={{ rows: 10 }} />;
    }

    if (error) {
      return <Alert message={error} type="error" showIcon />;
    }

    if (!blob) {
      return <Empty description="暂无预览内容" />;
    }

    if (!canInlineRender) {
      return (
        <Space direction="vertical" style={{ width: '100%' }}>
          <Empty description="不支持在线预览该文件类型" />
          <Button type="primary" icon={<ExportOutlined />} onClick={handleDownload}>
            下载文件
          </Button>
        </Space>
      );
    }

    if (isImagePreviewable(resolvedMimeType) && objectUrl) {
      return (
        <div style={{ textAlign: 'center' }}>
          <img src={objectUrl} alt={title} style={{ maxWidth: '100%', maxHeight: 600, borderRadius: 8 }} />
        </div>
      );
    }

    if (isPdfPreviewable(resolvedMimeType) && objectUrl) {
      return (
        <div style={{ height: 640, borderRadius: 8, overflow: 'hidden', border: '1px solid #e8e8e8' }}>
          <iframe
            src={objectUrl}
            title={title}
            style={{ width: '100%', height: '100%', border: 'none' }}
          />
        </div>
      );
    }

    if (textLoading) {
      return <Skeleton active paragraph={{ rows: 10 }} />;
    }

    if (shouldRenderMarkdown) {
      return <MarkdownRenderer content={textContent || '暂无内容'} />;
    }

    return (
      <pre style={{
        maxHeight: 640,
        overflow: 'auto',
        padding: '24px',
        border: '1px solid #e8e8e8',
        borderRadius: 12,
        background: '#fafafa',
        fontFamily: 'SFMono-Regular, Menlo, Monaco, Consolas, monospace',
        fontSize: 14,
        lineHeight: 1.6,
        whiteSpace: 'pre-wrap',
        wordBreak: 'break-all',
        color: '#333',
      }}>
        {textContent || '暂无内容'}
      </pre>
    );
  };

  return (
    <Modal
      title={title}
      open={open}
      onCancel={onClose}
      footer={blob ? (
        <Button icon={<ExportOutlined />} onClick={handleDownload}>
          下载
        </Button>
      ) : null}
      width={900}
      bodyStyle={{ padding: 24 }}
      style={{ borderRadius: 12 }}
    >
      {renderContent()}
    </Modal>
  );
}
