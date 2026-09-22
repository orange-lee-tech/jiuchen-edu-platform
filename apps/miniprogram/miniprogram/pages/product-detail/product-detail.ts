import { getProduct } from '../../utils/request'

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
  if (Array.isArray(value)) {
    return value
      .map((item) => asString(item))
      .filter(Boolean)
  }
  const text = asString(value)
  return text ? [text] : []
}

function sourcePage(value: AnyRecord): string {
  if (Array.isArray(value.source_pages)) {
    const pages = value.source_pages.filter(
      (page): page is number => typeof page === 'number',
    )
    if (pages.length) return pages.map((page) => `P${page}`).join('、')
  }
  if (typeof value.source_page === 'number') return `P${value.source_page}`
  return ''
}

function flattenTargetSchools(value: unknown): string[] {
  const record = asRecord(value)
  return Object.entries(record).flatMap(([label, schools]) => {
    const names = asStrings(schools)
    return names.length ? [`${label}：${names.join('、')}`] : []
  })
}

function flattenOrientation(value: unknown): string[] {
  return Object.entries(asRecord(value)).flatMap(([label, detail]) => {
    const text = asString(detail)
    return text ? [`${label}：${text}`] : []
  })
}

function workflowLines(value: unknown): string[] {
  if (!Array.isArray(value)) return []

  return value.flatMap((item) => {
    const record = asRecord(item)
    const stage = asString(record.stage) || asString(record.name)
    const content =
      asString(record.content) ||
      asString(record.description) ||
      asString(record.can_provide)
    const student = asString(record.student_must_complete)
    const parts = [
      stage,
      content,
      student ? `学生需完成：${student}` : '',
    ].filter(Boolean)

    return parts.length ? [parts.join('｜')] : []
  })
}

function structuredItemLines(value: unknown): string[] {
  if (!Array.isArray(value)) return []

  return value.flatMap((item) => {
    if (typeof item === 'string' && item.trim()) return [item.trim()]

    const record = asRecord(item)
    if (!Object.keys(record).length) return []

    const name = asString(record.name) || asString(record.title)
    const description =
      asString(record.description) ||
      asString(record.summary) ||
      asString(record.content)
    const delivery =
      asString(record.delivery) ||
      asString(record.deliverables) ||
      asString(record.purpose)
    const stages = workflowLines(record.stages)

    const lines: string[] = []
    if (name && description) lines.push(`${name}：${description}`)
    else if (name) lines.push(name)
    else if (description) lines.push(description)

    if (delivery) lines.push(`交付/形式：${delivery}`)
    lines.push(...stages.map((line) => (name ? `${name}｜${line}` : line)))
    return lines
  })
}

function moduleDetails(value: AnyRecord): string[] {
  const lines = [
    ...asStrings(value.core_content),
    ...asStrings(value.details),
    ...asStrings(value.description),
    ...flattenTargetSchools(value.target_schools),
    ...workflowLines(value.workflow),
  ]

  const directions = asStrings(value.future_research_directions)
  if (directions.length) {
    lines.push(`研究方向示例：${directions.join('、')}`)
  }

  lines.push(...flattenOrientation(value.orientation))

  if (Array.isArray(value.academic_examples)) {
    for (const item of value.academic_examples) {
      const record = asRecord(item)
      const grade = asString(record.grade)
      const target = asString(record.gpa_target)
      const analysis = asString(record.analysis)
      const actions = asStrings(record.actions)

      if (target) lines.push(`${grade}目标：${target}`)
      if (analysis) lines.push(`${grade}分析：${analysis}`)
      if (actions.length) lines.push(`${grade}行动：${actions.join('；')}`)
    }
  }

  if (value.example_only === true) {
    lines.unshift('以下定位内容为产品手册中的示例，不作为真实保研案例数据。')
  }

  return lines
}

function serviceDetails(value: AnyRecord): string[] {
  return [
    ...structuredItemLines(value.items),
    ...asStrings(value.bullets),
    ...asStrings(value.details),
  ]
}

