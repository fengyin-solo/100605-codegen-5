<template>
  <section class="page" data-module="agreement">
    <header class="page-head">
      <div>
        <h2>航司地面服务协议管理</h2>
        <p class="page-desc">按航司维护协议主体，逐条挂服务包、服务项与生效日期；协议四态单向推进，重叠协议裁决后统一调度口径。</p>
      </div>
      <div class="page-actions">
        <button v-if="actor.role === 'airline'" class="btn primary" type="button" @click="openCreate">登记协议草稿</button>
        <button class="btn" type="button" @click="resetDemo">重置演示数据</button>
      </div>
    </header>

    <div :class="['role-banner', { warn: actor.role === 'team' }]">
      <template v-if="actor.role === 'airline'">
        当前身份：{{ actor.name }}（{{ airlineName(actor.airlineId!) }}对接人）。你只能维护归属到你名下的本航司协议，其他协议只读，跨航司改动一律拒绝。
      </template>
      <template v-else-if="actor.role === 'team'">
        当前身份：{{ actor.name }}（{{ actor.title }}）。只读视图：只能查看与「{{ teamName(actor.teamId!) }}」对应的服务项，不能修改协议。
      </template>
      <template v-else-if="actor.role === 'scheduler'">
        当前身份：{{ actor.name }}（资源调度）。协议只读；可读取统一口径的可用服务项、处理调度待办、登记计费引用。
      </template>
      <template v-else>
        当前身份：{{ actor.name }}（管理员）。拥有裁决重叠协议、发起归属变更与终止协议的权限；协议内容仍由航司对接人维护。
      </template>
    </div>

    <div class="stat-row">
      <article v-for="item in stats" :key="item.label" class="stat-card">
        <span class="stat-label">{{ item.label }}</span>
        <strong class="stat-value">{{ item.value }}</strong>
      </article>
    </div>

    <div class="tabs">
      <button
        v-for="tab in shownTabs"
        :key="tab.key"
        type="button"
        :class="['tab', { active: activeTab === tab.key }]"
        @click="switchTab(tab.key)"
      >
        {{ tab.label }}
        <span v-if="tab.badge" class="badge red small" style="margin-left: 4px">{{ tab.badge }}</span>
      </button>
    </div>

    <!-- 协议清单 -->
    <div v-if="activeTab === 'agreements'">
      <form class="filter-bar" @submit.prevent="reload">
        <label class="filter-item">
          <span>航司</span>
          <select v-model="filters.airlineId" :disabled="actor.role === 'airline'">
            <option value="">全部航司</option>
            <option v-for="line in airlines" :key="line.id" :value="line.id">{{ line.name }}</option>
          </select>
        </label>
        <label class="filter-item">
          <span>状态</span>
          <select v-model="filters.status">
            <option value="">全部状态</option>
            <option v-for="status in statuses" :key="status" :value="status">{{ status }}</option>
          </select>
        </label>
        <label class="filter-item">
          <span>关键词</span>
          <input v-model="filters.keyword" placeholder="协议编号 / 主体名称" />
        </label>
        <button class="btn" type="submit">查询</button>
        <button class="btn ghost" type="button" @click="resetFilters">重置条件</button>
      </form>

      <table class="data-table">
        <thead>
          <tr>
            <th>协议编号</th>
            <th>协议主体</th>
            <th>航司</th>
            <th>归属对接人</th>
            <th>有效期</th>
            <th>服务项</th>
            <th>状态</th>
            <th>可执行动作</th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="row in agreements" :key="row.id">
            <td><button class="link" type="button" @click="openDetail(row)">{{ row.code }}</button></td>
            <td>{{ row.subject }}</td>
            <td>{{ airlineName(row.airlineId) }}</td>
            <td>{{ actorName(row.ownerId) }}</td>
            <td>{{ row.effectiveDate }} ~ {{ row.expiryDate }}</td>
            <td>{{ row.lines.length }}（待确认 {{ pendingTempCount(row) }}）</td>
            <td><span :class="['badge', statusClass(row.status)]">{{ row.status }}</span></td>
            <td class="row-actions">
              <button class="link" type="button" @click="openDetail(row)">查看</button>
              <button v-if="canEdit(row)" class="link" type="button" @click="openEdit(row)">改草稿/挂项</button>
              <button v-if="canEdit(row) && row.status === '草稿'" class="link" type="button" @click="submit(row)">提交待生效</button>
              <button v-if="canEdit(row) && row.status === '待生效'" class="link" type="button" @click="activate(row)">推进生效</button>
              <button v-if="canExpire(row)" class="link" type="button" @click="expire(row)">终止失效</button>
              <button v-if="canTransfer(row)" class="link" type="button" @click="openTransfer(row)">归属变更</button>
              <button v-if="actor.role === 'manager' && inConflict(row.id)" class="link" type="button" @click="openConflictFor(row)">裁决重叠</button>
            </td>
          </tr>
          <tr v-if="!agreements.length">
            <td colspan="8" class="empty-state">没有符合条件的协议</td>
          </tr>
        </tbody>
      </table>
      <p v-if="message" :class="['message-line', messageOk ? 'ok' : 'err']">{{ message }}</p>
    </div>

    <!-- 调度可用服务项：统一口径 -->
    <div v-else-if="activeTab === 'canonical'">
      <form class="filter-bar" @submit.prevent>
        <label class="filter-item">
          <span>口径日期</span>
          <input v-model="canonicalQuery.onDate" type="date" />
        </label>
        <label class="filter-item" v-if="actor.role !== 'airline' && actor.role !== 'team'">
          <span>航司</span>
          <select v-model="canonicalQuery.airlineId">
            <option value="">全部航司</option>
            <option v-for="line in airlines" :key="line.id" :value="line.id">{{ line.name }}</option>
          </select>
        </label>
        <label class="filter-item" v-if="actor.role !== 'team'">
          <span>执行班组</span>
          <select v-model="canonicalQuery.teamId">
            <option value="">全部班组</option>
            <option v-for="team in teams" :key="team.id" :value="team.id">{{ team.name }}</option>
          </select>
        </label>
      </form>
      <p class="role-banner">
        这是资源调度唯一可用口径：仅取「生效中」协议最新冻结版本中、已到生效日、且经对接人确认的服务项；重叠时段按裁决结果执行，败方重复项不重复派活。计费引用也只能引用这里的项目。
      </p>
      <table class="data-table table-compact">
        <thead>
          <tr>
            <th>航司</th><th>执行协议</th><th>服务包</th><th>服务项</th><th>执行班组</th>
            <th>口径</th><th>生效日期</th><th>协议价</th><th>裁决说明</th>
          </tr>
        </thead>
        <tbody>
          <template v-for="row in canonicalRows" :key="`${row.agreementId}-${row.serviceItemId}`">
            <tr :class="{ 'row-suppressed': Boolean(row.suppressedBy) }">
              <td>{{ row.airlineName }}</td>
              <td>{{ row.agreementCode }}</td>
              <td>{{ row.packageName }}</td>
              <td>{{ row.name }}</td>
              <td>{{ row.teamName }}</td>
              <td><span :class="['badge', 'small', row.kind === '临时加项' ? 'purple' : 'gray']">{{ row.kind }}</span></td>
              <td>{{ row.effectiveDate }}</td>
              <td>{{ row.price }} 元/{{ row.unit }}</td>
              <td>
                <span v-if="row.suppressedBy" class="badge red small">被 {{ row.suppressedBy }} 覆盖，不执行</span>
                <span v-else class="muted">—</span>
              </td>
            </tr>
          </template>
          <tr v-if="!canonicalRows.length">
            <td colspan="9" class="empty-state">该日期/筛选条件下没有可用服务项</td>
          </tr>
        </tbody>
      </table>
      <p class="muted" style="margin-top: 8px">
        共 {{ canonicalRows.length }} 项，其中被裁决覆盖 {{ suppressedCount }} 项；班组页面与资源调度页面读到的是同一份数据。
      </p>
    </div>

    <!-- 待裁决重叠 -->
    <div v-else-if="activeTab === 'conflicts'">
      <table class="data-table">
        <thead>
          <tr><th>航司</th><th>协议 A</th><th>协议 B</th><th>重叠时段</th><th>状态组合</th><th>操作</th></tr>
        </thead>
        <tbody>
          <tr v-for="pair in conflicts" :key="`${pair.a.id}-${pair.b.id}`">
            <td>{{ pair.airlineName }}</td>
            <td>
              <strong>{{ pair.a.code }}</strong>
              <span :class="['badge', 'small', statusClass(pair.a.status)]" style="margin-left: 6px">{{ pair.a.status }}</span>
              <div class="muted">{{ pair.a.subject }}</div>
            </td>
            <td>
              <strong>{{ pair.b.code }}</strong>
              <span :class="['badge', 'small', statusClass(pair.b.status)]" style="margin-left: 6px">{{ pair.b.status }}</span>
              <div class="muted">{{ pair.b.subject }}</div>
            </td>
            <td>{{ pair.start }} ~ {{ pair.end }}</td>
            <td>
              <span v-if="pair.arbitration" class="badge green small">已裁决：{{ codeOf(pair.arbitration.winnerAgreementId) }} 优先</span>
              <span v-else class="badge amber small">未裁决：败方无法生效</span>
            </td>
            <td>
              <button class="link" type="button" @click="openArbitrate(pair)">
                {{ pair.arbitration ? '查看说明' : '发起裁决' }}
              </button>
            </td>
          </tr>
          <tr v-if="!conflicts.length">
            <td colspan="6" class="empty-state">当前没有同航司时段重叠的协议</td>
          </tr>
        </tbody>
      </table>
    </div>

    <!-- 资源调度待办 -->
    <div v-else-if="activeTab === 'todos'">
      <div class="todo-list">
        <div v-for="todo in todos" :key="todo.id" :class="['todo-item', todo.read ? 'read' : 'unread']">
          <div>
            <div>
              <span :class="['badge', 'small', todoKindClass(todo.kind)]">{{ todo.kind }}</span>
              <strong style="margin-left: 6px">{{ todo.title }}</strong>
            </div>
            <div class="todo-meta">{{ todo.detail }}</div>
            <div class="todo-meta">{{ todo.at }}<span v-if="todo.airlineId"> · {{ airlineName(todo.airlineId) }}</span></div>
          </div>
          <button
            v-if="!todo.read && canAckTodo"
            class="btn"
            type="button"
            @click="ack(todo.id)"
          >标记已处理</button>
          <span v-else-if="todo.read" class="muted">已处理</span>
        </div>
        <p v-if="!todos.length" class="empty-state">暂无调度待办</p>
      </div>
    </div>

    <!-- 弹层 -->
    <AgreementEditModal
      v-if="editTarget !== null"
      :key="editTarget === false ? 'new' : editTarget"
      :actor="actor"
      :agreement="editTarget === false ? undefined : freshAgreement(editTarget)"
      @close="editTarget = null"
      @saved="onSaved"
    />
    <AgreementDetailModal
      v-if="detailId"
      :actor="actor"
      :agreement="freshAgreement(detailId)!"
      @close="detailId = ''"
      @changed="reload"
    />
    <ArbitrationModal
      v-if="arbitrationPair"
      :actor="actor"
      :pair="arbitrationPair"
      @close="arbitrationPair = null"
      @done="onArbitrated"
    />
    <TransferModal
      v-if="transferTarget"
      :actor="actor"
      :agreement="transferTarget"
      @close="transferTarget = null"
      @done="onTransferDone"
    />
  </section>
