<template>
  <div class="modal-mask" @click.self="$emit('close')">
    <div class="modal">
      <div class="modal-head">
        <h3>裁决重叠协议执行口径</h3>
        <button class="btn ghost" type="button" @click="$emit('close')">关闭</button>
      </div>
      <div class="modal-body">
        <p class="role-banner warn">
          同一家航司在 {{ pair.start }} ~ {{ pair.end }} 出现两份重叠协议，请指定按哪一份执行并写明说明。裁决结果会落到资源调度待办清单，调度读到的可用服务项按此口径统一。
        </p>
        <div class="form-grid">
          <div
            v-for="item in [pair.a, pair.b]"
            :key="item.id"
            class="form-field"
            :class="{ full: false }"
          >
            <label style="display: flex; align-items: center; gap: 6px">
              <input v-model="winnerId" type="radio" name="winner" :value="item.id" />
              <strong>{{ item.code }}</strong>（{{ item.status }}）
            </label>
            <div class="muted" style="margin: 4px 0 0 22px">
              {{ item.subject }}<br />
              有效期 {{ item.effectiveDate }} ~ {{ item.expiryDate }}，已确认服务项 {{ confirmedCount(item) }} 项
            </div>
          </div>
          <div class="form-field full">
            <label>裁决说明（写清重叠时段按哪份执行、为什么）</label>
            <textarea v-model="note" placeholder="如：补充协议为换季增频后的最新口径，重叠时段按补充协议执行，主协议其余时段不变。" />
          </div>
        </div>
        <p v-if="message" :class="['message-line', ok ? 'ok' : 'err']">{{ message }}</p>
      </div>
      <div class="modal-foot">
        <button class="btn" type="button" @click="$emit('close')">取消</button>
        <button class="btn primary" type="button" @click="submit">确认裁决</button>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref } from 'vue'

import { arbitrate } from '@/data/agreement/agreement-service'
import type { Actor, Agreement } from '@/data/agreement/types'

const props = defineProps<{
  actor: Actor
  pair: { a: Agreement; b: Agreement; start: string; end: string }
}>()

const emit = defineEmits<{
  (e: 'close'): void
  (e: 'done'): void
}>()

const winnerId = ref(props.pair.b.id)
const note = ref('')
const message = ref('')
const ok = ref(false)

function confirmedCount(agreement: Agreement): number {
  return agreement.lines.filter((line) => line.confirmed).length
}

function submit() {
  const result = arbitrate(props.actor.id, props.pair.a.id, props.pair.b.id, winnerId.value, note.value)
  ok.value = result.ok
  message.value = result.message
  if (result.ok) {
    emit('done')
  }
}
</script>
