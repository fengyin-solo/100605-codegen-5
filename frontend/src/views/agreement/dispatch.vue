<template>
  <section class="page" data-module="agreement-dispatch">
    <header class="page-head">
      <div>
        <h2>协议调度工作台</h2>
        <p class="page-desc">协议变更结果落到这里的待办清单；「可用服务项」是调度与计费的唯一口径，裁决未采用、未生效、已失效的内容都不会出现。</p>
      </div>
    </header>

    <div class="role-banner">
      <span>当前身份：<strong>{{ identity.name }}</strong></span>
      <label class="date-pick">
        口径日期
        <input v-model="bizDate" type="date" />
      </label>
    </div>

    <div class="tabs">
      <button
        v-for="tab in tabs"
        :key="tab.key"
        class="tab"
        :class="{ active: activeTab === tab.key }"
        type="button"
        @click="activeTab = tab.key"
      >
        {{ tab.label }}
      </button>
    </div>

    <!-- 待办清单 -->
    <div v-if="activeTab === 'todo'">
      <table class="data-table">
        <thead><tr><th>状态</th><th>类型</th><th>航司</th><th>事项</th><th>说明</th><th>参照日期</th><th>生成时间</th><th v-if="canManageTodo">操作</th></tr></thead>
        <tbody>
          <tr v-for="todo in todos" :key="todo.id" :class="{ done: todo.done }">
            <td>{{ todo.done ? '已完成' : '待处理' }}</td>
            <td><span class="tag" :data-type="todo.type">{{ todo.type }}</span></td>
            <td>{{ airlineName(todo.airlineId) }}</td>
            <td>{{ todo.title }}</td>
            <td>{{ todo.summary }}</td>
            <td>{{ todo.refDate }}</td>
            <td>{{ todo.createdAt }}</td>
            <td v-if="canManageTodo" class="row-actions">
              <button class="link" type="button" @click="toggleDone(todo.id, !todo.done)">
                {{ todo.done ? '撤销完成' : '标记完成' }}
              </button>
            </td>
          </tr>
          <tr v-if="!todos.length"><td :colspan="canManageTodo ? 8 : 7" class="empty-state">暂无协议变更待办</td></tr>
        </tbody>
      </table>
    </div>

    <!-- 可用服务项（调度 + 计费唯一口径） -->
    <div v-else-if="activeTab === 'available'">
      <p class="page-desc">下方即调度可读、计费可引用的全部服务项（{{ available.length }} 条）。班组身份只显示本班组项。</p>
      <table class="data-table">
        <thead><tr><th>航司</th><th>协议</th><th>航季</th><th>服务包</th><th>服务项</th><th>班组</th><th>单位</th><th>单价</th><th>口径</th><th v-if="canBill">计费引用</th></tr></thead>
        <tbody>
          <tr v-for="item in available" :key="`${item.agreementId}-${item.id}`">
            <td>{{ item.airlineName }}</td>
            <td>{{ item.agreementCode }}</td>
            <td>{{ item.season }}</td>
            <td>{{ item.packageName }}</td>
            <td>{{ item.name }}</td>
            <td>{{ teamName(item.teamCode) }}</td>
            <td>{{ item.unit }}</td>
            <td>{{ item.price }}</td>
            <td>
              <span v-if="item.isAdHoc" class="tag adhoc">临时加项</span>
              <span v-else class="tag formal">正式签订</span>
            </td>
            <td v-if="canBill">
              <button class="link" type="button" @click="openBill(item.agreementId, item.id, item.name)">引用计费</button>
            </td>
          </tr>
          <tr v-if="!available.length">
            <td :colspan="canBill ? 10 : 9" class="empty-state">当日没有可用服务项（可能全部未生效、已失效或被重叠裁决压制）</td>
          </tr>
        </tbody>
      </table>

      <form v-if="billForm" class="inline-form panel" @submit.prevent="submitBill">
        <span>对「{{ billForm.itemName }}」发起计费引用：</span>
        <label class="filter-item grow"><span>计费周期</span><input v-model="billForm.period" placeholder="如：2026-10 第一周 / 航班号 CA1234" /></label>
        <button class="btn primary" type="submit">确认引用</button>
        <button class="btn ghost" type="button" @click="billForm = null">取消</button>
      </form>
    </div>

    <!-- 计费引用记录 -->
    <div v-else>
      <p class="page-desc">引用瞬间按协议当时版本冻结单价与口径；草稿/待生效协议无法被引用，协议失效后历史引用仍保留。</p>
      <table class="data-table">
        <thead><tr><th>引用单号</th><th>航司</th><th>协议(版本)</th><th>服务项</th><th>班组</th><th>单价</th><th>口径</th><th>计费周期</th><th>引用时间</th><th>操作人</th></tr></thead>
        <tbody>
          <tr v-for="ref in billingRefs" :key="ref.id">
            <td>{{ ref.refNo }}</td>
            <td>{{ airlineName(ref.airlineId) }}</td>
            <td>{{ ref.agreementCode }}（V{{ ref.agreementVersion }}）</td>
            <td>{{ ref.itemName }}</td>
            <td>{{ teamName(ref.teamCode) }}</td>
            <td>{{ ref.price }}元/{{ ref.unit }}</td>
            <td><span v-if="ref.isAdHoc" class="tag adhoc">临时加项</span><span v-else class="tag formal">正式签订</span></td>
            <td>{{ ref.periodLabel }}</td>
            <td>{{ ref.at }}</td>
            <td>{{ ref.operatorName }}</td>
          </tr>
          <tr v-if="!billingRefs.length"><td colspan="10" class="empty-state">暂无计费引用</td></tr>
        </tbody>
      </table>
    </div>

    <footer class="page-foot">
      <span v-if="message" class="error-text">{{ message }}</span>
    </footer>
  </section>
