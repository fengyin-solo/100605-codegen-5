import { defineStore } from 'pinia'

import { ACTORS, DEFAULT_ACTOR_ID, getActor } from '@/data/agreement/catalog'
import type { Actor } from '@/data/agreement/types'

export const useSessionStore = defineStore('session', {
  state: () => {
    const actor = getActor(DEFAULT_ACTOR_ID)!
    return {
      // operator 保持原有字段名，其余页面不受影响；协议域按 actor 做身份裁决。
      operator: actor.name,
      actorId: actor.id,
      shiftLabel: '白班 08:00-20:00',
      scope: '机场地面保障作业管理平台',
    }
  },
  getters: {
    canOperate: (state) => state.operator.length > 0,
    actor(): Actor {
      return getActor(this.actorId) ?? ACTORS[0]
    },
  },
  actions: {
    setShift(label: string) {
      this.shiftLabel = label
    },
    setActor(actorId: string) {
      const actor = getActor(actorId)
      if (!actor) {
        return
      }
      this.actorId = actor.id
      this.operator = actor.name
    },
  },
})
