<template>
  <section class="page" data-module="agreement">
    <header class="page-head">
      <div>
        <h2>航司地面服务协议管理</h2>
        <p class="page-desc">按航司维护协议主体，逐条挂服务包、服务项与生效日期；状态沿 草稿→待生效→生效中→已失效 单向推进，历史口径按版本冻结。</p>
      </div>
      <div class="page-actions">
        <button v-if="identity.role === 'airline_contact'" class="btn primary" type="button" @click="showCreate = !showCreate">
          新建本航司协议
        </button>
        <button class="btn" type="button" @click="resetAll">恢复示例数据</button>
      </div>
    </header>

    <div class="role-banner">
      <span>当前身份：<strong>{{ identity.name }}</strong>（{{ roleLabel }}）</span>
      <span class="muted-text">{{ scopeHint }}</span>
    </div>

    <div class="stat-row">
      <article class="stat-card"><span class="stat-label">可见协议</span><strong class="stat-value">{{ agreements.length }}</strong></article>
      <article class="stat-card"><span class="stat-label">生效中</span><strong class="stat-value">{{ countByStatus('生效中') }}</strong></article>
      <article class="stat-card"><span class="stat-label">待生效（换季）</span><strong class="stat-value">{{ countByStatus('待生效') }}</strong></article>
      <article class="stat-card"><span class="stat-label">待裁决重叠</span><strong class="stat-value">{{ unsettledOverlapCount }}</strong></article>
    </div>

    <!-- 新建草稿（仅航司对接人、只能建本航司） -->
    <form v-if="showCreate" class="inline-form panel" @submit.prevent="createOne">
      <label class="filter-item"><span>航司主体</span><input :value="airlineName(identity.airlineId ?? '')" disabled /></label>
      <label class="filter-item grow"><span>协议名称</span><input v-model="createForm.title" placeholder="如：国航 2027 年夏秋航季地面服务协议" /></label>
      <label class="filter-item"><span>航季</span><input v-model="createForm.season" placeholder="2027 夏秋" /></label>
      <label class="filter-item"><span>生效起</span><input v-model="createForm.effectiveFrom" type="date" /></label>
      <label class="filter-item"><span>生效止</span><input v-model="createForm.effectiveTo" type="date" /></label>
      <label class="filter-item"><span>对接人</span><input v-model="createForm.ownerName" /></label>
      <label class="filter-item"><span>电话</span><input v-model="createForm.ownerPhone" /></label>
      <label class="filter-item grow"><span>说明</span><input v-model="createForm.remark" /></label>
      <button class="btn primary" type="submit">建立草稿</button>
    </form>

    <!-- 重叠裁决（仅管理员） -->
    <section v-if="overlapGroups.length" class="panel">
      <h4>同航司同时段重叠协议裁决</h4>
      <p class="page-desc">哪一份作为执行版本由管理员裁决，裁决理由必须写进说明；未裁决的待生效协议不允许生效。</p>
      <div v-for="(group, gi) in overlapGroups" :key="gi" class="arb-row">
        <div class="arb-main">
          <strong>{{ group.airline }}</strong>
          <span class="muted-text">重叠时段 {{ group.periodFrom }} ~ {{ group.periodTo }}</span>
          <span v-for="a in group.agreements" :key="a.id" class="legend-item">
            {{ a.code }}（{{ a.status }}）
          </span>
        </div>
        <div v-if="group.arbitration" class="arb-done">
          已裁决：以 <strong>{{ codeOf(group.arbitration.winnerAgreementId) }}</strong> 为准 — {{ group.arbitration.note }}
        </div>
        <form v-else-if="identity.role === 'admin'" class="arb-form" @submit.prevent="submitArbitration(group)">
          <label class="filter-item">
            <span>执行版本</span>
            <select v-model="arbForms[gi].winner">
              <option v-for="a in group.agreements" :key="a.id" :value="a.id">{{ a.code }}</option>
            </select>
          </label>
          <label class="filter-item grow"><span>裁决说明（必填）</span><input v-model="arbForms[gi].note" placeholder="如：以最终盖章版 B 版报价为准" /></label>
          <button class="btn primary" type="submit">确认裁决</button>
        </form>
        <p v-else class="warn-inline">该重叠尚未裁决，班组与计费侧暂不提前启用待生效口径</p>
      </div>
    </section>

    <p v-if="message" class="error-text">{{ message }}</p>

    <!-- 协议列表 -->
    <table class="data-table">
      <thead>
        <tr>
          <th>协议编号</th><th>航司</th><th>航季</th><th>有效期</th><th>状态</th><th>版本</th><th>服务项</th><th>对接人</th><th>操作</th>
        </tr>
      </thead>
      <tbody>
        <tr v-for="row in agreements" :key="row.id" :class="{ chosen: chosenId === row.id }">
          <td>{{ row.code }}</td>
          <td>{{ airlineName(row.airlineId) }}</td>
          <td>{{ row.season }}</td>
          <td>{{ row.effectiveFrom }} ~ {{ row.effectiveTo }}</td>
          <td><span class="status-badge" :data-status="row.status">{{ row.status }}</span></td>
          <td>V{{ row.version }}</td>
          <td>{{ itemCount(row.id) }}</td>
          <td>{{ row.owner.name }}</td>
          <td class="row-actions">
            <button class="link" type="button" @click="choose(row.id)">{{ chosenId === row.id ? '收起详情' : '查看/维护' }}</button>
          </td>
        </tr>
        <tr v-if="!agreements.length">
          <td colspan="9" class="empty-state">当前身份没有可见协议（班组仅能看到与自己班组相关的航司协议）</td>
        </tr>
      </tbody>
    </table>

    <AgreementDetail
      v-if="chosen"
      class="detail-wrap"
      :agreement="chosen"
      :identity="identity"
      @close="chosenId = null"
      @changed="onDetailChanged"
    />

    <!-- 归属变更记录 -->
    <section v-if="ownershipChanges.length" class="panel">
      <h4>协议归属变更记录</h4>
      <table class="data-table">
        <thead><tr><th>时间</th><th>协议</th><th>原对接人</th><th>新对接人</th><th>变更原因</th><th>操作人</th></tr></thead>
        <tbody>
          <tr v-for="change in ownershipChanges" :key="change.id">
            <td>{{ change.at }}</td>
            <td>{{ change.agreementCode }}</td>
            <td>{{ change.fromOwner }}</td>
            <td>{{ change.toOwner }}</td>
            <td>{{ change.reason }}</td>
            <td>{{ change.operatorName }}</td>
          </tr>
        </tbody>
      </table>
    </section>
  </section>
