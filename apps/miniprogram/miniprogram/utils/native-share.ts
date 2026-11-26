const TITLE = '九辰保研｜让保研规划更清晰'
const IMAGE = '/assets/jiuchen-visual-v1/banners/today-campus-hero.png'
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
const SCHOOL_ID = /^[a-zA-Z0-9_-]{1,80}$/
const PRODUCT_KEY = /^[^/?#\x00-\x1f]{1,160}$/

type SharePage = { data?: Record<string, any>; postId?: string; documentKey?: string; nativeCopyUrlHandler?: () => { query: string } }

function publicQuery(route: string, owner: unknown) {
  const page = owner as SharePage
  if (route === 'pages/news-detail/news-detail') {
    const id = page.data?.post?.id
    return typeof id === 'string' && UUID.test(id) ? `id=${encodeURIComponent(id)}` : ''
  }
  if (route === 'pages/product-detail/product-detail') {
    const key = page.documentKey
    return typeof key === 'string' && PRODUCT_KEY.test(key) && page.data?.view
      ? `documentKey=${encodeURIComponent(key)}` : ''
  }
  if (route === 'packages/schools/detail/detail') {
    const id = page.data?.school?.id
    return typeof id === 'string' && SCHOOL_ID.test(id) ? `id=${encodeURIComponent(id)}` : ''
  }
  return ''
}

export function friendShare(route: string, page: unknown) {
  const query = publicQuery(route, page)
  const requiresId = ['pages/news-detail/news-detail', 'pages/product-detail/product-detail', 'packages/schools/detail/detail'].includes(route)
  const safeRoute = route === 'pages/assessment-result/assessment-result' ? 'pages/assessment-history/assessment-history'
    : route === 'pages/plan-editor/plan-editor' ? 'pages/classroom/classroom'
      : route === 'packages/read-only/view/view' || (requiresId && !query) ? 'pages/index/index' : route
  return { title: TITLE, path: `/${safeRoute}${safeRoute === route && query ? `?${query}` : ''}`, imageUrl: IMAGE }
}

export function timelineShare(route: string, page: unknown) {
  const query = publicQuery(route, page)
  return query ? { title: TITLE, imageUrl: IMAGE, query } : { title: TITLE, imageUrl: IMAGE }
}

export function enableNativeShare(route: string, owner: unknown) {
  const page = owner as SharePage
  try { wx.showShareMenu({ menus: ['shareAppMessage', 'shareTimeline'], fail: () => {} }) } catch { /* Older clients may omit this menu. */ }
  if (typeof wx.onCopyUrl === 'function') {
    disableNativeShare(page)
    page.nativeCopyUrlHandler = () => ({ query: publicQuery(route, page) })
    wx.onCopyUrl(page.nativeCopyUrlHandler)
  }
}

export function disableNativeShare(owner: unknown) {
  const page = owner as SharePage
  if (page.nativeCopyUrlHandler && typeof wx.offCopyUrl === 'function') wx.offCopyUrl()
  page.nativeCopyUrlHandler = undefined
}
