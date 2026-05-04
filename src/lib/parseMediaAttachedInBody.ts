/**
 * OpenClaw injects `[media attached: media://inbound/<file>]` into visible transcript
 * text when user attachments are staged for the agent. Browsers cannot resolve
 * `media://` — this helper strips those tokens for markdown rendering and returns
 * structured labels for a separate UI row.
 */
export type ParsedMediaDirective = {
  uri: string
  /** Best-effort display name (path segment, URI-decoded). */
  label: string
}

const MEDIA_ATTACHED_RE = /\[media attached:\s*(media:\/\/[^\]\s]+)\]/gi

function labelFromMediaUri(uri: string): string {
  const trimmed = uri.trim()
  const withoutScheme = trimmed.replace(/^media:\/\//i, '')
  const parts = withoutScheme.split('/').filter(Boolean)
  const last = parts[parts.length - 1] ?? trimmed
  try {
    return decodeURIComponent(last)
  } catch {
    return last
  }
}

export function extractMediaDirectivesFromMarkdown(markdown: string): {
  strippedMarkdown: string
  directives: ParsedMediaDirective[]
} {
  const directives: ParsedMediaDirective[] = []
  const stripped = markdown.replace(MEDIA_ATTACHED_RE, (_full, uri: string) => {
    const u = String(uri).trim()
    directives.push({ uri: u, label: labelFromMediaUri(u) })
    return ''
  })
  const collapsed = stripped
    .replace(/[ \t]+\n/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim()
  return { strippedMarkdown: collapsed, directives }
}
