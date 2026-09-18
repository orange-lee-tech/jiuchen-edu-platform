<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import {
  fetchClassroomStages,
  fetchHealth,
  fetchStudentClassroom,
  fetchStudents,
  saveClassroomPlan,
  updateStudent,
  type ClassroomPlan,
  type ClassroomStage,
  type HealthResponse,
  type PlanStatus,
  type PlanType,
  type StudentSummary,
} from './lib/api'

type EditableItem = {
  name: string
  target: string
  status: PlanStatus
}

type EditablePlan = {
  type: PlanType
  title: string
  items: EditableItem[]
}

const loading = ref(true)
const saving = ref(false)
const error = ref('')
const notice = ref('')
const health = ref<HealthResponse | null>(null)
const students = ref<StudentSummary[]>([])
const stages = ref<ClassroomStage[]>([])
const selectedStudentId = ref('')
const selectedStageCode = ref('')
const classroom = ref<Awaited<ReturnType<typeof fetchStudentClassroom>> | null>(null)

const studentForm = ref({
  name: '',
  university: '',
  major: '',
  currentStage: '',
})

const planForm = ref<EditablePlan | null>(null)

const selectedStudent = computed(
  () => students.value.find((student) => student.id === selectedStudentId.value) ?? null,
)

const stageLabel = computed(
  () => stages.value.find((stage) => stage.code === selectedStageCode.value)?.label ?? '',
)

function showError(cause: unknown) {
  error.value = cause instanceof Error ? cause.message : '操作失败'
  notice.value = ''
}

function fillStudentForm(student: StudentSummary) {
  studentForm.value = {
    name: student.name,
    university: student.university ?? '',
    major: student.major ?? '',
    currentStage: student.currentStage ?? '',
  }
}

function editPlan(plan: ClassroomPlan) {
  planForm.value = {
    type: plan.type,
    title: plan.title,
    items: plan.items.map((item) => ({
      name: item.name,
      target: item.target ?? '',
      status: item.status,
    })),
  }
  notice.value = ''
}

function addPlanItem() {
  if (!planForm.value) return
  planForm.value.items.push({
    name: '',
    target: '',
    status: 'pending',
  })
}

function removePlanItem(index: number) {
  if (!planForm.value) return
  planForm.value.items.splice(index, 1)
}

async function loadClassroom(stageCode = selectedStageCode.value) {
  if (!selectedStudentId.value || !stageCode) return

  try {
    error.value = ''
    classroom.value = await fetchStudentClassroom(selectedStudentId.value, stageCode)
    selectedStageCode.value = classroom.value.stage.code
    planForm.value = classroom.value.plans[0]
      ? {
          type: classroom.value.plans[0].type,
          title: classroom.value.plans[0].title,
          items: classroom.value.plans[0].items.map((item) => ({
            name: item.name,
            target: item.target ?? '',
            status: item.status,
          })),
        }
      : null
  } catch (cause) {
    showError(cause)
  }
}

async function selectStudent(studentId: string) {
  selectedStudentId.value = studentId
  const student = students.value.find((item) => item.id === studentId)
  if (!student) return

  fillStudentForm(student)

  const preferredStage =
    stages.value.find((stage) => stage.code === student.currentStage)?.code ??
    stages.value[0]?.code ??
    ''

  selectedStageCode.value = preferredStage
  await loadClassroom(preferredStage)
}

async function saveStudent() {
  if (!selectedStudentId.value) return

  try {
    saving.value = true
    error.value = ''
    const updated = await updateStudent(selectedStudentId.value, {
      name: studentForm.value.name,
      university: studentForm.value.university || null,
      major: studentForm.value.major || null,
      currentStage: studentForm.value.currentStage || null,
    })

    students.value = students.value.map((student) =>
      student.id === updated.id ? updated : student,
    )
    fillStudentForm(updated)
    notice.value = '学员基本信息已保存'
  } catch (cause) {
    showError(cause)
  } finally {
    saving.value = false
  }
}

