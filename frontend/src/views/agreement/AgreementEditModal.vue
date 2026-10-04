<template>
  <div class="modal-mask" @click.self="$emit('close')">
    <div class="modal large">
      <div class="modal-head">
        <h3>{{ agreement ? '编辑协议草稿' : '登记航司地面服务协议' }}</h3>
        <button class="btn ghost" type="button" @click="$emit('close')">关闭</button>
      </div>
      <div class="modal-body">
        <p class="role-banner">
          协议主体由签约航司的归属对接人维护；草稿可改，提交待生效后主体冻结。班组口头提出的内容只能挂「临时加项」，经对接人确认才算数。
        </p>
        <form class="form-grid" @submit.prevent="save">
          <div class="form-field">
            <label>协议编号</label>
            <input v-model="form.code" placeholder="如 MU-GSA-2026W-S2" />
          </div>
          <div class="form-field">
            <label>签约航司</label>
            <input :value="airlineName" disabled />
          </div>
          <div class="form-field full">
            <label>协议主体（合同全称）</label>
            <input v-model="form.subject" placeholder="如 中国东方航空 2026 年冬春航季地面服务协议" />
          </div>
          <div class="form-field">
            <label>生效日期</label>
            <input v-model="form.effectiveDate" type="date" />
          </div>
          <div class="form-field">
            <label>失效日期</label>
            <input v-model="form.expiryDate" type="date" />
          </div>
          <div class="form-field full">
            <label>说明</label>
            <textarea v-model="form.note" placeholder="换季范围、特殊安排等" />
          </div>
        </form>

        <template v-if="agreement">
          <div class="section-title">逐条挂服务项（{{ agreement.lines.length }}）</div>
          <form class="form-grid" @submit.prevent="attach">
            <div class="form-field">
              <label>服务包 / 服务项</label>
              <select v-model="attachForm.serviceItemId">
                <option value="" disabled>请选择服务项</option>
                <optgroup
                  v-for="pkg in packageGroups"
                  :key="pkg.id"
                  :label="pkg.name"
                >
                  <option
                    v-for="item in pkg.items"
                    :key="item.id"
                    :value="item.id"
                    :disabled="usedItemIds.has(item.id)"
                  >
                    {{ item.name }}（{{ item.unit }}，目录参考价 {{ item.referencePrice }} 元）{{ usedItemIds.has(item.id) ? ' — 已挂' : '' }}
                  </option>
                </optgroup>
              </select>
            </div>
            <div class="form-field">
              <label>口径</label>
              <select v-model="attachForm.kind">
                <option value="正式">正式服务项</option>
                <option value="临时加项">临时加项（须对接人确认）</option>
              </select>
            </div>
            <div class="form-field">
              <label>该项生效日期</label>
              <input v-model="attachForm.effectiveDate" type="date" />
            </div>
            <div class="form-field">
              <label>协议价（元）</label>
              <input v-model.number="attachForm.price" type="number" min="0" step="0.1" />
            </div>
            <div class="form-field full">
              <label>备注</label>
              <input v-model="attachForm.note" placeholder="临时加项的来由等" />
            </div>
            <div class="full" style="text-align: right">
              <button class="btn primary" type="submit">挂接服务项</button>
            </div>
          </form>

          <table class="data-table table-compact" style="margin-top: 10px">
            <thead>
              <tr>
                <th>服务包</th>
                <th>服务项</th>
                <th>口径</th>
                <th>生效日期</th>
                <th>单价</th>
                <th>确认状态</th>
                <th>操作</th>
              </tr>
            </thead>
            <tbody>
              <tr v-for="row in agreement.lines" :key="row.id">
                <td>{{ packageNameOf(row.serviceItemId) }}</td>
                <td>{{ itemNameOf(row.serviceItemId) }}</td>
                <td>
                  <span :class="['badge', 'small', row.kind === '临时加项' ? 'purple' : 'gray']">{{ row.kind }}</span>
                </td>
                <td>{{ row.effectiveDate }}</td>
                <td>{{ row.price }} 元/{{ row.unit }}</td>
                <td>
                  <span :class="['badge', 'small', row.confirmed ? 'green' : 'amber']">
                    {{ row.confirmed ? '已确认' : '待对接人确认' }}
                  </span>
                </td>
                <td>
                  <button class="link" type="button" @click="remove(row.id)">移除未确认项</button>
                </td>
              </tr>
              <tr v-if="!agreement.lines.length">
                <td colspan="7" class="empty-state">草稿还没有服务项，先逐条挂接后才能提交</td>
              </tr>
            </tbody>
          </table>
        </template>

        <p v-if="message" :class="['message-line', messageOk ? 'ok' : 'err']">{{ message }}</p>
      </div>
      <div class="modal-foot">
        <button class="btn" type="button" @click="$emit('close')">取消</button>
        <button class="btn primary" type="button" @click="save">保存主体信息</button>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, reactive, ref, watch } from 'vue'

