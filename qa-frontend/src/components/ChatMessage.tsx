import type { ChatMessage as ChatMessageType } from '../types'
import StreamingText from './StreamingText'
import SourceReferences from './SourceReferences'

interface ChatMessageProps {
  message: ChatMessageType
  streaming?: boolean
}

export default function ChatMessage({ message, streaming }: ChatMessageProps) {
  const isUser = message.role === 'user'
  const time = new Date(message.timestamp).toLocaleTimeString('zh-CN', {
    hour: '2-digit',
    minute: '2-digit',
  })

  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        alignItems: isUser ? 'flex-end' : 'flex-start',
        marginBottom: '16px',
      }}
    >
      <div
        style={{
          maxWidth: '75%',
          padding: '12px 16px',
          borderRadius: isUser ? '16px 16px 4px 16px' : '16px 16px 16px 4px',
          background: isUser ? '#2563eb' : '#f3f4f6',
          color: isUser ? '#fff' : '#1f2937',
          lineHeight: '1.6',
          fontSize: '15px',
        }}
      >
        {isUser ? (
          <div style={{ whiteSpace: 'pre-wrap' }}>{message.content}</div>
        ) : (
          <>
            <div style={{ fontWeight: 600, fontSize: '13px', marginBottom: '4px', opacity: 0.7 }}>
              AI 助手
            </div>
            <StreamingText content={message.content} done={!streaming} />
            {message.sources && message.sources.length > 0 && (
              <SourceReferences sources={message.sources} />
            )}
          </>
        )}
      </div>
      <div
        style={{
          fontSize: '12px',
          color: '#9ca3af',
          marginTop: '4px',
          padding: isUser ? '0 4px 0 0' : '0 0 0 4px',
        }}
      >
        {time}
      </div>
    </div>
  )
}
