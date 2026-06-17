import { useState } from 'react'
import type { SessionMeta } from '../types'

interface SidebarProps {
  sessions: SessionMeta[]
  activeSessionId: string | null
  onSelect: (id: string) => void
  onNew: () => void
  onDelete: (id: string) => void
}

export default function Sidebar({
  sessions,
  activeSessionId,
  onSelect,
  onNew,
  onDelete,
}: SidebarProps) {
  const [deletingId, setDeletingId] = useState<string | null>(null)

  const handleDelete = (e: React.MouseEvent, id: string) => {
    e.stopPropagation()
    setDeletingId(id)
  }

  const confirmDelete = () => {
    if (deletingId) {
      onDelete(deletingId)
      setDeletingId(null)
    }
  }

  return (
    <div
      style={{
        width: '280px',
        minWidth: '280px',
        height: '100%',
        background: '#f9fafb',
        borderRight: '1px solid #e5e7eb',
        display: 'flex',
        flexDirection: 'column',
      }}
    >
      <div
        style={{
          padding: '16px',
          borderBottom: '1px solid #e5e7eb',
        }}
      >
        <button
          onClick={onNew}
          style={{
            width: '100%',
            padding: '10px 16px',
            borderRadius: '10px',
            border: '1px solid #2563eb',
            background: '#2563eb',
            color: '#fff',
            fontSize: '14px',
            cursor: 'pointer',
            fontWeight: 500,
            transition: 'background 0.2s',
          }}
        >
          + 新建会话
        </button>
      </div>

      <div
        style={{
          flex: 1,
          overflowY: 'auto',
          padding: '8px',
        }}
      >
        {sessions.length === 0 && (
          <div
            style={{
              textAlign: 'center',
              color: '#9ca3af',
              fontSize: '14px',
              marginTop: '32px',
            }}
          >
            暂无会话
          </div>
        )}

        {sessions
          .slice()
          .sort((a, b) => b.updatedAt - a.updatedAt)
          .map((session) => (
            <div
              key={session.id}
              onClick={() => onSelect(session.id)}
                style={{
                  padding: '10px 12px',
                  borderRadius: '8px',
                  cursor: 'pointer',
                  marginBottom: '4px',
                  background:
                    activeSessionId === session.id ? '#e5e7eb' : 'transparent',
                  transition: 'background 0.15s',
                  position: 'relative',
                }}
              onMouseEnter={(e) => {
                if (activeSessionId !== session.id) {
                  e.currentTarget.style.background = '#f3f4f6'
                }
              }}
              onMouseLeave={(e) => {
                if (activeSessionId !== session.id) {
                  e.currentTarget.style.background = 'transparent'
                }
              }}
            >
              <div
                style={{
                  fontSize: '14px',
                  fontWeight: 500,
                  color: '#374151',
                  overflow: 'hidden',
                  textOverflow: 'ellipsis',
                  whiteSpace: 'nowrap',
                  marginBottom: '2px',
                }}
              >
                {session.title}
              </div>
              <div
                style={{
                  fontSize: '12px',
                  color: '#9ca3af',
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                }}
              >
                <span>
                  {new Date(session.updatedAt).toLocaleDateString('zh-CN', {
                    month: 'short',
                    day: 'numeric',
                    hour: '2-digit',
                    minute: '2-digit',
                  })}
                </span>
                <button
                  onClick={(e) => handleDelete(e, session.id)}
                  style={{
                    background: 'none',
                    border: 'none',
                    color: '#9ca3af',
                    cursor: 'pointer',
                    fontSize: '13px',
                    padding: '2px 4px',
                    borderRadius: '4px',
                    visibility: 'hidden',
                    opacity: 0,
                    transition: 'opacity 0.15s',
                  }}
                  className="delete-btn"
                  onMouseEnter={(e) => {
                    e.currentTarget.style.background = '#e5e7eb'
                  }}
                  onMouseLeave={(e) => {
                    e.currentTarget.style.background = 'none'
                  }}
                >
                  ✕
                </button>
              </div>
            </div>
          ))}
      </div>

      <style>{`
        div:hover > div > button.delete-btn {
          visibility: visible !important;
          opacity: 1 !important;
        }
      `}</style>

      {deletingId && (
        <div
          style={{
            position: 'fixed',
            inset: 0,
            background: 'rgba(0,0,0,0.4)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 1000,
          }}
          onClick={() => setDeletingId(null)}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            style={{
              background: '#fff',
              borderRadius: '16px',
              padding: '24px',
              width: '320px',
              boxShadow: '0 20px 60px rgba(0,0,0,0.15)',
            }}
          >
            <div style={{ fontSize: '16px', fontWeight: 600, marginBottom: '8px', color: '#1f2937' }}>
              确认删除
            </div>
            <div style={{ fontSize: '14px', color: '#6b7280', marginBottom: '20px' }}>
              删除后无法恢复，确定要删除此会话吗？
            </div>
            <div style={{ display: 'flex', gap: '8px', justifyContent: 'flex-end' }}>
              <button
                onClick={() => setDeletingId(null)}
                style={{
                  padding: '8px 16px',
                  borderRadius: '8px',
                  border: '1px solid #d1d5db',
                  background: '#fff',
                  cursor: 'pointer',
                  fontSize: '14px',
                }}
              >
                取消
              </button>
              <button
                onClick={confirmDelete}
                style={{
                  padding: '8px 16px',
                  borderRadius: '8px',
                  border: 'none',
                  background: '#ef4444',
                  color: '#fff',
                  cursor: 'pointer',
                  fontSize: '14px',
                }}
              >
                删除
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
