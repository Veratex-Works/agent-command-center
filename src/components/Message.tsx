import { createContext, useContext } from 'react'
import type { Components } from 'react-markdown'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import type { ChatMessage } from '@/types'

interface MessageProps {
  message: ChatMessage
}

const MarkdownInPreContext = createContext(false)

function markdownComponents(isUser: boolean): Components {
  const linkClass = isUser
    ? 'text-accent underline-offset-2 hover:underline break-all'
    : 'text-accent2 underline-offset-2 hover:underline break-all'

  return {
    p: ({ children }) => <p className="my-1.5 first:mt-0 last:mb-0">{children}</p>,
    strong: ({ children }) => <strong className="font-semibold">{children}</strong>,
    em: ({ children }) => <em className="italic">{children}</em>,
    a: ({ href, children }) => (
      <a href={href} className={linkClass} target="_blank" rel="noopener noreferrer">
        {children}
      </a>
    ),
    ul: ({ children }) => <ul className="my-1.5 list-disc pl-5 first:mt-0 last:mb-0">{children}</ul>,
    ol: ({ children }) => <ol className="my-1.5 list-decimal pl-5 first:mt-0 last:mb-0">{children}</ol>,
    li: ({ children }) => <li className="my-0.5">{children}</li>,
    h1: ({ children }) => <h1 className="mt-2 mb-1 text-base font-bold first:mt-0">{children}</h1>,
    h2: ({ children }) => <h2 className="mt-2 mb-1 text-[15px] font-bold first:mt-0">{children}</h2>,
    h3: ({ children }) => <h3 className="mt-1.5 mb-1 text-sm font-bold first:mt-0">{children}</h3>,
    blockquote: ({ children }) => (
      <blockquote className="my-2 border-l-2 border-dim pl-3 text-muted">{children}</blockquote>
    ),
    hr: () => <hr className="my-3 border-border" />,
    pre: ({ children }) => (
      <MarkdownInPreContext.Provider value={true}>
        <pre className="my-2 overflow-x-auto rounded-md border border-border bg-surface2 p-3 text-[13px] leading-relaxed">
          {children}
        </pre>
      </MarkdownInPreContext.Provider>
    ),
    code: function MarkdownCode({ className, children, ...props }) {
      const inPre = useContext(MarkdownInPreContext)
      if (inPre) {
        return (
          <code
            className={`block whitespace-pre font-mono text-[13px] text-content ${className ?? ''}`}
            {...props}
          >
            {children}
          </code>
        )
      }
      return (
        <code
          className="rounded border border-border bg-surface2 px-1 py-0.5 font-mono text-[12px]"
          {...props}
        >
          {children}
        </code>
      )
    },
    table: ({ children }) => (
      <div className="my-2 overflow-x-auto">
        <table className="w-full border-collapse text-left text-xs">{children}</table>
      </div>
    ),
    thead: ({ children }) => <thead className="border-b border-border">{children}</thead>,
    th: ({ children }) => (
      <th className="border border-border px-2 py-1 font-semibold text-content">{children}</th>
    ),
    td: ({ children }) => <td className="border border-border px-2 py-1">{children}</td>,
  }
}

export function Message({ message }: MessageProps) {
  const { type, content, ts, variant, streaming } = message

  if (type === 'system') {
    const variantClass =
      variant === 'warn'
        ? 'border-[#5a3a20] text-[#c8804a]'
        : variant === 'ok'
          ? 'border-[#2a5a40] text-accent2'
          : 'border-border text-dim'

    return (
      <div className="flex self-center animate-msg-in max-w-[90%]">
        <div
          className={`font-mono text-[11px] px-3.5 py-1.5 rounded-full border bg-transparent ${variantClass}`}
        >
          {content}
        </div>
      </div>
    )
  }

  const isUser = type === 'user'
  const isBot = type === 'bot'
  const usePlainWhileStreaming = isBot && streaming
  const bubbleClass = `px-[15px] py-[11px] rounded-[12px] text-sm leading-[1.65] break-words ${
    isUser
      ? 'bg-user-bubble border border-user-border rounded-br-[3px] text-accent2'
      : 'bg-surface border border-border rounded-bl-[3px] text-content'
  }`

  return (
    <div
      className={`flex flex-col max-w-[82%] animate-msg-in ${
        isUser ? 'self-end items-end' : 'self-start items-start'
      }`}
    >
      {ts && (
        <div className="font-mono text-[10px] text-dim mb-1 px-1">
          {ts}
        </div>
      )}
      <div className={bubbleClass}>
        {usePlainWhileStreaming ? (
          <span className="whitespace-pre-wrap">{content}</span>
        ) : (
          <ReactMarkdown remarkPlugins={[remarkGfm]} components={markdownComponents(isUser)}>
            {content}
          </ReactMarkdown>
        )}
      </div>
    </div>
  )
}