</template>

<script setup lang="ts">
import { computed, reactive, ref } from 'vue'
import { storeToRefs } from 'pinia'

import { useSessionStore } from '@/stores/session'
import {
  airlineName,
  availableItems,
  createBillingReference,
  listBillingRefs,
  listTodos,
  markTodoDone,
  teamName,
  todayIso,
} from '@/data/agreement-service'
import type { BillingReference, DispatchTodo } from '@/data/agreement-types'

const session = useSessionStore()
const { currentIdentity: identity } = storeToRefs(session)

const tabs = [
  { key: 'todo', label: '资源调度待办' },
  { key: 'available', label: '可用服务项（调度/计费口径）' },
  { key: 'billing', label: '计费引用记录' },
] as const

const activeTab = ref<(typeof tabs)[number]['key']>('todo')
const bizDate = ref(todayIso())
const message = ref('')

const todos = ref<DispatchTodo[]>([])
const billingRefs = ref<BillingReference[]>([])
const billForm = ref<{ agreementId: string; itemId: string; itemName: string; period: string } | null>(null)

const canManageTodo = computed(() => identity.value.role !== 'team')
// 管理员、班组、航司对接人均可发起引用，但服务层会按身份与「当日可用」口径再校一次。
const canBill = computed(() => true)

const available = computed(() => availableItems(identity.value, bizDate.value))

function reload() {
  todos.value = listTodos(identity.value)
  billingRefs.value = listBillingRefs(identity.value)
}
reload()

function toggleDone(id: string, done: boolean) {
  const result = markTodoDone(identity.value, id, done)
  message.value = result.ok ? '' : result.message
  reload()
}

function openBill(agreementId: string, itemId: string, itemName: string) {
  billForm.value = { agreementId, itemId, itemName, period: '' }
}

function submitBill() {
  if (!billForm.value) return
  const result = createBillingReference(
    identity.value,
    billForm.value.agreementId,
    billForm.value.itemId,
    billForm.value.period,
  )
  message.value = result.message
  if (result.ok) {
    billForm.value = null
    activeTab.value = 'billing'
  }
  reload()
}
</script>

<style scoped>
.role-banner { display: flex; justify-content: space-between; align-items: center; background: #eef4ff; border: 1px solid #c7d7fe; border-radius: 8px; padding: 8px 12px; font-size: 13px; margin-bottom: 12px; }
.date-pick { display: flex; gap: 8px; align-items: center; font-size: 12px; color: var(--muted); }
.tabs { display: flex; gap: 6px; margin-bottom: 12px; }
.tab { border: 1px solid var(--border); background: #fff; border-radius: 6px 6px 0 0; padding: 7px 14px; cursor: pointer; font-size: 13px; }
.tab.active { background: var(--brand); color: #fff; border-color: var(--brand); }
.tag { border-radius: 4px; padding: 1px 8px; font-size: 12px; }
.tag.adhoc { background: #ede9fe; color: #5b21b6; }
.tag.formal { background: #e0f2fe; color: #075985; }
.tag[data-type='协议生效'] { background: #dcfce7; color: #166534; }
.tag[data-type='协议失效'] { background: #fee2e2; color: #991b1b; }
.tag[data-type='临时加项'] { background: #ede9fe; color: #5b21b6; }
.tag[data-type='重叠裁决'] { background: #fef3c7; color: #92400e; }
tr.done { opacity: 0.55; }
.panel { background: #f8fafc; border: 1px dashed var(--border); border-radius: 8px; padding: 10px; margin-top: 12px; display: flex; flex-wrap: wrap; gap: 10px; align-items: flex-end; }
.inline-form .grow { flex: 1; min-width: 220px; }
</style>
