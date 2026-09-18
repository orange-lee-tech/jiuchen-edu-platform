import { bootstrapWechatUser } from '../../utils/auth'
import { getDemoStudent, getHealth, getLiveness } from '../../utils/request'

Page({
  data: {
    title: '九辰保研',
    subtitle: 'P1 基础骨架已启动',
    checking: true,
    apiStatus: '检查中…',
    databaseStatus: '-',
    identityStatus: '待验证',
    identityMeta: '',
    studentName: '',
    studentMeta: '',
  },

  async onLoad() {
    try {
      const live = await getLiveness()
      this.setData({
        apiStatus: live.ok ? '正常' : '异常',
      })

      const health = await getHealth()
      this.setData({
        databaseStatus: health.dependencies.database,
      })

      if (health.dependencies.database === 'ok') {
        const [studentResult, identityResult] = await Promise.allSettled([
          getDemoStudent(),
          bootstrapWechatUser(),
        ])

        if (studentResult.status === 'fulfilled') {
          const student = studentResult.value
          this.setData({
            studentName: student.name,
            studentMeta: [student.university, student.major, student.currentStage]
              .filter(Boolean)
              .join(' · '),
          })
        }

        if (identityResult.status === 'fulfilled') {
          const user = identityResult.value
          this.setData({
            identityStatus: '正常',
            identityMeta: `${user.role} · ${user.id}`,
          })
        } else {
          this.setData({
            identityStatus:
              identityResult.reason instanceof Error
                ? identityResult.reason.message
                : '微信身份验证失败',
          })
        }
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : '无法连接 API'
      if (this.data.apiStatus === '检查中…') {
        this.setData({ apiStatus: message })
      } else {
        this.setData({ databaseStatus: message })
      }
    } finally {
      this.setData({ checking: false })
    }
  },
})
