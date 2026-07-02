function pad(value: number) {
  return String(value).padStart(2, '0')
}

function normalizeDateInput(value: string) {
  const trimmed = value.trim()
  if (/^\d{4}-\d{2}-\d{2}$/.test(trimmed)) return trimmed
  if (/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}/.test(trimmed)) {
    return trimmed.replace(' ', 'T')
  }
  return trimmed
}

export function formatDateTime(value?: string): string {
  if (!value) return '暂无'

  const normalized = normalizeDateInput(value)
  if (/^\d{4}-\d{2}-\d{2}$/.test(normalized)) return normalized

  const date = new Date(normalized)
  if (Number.isNaN(date.getTime())) return '暂无'

  return [
    date.getFullYear(),
    pad(date.getMonth() + 1),
    pad(date.getDate()),
  ].join('-') + ` ${pad(date.getHours())}:${pad(date.getMinutes())}`
}
