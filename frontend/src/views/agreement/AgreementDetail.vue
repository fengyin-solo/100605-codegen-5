<template>
  <div class="detail-panel">
    <header class="detail-head">
      <div>
        <h3>{{ agreement.title }}</h3>
        <p class="page-desc">{{ agreement.code }} · {{ airlineName(agreement.airlineId) }} · {{ agreement.season }}</p>
      </div>
      <span class="status-badge" :data-status="agreement.status">{{ agreement.status }}</span>
    </header>

    <div class="detail-grid">
      <div><span class="k">协议有效期</span><span class="v">{{ agreement.effectiveFrom }} ~ {{ agreement.effectiveTo }}</span></div>
      <div><span class="k">签约对接人</span><span class="v">{{ agreement.owner.name }} {{ agreement.owner.phone }}</span></div>
      <div><span class="k">当前版本</span><span class="v">V{{ agreement.version }}（每次状态推进冻结一版）</span></div>
      <div class="full"><span class="k">说明</span><span class="v">{{ agreement.remark || '—' }}</span></div>
    </div>

    <p v-if="permissionMessage" class="error-text">{{ permissionMessage }}</p>

    <!-- 状态机：只暴露「下一段」动作，从 UI 上就无法跳步/回退 -->
    <div class="detail-actions">
      <button
        v-if="nextAction(agreement.status) && canAdvance"
        class="btn primary"
        type="button"
        @click="advance"
      >
        {{ nextAction(agreement.status) }}
      </button>
      <button v-if="editable" class="btn" type="button" @click="editingMeta = !editingMeta">
        {{ editingMeta ? '收起抬头编辑' : '修改抬头/时段' }}
      </button>
      <button v-if="isAdmin" class="btn" type="button" @click="editingOwner = !editingOwner">
        {{ editingOwner ? '取消归属变更' : '变更归属对接人' }}
      </button>
      <button class="btn ghost" type="button" @click="$emit('close')">关闭</button>
    </div>

    <form v-if="editingMeta" class="inline-form" @submit.prevent="saveMeta">
      <label class="filter-item"><span>协议名称</span><input v-model="metaForm.title" /></label>
      <label class="filter-item"><span>航季</span><input v-model="metaForm.season" /></label>
      <label class="filter-item"><span>生效起</span><input v-model="metaForm.effectiveFrom" type="date" /></label>
      <label class="filter-item"><span>生效止</span><input v-model="metaForm.effectiveTo" type="date" /></label>
      <label class="filter-item grow"><span>说明</span><input v-model="metaForm.remark" /></label>
      <button class="btn primary" type="submit">保存抬头</button>
    </form>

    <form v-if="editingOwner" class="inline-form" @submit.prevent="saveOwner">
      <label class="filter-item"><span>新对接人</span><input v-model="ownerForm.name" placeholder="对接人姓名" /></label>
      <label class="filter-item"><span>联系电话</span><input v-model="ownerForm.phone" /></label>
      <label class="filter-item grow"><span>变更原因（必填，留痕）</span><input v-model="ownerForm.reason" placeholder="例如原对接人轮岗，改由某某接管" /></label>
      <button class="btn primary" type="submit">确认归属变更</button>
    </form>

    <!-- 重叠提示 -->
    <div v-if="overlaps.length" class="warn-box">
      <strong>同一航司存在 {{ overlaps.length }} 份时段重叠协议：</strong>
      <span v-for="other in overlaps" :key="other.id" class="legend-item">
        {{ other.code }}（{{ other.status }}，{{ other.effectiveFrom }}~{{ other.effectiveTo }}）
        <template v-if="isSettled(other)">已裁决</template>
        <template v-else>待裁决</template>
      </span>
    </div>

    <!-- 服务项 -->
    <section class="sub-section">
      <div class="sub-head">
        <h4>服务包 / 服务项（{{ items.length }}）</h4>
        <button v-if="canAddItem" class="btn" type="button" @click="startAdd(false)">挂服务项</button>
        <button v-if="canAddAdhoc" class="btn" type="button" @click="startAdd(true)">追加临时加项</button>
      </div>

      <form v-if="itemForm" class="inline-form" @submit.prevent="saveItem">
        <label class="filter-item">
          <span>类别</span>
          <select v-model="itemForm.kind">
            <option value="服务项">服务项</option>
            <option value="服务包">服务包</option>
          </select>
        </label>
        <label class="filter-item"><span>所属服务包</span><input v-model="itemForm.packageName" /></label>
        <label class="filter-item grow"><span>服务项名称</span><input v-model="itemForm.name" /></label>
        <label class="filter-item">
          <span>执行班组</span>
          <select v-model="itemForm.teamCode">
            <option v-for="team in teams" :key="team.code" :value="team.code">{{ team.name }}</option>
          </select>
        </label>
        <label class="filter-item"><span>计价单位</span><input v-model="itemForm.unit" /></label>
        <label class="filter-item"><span>单价(元)</span><input v-model.number="itemForm.price" type="number" min="0" step="0.01" /></label>
        <label class="filter-item"><span>生效起</span><input v-model="itemForm.effectiveFrom" type="date" /></label>
        <label class="filter-item"><span>生效止</span><input v-model="itemForm.effectiveTo" type="date" /></label>
        <label v-if="agreement.status === '生效中'" class="filter-item check">
          <input v-model="itemForm.isAdHoc" type="checkbox" disabled /> 临时加项
        </label>
        <button class="btn primary" type="submit">保存服务项</button>
        <button class="btn ghost" type="button" @click="itemForm = null">取消</button>
      </form>

      <table class="data-table">
        <thead>
          <tr>
            <th>类别</th><th>服务包</th><th>服务项</th><th>执行班组</th><th>单位</th><th>单价</th><th>生效日期</th><th>口径</th><th v-if="editable">操作</th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="item in items" :key="item.id">
            <td>{{ item.kind }}</td>
            <td>{{ item.packageName }}</td>
            <td>{{ item.name }}</td>
            <td>{{ teamName(item.teamCode) }}</td>
            <td>{{ item.unit }}</td>
            <td>{{ item.price }}</td>
            <td>{{ item.effectiveFrom }} ~ {{ item.effectiveTo }}</td>
            <td>
              <span v-if="item.isAdHoc" class="tag adhoc">临时加项</span>
              <span v-else class="tag formal">正式签订</span>
            </td>
            <td v-if="editable" class="row-actions">
              <button
                v-if="agreement.status === '草稿' || agreement.status === '待生效'"
                class="link"
                type="button"
                @click="startEdit(item)"
              >
                改
              </button>
              <button
                v-if="agreement.status === '草稿' || agreement.status === '待生效'"
                class="link danger"
                type="button"
                @click="removeItem(item.id)"
              >
                删
              </button>
              <span v-else class="muted-text">已冻结</span>
            </td>
          </tr>
          <tr v-if="!items.length">
            <td :colspan="editable ? 9 : 8" class="empty-state">还没有挂服务项，班组将读不到任何可执行内容</td>
          </tr>
        </tbody>
      </table>
    </section>

    <!-- 历史版本快照：按签订当时口径保留，不被后来的改动覆盖 -->
    <section class="sub-section">
      <h4>历史版本快照（{{ snapshots.length }}）</h4>
      <div v-for="snap in snapshots" :key="snap.id" class="snap-card">
        <div class="snap-head">
          <strong>V{{ snap.version }} · {{ snap.status }}</strong>
          <span class="muted-text">{{ snap.effectiveFrom }} ~ {{ snap.effectiveTo }} · 冻结于 {{ snap.capturedAt }}</span>
        </div>
        <p class="snap-items">
          <span v-for="item in snap.items" :key="item.id" class="snap-item">
            {{ item.name }}（{{ item.price }}元/{{ item.unit }}{{ item.isAdHoc ? '·临时' : '' }}）
          </span>
        </p>
      </div>
    </section>

    <!-- 变更日志 -->
    <section class="sub-section">
      <h4>变更轨迹</h4>
      <table class="data-table">
        <thead><tr><th>时间</th><th>动作</th><th>说明</th><th>操作人</th><th>版本</th></tr></thead>
        <tbody>
          <tr v-for="log in logs" :key="log.id">
            <td>{{ log.at }}</td><td>{{ log.action }}</td><td>{{ log.detail }}</td><td>{{ log.operatorName }}</td><td>V{{ log.version }}</td>
          </tr>
        </tbody>
      </table>
    </section>
  </div>
