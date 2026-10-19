<script setup lang="ts">
import { computed, onUnmounted, ref } from 'vue'
import { OperationsError, operationsClient, type Analytics, type InternalIdentity, type NewsOverview, type Period } from './lib/operations-api'

const inputToken = ref('')
const activeToken = ref('')
const devMode = import.meta.env.DEV
const periodOptions: Array<{ value: Period; label: string }> = [{value:'week',label:'周'},{value:'month',label:'月'},{value:'year',label:'年'}]
let generation = 0
const adminName = ref('')
const loading = ref(false)
const period = ref<Period>('week')
const chartMode = ref<'bar' | 'line'>('bar')
const metric = ref<'assessmentCount' | 'rechargeCount' | 'rechargeAmountFen'>('assessmentCount')
const metricOptions: Array<{ value: typeof metric.value; label: string }> = [{value:'assessmentCount',label:'成功评估'},{value:'rechargeCount',label:'充值次数'},{value:'rechargeAmountFen',label:'充值金额'}]
const analytics = ref<Analytics | null>(null)
const identities = ref<InternalIdentity[] | null>(null)
const news = ref<NewsOverview | null>(null)
const errors = ref({ analytics: '', identities: '', news: '', auth: '' })
const identityFilter = ref<'all' | 'unclaimed' | 'unassigned' | 'assigned' | 'incomplete'>('all')
const unclassifiedFirst = ref(false)

function clearSession(message = '') {
  generation++
  loading.value = false
  activeToken.value = ''
  inputToken.value = ''
  adminName.value = ''
  analytics.value = null
  identities.value = null
  news.value = null
  errors.value = { analytics: '', identities: '', news: '', auth: message }
}
onUnmounted(() => clearSession())

function reason(error: unknown) {
  if (error instanceof OperationsError && error.status === 401) {
    clearSession('会话已失效，请重新认证')
    return '会话已失效，请重新认证'
  }
  return error instanceof Error ? error.message : '读取失败，请重试'
}

async function connect() {
  if (!devMode) return
  const token = inputToken.value.trim()
  clearSession()
  inputToken.value = token
  const run = ++generation
  loading.value = true
  try {
    const user = await operationsClient(token).verifyAdmin()
    if (run !== generation) return
    activeToken.value = token
    inputToken.value = ''
    adminName.value = user.displayName || '管理员'
    await refresh()
  } catch (error) {
    if (run === generation) errors.value.auth = reason(error)
  } finally { if (run === generation) loading.value = false }
}

async function refresh() {
  if (!activeToken.value) return
  const run = ++generation
  loading.value = true
  errors.value = { analytics: '', identities: '', news: '', auth: '' }
  const client = operationsClient(activeToken.value)
  const results = await Promise.allSettled([client.analytics(period.value), client.identities(), client.news()])
  if (run !== generation) return
  const [stats, ids, posts] = results
  analytics.value = stats.status === 'fulfilled' ? stats.value : null
  identities.value = ids.status === 'fulfilled' ? ids.value : null
  news.value = posts.status === 'fulfilled' ? posts.value : null
  if (stats.status === 'rejected') errors.value.analytics = reason(stats.reason)
  if (ids.status === 'rejected') errors.value.identities = reason(ids.reason)
  if (posts.status === 'rejected') errors.value.news = reason(posts.reason)
  if (run === generation) loading.value = false
}

async function changePeriod(next: Period) {
  period.value = next
  if (!activeToken.value) return
  const run = ++generation
  errors.value.analytics = ''
  try {
    analytics.value = await operationsClient(activeToken.value).analytics(next)
  } catch (error) {
    if (run === generation) { analytics.value = null; errors.value.analytics = reason(error) }
  }
}

