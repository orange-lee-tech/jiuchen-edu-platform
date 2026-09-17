import { getDemoStudent, getHealth } from '../../utils/request'

Page({
  data: {
    title: '九辰保研',
    subtitle: 'P1 基础骨架已启动',
    checking: true,
    apiStatus: '检查中…',
    databaseStatus: '-',
    studentName: '',
    studentMeta: '',
  },

  async onLoad() {
    try {
      const health = await getHealth()
      this.setData({
        apiStatus: health.ok ? '正常' : '异常',
        databaseStatus: health.dependencies.database,
      })

      if (health.dependencies.database === 'ok') {
        const student = await getDemoStudent()
        this.setData({
          studentName: student.name,
          studentMeta: [student.university, student.major, student.currentStage]
            .filter(Boolean)
            .join(' · '),
        })
      }
    } catch (error) {
      this.setData({
        apiStatus: error instanceof Error ? error.message : '无法连接 API',
      })
    } finally {
      this.setData({ checking: false })
    }
  },
})
