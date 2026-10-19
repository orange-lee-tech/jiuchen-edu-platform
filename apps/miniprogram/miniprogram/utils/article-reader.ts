// Native rich-text nodes: allowlisted content only, never executable HTML.
export type ArticleNode = { type: 'text'; text: string } | { name: string; attrs: Record<string, string>; children: ArticleNode[] }
const TAGS = new Set('p div section span strong b em i u s h1 h2 h3 h4 h5 h6 ul ol li blockquote br hr img table tbody tr td th'.split(' '))
const DROP = new Set('script style iframe object embed video audio form input button svg canvas'.split(' '))
function decode(value: string) {
  return value.replace(/&(?:amp|lt|gt|quot|apos|nbsp|#\d+|#x[\da-f]+);/gi, s => {
    const names: Record<string, string> = { '&amp;': '&', '&lt;': '<', '&gt;': '>', '&quot;': '"', '&apos;': "'", '&nbsp;': ' ' }
    if (names[s.toLowerCase()]) return names[s.toLowerCase()]
    const code = s[2].toLowerCase() === 'x' ? parseInt(s.slice(3, -1), 16) : Number(s.slice(2, -1))
    return code > 0 && code <= 0x10ffff ? String.fromCodePoint(code) : ''
  })
}
export function articleReaderNodes(html: string): ArticleNode[] {
  const root: ArticleNode[] = []
  const stack: Array<{ tag: string; children: ArticleNode[]; hidden: boolean }> = [{ tag: '', children: root, hidden: false }]
  const tokens = html.match(/<!--[\s\S]*?-->|<[^>]*>|[^<]+/g) || []
  for (const token of tokens) {
    const current = stack[stack.length - 1]
    if (token.startsWith('<!--')) continue
    if (!token.startsWith('<')) { if (!current.hidden) current.children.push({ type: 'text', text: decode(token) }); continue }
    const close = token.match(/^<\/\s*([\w-]+)/)
    if (close) {
      const index = stack.map(n => n.tag).lastIndexOf(close[1].toLowerCase())
      if (index > 0) stack.splice(index)
      continue
    }
    const name = token.match(/^<\s*([\w-]+)/)?.[1].toLowerCase()
    if (!name) continue
    const attributes: Record<string, string> = {}
    for (const match of token.matchAll(/([\w-]+)\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s>]+))/g)) {
      const key = match[1].toLowerCase()
      // Duplicate style attributes occur in existing OA normalization; inspect ALL.
      attributes[key] = key === 'style' ? (attributes[key] || '') + ';' + (match[2] ?? match[3] ?? match[4]) : decode(match[2] ?? match[3] ?? match[4])
    }
    const hidden = current.hidden || DROP.has(name) || /(?:display\s*:\s*none|visibility\s*:\s*hidden|opacity\s*:\s*0(?:\s|;|$))/i.test(attributes.style || '')
    const node: ArticleNode = { name: TAGS.has(name) ? name : 'div', attrs: {}, children: [] }
    if (name === 'img') {
      const src = attributes['data-src'] || attributes.src || ''
      if (!/^https:\/\/[^\s"<>]+$/i.test(src)) continue
      node.attrs = { src, style: 'max-width:100%;height:auto;display:block;', alt: attributes.alt || '' }
    } else {
      const safe = (attributes.style || '').split(';').filter(declaration => {
        const [key, val = ''] = declaration.split(':')
        if (key.trim().toLowerCase() === 'line-height') return /^\s*(?:1(?:\.\d+)?|2(?:\.[0-5])?|(?:[12]\d|[34]\d)px)\s*$/i.test(val)
        return /^(color|background-color|font-weight|font-style|text-align|text-decoration)$/i.test(key.trim()) && /^[#\w\s().,%+-]+$/.test(val) && !/url|expression|var\(/i.test(val)
      })
      node.attrs.style = safe.join(';') + ';max-width:100%;box-sizing:border-box;word-wrap:break-word;'
      if (name === 'td' || name === 'th') for (const key of ['colspan', 'rowspan']) if (/^[1-9]\d?$/.test(attributes[key] || '')) node.attrs[key] = attributes[key]
    }
    if (!hidden) current.children.push(node)
    if (!['img', 'br', 'hr', 'input', 'embed'].includes(name) && !/\/\s*>$/.test(token)) stack.push({ tag: name, children: node.children, hidden })
  }
  // Empty OA spacer paragraphs carry no content. Keep real text, images and tables.
  function compact(nodes: ArticleNode[]): ArticleNode[] {
    const meaningful = (node: ArticleNode): boolean => 'text' in node ? Boolean(node.text.trim()) : ['img', 'hr'].includes(node.name) || node.children.some(meaningful)
    return nodes.filter(node => {
      if ('text' in node) return true // Preserve spaces between inline words/spans.
      node.children = compact(node.children)
      return ['img', 'hr', 'br'].includes(node.name) || meaningful(node)
    })
  }
  return compact(root)
}
