export type UserRole = 'user' | 'superadmin'

export interface Profile {
  id: string
  email: string | null
  role: UserRole
  created_at: string
  updated_at: string
}

export interface ChatLogRowInsert {
  user_id: string
  session_key: string | null
  direction: 'in' | 'out'
  data: unknown
  logged_at: string
}
