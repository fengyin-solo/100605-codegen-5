import { buildSeedState } from './seed'
import type { DomainState } from './types'

// 协议域独立持久化，不与通用业务表混用。
const STORAGE_KEY = 'airport-ground-ops:airline-agreements'

function clone<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T
}

function readStorage(): DomainState {
  const fallback = buildSeedState()
  if (typeof window === 'undefined' || !window.localStorage) {
    return fallback
  }
  const raw = window.localStorage.getItem(STORAGE_KEY)
  if (!raw) {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(fallback))
    return fallback
  }
  try {
    const parsed = JSON.parse(raw) as DomainState
    // 缺失集合时用种子补齐，避免旧版本数据结构缺字段。
    return {
      seq: parsed.seq ?? fallback.seq,
      agreements: parsed.agreements ?? fallback.agreements,
      snapshots: parsed.snapshots ?? fallback.snapshots,
      ownershipChanges: parsed.ownershipChanges ?? fallback.ownershipChanges,
      arbitrations: parsed.arbitrations ?? fallback.arbitrations,
      todos: parsed.todos ?? fallback.todos,
      billingRefs: parsed.billingRefs ?? fallback.billingRefs,
      logs: parsed.logs ?? fallback.logs,
    }
  } catch {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(fallback))
    return fallback
  }
}

let cache: DomainState | null = null

export function domainState(): DomainState {
  if (cache === null) {
    cache = readStorage()
  }
  return cache
}

export function persist(state: DomainState = domainState()): void {
  cache = state
  if (typeof window !== 'undefined' && window.localStorage) {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(state))
  }
}

export function resetDomain(): DomainState {
  const fresh = clone(buildSeedState())
  persist(fresh)
  return fresh
}

export function storageKey(): string {
  return STORAGE_KEY
}

export function nextId(prefix: string): string {
  const state = domainState()
  state.seq += 1
  return `${prefix}-${state.seq}`
}