</template>

<script setup lang="ts">
import { computed, reactive, ref, watch } from 'vue'

import AgreementEditModal from './AgreementEditModal.vue'
import AgreementDetailModal from './AgreementDetailModal.vue'
import ArbitrationModal from './ArbitrationModal.vue'
import TransferModal from './TransferModal.vue'
import {
  activateAgreement,
  ackTodo,
  canonicalItems,
  expireAgreement,
  listAgreements,
  listConflicts,
  listTodos,
  submitDraft,
} from '@/data/agreement/agreement-service'
import { AIRLINES, TEAMS, getActor, getAirline } from '@/data/agreement/catalog'
import { resetAll } from '@/data/agreement/agreement-service'
import { domainState } from '@/data/agreement/store'
import { useSessionStore } from '@/stores/session'
import type { Agreement, AgreementStatus, ScheduleTodo } from '@/data/agreement/types'
import type { ConflictPair } from '@/data/agreement/agreement-service'

const store = useSessionStore()
const actor = computed(() => store.actor)

const airlines = AIRLINES
const teams = TEAMS
const statuses: AgreementStatus[] = ['草稿', '待生效', '生效中', '已失效']

type TabKey = 'agreements' | 'canonical' | 'conflicts' | 'todos'
const activeTab = ref<TabKey>('agreements')