</template>

<script setup lang="ts">
import { computed, reactive, ref } from 'vue'

import {
  advanceStatus,
  canEdit,
  findOverlaps,
  listItems,
  listLogs,
  listSnapshots,
  listTeams,
  nextAction,
  removeServiceItem,
  transferOwnership,
  updateAgreementMeta,
  upsertServiceItem,
  arbitrationSettled,
  airlineName,
  teamName,
} from '@/data/agreement-service'
import type { Agreement, Identity, ServiceItem } from '@/data/agreement-types'

const props = defineProps<{ agreement: Agreement; identity: Identity }>()
const emit = defineEmits<{ close: []; changed: [message: string] }>()

const teams = listTeams()
const editable = computed(() => canEdit(props.identity, props.agreement))
const isAdmin = computed(() => props.identity.role === 'admin')
// 待生效→生效：归属对接人可提交、管理员可放行；班组不可。
const canAdvance = computed(() => props.identity.role !== 'team')

const items = ref<ServiceItem[]>([])
const logs = ref(listLogs(props.agreement.id))
const snapshots = ref(listSnapshots(props.agreement.id))
const overlaps = ref(findOverlaps(props.agreement))

const canAddItem = computed(() => editable.value && props.agreement.status !== '生效中' && props.agreement.status !== '已失效')
const canAddAdhoc = computed(() => editable.value && props.agreement.status === '生效中')

