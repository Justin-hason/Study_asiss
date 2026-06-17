import { useState, useCallback, useRef, useEffect } from 'react';
import { Input, Typography } from 'antd';
import { SearchOutlined } from '@ant-design/icons';
import SearchResultList from './SearchResultList';
import { search as searchApi } from '../../api/search';
import type { ChunkResult } from '../../api/search';

const { Title } = Typography;

const HISTORY_KEY = 'search_history';
const MAX_HISTORY = 10;

function loadHistory(): string[] {
  try {
    const raw = localStorage.getItem(HISTORY_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

function saveHistory(keyword: string) {
  const history = loadHistory().filter((h) => h !== keyword);
  history.unshift(keyword);
  localStorage.setItem(HISTORY_KEY, JSON.stringify(history.slice(0, MAX_HISTORY)));
}

export default function SearchPage() {
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<ChunkResult[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [latencyMs, setLatencyMs] = useState<number | undefined>();
  const [expandedChunks, setExpandedChunks] = useState<Set<string>>(new Set());
  const [showHistory, setShowHistory] = useState(false);
  const [searchHistory, setSearchHistory] = useState<string[]>(loadHistory);
  const inputRef = useRef<HTMLDivElement>(null);
  const queryRef = useRef(query);
  queryRef.current = query;

  const doSearch = useCallback(async (keyword: string) => {
    if (!keyword.trim()) return;
    setLoading(true);
    setError(null);
    setExpandedChunks(new Set());
    try {
      const resp = await searchApi({ query: keyword, top_k: 20, top_n: 20 });
      setResults(resp.results);
      setLatencyMs(resp.latency_ms);
      if (!resp.empty_result) {
        saveHistory(keyword);
        setSearchHistory(loadHistory());
      }
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : '搜索请求失败，请稍后重试';
      setError(msg);
      setResults([]);
    } finally {
      setLoading(false);
    }
  }, []);

  const handleSearch = useCallback(
    (value: string) => {
      setShowHistory(false);
      setQuery(value);
      doSearch(value);
    },
    [doSearch],
  );

  const handleHistoryClick = useCallback(
    (keyword: string) => {
      setQuery(keyword);
      setShowHistory(false);
      doSearch(keyword);
    },
    [doSearch],
  );

  const handleContextToggle = useCallback((chunkId: string) => {
    setExpandedChunks((prev) => {
      const next = new Set(prev);
      if (next.has(chunkId)) {
        next.delete(chunkId);
      } else {
        next.add(chunkId);
      }
      return next;
    });
  }, []);

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (inputRef.current && !inputRef.current.contains(e.target as Node)) {
        setShowHistory(false);
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  return (
    <div style={{ maxWidth: 800, margin: '0 auto' }}>
      <Title level={3} style={{ textAlign: 'center', marginBottom: 32 }}>
        混合搜索
      </Title>

      <div ref={inputRef} style={{ position: 'relative' }}>
        <Input.Search
          size="large"
          placeholder="输入关键词搜索知识库文档..."
          enterButton="搜索"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onSearch={handleSearch}
          onFocus={() => setShowHistory(true)}
          prefix={<SearchOutlined />}
        />
        {showHistory && searchHistory.length > 0 && (
          <div
            style={{
              position: 'absolute',
              top: '100%',
              left: 0,
              right: 0,
              zIndex: 10,
              background: '#fff',
              border: '1px solid #d9d9d9',
              borderRadius: 6,
              boxShadow: '0 4px 12px rgba(0,0,0,0.1)',
              marginTop: 4,
            }}
          >
            <div style={{ padding: '8px 12px', fontSize: 12, color: '#999' }}>搜索历史</div>
            {searchHistory.map((item) => (
              <div
                key={item}
                style={{
                  padding: '6px 12px',
                  cursor: 'pointer',
                  fontSize: 14,
                }}
                onMouseDown={() => handleHistoryClick(item)}
                onMouseEnter={(e) => {
                  (e.currentTarget as HTMLElement).style.background = '#f5f5f5';
                }}
                onMouseLeave={(e) => {
                  (e.currentTarget as HTMLElement).style.background = 'transparent';
                }}
              >
                {item}
              </div>
            ))}
          </div>
        )}
      </div>

      <SearchResultList
        results={results}
        loading={loading}
        error={error}
        keyword={query}
        latencyMs={latencyMs}
        onRetry={() => doSearch(queryRef.current)}
        expandedChunks={expandedChunks}
        onContextToggle={handleContextToggle}
      />
    </div>
  );
}
