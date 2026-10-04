import type {
  Agreement,
  AgreementSnapshot,
  ArbitrationNote,
  BillingReference,
  ChangeLog,
  DispatchTodo,
  OwnershipChange,
  ServiceItem,
} from './agreement-types'
import {
  SEED_AGREEMENTS,
  SEED_AGREEMENT_ITEMS,
  SEED_ARBITRATIONS,
  SEED_BILLING_REFS,
  SEED_CHANGE_LOGS,
  SEED_DISPATCH_TODOS,
  SEED_OWNERSHIP_CHANGES,
  SEED_SNAPSHOTS,
} from './agreement-seed'

// 协议模块使用独立的 localStorage 键，与通用业务条目互不影响。
const STORAGE_KEY = 'airport-ground-ops:agreements'

export type AgreementDB = {
  agreements: Agreement[]
  itemsByAgreement: Record<string, ServiceItem[]>
  ownershipChanges: OwnershipChange[]
  logs: ChangeLog[]
  snapshots: AgreementSnapshot[]
  arbitrations: ArbitrationNote[]
  todos: DispatchTodo[]
  billingRefs: BillingReference[]
  seq: number
}

function clone<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T
}

function seedDb(): AgreementDB {
  return {
    agreements: clone(SEED_AGREEMENTS),
    itemsByAgreement: clone(SEED_AGREEMENT_ITEMS),
    ownershipChanges: clone(SEED_OWNERSHIP_CHANGES),
    logs: clone(SEED_CHANGE_LOGS),
    snapshots: clone(SEED_SNAPSHOTS),
    arbitrations: clone(SEED_ARBITRATIONS),
    todos: clone(SEED_DISPATCH_TODOS),
    billingRefs: clone(SEED_BILLING_REFS),
    seq: 1000,
  }
}

let cache: AgreementDB | null = null

function readStorage(): AgreementDB {
  const fallback = seedDb()
  if (typeof window === 'undefined' || !window.localStorage) {
    return fallback
  }
  const raw = window.localStorage.getItem(STORAGE_KEY)
  if (!raw) {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(fallback))
    return fallback
  }
  try {
    const parsed = JSON.parse(raw) as Partial<AgreementDB>
    // 以种子为底做合并，后续新增集合时旧缓存也不会缺字段。
    return { ...fallback, ...clone(parsed) }
  } catch {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(fallback))
    return fallback
  }
}

export function db(): AgreementDB {
  if (cache === null) {
    cache = readStorage()
  }
  return cache
}

export function persist(next: AgreementDB): void {
  cache = next
  if (typeof window !== 'undefined' && window.localStorage) {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(next))
  }
}

export function mutate(mutator: (draft: AgreementDB) => void): AgreementDB {
  const draft = clone(db())
  mutator(draft)
  persist(draft)
  return draft
}

export function nextId(prefix: string): string {
  const draft = clone(db())
  draft.seq += 1
  persist(draft)
  return `${prefix}-${draft.seq}`
}

export function resetAgreementDb(): AgreementDB {
  const fresh = seedDb()
  persist(fresh)
  return fresh
}

export function agreementStorageKey(): string {
  return STORAGE_KEY
}
