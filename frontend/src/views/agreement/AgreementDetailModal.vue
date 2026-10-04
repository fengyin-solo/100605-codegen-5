<template>
  <div class="modal-mask" @click.self="$emit('close')">
    <div class="modal large">
      <div class="modal-head">
        <h3>
          {{ agreement.code }}
          <span :class="['badge', 'small', statusClass(agreement.status)]">{{ agreement.status }}</span>
        </h3>
        <button class="btn ghost" type="button" @click="$emit('close')">关闭</button>
      </div>
      <div class="modal-body">
        <dl class="detail-grid">
          <div><dt>协议主体</dt><dd>{{ agreement.subject }}</dd></div>
          <div><dt>签约航司</dt><dd>{{ airlineName(agreement.airlineId) }}</dd></div>
          <div><dt>归属对接人</dt><dd>{{ actorName(agreement.ownerId) }}</dd></div>
          <div><dt>签订日期</dt><dd>{{ agreement.signDate || '—（草稿）' }}</dd></div>
          <div><dt>生效日期</dt><dd>{{ agreement.effectiveDate }}</dd></div>
          <div><dt>失效日期</dt><dd>{{ agreement.expiryDate }}</dd></div>
          <div class="full" v-if="agreement.note"><dt>说明</dt><dd>{{ agreement.note }}</dd></div>
        </dl>

        <div class="tabs">
          <button
            v-for="tab in tabs"
            :key="tab.key"
            type="button"
            :class="['tab', { active: activeTab === tab.key }]"
            @click="activeTab = tab.key"
          >
            {{ tab.label }}
          </button>
        </div>

        <!-- 服务项：班组身份只能看到自己对应项 -->
        <div v-if="activeTab === 'lines'">
          <p v-if="actor.role === 'team'" class="role-banner">只读视图：你所在班组只能查看自己对应的服务项，协议内容不可改。</p>
          <table class="data-table table-compact">
            <thead>
              <tr>
                <th>服务包</th>
                <th>服务项</th>
                <th>执行班组</th>
                <th>口径</th>
                <th>生效日期</th>
                <th>协议价</th>
                <th>确认状态</th>
                <th>操作</th>
              </tr>
            </thead>
            <tbody>
              <tr v-for="row in shownLines" :key="row.id">
                <td>{{ packageName(row.serviceItemId) }}</td>
                <td>{{ itemName(row.serviceItemId) }}</td>
                <td>{{ teamName(row.serviceItemId) }}</td>
                <td><span :class="['badge', 'small', row.kind === '临时加项' ? 'purple' : 'gray']">{{ row.kind }}</span></td>
                <td>{{ row.effectiveDate }}</td>
                <td>{{ row.price }} 元/{{ row.unit }}</td>
                <td><span :class="['badge', 'small', row.confirmed ? 'green' : 'amber']">{{ row.confirmed ? '已确认' : '待确认' }}</span></td>
                <td class="row-actions">
                  <button
                    v-if="canMaintain && row.kind === '临时加项' && !row.confirmed"
                    class="link"
                    type="button"
                    @click="confirmTemp(row)"
                  >确认临时加项</button>
                  <button
                    v-if="billingAllowed && !isSuppressed(row)"
                    class="link"
                    type="button"
                    @click="bill(row)"
                  >计费引用</button>
                </td>
              </tr>
              <tr v-if="!shownLines.length">
                <td colspan="8" class="empty-state">没有可查看的服务项</td>
              </tr>
            </tbody>
          </table>
          <p class="muted" v-if="actor.role !== 'team'">共 {{ agreement.lines.length }} 条服务项；已确认 {{ confirmedCount }} 条。</p>
          <p class="muted" v-else>本班组可见 {{ shownLines.length }} 条，其余服务项对跨班组隐藏。</p>
        </div>

        <!-- 冻结版本：历史口径保留 -->
        <div v-else-if="activeTab === 'snapshots'">
          <p class="role-banner">服务项名称、班组与协议价在签订/生效瞬间冻结；目录后续调价或改动不覆盖历史版本。</p>
          <div v-for="snapshot in snapshots" :key="snapshot.id" style="margin-bottom: 14px">
            <p>
              <strong>版本 v{{ snapshot.version }}</strong>
              <span class="muted"> · {{ snapshot.frozenAt }} · {{ snapshot.frozenBy }} · {{ snapshot.reason }}</span>
            </p>
            <table class="data-table table-compact">
              <thead>
                <tr><th>服务包</th><th>服务项</th><th>班组</th><th>口径</th><th>生效日期</th><th>冻结协议价</th></tr>
              </thead>
              <tbody>
                <tr v-for="frozen in snapshot.lines" :key="frozen.lineId">
                  <td>{{ frozen.packageName }}</td>
                  <td>{{ frozen.name }}</td>
                  <td>{{ frozen.teamName }}</td>
                  <td>{{ frozen.kind }}</td>
                  <td>{{ frozen.effectiveDate }}</td>
                  <td>{{ frozen.price }} 元/{{ frozen.unit }}</td>
                </tr>
              </tbody>
            </table>
          </div>
          <p v-if="!snapshots.length" class="empty-state">草稿/待生效协议尚无冻结版本，生效时按签订口径冻结</p>
        </div>

        <!-- 归属变更 -->
        <div v-else-if="activeTab === 'ownership'">
          <table class="data-table table-compact">
            <thead>
              <tr><th>时间</th><th>原归属</th><th>新归属</th><th>原因</th><th>操作人</th></tr>
            </thead>
            <tbody>
              <tr v-for="row in ownershipRows" :key="row.id">
                <td>{{ row.at }}</td>
                <td>{{ row.fromOwnerName }}</td>
                <td>{{ row.toOwnerName }}</td>
                <td>{{ row.reason }}</td>
                <td>{{ row.operatorName }}</td>
              </tr>
              <tr v-if="!ownershipRows.length"><td colspan="5" class="empty-state">暂无归属变更记录</td></tr>
            </tbody>
          </table>
        </div>

        <!-- 重叠裁决 -->
        <div v-else-if="activeTab === 'arbitrations'">
          <table class="data-table table-compact">
            <thead>
              <tr><th>裁决时间</th><th>执行协议</th><th>被覆盖协议</th><th>重叠时段</th><th>说明</th><th>裁决人</th></tr>
            </thead>
            <tbody>
              <tr v-for="row in arbitrationRows" :key="row.id">
                <td>{{ row.at }}</td>
                <td><span class="badge blue small">{{ agreementCode(row.winnerAgreementId) }}</span></td>
                <td>{{ agreementCode(row.loserAgreementId) }}</td>
                <td>{{ row.overlapStart }} ~ {{ row.overlapEnd }}</td>
                <td>{{ row.note }}</td>
                <td>{{ row.arbitratorName }}</td>
              </tr>
              <tr v-if="!arbitrationRows.length"><td colspan="6" class="empty-state">暂无重叠裁决记录</td></tr>
            </tbody>
          </table>
        </div>

        <!-- 操作日志 -->
        <div v-else-if="activeTab === 'logs'">
          <table class="data-table table-compact">
            <thead>
              <tr><th>时间</th><th>操作人</th><th>动作</th><th>详情</th></tr>
            </thead>
            <tbody>
              <tr v-for="row in logs" :key="row.id">
                <td>{{ row.at }}</td>
                <td>{{ row.actorName }}</td>
                <td>{{ row.action }}</td>
                <td>{{ row.detail }}</td>
              </tr>
              <tr v-if="!logs.length"><td colspan="4" class="empty-state">暂无操作日志（种子历史数据未登记逐条日志）</td></tr>
            </tbody>
          </table>
        </div>

        <!-- 计费引用 -->
        <div v-else-if="activeTab === 'billing'">
          <table class="data-table table-compact">
            <thead>
              <tr><th>登记时间</th><th>服务项</th><th>服务包</th><th>计费日</th><th>单价口径</th><th>登记人</th></tr>
            </thead>
            <tbody>
              <tr v-for="row in billingRows" :key="row.id">
                <td>{{ row.at }}</td>
                <td>{{ row.serviceItemName }}</td>
                <td>{{ row.packageName }}</td>
                <td>{{ row.billingDate }}</td>
                <td>{{ row.price }} 元/{{ row.unit }}</td>
                <td>{{ row.operatorName }}</td>
              </tr>
              <tr v-if="!billingRows.length"><td colspan="6" class="empty-state">暂无计费引用（仅生效中协议可被引用）</td></tr>
            </tbody>
          </table>
        </div>

        <p v-if="message" :class="['message-line', messageOk ? 'ok' : 'err']">{{ message }}</p>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, ref, watch } from 'vue'

