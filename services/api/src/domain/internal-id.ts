export function normalizeInternalBusinessId(value: string) {
  const compact = value.trim().toUpperCase().replace(/[^A-Z0-9]/g, '')
  const match = compact.match(/^(JC[STA])([A-Z0-9]{4})([A-Z0-9]{4})$/)

  if (match) {
    return `${match[1]}-${match[2]}-${match[3]}`
  }

  return value.trim().toUpperCase()
}
