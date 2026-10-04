import { defineStore } from 'pinia'

import { SEED_IDENTITIES } from '@/data/agreement-seed'
import type { Identity } from '@/data/agreement-types'

export const useSessionStore = defineStore('session', {
  state: () => ({
    operator: '平台管理员',
    shiftLabel: '白班 08:00-20:00',
    scope: '机场地面保障作业管理平台',
    identities: SEED_IDENTITIES as Identity[],
    currentIdentityId: 'U-ADMIN' as string,
  }),
  getters: {
    canOperate: (state) => state.operator.length > 0,
    currentIdentity(state): Identity {
      return (
        state.identities.find((item) => item.id === state.currentIdentityId) ??
        state.identities[0]
      )
    },
  },
  actions: {
    setShift(label: string) {
      this.shiftLabel = label
    },
    switchIdentity(id: string) {
      const found = this.identities.find((item) => item.id === id)
      if (!found) {
        return
      }
      this.currentIdentityId = id
      this.operator = found.name
    },
  },
})