const filteredIdentities = computed(() => (identities.value ?? []).filter(row =>
  identityFilter.value === 'all' ||
  (identityFilter.value === 'incomplete' ? row.profileState === 'incomplete' : row.assignmentState === identityFilter.value),
))
const newsRows = computed(() => [...(news.value?.posts ?? [])].sort((a, b) =>
  (unclassifiedFirst.value ? Number(b.tags.length === 0) - Number(a.tags.length === 0) : 0) ||
  (Date.parse(b.publishedAt || b.sourceUpdatedAt || '') || 0) - (Date.parse(a.publishedAt || a.sourceUpdatedAt || '') || 0),
))
const source = computed(() => metric.value === 'assessmentCount' ? 'assessments' : 'payments')
const chartError = computed(() => analytics.value?.sources[source.value]?.status === 'error')
const chartValues = computed(() => (analytics.value?.buckets ?? []).map(row => {
  const value = row[metric.value]
  return value === null ? null : metric.value === 'rechargeAmountFen' ? value / 100 : value
}))
const maximum = computed(() => Math.max(1, ...chartValues.value.map(value => value ?? 0)))
const polyline = computed(() => chartValues.value.map((value, index) => `${42 + index * 94},${182 - (value ?? 0) / maximum.value * 130}`).join(' '))
function yuan(fen: number | null) { return fen === null ? '来源不可用' : '¥' + (fen / 100).toFixed(2) }
function date(value: string | null) { return value ? new Date(value).toLocaleString('zh-CN', { timeZone: 'Asia/Shanghai' }) : '待核实' }
function timeLabel(row: NewsOverview['posts'][number]) {
  return row.publishedAt && row.publicationTimeSource !== 'unverified' ? '发表：' + date(row.publishedAt) : '发表时间待核实' + (row.sourceUpdatedAt ? ' · 来源更新：' + date(row.sourceUpdatedAt) : '')
}
function sourceName(name: string) { return ({assessments:'评估',payments:'支付',ledger:'账本',reservations:'冻结记录'} as Record<string,string>)[name] || name }
</script>

