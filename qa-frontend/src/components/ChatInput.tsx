import { useState, useRef, useCallback, type KeyboardEvent } from 'react'

interface ChatInputProps {
  onSend: (text: string) => void
  disabled?: boolean
  loading?: boolean
}

export default function ChatInput({ onSend, disabled, loading }: ChatInputProps) {
  const [text, setText] = useState('')
  const textareaRef = useRef<HTMLTextAreaElement>(null)

  const handleSend = useCallback(() => {
    const trimmed = text.trim()
    if (!trimmed || disabled || loading) return
    onSend(trimmed)
    setText('')
    if (textareaRef.current) {
      textareaRef.current.style.height = 'auto'
    }
  }, [text, disabled, loading, onSend])

  const handleKeyDown = useCallback(
    (e: KeyboardEvent<HTMLTextAreaElement>) => {
      if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault()
        handleSend()
      }
    },
    [handleSend],
  )

  const handleInput = useCallback(() => {
    const el = textareaRef.current
    if (!el) return
    el.style.height = 'auto'
    el.style.height = Math.min(el.scrollHeight, 200) + 'px'
  }, [])

  return (
    <div
      style={{
        borderTop: '1px solid #e5e7eb',
        padding: '16px 20px',
        background: '#fff',
      }}
    >
      <div
        style={{
          display: 'flex',
          gap: '8px',
          alignItems: 'flex-end',
          maxWidth: '800px',
          margin: '0 auto',
        }}
      >
        <textarea
          ref={textareaRef}
          value={text}
          onChange={(e) => {
            setText(e.target.value)
            handleInput()
          }}
          onKeyDown={handleKeyDown}
          placeholder="输入问题，Enter 发送，Shift+Enter 换行"
          rows={1}
          disabled={disabled || loading}
          style={{
            flex: 1,
            padding: '10px 14px',
            borderRadius: '12px',
            border: '1px solid #d1d5db',
            fontSize: '15px',
            lineHeight: '1.5',
            resize: 'none',
            outline: 'none',
            fontFamily: 'inherit',
            maxHeight: '200px',
            transition: 'border-color 0.2s',
          }}
          onFocus={(e) => {
            e.target.style.borderColor = '#2563eb'
          }}
          onBlur={(e) => {
            e.target.style.borderColor = '#d1d5db'
          }}
        />
        <button
          onClick={handleSend}
          disabled={!text.trim() || disabled || loading}
          style={{
            padding: '10px 24px',
            borderRadius: '12px',
            border: 'none',
            background: !text.trim() || disabled || loading ? '#d1d5db' : '#2563eb',
            color: '#fff',
            fontSize: '15px',
            cursor: !text.trim() || disabled || loading ? 'not-allowed' : 'pointer',
            transition: 'background 0.2s',
            whiteSpace: 'nowrap',
          }}
        >
          {loading ? '发送中...' : '发送'}
        </button>
      </div>
    </div>
  )
}