const agreements = ref<Agreement[]>([])
const conflicts = ref<ConflictPair[]>([])
const todos = ref<ScheduleTodo[]>([])
const message = ref('')
const messageOk = ref(false)

const filters = reactive({
  airlineId: '',
  status: '' as '' | AgreementStatus,
  keyword: '',
})

const canonicalQuery = reactive({
  onDate: '2026-11-02',
  airlineId: '',
  teamId: '',
})

const detailId = ref('')
const editTarget = ref<string | false | null>(null)
const arbitrationPair = ref<ConflictPair | null>(null)
const transferTarget = ref<Agreement | null>(null)

const canAckTodo = computed(() => actor.value.role === 'scheduler' || actor.value.role === 'manager')

const shownTabs = computed(() => {
  const base: { key: TabKey; label: string; badge?: number }[] = [
    { key: 'agreements', label: '协议清单' },
    { key: 'canonical', label: '调度可用服务项（统一口径）' },
  ]
  if (actor.value.role === 'manager') {
    base.push({ key: 'conflicts', label: '重叠协议裁决', badge: conflictBadge.value })
  }
  if (actor.value.role !== 'team') {
    base.push({ key: 'todos', label: '资源调度待办', badge: todoBadge.value })
  }
  return base
})

const conflictBadge = computed(() => listConflicts(false).length)
const todoBadge = computed(() => listTodos(actor.value.id).filter((row) => !row.read).length)

