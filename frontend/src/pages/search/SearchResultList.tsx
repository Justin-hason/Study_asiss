import { Spin, Empty, Alert, Button, Typography } from 'antd';
import SearchResultCard from './SearchResultCard';
import type { ChunkResult } from '../../api/search';

const { Text } = Typography;

interface SearchResultListProps {
  results: ChunkResult[];
  loading: boolean;
  error: string | null;
  keyword: string;
  latencyMs?: number;
  onRetry: () => void;
  expandedChunks: Set<string>;
  onContextToggle: (chunkId: string) => void;
}

export default function SearchResultList({
  results,
  loading,
  error,
  keyword,
  latencyMs,
  onRetry,
  expandedChunks,
  onContextToggle,
}: SearchResultListProps) {
  if (loading) {
    return (
      <div style={{ textAlign: 'center', padding: 80 }}>
        <Spin size="large" />
        <div style={{ marginTop: 16 }}>
          <Text type="secondary">正在搜索...</Text>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <Alert
        type="error"
        message="搜索失败"
        description={error}
        showIcon
        style={{ marginTop: 16 }}
        action={
          <Button size="small" danger onClick={onRetry}>
            重试
          </Button>
        }
      />
    );
  }

  if (!keyword.trim()) return null;

  if (results.length === 0) {
    return (
      <div style={{ textAlign: 'center', padding: 60 }}>
        <Empty description="未找到相关结果" />
        <Text type="secondary" style={{ display: 'block', marginTop: 8 }}>
          试试其他关键词
        </Text>
      </div>
    );
  }

  return (
    <div style={{ marginTop: 16 }}>
      <div style={{ marginBottom: 12 }}>
        <Text type="secondary">
          共找到 {results.length} 条结果{latencyMs !== undefined ? `（耗时 ${latencyMs}ms）` : ''}
        </Text>
      </div>
      {results.map((item) => (
        <SearchResultCard
          key={item.chunk_id}
          result={item}
          keyword={keyword}
          expanded={expandedChunks.has(item.chunk_id)}
          onContextToggle={onContextToggle}
        />
      ))}
    </div>
  );
}
