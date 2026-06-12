import { useMemo } from 'react'
import type { ReactElement } from 'react'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import rehypeHighlight from 'rehype-highlight'

interface StreamingTextProps {
  content: string
  done: boolean
}

function SimpleRenderer({ content, done }: { content: string; done: boolean }) {
  return useMemo(() => {
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
}

export default function StreamingText({ content, done }: StreamingTextProps) {
  if (!content) return null

  if (done) {
    return (
      <div style={{ whiteSpace: 'pre-wrap', wordBreak: 'break-word' }}>
        <ReactMarkdown
          remarkPlugins={[remarkGfm]}
          rehypePlugins={[rehypeHighlight]}
          components={{
            pre({ children }) {
              return (
                <pre style={{
                  background: '#1e1e2e',
                  color: '#cdd6f4',
                  padding: '12px',
                  borderRadius: '8px',
                  overflowX: 'auto',
                  fontSize: '14px',
                  lineHeight: '1.5',
                }}>
                  {children}
                </pre>
              )
            },
            code({ className, children, ...props }) {
              const isInline = !className
              if (isInline) {
                return (
                  <code style={{
                    background: '#f3f4f6',
                    padding: '2px 6px',
                    borderRadius: '4px',
                    fontSize: '13px',
                    color: '#e11d48',
                  }} {...props}>
                    {children}
                  </code>
                )
              }
              return <code className={className} {...props}>{children}</code>
            },
            table({ children }) {
              return (
                <div style={{ overflowX: 'auto', margin: '8px 0' }}>
                  <table style={{
                    borderCollapse: 'collapse',
                    width: '100%',
                    fontSize: '14px',
                  }}>
                    {children}
                  </table>
                </div>
              )
            },
            th({ children }) {
              return (
                <th style={{
                  border: '1px solid #d1d5db',
                  padding: '8px 12px',
                  background: '#f3f4f6',
                  textAlign: 'left',
                  fontWeight: 600,
                }}>
                  {children}
                </th>
              )
            },
            td({ children }) {
              return (
                <td style={{
                  border: '1px solid #d1d5db',
                  padding: '8px 12px',
                }}>
                  {children}
                </td>
              )
            },
            a({ href, children }) {
              return (
                <a href={href} target="_blank" rel="noopener noreferrer"
                  style={{ color: '#2563eb', textDecoration: 'underline' }}>
                  {children}
                </a>
              )
            },
          }}
        >
          {content}
        </ReactMarkdown>
      </div>
    )
  }

  return (
    <div style={{ whiteSpace: 'pre-wrap', wordBreak: 'break-word' }}>
      <SimpleRenderer content={content} done={false} />
    </div>
  )
}