async function savePlan() {
  if (!selectedStudentId.value || !selectedStageCode.value || !planForm.value) return

  const cleanItems = planForm.value.items
    .map((item) => ({
      name: item.name.trim(),
      target: item.target.trim() || null,
      status: item.status,
    }))
    .filter((item) => item.name.length > 0)

  try {
    saving.value = true
    error.value = ''
    await saveClassroomPlan(selectedStudentId.value, selectedStageCode.value, {
      type: planForm.value.type,
      title: planForm.value.title.trim(),
      items: cleanItems,
    })
    notice.value = `${stageLabel.value} · ${planForm.value.title} 已保存`
    await loadClassroom()
  } catch (cause) {
    showError(cause)
  } finally {
    saving.value = false
  }
}

onMounted(async () => {
  try {
    health.value = await fetchHealth()

    if (health.value.dependencies.database !== 'ok') {
      return
    }

    const [studentRows, stageRows] = await Promise.all([
      fetchStudents(),
      fetchClassroomStages(),
    ])

    students.value = studentRows
    stages.value = stageRows

    if (students.value[0]) {
      await selectStudent(students.value[0].id)
    }
  } catch (cause) {
    showError(cause)
  } finally {
    loading.value = false
  }
})
</script>

<template>
  <main class="page">
    <header class="topbar">
      <div>
        <p class="eyebrow">九辰教育 · 内部工作台</p>
        <h1>我的课堂管理</h1>
        <p class="muted">先完成学员、阶段计划与任务编辑；复杂 CMS 暂不进入本轮。</p>
      </div>
      <div class="status-chip" :class="{ ok: health?.dependencies.database === 'ok' }">
        数据库 {{ health?.dependencies.database ?? 'checking' }}
      </div>
    </header>

    <t-alert
      v-if="error"
      class="feedback"
      theme="error"
      :message="error"
    />
    <t-alert
      v-else-if="notice"
      class="feedback"
      theme="success"
      :message="notice"
    />

    <t-card v-if="loading" :bordered="false">正在加载后台数据…</t-card>

    <t-card
      v-else-if="health?.dependencies.database !== 'ok'"
      title="本地数据库尚未就绪"
      :bordered="false"
    >
      <p>当前后台编辑依赖本地 API + MySQL。CloudBase 免费环境的数据库网络问题不阻塞页面开发。</p>
    </t-card>

    <template v-else>
      <section class="workspace">
        <t-card title="学员" :bordered="false">
          <label class="field">
            <span>选择学员</span>
            <select
              :value="selectedStudentId"
              @change="selectStudent(($event.target as HTMLSelectElement).value)"
            >
              <option v-for="student in students" :key="student.id" :value="student.id">
                {{ student.name }} · {{ student.university || '未填写院校' }}
              </option>
            </select>
          </label>

          <div v-if="selectedStudent" class="form-grid">
            <label class="field">
              <span>姓名</span>
              <input v-model="studentForm.name" />
            </label>
            <label class="field">
              <span>本科院校</span>
              <input v-model="studentForm.university" />
            </label>
            <label class="field">
              <span>专业</span>
              <input v-model="studentForm.major" />
            </label>
            <label class="field">
              <span>当前阶段</span>
              <select v-model="studentForm.currentStage">
                <option value="">未设置</option>
                <option v-for="stage in stages" :key="stage.code" :value="stage.code">
                  {{ stage.label }}
                </option>
              </select>
            </label>
          </div>

          <div class="actions">
            <t-button :loading="saving" @click="saveStudent">保存学员信息</t-button>
          </div>
        </t-card>

        <t-card title="阶段计划" :bordered="false">
          <label class="field stage-field">
            <span>查看 / 编辑阶段</span>
            <select v-model="selectedStageCode" @change="loadClassroom()">
              <option v-for="stage in stages" :key="stage.code" :value="stage.code">
                {{ stage.label }} · {{ stage.description }}
              </option>
            </select>
          </label>

          <template v-if="classroom">
            <div class="plan-tabs">
              <button
                v-for="plan in classroom.plans"
                :key="plan.type"
                class="plan-tab"
                :class="{ active: planForm?.type === plan.type }"
                type="button"
                @click="editPlan(plan)"
              >
                {{ plan.title }}
              </button>
            </div>

            <div v-if="planForm" class="plan-editor">
              <label class="field">
                <span>计划标题</span>
                <input v-model="planForm.title" />
              </label>

              <div class="editor-head">
                <div>
                  <strong>具体任务</strong>
                  <p class="muted small">阶段 → 计划类型 → 计划任务，统一数据驱动。</p>
                </div>
                <t-button variant="outline" size="small" @click="addPlanItem">新增任务</t-button>
              </div>

              <div v-if="planForm.items.length === 0" class="empty">
                还没有任务，点击“新增任务”开始录入。
              </div>

              <div
                v-for="(item, index) in planForm.items"
                :key="index"
                class="item-row"
              >
                <input v-model="item.name" placeholder="任务名称" />
                <input v-model="item.target" placeholder="目标 / 要求" />
                <select v-model="item.status">
                  <option value="pending">未开始</option>
                  <option value="in_progress">进行中</option>
                  <option value="done">已完成</option>
                </select>
                <button class="remove" type="button" @click="removePlanItem(index)">删除</button>
              </div>

              <div class="actions">
                <t-button :loading="saving" @click="savePlan">保存当前计划</t-button>
              </div>
            </div>

            <div v-if="!classroom.showGuidance" class="rule-note">
              当前为大四实习阶段：学员端只展示实习规划，不展示辅导老师与辅导记录。
            </div>
          </template>
        </t-card>
      </section>
    </template>
  </main>