Page({
  data: {
    loading: true,
    error: '',
    view: null as null | {
      name: string
      coverAsset: string
      taglines: string[]
      serviceModel: string
      priceDisplay: string
      periodDisplay: string
      positioning: string
      audience: Array<{ text: string; source: string }>
      highlights: Array<{ title: string; detail: string; source: string }>
      timeline: Array<{
        stage: string
        timeRange: string
        tasks: string[]
        source: string
      }>
      modules: Array<{
        name: string
        details: string[]
        source: string
      }>
      services: Array<{
        name: string
        summary: string
        details: string[]
        source: string
      }>
      teachers: Array<{
        name: string
        education: string
        courses: string
        claimedOffers: string
        verification: string
        source: string
      }>
      teacherSectionTitle: string
      trainingItems: Array<{
        name: string
        purpose: string
        hours: string
        time: string
        source: string
      }>
      courses: Array<{
        grade: string
        name: string
        institution: string
        teacher: string
        hours: string
        resourceNote: string
        source: string
      }>
      internships: Array<{
        direction: string
        company: string
        roles: string
        location: string
        pay: string
        channel: string
      }>
      examples: Array<{
        title: string
        lines: string[]
      }>
    },
  },

  onLoad(options: { documentKey?: string }) {
    const documentKey = decodeURIComponent(options.documentKey || '')
    if (!documentKey) {
      this.setData({ loading: false, error: '缺少产品标识。' })
      return
    }
    void this.loadProduct(documentKey)
  },

  async loadProduct(documentKey: string) {
    try {
      this.setData({ loading: true, error: '' })
      const detail = await getProduct(documentKey)
      const content = detail.content
      const product = asRecord(content.product)
      const extensions = asRecord(content.extensions)
      const price = asRecord(product.price)
      const period = asRecord(product.service_period)

      const teachers = content.teachers.map((item) => {
        const record = asRecord(item)
        const offers = asStrings(record.offers_claimed)
        return {
          name:
            asString(record.display_name) ||
            asString(record.name) ||
            '师资信息',
          education:
            asString(record.education_raw) ||
            asString(record.education) ||
            [asString(record.institution), asString(record.role)]
              .filter(Boolean)
              .join(' · '),
          courses: asStrings(record.courses).join('、'),
          claimedOffers: offers.length
            ? `手册所列 Offer（待核验）：${offers.join('、')}`
            : '',
          verification:
            record.verification_status === 'verified'
              ? '已核验'
              : '资料来源待核验',
          source: sourcePage(record),
        }
      })

      const trainingItems = Array.isArray(extensions.training_items)
        ? extensions.training_items.map((item) => {
            const record = asRecord(item)
            return {
              name: asString(record.name),
              purpose: asString(record.purpose),
              hours:
                typeof record.hours === 'number'
                  ? `${record.hours} 小时`
                  : '',
              time: asString(record.time),
              source: sourcePage(record),
            }
          })
        : []

      const courses = Array.isArray(extensions.course_resources)
        ? extensions.course_resources.map((item) => {
            const record = asRecord(item)
            const link = asString(record.resource_link)
            return {
              grade: asString(record.grade),
              name: asString(record.course_name),
              institution: asString(record.institution),
              teacher: asString(record.teacher),
              hours:
                typeof record.hours === 'number'
                  ? `${record.hours}h`
                  : '',
              resourceNote: link.startsWith('[待核对') ? link : '',
              source: sourcePage(record),
            }
          })
        : []

      const internships: Array<{
        direction: string
        company: string
        roles: string
        location: string
        pay: string
        channel: string
      }> = []
      const internshipPlans = asRecord(extensions.internship_plans)
      for (const [direction, rows] of Object.entries(internshipPlans)) {
        if (!Array.isArray(rows)) continue
        rows.forEach((item) => {
          const record = asRecord(item)
          internships.push({
            direction:
              direction === 'direction_A'
                ? '方向 A'
                : direction === 'direction_B'
                  ? '方向 B'
                  : direction,
            company: asString(record.company),
            roles: asStrings(record.roles).join('、'),
            location: asString(record.location),
            pay: asString(record.pay_reference),
            channel: asString(record.channel),
          })
        })
      }

      const examples: Array<{ title: string; lines: string[] }> = []
      const examplePlans = asRecord(extensions.example_plans)
      const gpaExamples = examplePlans.academic_gpa_examples
      if (Array.isArray(gpaExamples)) {
        gpaExamples.forEach((item) => {
          const record = asRecord(item)
          examples.push({
            title: `${asString(record.grade)}绩点规划示例`,
            lines: [
              asString(record.gpa_target),
              asString(record.analysis),
              ...asStrings(record.actions),
            ].filter(Boolean),
          })
        })
      }

      for (const key of ['competition_example', 'research_example']) {
        const record = asRecord(examplePlans[key])
        if (!Object.keys(record).length) continue
        examples.push({
          title: asString(record.title) || (key === 'competition_example' ? '竞赛规划示例' : '科研规划示例'),
          lines: [
            ...asStrings(record.description),
            ...asStrings(record.recommended_directions),
            ...asStrings(record.example_project),
            ...asStrings(record.notes),
            ...asStrings(record.target_outcomes),
          ],
        })
      }

      const isResourceTeacherSet = teachers.some((teacher) =>
        teacher.education.includes('网课资源授课老师'),
      )

      this.setData({
        view: {
          name: asString(product.name) || detail.title,
          coverAsset: asString(product.cover_asset),
          taglines: asStrings(product.tagline),
          serviceModel:
            asString(product.service_model) ||
            asString(asRecord(product.service_hours).display),
          priceDisplay: asString(price.display),
          periodDisplay:
            asString(period.display) || asString(period.description),
          positioning:
            asString(product.positioning) ||
            asString(product.positioning_statement),
          audience: content.audience.map((item) => {
            const record = asRecord(item)
            return {
              text:
                asString(record.text) ||
                asString(record.group) ||
                asString(record.description),
              source: sourcePage(record),
            }
          }),
          highlights: content.highlights.map((item) => {
            const record = asRecord(item)
            return {
              title: asString(record.title),
              detail:
                asString(record.description) ||
                asString(record.text) ||
                asStrings(record.details).join(' · '),
              source: sourcePage(record),
            }
          }),
          timeline: content.timeline.map((item) => {
            const record = asRecord(item)
            return {
              stage: asString(record.stage),
              timeRange: asString(record.time_range),
              tasks: asStrings(record.tasks),
              source: sourcePage(record),
            }
          }),
          modules: content.modules.map((item) => {
            const record = asRecord(item)
            return {
              name: asString(record.name),
              details: moduleDetails(record),
              source: sourcePage(record),
            }
          }),
          services: content.core_services.map((item) => {
            const record = asRecord(item)
            return {
              name: asString(record.name),
              summary:
                asString(record.summary) ||
                asString(record.description) ||
                asString(record.overview),
              details: serviceDetails(record),
              source: sourcePage(record),
            }
          }),
          teachers,
          teacherSectionTitle: isResourceTeacherSet
            ? '课程资源教师'
            : '产品手册师资',
          trainingItems,
          courses,
          internships,
          examples,
        },
      })

      wx.setNavigationBarTitle({
        title: asString(product.cover_name) || asString(product.name) || '服务详情',
      })
    } catch (error) {
      console.error('Failed to load product detail.', error)
      this.setData({
        error: '服务详情暂时无法加载，请稍后重试。',
      })
    } finally {
      this.setData({ loading: false })
    }
  },
})