const permissionMessage = computed(() => {
  if (props.identity.role === 'team') return '当前为地面班组身份：只读查看本班组服务项，不能修改协议'
  if (props.identity.role === 'airline_contact' && !editable.value) return '这份协议属于其他航司，跨航司改动一律拒绝'
  if (props.agreement.status === '已失效') return '协议已失效：服务项与抬头冻结，不能改回生效中'
  return ''
})

const editingMeta = ref(false)
const editingOwner = ref(false)
const metaForm = reactive({
  title: props.agreement.title,
  season: props.agreement.season,
  effectiveFrom: props.agreement.effectiveFrom,
  effectiveTo: props.agreement.effectiveTo,
  remark: props.agreement.remark,
})
const ownerForm = reactive({ name: '', phone: '', reason: '' })

type ItemForm = Omit<ServiceItem, 'id'> & { id?: string }
const itemForm = ref<ItemForm | null>(null)

function refresh() {
  items.value = listItems(props.agreement.id)
  logs.value = listLogs(props.agreement.id)
  snapshots.value = listSnapshots(props.agreement.id)
  overlaps.value = findOverlaps(props.agreement)
}
refresh()

function isSettled(other: Agreement): boolean {
  return arbitrationSettled(props.agreement.id, other.id)
}

function reloadAfter(message: string) {
  refresh()
  emit('changed', message)
}

function advance() {
  const result = advanceStatus(props.identity, props.agreement.id)
  if (!result.ok) {
    emit('changed', result.message)
    return
  }
  reloadAfter(result.message)
}

function saveMeta() {
  const result = updateAgreementMeta(props.identity, props.agreement.id, { ...metaForm })
  if (result.ok) {
    editingMeta.value = false
  }
  reloadAfter(result.message)
}