import {
  BUSINESS_TODAY,
  canonicalItems,
  confirmTempLine,
  createBillingRef,
  listArbitrations,
  listBillingRefs,
  listLogs,
  listOwnershipChanges,
  listSnapshots,
  visibleLines,
  canMaintain as canMaintainFn,
} from '@/data/agreement/agreement-service'
import { getActor, getAirline, getPackage, getServiceItem, getTeam } from '@/data/agreement/catalog'
import { domainState } from '@/data/agreement/store'
import type { Actor, Agreement, AgreementLine, AgreementStatus } from '@/data/agreement/types'

const props = defineProps<{
  actor: Actor
  agreement: Agreement
}>()

const emit = defineEmits<{
  (e: 'close'): void
  (e: 'changed'): void
}>()

type TabKey = 'lines' | 'snapshots' | 'ownership' | 'arbitrations' | 'logs' | 'billing'
const activeTab = ref<TabKey>('lines')
const message = ref('')
const messageOk = ref(false)
const reloadTick = ref(0)

const tabs: { key: TabKey; label: string }[] = [
  { key: 'lines', label: '服务项' },
  { key: 'snapshots', label: '冻结版本（历史口径）' },
  { key: 'ownership', label: '归属变更记录' },
  { key: 'arbitrations', label: '重叠裁决' },
  { key: 'logs', label: '操作日志' },
  { key: 'billing', label: '计费引用' },
]

