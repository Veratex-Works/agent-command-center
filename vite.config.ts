import fs from 'node:fs'
import path from 'path'
import type { Connect, Plugin } from 'vite'
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

const WS_CHAT_LOG_FILE = path.resolve(__dirname, 'websocket-chat-logs.json')
/** Drop oldest `entries` when serialized file would exceed this size (bytes). */
const WS_CHAT_LOG_MAX_BYTES = 1024 * 1024 * 1024

type WsChatLogDoc = { sessionStarted: string; entries: unknown[] }

function serializedDocByteLength(doc: WsChatLogDoc): number {
  return Buffer.byteLength(JSON.stringify(doc, null, 2), 'utf8')
}

/** Remove oldest entries until the serialized document is at most `WS_CHAT_LOG_MAX_BYTES`. */
function trimOldestEntriesIfOversized(doc: WsChatLogDoc) {
  for (;;) {
    const size = serializedDocByteLength(doc)
    if (size <= WS_CHAT_LOG_MAX_BYTES) return
    if (doc.entries.length <= 1) return

    const remove = Math.max(1, Math.ceil(doc.entries.length * 0.1))
    doc.entries.splice(0, remove)
  }
}

function websocketChatLogMiddleware(): Connect.NextHandleFunction {
  let writeChain = Promise.resolve()

  return (req, res, next) => {
    const url = req.url?.split('?')[0]
    if (url !== '/__openclaw/ws-chat-log' || req.method !== 'POST') {
      next()
      return
    }

    const chunks: Buffer[] = []
    req.on('data', (chunk: Buffer) => {
      chunks.push(chunk)
    })
    req.on('end', () => {
      try {
        const body = Buffer.concat(chunks).toString('utf8')
        const parsed = JSON.parse(body) as { entries?: unknown[] }
        const entries = Array.isArray(parsed.entries) ? parsed.entries : []

        writeChain = writeChain
          .then(async () => {
            let doc: WsChatLogDoc
            try {
              const raw = await fs.promises.readFile(WS_CHAT_LOG_FILE, 'utf8')
              const existing = JSON.parse(raw) as { sessionStarted?: string; entries?: unknown[] }
              doc = {
                sessionStarted: existing.sessionStarted ?? new Date().toISOString(),
                entries: Array.isArray(existing.entries) ? existing.entries : [],
              }
            } catch {
              doc = { sessionStarted: new Date().toISOString(), entries: [] }
            }
            doc.entries.push(...entries)
            trimOldestEntriesIfOversized(doc)
            await fs.promises.writeFile(WS_CHAT_LOG_FILE, JSON.stringify(doc, null, 2), 'utf8')
          })
          .then(() => {
            res.statusCode = 204
            res.end()
          })
          .catch((err: unknown) => {
            res.statusCode = 500
            res.setHeader('Content-Type', 'text/plain')
            res.end(err instanceof Error ? err.message : String(err))
          })
      } catch (err: unknown) {
        res.statusCode = 400
        res.setHeader('Content-Type', 'text/plain')
        res.end(err instanceof Error ? err.message : String(err))
      }
    })
    req.on('error', next)
  }
}

function websocketChatLogPlugin(): Plugin {
  return {
    name: 'websocket-chat-log',
    configureServer(server) {
      server.middlewares.use(websocketChatLogMiddleware())
    },
  }
}

export default defineConfig({
  plugins: [react(), tailwindcss(), websocketChatLogPlugin()],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
})
