<template>
  <section class="page" data-module="resplan">
    <header class="page-head">
      <div>
        <h2>保障资源调度管理</h2>
        <p class="page-desc">资源计划编制与下发；协议变更结果落到调度待办，可用服务项与协议管理页读取同一口径。</p>
      </div>
      <div class="page-actions">
        <button class="btn primary" type="button" @click="openCreate">登记资源计划</button>
        <button class="btn" type="button" @click="exportRows">导出保障资源调度清单</button>
      </div>
    </header>

    <!-- 协议同步过来的调度待办 -->
    <div class="section-title">协议变更待办</div>
    <div class="todo-list" style="margin-bottom: 14px">
      <div v-for="todo in todos" :key="todo.id" :class="['todo-item', todo.read ? 'read' : 'unread']">
        <div>
          <div>
            <span :class="['badge', 'small', todoKindClass(todo.kind)]">{{ todo.kind }}</span>
            <strong style="margin-left: 6px">{{ todo.title }}</strong>
          </div>
          <div class="todo-meta">{{ todo.detail }}</div>
          <div class="todo-meta">{{ todo.at }}<span v-if="todo.airlineId"> · {{ airlineName(todo.airlineId) }}</span></div>
        </div>
        <button v-if="!todo.read && canAck" class="btn" type="button" @click="ack(todo.id)">标记已处理</button>
        <span v-else-if="todo.read" class="muted">已处理</span>
      </div>
      <p v-if="!todos.length" class="empty-state">暂无协议变更待办</p>
    </div>

    <!-- 协议可用服务项：调度排产的唯一口径 -->
    <div class="section-title">航司可用服务项（排产口径，只读）</div>
    <form class="filter-bar" @submit.prevent>
      <label class="filter-item">
        <span>口径日期</span>
        <input v-model="onDate" type="date" />
      </label>
      <label class="filter-item">
        <span>航司</span>
        <select v-model="airlineId">
          <option value="">全部航司</option>
          <option v-for="line in airlines" :key="line.id" :value="line.id">{{ line.name }}</option>
        </select>
      </label>
      <label class="filter-item" v-if="actor.role !== 'team'">
        <span>班组</span>
        <select v-model="teamId">
          <option value="">全部班组</option>
          <option v-for="team in teams" :key="team.id" :value="team.id">{{ team.name }}</option>
        </select>
      </label>
      <span class="muted" v-if="actor.role === 'team'">仅显示你所在班组对应的服务项</span>
    </form>
    <table class="data-table table-compact" style="margin-bottom: 16px">
      <thead>
        <tr>
          <th>航司</th><th>执行协议</th><th>服务包</th><th>服务项</th><th>执行班组</th>
          <th>口径</th><th>生效日期</th><th>协议价</th><th>裁决状态</th>
        </tr>
      </thead>
      <tbody>
        <tr v-for="row in canonicalRows" :key="`${row.agreementId}-${row.serviceItemId}`" :class="{ 'row-suppressed': Boolean(row.suppressedBy) }">
          <td>{{ row.airlineName }}</td>
          <td>{{ row.agreementCode }}</td>
          <td>{{ row.packageName }}</td>
          <td>{{ row.name }}</td>
          <td>{{ row.teamName }}</td>
          <td>{{ row.kind }}</td>
          <td>{{ row.effectiveDate }}</td>
          <td>{{ row.price }} 元/{{ row.unit }}</td>
          <td>
            <span v-if="row.suppressedBy" class="badge red small">重叠时段按 {{ row.suppressedBy }} 执行</span>
            <span v-else class="badge green small">可排产</span>
          </td>
        </tr>
        <tr v-if="!canonicalRows.length">
          <td colspan="9" class="empty-state">该条件下没有可排产服务项</td>
        </tr>
      </tbody>
    </table>

    <div class="stat-row">
      <article v-for="item in stats" :key="item.label" class="stat-card">
        <span class="stat-label">{{ item.label }}</span>
        <strong class="stat-value">{{ item.value }}</strong>
      </article>
    </div>

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
import { computed, onMounted, ref, watch } from 'vue'

import {
  downloadEntries,
  listEntries,
  moduleMeta,
  runAction as applyAction,
} from '@/api/local-service'
import {
  ackTodo,
  canonicalItems,
  listTodos,
} from '@/data/agreement/agreement-service'
import { AIRLINES, TEAMS, getAirline } from '@/data/agreement/catalog'
import type { ScheduleTodo } from '@/data/agreement/types'
import { useSessionStore } from '@/stores/session'
import type { EntryRow } from '@/data/types'

const store = useSessionStore()
const actor = computed(() => store.actor)

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

const airlines = AIRLINES
const teams = TEAMS
const onDate = ref('2026-11-02')
const airlineId = ref('')
const teamId = ref('')
const todos = ref<ScheduleTodo[]>([])

const canAck = computed(() => actor.value.role === 'scheduler' || actor.value.role === 'manager')

const canonicalRows = computed(() =>
  canonicalItems(actor.value.id, {
    onDate: onDate.value || undefined,
    airlineId: airlineId.value || undefined,
    teamId: teamId.value || undefined,
  }),
)

function airlineName(id: string): string {
  return getAirline(id)?.shortName ?? id
}

function todoKindClass(kind: ScheduleTodo['kind']): string {
  if (kind === '重叠裁决') {
    return 'amber'
  }
  if (kind === '协议失效') {
    return 'red'
  }
  if (kind === '协议生效') {
    return 'green'
  }
  if (kind === '归属变更') {
    return 'purple'
  }
  return 'blue'
}

function reloadAgreementData() {
  todos.value = listTodos(actor.value.id)
}

function ack(id: string) {
  const result = ackTodo(actor.value.id, id)
  errorMessage.value = result.ok ? '' : result.message
  reloadAgreementData()
}

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
  } catch (error) {
    errorMessage.value = error instanceof Error ? error.message : '保障资源调度列表读取失败'
  }
}

onMounted(() => {
  reload()
  reloadAgreementData()
})

// 切换身份（头部下拉）后，待办与可见服务项立即跟着变。
watch(() => store.actorId, () => reloadAgreementData())
</script>
