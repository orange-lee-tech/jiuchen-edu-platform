import { refreshAuthResult, subscribeAuth, type BootstrapResult, type UserRole } from '../../utils/auth'

type TourStep = { title: string; body: string }
const tours: Record<UserRole, TourStep[]> = {
  user: [
    { title: '欢迎来到九辰保研', body: '先认识四个入口：从首页开始评估，在规划整理目标，在机会阅读资讯，在我的保存资料。' },
    { title: 'AI 评估从真实背景开始', body: '填写实际成绩、经历与个人目标，查看初步建议和历史结果。评估不承诺录取，拿不准时可咨询顾问。' },
    { title: '用标签阅读保研资讯', body: '机会页展示已审核分类的文章。具体院校政策和申请截止时间，请以相关学校官方公告为准。' },
    { title: '认识九辰，随时求助', body: '首页可查看服务介绍、官网地址和人工客服。拥有九辰内部编号后，在我的资料中绑定即可开启更多功能。' },
  ],
  student: [
    { title: '学员身份已启用', body: '首页、规划、机会、我的已经为学员开放。进入规划可以查看自己的阶段和真实辅导安排。' },
    { title: '课表与计划一起管理', body: '规划页左侧可以直接切换本周课表、学期和假期；编辑课程与计划时留意保存状态。' },
    { title: '计划更新需要老师审核', body: '学员保存的是待审核版本，老师通过后才写入正式档案；保留记录供之后查看。' },
    { title: '评估结果可以继续咨询', body: '评估供规划参考，不等同招生结论或保录承诺。如需确认政策或目标院校，请联系辅导老师、顾问。' },
  ],
  teacher: [
    { title: '欢迎进入老师工作区', body: '工作台、学员、辅导、我的四个入口分别用于日常工作、学生资料、审核支持和个人身份。' },
    { title: '先查看获授权的学员', body: '进入学员列表，只有实际建立服务关系的学员才会出现在你的管理范围内。' },
    { title: '规划版本需要认真审核', body: '学生编辑会先进入待审核状态。查看真实变化后再批准或退回，不替学员生成未经确认的记录。' },
    { title: '尊重身份边界', body: '老师不能代替学员运行 AI 评估，也不能以管理员身份修改内部编号；遇到分配问题可联系运营。' },
  ],
  staff: [
    { title: '欢迎进入内部员工工作区', body: '当前界面采用老师型导航作安全过渡，不代表具备管理员权限。' },
    { title: '在授权范围内服务学员', body: '工作台、学员和辅导入口只展示服务端允许访问的内容。' },
    { title: '资料变化应有据可查', body: '规划审核、正式记录和个体资料由现有业务流程管理，不额外扩大操作范围。' },
    { title: '需要更多权限请联系管理员', body: '不能自行认领他人的身份或执行管理员操作；可从我的联系运营。' },
  ],
  admin: [
    { title: '管理员工作区已开启', body: '底部工作台看管理入口，用户处理编号与账号，业务维护师生服务与资讯，我的管理本人资料。' },
    { title: '管理 ID 和用户', body: '在用户中搜索内部编号，按已绑定、可认领、已暂停等状态筛选，并使用复制和更多操作。' },
    { title: '资讯标签决定当前展示', body: '在业务的资讯管理中检查未分类文章、设置分类标签；没有审核分类的资讯暂不向普通学员展示。' },
    { title: '暂停、撤销是敏感操作', body: '暂停会阻止账号继续使用；撤销会解除关联。请核对对象并确认，管理员不可暂停自己的当前编号。' },
  ],
}

Component({
  data: {
    active: false,
    steps: [] as TourStep[],
    current: 0,
    title: '',
    body: '',
    count: 0,
  },
  lifetimes: {
    attached() {
      ;(this as unknown as { stopGuide?: () => void }).stopGuide = subscribeAuth((state) => {
        if (state.phase === 'ready' && state.auth) this.checkGuide(state.auth)
        else this.setData({ active: false })
      })
    },
    detached() {
      ;(this as unknown as { stopGuide?: () => void }).stopGuide?.()
    },
  },
  pageLifetimes: {
    show() { void refreshAuthResult() },
    hide() { this.setData({ active: false }) },
  },
  methods: {
    checkGuide(auth: BootstrapResult) {
      const role = auth.user.role
      const key = `jiuchen-guide:v1:${auth.user.id}:${role}`
      if (wx.getStorageSync(key) === true) {
        this.setData({ active: false })
        return
      }
      ;(this as unknown as { guideKey?: string }).guideKey = key
      const steps = tours[role]
      this.setData({ active: true, steps, current: 0, count: steps.length, title: steps[0].title, body: steps[0].body })
    },
    preventTouch() {},
    onSkip() { this.finishGuide() },
    onNext() {
      const index = this.data.current + 1
      if (index >= this.data.count) { this.finishGuide(); return }
      const step = this.data.steps[index]
      this.setData({ current: index, title: step.title, body: step.body })
    },
    finishGuide() {
      const key = (this as unknown as { guideKey?: string }).guideKey
      if (key) {
        try { wx.setStorageSync(key, true) } catch { /* preserve usability when storage is full */ }
      }
      this.setData({ active: false })
    },
  },
})
