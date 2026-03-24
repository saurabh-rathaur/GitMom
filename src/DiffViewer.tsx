type Props = {
  text: string
  className?: string
  emptyHint?: string
}

/** Renders unified diff with line-based colors (+/-/@@/headers). */
export function DiffViewer({ text, className = '', emptyHint = 'No diff output yet.' }: Props) {
  const trimmed = text.trim()
  if (!trimmed) {
    return <div className="diff-viewer diff-viewer--empty">{emptyHint}</div>
  }

  const lines = text.split(/\n/)

  return (
    <div className={`diff-viewer ${className}`.trim()}>
      {lines.map((line, i) => {
        let mod = ''
        if (
          line.startsWith('diff --git ') ||
          line.startsWith('index ') ||
          line.startsWith('+++ ') ||
          line.startsWith('--- ') ||
          line.startsWith('Binary files ')
        ) {
          mod = 'diff-viewer__line--meta'
        } else if (line.startsWith('+')) {
          mod = 'diff-viewer__line--add'
        } else if (line.startsWith('-')) {
          mod = 'diff-viewer__line--del'
        } else if (line.startsWith('@@')) {
          mod = 'diff-viewer__line--hunk'
        }
        return (
          <div key={i} className={`diff-viewer__line ${mod}`.trim()}>
            <span className="diff-viewer__gutter" aria-hidden>
              {i + 1}
            </span>
            <code className="diff-viewer__text">{line.length ? line : ' '}</code>
          </div>
        )
      })}
    </div>
  )
}
