import type { ChatArtifact, GatewayPayload, HistoryMessage } from '@/types'

let artifactSeq = 0
function nextArtifactId(): string {
  return `art-${++artifactSeq}`
}

function dedupeArtifacts(items: ChatArtifact[]): ChatArtifact[] {
  const seen = new Set<string>()
  const out: ChatArtifact[] = []
  for (const a of items) {
    const key = `${a.href ?? ''}|${(a.dataBase64 ?? '').slice(0, 64)}|${a.mimeType ?? ''}|${a.kind}`
    if (seen.has(key)) continue
    seen.add(key)
    out.push(a)
  }
  return out
}

function artifactsFromBlock(b: Record<string, unknown>): ChatArtifact[] {
  const out: ChatArtifact[] = []
  const typ = typeof b.type === 'string' ? b.type.toLowerCase() : ''

  const inline = (b.inlineData ?? b.inline_data) as Record<string, unknown> | undefined
  if (inline && typeof inline === 'object' && typeof inline.data === 'string') {
    const mime =
      (typeof inline.mimeType === 'string' && inline.mimeType) ||
      (typeof inline.mime_type === 'string' && inline.mime_type) ||
      'application/octet-stream'
    const kind: ChatArtifact['kind'] = mime.startsWith('image/') ? 'image' : 'file'
    out.push({
      id: nextArtifactId(),
      kind,
      mimeType: mime,
      dataBase64: inline.data,
      name: typ || kind,
    })
    return out
  }

  if (typ === 'image_url') {
    const iu = b.image_url as Record<string, unknown> | string | undefined
    const url = typeof iu === 'string' ? iu : iu && typeof iu.url === 'string' ? iu.url : ''
    if (url) {
      const kind: ChatArtifact['kind'] = /^https?:\/\//i.test(url) && /\.(png|jpe?g|gif|webp|svg)(\?|$)/i.test(url)
        ? 'image'
        : 'file'
      out.push({ id: nextArtifactId(), kind, href: url, name: 'Image' })
    }
    return out
  }

  if (typ === 'image' || typ === 'input_image') {
    const src = b.source as Record<string, unknown> | undefined
    if (src && typeof src === 'object') {
      if (src.type === 'url' && typeof src.url === 'string') {
        out.push({ id: nextArtifactId(), kind: 'image', href: src.url, name: 'Image' })
      } else if (
        (src.type === 'base64' || src.type === 'image') &&
        typeof src.data === 'string'
      ) {
        const mime =
          (typeof src.media_type === 'string' && src.media_type) ||
          (typeof src.mime_type === 'string' && src.mime_type) ||
          'image/png'
        out.push({
          id: nextArtifactId(),
          kind: 'image',
          mimeType: mime,
          dataBase64: src.data,
          name: 'Image',
        })
      }
    }
    return out
  }

  if (typ === 'document') {
    const src = b.source as Record<string, unknown> | undefined
    if (src && typeof src === 'object') {
      if (typeof src.data === 'string') {
        const mime =
          (typeof src.media_type === 'string' && src.media_type) ||
          (typeof src.mimeType === 'string' && src.mimeType) ||
          'application/pdf'
        out.push({
          id: nextArtifactId(),
          kind: 'file',
          mimeType: mime,
          dataBase64: src.data,
          name: typeof b.title === 'string' ? b.title : 'Document',
        })
      }
    }
    return out
  }

  if (typ === 'file') {
    const file = (typeof b.file === 'object' && b.file !== null ? b.file : b) as Record<string, unknown>
    if (typeof file.file_id === 'string') {
      out.push({
        id: nextArtifactId(),
        kind: 'file',
        name: typeof b.filename === 'string' ? b.filename : 'File',
        mimeType: typeof file.mime_type === 'string' ? file.mime_type : undefined,
      })
    }
    if (typeof file.url === 'string') {
      out.push({
        id: nextArtifactId(),
        kind: 'file',
        href: file.url,
        name: typeof b.filename === 'string' ? b.filename : 'Document',
        mimeType: typeof file.mime_type === 'string' ? file.mime_type : undefined,
      })
    }
    return out
  }

  return out
}

export function artifactsFromContentBlocks(content: HistoryMessage['content']): ChatArtifact[] {
  if (!Array.isArray(content)) return []
  const combined: ChatArtifact[] = []
  for (const block of content) {
    if (!block || typeof block !== 'object' || Array.isArray(block)) continue
    combined.push(...artifactsFromBlock(block as unknown as Record<string, unknown>))
  }
  return dedupeArtifacts(combined)
}

export function extractArtifactsFromHistoryMessage(msg: HistoryMessage): ChatArtifact[] {
  const fromContent = artifactsFromContentBlocks(msg.content)
  const fromParts = msg.parts ? artifactsFromContentBlocks(msg.parts as HistoryMessage['content']) : []
  return dedupeArtifacts([...fromContent, ...fromParts])
}

export function extractArtifactsFromChatPayload(
  p: GatewayPayload['payload'] | undefined,
): ChatArtifact[] {
  if (!p) return []
  if (p.message) {
    return extractArtifactsFromHistoryMessage(p.message as HistoryMessage)
  }
  if (p.role === 'assistant') {
    const c = p.content
    if (Array.isArray(c)) {
      return artifactsFromContentBlocks(c as HistoryMessage['content'])
    }
  }
  const msgs = p.messages
  if (Array.isArray(msgs) && msgs.length) {
    const lastAssistant = [...msgs]
      .reverse()
      .find((x: { role?: string }) => x.role === 'assistant' || x.role === 'model')
    if (lastAssistant) {
      return extractArtifactsFromHistoryMessage(lastAssistant as HistoryMessage)
    }
  }
  return []
}