const stats = computed(() => {
  const rows = listAgreements(actor.value.id)
  return [
    { label: '可见协议', value: rows.length },
    { label: '草稿', value: rows.filter((row) => row.status === '草稿').length },
    { label: '待生效', value: rows.filter((row) => row.status === '待生效').length },
    { label: '生效中', value: rows.filter((row) => row.status === '生效中').length },
    { label: '已失效', value: rows.filter((row) => row.status === '已失效').length },
  ]
})

const canonicalRows = computed(() =>
  canonicalItems(actor.value.id, {
    onDate: canonicalQuery.onDate || undefined,
    airlineId: canonicalQuery.airlineId || undefined,
    teamId: canonicalQuery.teamId || undefined,
  }),
)
const suppressedCount = computed(() => canonicalRows.value.filter((row) => row.suppressedBy).length)

function airlineName(id: string): string {
  return getAirline(id)?.name ?? id
}

function teamName(id: string): string {
  return TEAMS.find((row) => row.id === id)?.name ?? id
}

function actorName(id: string): string {
  return getActor(id)?.name ?? id
}

function codeOf(id: string): string {
  return domainState().agreements.find((row) => row.id === id)?.code ?? id
}

function statusClass(status: AgreementStatus): string {
  if (status === '生效中') {
    return 'green'
  }
  if (status === '待生效') {
    return 'blue'
  }
  if (status === '已失效') {
    return 'red'
  }
  return 'gray'
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

function pendingTempCount(row: Agreement): number {
  return row.lines.filter((line) => line.kind === '临时加项' && !line.confirmed).length
}

function canEdit(row: Agreement): boolean {
  return actor.value.role === 'airline'
    && actor.value.airlineId === row.airlineId
    && actor.value.id === row.ownerId
}

function canExpire(row: Agreement): boolean {
  if (row.status !== '生效中') {
    return false
  }
  return actor.value.role === 'manager' || canEdit(row)
}

function canTransfer(row: Agreement): boolean {
  if (actor.value.role === 'manager') {
    return true
  }
  return canEdit(row)
}

function inConflict(id: string): boolean {
  return conflicts.value.some(
    (pair) => !pair.arbitration && (pair.a.id === id || pair.b.id === id),
  )
}

function freshAgreement(id: string | false | null): Agreement | undefined {
  if (!id) {
    return undefined
  }
  return domainState().agreements.find((row) => row.id === id)
}

function showResult(ok: boolean, text: string) {
  messageOk.value = ok
  message.value = text
}

function resetFilters() {
  if (actor.value.role !== 'airline') {
    filters.airlineId = ''
  }
  filters.status = ''
  filters.keyword = ''
  reload()
}

function switchTab(key: TabKey) {
  activeTab.value = key
  reload()
}

function reload() {
  // 航司身份固定查本航司。
  const airlineFilter = actor.value.role === 'airline' ? actor.value.airlineId ?? '' : filters.airlineId
  agreements.value = listAgreements(actor.value.id, {
    airlineId: airlineFilter,
    status: filters.status,
    keyword: filters.keyword,
  })
  conflicts.value = listConflicts(true)
  todos.value = listTodos(actor.value.id)
}

function openCreate() {
  editTarget.value = false
}

function openEdit(row: Agreement) {
  editTarget.value = row.id
}

function openDetail(row: Agreement) {
  detailId.value = row.id
}

function openTransfer(row: Agreement) {
  transferTarget.value = freshAgreement(row.id) ?? row
}

function openConflictFor(row: Agreement) {
  const pair = conflicts.value.find(
    (item) => !item.arbitration && (item.a.id === row.id || item.b.id === row.id),
  )
  if (pair) {
    arbitrationPair.value = pair
  }
}

function openArbitrate(pair: ConflictPair) {
  if (pair.arbitration) {
    showResult(true, `该重叠已于 ${pair.arbitration.at} 裁决：按 ${codeOf(pair.arbitration.winnerAgreementId)} 执行。${pair.arbitration.note}`)
    return
  }
  arbitrationPair.value = pair
}

function onSaved(newId?: string) {
  reload()
  // 新建草稿后切到该草稿的编辑态，方便继续逐条挂服务项。
  if (editTarget.value === false && newId) {
    editTarget.value = newId
  }
}

function onArbitrated() {
  arbitrationPair.value = null
  reload()
  showResult(true, '裁决已记录并同步到资源调度待办')
}

function onTransferDone() {
  transferTarget.value = null
  reload()
  showResult(true, '归属变更已记录')
}

function submit(row: Agreement) {
  const result = submitDraft(actor.value.id, row.id)
  showResult(result.ok, result.message)
  reload()
}

function activate(row: Agreement) {
  const result = activateAgreement(actor.value.id, row.id)
  showResult(result.ok, result.message)
  reload()
}

function expire(row: Agreement) {
  const reason = window.prompt(`将 ${row.code} 终止失效（终态不可回退），请填写原因：`, '换季协议到期，按新航季协议执行')
  if (reason === null) {
    return
  }
  const result = expireAgreement(actor.value.id, row.id, reason)
  showResult(result.ok, result.message)
  reload()
}

function ack(id: string) {
  const result = ackTodo(actor.value.id, id)
  showResult(result.ok, result.message)
  reload()
}

function resetDemo() {
  resetAll()
  message.value = '演示数据已重置'
  messageOk.value = true
  reload()
}

// 头部切换身份后，可见协议、待办角标、统计卡片立即按新身份刷新。
watch(() => store.actorId, () => {
  // 航司身份不应带着别的航司筛选条件。
  if (actor.value.role === 'airline') {
    filters.airlineId = ''
    filters.keyword = ''
  }
  if (actor.value.role === 'team') {
    activeTab.value = 'agreements'
  }
  message.value = ''
  reload()
})

reload()
</script>