</template>

<style scoped>
.page {
  min-height: 100vh;
  box-sizing: border-box;
  padding: 28px;
  background: #f5f7fa;
  color: #1f2937;
}

.topbar {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 24px;
  margin-bottom: 20px;
}

.eyebrow {
  margin: 0 0 8px;
  color: #7255e7;
  font-size: 13px;
  font-weight: 700;
}

h1 {
  margin: 0;
  font-size: 30px;
}

.muted {
  margin: 8px 0 0;
  color: #6b7280;
}

.small {
  font-size: 12px;
}

.status-chip {
  flex-shrink: 0;
  padding: 8px 12px;
  border-radius: 999px;
  background: #fff3e8;
  color: #b45309;
  font-size: 13px;
}

.status-chip.ok {
  background: #eaf8ef;
  color: #166534;
}

.feedback {
  margin-bottom: 16px;
}

.workspace {
  display: grid;
  grid-template-columns: minmax(280px, 0.8fr) minmax(520px, 1.6fr);
  gap: 20px;
}

.form-grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 14px;
  margin-top: 16px;
}

.field {
  display: flex;
  flex-direction: column;
  gap: 7px;
  color: #4b5563;
  font-size: 13px;
}

.stage-field {
  margin-bottom: 18px;
}

input,
select {
  width: 100%;
  min-height: 38px;
  box-sizing: border-box;
  padding: 8px 10px;
  border: 1px solid #d7dce5;
  border-radius: 8px;
  background: #fff;
  color: #1f2937;
  outline: none;
}

input:focus,
select:focus {
  border-color: #7255e7;
}

.actions {
  display: flex;
  justify-content: flex-end;
  margin-top: 18px;
}

.plan-tabs {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  margin-bottom: 18px;
}

.plan-tab {
  padding: 8px 13px;
  border: 1px solid #d9ddea;
  border-radius: 999px;
  background: #fff;
  color: #606775;
  cursor: pointer;
}

.plan-tab.active {
  border-color: #7255e7;
  background: #f1edff;
  color: #6245d8;
  font-weight: 700;
}

.plan-editor {
  padding-top: 4px;
}

.editor-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 16px;
  margin: 20px 0 10px;
}

.item-row {
  display: grid;
  grid-template-columns: 1.1fr 1.3fr 120px 56px;
  gap: 8px;
  margin-top: 8px;
}

.remove {
  border: 0;
  background: transparent;
  color: #c2413d;
  cursor: pointer;
}

.empty,
.rule-note {
  padding: 18px;
  border-radius: 10px;
  background: #f8f8fb;
  color: #6b7280;
  font-size: 13px;
}

.rule-note {
  margin-top: 18px;
  background: #fff8e8;
  color: #8a5a16;
}

@media (max-width: 960px) {
  .workspace {
    grid-template-columns: 1fr;
  }

  .item-row {
    grid-template-columns: 1fr;
  }

  .form-grid {
    grid-template-columns: 1fr;
  }
}
</style>
