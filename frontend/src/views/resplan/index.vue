<template>
  <section class="page" data-module="resplan">
    <header class="page-head">
      <div>
        <h2>保障资源调度管理</h2>
        <p class="page-desc">维护资源计划，围绕计划编号、保障时段、机位需求、车辆需求做登记、筛选与状态流转。</p>
      </div>
      <div class="page-actions">
        <button class="btn primary" type="button" @click="openCreate">登记资源计划</button>
        <button class="btn" type="button" @click="exportRows">导出保障资源调度清单</button>
      </div>
    </header>

    <div class="stat-row">
      <article v-for="item in stats" :key="item.label" class="stat-card">
        <span class="stat-label">{{ item.label }}</span>
        <strong class="stat-value">{{ item.value }}</strong>
      </article>
    </div>

    <section class="agreement-link">
      <div class="agreement-link-head">
        <h3>航司协议联动</h3>
        <RouterLink class="link" to="/agreement-dispatch">打开协议调度工作台 →</RouterLink>
      </div>
      <p class="page-desc">协议生效、失效、临时加项与重叠裁决的结果会自动落到这里；可用服务项与计费引用同口径，裁决未采用或未生效的不会出现。</p>
      <div class="link-columns">
        <div>
          <h4>待办（{{ agreementTodos.length }}）</h4>
          <ul class="todo-list">
            <li v-for="todo in agreementTodos.slice(0, 5)" :key="todo.id" :class="{ done: todo.done }">
              <span class="todo-type">{{ todo.type }}</span>{{ todo.title }}
            </li>
            <li v-if="!agreementTodos.length" class="empty-inline">暂无协议变更待办</li>
          </ul>
        </div>
        <div>
          <h4>当日可用服务项（{{ availableCount }}）</h4>
          <ul class="todo-list">
            <li v-for="item in availableSample" :key="`${item.agreementId}-${item.id}`">
              {{ item.airlineName }} · {{ item.name }}（{{ item.price }}元/{{ item.unit }}）
            </li>
            <li v-if="!availableSample.length" class="empty-inline">当日无可用服务项</li>
          </ul>
        </div>
      </div>
    </section>

    <p class="status-legend">
      <span v-for="item in statusSummary" :key="item.status" class="legend-item">
        {{ item.status }}：{{ item.count }}
      </span>
    </p>

    <form class="filter-bar" @submit.prevent="reload">
      <label v-for="field in filterFields" :key="field" class="filter-item">
        <span>{{ field }}</span>
        <input v-model="filters[field]" :placeholder="`按${field}检索`" />
      </label>
      <button class="btn" type="submit">查询</button>
      <button class="btn ghost" type="button" @click="resetFilters">重置条件</button>
    </form>

    <table class="data-table">
      <thead>
        <tr>
          <th v-for="column in columns" :key="column">{{ column }}</th>
          <th>当前状态</th>
          <th>可执行动作</th>
        </tr>
      </thead>
      <tbody>
        <tr v-for="row in rows" :key="String(row.id)">
          <td v-for="column in columns" :key="column">{{ row[column] ?? '—' }}</td>
          <td>{{ row.status }}</td>
          <td class="row-actions">
            <button
              v-for="action in actions"
              :key="action"
              class="link"
              type="button"
              @click="runAction(action, row)"
            >
              {{ action }}
            </button>
          </td>
        </tr>
        <tr v-if="!rows.length">
          <td :colspan="columns.length + 2" class="empty-state">暂无保障资源调度数据，可先登记资源计划</td>
        </tr>
      </tbody>
    </table>

    <footer class="page-foot">
      <span>共 {{ total }} 条保障资源调度记录</span>
      <span v-if="errorMessage" class="error-text">{{ errorMessage }}</span>
    </footer>
  </section>
</template>

<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { storeToRefs } from 'pinia'

import {
  downloadEntries,
  listEntries,
  moduleMeta,
  runAction as applyAction,
} from '@/api/local-service'
import type { EntryRow } from '@/data/types'
import { useSessionStore } from '@/stores/session'
import { availableItems, listTodos } from '@/data/agreement-service'
import type { DispatchTodo } from '@/data/agreement-types'

const session = useSessionStore()
const { currentIdentity: identity } = storeToRefs(session)

const meta = moduleMeta('resplan')
const columns = ["计划编号", "保障时段", "机位需求", "车辆需求", "人员需求", "资源缺口", "调度人员", "计划状态"]
const actions = ["提交审核", "下发计划", "作废计划"]
const statuses = ["待编制", "待审核", "已下发", "已作废"]
const stats = [{"label": "待编制计划", "value": 0}, {"label": "已下发计划", "value": 0}, {"label": "存在缺口的计划", "value": 0}]

const rows = ref<EntryRow[]>([])
const total = ref(0)
const errorMessage = ref('')
const filters = ref<Record<string, string>>({})
const filterFields = columns.slice(0, 3)
const statusSummary = computed(() =>
  statuses.map((status: string) => ({
    status,
    count: rows.value.filter((row) => String(row.status) === status).length,
  })),
)

const agreementTodos = ref<DispatchTodo[]>([])
const available = computed(() => availableItems(identity.value))
const availableCount = computed(() => available.value.length)
const availableSample = computed(() => available.value.slice(0, 5))

function resetFilters() {
  filters.value = {}
  reload()
}

function exportRows() {
  downloadEntries(meta.key)
}

function openCreate() {
  errorMessage.value = '资源计划登记入口尚未接入审批流'
}

function runAction(action: string, row: EntryRow) {
  errorMessage.value = ''
  const result = applyAction(meta.key, Number(row.id), action)
  if (!result.ok) {
    errorMessage.value = result.message
    return
  }
  reload()
}

function reload() {
  errorMessage.value = ''
  try {
    const payload = listEntries(meta.key, filters.value)
    rows.value = payload.items
    total.value = payload.total
    agreementTodos.value = listTodos(identity.value)
  } catch (error) {
    errorMessage.value = error instanceof Error ? error.message : '保障资源调度列表读取失败'
  }
}

onMounted(reload)
</script>

<style scoped>
.agreement-link { background: #fff; border: 1px solid var(--border); border-radius: 10px; padding: 12px 14px; margin-bottom: 14px; }
.agreement-link-head { display: flex; justify-content: space-between; align-items: center; }
.agreement-link-head h3 { margin: 0; font-size: 15px; }
.link-columns { display: grid; grid-template-columns: 1fr 1fr; gap: 18px; margin-top: 8px; }
.link-columns h4 { margin: 0 0 6px; font-size: 13px; }
.todo-list { list-style: none; margin: 0; padding: 0; font-size: 12px; display: flex; flex-direction: column; gap: 4px; }
.todo-list li { background: #f8fafc; border-radius: 6px; padding: 4px 8px; }
.todo-list li.done { opacity: 0.55; }
.todo-type { display: inline-block; background: #e0e7ff; color: #3730a3; border-radius: 4px; padding: 0 6px; margin-right: 6px; }
.empty-inline { color: var(--muted); }
</style>
