import { createContext, useContext, useMemo } from 'react'
import type { Components } from 'react-markdown'
import { File } from 'lucide-react'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import { formatBytes } from '@/lib/chatAttachments'
import {
  extractMediaDirectivesFromMarkdown,
  type ParsedMediaDirective,
} from '@/lib/parseMediaAttachedInBody'
import type { ChatArtifact, ChatMessage } from '@/types'

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

function OutboundAttachmentList({ items }: { items: NonNullable<ChatMessage['attachments']> }) {
  return (
    <ul className="mt-2 mb-0 pl-0 list-none flex flex-col gap-1 text-[11px] font-mono text-dim">
      {items.map((a, i) => (
        <li key={`${a.name}-${i}-${a.size}`} className="flex flex-wrap gap-x-2 gap-y-0">
          <span className="text-accent2/90 truncate max-w-[220px]" title={a.name}>
            {a.name}
          </span>
          <span>{formatBytes(a.size)}</span>
          <span className="opacity-70">{a.mimeType}</span>
        </li>
      ))}
    </ul>
  )
}

function downloadFromArtifact(a: ChatArtifact) {
  const label = (a.name || 'download').replace(/[/\\]/g, '-')
  if (!a.dataBase64) return
  try {
    const bin = atob(a.dataBase64)
    const bytes = new Uint8Array(bin.length)
    for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i)
    const blob = new Blob([bytes], { type: a.mimeType || 'application/octet-stream' })
    const url = URL.createObjectURL(blob)
    const el = document.createElement('a')
    el.href = url
    el.download = label
    el.rel = 'noopener'
    el.click()
    URL.revokeObjectURL(url)
  } catch {
    /* binary too large or invalid base64 in some engines */
  }
}

function GatewayMediaChips({
  directives,
  isUser,
  withTopMargin,
}: {
  directives: ParsedMediaDirective[]
  isUser: boolean
  withTopMargin: boolean
}) {
  const chipClass = isUser
    ? 'border-user-border bg-[rgba(0,0,0,0.15)] text-accent2'
    : 'border-border bg-surface2 text-content'

  return (
    <div className={`flex flex-col gap-1.5 ${withTopMargin ? 'mt-2' : ''}`} aria-label="Gateway-staged files">
      {directives.map((d) => (
        <div
          key={d.uri}
          className={`flex items-start gap-2 rounded-lg border px-2.5 py-2 text-left ${chipClass}`}
        >
          <File size={16} className="flex-shrink-0 mt-0.5 opacity-80" strokeWidth={2} />
          <div className="min-w-0 flex-1">
            <div className="font-mono text-[12px] font-medium truncate" title={d.label}>
              {d.label}
            </div>
            <div className="text-[10px] text-dim leading-snug mt-0.5">
              Gateway staging for the agent — <code className="text-[10px]">media://</code> is not a browser link.
              If the agent cannot read it, check OpenClaw workspace / tool policy on the server.
            </div>
          </div>
        </div>
      ))}
    </div>
  )
}

function MessageArtifacts({ artifacts, isUser }: { artifacts: ChatArtifact[]; isUser: boolean }) {
  const linkClass = isUser
    ? 'text-accent underline-offset-2 hover:underline break-all text-xs font-sans'
    : 'text-accent2 underline-offset-2 hover:underline break-all text-xs font-sans'

  return (
    <div className="mt-2 flex flex-col gap-3 border-t border-border/50 pt-2 first:mt-0 first:border-t-0 first:pt-0">
      {artifacts.map((a) => {
        const label = a.name || (a.kind === 'image' ? 'Image' : 'File')
        const canBlobDownload = Boolean(a.dataBase64)
        const showThumb =
          a.kind === 'image' &&
          a.dataBase64 &&
          (a.mimeType?.startsWith('image/') ?? false)

        return (
          <div key={a.id} className="flex flex-col gap-1.5">
            {showThumb && a.mimeType ? (
              <img
                src={`data:${a.mimeType};base64,${a.dataBase64}`}
                alt=""
                className="max-h-44 max-w-full rounded-md border border-border object-contain"
              />
            ) : null}
            <div className="flex flex-wrap items-center gap-2 text-[11px] font-mono text-dim">
              <span className="truncate max-w-[240px] text-content" title={label}>
                {label}
              </span>
              {a.mimeType ? <span className="opacity-80">{a.mimeType}</span> : null}
              {a.href ? (
                <a href={a.href} className={linkClass} target="_blank" rel="noopener noreferrer">
                  Open
                </a>
              ) : null}
              {canBlobDownload ? (
                <button
                  type="button"
                  className={`${linkClass} bg-transparent border-none cursor-pointer p-0 font-sans`}
                  onClick={() => downloadFromArtifact(a)}
                >
                  Download
                </button>
              ) : null}
              {!a.href && !canBlobDownload ? (
                <span className="italic opacity-70">Preview not available in chat</span>
              ) : null}
            </div>
          </div>
        )
      })}
    </div>
  )
}

export function Message({ message }: MessageProps) {
  const { type, content, ts, variant, streaming, attachments, artifacts, renderAsPre } = message

  const isUser = type === 'user'
  const isBot = type === 'bot'
  const usePlainWhileStreaming = isBot && streaming
  const { strippedMarkdown, directives } = useMemo(
    () =>
      type === 'system' || renderAsPre || usePlainWhileStreaming
        ? { strippedMarkdown: content, directives: [] as ParsedMediaDirective[] }
        : extractMediaDirectivesFromMarkdown(content),
    [content, type, usePlainWhileStreaming, renderAsPre],
  )

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
  const showMarkdownBody = strippedMarkdown.trim().length > 0
  /** OpenClaw echoes `[media attached: media://…]` into transcript text; show chips only on assistant bubbles so user rows stay "your file" metadata only. */
  const showGatewayMediaChips = directives.length > 0 && !isUser
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
        ) : renderAsPre ? (
          <pre className="m-0 max-h-[min(70vh,520px)] overflow-auto whitespace-pre-wrap break-words text-[11px] leading-relaxed font-mono text-content">
            {content}
          </pre>
        ) : (
          <>
            {showMarkdownBody ? (
              <ReactMarkdown remarkPlugins={[remarkGfm]} components={markdownComponents(isUser)}>
                {strippedMarkdown}
              </ReactMarkdown>
            ) : null}
            {showGatewayMediaChips ? (
              <GatewayMediaChips
                directives={directives}
                isUser={isUser}
                withTopMargin={showMarkdownBody}
              />
            ) : null}
            {!showMarkdownBody &&
            !showGatewayMediaChips &&
            !attachments?.length &&
            !artifacts?.length ? (
              <span className="text-dim text-xs italic">Empty message</span>
            ) : null}
            {attachments && attachments.length > 0 ? (
              <OutboundAttachmentList items={attachments} />
            ) : null}
            {artifacts && artifacts.length > 0 ? (
              <MessageArtifacts artifacts={artifacts} isUser={isUser} />
            ) : null}
          </>
        )}
      </div>
    </div>
  )
}
