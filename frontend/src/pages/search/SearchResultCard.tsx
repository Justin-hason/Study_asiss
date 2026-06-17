import { Card, Tag, Typography } from 'antd';
import { FileTextOutlined } from '@ant-design/icons';
import type { ChunkResult } from '../../api/search';

const { Text, Paragraph } = Typography;

function highlightText(text: string, keyword: string): React.ReactNode {
  if (!keyword.trim()) return text;
  const escaped = keyword.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const parts = text.split(new RegExp(`(${escaped})`, 'gi'));
  return parts.map((part, i) =>
    part.toLowerCase() === keyword.toLowerCase() ? (
      <span key={i} style={{ backgroundColor: '#ffd666', fontWeight: 500, borderRadius: 2, padding: '0 2px' }}>
        {part}
      </span>
    ) : (
      part
    ),
  );
}

interface SearchResultCardProps {
  result: ChunkResult;
  keyword: string;
  onContextToggle?: (chunkId: string) => void;
  expanded?: boolean;
}

export default function SearchResultCard({ result, keyword, onContextToggle, expanded }: SearchResultCardProps) {
  return (
    <Card
      size="small"
      style={{ marginBottom: 12, cursor: 'pointer' }}
      onClick={() => onContextToggle?.(result.chunk_id)}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
        <FileTextOutlined />
        <Text strong style={{ fontSize: 14 }}>{result.doc_name}</Text>
        <Tag color="blue">第 {result.page} 页</Tag>
        <Tag>{(result.score * 100).toFixed(1)}%</Tag>
      </div>
      <Paragraph
        style={{ margin: 0, whiteSpace: 'pre-wrap' }}
        ellipsis={expanded ? false : { rows: 3 }}
      >
        {highlightText(result.text, keyword)}
      </Paragraph>
      {result.doc_id && (
        <Text type="secondary" style={{ fontSize: 12, display: 'block', marginTop: 4 }}>
          文档路径: {result.doc_id}
        </Text>
      )}
      {expanded && result.text.length > 200 && (
        <Paragraph style={{ marginTop: 8, padding: 8, background: '#f5f5f5', borderRadius: 4, whiteSpace: 'pre-wrap' }}>
          <Text type="secondary">{result.text}</Text>
        </Paragraph>
      )}
    </Card>
  );
}