import {
  attachLine,
  createAgreement,
  removeLine,
  updateHeader,
} from '@/data/agreement/agreement-service'
import { AIRLINES, PACKAGES, SERVICE_ITEMS } from '@/data/agreement/catalog'
import type { Actor, Agreement } from '@/data/agreement/types'
import { BUSINESS_TODAY } from '@/data/agreement/agreement-service'

const props = defineProps<{
  actor: Actor
  agreement?: Agreement
}>()

const emit = defineEmits<{
  (e: 'close'): void
  (e: 'saved', agreementId?: string): void
}>()

const message = ref('')
const messageOk = ref(false)

const form = reactive({
  code: '',
  subject: '',
  effectiveDate: BUSINESS_TODAY,
  expiryDate: '2027-03-27',
  note: '',
})

const attachForm = reactive({
  serviceItemId: '',
  kind: '临时加项' as '正式' | '临时加项',
  effectiveDate: BUSINESS_TODAY,
  price: 0,
  note: '',
})

watch(
  () => props.agreement,
  (agreement) => {
    if (agreement) {
      form.code = agreement.code
      form.subject = agreement.subject
      form.effectiveDate = agreement.effectiveDate
      form.expiryDate = agreement.expiryDate
      form.note = agreement.note
      attachForm.effectiveDate = agreement.effectiveDate
    }
  },
  { immediate: true },
)

const airlineName = computed(
  () => AIRLINES.find((item) => item.id === props.actor.airlineId)?.name ?? '',
)

const packageGroups = PACKAGES.map((pkg) => ({
  ...pkg,
  items: SERVICE_ITEMS.filter((item) => item.packageId === pkg.id),
}))

const usedItemIds = computed(() => new Set((props.agreement?.lines ?? []).map((row) => row.serviceItemId)))

function itemNameOf(id: string): string {
  return SERVICE_ITEMS.find((item) => item.id === id)?.name ?? id
}

function packageNameOf(itemId: string): string {
  const item = SERVICE_ITEMS.find((entry) => entry.id === itemId)
  return PACKAGES.find((pkg) => pkg.id === item?.packageId)?.name ?? ''
}

function showResult(ok: boolean, text: string) {
  messageOk.value = ok
  message.value = text
}

function save() {
  if (!form.code.trim() || !form.subject.trim()) {
    showResult(false, '协议编号与主体名称必填')
    return
  }
  const result = props.agreement
    ? updateHeader(props.actor.id, props.agreement.id, {
      code: form.code.trim(),
      subject: form.subject.trim(),
      effectiveDate: form.effectiveDate,
      expiryDate: form.expiryDate,
      note: form.note.trim(),
    })
    : createAgreement(props.actor.id, {
      code: form.code.trim(),
      subject: form.subject.trim(),
      airlineId: props.actor.airlineId ?? '',
      effectiveDate: form.effectiveDate,
      expiryDate: form.expiryDate,
      note: form.note.trim(),
    })
  showResult(result.ok, result.message)
  if (result.ok) {
    emit('saved', result.data?.id)
  }
}

function attach() {
  if (!props.agreement || !attachForm.serviceItemId) {
    showResult(false, '请选择要挂接的服务项')
    return
  }
  const selected = SERVICE_ITEMS.find((item) => item.id === attachForm.serviceItemId)
  const result = attachLine(props.actor.id, props.agreement.id, {
    serviceItemId: attachForm.serviceItemId,
    kind: props.agreement.status === '草稿' ? attachForm.kind : '临时加项',
    effectiveDate: attachForm.effectiveDate,
    price: attachForm.price || selected?.referencePrice,
    note: attachForm.note,
  })
  showResult(result.ok, result.message)
  if (result.ok) {
    attachForm.serviceItemId = ''
    attachForm.note = ''
    emit('saved')
  }
}

function remove(lineId: string) {
  if (!props.agreement) {
    return
  }
  const result = removeLine(props.actor.id, props.agreement.id, lineId)
  showResult(result.ok, result.message)
  if (result.ok) {
    emit('saved')
  }
}
</script>