</template>

<script setup lang="ts">
import { computed, reactive, ref } from 'vue'

import { storeToRefs } from 'pinia'
import { useSessionStore } from '@/stores/session'
import AgreementDetail from './AgreementDetail.vue'
import { resetAgreementDb } from '@/data/agreement-store'
import {
  airlineName,
  arbitrate,
  createAgreement,
  listAgreements,
  listItems,
  listOwnershipChanges,
  listOverlapGroups,
  visibleAgreements,
} from '@/data/agreement-service'
import type { OverlapGroup } from '@/data/agreement-service'
import type { Agreement } from '@/data/agreement-types'

const session = useSessionStore()
const { currentIdentity: identity } = storeToRefs(session)

const roleLabel = computed(() => {
  if (identity.value.role === 'admin') return '平台管理员，可裁决重叠、变更归属'
  if (identity.value.role === 'airline_contact') return `航司对接人，仅可维护 ${airlineName(identity.value.airlineId ?? '')} 协议`
  return '地面班组，只读查看本班组对应服务项'
})
const scopeHint = computed(() => {
  if (identity.value.role === 'team') return '只能看到挂了本班组服务项的协议，跨班组内容不可见'
  if (identity.value.role === 'airline_contact') return '跨航司协议只读不可见主体编辑入口，任何跨航司改动都会被拒绝'
  return '管理员不代航司编辑服务项，只做裁决、归属变更与放行'
})

const agreements = ref<Agreement[]>([])
const overlapGroups = ref<OverlapGroup[]>([])
const ownershipChanges = ref(listOwnershipChanges())
const chosenId = ref<string | null>(null)
const message = ref('')
const showCreate = ref(false)

const chosen = computed(() => agreements.value.find((item) => item.id === chosenId.value) ?? listAgreements().find((item) => item.id === chosenId.value))