<template>
  <section class="operations">
    <header class="operations-heading">
      <div><p class="kicker">真实业务数据 · 只读</p><h2>资讯、评估与账号</h2><p>数据直接来自管理员 API。失败会显示原因，商业表缺失不计为零。</p></div>
      <button v-if="activeToken" type="button" class="subtle" @click="clearSession()">清除本次会话</button>
    </header>

    <div v-if="!devMode" class="state">电脑端正式登录尚未接入。本页未开放生产登录；请使用已授权的小程序管理员工作台。</div>
    <div v-else-if="!activeToken" class="state">
      <h3>连接已有管理员会话</h3>
      <p>仅供本地开发验证。会话只保留在当前页面内存，不写入浏览器存储；请勿在共享电脑输入。</p>
      <input v-model="inputToken" type="password" autocomplete="off" aria-label="临时管理员会话" placeholder="临时管理员会话" @keyup.enter="connect" />
      <button type="button" :disabled="loading || !inputToken.trim()" @click="connect">验证管理员权限</button>
      <p v-if="errors.auth" class="error" role="alert">{{ errors.auth }}</p>
    </div>

    <template v-else>
      <div class="operations-toolbar"><strong>{{ adminName }}</strong><span>只读视图</span><button type="button" :disabled="loading" @click="refresh">{{ loading ? '正在刷新…' : '刷新真实数据' }}</button></div>
      <section class="operations-panel">
        <div class="panel-title"><h3>AI 评估与充值</h3><div class="pills"><button v-for="option in periodOptions" :key="option.value" type="button" :class="{ selected: period === option.value }" @click="changePeriod(option.value)">{{ option.label }}</button></div></div>
        <p v-if="errors.analytics" class="error" role="alert">统计接口读取失败：{{ errors.analytics }}</p>
        <template v-if="analytics">
          <p class="basis">{{ analytics.range.from }} 至 {{ analytics.range.before }}（终点不含） · {{ analytics.range.timezone }}<br />{{ analytics.range.basis }}</p>
          <div class="metric-grid">
            <div><small>成功评估</small><strong>{{ analytics.summary.assessmentCount }}</strong></div>
            <div><small>任务创建 / 曾运行</small><strong>{{ analytics.summary.createdCount }} / {{ analytics.summary.startedTaskCount }}</strong></div>
            <div><small>成功 / 失败 / 运行中</small><strong>{{ analytics.summary.assessmentCount }} / {{ analytics.summary.failedCount }} / {{ analytics.summary.runningCount }}</strong></div>
            <div><small>成功充值订单</small><strong>{{ analytics.summary.rechargeCount === null ? '来源不可用' : analytics.summary.rechargeCount }}</strong></div>
            <div><small>成功充值金额</small><strong>{{ yuan(analytics.summary.rechargeAmountFen) }}</strong></div>
            <div><small>账本消费 / 额度退回</small><strong>{{ analytics.summary.consumptionCount ?? '来源不可用' }} / {{ analytics.summary.releasedCount ?? '来源不可用' }}</strong></div>
          </div>
          <p v-for="(state, name) in analytics.sources" :key="name" v-show="state.status === 'error'" class="source-error">{{ sourceName(String(name)) }}读取失败：{{ state.error }}</p>
          <p class="basis">成功无消费账本：{{ analytics.gaps.successWithoutDebit === null ? '未能核对' : analytics.gaps.successWithoutDebit }}；完成时间疑似时区偏移：{{ analytics.gaps.suspectEightHourCompletionCount }}。{{ analytics.supplier.message }}</p>
          <p class="basis">全历史免费额度发放 {{ analytics.ledger.freeGranted ?? '来源不可用' }}、付费额度发放 {{ analytics.ledger.paidGranted ?? '来源不可用' }}、扣减 {{ analytics.ledger.debitedCredits ?? '来源不可用' }}、余额 {{ analytics.ledger.balance ?? '来源不可用' }}。免费／付费各自使用量未记录来源归属，无法拆分；运行请求历史与实际 API 成本未记录。充值次数与额度消费次数仅供经营对照，不代表资金收支。</p>
          <div class="panel-title"><div class="pills"><button v-for="entry in metricOptions" :key="entry.value" type="button" :class="{ selected: metric === entry.value }" @click="metric = entry.value">{{ entry.label }}</button></div><div class="pills"><button type="button" :class="{ selected: chartMode === 'bar' }" @click="chartMode = 'bar'">柱状</button><button type="button" :class="{ selected: chartMode === 'line' }" @click="chartMode = 'line'">折线</button></div></div>
          <p v-if="chartError" class="error">所选数据来源不可用，无法绘图。</p>
          <div v-else class="chart-scroll"><svg :width="Math.max(380, analytics.buckets.length * 94 + 70)" height="230" role="img" aria-label="按所选时间范围显示真实数据的趋势图">
            <line x1="20" y1="182" :x2="Math.max(360, analytics.buckets.length * 94 + 50)" y2="182" stroke="#acbbcb" />
            <polyline v-if="chartMode === 'line'" :points="polyline" fill="none" stroke="#2664c8" stroke-width="3" />
            <g v-for="(bucket, index) in analytics.buckets" :key="bucket.key">
              <rect v-if="chartMode === 'bar'" :x="30 + index * 94" :y="182 - (chartValues[index] ?? 0) / maximum * 130" width="24" :height="Math.max(1, (chartValues[index] ?? 0) / maximum * 130)" fill="#2664c8" />
              <circle v-else :cx="42 + index * 94" :cy="182 - (chartValues[index] ?? 0) / maximum * 130" r="4" fill="#2664c8" />
              <text :x="42 + index * 94" :y="170 - (chartValues[index] ?? 0) / maximum * 130" text-anchor="middle" font-size="12">{{ chartValues[index] ?? 0 }}</text>
              <text :x="42 + index * 94" y="205" text-anchor="middle" font-size="12">{{ bucket.label }}</text>
            </g>
          </svg></div>
          <h4>充值金额排行</h4><p v-if="analytics.sources.payments.status === 'error'" class="error">支付来源不可用</p><p v-else-if="!analytics.payers.length" class="basis">当前区间没有成功支付订单。</p>
          <ol v-else><li v-for="row in analytics.payers" :key="row.userIdSuffix">{{ row.displayName }} · 尾号 {{ row.userIdSuffix }} · {{ row.rechargeCount }} 单 · {{ yuan(row.amountFen) }}</li></ol>
        </template>
      </section>

      <section class="operations-panel"><div class="panel-title"><h3>真实账号与分配</h3><select v-model="identityFilter"><option value="all">全部</option><option value="unclaimed">未认领</option><option value="unassigned">未分配</option><option value="assigned">已分配</option><option value="incomplete">资料待完善</option></select></div>
        <p v-if="errors.identities" class="error" role="alert">账号读取失败：{{ errors.identities }}</p><template v-else-if="identities"><p class="basis">共读取 {{ identities.length }} 个编号；实名仅供授权后台查阅，测试命名需人工核对。</p><p v-if="!filteredIdentities.length" class="basis">当前筛选没有匹配记录。</p>
          <div v-for="row in filteredIdentities" :key="row.id" class="data-row"><div><strong>{{ row.businessId }}</strong><span>{{ {student:'学员',teacher:'老师',admin:'管理员'}[row.type] }} · {{ row.nameLabel || '待完善实名' }}</span><small v-if="row.type === 'student'">{{ row.schoolLabel || '学校待完善' }}</small></div><span>{{ row.status === 'disabled' ? '已停用' : row.assignmentLabel || '未记录' }}</span></div>
        </template>
      </section>

      <section class="operations-panel"><div class="panel-title"><h3>服务号资讯</h3><label><input v-model="unclassifiedFirst" type="checkbox" /> 未分类优先</label></div>
        <p v-if="errors.news" class="error" role="alert">资讯读取失败：{{ errors.news }}</p><template v-else-if="news"><p class="basis">最近 {{ news.posts.length }} 条管理记录，默认按可核对来源时间倒序；未分类文章未经审核不向学员公开。News V2：{{ news.newsV2Enabled ? '已开启' : '未开启' }}。</p>
          <p v-if="news.syncHistory" class="basis">最近成功检查：{{ date(news.syncHistory.lastCheckedAt) }} · 最近失败：{{ date(news.syncHistory.lastFailedAt) }} · 最新来源更新时间（非发表时间）：{{ date(news.syncHistory.latestSourceUpdatedAt) }} · 抓取 {{ news.syncHistory.fetched }}、新增 {{ news.syncHistory.created }}、更新 {{ news.syncHistory.updated }}、失败 {{ news.syncHistory.failed }}。{{ news.syncHistory.lastError ? '失败原因：' + news.syncHistory.lastError : news.syncHistory.lastCheckedAt && !news.syncHistory.created ? '已检查，暂无新文章' : '' }}</p>
          <p v-if="!newsRows.length" class="basis">暂无管理资讯记录。</p><div v-for="row in newsRows" :key="row.id" class="data-row"><div><strong>{{ row.title }}</strong><small>{{ timeLabel(row) }}</small></div><span>{{ row.tags.length ? row.tags.join(' · ') : '未分类 · 待审核' }}</span></div>
        </template>
      </section>
    </template>
  </section>
