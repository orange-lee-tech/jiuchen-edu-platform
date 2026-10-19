import {
  AlignmentType,
  Document,
  Packer,
  Paragraph,
  TextRun,
} from 'docx'
import { buildResumeProjection } from '../domain/growth-profile.js'

type ResumeProjection = ReturnType<typeof buildResumeProjection>

const TYPE_LABELS: Record<string, string> = {
  course: '课程与成绩',
  language: '语言能力',
  research: '科研经历',
  publication: '论文与成果',
  competition: '竞赛经历',
  project: '项目经历',
  internship: '实习经历',
  campus: '校园与学生工作',
  award: '荣誉奖项',
  skill: '技能',
  other: '其他经历',
}

export type ResumeDocumentModel = {
  title: string
  education: string[]
  sections: Array<{
    label: string
    entries: Array<{
      title: string
      meta: string
      text: string
    }>
  }>
}

function compact(parts: Array<string | null | undefined>) {
  return parts
    .map((part) => part?.trim())
    .filter((part): part is string => Boolean(part))
}

export function buildResumeDocumentModel(
  projection: ResumeProjection,
): ResumeDocumentModel {
  const identity = projection.identity
  const education = projection.education
  const grouped = new Map<string, ResumeDocumentModel['sections'][number]>()

  for (const entry of projection.entries) {
    const label = TYPE_LABELS[entry.type] || '经历'
    const section = grouped.get(label) ?? { label, entries: [] }
    const date = compact([entry.startDate, entry.endDate]).join(' - ')
    const meta = compact([
      entry.organization,
      entry.role,
      date || null,
    ]).join(' | ')

    section.entries.push({
      title: entry.title,
      meta,
      text: entry.text,
    })
    grouped.set(label, section)
  }

  return {
    title: identity.displayName ? `${identity.displayName} - 个人简历` : '个人简历',
    education: education
      ? compact([
          compact([education.school, education.major]).join(' | '),
          compact([
            education.grade,
            education.gpa ? `GPA / 均分：${education.gpa}` : null,
            education.rank ? `专业排名：${education.rank}` : null,
          ]).join(' | '),
        ])
      : [],
    sections: [...grouped.values()],
  }
}

function sectionHeading(text: string) {
  return new Paragraph({
    spacing: { before: 180, after: 80 },
    children: [
      new TextRun({
        text,
        bold: true,
        size: 24,
      }),
    ],
  })
}

export async function createResumeDocx(
  projection: ResumeProjection,
): Promise<Buffer> {
  const model = buildResumeDocumentModel(projection)
  const children: Paragraph[] = [
    new Paragraph({
      alignment: AlignmentType.CENTER,
      spacing: { after: 180 },
      children: [
        new TextRun({
          text: model.title,
          bold: true,
          size: 36,
        }),
      ],
    }),
  ]

  if (model.education.length) {
    children.push(sectionHeading('教育背景'))
    for (const line of model.education) {
      children.push(
        new Paragraph({
          spacing: { after: 50 },
          children: [new TextRun({ text: line, size: 21 })],
        }),
      )
    }
  }

  for (const section of model.sections) {
    children.push(sectionHeading(section.label))
    for (const entry of section.entries) {
      children.push(
        new Paragraph({
          spacing: { before: 70, after: 25 },
          children: [
            new TextRun({ text: entry.title, bold: true, size: 21 }),
            ...(entry.meta
              ? [new TextRun({ text: `  ${entry.meta}`, size: 19, color: '666666' })]
              : []),
          ],
        }),
      )
      children.push(
        new Paragraph({
          spacing: { after: 60, line: 300 },
          children: [new TextRun({ text: entry.text, size: 20 })],
        }),
      )
    }
  }

  const document = new Document({
    creator: '九辰教育',
    title: model.title,
    description: `Generated from ${projection.version}; canonical facts remain the source of truth.`,
    sections: [
      {
        properties: {
          page: {
            margin: {
              top: 720,
              right: 720,
              bottom: 720,
              left: 720,
            },
          },
        },
        children,
      },
    ],
  })

  return Packer.toBuffer(document)
}