const arbForms = ref<Record<number, { winner: string; note: string }>>({})
const unsettledOverlapCount = computed(
  () => overlapGroups.value.filter((group) => !group.arbitration).length,
)

const createForm = reactive({
  title: '',
  season: '',
  effectiveFrom: '2027-03-28',
  effectiveTo: '2027-10-30',
  ownerName: identity.value.name,
  ownerPhone: '',
  remark: '',
})

function countByStatus(status: string) {
  return agreements.value.filter((item) => item.status === status).length
}
function itemCount(agreementId: string) {
  return listItems(agreementId).length
}
function codeOf(agreementId: string) {
  return listAgreements().find((item) => item.id === agreementId)?.code ?? agreementId
}

function reload() {
  agreements.value = visibleAgreements(identity.value)
  overlapGroups.value = listOverlapGroups()
  ownershipChanges.value = listOwnershipChanges()
  overlapGroups.value.forEach((group, index) => {
    if (!arbForms.value[index]) {
      arbForms.value[index] = { winner: group.agreements[0]?.id ?? '', note: '' }
    }
  })
  if (chosenId.value && !agreements.value.some((item) => item.id === chosenId.value)) {
    chosenId.value = null
  }
}
reload()

function choose(id: string) {
  chosenId.value = chosenId.value === id ? null : id
}

function onDetailChanged(text: string) {
  message.value = text
  reload()
}

function createOne() {
  if (!identity.value.airlineId) return
  const result = createAgreement(identity.value, {
    airlineId: identity.value.airlineId,
    ...createForm,
  })
  message.value = result.message
  if (result.ok && result.data) {
    showCreate.value = false
    chosenId.value = result.data.id
    Object.assign(createForm, { title: '', season: '', remark: '', ownerPhone: '' })
  }
  reload()
}

function submitArbitration(group: OverlapGroup) {
  const index = overlapGroups.value.indexOf(group)
  const form = arbForms.value[index]
  const winner = form.winner
  const loser = group.agreements.find((item) => item.id !== winner)?.id
  if (!loser) return
  const result = arbitrate(identity.value, { winnerAgreementId: winner, loserAgreementId: loser, note: form.note })
  message.value = result.message
  if (result.ok) form.note = ''
  reload()
}

function resetAll() {
  resetAgreementDb()
  chosenId.value = null
  message.value = '协议模块已恢复到示例数据'
  reload()
}
</script>

<style scoped>
.role-banner { display: flex; gap: 16px; align-items: center; background: #eef4ff; border: 1px solid #c7d7fe; border-radius: 8px; padding: 8px 12px; font-size: 13px; margin-bottom: 12px; }
.muted-text { color: var(--muted); font-size: 12px; }
.panel { background: #fff; border: 1px solid var(--border); border-radius: 10px; padding: 14px 16px; margin-bottom: 14px; }
.panel h4 { margin: 0 0 8px; }
.inline-form { display: flex; flex-wrap: wrap; gap: 10px; align-items: flex-end; }
.inline-form .grow { flex: 1; min-width: 200px; }
.inline-form input, .inline-form select { width: 100%; }
.inline-form.panel { margin-bottom: 14px; background: #f8fafc; border-style: dashed; }
.arb-row { border-top: 1px solid var(--border); padding: 10px 0; }
.arb-main { display: flex; gap: 8px; align-items: center; flex-wrap: wrap; margin-bottom: 8px; font-size: 13px; }
.arb-form { display: flex; gap: 10px; align-items: flex-end; flex-wrap: wrap; }
.arb-form .grow { flex: 1; min-width: 240px; }
.arb-done { background: #f0fdf4; border: 1px solid #bbf7d0; border-radius: 6px; padding: 6px 10px; font-size: 12px; }
.warn-inline { color: #92400e; font-size: 12px; margin: 4px 0; }
.status-badge { border-radius: 999px; padding: 2px 10px; font-size: 12px; }
.status-badge[data-status='草稿'] { background: #e2e8f0; color: #475569; }
.status-badge[data-status='待生效'] { background: #fef3c7; color: #92400e; }
.status-badge[data-status='生效中'] { background: #dcfce7; color: #166534; }
.status-badge[data-status='已失效'] { background: #fee2e2; color: #991b1b; }
tr.chosen { background: #f1f6ff; }
.detail-wrap { margin: 14px 0; }
</style>