watch(
  () => props.agreement.id,
  () => {
    activeTab.value = 'lines'
    message.value = ''
  },
)

const shownLines = computed<AgreementLine[]>(() => {
  // 依赖刷新标记，确认/计费后服务端改了数据，这里重算。
  void reloadTick.value
  return visibleLines(props.actor, props.agreement)
})

const suppressedServiceIds = computed(() => {
  void reloadTick.value
  if (props.agreement.status !== '生效中') {
    return new Set<string>()
  }
  return new Set(
    canonicalItems(props.actor.id, {
      onDate: BUSINESS_TODAY,
      airlineId: props.agreement.airlineId,
    })
      .filter((row) => row.agreementId === props.agreement.id && row.suppressedBy)
      .map((row) => row.serviceItemId),
  )
})

function isSuppressed(row: AgreementLine): boolean {
  return suppressedServiceIds.value.has(row.serviceItemId)
}

const canMaintain = computed(() => canMaintainFn(props.actor, props.agreement))
const billingAllowed = computed(
  () => props.actor.role === 'scheduler' || props.actor.role === 'manager',
)
const confirmedCount = computed(() => props.agreement.lines.filter((row) => row.confirmed).length)

const snapshots = computed(() => {
  void reloadTick.value
  return listSnapshots(props.agreement.id)
})
const ownershipRows = computed(() => listOwnershipChanges(props.agreement.id))
const arbitrationRows = computed(() => listArbitrations(props.agreement.id))
const logs = computed(() => {
  void reloadTick.value
  return listLogs(props.agreement.id)
})
const billingRows = computed(() => {
  void reloadTick.value
  return listBillingRefs(props.agreement.id)
})

function airlineName(id: string): string {
  return getAirline(id)?.name ?? id
}

function actorName(id: string): string {
  return getActor(id)?.name ?? id
}

function itemName(id: string): string {
  return getServiceItem(id)?.name ?? id
}

function packageName(id: string): string {
  const item = getServiceItem(id)
  return item ? (getPackage(item.packageId)?.name ?? item.packageId) : ''
}

function teamName(itemId: string): string {
  const item = getServiceItem(itemId)
  return item ? (getTeam(item.teamId)?.name ?? item.teamId) : ''
}

function agreementCode(id: string): string {
  return codeMap.value[id] ?? id
}

const codeMap = computed<Record<string, string>>(() => {
  void reloadTick.value
  return Object.fromEntries(domainState().agreements.map((item) => [item.id, item.code]))
})

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

function showResult(ok: boolean, text: string) {
  messageOk.value = ok
  message.value = text
}

function confirmTemp(row: AgreementLine) {
  const noteText = window.prompt(`确认临时加项「${itemName(row.serviceItemId)}」，请填写确认说明`, `经${props.actor.name}确认，自 ${row.effectiveDate} 起执行`)
  if (noteText === null) {
    return
  }
  const result = confirmTempLine(props.actor.id, props.agreement.id, row.id, noteText)
  showResult(result.ok, result.message)
  if (result.ok) {
    reloadTick.value += 1
    emit('changed')
  }
}

function bill(row: AgreementLine) {
  const result = createBillingRef(props.actor.id, props.agreement.id, row.id)
  showResult(result.ok, result.message)
  if (result.ok) {
    reloadTick.value += 1
    activeTab.value = 'billing'
    emit('changed')
  }
}
</script>
