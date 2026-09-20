<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import {
  bindInternalId,
  bindStudentIdentity,
  createCoachingRecord,
  createStudent,
  createTeacher,
  createTeacherAssignment,
  fetchClassroomStages,
  fetchHealth,
  fetchIdentities,
  fetchInternalIds,
  fetchStudentClassroom,
  fetchStudents,
  fetchTeacherAssignments,
  fetchTeachers,
  deleteCoachingRecord,
  saveClassroomPlan,
  updateStudent,
  type ClassroomPlan,
  type ClassroomStage,
  type HealthResponse,
  type IdentitySummary,
  type InternalIdSummary,
  type PlanStatus,
  type PlanType,
  type StudentSummary,
  type TeacherAssignment,
  type TeacherSummary,
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
const activeSection = ref<'classroom' | 'identity'>('classroom')
const health = ref<HealthResponse | null>(null)

const students = ref<StudentSummary[]>([])
const stages = ref<ClassroomStage[]>([])
const selectedStudentId = ref('')
const selectedStageCode = ref('')
const classroom = ref<Awaited<ReturnType<typeof fetchStudentClassroom>> | null>(null)

const identities = ref<IdentitySummary[]>([])
const internalIds = ref<InternalIdSummary[]>([])
const teachers = ref<TeacherSummary[]>([])
const assignments = ref<TeacherAssignment[]>([])

const studentForm = ref({
  name: '',
  university: '',
  major: '',
  currentStage: '',
})

const newStudentForm = ref({
  name: '',
  university: '',
  major: '',
  currentStage: '',
})

const bindForm = ref({
  studentId: '',
  userId: '',
})

const teacherForm = ref({
  userId: '',
  name: '',
  title: '',
  bio: '',
})

const assignmentForm = ref({
  studentId: '',
  teacherId: '',
  stageCode: '',
  relationship: 'primary' as 'primary' | 'support',
})

const adminBootstrapForm = ref({
  internalId: '',
  userId: '',
})

const planForm = ref<EditablePlan | null>(null)

function toLocalDateTimeInput(date = new Date()) {
  const pad = (value: number) => String(value).padStart(2, '0')
  return [
    date.getFullYear(),
    '-',
    pad(date.getMonth() + 1),
    '-',
    pad(date.getDate()),
    'T',
    pad(date.getHours()),
    ':',
    pad(date.getMinutes()),
  ].join('')
}

const coachingForm = ref({
  teacherId: '',
  title: '',
  content: '',
  occurredAt: toLocalDateTimeInput(),
})

const selectedStudent = computed(
  () => students.value.find((student) => student.id === selectedStudentId.value) ?? null,
)

const stageLabel = computed(
  () => stages.value.find((stage) => stage.code === selectedStageCode.value)?.label ?? '',
)

const unboundUsers = computed(() =>
  identities.value.filter(
    (identity) =>
      identity.role === 'user' &&
      identity.student === null &&
      identity.teacher === null,
  ),
)

const availableAdminIds = computed(() =>
  internalIds.value.filter(
    (identity) => identity.type === 'admin' && identity.status === 'available',
  ),
)

function showError(cause: unknown) {
  error.value = cause instanceof Error ? cause.message : '操作失败'
  notice.value = ''
}

function clearFeedback() {
  error.value = ''
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

async function loadIdentityData() {
  const [identityRows, internalIdRows, teacherRows, assignmentRows] = await Promise.all([
    fetchIdentities(),
    fetchInternalIds(),
    fetchTeachers(),
    fetchTeacherAssignments(),
  ])

  identities.value = identityRows
  internalIds.value = internalIdRows
  teachers.value = teacherRows
  assignments.value = assignmentRows

  if (!bindForm.value.studentId && students.value[0]) {
    bindForm.value.studentId = students.value[0].id
  }
  if (!bindForm.value.userId && unboundUsers.value[0]) {
    bindForm.value.userId = unboundUsers.value[0].id
  }
  if (!teacherForm.value.userId && unboundUsers.value[0]) {
    teacherForm.value.userId = unboundUsers.value[0].id
  }
  if (!assignmentForm.value.studentId && students.value[0]) {
    assignmentForm.value.studentId = students.value[0].id
  }
  if (!assignmentForm.value.teacherId && teachers.value[0]) {
    assignmentForm.value.teacherId = teachers.value[0].id
  }
  if (!adminBootstrapForm.value.internalId && availableAdminIds.value[0]) {
    adminBootstrapForm.value.internalId = availableAdminIds.value[0].id
  }
  if (!adminBootstrapForm.value.userId && unboundUsers.value[0]) {
    adminBootstrapForm.value.userId = unboundUsers.value[0].id
  }
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

    const mentorIds = classroom.value.mentors.map((mentor) => mentor.id)
    if (!mentorIds.includes(coachingForm.value.teacherId)) {
      coachingForm.value.teacherId = mentorIds[0] ?? ''
    }
  } catch (cause) {
    showError(cause)
  }
}

async function onStudentChange(event: Event) {
  const target = event.target as HTMLSelectElement
  await selectStudent(target.value)
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
    clearFeedback()
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
    clearFeedback()
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

async function addCoaching() {
  if (
    !selectedStudentId.value ||
    !selectedStageCode.value ||
    !classroom.value?.showGuidance
  ) {
    error.value = '当前阶段不允许录入辅导记录'
    return
  }

  if (!coachingForm.value.title.trim() || !coachingForm.value.content.trim()) {
    error.value = '请填写辅导记录标题和内容'
    return
  }

  const occurredAt = new Date(coachingForm.value.occurredAt)
  if (Number.isNaN(occurredAt.getTime())) {
    error.value = '请填写有效的辅导时间'
    return
  }

  try {
    saving.value = true
    clearFeedback()
    await createCoachingRecord(selectedStudentId.value, {
      stageCode: selectedStageCode.value,
      teacherId: coachingForm.value.teacherId || null,
      title: coachingForm.value.title.trim(),
      content: coachingForm.value.content.trim(),
      occurredAt: occurredAt.toISOString(),
    })
    coachingForm.value.title = ''
    coachingForm.value.content = ''
    coachingForm.value.occurredAt = toLocalDateTimeInput()
    notice.value = `${stageLabel.value}辅导记录已保存`
    await loadClassroom()
  } catch (cause) {
    showError(cause)
  } finally {
    saving.value = false
  }
}

async function removeCoachingRecord(id: string) {
  if (!window.confirm('确定删除这条辅导记录吗？')) return

  try {
    saving.value = true
    clearFeedback()
    await deleteCoachingRecord(id)
    notice.value = '辅导记录已删除'
    await loadClassroom()
  } catch (cause) {
    showError(cause)
  } finally {
    saving.value = false
  }
}

async function addStudent() {
  if (!newStudentForm.value.name.trim()) {
    error.value = '请填写学员姓名'
    return
  }

  try {
    saving.value = true
    clearFeedback()
    const student = await createStudent({
      name: newStudentForm.value.name.trim(),
      university: newStudentForm.value.university.trim() || null,
      major: newStudentForm.value.major.trim() || null,
      currentStage: newStudentForm.value.currentStage || null,
    })
    students.value.push(student)
    bindForm.value.studentId = student.id
    assignmentForm.value.studentId = student.id
    newStudentForm.value = {
      name: '',
      university: '',
      major: '',
      currentStage: '',
    }
    notice.value = `已创建学员：${student.name}`
  } catch (cause) {
    showError(cause)
  } finally {
    saving.value = false
  }
}

async function bindStudent() {
  if (!bindForm.value.studentId || !bindForm.value.userId) {
    error.value = '请选择学员和待绑定微信身份'
    return
  }

  try {
    saving.value = true
    clearFeedback()
    await bindStudentIdentity(bindForm.value.studentId, bindForm.value.userId)
    notice.value = '微信身份已绑定为正式学员'
    await loadIdentityData()
  } catch (cause) {
    showError(cause)
  } finally {
    saving.value = false
  }
}

async function addTeacher() {
  if (!teacherForm.value.userId || !teacherForm.value.name.trim()) {
    error.value = '请选择微信身份并填写老师姓名'
    return
  }

  try {
    saving.value = true
    clearFeedback()
    const teacher = await createTeacher({
      userId: teacherForm.value.userId,
      name: teacherForm.value.name.trim(),
      title: teacherForm.value.title.trim() || null,
      bio: teacherForm.value.bio.trim() || null,
    })
    assignmentForm.value.teacherId = teacher.id
    teacherForm.value = {
      userId: '',
      name: '',
      title: '',
      bio: '',
    }
    notice.value = `已创建老师身份：${teacher.name}`
    await loadIdentityData()
  } catch (cause) {
    showError(cause)
  } finally {
    saving.value = false
  }
}

async function bootstrapAdmin() {
  if (!adminBootstrapForm.value.internalId || !adminBootstrapForm.value.userId) {
    error.value = '请选择管理员ID与游客账号'
    return
  }

  try {
    saving.value = true
    clearFeedback()
    await bindInternalId(
      adminBootstrapForm.value.internalId,
      adminBootstrapForm.value.userId,
    )
    notice.value = '管理员身份已绑定；该账号重新登录后可进入手机管理员工作台'
    adminBootstrapForm.value = {
      internalId: '',
      userId: '',
    }
    await loadIdentityData()
  } catch (cause) {
    showError(cause)
  } finally {
    saving.value = false
  }
}

async function addAssignment() {
  if (!assignmentForm.value.studentId || !assignmentForm.value.teacherId) {
    error.value = '请选择老师和学员'
    return
  }

  try {
    saving.value = true
    clearFeedback()
    await createTeacherAssignment({
      studentId: assignmentForm.value.studentId,
      teacherId: assignmentForm.value.teacherId,
      stageCode: assignmentForm.value.stageCode || null,
      relationship: assignmentForm.value.relationship,
    })
    notice.value = '老师—学员分配关系已建立'
    assignments.value = await fetchTeacherAssignments()
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

    await loadIdentityData()

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
        <h1>{{ activeSection === 'classroom' ? '我的课堂管理' : '账号与身份管理' }}</h1>
        <p class="muted">
          {{ activeSection === 'classroom'
            ? '维护学员阶段、计划与具体任务。'
            : '管理微信身份、正式学员、辅导老师及授权关系。' }}
        </p>
      </div>
      <div class="status-chip" :class="{ ok: health?.dependencies.database === 'ok' }">
        数据库 {{ health?.dependencies.database ?? 'checking' }}
      </div>
    </header>

    <nav class="section-tabs">
      <button
        type="button"
        :class="{ active: activeSection === 'classroom' }"
        @click="activeSection = 'classroom'"
      >
        课堂管理
      </button>
      <button
        type="button"
        :class="{ active: activeSection === 'identity' }"
        @click="activeSection = 'identity'"
      >
        账号与身份
      </button>
    </nav>

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
      <p>当前后台编辑依赖本地 API + MySQL。</p>
    </t-card>

    <template v-else-if="activeSection === 'classroom'">
      <section class="workspace">
        <t-card title="学员" :bordered="false">
          <label class="field">
            <span>选择学员</span>
            <select :value="selectedStudentId" @change="onStudentChange">
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

            <div v-else class="guidance-editor">
              <div class="editor-head">
                <div>
                  <strong>辅导老师与记录</strong>
                  <p class="muted small">
                    老师来自“账号与身份”中的授权关系；辅导记录由工作人员录入，学员端只读。
                  </p>
                </div>
              </div>

              <div class="mentor-summary">
                <span v-if="classroom.mentors.length === 0" class="muted small">
                  当前阶段尚未分配辅导老师。
                </span>
                <span
                  v-for="mentor in classroom.mentors"
                  :key="mentor.id"
                  class="bound-tag"
                >
                  {{ mentor.name }} · {{ mentor.relationship === 'primary' ? '主辅导' : '协助' }}
                </span>
              </div>

              <div class="form-grid">
                <label class="field">
                  <span>记录老师（可选）</span>
                  <select v-model="coachingForm.teacherId">
                    <option value="">不指定老师</option>
                    <option
                      v-for="mentor in classroom.mentors"
                      :key="mentor.id"
                      :value="mentor.id"
                    >
                      {{ mentor.name }}{{ mentor.title ? ' · ' + mentor.title : '' }}
                    </option>
                  </select>
                </label>
                <label class="field">
                  <span>辅导时间</span>
                  <input v-model="coachingForm.occurredAt" type="datetime-local" />
                </label>
                <label class="field field-wide">
                  <span>标题</span>
                  <input v-model="coachingForm.title" placeholder="例如：大二上阶段规划沟通" />
                </label>
                <label class="field field-wide">
                  <span>内容</span>
                  <textarea
                    v-model="coachingForm.content"
                    rows="4"
                    placeholder="记录本次辅导重点、结论与后续动作"
                  ></textarea>
                </label>
              </div>

              <div class="actions">
                <t-button :loading="saving" @click="addCoaching">新增辅导记录</t-button>
              </div>

              <div class="coaching-list">
                <div v-if="classroom.records.length === 0" class="empty">
                  当前阶段暂无辅导记录。
                </div>
                <div
                  v-for="record in classroom.records"
                  :key="record.id"
                  class="coaching-row"
                >
                  <div>
                    <strong>{{ record.title }}</strong>
                    <p class="muted small">
                      {{ new Date(record.occurredAt).toLocaleString() }}
                      <template v-if="record.teacherName"> · {{ record.teacherName }}</template>
                    </p>
                    <p class="coaching-content">{{ record.content }}</p>
                  </div>
                  <button
                    type="button"
                    class="remove"
                    :disabled="saving"
                    @click="removeCoachingRecord(record.id)"
                  >
                    删除
                  </button>
                </div>
              </div>
            </div>
          </template>
        </t-card>
      </section>
    </template>

    <template v-else>
      <section class="identity-grid">
        <t-card title="微信登录身份" :bordered="false">
          <p class="muted small">
            这里只显示业务 ID 与角色，不展示 OpenID。首次微信登录默认是 user。
          </p>
          <div v-if="identities.length === 0" class="empty">还没有微信用户登录过。</div>
          <div v-for="identity in identities" :key="identity.id" class="identity-row">
            <div>
              <strong>{{ identity.displayName || '未命名微信用户' }}</strong>
              <p class="muted small mono">{{ identity.id }}</p>
            </div>
            <div class="identity-tags">
              <span class="role-tag">{{ identity.role }}</span>
              <span v-if="identity.student" class="bound-tag">学员：{{ identity.student.name }}</span>
              <span v-if="identity.teacher" class="bound-tag">老师：{{ identity.teacher.name }}</span>
            </div>
          </div>
        </t-card>

        <t-card title="管理员ID绑定" :bordered="false">
          <p class="muted small">
            管理员ID不能在小程序个人资料中自助认领。首位及后续管理员均由内部后台绑定。
          </p>
          <div class="form-grid">
            <label class="field">
              <span>可用管理员ID</span>
              <select v-model="adminBootstrapForm.internalId">
                <option value="">请选择</option>
                <option
                  v-for="identity in availableAdminIds"
                  :key="identity.id"
                  :value="identity.id"
                >
                  {{ identity.businessId }}
                </option>
              </select>
            </label>
            <label class="field">
              <span>游客账号</span>
              <select v-model="adminBootstrapForm.userId">
                <option value="">请选择</option>
                <option
                  v-for="identity in unboundUsers"
                  :key="identity.id"
                  :value="identity.id"
                >
                  {{ identity.displayName || '未命名微信用户' }} · {{ identity.id.slice(0, 8) }}
                </option>
              </select>
            </label>
          </div>
          <div class="actions">
            <t-button :loading="saving" @click="bootstrapAdmin">绑定管理员身份</t-button>
          </div>
        </t-card>

        <t-card title="新建学员档案" :bordered="false">
          <div class="form-grid">
            <label class="field">
              <span>姓名</span>
              <input v-model="newStudentForm.name" placeholder="必填" />
            </label>
            <label class="field">
              <span>本科院校</span>
              <input v-model="newStudentForm.university" />
            </label>
            <label class="field">
              <span>专业</span>
              <input v-model="newStudentForm.major" />
            </label>
            <label class="field">
              <span>当前阶段</span>
              <select v-model="newStudentForm.currentStage">
                <option value="">未设置</option>
                <option v-for="stage in stages" :key="stage.code" :value="stage.code">
                  {{ stage.label }}
                </option>
              </select>
            </label>
          </div>
          <div class="actions">
            <t-button :loading="saving" @click="addStudent">创建学员</t-button>
          </div>
        </t-card>

        <t-card title="绑定正式学员身份" :bordered="false">
          <p class="muted small">
            将首次登录产生的普通 user 与九辰正式 Student 档案绑定。
          </p>
          <div class="form-grid">
            <label class="field">
              <span>学员档案</span>
              <select v-model="bindForm.studentId">
                <option value="">请选择</option>
                <option v-for="student in students" :key="student.id" :value="student.id">
                  {{ student.name }} · {{ student.university || '未填写院校' }}
                </option>
              </select>
            </label>
            <label class="field">
              <span>未绑定微信身份</span>
              <select v-model="bindForm.userId">
                <option value="">请选择</option>
                <option v-for="identity in unboundUsers" :key="identity.id" :value="identity.id">
                  {{ identity.displayName || '未命名微信用户' }} · {{ identity.id.slice(0, 8) }}
                </option>
              </select>
            </label>
          </div>
          <div class="actions">
            <t-button :loading="saving" @click="bindStudent">绑定为正式学员</t-button>
          </div>
        </t-card>

        <t-card title="创建老师身份" :bordered="false">
          <div class="form-grid">
            <label class="field">
              <span>未绑定微信身份</span>
              <select v-model="teacherForm.userId">
                <option value="">请选择</option>
                <option v-for="identity in unboundUsers" :key="identity.id" :value="identity.id">
                  {{ identity.displayName || '未命名微信用户' }} · {{ identity.id.slice(0, 8) }}
                </option>
              </select>
            </label>
            <label class="field">
              <span>老师姓名</span>
              <input v-model="teacherForm.name" placeholder="必填" />
            </label>
            <label class="field">
              <span>职称 / 角色</span>
              <input v-model="teacherForm.title" placeholder="例如：保研规划老师" />
            </label>
            <label class="field field-wide">
              <span>展示简介</span>
              <textarea v-model="teacherForm.bio" rows="3" placeholder="供学员查看的老师介绍"></textarea>
            </label>
          </div>
          <div class="actions">
            <t-button :loading="saving" @click="addTeacher">创建老师身份</t-button>
          </div>
        </t-card>

        <t-card title="老师—学员分配" :bordered="false">
          <div class="form-grid">
            <label class="field">
              <span>老师</span>
              <select v-model="assignmentForm.teacherId">
                <option value="">请选择</option>
                <option v-for="teacher in teachers" :key="teacher.id" :value="teacher.id">
                  {{ teacher.name }}{{ teacher.title ? ' · ' + teacher.title : '' }}
                </option>
              </select>
            </label>
            <label class="field">
              <span>学员</span>
              <select v-model="assignmentForm.studentId">
                <option value="">请选择</option>
                <option v-for="student in students" :key="student.id" :value="student.id">
                  {{ student.name }}
                </option>
              </select>
            </label>
            <label class="field">
              <span>阶段（可选）</span>
              <select v-model="assignmentForm.stageCode">
                <option value="">全阶段</option>
                <option v-for="stage in stages" :key="stage.code" :value="stage.code">
                  {{ stage.label }}
                </option>
              </select>
            </label>
            <label class="field">
              <span>关系</span>
              <select v-model="assignmentForm.relationship">
                <option value="primary">主辅导</option>
                <option value="support">协助</option>
              </select>
            </label>
          </div>
          <div class="actions">
            <t-button :loading="saving" @click="addAssignment">建立分配关系</t-button>
          </div>

          <div class="assignment-list">
            <div v-if="assignments.length === 0" class="empty">暂无老师—学员分配关系。</div>
            <div v-for="assignment in assignments" :key="assignment.id" class="assignment-row">
              <strong>{{ assignment.teacherName }}</strong>
              <span>→</span>
              <strong>{{ assignment.studentName }}</strong>
              <span class="bound-tag">
                {{ assignment.relationship === 'primary' ? '主辅导' : '协助' }}
              </span>
              <span v-if="assignment.stageCode" class="role-tag">
                {{ stages.find((stage) => stage.code === assignment.stageCode)?.label || assignment.stageCode }}
              </span>
            </div>
          </div>
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

.topbar,
.editor-head,
.identity-row,
.assignment-row {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 16px;
}

.topbar {
  gap: 24px;
  margin-bottom: 18px;
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

.mono {
  font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
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

.section-tabs {
  display: flex;
  gap: 8px;
  margin-bottom: 18px;
}

.section-tabs button,
.plan-tab {
  padding: 9px 14px;
  border: 1px solid #d9ddea;
  border-radius: 999px;
  background: #fff;
  color: #606775;
  cursor: pointer;
}

.section-tabs button.active,
.plan-tab.active {
  border-color: #7255e7;
  background: #f1edff;
  color: #6245d8;
  font-weight: 700;
}

.feedback {
  margin-bottom: 16px;
}

.workspace {
  display: grid;
  grid-template-columns: minmax(280px, 0.8fr) minmax(520px, 1.6fr);
  gap: 20px;
}

.identity-grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
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

.field-wide {
  grid-column: 1 / -1;
}

.stage-field {
  margin-bottom: 18px;
}

input,
select,
textarea {
  width: 100%;
  min-height: 38px;
  box-sizing: border-box;
  padding: 8px 10px;
  border: 1px solid #d7dce5;
  border-radius: 8px;
  background: #fff;
  color: #1f2937;
  font: inherit;
  outline: none;
}

textarea {
  resize: vertical;
}

input:focus,
select:focus,
textarea:focus {
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

.plan-editor {
  padding-top: 4px;
}

.editor-head {
  align-items: center;
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

.identity-row {
  align-items: center;
  padding: 14px 0;
  border-bottom: 1px solid #eef0f4;
}

.identity-row:last-child {
  border-bottom: 0;
}

.identity-tags {
  display: flex;
  justify-content: flex-end;
  flex-wrap: wrap;
  gap: 6px;
}

.role-tag,
.bound-tag {
  padding: 4px 8px;
  border-radius: 999px;
  background: #eef2ff;
  color: #4f46a5;
  font-size: 12px;
}

.bound-tag {
  background: #edf8f1;
  color: #217145;
}

.guidance-editor {
  margin-top: 22px;
  padding-top: 18px;
  border-top: 1px solid #eef0f4;
}

.mentor-summary {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  margin: 12px 0 4px;
}

.coaching-list {
  margin-top: 20px;
}

.coaching-row {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 16px;
  padding: 14px 0;
  border-top: 1px solid #eef0f4;
}

.coaching-content {
  margin: 8px 0 0;
  color: #4b5563;
  font-size: 13px;
  line-height: 1.6;
  white-space: pre-wrap;
}

.assignment-list {
  margin-top: 20px;
}

.assignment-row {
  align-items: center;
  justify-content: flex-start;
  padding: 12px 0;
  border-top: 1px solid #eef0f4;
  font-size: 13px;
}

@media (max-width: 960px) {
  .workspace,
  .identity-grid {
    grid-template-columns: 1fr;
  }

  .item-row,
  .form-grid {
    grid-template-columns: 1fr;
  }

  .field-wide {
    grid-column: auto;
  }
}
</style>
