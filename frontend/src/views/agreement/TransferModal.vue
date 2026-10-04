<template>
  <div class="modal-mask" @click.self="$emit('close')">
    <div class="modal">
      <div class="modal-head">
        <h3>协议归属变更：{{ agreement.code }}</h3>
        <button class="btn ghost" type="button" @click="$emit('close')">关闭</button>
      </div>
      <div class="modal-body">
        <p class="role-banner warn">
          归属只能在签约航司（{{ airlineName }}）的对接人之间变更，跨航司一律拒绝；变更会留下归属记录并通知资源调度。
        </p>
        <div class="form-grid">
          <div class="form-field">
            <label>当前归属对接人</label>
            <input :value="currentOwnerName" disabled />
          </div>
          <div class="form-field">
            <label>变更后归属对接人</label>
            <select v-model="toOwnerId">
              <option value="" disabled>请选择</option>
              <option
                v-for="candidate in candidates"
                :key="candidate.id"
                :value="candidate.id"
              >
                {{ candidate.name }}（{{ candidate.title }}）
              </option>
            </select>
          </div>
          <div class="form-field full">
            <label>变更原因</label>
            <textarea v-model="reason" placeholder="如：对接人轮岗，由新对接人接管后续航季" />
          </div>
        </div>
        <p v-if="message" :class="['message-line', ok ? 'ok' : 'err']">{{ message }}</p>
      </div>
      <div class="modal-foot">
        <button class="btn" type="button" @click="$emit('close')">取消</button>
        <button class="btn primary" type="button" @click="submit">确认变更</button>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, ref } from 'vue'

import { ACTORS, getActor, getAirline } from '@/data/agreement/catalog'
import { transferOwnership } from '@/data/agreement/agreement-service'
import type { Actor, Agreement } from '@/data/agreement/types'

const props = defineProps<{
  actor: Actor
  agreement: Agreement
}>()

const emit = defineEmits<{
  (e: 'close'): void
  (e: 'done'): void
}>()

const toOwnerId = ref('')
const reason = ref('')
const message = ref('')
const ok = ref(false)

const airlineName = computed(
  () => getAirline(props.agreement.airlineId)?.name ?? props.agreement.airlineId,
)
const currentOwnerName = computed(
  () => getActor(props.agreement.ownerId)?.name ?? props.agreement.ownerId,
)
const candidates = computed(() =>
  ACTORS.filter(
    (item) => item.role === 'airline'
      && item.airlineId === props.agreement.airlineId
      && item.id !== props.agreement.ownerId,
  ),
)

function submit() {
  if (!toOwnerId.value) {
    ok.value = false
    message.value = '请选择变更后的归属对接人'
    return
  }
  const result = transferOwnership(props.actor.id, props.agreement.id, toOwnerId.value, reason.value)
  ok.value = result.ok
  message.value = result.message
  if (result.ok) {
    emit('done')
  }
}
</script>
