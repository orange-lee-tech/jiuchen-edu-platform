export const DEEPSEEK_PRICE_PARSER_VERSION = 'deepseek-table-v1-20261030'
export type DeepseekPriceDraft = { model: string; currency: 'USD'; unit: 'per_1000000_tokens';
  inputCacheHitPerMillion: number; inputCacheMissPerMillion: number; outputPerMillion: number;
  peakInputCacheHitPerMillion: number; peakInputCacheMissPerMillion: number; peakOutputPerMillion: number;
  peakWindowUtc: string }
const peakRule = 'Weekdays except Chinese public holidays: 01:00-04:00 and 06:00-10:00 UTC; other times off-peak'

/** Unknown layouts fail closed and never replace reviewed prices. */
export function parseDeepseekPriceDraft(html: string): DeepseekPriceDraft[] {
  const table = [...html.matchAll(/<table\b[^>]*>[\s\S]*?<\/table>/gi)].find(match =>
    /CACHE\s+HIT/i.test(match[0]) && /CACHE\s+MISS/i.test(match[0]))?.[0]
  if (!table || !/01:00\s*[-–]\s*04:00/.test(html) || !/06:00\s*[-–]\s*10:00/.test(html) ||
      !/Chinese public holidays/i.test(html)) throw new Error('price_layout_or_peak_rule_unrecognized')
  const grid: string[][] = [], occupied: Record<number, { value: string; remaining: number }> = {}
  for (const row of table.matchAll(/<tr\b[^>]*>([\s\S]*?)<\/tr>/gi)) {
    const cells: string[] = []
    for (const [column, item] of Object.entries(occupied)) {
      cells[Number(column)] = item.value
      if (--item.remaining === 0) delete occupied[Number(column)]
    }
    let column = 0
    for (const cell of row[1].matchAll(/<(?:td|th)\b([^>]*)>([\s\S]*?)<\/(?:td|th)>/gi)) {
      while (cells[column] !== undefined) column++
      const text = cell[2].replace(/<sup\b[^>]*>[\s\S]*?<\/sup>/gi, '').replace(/<[^>]*>/g, ' ')
        .replace(/&nbsp;|&#160;/g, ' ').replace(/&amp;/g, '&').replace(/\s+/g, ' ').trim()
      const span = Number(/colspan=["']?(\d+)/i.exec(cell[1])?.[1] ?? 1)
      const height = Number(/rowspan=["']?(\d+)/i.exec(cell[1])?.[1] ?? 1)
      if (span > 10 || height > 20) throw new Error('price_layout_unrecognized')
      for (let offset = 0; offset < span; offset++) {
        cells[column + offset] = text
        if (height > 1) occupied[column + offset] = { value: text, remaining: height - 1 }
      }
      column += span
    }
    grid.push(cells)
  }
  const header = grid.find(row => row[0] === 'MODEL')
  if (!header || header.length < 4) throw new Error('price_models_missing')
  const modelColumns = header.map((value, column) => ({ value, column })).filter(row => /^deepseek-[a-z0-9.-]+$/.test(row.value))
  if (!modelColumns.length || modelColumns.length > 10) throw new Error('price_models_missing')
  const rate = (column: number, kind: string, peak: boolean) => {
    const row = grid.find(row => row[0] === 'PRICING' && row[1] === kind && row[2] === (peak ? 'PEAK' : 'OFF-PEAK'))
    const value = row?.[column]
    if (!value || !/^\$\d+(?:\.\d+)?$/.test(value)) throw new Error('price_rate_missing_or_currency_unknown')
    return Number(value.slice(1))
  }
  return modelColumns.map(({ value: model, column }) => ({ model, currency: 'USD', unit: 'per_1000000_tokens',
    inputCacheHitPerMillion: rate(column, '1M INPUT TOKENS (CACHE HIT)', false),
    inputCacheMissPerMillion: rate(column, '1M INPUT TOKENS (CACHE MISS)', false),
    outputPerMillion: rate(column, '1M OUTPUT TOKENS', false),
    peakInputCacheHitPerMillion: rate(column, '1M INPUT TOKENS (CACHE HIT)', true),
    peakInputCacheMissPerMillion: rate(column, '1M INPUT TOKENS (CACHE MISS)', true),
    peakOutputPerMillion: rate(column, '1M OUTPUT TOKENS', true), peakWindowUtc: peakRule }))
}
