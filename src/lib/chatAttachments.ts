/**
 * OpenClaw gateway `chat.send` attachments — see `ChatSendParamsSchema` and
 * `parseMessageWithAttachments` in openclaw/openclaw (`src/gateway/chat-attachments.ts`):
 * each item uses `fileName`, `mimeType`, and `content` as base64 or `data:*;base64,...`.
 */
export const OPENCLAW_CHAT_ATTACHMENT_MAX_BYTES = 20 * 1024 * 1024

/** Example `hello-ok.policy.maxPayload` when policy is missing. */
export const OPENCLAW_DEFAULT_WS_MAX_PAYLOAD_BYTES = 25 * 1024 * 1024

export type OpenClawChatAttachmentWire = {
  fileName: string
  mimeType: string
  content: string
}

export function assertFileWithinAttachmentLimit(file: File, maxBytes: number): void {
  if (file.size > maxBytes) {
    throw new Error(
      `${file.name} is too large (${formatBytes(file.size)}). Max per file is ${formatBytes(maxBytes)}.`,
    )
  }
}

export function formatBytes(n: number): string {
  if (n < 1024) return `${n} B`
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`
  return `${(n / (1024 * 1024)).toFixed(1)} MB`
}

export function fileToOpenClawAttachment(file: File): Promise<OpenClawChatAttachmentWire> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => {
      const dataUrl = reader.result
      if (typeof dataUrl !== 'string') {
        reject(new Error(`Could not read ${file.name}`))
        return
      }
      const m = /^data:([^;,]*);base64,(.*)$/s.exec(dataUrl)
      if (!m) {
        reject(new Error(`Could not read ${file.name} as base64`))
        return
      }
      const mimeFromDataUrl = m[1]?.trim()
      const mimeType =
        (file.type && file.type.trim()) ||
        (mimeFromDataUrl && mimeFromDataUrl !== '' ? mimeFromDataUrl : 'application/octet-stream')
      resolve({
        fileName: file.name,
        mimeType,
        content: m[2],
      })
    }
    reader.onerror = () => reject(reader.error ?? new Error(`Could not read ${file.name}`))
    reader.readAsDataURL(file)
  })
}

/** Rough UTF-16 / JSON byte size upper bound for WS frame budgeting. */
export function estimateChatSendJsonBytes(message: string, attachments: OpenClawChatAttachmentWire[]): number {
  let n = message.length * 2 + 512
  for (const a of attachments) {
    n += (a.fileName.length + a.mimeType.length + a.content.length) * 2 + 64
  }
  return n
}
