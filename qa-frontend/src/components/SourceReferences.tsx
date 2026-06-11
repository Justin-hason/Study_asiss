import { useState } from 'react'
import type { SourceRef } from '../types'

interface SourceReferencesProps {
  sources: SourceRef[]
}

export default function SourceReferences({ sources }: SourceReferencesProps) {
  const [expanded, setExpanded] = useState(false)

  if (sources.length === 0) return null

  return (
    <div style={{ marginTop: '12px', borderTop: '1px solid rgba(0,0,0,0.1)', paddingTop: '8px' }}>
      <button
        onClick={() => setExpanded(!expanded)}
        style={{
          background: 'none',
          border: 'none',
          color: '#6b7280',
          cursor: 'pointer',
          fontSize: '13px',
          padding: '2px 0',
          display: 'flex',
          alignItems: 'center',
          gap: '4px',
        }}
      >
        <span>{expanded ? '▼' : '▶'}</span>
        <span>引用来源 ({sources.length})</span>
      </button>
      {expanded && (
        <ul style={{
          margin: '6px 0 0 0',
          padding: '0 0 0 16px',
          fontSize: '13px',
          color: '#6b7280',
          listStyle: 'none',
        }}>
          {sources.map((src, i) => (
            <li key={i} style={{ marginBottom: '4px' }}>
              <span style={{ fontWeight: 500 }}>{src.source}</span>
              {src.page > 0 && <span> · 第 {src.page} 页</span>}
              {src.score !== undefined && (
                <span> · 相关性 {(src.score * 100).toFixed(0)}%</span>
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
