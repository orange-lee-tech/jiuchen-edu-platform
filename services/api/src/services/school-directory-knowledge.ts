import type { AssessmentInput, AssessmentEvidenceItem } from '../domain/assessment.js'
import type { AssessmentKnowledgeContext, AssessmentKnowledgeSource } from './assessment-runtime.js'
import { MOE_PROJECT_ROSTER } from '../data/school-directory.generated.js'

const MOE_985 = 'https://www.moe.gov.cn/srcsite/A22/s7065/200612/t20061206_128833.html'
const MOE_211 = 'https://www.moe.gov.cn/srcsite/A22/s7065/200512/t20051223_82762.html'

/** Exact-name, bounded historical MoE roster evidence, not current program retrieval.
 * Mark as other, deliberately: historical membership alone may never authorize
 * a reach/match/conservative admissions assessment.
 */
export class HistoricalMoeSchoolSource implements AssessmentKnowledgeSource {
  readonly sourceId = 'historical-moe-project-roster'
  async retrieve(input: AssessmentInput): Promise<AssessmentKnowledgeContext> {
    const names = [...new Set(input.targets.map(target => target.schoolName.trim()))].slice(0,5)
    const evidence:AssessmentEvidenceItem[] = []
    for(const name of names) {
      const school = MOE_PROJECT_ROSTER.find(item => item.name === name)
      if (!school) continue
      const project=school.is985?'985':'211'
      const year=school.is985?2006:2005
      evidence.push({
        ref:'roster:moe'+project+':'+school.id,
        kind:'other',
        sourceType:'official',
        sourceId:'moe-historical-'+school.id,
        title:school.name+'·历史'+project+'工程名单',
        sourceLabel:'教育部'+year+'年'+project+'工程历史建设名单',
        sourceUrl:school.is985?MOE_985:MOE_211,
        year,
        excerpt:'教育部'+year+'年公布的'+project+'工程历史建设名单包含'+school.name+
          '。这只能证明历史建设名单事实，不能证明2026年推免政策、录取资格、名额、要求或概率。',
      })
    }
    return {version:'moe-historical-roster-2026-10-10-v1',evidence}
  }
}