function saveOwner() {
  const result = transferOwnership(
    props.identity,
    props.agreement.id,
    { id: ownerForm.name, name: ownerForm.name, phone: ownerForm.phone },
    ownerForm.reason,
  )
  if (result.ok) {
    editingOwner.value = false
    ownerForm.name = ''
    ownerForm.phone = ''
    ownerForm.reason = ''
  }
  reloadAfter(result.message)
}

function blankItem(isAdHoc: boolean): ItemForm {
  const a = props.agreement
  return {
    kind: '服务项',
    packageName: '',
    name: '',
    teamCode: teams[0]?.code ?? '',
    unit: '架次',
    price: 0,
    effectiveFrom: a.effectiveFrom,
    effectiveTo: a.effectiveTo,
    isAdHoc,
  }
}

function startAdd(isAdHoc: boolean) {
  itemForm.value = blankItem(isAdHoc)
}

function startEdit(item: ServiceItem) {
  itemForm.value = { ...item }
}

function saveItem() {
  if (!itemForm.value) return
  const result = upsertServiceItem(props.identity, props.agreement.id, { ...itemForm.value })
  if (result.ok) itemForm.value = null
  reloadAfter(result.message)
}

function removeItem(itemId: string) {
  const result = removeServiceItem(props.identity, props.agreement.id, itemId)
  reloadAfter(result.message)
}
</script>

<style scoped>
.detail-panel { background: #fff; border: 1px solid var(--border); border-radius: 10px; padding: 16px; }
.detail-head { display: flex; justify-content: space-between; align-items: flex-start; }
.detail-head h3 { margin: 0; font-size: 17px; }
.detail-grid { display: grid; grid-template-columns: repeat(3, 1fr); gap: 10px 16px; margin: 12px 0; }
.detail-grid .full { grid-column: 1 / -1; }
.detail-grid .k { display: block; font-size: 12px; color: var(--muted); }
.detail-grid .v { font-size: 13px; }
.detail-actions { display: flex; gap: 8px; margin: 8px 0 12px; flex-wrap: wrap; }
.inline-form { display: flex; flex-wrap: wrap; gap: 10px; align-items: flex-end; background: #f8fafc; border: 1px dashed var(--border); border-radius: 8px; padding: 10px; margin-bottom: 12px; }
.inline-form .grow { flex: 1; min-width: 200px; }
.inline-form input, .inline-form select { width: 100%; }
.filter-item.check { display: flex; align-items: center; gap: 4px; }
.status-badge { border-radius: 999px; padding: 3px 12px; font-size: 12px; }
.status-badge[data-status='草稿'] { background: #e2e8f0; color: #475569; }
.status-badge[data-status='待生效'] { background: #fef3c7; color: #92400e; }
.status-badge[data-status='生效中'] { background: #dcfce7; color: #166534; }
.status-badge[data-status='已失效'] { background: #fee2e2; color: #991b1b; }
.warn-box { background: #fffbeb; border: 1px solid #fcd34d; border-radius: 8px; padding: 8px 10px; font-size: 12px; display: flex; gap: 8px; flex-wrap: wrap; align-items: center; margin-bottom: 12px; }
.sub-section { margin-top: 18px; }
.sub-head { display: flex; gap: 8px; align-items: center; margin-bottom: 8px; }
.sub-head h4 { margin: 0; flex: 1; }
.tag { border-radius: 4px; padding: 1px 8px; font-size: 12px; }
.tag.adhoc { background: #ede9fe; color: #5b21b6; }
.tag.formal { background: #e0f2fe; color: #075985; }
.muted-text { color: var(--muted); font-size: 12px; }
.link.danger { color: #b42318; }
.snap-card { border: 1px solid var(--border); border-radius: 8px; padding: 8px 10px; margin-bottom: 8px; background: #fbfdff; }
.snap-head { display: flex; justify-content: space-between; font-size: 13px; }
.snap-items { margin: 6px 0 0; display: flex; flex-wrap: wrap; gap: 6px; }
.snap-item { background: #eef2f7; border-radius: 4px; padding: 1px 8px; font-size: 12px; }
</style>
