<script setup lang="ts">
import { onMounted, ref } from 'vue'
import { fetchHealth, type HealthResponse } from './lib/api'

const loading = ref(true)
const error = ref('')
const health = ref<HealthResponse | null>(null)

onMounted(async () => {
  try {
    health.value = await fetchHealth()
  } catch (cause) {
    error.value = cause instanceof Error ? cause.message : '无法连接 API'
  } finally {
    loading.value = false
  }
})
</script>

<template>
  <main class="page">
    <t-card title="九辰管理后台" :bordered="false">
      <p>P1 基础骨架已启动。</p>
      <p class="muted">当前只验证后台、API 与数据库基础链路，不提前开发业务管理页面。</p>

      <t-divider />

      <p v-if="loading">正在检查 API…</p>
      <t-alert v-else-if="error" theme="error" :message="error" />
      <template v-else-if="health">
        <p><strong>API：</strong>{{ health.ok ? '正常' : '异常' }}</p>
        <p><strong>环境：</strong>{{ health.environment }}</p>
        <p><strong>数据库：</strong>{{ health.dependencies.database }}</p>
      </template>
    </t-card>
  </main>
</template>

<style scoped>
.page {
  min-height: 100vh;
  box-sizing: border-box;
  padding: 32px;
  background: #f5f7fa;
}

.muted {
  color: #6b7280;
}
</style>
