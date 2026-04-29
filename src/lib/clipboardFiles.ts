/** Collect pasted files: `files` when set (e.g. Explorer copy), else `items` (common for screenshot / copy-image). */
export function filesFromClipboard(data: DataTransfer | null): File[] {
  if (!data) return []
  if (data.files?.length) return Array.from(data.files)
  const out: File[] = []
  for (let i = 0; i < data.items.length; i++) {
    const it = data.items[i]
    if (it.kind === 'file') {
      const f = it.getAsFile()
      if (f) out.push(f)
    }
  }
  return out
}
