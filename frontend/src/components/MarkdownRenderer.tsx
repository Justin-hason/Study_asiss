import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import 'github-markdown-css/github-markdown.css';

interface MarkdownRendererProps {
  content: string;
  className?: string;
  style?: React.CSSProperties;
  maxHeight?: number;
}

export default function MarkdownRenderer({ content, className = '', style = {}, maxHeight = 600 }: MarkdownRendererProps) {
  return (
    <div
      className={`markdown-body ${className}`}
      style={{
        maxHeight,
        overflow: 'auto',
        padding: '24px 32px',
        border: '1px solid #e8e8e8',
        borderRadius: 12,
        background: '#ffffff',
        boxShadow: '0 2px 8px rgba(0,0,0,0.04)',
        color: '#333',
        ...style,
      }}
    >
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        components={{
          h1: ({ children }) => (
            <h1 style={{ borderBottom: '2px solid #1890ff', paddingBottom: 8, color: '#262626', marginTop: 0 }}>
              {children}
            </h1>
          ),
          h2: ({ children }) => (
            <h2 style={{ borderBottom: '1px solid #e8e8e8', paddingBottom: 6, color: '#262626', marginTop: 24 }}>
              {children}
            </h2>
          ),
          h3: ({ children }) => (
            <h3 style={{ color: '#1f1f1f', marginTop: 20, fontWeight: 600, fontSize: '1.25em' }}>
              {children}
            </h3>
          ),
          h4: ({ children }) => (
            <h4 style={{ color: '#262626', marginTop: 16, fontWeight: 500, fontSize: '1.1em' }}>
              {children}
            </h4>
          ),
          code: ({ children, className }) => {
            const isInline = !className;
            return isInline ? (
              <code style={{
                background: '#f6ffed',
                color: '#52c41a',
                padding: '2px 6px',
                borderRadius: 4,
                fontSize: '0.9em',
                fontFamily: 'SFMono-Regular, Menlo, Monaco, Consolas, monospace',
              }}>
                {children}
              </code>
            ) : (
              <code className={className} style={{
                background: '#f6f8fa',
                borderRadius: 8,
                padding: '16px',
                display: 'block',
                overflowX: 'auto',
                fontFamily: 'SFMono-Regular, Menlo, Monaco, Consolas, monospace',
                fontSize: '14px',
                lineHeight: 1.6,
              }}>
                {children}
              </code>
            );
          },
          pre: ({ children }) => (
            <pre style={{
              background: '#f6f8fa',
              borderRadius: 8,
              padding: '16px',
              overflowX: 'auto',
              margin: '16px 0',
            }}>
              {children}
            </pre>
          ),
          blockquote: ({ children }) => (
            <blockquote style={{
              borderLeft: '4px solid #1890ff',
              padding: '12px 16px',
              margin: '16px 0',
              background: '#e6f7ff',
              borderRadius: '0 8px 8px 0',
              color: '#333',
              fontStyle: 'normal',
            }}>
              {children}
            </blockquote>
          ),
          table: ({ children }) => (
            <table style={{
              width: '100%',
              borderCollapse: 'collapse',
              margin: '16px 0',
              fontSize: '14px',
            }}>
              {children}
            </table>
          ),
          th: ({ children }) => (
            <th style={{
              border: '1px solid #e8e8e8',
              padding: '8px 12px',
              textAlign: 'left',
              background: '#fafafa',
              fontWeight: 600,
              color: '#333',
              borderBottom: '2px solid #1890ff',
            }}>
              {children}
            </th>
          ),
          td: ({ children }) => (
            <td style={{
              border: '1px solid #e8e8e8',
              padding: '8px 12px',
            }}>
              {children}
            </td>
          ),
          ul: ({ children }) => (
            <ul style={{
              paddingLeft: '24px',
              margin: '8px 0',
              color: '#333',
            }}>
              {children}
            </ul>
          ),
          ol: ({ children }) => (
            <ol style={{
              paddingLeft: '24px',
              margin: '8px 0',
              color: '#333',
            }}>
              {children}
            </ol>
          ),
          li: ({ children }) => (
            <li style={{
              margin: '4px 0',
              lineHeight: 1.8,
              color: '#333',
            }}>
              {children}
            </li>
          ),
          p: ({ children }) => (
            <p style={{
              margin: '12px 0',
              lineHeight: 1.8,
              color: '#1f1f1f',
              fontSize: '14px',
            }}>
              {children}
            </p>
          ),
          hr: () => (
            <hr style={{
              border: 'none',
              height: '1px',
              background: '#e8e8e8',
              margin: '24px 0',
            }} />
          ),
          a: ({ href, children }) => (
            <a href={href} style={{
              color: '#1890ff',
              textDecoration: 'none',
            }} onClick={(e) => {
              e.preventDefault();
              window.open(href, '_blank');
            }}>
              {children}
            </a>
          ),
          strong: ({ children }) => (
            <strong style={{
              fontWeight: 600,
              color: '#262626',
            }}>
              {children}
            </strong>
          ),
          em: ({ children }) => (
            <em style={{
              fontStyle: 'italic',
              color: '#595959',
            }}>
              {children}
            </em>
          ),
        }}
      >
        {content}
      </ReactMarkdown>
    </div>
  );
}
