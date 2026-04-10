import { useState } from 'react'
import { Eye, EyeOff } from 'lucide-react'

const inputBase =
  'bg-surface2 border border-border text-content font-mono text-[13px] px-3 py-2.5 rounded-lg outline-none transition-colors duration-200 focus:border-accent w-full'

type DeployBotSecretFieldProps = {
  value: string
  onChange: (value: string) => void
  isSecret: boolean
  className?: string
}

export function DeployBotSecretField({
  value,
  onChange,
  isSecret,
  className,
}: DeployBotSecretFieldProps) {
  const [visible, setVisible] = useState(false)
  const cls = className ?? inputBase

  if (!isSecret) {
    return (
      <input
        type="text"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        autoComplete="off"
        spellCheck={false}
        className={cls}
      />
    )
  }

  return (
    <div className="relative flex items-center">
      <input
        type={visible ? 'text' : 'password'}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        autoComplete="off"
        spellCheck={false}
        className={`${cls} pr-10`}
      />
      <button
        type="button"
        aria-label={visible ? 'Hide value' : 'Reveal value'}
        onClick={() => setVisible((v) => !v)}
        className="absolute right-2 p-1 rounded-md text-muted hover:text-accent transition-colors"
      >
        {visible ? <EyeOff size={16} strokeWidth={2} /> : <Eye size={16} strokeWidth={2} />}
      </button>
    </div>
  )
}
