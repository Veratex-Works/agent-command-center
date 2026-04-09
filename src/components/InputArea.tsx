import { useCallback, useEffect, useLayoutEffect, useMemo, useRef } from 'react'
import { EditorContent, useEditor } from '@tiptap/react'
import StarterKit from '@tiptap/starter-kit'
import Placeholder from '@tiptap/extension-placeholder'
import type { Editor } from '@tiptap/core'
import { Bold, Italic, Send, Square } from 'lucide-react'
import { useChatStore } from '@/store/useChatStore'
import { htmlToMarkdown } from '@/lib/htmlToMarkdown'

interface InputAreaProps {
  onSend: (text: string) => void
  onAbort: () => void
}

export function InputArea({ onSend, onAbort }: InputAreaProps) {
  const { isRunning } = useChatStore()
  const editorRef = useRef<Editor | null>(null)
  const trySendRef = useRef<() => void>(() => {})

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

  const trySend = useCallback(() => {
    const ed = editorRef.current
    if (!ed || useChatStore.getState().isRunning || ed.isEmpty) return
    const markdown = htmlToMarkdown(ed.getHTML())
    if (!markdown) return
    onSend(markdown)
    ed.commands.clearContent()
  }, [onSend])

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
          trySendRef.current()
          return true
        }
        return false
      },
    },
  })

  useEffect(() => {
    editorRef.current = editor
  }, [editor])

  useEffect(() => {
    editor?.setEditable(!isRunning)
  }, [editor, isRunning])

  return (
    <div className="px-5 py-3.5 border-t border-border bg-surface flex-shrink-0">
      <div className="flex gap-2.5 items-end bg-surface2 border border-border rounded-[12px] px-3.5 pt-2 pb-2 focus-within:border-[#3a4020] transition-colors duration-200">
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
          onClick={trySend}
          disabled={isRunning}
          title="Send (Enter)"
          className="bg-accent border-none w-9 h-9 rounded-lg cursor-pointer flex items-center justify-center flex-shrink-0 text-base transition-all duration-150 hover:enabled:opacity-85 hover:enabled:scale-105 disabled:opacity-30 disabled:cursor-not-allowed"
        >
          <Send size={16} color="#0a0c10" strokeWidth={2.5} />
        </button>
      </div>

      <div className="font-mono text-[10px] text-dim mt-2 text-center">
        Enter to send · Shift+Enter for newline · ⌘/Ctrl+B · ⌘/Ctrl+I
      </div>
    </div>
  )
}
