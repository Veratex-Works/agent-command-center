import { supabase } from '@/lib/supabase'
import type { WsChatLogEntry } from '@/lib/websocketChatLog'
import type { ChatLogRowInsert } from '@/types/database'

function jsonForDb(value: unknown): object {
  if (value !== null && typeof value === 'object' && !Array.isArray(value)) {
    return value as object
  }
  return { value }
}

export async function insertChatLogBatch(
  userId: string,
  sessionKey: string | null,
  entries: readonly WsChatLogEntry[],
): Promise<void> {
  if (!supabase || entries.length === 0) return

  const rows: ChatLogRowInsert[] = entries.map((e) => ({
    user_id: userId,
    session_key: sessionKey?.trim() || null,
    direction: e.direction,
    data: jsonForDb(e.data),
    logged_at: e.t,
  }))

  const { error } = await supabase.from('chat_logs').insert(rows)
  if (error) throw error
}
