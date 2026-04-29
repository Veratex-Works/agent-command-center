import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import { EditorContent, useEditor } from '@tiptap/react'
import StarterKit from '@tiptap/starter-kit'
import Placeholder from '@tiptap/extension-placeholder'
import type { Editor } from '@tiptap/core'
import { Bold, Italic, Paperclip, Send, Square, X } from 'lucide-react'
import { useChatStore } from '@/store/useChatStore'
import { htmlToMarkdown } from '@/lib/htmlToMarkdown'
import {
  assertFileWithinAttachmentLimit,
  formatBytes,
  OPENCLAW_CHAT_ATTACHMENT_MAX_BYTES,
} from '@/lib/chatAttachments'
import { filesFromClipboard } from '@/lib/clipboardFiles'
import type { ChatSendPayload } from '@/types'

const MAX_FILES_PER_MESSAGE = 12

interface PendingFile {
  id: string
  file: File
  previewUrl?: string
}

interface InputAreaProps {
  onSend: (payload: ChatSendPayload) => void | Promise<void>
  onAbort: () => void
}

export function InputArea({ onSend, onAbort }: InputAreaProps) {
  const { isRunning } = useChatStore()
  const editorRef = useRef<Editor | null>(null)
  const trySendRef = useRef<() => Promise<void>>(async () => {})
  const fileInputRef = useRef<HTMLInputElement>(null)
  const [pendingFiles, setPendingFiles] = useState<PendingFile[]>([])

  const extensions = useMemo(
    () => [
      StarterKit.configure({
        link: {
          openOnClick: false,
          autolink: true,
          defaultProtocol: 'https',
        },
      }),
      Placeholder.configure({
        placeholder: 'Message OpenClaw…',
        emptyEditorClass: 'is-editor-empty',
        emptyNodeClass: 'is-empty',
      }),
    ],
    [],
  )

  const addFilesRef = useRef<(list: FileList | File[]) => void>(() => {})

  const addFiles = useCallback((list: FileList | File[]) => {
    const incoming = Array.from(list)
    if (incoming.length === 0) return
    setPendingFiles((prev) => {
      const next = [...prev]
      for (const file of incoming) {
        if (next.length >= MAX_FILES_PER_MESSAGE) break
        try {
          assertFileWithinAttachmentLimit(file, OPENCLAW_CHAT_ATTACHMENT_MAX_BYTES)
        } catch {
          useChatStore.getState().addSystemMessage(
            `${file.name} exceeds the ${formatBytes(OPENCLAW_CHAT_ATTACHMENT_MAX_BYTES)} limit.`,
            'warn',
          )
          continue
        }
        const id = crypto.randomUUID()
        const previewUrl =
          file.type.startsWith('image/') && file.size < 8 * 1024 * 1024
            ? URL.createObjectURL(file)
            : undefined
        next.push({ id, file, previewUrl })
      }
      return next
    })
  }, [])

  addFilesRef.current = addFiles

  const removePending = useCallback((id: string) => {
    setPendingFiles((prev) => {
      const row = prev.find((p) => p.id === id)
      if (row?.previewUrl) URL.revokeObjectURL(row.previewUrl)
      return prev.filter((p) => p.id !== id)
    })
  }, [])

  const pendingRef = useRef(pendingFiles)
  pendingRef.current = pendingFiles
  useEffect(() => {
    return () => {
      pendingRef.current.forEach((p) => {
        if (p.previewUrl) URL.revokeObjectURL(p.previewUrl)
      })
    }
  }, [])

  const trySend = useCallback(async () => {
    const ed = editorRef.current
    if (!ed || useChatStore.getState().isRunning) return
    const markdown = htmlToMarkdown(ed.getHTML()).trim()
    const files = pendingFiles.map((p) => p.file)
    if (!markdown && files.length === 0) return

    const payload: ChatSendPayload = { text: markdown, files }
    await onSend(payload)

    pendingFiles.forEach((p) => {
      if (p.previewUrl) URL.revokeObjectURL(p.previewUrl)
    })
    setPendingFiles([])
    ed.commands.clearContent()
  }, [onSend, pendingFiles])

  useLayoutEffect(() => {
    trySendRef.current = trySend
  }, [trySend])

  const editor = useEditor({
    extensions,
    content: '',
    shouldRerenderOnTransaction: true,
    editorProps: {
      attributes: {
        class:
          'tiptap min-h-[22px] text-content font-sans text-sm leading-[1.5] outline-none',
      },
      handleKeyDown: (_view, event) => {
        if (event.key === 'Enter' && !event.shiftKey && !event.isComposing) {
          event.preventDefault()
          void trySendRef.current()
          return true
        }
        return false
      },
      handleDOMEvents: {
        paste: (_view, event) => {
          const e = event as ClipboardEvent
          const files = filesFromClipboard(e.clipboardData)
          if (files.length) {
            e.preventDefault()
            e.stopPropagation()
            addFilesRef.current(files)
            return true
          }
          return false
        },
      },
    },
  })

  useEffect(() => {
    editorRef.current = editor
  }, [editor])

  useEffect(() => {
    editor?.setEditable(!isRunning)
  }, [editor, isRunning])

  const onDropContainer = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault()
      e.stopPropagation()
      if (e.dataTransfer.files?.length) addFiles(e.dataTransfer.files)
    },
    [addFiles],
  )

  const onDragOverContainer = useCallback((e: React.DragEvent) => {
    e.preventDefault()
    e.dataTransfer.dropEffect = 'copy'
  }, [])

  const hasTypedText = Boolean(editor?.getText().trim())
  const canSend = !isRunning && (pendingFiles.length > 0 || hasTypedText)

  return (
    <div className="px-5 py-3.5 border-t border-border bg-surface flex-shrink-0">
      {pendingFiles.length > 0 && (
        <div className="flex flex-wrap gap-1.5 mb-2" aria-label="Pending attachments">
          {pendingFiles.map((p) => (
            <div
              key={p.id}
              className="flex items-center gap-1.5 pl-1 pr-1 py-0.5 rounded-md border border-border bg-surface2 text-[11px] text-muted max-w-[200px]"
            >
              {p.previewUrl ? (
                <img
                  src={p.previewUrl}
                  alt=""
                  className="w-7 h-7 rounded object-cover flex-shrink-0"
                />
              ) : null}
              <span className="truncate font-mono" title={p.file.name}>
                {p.file.name}
              </span>
              <span className="text-dim flex-shrink-0">{formatBytes(p.file.size)}</span>
              <button
                type="button"
                title="Remove"
                onClick={() => removePending(p.id)}
                className="p-0.5 rounded hover:bg-border text-dim hover:text-content flex-shrink-0"
              >
                <X size={12} strokeWidth={2.5} />
              </button>
            </div>
          ))}
        </div>
      )}

      <div
        className="flex gap-2.5 items-end bg-surface2 border border-border rounded-[12px] px-3.5 pt-2 pb-2 focus-within:border-[#3a4020] transition-colors duration-200"
        onDrop={onDropContainer}
        onDragOver={onDragOverContainer}
      >
        <input
          ref={fileInputRef}
          type="file"
          multiple
          className="hidden"
          accept="*/*"
          onChange={(e) => {
            if (e.target.files?.length) addFiles(e.target.files)
            e.target.value = ''
          }}
        />

        <button
          type="button"
          title="Attach files"
          disabled={isRunning || pendingFiles.length >= MAX_FILES_PER_MESSAGE}
          onClick={() => fileInputRef.current?.click()}
          className="mb-0.5 flex-shrink-0 w-8 h-8 rounded-md flex items-center justify-center text-muted hover:bg-border/60 hover:text-content disabled:opacity-30 disabled:cursor-not-allowed"
        >
          <Paperclip size={18} strokeWidth={2.2} />
        </button>

        <div className="flex-1 min-w-0 max-h-[120px] overflow-y-auto textarea-scrollbar">
          <EditorContent editor={editor} />
        </div>

        {editor && (
          <div className="flex gap-0.5 flex-shrink-0 pb-0.5" aria-label="Text formatting">
            <button
              type="button"
              title="Bold (⌘/Ctrl+B)"
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => editor.chain().focus().toggleBold().run()}
              className={`w-8 h-8 rounded-md flex items-center justify-center transition-colors ${
                editor.isActive('bold')
                  ? 'bg-border text-content'
                  : 'text-muted hover:bg-border/60 hover:text-content'
              }`}
            >
              <Bold size={16} strokeWidth={2.2} />
            </button>
            <button
              type="button"
              title="Italic (⌘/Ctrl+I)"
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => editor.chain().focus().toggleItalic().run()}
              className={`w-8 h-8 rounded-md flex items-center justify-center transition-colors ${
                editor.isActive('italic')
                  ? 'bg-border text-content'
                  : 'text-muted hover:bg-border/60 hover:text-content'
              }`}
            >
              <Italic size={16} strokeWidth={2.2} />
            </button>
          </div>
        )}

        {isRunning && (
          <button
            onClick={onAbort}
            title="Stop"
            className="bg-transparent border border-danger text-danger w-9 h-9 rounded-lg cursor-pointer flex items-center justify-center flex-shrink-0 transition-all duration-150 hover:bg-[rgba(255,90,90,0.1)]"
          >
            <Square size={14} fill="currentColor" />
          </button>
        )}

        <button
          type="button"
          onClick={() => void trySend()}
          disabled={!canSend}
          title="Send (Enter)"
          className="bg-accent border-none w-9 h-9 rounded-lg cursor-pointer flex items-center justify-center flex-shrink-0 text-base transition-all duration-150 hover:enabled:opacity-85 hover:enabled:scale-105 disabled:opacity-30 disabled:cursor-not-allowed"
        >
          <Send size={16} color="#0a0c10" strokeWidth={2.5} />
        </button>
      </div>

      <div className="font-mono text-[10px] text-dim mt-2 text-center">
        Enter to send · Shift+Enter for newline · Paste or drag files here · Up to {MAX_FILES_PER_MESSAGE} files (
        {formatBytes(OPENCLAW_CHAT_ATTACHMENT_MAX_BYTES)} each)
      </div>
    </div>
  )
}
