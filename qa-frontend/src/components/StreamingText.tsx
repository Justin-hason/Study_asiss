import { useMemo } from 'react'
import type { ReactElement } from 'react'

interface StreamingTextProps {
  content: string
  done: boolean
}

export default function StreamingText({ content, done }: StreamingTextProps) {
  const rendered = useMemo(() => {
    if (!content) return null
    const parts: ReactElement[] = []
    let inCodeBlock = false
    let codeBuffer = ''
    let paragraphBuffer = ''
    let key = 0

    const flushParagraph = () => {
      if (paragraphBuffer) {
        parts.push(<span key={key++}>{paragraphBuffer}</span>)
        paragraphBuffer = ''
      }
    }

    const lines = content.split('\n')
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i]
      if (inCodeBlock) {
        if (line.startsWith('```')) {
          flushParagraph()
          if (done || i < lines.length - 1) {
            parts.push(
              <pre key={key++} style={{
                background: '#1e1e2e',
                color: '#cdd6f4',
                padding: '12px',
                borderRadius: '8px',
                overflowX: 'auto',
                fontSize: '14px',
                lineHeight: '1.5',
              }}>
              <code>{codeBuffer}</code>
              </pre>,
            )
          } else {
            parts.push(
              <pre key={key++} style={{
                background: '#1e1e2e',
                color: '#cdd6f4',
                padding: '12px',
                borderRadius: '8px',
                overflowX: 'auto',
                fontSize: '14px',
                lineHeight: '1.5',
              }}>
              <code>{codeBuffer}</code>
              </pre>,
            )
          }
          codeBuffer = ''
          inCodeBlock = false
        } else {
          codeBuffer += (codeBuffer ? '\n' : '') + line
        }
      } else if (line.startsWith('```')) {
        flushParagraph()
          inCodeBlock = true
          codeBuffer = ''
      } else if (line === '') {
        flushParagraph()
        if (i < lines.length - 1 || done) {
          parts.push(<br key={key++} />)
          parts.push(<br key={key++} />)
        }
      } else {
        paragraphBuffer += (paragraphBuffer ? ' ' : '') + line
      }
    }

    if (inCodeBlock && codeBuffer) {
      parts.push(
        <pre key={key++} style={{
          background: '#1e1e2e',
          color: '#cdd6f4',
          padding: '12px',
          borderRadius: '8px',
          overflowX: 'auto',
          fontSize: '14px',
        }}>
        <code>{codeBuffer}</code>
        </pre>,
      )
    }

    flushParagraph()

    if (parts.length === 0) {
      return <span>{content}</span>
    }

    return <>{parts}</>
  }, [content, done])

  return <div style={{ whiteSpace: 'pre-wrap', wordBreak: 'break-word' }}>{rendered}</div>
}
