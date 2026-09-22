import { getBrandContent } from '../../utils/request'

type AnyRecord = Record<string, unknown>

function asRecord(value: unknown): AnyRecord {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? (value as AnyRecord)
    : {}
}

function asString(value: unknown): string {
  return typeof value === 'string' ? value.trim() : ''
}

function asStrings(value: unknown): string[] {
  if (!Array.isArray(value)) return []
  return value
    .map((item) => asString(item))
    .filter(Boolean)
}

function serviceItems(value: unknown): Array<{
  name: string
  description: string
  delivery: string
}> {
  if (!Array.isArray(value)) return []

  return value.flatMap((item) => {
    const record = asRecord(item)
    const name = asString(record.name) || asString(record.title)
    if (!name) return []

    return [{
      name,
      description:
        asString(record.description) ||
        asString(record.summary) ||
        asString(record.content),
      delivery:
        asString(record.delivery) ||
        asString(record.deliverables),
    }]
  })
}

Page({
  data: {
    loading: true,
    error: '',
    view: null as null | {
      brandName: string
      englishName: string
      positioning: string
      slogan: string
      serviceSlogans: string[]
      serviceScope: string[]
      planningModel: string
      pathways: string[]
      audience: Array<{ text: string; source: string }>
      highlights: Array<{ title: string; detail: string; source: string }>
      timeline: Array<{
        stage: string
        tasks: string[]
        source: string
      }>
      services: Array<{
        name: string
        items: Array<{
          name: string
          description: string
          delivery: string
        }>
        source: string
      }>
      teacherCount: number
      teacherVerification: string
      sourceDate: string
      sourcePages: number
    },
  },

  onLoad() {
    void this.loadBrand()
  },

  async loadBrand() {
    try {
      this.setData({ loading: true, error: '' })
      const content = await getBrandContent()
      const brand = asRecord(content.brand)
      const product = asRecord(content.product)
      const document = asRecord(content.document)

      this.setData({
        view: {
          brandName: asString(brand.name) || '九辰教育',
          englishName: asString(brand.english_name),
          positioning: asString(brand.positioning),
          slogan: asString(brand.cover_slogan),
          serviceSlogans: asStrings(brand.service_slogans),
          serviceScope: asStrings(product.service_scope),
          planningModel: asString(product.planning_model),
          pathways: asStrings(product.related_pathways),
          audience: content.audience.map((item) => {
            const record = asRecord(item)
            return {
              text:
                asString(record.group) ||
                asString(record.text) ||
                asString(record.description),
              source:
                typeof record.source_page === 'number'
                  ? `P${record.source_page}`
                  : '',
            }
          }),
          highlights: content.highlights.map((item) => {
            const record = asRecord(item)
            return {
              title: asString(record.title),
              detail:
                asString(record.description) ||
                asString(record.text),
              source:
                typeof record.source_page === 'number'
                  ? `P${record.source_page}`
                  : '',
            }
          }),
          timeline: content.timeline.map((item) => {
            const record = asRecord(item)
            return {
              stage: asString(record.stage),
              tasks: asStrings(record.tasks),
              source:
                typeof record.source_page === 'number'
                  ? `P${record.source_page}`
                  : '',
            }
          }),
          services: content.core_services.map((item) => {
            const record = asRecord(item)
            const pages = Array.isArray(record.source_pages)
              ? record.source_pages
                  .filter((page): page is number => typeof page === 'number')
                  .map((page) => `P${page}`)
                  .join('、')
              : typeof record.source_page === 'number'
                ? `P${record.source_page}`
                : ''

            return {
              name: asString(record.name),
              items: serviceItems(record.items),
              source: pages,
            }
          }),
          teacherCount: content.teacher_summary.source_record_count,
          teacherVerification:
            content.teacher_summary.verification_status === 'verified'
              ? '已核验'
              : '来源记录待核验',
          sourceDate: asString(document.source_date),
          sourcePages:
            typeof document.source_page_count === 'number'
              ? document.source_page_count
              : 0,
        },
      })
    } catch (error) {
      console.error('Failed to load brand content.', error)
      this.setData({
        error: '品牌资料暂时无法加载，请稍后重试。',
      })
    } finally {
      this.setData({ loading: false })
    }
  },
})