</template>

<style scoped>
.operations{max-width:1180px;margin:auto;color:#18304d}.operations-heading,.panel-title,.operations-toolbar{display:flex;justify-content:space-between;align-items:center;gap:16px;flex-wrap:wrap}.operations-heading{border-left:6px solid #e8a62e;background:#e9f0fa;padding:20px 24px;margin-bottom:18px}.operations-heading h2{margin:2px 0 5px;font-size:28px}.operations-heading p{margin:0;color:#48607b}.kicker{font-size:12px;font-weight:800;letter-spacing:.07em}.state,.operations-panel{background:#fff;border:1px solid #d5e0ed;padding:20px;margin-bottom:16px}.state{max-width:560px}.state input{display:block;width:100%;box-sizing:border-box;margin:12px 0}.operations-panel h3{margin:0 0 12px}.operations-panel h4{margin-bottom:8px}.operations-toolbar{margin:0 0 14px}.operations-toolbar span{margin-right:auto;color:#65758b}.pills{display:flex;flex-wrap:wrap;gap:6px}.operations button{border:1px solid #adc4df;background:#f2f6fc;color:#225093;padding:8px 12px;cursor:pointer;border-radius:4px}.operations button.selected{background:#2664c8;color:white}.operations button:disabled{opacity:.55;cursor:default}.subtle{white-space:nowrap}.basis{font-size:13px;line-height:1.7;color:#50637b;white-space:pre-line}.error,.source-error{color:#9a332d;background:#fff0eb;padding:9px 12px}.metric-grid{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:9px}.metric-grid div{padding:13px;background:#e9f0fa;border-left:3px solid #2664c8}.metric-grid small,.metric-grid strong{display:block}.metric-grid strong{font-size:22px;margin-top:6px}.chart-scroll{overflow-x:auto}.data-row{display:flex;justify-content:space-between;gap:16px;padding:12px 0;border-top:1px solid #e5ecf4}.data-row div{min-width:0}.data-row strong,.data-row small{display:block}.data-row span{color:#536983;overflow-wrap:anywhere}.data-row small{color:#68798e;margin-top:5px}.panel-title select{padding:8px}.panel-title input{width:auto}ol{padding-left:25px;line-height:1.8}@media(max-width:720px){.operations-heading h2{font-size:23px}.metric-grid{grid-template-columns:repeat(2,minmax(0,1fr))}.data-row{flex-direction:column;gap:5px}}
</style>
